// Supabase 平台層設定 (cbl_system_config) 讀寫
//
// 為什麼需要這個檔案:
// - /system-admin-setting 讓 system_admin 改 Supabase / GPS 的 key & value
// - 只寫 localStorage 的話, 換一台裝置就看不到設定 → 需要一份平台層的共用設定
// - 但 secret (gps.apiKey) 絕不能上雲 (anon key 可讀) → 只有非機密欄位能進 DB
//
// 表結構 (supabase/migrations/0008_system_config.sql):
//   id           text primary key  — 固定 'global' (平台只有一份設定)
//   data         jsonb            — { supabase: {...}, gps: {...} } 不含任何 secret
//   updated_at   timestamptz
//
// RLS: 開發階段與其他 cbl_ 表一致 (dev_allow_all, anon 可讀寫),
// 上線前要移除並改寫 per-role policy (只允許 system_admin)。

import { camelize, snakify } from './supabase-case';
import type { SystemConfigCloud } from './types';
import { sanitizeForCloud } from './system-config';

const TABLE = 'cbl_system_config';
const ROW_ID = 'global';

export const supabaseSystemConfig = {
  /**
   * 讀平台層設定。
   *
   * 找不到 / 失敗 → 回傳 null (呼叫端退回 env + override)。
   */
  async get(): Promise<{ data: SystemConfigCloud | null; error?: string }> {
    try {
      const { supabase } = await import('./supabase');
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', ROW_ID)
        .maybeSingle();

      if (error) {
        // 第一次用 (migration 還沒跑) → 靜默降級, 不吵使用者
        console.warn('[Supabase] Failed to fetch system config:', error.message);
        return { data: null, error: error.message };
      }
      if (!data) return { data: null };

      const row = camelize(data) as {
        data?: SystemConfigCloud;
        updatedAt?: string;
      };
      const payload = row.data ?? (row as unknown as SystemConfigCloud);
      if (!payload || !payload.supabase) return { data: null };

      return {
        data: {
          supabase: {
            url: payload.supabase.url ?? null,
            anonKey: payload.supabase.anonKey ?? null,
          },
          gps: {
            provider: payload.gps?.provider ?? null,
            endpoint: payload.gps?.endpoint ?? null,
            refreshSeconds: payload.gps?.refreshSeconds ?? null,
          },
          updatedAt: payload.updatedAt ?? row.updatedAt ?? '',
          updatedBy: payload.updatedBy ?? '',
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Supabase] system config fetch failed:', msg);
      return { data: null, error: msg };
    }
  },

  /**
   * 寫平台層設定。
   *
   * ⚠️ 進來的一定會先過 sanitizeForCloud() — 剝掉 gps.apiKey。
   * 這是安全邊界的守門員, 不要在這裡 bypass。
   */
  async set(
    input: SystemConfigCloud | { supabase: SystemConfigCloud['supabase']; gps: SystemConfigCloud['gps']; updatedAt?: string; updatedBy?: string },
  ): Promise<{ success: boolean; error?: string }> {
    const clean = sanitizeForCloud({
      ...input,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      updatedBy: input.updatedBy ?? '',
    } as Parameters<typeof sanitizeForCloud>[0]);

    try {
      const { supabase } = await import('./supabase');
      const payload = snakify({
        id: ROW_ID,
        data: clean,
        updatedAt: clean.updatedAt,
      });

      const { error } = await supabase
        .from(TABLE)
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.error('[Supabase] Failed to save system config:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Supabase] system config save failed:', msg);
      return { success: false, error: msg };
    }
  },

  /** 刪除平台層設定 (讓所有裝置退回 env / override) */
  async clear(): Promise<{ success: boolean; error?: string }> {
    try {
      const { supabase } = await import('./supabase');
      const { error } = await supabase.from(TABLE).delete().eq('id', ROW_ID);
      if (error) {
        console.error('[Supabase] Failed to clear system config:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Supabase] system config clear failed:', msg);
      return { success: false, error: msg };
    }
  },
};
