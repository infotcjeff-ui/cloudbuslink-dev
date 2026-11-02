// ============================================================================
//  Supabase 學生 / 家長 / 保姆 / 路線 CRUD
//
//  為什麼需要這個檔案:
//   這四個實體之前是「純本機」—— 後台新增/編輯/刪除只寫 localStorage,
//   從來沒有推回 DB。結果:
//     1. 另一台裝置看不到這些資料 (資料只存在發佈者那台電腦)
//     2. 按「重新整理」也沒用 —— 因為雲端本來就沒有資料
//
//  所以這裡補上 push 路徑, 讓這四個實體變成「本機先寫、雲端後推」:
//     - 寫入本機 (即時反應)
//     - 背景推回 DB
//     - 推成功後呼叫 markSynced(), 之後 pull 才知道這筆「已經在雲端了」
//
//  設計重點 (與 lib/supabase-buses.ts / supabase-announcements.ts 一致):
//   1. insert / update / delete 後用 .select() 二次驗證
//      —— RLS 可能靜默拒絕 (回傳成功但實際沒寫進去)
//   2. FK 依賴順序: client → driver → bus → nanny → student → parent
//      寫入學生前要先確保 bus 存在 (cbl_students.bus_id FK)
//   3. 未知欄位自動降欄重試 (live DB schema 可能跟 migrations 不一致)
//
//  RLS: 開發階段這些表都有 dev_allow_all policy (anon 可讀寫)。
//        上線前要移除並改寫 per-role policy。
// ============================================================================

import { camelize, snakify } from './supabase-case';
import { alignPayloadClientId } from './supabase-client-id';
import { markSynced, unmarkSynced, clearPendingPatch } from './storage';
import type { Student, Parent, Nanny, Route } from './types';

/** entityKey — 對應 lib/storage.ts 的 STORAGE 屬性名 (同步記錄用) */
type EntityKey = 'students' | 'parents' | 'nannies' | 'routes';

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/** 該 id 是否已存在於指定表 */
async function rowExists(table: string, id: string): Promise<boolean> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn(`[Supabase] ${table}.exists error:`, error);
    return false;
  }
  return !!data;
}

/**
 * 寫入時遇到「未知欄位」(42703) 就把那欄移除後重試。
 *
 * 為什麼需要: live DB 的實際 schema 可能與 repo 內的 migrations 不一致
 * (例如欄位名不同)。PostgREST 遇到未知欄位會直接回 42703 讓整筆失敗。
 */
async function insertWithColumnFallback(
  table: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await import('./supabase');
  let payload = body;

  // ⚠️ client_id 有 FK → cbl_clients(id), 而且這些表的 client_id 是 NOT NULL。
  //    空字串 '' 一定撞 FK (例: cbl_parents_client_id_fkey) → 整筆 insert 失敗。
  //    → 先對齊到雲端真的存在的學校 id。
  await alignPayloadClientId(payload);

  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) return { success: true };

    const code = (error as { code?: string }).code;
    // 23505 = unique violation → 已經存在, 視為成功
    if (code === '23505') return { success: true };

    // 42703 = undefined column → 移除該欄位再試
    if (code === '42703') {
      const m = error.message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
      const colName = m?.[1];
      if (colName && colName in payload) {
        const next = { ...payload };
        delete next[colName];
        payload = next;
        continue;
      }
      console.warn(`[Supabase] insert ${table} failed (unknown column):`, error.message);
      return { success: false, error: error.message };
    }

    console.warn(`[Supabase] insert ${table} failed:`, error.message);
    return { success: false, error: error.message };
  }

  return { success: false, error: 'insert 失敗 (欄位降級重試已用盡)' };
}

/**
 * 從錯誤訊息解析「不存在的欄位名」。
 *
 * PostgREST 對未知欄位會回兩種錯誤碼:
 *   - 42703   (Postgres 原生)  "column cbl_nannies.description does not exist"
 *   - PGRST204 (PostgREST 層)  "Could not find the 'description' column of 'cbl_nannies' in the schema cache"
 *
 * 兩種都要能解析, 否則欄位降級機制會失效。
 */
