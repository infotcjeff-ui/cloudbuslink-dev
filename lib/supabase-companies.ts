// Supabase 機構/公司 (cbl_companies) CRUD 操作
//
// 為什麼需要這個檔案:
// - cbl_companies 是公司層 — 僅保姆 / 司機 / 校巴 / super_admin 相關 User
//   可選配 companyId (非必填)，學生/家長/班次/路線/公告只掛學校 (clientId)
// - 與 supabase-clients.ts 同構：只寫 localStorage 會被 sync 覆蓋，必須寫回 DB
//
// RLS: 開發階段 cbl_companies 上有 dev_allow_all policy (anon 可讀寫)，
import { camelize, snakify } from './supabase-case';
import type { Company } from './types';

/** 機構/公司寫入時的欄位集合 (對應 cbl_companies) */
export interface SupabaseCompanyPayload {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

/** 更新時允許修改的欄位 (id / createdAt 不變) */
export type SupabaseCompanyPatch = Partial<
  Omit<SupabaseCompanyPayload, 'id' | 'createdAt'>
>;

export const supabaseCompanies = {
  /**
   * 查詢所有機構/公司
   */
  async getAll(): Promise<{ data: any[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_companies').select('*');

    if (error) {
      console.error('[Supabase] Failed to fetch companies:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) };
  },

  /**
   * 把 cbl_companies 同步到 LocalStorage。
   */
  async syncToStorage(): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.getAll();
    if (error) return { success: false, error };
    if (data.length === 0) {
      // DB 沒有 → 不覆蓋 localStorage (避免把資料清空)
      return { success: true };
    }

    const { STORAGE } = await import('./storage');
    STORAGE.companies.setAll(data as Company[]);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbl-companies-refresh'));
    }
    return { success: true };
  },

  /**
   * 新增機構/公司
   * - insert 後用 .select() 二次驗證, 避免 RLS 靜默拒絕
   */
  async add(
    company: SupabaseCompanyPayload,
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(company);

    const { data, error } = await supabase
      .from('cbl_companies')
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to add company:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] add company was silently rejected by RLS', company.id);
      return {
        success: false,
        error: 'RLS 政策拒絕 (無寫入權限或欄位不符)',
      };
    }

    // 二次驗證: 真的 select 出來才算數
    const { data: verifyData, error: verifyError } = await supabase
      .from('cbl_companies')
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

  /** 更新機構/公司 */
  async update(
    id: string,
    patch: SupabaseCompanyPatch,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_companies')
      .update(snakify(patch))
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to update company:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] update company was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
    }

    return { success: true };
  },

  /** 刪除機構/公司 (保姆/司機/校巴/User 的 company_id 會被 set null，不連帶刪除) */
  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_companies')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to delete company:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] delete company was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    }

    return { success: true };
  },
};
