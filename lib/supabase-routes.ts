// Supabase route CRUD wrappers (沿用 lib/supabase-buses.ts 模式)

import { camelize, snakify } from './supabase-case';
import { alignPayloadClientId } from './supabase-client-id';

export interface RouteRow {
  id: string;
  clientId: string;
  code: string;
  name: string;
  shiftType: 'morning' | 'afternoon' | 'extracurricular';
  busId: string;
  driverId: string;
  nannyId: string;
  stops: any[];
  createdAt: string;
  updatedAt: string;
}

export const supabaseRoutes = {
  async getByClient(clientId: string): Promise<{ data: RouteRow[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_routes')
      .select('*')
      .eq('client_id', clientId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) };
  },

  async add(route: RouteRow): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(route);
    // ⚠️ client_id 有 FK → cbl_clients(id) 且 NOT NULL → 空字串一定撞 FK
    await alignPayloadClientId(payload);
    const { error } = await supabase.from('cbl_routes').insert(payload);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async update(
    id: string,
    patch: Partial<RouteRow>,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(patch);
    // 同 add: 若 patch 帶 client_id, 必須對齊到雲端真的存在的 id
    if ('client_id' in payload) {
      await alignPayloadClientId(payload);
    }
    // ⚠️ 必須 .select() 二次驗證 ——
    //   PostgREST 對「update 0 筆」(id 在雲端不存在) 回傳成功 + 無錯誤,
    //   但實際沒寫進任何東西 → 呼叫端以為成功, 雲端卻沒有這筆資料。
    const { data, error } = await supabase
      .from('cbl_routes')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) {
      console.warn(`[Supabase] cbl_routes.update 沒有匹配到任何列 (id=${id})`);
      return {
        success: false,
        error: `雲端找不到這筆資料 (cbl_routes/${id}), 請重新新增`,
      };
    }
    return { success: true };
  },

  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_routes').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },
};
