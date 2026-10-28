// Supabase 機構 (cbl_clients) CRUD 操作
//
// 為什麼需要這個檔案:
// - cbl_clients 是 tenant 根表 — 學生/家長/校巴/班次/保姆全部掛在 client_id 下
// - 但此前全站沒有任何管理機構的 UI, 只有讀取路徑 (lib/supabase-data.ts)
// - 網站設定 (site-tool) 要能新增/編輯機構, 必須能寫回 DB
// - 只寫 localStorage 的話, 下一次 syncFromSupabase() 會用 DB 覆蓋 → 機構憑空消失
//
// 刪除注意: cbl_users.client_id / cbl_drivers / cbl_buses / ... 都是 on delete set null
// 或 cascade, 刪機構會連帶清掉該機構的資料。所以 UI 端應該用「停用」而非「刪除」,
// 真的刪除時要二次確認並明確提示影響範圍。
//
// RLS: 開發階段 cbl_clients 上有 dev_allow_all policy (anon 可讀寫),
// 所以 client 端 (anon key) 就能寫入。上線前要移除並改寫 per-role policy。

import { camelize, snakify } from './supabase-case';
import type { Client } from './types';

/** 機構寫入時的欄位集合 (對應 cbl_clients) */
export interface SupabaseClientPayload {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  primaryColor: string;
  academicYear: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

/** 更新時允許修改的欄位 (id / createdAt 不變) */
export type SupabaseClientPatch = Partial<
  Omit<SupabaseClientPayload, 'id' | 'createdAt'>
>;

export const supabaseClients = {
  /**
   * 查詢所有機構
   * - 不按任何條件過濾: 機構頁是跨機構的管理頁 (只有 super_admin 看得到)
   */
  async getAll(): Promise<{ data: any[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_clients').select('*');

    if (error) {
      console.error('[Supabase] Failed to fetch clients:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) };
  },

  /**
   * 把 cbl_clients 同步到 LocalStorage。
   *
   * 為什麼需要這個獨立函式:
   * - initWithSupabase() 在 localStorage 已 initialized 時會直接 return,
   *   所以機構資料在第一次載入後就不再更新
   * - 結果: 在後台改了機構名稱 → 選單、帳號 modal 的機構下拉仍顯示舊名稱
   * - cbl_clients 是一張很小的表, 每次 mount 都拉一次的成本可以忽略
   */
  async syncToStorage(): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.getAll();
    if (error) return { success: false, error };
    if (data.length === 0) {
      // DB 沒有機構 → 不覆蓋 localStorage (避免把資料清空)
      return { success: true };
    }

    const { STORAGE } = await import('./storage');
    STORAGE.clients.setAll(data as Client[]);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbl-clients-refresh'));
    }
    return { success: true };
  },

  /**
   * 新增機構
   * - insert 後用 .select() 二次驗證, 避免 RLS 靜默拒絕 (insert 回傳成功但資料沒寫進去)
   */
  async add(
    client: SupabaseClientPayload,
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(client);

    const { data, error } = await supabase
      .from('cbl_clients')
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to add client:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] add client was silently rejected by RLS', client.id);
      return {
        success: false,
        error: 'RLS 政策拒絕 (無寫入權限或欄位不符)',
      };
    }

    // 二次驗證: 真的 select 出來才算數
    const { data: verifyData, error: verifyError } = await supabase
      .from('cbl_clients')
      .select('id')
      .eq('id', data.id)
      .maybeSingle();

    if (verifyError) {
      console.warn('[Supabase] verify select error:', verifyError);
    } else if (!verifyData) {
      console.warn('[Supabase] insert 回傳成功但 verify select 找不到 row');
      return { success: false, error: 'RLS 政策過濾掉 insert (verify 失敗)' };
    }

    return { success: true, id: data.id };
  },

  /** 更新機構 */
  async update(
    id: string,
    patch: SupabaseClientPatch,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_clients')
      .update(snakify(patch))
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to update client:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] update client was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
    }

    return { success: true };
  },

  /**
   * 刪除機構
   *
   * ⚠️ cascade 警告: cbl_drivers / cbl_buses / cbl_parents / cbl_students /
   * cbl_nannies / cbl_routes / cbl_trips / cbl_announcements 都是 on delete cascade,
   * 刪掉機構會一併刪除該機構底下所有資料。cbl_users.client_id 是 on delete set null
   * (帳號會留下但變成「無機構」)。呼叫端必須先向用戶確認。
   */
  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_clients')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to delete client:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] delete client was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    }

    return { success: true };
  },
};
