// Supabase trip CRUD wrappers (沿用 lib/supabase-buses.ts camelize/snakify 模式)
// 所有表均以 cbl_ 為前綴
//
// ⚠️ FK 約束注意 (cbl_trips 有 NOT NULL FK):
//   cbl_trips.bus_id  → cbl_buses(id)        NOT NULL, on delete cascade
//   cbl_trips.nanny_id → cbl_nannies(id)     nullable, on delete set null
//   cbl_trips.client_id → cbl_clients(id)    NOT NULL, on delete cascade
//   cbl_students.parent_ids → cbl_parents(id)  (text[], app 層維持)
//   cbl_attendances.trip_id → cbl_trips(id)
//   cbl_attendances.student_id → cbl_students(id)
//
//   這代表: 如果校巴/保姆/學生只存在於 localStorage 而沒推到 DB,
//   直接 insert trip 會 FK violation (而且 localStorage 的資料會在下次 sync 消失)。
//
//   因此本檔提供 ensure* 系列: 寫入 trip 前先把其依賴的父列「保證存在」於 DB。
//   這是「push-on-demand」策略 — 只同步實際被引用的那一筆, 不做全量灌資料。

import { camelize, snakify } from './supabase-case';
import { alignPayloadClientId } from './supabase-client-id';

export interface TripRow {
  id: string;
  clientId: string;
  busId: string;
  nannyId: string;
  date: string;
  /**
   * 班次所屬學年 (4 位 code, 例 '2627') — migration 0017。
   * 沒有學年邊界, 26-27 與 27-28 的班次會混在一起。
   */
  academicYear?: string;
  /**
   * 建班當下的司機 id 快照 — migration 0017。
   * 沒有它, 校巴改綁司機後歷史班次會顯示錯的人。
   */
  driverIdSnapshot?: string | null;
  /**
   * 建班當下的車牌快照 — migration 0017。
   */
  busPlateNumberSnapshot?: string | null;
  type: 'morning' | 'afternoon' | 'custom';
  /** 自訂班次類型名稱 — 僅 type='custom' 時有值, 供預覽 / 清單顯示 (DB 欄位待 migration 0010) */
  customTypeLabel?: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  plannedStartTime: string;
  plannedEndTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  waypoints: any[];
  studentIds: string[];
  currentRouteIndex: number;
  completedStops: string[];
  /** 本班次套用的路線模板 id (cbl_routes.id) — null = 手動建立 */
  routeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

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
 * 該 id 是否存在於指定表; 若不存在則用 row 補建 (忽略重複 key 的衝突)
 *
 * ⚠️ 為什麼需要「逐步降欄」:
 *   live DB 的實際 schema 可能與 repo 內的 migrations 不一致 (例如
 *   cbl_drivers 沒有 license_expiry 欄位)。PostgREST 遇到未知欄位會直接
 *   回 42703 (column does not exist), 讓「補建父列」整個失敗 ——
 *   連帶 trip 也 insert 不進去 (FK violation)。
 *
 *   所以這裡改成: 遇到 42703 就把該欄位從 payload 移除後重試,
 *   最多重試 12 次 (足以涵蓋任何合理數量的多餘欄位)。
 */
async function ensureRow(
  table: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const { supabase } = await import('./supabase');
  let body = snakify(payload);

  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(table).insert(body);
    if (!error) return true;

    const code = (error as { code?: string }).code;
    // 23505 = unique violation → 已經存在, 視為成功
    if (code === '23505') return true;

    // 42703 = undefined column → 移除該欄位再試
    if (code === '42703') {
      const msg = error.message;
      const m = msg.match(/column\s+[\w.]+"?(?:([\w]+))"?\s+does not exist/i);
      const colName = m?.[1];
      if (colName && colName in body) {
        delete body[colName];
        continue;
      }
      // 抓不到欄位名 → 逐欄試探太慢, 直接放棄
      console.warn(`[Supabase] ensure ${table} failed (unknown column):`, error.message);
      return false;
    }

    console.warn(`[Supabase] ensure ${table} failed:`, error.message);
    return false;
  }

