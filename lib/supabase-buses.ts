// Supabase 校巴 CRUD 操作
import { camelize, snakify } from './supabase-case';

/**
 * 從錯誤解析「不存在的欄位名」。
 * live DB schema 可能與 repo migrations 不一致 (例如缺 company_id)。
 * PostgREST 遇到未知欄位會讓整筆 insert/update 失敗 (42703 / PGRST204)。
 */
function parseMissingColumn(error: { code?: string; message?: string }): string | null {
  const code = error.code;
  const message = error.message ?? '';
  if (code === 'PGRST204') {
    const m = message.match(/Could not find the '([\w]+)' column/i);
    return m?.[1] ?? null;
  }
  if (code === '42703') {
    const m = message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
    return m?.[1] ?? null;
  }
  if (/does not exist/i.test(message) && /column/i.test(message)) {
    const m = message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
    return m?.[1] ?? null;
  }
  return null;
}

async function rowExists(table: string, id: string): Promise<boolean> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/** insert 版未知欄位降級重試 (最多 12 次) + 23505 視為成功 */
async function insertWithColumnFallback(
  table: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await import('./supabase');
  let payload = body;
  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) return { success: true };
    const code = (error as { code?: string }).code;
    if (code === '23505') return { success: true };
    const colName = parseMissingColumn(error);
    if (colName && colName in payload) {
      const next = { ...payload };
      delete next[colName];
      payload = next;
      continue;
    }
    return { success: false, error: error.message };
  }
  return { success: false, error: 'insert 失敗 (欄位降級重試已用盡)' };
}

/** update 版未知欄位降級重試 */
async function updateWithColumnFallback(
  table: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await import('./supabase');
  let payload = body;
  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    if (!error) return { success: true };
    const colName = parseMissingColumn(error);
    if (colName && colName in payload) {
      const next = { ...payload };
      delete next[colName];
      payload = next;
      continue;
    }
    return { success: false, error: error.message };
  }
  return { success: false, error: 'update 失敗 (欄位降級重試已用盡)' };
}

/**
 * 保證 driver 存在於 cbl_drivers (cbl_buses.driver_id FK)。
 * 缺就用 localStorage 的完整 driver 補建 (含欄位降級), 補不了就回 false。
 */
async function ensureDriverExists(driverId: string | null | undefined): Promise<boolean> {
  if (!driverId) return true;
  if (await rowExists('cbl_drivers', driverId)) return true;
  try {
    const { STORAGE } = await import('./storage');
    const driver = STORAGE.drivers.getById(driverId);
    if (!driver) return false;
    const { clientId, id, ...rest } = driver as Record<string, any>;
    // ⚠️ client_id 有 FK → 本機的 clientId 可能跟雲端不同步,
    //    直接用會撞 cbl_drivers_client_id_fkey, 導致「補建失敗」→
    //    呼叫端把 driverId 清成 null → 綁定在雲端就消失了。
    //    所以先對齊到雲端真的存在的 client id 再寫。
    const { resolveCloudClientId } = await import('./supabase-drivers');
    const safeClientId = await resolveCloudClientId(clientId);
    const res = await insertWithColumnFallback('cbl_drivers', {
      ...snakify(rest),
      id,
      client_id: safeClientId,
    });
    if (!res.success) {
      console.warn('[Supabase] ensureDriverExists 補建失敗:', driverId, res.error);
    }
    return res.success;
  } catch {
    return false;
  }
}

