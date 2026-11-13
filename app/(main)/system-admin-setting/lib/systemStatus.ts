'use client';

/**
 * system-admin-setting 的共用資料層
 *
 * 這個 console 只服務 system_admin (L4 開發者/平台維運),
 * 看的都是「跨機構」的全域狀態, 所以一律用 STORAGE.*.getAll()
 * (不像 /cbl-admin-setting 會依 clientId 過濾)。
 *
 * 內容分三塊:
 *   1. 環境 / 連線狀態 (Supabase + env vars)
 *   2. 本地快取筆數 (各表)
 *   3. 整合狀態 → API 密鑰狀態 (GPS 裝置配對 / Push / Email)
 */

import { STORAGE } from '@/lib/storage';
import { isSupabaseAvailable } from '@/lib/supabase-data';
import { resolveSystemConfig } from '@/lib/system-config';
import type { ConfigSource, GpsProvider } from '@/lib/types';

export type LocalCounts = {
    users: number;
  clients: number;
  companies: number;
  drivers: number;
  buses: number;
  students: number;
  parents: number;
  nannies: number;
  routes: number;
  trips: number;
  attendances: number;
  announcements: number;
};

export type SupabaseEnv = {
  url: string;
  anonLoaded: boolean;
  available: boolean;
  /** URL 的來源 (override / cloud / env / none) */
  urlSource: ConfigSource;
  /** Anon Key 的來源 */
  keySource: ConfigSource;
  /** 是否有本機覆寫 (用來提示「此設定只影響本機」) */
  hasOverride: boolean;
};

export type GpsStatus = {
  total: number;
  paired: number;
  provider: GpsProvider;
  providerSource: ConfigSource;
  /** 808 GPS (OneFleet) 登入帳號 */
  account: string;
  accountSource: ConfigSource;
  /** 808 GPS 登入密碼 (遮罩顯示, 只存本機) */
  password: string;
  passwordSource: ConfigSource;
  apiKey: string;
  apiKeySource: ConfigSource;
  endpoint: string;
  refreshSeconds: number;
};

export type SystemStatus = {
  env: SupabaseEnv;
  initialized: boolean;
  counts: LocalCounts;
  gps: GpsStatus;
};

/**
 * 讀 Supabase 相關環境變數狀態。
 *
 * 注意: 這裡讀的是「實際生效的設定」(三層解析: override → cloud → env),
 *       不是單純的 process.env — 因為 /system-admin-setting 允許 runtime 覆寫。
 *       絕不回傳 key 明文 (只回傳有沒有)。
 */
export function readSupabaseEnv(): SupabaseEnv {
  const resolved = resolveSystemConfig();
  return {
    url: resolved.supabase.url,
    anonLoaded: !!resolved.supabase.anonKey,
    available: isSupabaseAvailable(),
    urlSource: resolved.supabase.urlSource,
    keySource: resolved.supabase.keySource,
    hasOverride:
      resolved.supabase.urlSource === 'override' ||
      resolved.supabase.keySource === 'override',
  };
}

/** 讀本地快取各表筆數 */
export function readLocalCounts(): LocalCounts {
  if (typeof window === 'undefined') {
    return {
      users: 0, clients: 0, companies: 0, drivers: 0, buses: 0, students: 0,
      parents: 0, nannies: 0, routes: 0, trips: 0, attendances: 0, announcements: 0,
    };
  }
  return {
    users: STORAGE.users.getAll().length,
    clients: STORAGE.clients.getAll().length,
    companies: STORAGE.companies.getAll().length,
    drivers: STORAGE.drivers.getAll().length,
    buses: STORAGE.buses.getAll().length,
    students: STORAGE.students.getAll().length,
    parents: STORAGE.parents.getAll().length,
    nannies: STORAGE.nannies.getAll().length,
    routes: STORAGE.routes.getAll().length,
    trips: STORAGE.trips.getAll().length,
    attendances: STORAGE.attendances.getAll().length,
    announcements: STORAGE.announcements.getAll().length,
  };
}

/** 讀 GPS 裝置配對狀態 + GPS provider 設定 */
export function readGpsStatus(): GpsStatus {
  const resolved = resolveSystemConfig();
  if (typeof window === 'undefined') {
    return {
      total: 0,
      paired: 0,
      provider: resolved.gps.provider,
      providerSource: resolved.gps.providerSource,
      account: resolved.gps.account,
      accountSource: resolved.gps.accountSource,
      password: resolved.gps.password,
      passwordSource: resolved.gps.passwordSource,
      apiKey: resolved.gps.apiKey,
      apiKeySource: resolved.gps.apiKeySource,
      endpoint: resolved.gps.endpoint,
      refreshSeconds: resolved.gps.refreshSeconds,
    };
  }
  const buses = STORAGE.buses.getAll();
  return {
    total: buses.length,
    paired: buses.filter((b) => !!b.gpsDeviceId).length,
    provider: resolved.gps.provider,
    providerSource: resolved.gps.providerSource,
    account: resolved.gps.account,
    accountSource: resolved.gps.accountSource,
    password: resolved.gps.password,
    passwordSource: resolved.gps.passwordSource,
    apiKey: resolved.gps.apiKey,
    apiKeySource: resolved.gps.apiKeySource,
    endpoint: resolved.gps.endpoint,
    refreshSeconds: resolved.gps.refreshSeconds,
  };
}

/**
 * 一次蒐集全部狀態。
 * 註: 這是同步的 (localStorage + env), 所以直接在 render 階段呼叫即可,
 *     不需要 useState + useEffect (那會讓第一次 render 先吐全 0)。
 */
export function readSystemStatus(): SystemStatus {
  return {
    env: readSupabaseEnv(),
    initialized: typeof window !== 'undefined' ? STORAGE.isInitialized() : false,
    counts: readLocalCounts(),
    gps: readGpsStatus(),
  };
}

/** 本地表的中文名稱 + 對應 key (給「本地快取」表格用) */
export const LOCAL_TABLES: { key: keyof LocalCounts; label: string }[] = [
  { key: 'users', label: '用戶' },
  { key: 'clients', label: '學校 / 機構' },
  { key: 'companies', label: '所屬機構 / 公司' },
  { key: 'drivers', label: '司機' },
  { key: 'buses', label: '校巴' },
  { key: 'students', label: '學生' },
  { key: 'parents', label: '家長' },
  { key: 'nannies', label: '保姆' },
  { key: 'routes', label: '路線' },
  { key: 'trips', label: '班次' },
  { key: 'attendances', label: '打卡記錄' },
  { key: 'announcements', label: '公告' },
];
