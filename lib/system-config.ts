/**
 * lib/system-config.ts — 平台層設定的三層解析層
 *
 * 目的:
 *   /system-admin-setting 讓管理員可以改 Supabase / GPS 的 key & value。
 *   但 Next.js 的 NEXT_PUBLIC_* 是「建置時 inline」, 改 .env.local 要重啟 build,
 *   所以必須有一層 runtime override 讓設定可以即時生效。
 *
 * 三層優先序 (高 → 低):
 *   1. override — 裝置層覆寫 (localStorage: cbl_system_config)
 *                 可含機密 (gps.apiKey), 永不上雲
 *   2. cloud    — 平台層設定 (Supabase: cbl_system_config 單列表)
 *                 跨裝置一致, 只存非機密
 *   3. env      — 建置時環境變數 (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)
 *
 * 為什麼分成 3 層:
 *   - override 讓「測試新 project」不必重建部署
 *   - cloud 讓「正式切換 project」一次改完, 全員生效
 *   - env 是保底, 確保兩者都沒設定時仍能用 .env.local 跑
 *
 * 事件:
 *   寫入後派發 'cbl-system-config-refresh', 讓 console 各頁即時重讀。
 */

import type {
  ConfigSource,
  GpsProvider,
  ResolvedSystemConfig,
  SystemConfigCloud,
  SystemConfigOverride,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Storage keys                                                               */
/* -------------------------------------------------------------------------- */

const OVERRIDE_KEY = 'cbl_system_config';
const CLOUD_CACHE_KEY = 'cbl_system_config_cloud';

/** 設定變更事件 (寫入後派發) */
export const SYSTEM_CONFIG_EVENT = 'cbl-system-config-refresh';

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const GPS_PROVIDER_LABELS: Record<GpsProvider, string> = {
  onefleet808: '808 GPS (OneFleet)',
  mapbox: 'Mapbox',
  google: 'Google Maps',
  custom: '自訂 Endpoint',
};

/** 808 GPS (OneFleet) 預設服務端點 — 文件見 808 GPS/Web Interface Documentation.html */
export const DEFAULT_ONEFLEET_ENDPOINT = 'https://console.onefleet.hk';

/** 舊資料相容: 移除前的 'simulated' 一律視為 808 GPS */
function normalizeProvider(p: string): GpsProvider {
  if ((p as string) === 'simulated') return 'onefleet808';
  if (p === 'onefleet808' || p === 'mapbox' || p === 'google' || p === 'custom') {
    return p as GpsProvider;
  }
  return 'onefleet808';
}

const DEFAULT_REFRESH_SECONDS = 2;

/* -------------------------------------------------------------------------- */
/*  low-level storage                                                          */
/* -------------------------------------------------------------------------- */

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[SystemConfig] Failed to read ${key}:`, e);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[SystemConfig] Failed to write ${key}:`, e);
  }
}

function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`[SystemConfig] Failed to remove ${key}:`, e);
  }
}

/* -------------------------------------------------------------------------- */
/*  Env layer                                                                  */
/* -------------------------------------------------------------------------- */

/** 建置時環境變數 (保底層) */
function readEnvLayer(): SystemConfigCloud {
  return {
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
    },
    gps: {
      provider: null,
      account: null,
      endpoint: null,
      refreshSeconds: null,
    },
    updatedAt: '',
    updatedBy: '',
  };
}

/* -------------------------------------------------------------------------- */
/*  Override layer (裝置層, 含機密)                                            */
/* -------------------------------------------------------------------------- */

/** 讀裝置層覆寫 (可能為 null) */
export function getOverride(): SystemConfigOverride | null {
  return readJson<SystemConfigOverride>(OVERRIDE_KEY);
}

/**
 * 寫裝置層覆寫。
 * 回傳「乾淨」的版本 — 呼叫端要拿它去上雲, 必須先把 apiKey 拿掉。
 */
export function setOverride(next: SystemConfigOverride): void {
  writeJson(OVERRIDE_KEY, next);
  notifyChange();
}

/** 移除整層裝置覆寫 (全部還原預設) */
export function clearOverride(): void {
  removeKey(OVERRIDE_KEY);
  notifyChange();
}