// 校巴 CRUD 操作
export const supabaseBuses = {
  // 新增校巴
  async add(bus: {
    id: string;
    clientId: string;
    companyId?: string | null;
    plateNumber: string;
    model: string;
    capacity: number;
    driverId: string | null;
    gpsDeviceId: string | null;
    status: 'active' | 'maintenance' | 'inactive';
    createdAt: string;
  }): Promise<{ success: boolean; error?: string }> {
    // 先保證 driver 父列存在, 避免 FK violation 讓整筆 insert 失敗
    // (司機可能只在 localStorage、尚未推上雲端)
    if (bus.driverId && !(await ensureDriverExists(bus.driverId))) {
      console.warn('[Supabase] bus add: driver 不存在且無法補建, 先清空 driverId 再寫入', bus.driverId);
      bus = { ...bus, driverId: null };
    }
    const res = await insertWithColumnFallback('cbl_buses', snakify(bus));
    if (!res.success) {
      console.error('[Supabase] Failed to add bus:', res.error);
    }
    return res;
  },

  // 更新校巴
  async update(
    id: string,
    updates: Partial<{
      plateNumber: string;
      model: string;
      capacity: number;
      driverId: string | null;
      gpsDeviceId: string | null;
      status: 'active' | 'maintenance' | 'inactive';
      companyId: string | null;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    const patch = { ...updates } as typeof updates & { driverId?: string | null };
    // driver 換綁時同樣先保證父列存在, 補不了就先清空再寫 (避免整筆 update 被 FK 拒絕)
    if (patch.driverId && !(await ensureDriverExists(patch.driverId))) {
      console.warn('[Supabase] bus update: driver 不存在且無法補建, 先清空 driverId 再寫入', patch.driverId);
      patch.driverId = null;
    }
    const res = await updateWithColumnFallback('cbl_buses', id, snakify(patch));
    if (!res.success) {
      console.error('[Supabase] Failed to update bus:', res.error);
      return res;
    }

    // 二次驗證: update 對不存在的 id 會回傳 0 row (與 RLS 過濾的表象相同)。
    // 這裡確實寫入, 但雲端可能根本沒有這輛車 (只在本機建立的資料) — 補建它。
    try {
      const { supabase } = await import('./supabase');
      const { data, error } = await supabase
        .from('cbl_buses')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (error) return { success: true }; // 驗證失敗不影響已完成的寫入
      if (!data) {
        console.warn('[Supabase] bus update: 雲端無此筆, 嘗試補建', id);
        const { STORAGE } = await import('./storage');
        const local = STORAGE.buses.getById(id);
        if (!local) {
          return { success: false, error: '雲端與本機都找不到這輛校巴' };
        }
        // client_id 有 FK → 必須指向雲端 cbl_clients 真的存在的 row
        const { resolveCloudClientId } = await import('./supabase-drivers');
        const clientId = await resolveCloudClientId(local.clientId);
        const rebuilt = await this.add({
          id: local.id,
          clientId,
          companyId: local.companyId ?? null,
          plateNumber: patch.plateNumber ?? local.plateNumber,
          model: patch.model ?? local.model,
          capacity: patch.capacity ?? local.capacity,
          driverId: patch.driverId ?? local.driverId ?? null,
          gpsDeviceId: patch.gpsDeviceId ?? local.gpsDeviceId ?? null,
          status: patch.status ?? local.status,
          createdAt: local.createdAt,
        });
        if (!rebuilt.success) {
          return { success: false, error: rebuilt.error ?? '雲端補建校巴失敗' };
        }
      }
    } catch (e) {
      console.warn('[Supabase] bus update verify error:', e);
    }

    return { success: true };
  },

  // 刪除校巴
  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    
    const { error } = await supabase
      .from('cbl_buses')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[Supabase] Failed to delete bus:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  },

  // 查詢所有校巴
  async getAll(): Promise<{ data: any[]; error?: string }> {
    const { supabase } = await import('./supabase');
    
    const { data, error } = await supabase
      .from('cbl_buses')
      .select('*');
    
    if (error) {
      console.error('[Supabase] Failed to fetch buses:', error);
      return { data: [], error: error.message };
    }
    
    return { data: (data || []).map(camelize) };
  },

  // 按 clientId 查詢校巴
  async getByClient(clientId: string): Promise<{ data: any[]; error?: string }> {
    const { supabase } = await import('./supabase');
    
    const { data, error } = await supabase
      .from('cbl_buses')
      .select('*')
      .eq('client_id', clientId);
    
    if (error) {
      console.error('[Supabase] Failed to fetch buses by client:', error);
      return { data: [], error: error.message };
    }
    
    return { data: (data || []).map(camelize) };
  },
};
