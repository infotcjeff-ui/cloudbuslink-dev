// ============================================================================
//  Supabase 學年登錄 CRUD — cbl_academic_years
//
//  為什麼需要這個檔案:
//    學年是「資料邊界」, 不是顯示字串。0016 建立了 cbl_academic_years 表,
//    這裡負責讀寫它, 並提供「取得某 client 的現行學年」這個最關鍵的查詢。
//
//  設計要點 (與 lib/supabase-entities.ts 一致):
//    1. insert / update / delete 後用 .select() 二次驗證
//       —— RLS 可能靜默拒絕 (回傳成功但實際沒寫進去)
//    2. 未知欄位自動降欄重試 (live DB schema 可能跟 migrations 不一致)
//
//  ⚠️ 「現行學年」的唯一保證在 DB: partial unique index
//     idx_cbl_academic_years_current (client_id) WHERE is_current
//     → 每個 client 最多一筆 is_current = true。
//     應用層寫入時若違反 → insert 會直接失敗 (而不是產生兩筆現行學年)。
// ============================================================================

import { camelize, snakify } from './supabase-case';
import type { AcademicYear, AcademicYearStatus } from './academic-year';

/** 寫入時的欄位集合 (對應 cbl_academic_years) */
export interface AcademicYearPayload {
  id: string;
  clientId: string;
  academicYear: string;
  label?: string | null;
  status?: AcademicYearStatus;
  isCurrent?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * 未知欄位降欄重試 — 見 lib/supabase-entities.ts 的同名 helper。
 * 這裡獨立一份, 避免在 entities 檔案裡再導出一個只給這個模組用的工具。
 */
async function insertWithColumnFallback(
  table: string,
  body: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; dropped?: string[] }> {
  const { supabase } = await import('./supabase');
  let payload = body;
  const dropped: string[] = [];

  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) {
      if (dropped.length > 0) {
        console.warn(
          `[Supabase] ${table}.insert 已略過 live schema 沒有的欄位: ${dropped.join(', ')}`,
        );
      }
      return { success: true, dropped };
    }

    // 42703 = undefined_column → 該欄在 live DB 不存在 → 移除後重試
    if (error.code === '42703') {
      const msg = error.message || '';
      const match = msg.match(/column "([^"]+)" of relation "([^"]+)" does not exist/);
      if (!match) return { success: false, error: error.message };

      const badColumn = match[1];
      const snakeCol = badColumn.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      const key = Object.keys(payload).find(
        (k) => k === badColumn || k === snakeCol || k.replace(/_([a-z])/g, (_m, l) => String(l).toUpperCase()) === badColumn,
      );
      if (!key) return { success: false, error: error.message };

      dropped.push(key);
      const next = { ...payload };
      delete next[key];
      payload = next;
      continue;
    }

    return { success: false, error: error.message };
  }

  return { success: false, error: '降欄重試次數用盡' };
}

export const supabaseAcademicYears = {
  /**
   * 取得所有學年登錄 (通常是 per-client 呼叫)。
   */
  async getAll(): Promise<{ data: AcademicYear[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_academic_years')
      .select('*')
      .order('academic_year', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as AcademicYear[] };
  },

  /**
   * 取得某個 client 的所有學年 (新到舊)。
   */
  async getByClient(clientId: string): Promise<{ data: AcademicYear[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_academic_years')
      .select('*')
      .eq('client_id', clientId)
      .order('academic_year', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) as AcademicYear[] };
  },

  /**
   * 取得某個 client 的「現行學年」— 整個系統最重要的一個查詢。
   *
   * ⚠️ 這個查詢在 M2 之後會被所有「寫入蓋章」的路徑呼叫,
   *    所以它必須夠快 (走 idx_cbl_academic_years_current)。
   */
  async getCurrent(clientId: string): Promise<{ data: AcademicYear | null; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_academic_years')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_current', true)
      .maybeSingle();
    if (error) return { data: null, error: error.message };
    return { data: data ? (camelize(data) as AcademicYear) : null };
  },

  /**
   * 取得某個 client 的某個特定學年。
   */
  async getByYear(
    clientId: string,
    academicYear: string,
  ): Promise<{ data: AcademicYear | null; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_academic_years')
      .select('*')
      .eq('client_id', clientId)
      .eq('academic_year', academicYear)
      .maybeSingle();
    if (error) return { data: null, error: error.message };
    return { data: data ? (camelize(data) as AcademicYear) : null };
  },

  /**
   * 新增學年登錄。
   *
   * ⚠️ 若要把新學年設為現行 (is_current = true), 必須先把舊的現行學年
   *    改成 is_current = false — 否則 partial unique index 會讓 insert 失敗。
   *    → 這裡的 add() 自動處理: 設為現行時先把其他筆的 is_current 清掉。
   */
  async add(
    year: AcademicYearPayload,
  ): Promise<{ success: boolean; error?: string; id?: string; dropped?: string[] }> {
    const { supabase } = await import('./supabase');

    if (!year.id || !year.clientId || !year.academicYear) {
      return { success: false, error: '缺少必要欄位 (id / clientId / academicYear)' };
    }

    // 設為現行 → 先解除舊的現行標記 (partial unique index 只允許一筆)
    if (year.isCurrent) {
      const { error: unsetErr } = await supabase
        .from('cbl_academic_years')
        .update({ is_current: false })
        .eq('client_id', year.clientId)
        .eq('is_current', true);
      if (unsetErr) {
        return { success: false, error: `解除舊的現行學年失敗: ${unsetErr.message}` };
      }
    }

    const body = snakify({
      id: year.id,
      client_id: year.clientId,
      academic_year: year.academicYear,
      label: year.label ?? null,
      status: year.status ?? 'active',
      is_current: year.isCurrent ?? false,
      start_date: year.startDate ?? null,
      end_date: year.endDate ?? null,
    });

    const res = await insertWithColumnFallback('cbl_academic_years', body);
    if (!res.success) return { success: false, error: res.error };

    // 二次驗證
    const { data: verify, error: verifyErr } = await supabase
      .from('cbl_academic_years')
      .select('id')
      .eq('id', year.id)
      .maybeSingle();
    if (verifyErr) {
      console.warn('[Supabase] academic_years verify error:', verifyErr);
    } else if (!verify) {
      return { success: false, error: 'RLS 政策拒絕 (insert 後驗證失敗)' };
    }

    return { success: true, id: year.id, dropped: res.dropped };
  },

  /**
   * 更新學年登錄。
   */
  async update(
    id: string,
    patch: Partial<AcademicYearPayload>,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    // 設為現行 → 先解除舊的現行標記
    if (patch.isCurrent) {
      const { data: current } = await supabase
        .from('cbl_academic_years')
        .select('client_id')
        .eq('id', id)
        .maybeSingle();
      if (current?.client_id) {
        const { error: unsetErr } = await supabase
          .from('cbl_academic_years')
          .update({ is_current: false })
          .eq('client_id', current.client_id)
          .eq('is_current', true);
        if (unsetErr) {
          return { success: false, error: `解除舊的現行學年失敗: ${unsetErr.message}` };
        }
      }
    }

    const { data, error } = await supabase
      .from('cbl_academic_years')
      .update(snakify(patch))
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to update academic year:', error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
    }
    return { success: true };
  },

  /**
   * 刪除學年登錄。
   *
   * ⚠️ 呼叫端要自己判斷: 不應該刪除 is_current = true 的學年。
   */
  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_academic_years')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to delete academic year:', error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    }
    return { success: true };
  },
};
