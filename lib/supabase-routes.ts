// Supabase route CRUD wrappers (沿用 lib/supabase-buses.ts 模式)

import { camelize, snakify } from './supabase-case';

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
    const { error } = await supabase.from('cbl_routes').insert(snakify(route));
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async update(
    id: string,
    patch: Partial<RouteRow>,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase
      .from('cbl_routes')
      .update(snakify(patch))
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('cbl_routes').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },
};
