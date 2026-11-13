// Supabase 異常回報 (cbl_incident_reports) CRUD 操作
//
// 保姆主頁 popup「確定送出」即寫一筆; CBL Admin Setting 讀同一來源顯示。
// localStorage 先寫 (UI 即時反映), 再 push Supabase (跨裝置可見)。
// RLS: 開發階段需有 dev_allow_all policy (anon 可讀寫), 上線前改寫 per-role policy。

import { camelize, snakify } from './supabase-case';
import { markSynced, unmarkSynced } from './storage';
import type { IncidentReport } from './types';

export interface SupabaseIncidentPayload {
  id: string;
  clientId?: string | null;
  nannyId: string;
  reporterName: string;
  reporterPhone: string;
  adminId: string;
  adminName: string;
  adminPhone: string;
  kind: IncidentReport['kind'];
  kindLabel: string;
  tripId: string;
  tripLabel: string;
  tripDate: string;
  status: IncidentReport['status'];
  createdAt: string;
  updatedAt: string;
}

export type SupabaseIncidentPatch = Partial<
  Omit<SupabaseIncidentPayload, 'id' | 'createdAt'>
>;

export const supabaseIncidents = {
  async getAll(): Promise<{ data: IncidentReport[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_incident_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[Supabase] Failed to fetch incidents:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) as IncidentReport[] };
  },

  /** 雲端 → 本機合併 (雲端為準 + 保留未 push 的本機) */
  async syncToStorage(): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.getAll();
    // 表未建 (migration 0022 未跑) → 不阻斷, 靜默跳過
    if (error) return { success: !!error.includes('does not exist') || !!error.includes('Could not find'), error };
    if (data.length === 0) return { success: true };
    try {
      const { STORAGE, mergeCloudRecords } = await import('./storage');
      mergeCloudRecords<IncidentReport>(
        'incidents',
        STORAGE.incidents.getAll(),
        data,
        (rows) => STORAGE.incidents.setAll(rows),
        {
          compare: (local, db) =>
            !!local.updatedAt && !!db.updatedAt && local.updatedAt > db.updatedAt,
        },
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cbl-incidents-refresh'));
      }
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  },

  async add(
    row: SupabaseIncidentPayload,
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');
    let payload: Record<string, unknown> = snakify({
      ...row,
      clientId: row.clientId || null,
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('cbl_incident_reports')
        .insert(payload)
        .select('id')
        .maybeSingle();
      if (!error) {
        if (!data) return { success: false, error: 'RLS 政策拒絕 (無寫入權限)' };
        markSynced('incidents', data.id);
        return { success: true, id: data.id };
      }
      // 42703 / PGRST204 = 欄位不存在 (migration 未跑) → 剔欄重試
      const col = /column "([^"]+)" of relation/i.exec(error.message)?.[1]
        ?? /Could not find the '([^']+)' column/i.exec(error.message)?.[1];
      if (col && col in payload && attempt < 3) {
        const next = { ...payload };
        delete next[col];
        payload = next;
        continue;
      }
      console.error('[Supabase] Failed to add incident:', error);
      return { success: false, error: error.message };
    }
    return { success: false, error: '新增異常回報失敗' };
  },

  async update(
    id: string,
    patch: SupabaseIncidentPatch,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(patch) as Record<string, unknown>;
    if ('client_id' in payload && !payload.client_id) payload.client_id = null;
    const { data, error } = await supabase
      .from('cbl_incident_reports')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[Supabase] Failed to update incident:', error);
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
    markSynced('incidents', id);
    return { success: true };
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_incident_reports')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[Supabase] Failed to delete incident:', error);
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    unmarkSynced('incidents', id);
    return { success: true };
  },
};
