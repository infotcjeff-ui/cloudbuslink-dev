// Supabase 付款記錄 (cbl_payment_records) CRUD 操作
//
// 報表頁 (/settings/reports) 的資料來源 —— 支援多選批次動作:
//   標記已付 / 取消 / 發送繳費通知。
//
// localStorage 先寫 (UI 即時反映), 再 push Supabase (跨裝置可見)。
// RLS: 開發階段需有 dev_allow_all policy (anon 可讀寫), 上線前改寫 per-role policy。

import { camelize, snakify } from './supabase-case';
import { markSynced, unmarkSynced } from './storage';
import type { PaymentRecord } from './types';

export interface SupabasePaymentPayload {
  id: string;
  clientId?: string | null;
  period: string;
  studentId: string;
  studentName: string;
  parentId: string;
  parentName: string;
  parentPhone: string;
  amount: number;
  status: PaymentRecord['status'];
  method: PaymentRecord['method'];
  paidDate: string | null;
  dueDate: string;
  notes: string | null;
  paymentNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SupabasePaymentPatch = Partial<
  Omit<SupabasePaymentPayload, 'id' | 'createdAt'>
>;

const TABLE = 'cbl_payment_records';

export const supabasePayments = {
  async getAll(): Promise<{ data: PaymentRecord[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('due_date', { ascending: false });
    if (error) {
      console.error('[Supabase] Failed to fetch payment records:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) as PaymentRecord[] };
  },

  /** 雲端 → 本機合併 (雲端為準 + 保留未 push 的本機) */
  async syncToStorage(): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.getAll();
    // 表未建 (migration 未跑) → 不阻斷, 靜默跳過
    if (error) {
      const missing =
        error.includes('does not exist') || error.includes('Could not find');
      return { success: missing, error: missing ? undefined : error };
    }
    if (data.length === 0) return { success: true };
    try {
      const { STORAGE, mergeCloudRecords } = await import('./storage');
      mergeCloudRecords<PaymentRecord>(
        'payments',
        STORAGE.payments.getAll(),
        data,
        (rows) => STORAGE.payments.setAll(rows),
        {
          compare: (local, db) =>
            !!local.updatedAt && !!db.updatedAt && local.updatedAt > db.updatedAt,
        },
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cbl-payments-refresh'));
      }
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  },

  async add(
    row: SupabasePaymentPayload,
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');
    let payload: Record<string, unknown> = snakify({
      ...row,
      clientId: row.clientId || null,
    });
    // 欄位降級重試 (migration 未跑 → 欄位不存在 → 剔欄再試)
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert(payload)
        .select('id')
        .maybeSingle();
      if (!error) {
        if (!data) return { success: false, error: 'RLS 政策拒絕 (無寫入權限)' };
        markSynced('payments', data.id);
        return { success: true, id: data.id };
      }
      const col =
        /column "([^"]+)" of relation/i.exec(error.message)?.[1] ??
        /Could not find the '([^']+)' column/i.exec(error.message)?.[1];
      if (col && col in payload && attempt < 3) {
        const next = { ...payload };
        delete next[col];
        payload = next;
        continue;
      }
      console.error('[Supabase] Failed to add payment record:', error);
      return { success: false, error: error.message };
    }
    return { success: false, error: '新增付款記錄失敗' };
  },

  async update(
    id: string,
    patch: SupabasePaymentPatch,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const payload = snakify(patch) as Record<string, unknown>;
    if ('client_id' in payload && !payload.client_id) payload.client_id = null;
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[Supabase] Failed to update payment record:', error);
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
    markSynced('payments', id);
    return { success: true };
  },

  /**
   * 批次更新付款記錄 — 報表頁的多選動作 (標記已付 / 取消 / 發送通知)。
   *
   * 為什麼逐筆 update 而唔係一條 UPDATE ... IN (...):
   *   - 逐筆可以分辨哪一筆失敗 → 只報回真正成功的筆數。
   *   - 避免 PostgREST 一次送太多 payload 被拒。
   */
  async bulkUpdate(
    ids: string[],
    patch: SupabasePaymentPatch,
  ): Promise<{ success: boolean; updated: number; error?: string }> {
    if (ids.length === 0) return { success: true, updated: 0 };
    let updated = 0;
    let lastError: string | undefined;
    for (const id of ids) {
      const res = await this.update(id, patch);
      if (res.success) updated += 1;
      else lastError = res.error;
    }
    return { success: updated > 0, updated, error: lastError };
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[Supabase] Failed to delete payment record:', error);
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    unmarkSynced('payments', id);
    return { success: true };
  },
};
