// Supabase 司機 CRUD 操作
import { camelize, snakify } from './supabase-case';
import { alignPayloadClientId } from './supabase-client-id';

/**
 * 解析一個「雲端真的存在的」client id。
 *
 * 背景: cbl_drivers.client_id 有 FK → cbl_clients(id)。
 *   本機 localStorage 的 clientId 可能是舊的 / 不同步的 id,
 *   直接拿去 insert 會撞 FK violation (cbl_drivers_client_id_fkey)。
 *
 * ⚠️ 本函式保留「回傳字串」的舊簽名 (呼叫端 lib/supabase-buses.ts 依賴它)。
 *    新的共用實作在 lib/supabase-client-id.ts, 那裡還多處理了
 *    「刻意給 null」與「空字串」的語意差異 —— 這裡直接委派過去, 避免兩份邏輯漂移。
 */
export async function resolveCloudClientId(preferred?: string | null): Promise<string> {
  const { resolveCloudClientId: resolve } = await import('./supabase-client-id');
  return (await resolve(preferred)) ?? '';
}

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

    // ⚠️ client_id 有 FK → cbl_clients(id) 且 NOT NULL → 空字串一定撞 FK
    await alignPayloadClientId(payload);

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
      // ⚠️ 這裡不一定是 RLS 拒絕 —— 更常見的是「雲端根本沒有這筆資料」。
      // update 對不存在的 id 回傳 0 row, 跟 RLS 過濾掉的效果一模一樣,
      // 所以原本一律回報「RLS 政策拒絕」是誤導 (真正的 RLS 錯誤會走上面的 error 分支)。
      //
      // 處置: 確認雲端有沒有這筆 → 沒有就用 localStorage 的完整資料補建,
      // 再套用 patch。這讓「只在本機建立的司機」也能推上雲端。
      const exists = await this.exists(id);
      if (!exists) {
        console.warn('[Supabase] update driver: 雲端無此筆, 嘗試補建', id);
        const { STORAGE } = await import('./storage');
        const local = STORAGE.drivers.getById(id);
        if (!local) {
          return { success: false, error: '雲端與本機都找不到這位司機' };
        }
        // ⚠️ client_id 有 FK → 必須指向雲端 cbl_clients 真的存在的 row。
        //    本機的 clientId 可能跟雲端不同步 (例如本機還在用舊的 demo client id),
        //    直接用本機值會撞 FK violation (cbl_drivers_client_id_fkey)。
        //    所以先確認, 對不上就改用雲端第一間學校。
        const clientId = await resolveCloudClientId(local.clientId);
        const rebuilt = await this.add({
          id: local.id,
          clientId,
          companyId: local.companyId ?? null,
          name: patch.name ?? local.name,
          phone: patch.phone ?? local.phone,
          licenseNumber: patch.licenseNumber ?? local.licenseNumber,
          photo: patch.photo ?? local.photo ?? null,
          status: patch.status ?? local.status,
          createdAt: local.createdAt,
        });
        if (!rebuilt.success) {
          return { success: false, error: rebuilt.error ?? '雲端補建司機失敗' };
        }
        return { success: true };
      }

      console.warn('[Supabase] update driver returned 0 rows (RLS 可能過濾)', id, patch);
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