  console.warn(`[Supabase] ensure ${table} failed after column-trimming retries`);
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Ensure parents (FK safety)                                                 */
/* -------------------------------------------------------------------------- */

export interface EnsureTripParentsInput {
  clientId: string;
  busId: string;
  nannyId?: string | null;
  driverId?: string | null;
  studentIds?: string[];
  /** 本班次套用的路線模板 id (FK → cbl_routes.id) */
  routeId?: string | null;
  /** 從 localStorage 取到的父列完整資料 (供補建用) */
  client?: { id: string; name?: string } | null;
  bus?: Record<string, any> | null;
  driver?: Record<string, any> | null;
  nanny?: Record<string, any> | null;
  route?: Record<string, any> | null;
  students?: Record<string, any>[];
}

/**
 * 把 localStorage 的 camelCase 物件轉成可直接 snakify 的 payload。
 * 移除 clientId (改用明確傳入的 client_id), 避免重複 key 造成覆蓋順序不確定。
 */
function toPayload(
  row: Record<string, any>,
  clientId: string,
): Record<string, unknown> {
  const { clientId: _omit, ...rest } = row;
  return { ...rest, client_id: clientId };
}

/**
 * 保證 trip 會引用的所有父列都存在於 DB。
 * 缺哪個補哪個 (並且只在真的缺時才 insert)。
 *
 * ⚠️ 插入順序 MUST 符合 FK 依賴:
 *   client → driver → bus → nanny → students → route
 *   (cbl_buses.driver_id → cbl_drivers.id, cbl_students.bus_id → cbl_buses.id)
 *
 * 回傳 { ok, missing }:
 *   ok      = 所有必要父列都已就緒, 可以安全 insert trip
 *   missing = 仍無法就緒的依賴 key (例如 client 不存在 → 補不了, 因為需要更多欄位)
 */
export async function ensureTripParents(
  input: EnsureTripParentsInput,
): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];

  // 1) client (NOT NULL FK, 最底層)
  if (input.clientId) {
    const ok = await rowExists('cbl_clients', input.clientId);
    if (!ok) {
      const payload = {
        id: input.clientId,
        name: input.client?.name || '預設機構',
        email: '',
        phone: '',
        address: '',
        logo: null,
        primary_color: '#3b82f6',
        academic_year: '',
        status: 'active',
        created_at: new Date().toISOString(),
      };
      const created = await ensureRow('cbl_clients', input.clientId, payload);
      if (!created) missing.push(`client:${input.clientId}`);
    }
  } else {
    missing.push('client:<empty>');
  }

  // 2) driver (cbl_buses.driver_id → cbl_drivers.id, 必須在 bus 之前!)
  if (input.driverId) {
    const ok = await rowExists('cbl_drivers', input.driverId);
    if (!ok) {
      if (!input.driver) {
        missing.push(`driver:${input.driverId}`);
      } else {
        const created = await ensureRow(
          'cbl_drivers',
          input.driverId,
          toPayload(input.driver, input.clientId),
        );
        if (!created) missing.push(`driver:${input.driverId}`);
      }
    }
  }

  // 3) bus (NOT NULL FK on cbl_trips.bus_id)
  if (input.busId) {
    const ok = await rowExists('cbl_buses', input.busId);
    if (!ok) {
      if (!input.bus) {
        missing.push(`bus:${input.busId}`);
      } else {
        const created = await ensureRow(
          'cbl_buses',
          input.busId,
          toPayload(input.bus, input.clientId),
        );
        if (!created) missing.push(`bus:${input.busId}`);
      }
    }
  } else {
    missing.push('bus:<empty>');
  }

  // 4) nanny (nullable FK)
  if (input.nannyId) {
    const ok = await rowExists('cbl_nannies', input.nannyId);
    if (!ok) {
      if (!input.nanny) {
        missing.push(`nanny:${input.nannyId}`);
      } else {
        const created = await ensureRow(
          'cbl_nannies',
          input.nannyId,
          toPayload(input.nanny, input.clientId),
        );
        if (!created) missing.push(`nanny:${input.nannyId}`);
      }
    }
  }

  // 5) students (cbl_students.bus_id FK → cbl_buses, 所以必須在 bus 之後)
  //    注意: 學生表有 unique (client_id, student_id), 若同 client 下 student_id 重複
  //    且 id 不同, insert 會 23505 — 此時視為「已有該學生」, 不阻擋 trip 寫入
  //    (trip.student_ids 是 text[], 沒有 FK 到 students, 不會造成 trip insert 失敗)
  const studentList = input.students ?? [];
  for (const sid of input.studentIds ?? []) {
    const already = await rowExists('cbl_students', sid);
    if (already) continue;
    const stu = studentList.find((s) => s.id === sid);
    if (!stu) continue; // 學生資料不存在於 localStorage → 略過 (不阻擋)
    const created = await ensureRow(
      'cbl_students',
      sid,
      toPayload(stu, input.clientId),
    );
    if (!created) {
      // 23505 (unique client_id+student_id) 已視為成功; 其他錯誤才記錄
      console.warn(`[Supabase] ensure student ${sid} failed (non-fatal)`);
    }
  }

  // 6) route (nullable FK on cbl_trips.route_id — 必須在 route 存在之後)
  if (input.routeId) {
    const ok = await rowExists('cbl_routes', input.routeId);
    if (!ok) {
      if (!input.route) {
        missing.push(`route:${input.routeId}`);
      } else {
        const created = await ensureRow(
          'cbl_routes',
          input.routeId,
          toPayload(input.route, input.clientId),
        );
        if (!created) missing.push(`route:${input.routeId}`);
      }
    }
  }

  return { ok: missing.length === 0, missing };
}