function parseMissingColumn(error: { code?: string; message?: string }): string | null {
  const code = error.code;
  const message = error.message ?? '';

  // PGRST204 → "Could not find the 'description' column of 'cbl_nannies' in the schema cache"
  if (code === 'PGRST204') {
    const m = message.match(/Could not find the '([\w]+)' column/i);
    return m?.[1] ?? null;
  }

  // 42703 → "column cbl_nannies.description does not exist"
  if (code === '42703') {
    const m = message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
    return m?.[1] ?? null;
  }

  // 保險: 有些情況 code 沒帶, 但訊息有明顯特徵
  if (/does not exist/i.test(message) && /column/i.test(message)) {
    const m = message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
    return m?.[1] ?? null;
  }

  return null;
}

/**
 * update 版的「未知欄位降級重試」。
 *
 * 為什麼需要這個 (這是「路線選校巴帶不出保姆」的關鍵):
 *   PostgREST 在 UPDATE 時遇到 payload 裡有 schema 沒有的欄位,
 *   會讓「整筆 update」直接失敗 (不是只忽略那一欄)。
 *   例如 NannysConsoleContent 存的 patch 裡有 `description`,
 *   但 live DB 的 cbl_nannies 沒有這一欄 → 整個 update 被拒 →
 *   同一個 patch 裡的 `assigned_bus_ids` (校巴綁定) 也跟著沒寫進去。
 *
 *   結果: 保姆在「保姆管理頁」綁了校巴, 但雲端沒有;
 *         路線頁讀到雲端資料 → 跟車保姆永遠是空白。
 *
 * 修正: 遇到未知欄位就把那一欄 drop 掉重試, 讓其他欄位照樣寫入。
 */
async function updateWithColumnFallback(
  table: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await import('./supabase');
  let payload = body;
  const dropped: string[] = [];

  // ⚠️ 同 insert: 若 patch 帶了 client_id, 必須對齊到雲端真的存在的 id
  //    (空字串 / 舊 id 都會撞 FK)。
  if ('client_id' in payload) {
    await alignPayloadClientId(payload);
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    // ⚠️ 必須用 .select() 二次驗證 ——
    //   PostgREST 對「update 0 筆」(id 在雲端不存在) 會回傳成功 + 無錯誤,
    //   但實際上什麼都沒寫進去 → 呼叫端以為成功了, 雲端卻還是沒有這筆資料。
    //   這正是「家長已更新, 但雲端 cbl_parents 永遠是空的」的原因。
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (!error) {
      if (!data) {
        console.warn(`[Supabase] ${table}.update 沒有匹配到任何列 (id=${id})`);
        return {
          success: false,
          error: `雲端找不到這筆資料 (${table}/${id}), 請重新新增`,
        };
      }
      if (dropped.length > 0) {
        console.warn(
          `[Supabase] ${table}.update 已略過 live schema 沒有的欄位: ${dropped.join(', ')}`,
        );
      }
      return { success: true };
    }

    const colName = parseMissingColumn(error);
    if (colName && colName in payload) {
      const next = { ...payload };
      delete next[colName];
      payload = next;
      dropped.push(colName);
      continue;
    }

    console.error(`[Supabase] Failed to update ${table}:`, error);
    return { success: false, error: error.message };
  }

  return { success: false, error: 'update 失敗 (欄位降級重試已用盡)' };
}

/**
 * 確保 cbl_buses 存在 (cbl_students.bus_id / cbl_nannies.assigned_bus_ids 依賴它)。
 * 缺就先補建, 避免 FK violation 讓整筆學生/保姆寫入失敗。
 */
async function ensureBusExists(busId: string | null | undefined): Promise<void> {
  if (!busId) return;
  if (await rowExists('cbl_buses', busId)) return;

  const { STORAGE } = await import('./storage');
  const bus = STORAGE.buses.getById(busId);
  if (!bus) return; // 本機都沒有 → 補不了 (略過, 呼叫端會得到 FK 錯誤)

  const { clientId, id, ...rest } = bus;
  await insertWithColumnFallback('cbl_buses', {
    ...snakify(rest),
    id,
    client_id: clientId,
  });
}

/**
 * 確保 cbl_nannies 存在 (cbl_routes.nanny_id 依賴它)。
 */
