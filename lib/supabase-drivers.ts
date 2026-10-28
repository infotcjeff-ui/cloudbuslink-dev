// Supabase 司機 CRUD 操作
import { camelize, snakify } from './supabase-case';

// 司機 CRUD 操作
export const supabaseDrivers = {
  /**
   * 檢查指定 id 的司機是否已存在於 Supabase
   * 用於避免 FK violation: bus.driver_id 必須指向真實存在的 driver
   */
  async exists(id: string): Promise<boolean> {
    try {
      const { supabase } = await import('./supabase');
      const { data, error } = await supabase
        .from('cbl_drivers')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        console.warn('[Supabase] drivers.exists error:', error);
        return false;
      }
      return !!data;
    } catch (e) {
      console.warn('[Supabase] drivers.exists failed:', e);
      return false;
    }
  },

  /**
   * 查詢所有司機 (raw camelized array)
   * - 對應 lib/types.ts 的 Driver 介面
   * - 給定 clientId 時只回傳該機構的司機, 不傳則回傳全部
   */
  async getAll(clientId?: string): Promise<{ data: any[]; error?: string }> {
    const { supabase } = await import('./supabase');
    let query = supabase.from('cbl_drivers').select('*');
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] Failed to fetch drivers:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) };
  },

  /** 便捷別名: 與 supabaseBuses.getByClient 對齊命名風格 */
  async getByClient(clientId: string): Promise<{ data: any[]; error?: string }> {
    return this.getAll(clientId);
  },

  // 新增司機
  async add(driver: {
    id: string;
    clientId: string;
    companyId?: string | null;
    name: string;
    phone: string;
    licenseNumber: string;
    photo: string | null;
    status: 'available' | 'on_trip' | 'off_duty';
    createdAt: string;
  }): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(driver);

    // 用 .select() 驗證資料是否真的寫入 (RLS 政策可能會靜默拒絕)
    const { data, error } = await supabase
      .from('cbl_drivers')
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to add driver:', error);
      return { success: false, error: error.message };
    }

    // 二次驗證: 真的 select 出來才算數 (避免 RLS 政策靜默過濾掉 insert 結果)
    if (data && data.id) {
      const { data: verifyData, error: verifyError } = await supabase
        .from('cbl_drivers')
        .select('id')
        .eq('id', data.id)
        .maybeSingle();
      if (verifyError) {
        console.warn('[Supabase] verify select error:', verifyError);
      } else if (!verifyData) {
        console.warn('[Supabase] insert 回傳成功但 verify select 找不到 row (RLS 過濾掉了資料)');
        return {
          success: false,
          error: 'RLS 政策過濾掉 insert (verify 失敗)',
        };
      }
    }

    // RLS 政策可能會讓 insert 回傳 success 但實際上過濾掉資料
    if (!data) {
      console.warn('[Supabase] add driver was silently rejected by RLS', driver);
      return {
        success: false,
        error: 'RLS 政策拒絕 (無寫入權限或欄位不符)',
      };
    }

    return { success: true, id: data.id };
  },

  // 更新司機
  async update(
    id: string,
    patch: Partial<{
      name: string;
      phone: string;
      licenseNumber: string;
      photo: string | null;
      status: 'available' | 'on_trip' | 'off_duty';
      companyId: string | null;
    }>,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    // 用 .select() 驗證更新是否真的生效
    const { data, error } = await supabase
      .from('cbl_drivers')
      .update(snakify(patch))
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to update driver:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] update driver was silently rejected by RLS', id, patch);
      return {
        success: false,
        error: 'RLS 政策拒絕 (無更新權限)',
      };
    }

    return { success: true };
  },

  // 刪除司機
  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_drivers')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to delete driver:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] delete driver was silently rejected by RLS', id);
      return {
        success: false,
        error: 'RLS 政策拒絕 (無刪除權限)',
      };
    }

    return { success: true };
  },
};