/* -------------------------------------------------------------------------- */
/*  Trips CRUD                                                                  */
/* -------------------------------------------------------------------------- */

/** route_id 欄位存在與否的快取 (null = 尚未探測) */
let routeIdColumnCache: boolean | null = null;
/** custom_type_label 欄位存在與否的快取 (null = 尚未探測, migration 0010) */
let customTypeLabelColumnCache: boolean | null = null;
/** academic_year 欄位存在與否的快取 (null = 尚未探測, migration 0017) */
let academicYearColumnCache: boolean | null = null;
/** driver_id_snapshot / bus_plate_number_snapshot 欄位存在與否 (migration 0017) */
let tripSnapshotColumnCache: boolean | null = null;

export const supabaseTrips = {
  async getAll(): Promise<{ data: TripRow[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_trips').select('*');
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) };
  },

  async getByClient(clientId: string): Promise<{ data: TripRow[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_trips')
      .select('*')
      .eq('client_id', clientId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) };
  },

  /**
   * route_id 欄位是否存在於 DB?
   *
   * ⚠️ 為什麼需要這個檢查:
   *   cbl_trips.route_id 是 migration 0005 新增的欄位。若該 migration 尚未
   *   在 Supabase 執行, insert/update 帶上 route_id 會直接報
   *   "column cbl_trips.route_id does not exist", 讓所有班次寫入雲端全掛。
   *
   *   所以寫入前先探測一次, 沒有就把 routeId 欄位剔除, 讓班次仍可正常同步
   *   (只是暫時無法記錄「這班照哪條路線開」)。
   *
   *   結果會快取 (module-level), 避免每次寫入都多打一次網路。
   */
  async hasRouteIdColumn(): Promise<boolean> {
    if (routeIdColumnCache !== null) return routeIdColumnCache;
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_trips').select('route_id').limit(1);
    routeIdColumnCache = !error;
    if (!routeIdColumnCache) {
      console.warn(
        '[Supabase] cbl_trips.route_id 欄位不存在 — 請到 Supabase SQL Editor 執行 ' +
        'supabase/migrations/0005_trip_route_id.sql (目前班次會照常同步, 但不會記錄路線來源)',
      );
    }
    return routeIdColumnCache;
  },

  /**
   * custom_type_label 欄位是否存在於 DB (migration 0010)?
   * 未套用時寫入會剔除該欄, 自訂名稱僅存本機, 班次照常同步。
   */
  async hasCustomTypeLabelColumn(): Promise<boolean> {
    if (customTypeLabelColumnCache !== null) return customTypeLabelColumnCache;
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_trips').select('custom_type_label').limit(1);
    customTypeLabelColumnCache = !error;
    if (!customTypeLabelColumnCache) {
      console.warn(
        '[Supabase] cbl_trips.custom_type_label 欄位不存在 — 請到 Supabase SQL Editor 執行 ' +
        'supabase/migrations/0010_trip_custom_label.sql (目前班次會照常同步, 自訂名稱僅存本機)',
      );
    }
    return customTypeLabelColumnCache;
  },

  /**
   * academic_year 欄位是否存在於 DB (migration 0017)?
   * 未套用時寫入會剔除該欄 (資料仍可同步, 只是沒有學年邊界)。
   */
  async hasAcademicYearColumn(): Promise<boolean> {
    if (academicYearColumnCache !== null) return academicYearColumnCache;
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_trips').select('academic_year').limit(1);
    academicYearColumnCache = !error;
    if (!academicYearColumnCache) {
      console.warn(
        '[Supabase] cbl_trips.academic_year 欄位不存在 — 請到 Supabase SQL Editor 執行 ' +
        'supabase/migrations/0017_entity_academic_year.sql (班次照常同步, 但沒有學年邊界)',
      );
    }
    return academicYearColumnCache;
  },

  /**
   * driver_id_snapshot / bus_plate_number_snapshot 欄位是否存在於 DB (migration 0017)?
   *
   * ⚠️ 這兩個欄位是「歷史保真」的關鍵 ——
   *    沒有它們, 27-28 換了司機後回頭看 26-27 的班次會顯示錯的司機。
   */
  async hasTripSnapshotColumns(): Promise<boolean> {
    if (tripSnapshotColumnCache !== null) return tripSnapshotColumnCache;
    const { supabase } = await import('./supabase');
    const { error } = await supabase
      .from('cbl_trips')
      .select('driver_id_snapshot,bus_plate_number_snapshot')
      .limit(1);
    tripSnapshotColumnCache = !error;
    if (!tripSnapshotColumnCache) {
      console.warn(
        '[Supabase] cbl_trips 快照欄位不存在 — 請執行 ' +
        'supabase/migrations/0017_entity_academic_year.sql (歷史班次的司機/車牌會隨改綁而變動)',
      );
    }
    return tripSnapshotColumnCache;
  },

  async add(trip: TripRow): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(trip);
    // ⚠️ client_id 有 FK → cbl_clients(id) 且 NOT NULL → 空字串一定撞 FK
    await alignPayloadClientId(payload);
    // migration 0005 未套用時, 剔除 route_id 避免整筆 insert 失敗
    if (!(await this.hasRouteIdColumn())) {
      delete payload.route_id;
    }
    // migration 0010 未套用時, 剔除 custom_type_label (自訂班次名稱僅存本機)
    if (!(await this.hasCustomTypeLabelColumn())) {
      delete payload.custom_type_label;
    }
    // migration 0017 未套用時, 剔除學年與快照欄位 (資料仍可同步, 只是沒有學年邊界)
    if (!(await this.hasAcademicYearColumn())) {
      delete payload.academic_year;
    }
    if (!(await this.hasTripSnapshotColumns())) {
      delete payload.driver_id_snapshot;
      delete payload.bus_plate_number_snapshot;
    }
    const { error } = await supabase.from('cbl_trips').insert(payload);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async update(
    id: string,
    patch: Partial<TripRow>,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(patch);
    // 同 add: 若 patch 帶 client_id, 必須對齊到雲端真的存在的 id
    if ('client_id' in payload) {
      await alignPayloadClientId(payload);
    }
    // migration 0005 未套用時, 剔除 route_id 避免整筆 update 失敗
    if (!(await this.hasRouteIdColumn())) {
      delete payload.route_id;
    }
    // migration 0010 未套用時, 剔除 custom_type_label
    if ('customTypeLabel' in patch && !(await this.hasCustomTypeLabelColumn())) {
      delete payload.custom_type_label;
    }
    // migration 0017 未套用時, 剔除學年與快照欄位
    if ('academicYear' in patch && !(await this.hasAcademicYearColumn())) {
      delete payload.academic_year;
    }
    if (
      ('driverIdSnapshot' in patch || 'busPlateNumberSnapshot' in patch) &&
      !(await this.hasTripSnapshotColumns())
    ) {
      delete payload.driver_id_snapshot;
      delete payload.bus_plate_number_snapshot;
    }
    // ⚠️ 必須 .select() 二次驗證 ——
    //   PostgREST 對「update 0 筆」(id 在雲端不存在) 回傳成功 + 無錯誤,
    //   但實際沒寫進任何東西 → 呼叫端以為成功, 雲端卻沒有這筆資料。
    const { data, error } = await supabase
      .from('cbl_trips')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) {
      console.warn(`[Supabase] cbl_trips.update 沒有匹配到任何列 (id=${id})`);
      return {
        success: false,
        error: `雲端找不到這筆資料 (cbl_trips/${id}), 請重新新增`,
      };
    }
    return { success: true };
  },

  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_trips').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  /**
   * P0-5: 批次狀態更新 — 一次 .in('id', ids) 取代 N 次 update。
   * 避免 Promise.all(ids.map(update)) 打爆 FK ensure + 觸發 N 次 sync。
   */
  async bulkUpdateStatus(
    ids: string[],
    patch: Partial<Pick<TripRow, 'status' | 'updatedAt'>>,
  ): Promise<{ success: boolean; error?: string; count?: number }> {
    if (ids.length === 0) return { success: true, count: 0 };
    const { supabase } = await import('./supabase');
    const body: Record<string, unknown> = {
      ...snakify(patch),
      updated_at: new Date().toISOString(),
    };
    // route_id 欄位若不存在會整批失敗 — 先剔除
    if ('routeId' in patch && !(await this.hasRouteIdColumn())) {
      delete body.route_id;
    }
    const { error, count } = await supabase
      .from('cbl_trips')
      .update(body)
      .in('id', ids);
    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? ids.length };
  },

  /**
   * P0-5: 批次新增 (週期建班用) — 一次 insert 多筆。
   */
  async bulkAdd(rows: TripRow[]): Promise<{ success: boolean; error?: string }> {
    if (rows.length === 0) return { success: true };
    const { supabase } = await import('./supabase');
    const hasRouteId = await this.hasRouteIdColumn();
    const hasCustomLabel = await this.hasCustomTypeLabelColumn();
    const hasAcademicYear = await this.hasAcademicYearColumn();
    const hasSnapshots = await this.hasTripSnapshotColumns();
    const payload = rows.map((r) => {
      const p = snakify(r) as Record<string, unknown>;
      if (!hasRouteId) delete p.route_id;
      if (!hasCustomLabel) delete p.custom_type_label;
      if (!hasAcademicYear) delete p.academic_year;
      if (!hasSnapshots) {
        delete p.driver_id_snapshot;
        delete p.bus_plate_number_snapshot;
      }
      return p;
    });
    const { error } = await supabase.from('cbl_trips').insert(payload);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },
};