/**
 * 只移除裝置層覆寫中的某個欄位 (「還原預設」按鈕用)。
 *
 * 支援的路徑:
 *   'supabase.url' | 'supabase.anonKey' | 'gps.provider' | 'gps.account'
 *   'gps.password' | 'gps.apiKey' | 'gps.endpoint' | 'gps.refreshSeconds'
 */
export function clearOverrideField(path: OverrideFieldPath): void {
  const cur = getOverride();
  if (!cur) return;

  const next: SystemConfigOverride = {
    ...cur,
    supabase: { ...cur.supabase },
    gps: { ...cur.gps },
  };

  switch (path) {
    case 'supabase.url':
      next.supabase.url = null;
      break;
    case 'supabase.anonKey':
      next.supabase.anonKey = null;
      break;
    case 'gps.provider':
      next.gps.provider = null;
      break;
    case 'gps.account':
      next.gps.account = null;
      break;
    case 'gps.password':
      next.gps.password = null;
      break;
    case 'gps.apiKey':
      next.gps.apiKey = null;
      break;
    case 'gps.endpoint':
      next.gps.endpoint = null;
      break;
    case 'gps.refreshSeconds':
      next.gps.refreshSeconds = null;
      break;
  }

  next.updatedAt = new Date().toISOString();
  writeJson(OVERRIDE_KEY, next);
  notifyChange();
}

export type OverrideFieldPath =
  | 'supabase.url'
  | 'supabase.anonKey'
  | 'gps.provider'
  | 'gps.account'
  | 'gps.password'
  | 'gps.apiKey'
  | 'gps.endpoint'
  | 'gps.refreshSeconds';

/* -------------------------------------------------------------------------- */
/*  Cloud layer (平台層, 只存非機密)                                          */
/* -------------------------------------------------------------------------- */

/** 讀雲端設定的本機快取 (UI 立即可用, 不必等網路) */
export function getCloudCache(): SystemConfigCloud | null {
  return readJson<SystemConfigCloud>(CLOUD_CACHE_KEY);
}

/**
 * 寫雲端設定的本機快取。
 *
 * 會派發變更事件 → 各 console 頁面即時重讀 (例如雲端切換了 project,
 * 連線狀態要立刻反映)。
 */
export function setCloudCache(next: SystemConfigCloud): void {
  writeJson(CLOUD_CACHE_KEY, next);
  notifyChange();
}

/** 清除雲端設定的本機快取 */
export function clearCloudCache(): void {
  removeKey(CLOUD_CACHE_KEY);
}

/* -------------------------------------------------------------------------- */
/*  Resolve — 三層合併                                                        */
/* -------------------------------------------------------------------------- */

function pick<T>(
  overrideValue: T | null | undefined,
  cloudValue: T | null | undefined,
  envValue: T | null | undefined,
): { value: T; source: ConfigSource } {
  if (overrideValue !== null && overrideValue !== undefined && overrideValue !== ('' as unknown as T)) {
    return { value: overrideValue, source: 'override' };
  }
  if (cloudValue !== null && cloudValue !== undefined && cloudValue !== ('' as unknown as T)) {
    return { value: cloudValue, source: 'cloud' };
  }
  if (envValue !== null && envValue !== undefined && envValue !== ('' as unknown as T)) {
    return { value: envValue, source: 'env' };
  }
  return { value: ('' as unknown as T), source: 'none' };
}

/**
 * 解析最終生效的設定。
 *
 * @param cloud 雲端設定 (通常是 getCloudCache() 的結果, 可為 null)
 */