async function ensureNannyExists(nannyId: string | null | undefined): Promise<void> {
  if (!nannyId) return;
  if (await rowExists('cbl_nannies', nannyId)) return;

  const { STORAGE } = await import('./storage');
  const nanny = STORAGE.nannies.getById(nannyId);
  if (!nanny) return;

  const { clientId, id, ...rest } = nanny;
  await insertWithColumnFallback('cbl_nannies', {
    ...snakify(rest),
    id,
    client_id: clientId,
  });
}

/**
 * 確保 cbl_drivers 存在 (cbl_routes.driver_id 依賴它)。
 */
async function ensureDriverExists(driverId: string | null | undefined): Promise<void> {
  if (!driverId) return;
  if (await rowExists('cbl_drivers', driverId)) return;

  const { STORAGE } = await import('./storage');
  const driver = STORAGE.drivers.getById(driverId);
  if (!driver) return;

  const { clientId, id, ...rest } = driver;
  await insertWithColumnFallback('cbl_drivers', {
    ...snakify(rest),
    id,
    client_id: clientId,
  });
}

/* -------------------------------------------------------------------------- */
/*  Students 學生                                                              */
/* -------------------------------------------------------------------------- */

export const supabaseStudents = {
  async getAll(): Promise<{ data: Student[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_students').select('*');
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Student[] };
  },

  async getByClient(clientId: string): Promise<{ data: Student[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_students')
      .select('*')
      .eq('client_id', clientId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Student[] };
  },

  /** 新增學生 (會先確保 bus 存在) */
  async add(student: Student): Promise<{ success: boolean; error?: string }> {
    await ensureBusExists(student.busId);

    const { clientId, id, ...rest } = student;
    const res = await insertWithColumnFallback('cbl_students', {
      ...snakify(rest),
      id,
      client_id: clientId,
    });
    if (res.success) markSynced('students', id);
    return res;
  },

  async update(
    id: string,
    patch: Partial<Student>,
  ): Promise<{ success: boolean; error?: string }> {
    if (patch.busId !== undefined) await ensureBusExists(patch.busId);

    const res = await updateWithColumnFallback(
      'cbl_students',
      id,
      snakify(patch) as Record<string, unknown>,
    );
    if (!res.success) {
      console.error('[Supabase] Failed to update student:', res.error);
      return res;
    }
    markSynced('students', id);
    // push 成功 → 這筆的「待推送變更」可以清掉了
    // (清掉後雲端就是唯一真相, 之後 sync 不會再套用 pending)
    clearPendingPatch('students', id);
    return { success: true };
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_students').delete().eq('id', id);
    if (error) {
      console.error('[Supabase] Failed to delete student:', error);
      return { success: false, error: error.message };
    }
    unmarkSynced('students', id);
    return { success: true };
  },
};

/* -------------------------------------------------------------------------- */
/*  Parents 家長                                                               */
/* -------------------------------------------------------------------------- */

export const supabaseParents = {
  async getAll(): Promise<{ data: Parent[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_parents').select('*');
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Parent[] };
  },

  async getByClient(clientId: string): Promise<{ data: Parent[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_parents')
      .select('*')
      .eq('client_id', clientId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Parent[] };
  },

  async add(parent: Parent): Promise<{ success: boolean; error?: string }> {
    const { clientId, id, ...rest } = parent;
    const res = await insertWithColumnFallback('cbl_parents', {
      ...snakify(rest),
      id,
      client_id: clientId,
    });
    if (res.success) markSynced('parents', id);
    return res;
  },

  async update(
    id: string,
    patch: Partial<Parent>,
  ): Promise<{ success: boolean; error?: string }> {
    const res = await updateWithColumnFallback(
      'cbl_parents',
      id,
      snakify(patch) as Record<string, unknown>,
    );
    if (!res.success) {
      // ⚠️ 雲端沒有這筆 row (本機有、雲端沒有) → 退化成「新增」,
      //   讓 update 也能把資料補建到雲端。
      //   沒有這段的話, 編輯家長只會一直回報「更新成功」,
      //   但雲端 cbl_parents 永遠是空的 (PostgREST 對 update 0 筆回成功)。
      if (res.error?.includes('雲端找不到這筆資料')) {
        const { STORAGE } = await import('./storage');
        const local = STORAGE.parents.getById(id);
        if (local) {
          const merged: Parent = { ...local, ...patch };
          const addRes = await this.add(merged);
          if (addRes.success) {
            console.warn('[Supabase] cbl_parents 雲端缺這筆 → 已改用新增補建');
          }
          return addRes;
        }
      }
      console.error('[Supabase] Failed to update parent:', res.error);
      return res;
    }
    markSynced('parents', id);
    return { success: true };
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_parents').delete().eq('id', id);
    if (error) {
      console.error('[Supabase] Failed to delete parent:', error);
      return { success: false, error: error.message };
    }
    unmarkSynced('parents', id);
    return { success: true };
  },
};

/* -------------------------------------------------------------------------- */
/*  Nannies 保姆                                                               */
/* -------------------------------------------------------------------------- */

export const supabaseNannies = {
  async getAll(): Promise<{ data: Nanny[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_nannies').select('*');
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Nanny[] };
  },

  async getByClient(clientId: string): Promise<{ data: Nanny[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_nannies')
      .select('*')
      .eq('client_id', clientId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Nanny[] };
  },

  async add(nanny: Nanny): Promise<{ success: boolean; error?: string }> {
    // assigned_bus_ids 是 text[] (沒有 FK), 但保險起見先確保 bus 都在
    for (const busId of nanny.assignedBusIds ?? []) {
      await ensureBusExists(busId);
    }

    const { clientId, id, ...rest } = nanny;
    const res = await insertWithColumnFallback('cbl_nannies', {
      ...snakify(rest),
      id,
      client_id: clientId,
    });
    if (res.success) markSynced('nannies', id);
    return res;
  },

  async update(
    id: string,
    patch: Partial<Nanny>,
  ): Promise<{ success: boolean; error?: string }> {
    if (patch.assignedBusIds) {
      for (const busId of patch.assignedBusIds) await ensureBusExists(busId);
    }

    // 用欄位降級版: patch 裡可能帶 `description` 等 live schema 沒有的欄位,
    // 若不降級, 整筆 update 會被拒 → assigned_bus_ids (校巴綁定) 也寫不進去
    // → 路線頁選校巴時跟車保姆永遠空白。
    const res = await updateWithColumnFallback(
      'cbl_nannies',
      id,
      snakify(patch) as Record<string, unknown>,
    );
    if (!res.success) {
      console.error('[Supabase] Failed to update nanny:', res.error);
      return res;
    }
    markSynced('nannies', id);
    return { success: true };
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_nannies').delete().eq('id', id);
    if (error) {
      console.error('[Supabase] Failed to delete nanny:', error);
      return { success: false, error: error.message };
    }
    unmarkSynced('nannies', id);
    return { success: true };
  },
};

/* -------------------------------------------------------------------------- */
/*  Routes 路線                                                                */
/* -------------------------------------------------------------------------- */

export const supabaseRouteRecords = {
  async getAll(): Promise<{ data: Route[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_routes').select('*');
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Route[] };
  },

  async getByClient(clientId: string): Promise<{ data: Route[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_routes')
      .select('*')
      .eq('client_id', clientId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as Route[] };
  },

  async add(route: Route): Promise<{ success: boolean; error?: string }> {
    await ensureBusExists(route.busId);
    await ensureDriverExists(route.driverId);
    await ensureNannyExists(route.nannyId);

    const { clientId, id, ...rest } = route;
    const res = await insertWithColumnFallback('cbl_routes', {
      ...snakify(rest),
      id,
      client_id: clientId,
    });
    if (res.success) markSynced('routes', id);
    return res;
  },

  async update(
    id: string,
    patch: Partial<Route>,
  ): Promise<{ success: boolean; error?: string }> {
    if (patch.busId !== undefined) await ensureBusExists(patch.busId);
    if (patch.driverId !== undefined) await ensureDriverExists(patch.driverId);
    if (patch.nannyId !== undefined) await ensureNannyExists(patch.nannyId);

    const res = await updateWithColumnFallback(
      'cbl_routes',
      id,
      snakify(patch) as Record<string, unknown>,
    );
    if (!res.success) {
      console.error('[Supabase] Failed to update route:', res.error);
      return res;
    }
    markSynced('routes', id);
    return { success: true };
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_routes').delete().eq('id', id);
    if (error) {
      console.error('[Supabase] Failed to delete route:', error);
      return { success: false, error: error.message };
    }
    unmarkSynced('routes', id);
    return { success: true };
  },
};

/** entityKey 型別檢查用 (避免 TS 抱怨未使用) */
export type { EntityKey };
