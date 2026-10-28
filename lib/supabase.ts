import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * lib/supabase.ts — Supabase client (支援 runtime 設定覆寫)
 *
 * 為什麼要改:
 *   原本是 `process.env.NEXT_PUBLIC_*` 直接吃 + module 載入時直接 throw,
 *   這讓 /system-admin-setting 無法改設定 (改 .env.local 要 rebuild + restart)。
 *
 * 現在的行為:
 *   - 設定來源: lib/system-config.ts 的三層解析 (override → cloud → env)
 *   - client 依 (url, key) memo — 設定沒變就重用同一個 instance
 *   - 設定變了 → 下一次取用就拿到新 client (不需 reload)
 *
 * 相容性:
 *   保留 `export const supabase` 這個名稱, 60+ 個既有呼叫點
 *   (`const { supabase } = await import('./supabase')`) 完全不用改。
 *   用 Proxy 委派到「當前」client, 所以設定改了就自動跟著改。
 *
 * 錯誤處理:
 *   原本缺少 env 就 `throw`, 會讓整個 app 白屏。
 *   現在改成「client 為 null + 呼叫端拿到明確錯誤」, 由 isSupabaseAvailable() 把關。
 */

import { resolveSystemConfig } from './system-config';

type SupabaseClientLike = SupabaseClient<any, any, any>;

let cachedClient: SupabaseClientLike | null = null;
let cachedKey = '';

/** 目前的有效設定 (每次呼叫都重新解析, 這樣改了設定立即生效) */
function currentConfig() {
  return resolveSystemConfig();
}

/**
 * 取得當前的 Supabase client。
 *
 * @returns 設定不足時回傳 null (不要 throw, 讓呼叫端自己判斷)
 */
export function getSupabaseClient(): SupabaseClientLike | null {
  const { supabase } = currentConfig();
  if (!supabase.url || !supabase.anonKey) return null;

  const key = `${supabase.url}|${supabase.anonKey}`;
  if (cachedClient && cachedKey === key) return cachedClient;

  cachedClient = createClient(supabase.url, supabase.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  cachedKey = key;
  return cachedClient;
}

/** 強制清掉 memo — 設定變更時呼叫 (也可手動重置) */
export function resetSupabaseClient(): void {
  cachedClient = null;
  cachedKey = '';
}

// 檢查 env / 設定是否足以建立連線
const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 相容用 export。
 *
 * ⚠️ 這是一個 Proxy — 每次屬性存取都會 resolve 當前的 client。
 *    如果設定不足, 呼叫 `.from(...)` 會 throw 一個明確錯誤 (而不是 undefined 的
 *    TypeError), 讓除錯時看得到原因。
 */
export const supabase = new Proxy({} as SupabaseClientLike, {
  get(_target, prop) {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        'Supabase 尚未設定 — 請在 /system-admin-setting/connection 設定 Project URL 與 Anon Key, ' +
          '或於 .env.local 補上 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。',
      );
    }
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as SupabaseClientLike;

export default supabase;

/**
 * 環境變數層的狀態 (給 /system-admin-setting/connection 顯示「來源」用)。
 *
 * 刻意與 resolveSystemConfig() 分開:
 *   - 這裡只回答「.env.local 有沒有設定」
 *   - resolveSystemConfig() 回答「實際生效的是哪一層」
 */
export const envLayerStatus = {
  url: envSupabaseUrl ?? '',
  anonLoaded: !!envSupabaseAnonKey,
};