export function resolveSystemConfig(cloud?: SystemConfigCloud | null): ResolvedSystemConfig {
  const env = readEnvLayer();
  const ov = getOverride();
  const cl = cloud ?? getCloudCache();

  const url = pick(ov?.supabase.url, cl?.supabase.url, env.supabase.url);
  const key = pick(ov?.supabase.anonKey, cl?.supabase.anonKey, env.supabase.anonKey);
  const providerRaw = pick<string>(
    ov?.gps.provider as string | null | undefined,
    cl?.gps.provider as string | null | undefined,
    null,
  );
  const provider: { value: GpsProvider; source: ConfigSource } = {
    value: normalizeProvider(providerRaw.value || 'onefleet808'),
    source: providerRaw.source === 'none' ? 'default' : providerRaw.source,
  };
  const account = pick(ov?.gps.account, cl?.gps.account, null);
  const password = pick((ov as SystemConfigOverride | null)?.gps.password, null, null);
  const apiKey = pick(ov?.gps.apiKey, null, null);
  const endpointRaw = pick(ov?.gps.endpoint, cl?.gps.endpoint, null);
  const endpoint: { value: string; source: ConfigSource } =
    endpointRaw.value
      ? endpointRaw
      : provider.value === 'onefleet808'
        ? { value: DEFAULT_ONEFLEET_ENDPOINT, source: 'default' }
        : { value: '', source: 'none' };
  const refresh = pick<number>(
    ov?.gps.refreshSeconds,
    cl?.gps.refreshSeconds,
    null,
  );

  return {
    supabase: {
      url: url.value,
      anonKey: key.value,
      urlSource: url.source,
      keySource: key.source,
    },
    gps: {
      provider: provider.value,
      account: account.value,
      password: password.value,
      apiKey: apiKey.value,
      endpoint: endpoint.value,
      refreshSeconds: refresh.value || DEFAULT_REFRESH_SECONDS,
      providerSource: provider.source,
      accountSource: account.source,
      passwordSource: password.source,
      apiKeySource: apiKey.source,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Sanitize — 剝掉機密欄位 (上雲前必經)                                       */
/* -------------------------------------------------------------------------- */

/**
 * 剝掉機密欄位, 只留可上雲的部分。
 *
 * ⚠️ 這是安全邊界的守門員 — 所有要寫進 Supabase 的 payload 都必須先過這裡。
 * 機密欄位: gps.password / gps.apiKey → 只存本機, 永不上雲。
 */
export function sanitizeForCloud(src: SystemConfigOverride | SystemConfigCloud): SystemConfigCloud {
  return {
    supabase: {
      url: src.supabase.url ?? null,
      anonKey: src.supabase.anonKey ?? null,
    },
    gps: {
      provider: src.gps.provider ?? null,
      account: src.gps.account ?? null,
      endpoint: src.gps.endpoint ?? null,
      refreshSeconds: src.gps.refreshSeconds ?? null,
    },
    updatedAt: src.updatedAt,
    updatedBy: src.updatedBy,
  };
}

/* -------------------------------------------------------------------------- */
/*  Events                                                                     */
/* -------------------------------------------------------------------------- */

function notifyChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYSTEM_CONFIG_EVENT));
}

/** 訂閱設定變更 (回傳 unsubscribe) */
export function subscribeSystemConfig(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(SYSTEM_CONFIG_EVENT, handler);
  return () => window.removeEventListener(SYSTEM_CONFIG_EVENT, handler);
}

/* -------------------------------------------------------------------------- */
/*  Connection test                                                            */
/* -------------------------------------------------------------------------- */

export type ConnectionTestResult =
  | { ok: true; latencyMs: number; message: string }
  | { ok: false; latencyMs: number; message: string };

/**
 * 測試 Supabase 連線。
 *
 * 用「臨時 client」而不是改全域 client, 這樣測試失敗不會污染正式設定。
 * key 放在 Authorization header (supabase-js 預設行為), 不會出現在 URL / log。
 */
export async function testSupabaseConnection(
  url: string,
  anonKey: string,
): Promise<ConnectionTestResult> {
  if (!url.trim()) {
    return { ok: false, latencyMs: 0, message: '請先填寫 Project URL' };
  }
  if (!anonKey.trim()) {
    return { ok: false, latencyMs: 0, message: '請先填寫 Anon Key' };
  }
  if (!/^https?:\/\//i.test(url.trim())) {
    return {
      ok: false,
      latencyMs: 0,
      message: 'URL 格式錯誤 — 需以 https:// 開頭',
    };
  }

  const started = Date.now();
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url.trim(), anonKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 打一個最輕量的 PostgREST 請求 — 有回應即代表 URL + key 有效
    const { error } = await client
      .from('cbl_clients')
      .select('id')
      .limit(1)
      .maybeSingle();

    const latencyMs = Date.now() - started;

    if (error) {
      return {
        ok: false,
        latencyMs,
        message: `連線失敗: ${error.message}`,
      };
    }

    return {
      ok: true,
      latencyMs,
      message: `連線成功 · 延遲 ${latencyMs}ms`,
    };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs, message: `連線失敗: ${msg}` };
  }
}
