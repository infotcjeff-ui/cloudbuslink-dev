'use client';

/**
 * User 頁面的類型定義
 *
 * 「用戶 (/cbl-admin-setting/user)」頁面是透過 switch button
 * 把某些功能模組的權限給予其他可登入 user 的管理頁 — 不是登入者本身的權限設定。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/user/ 內使用。
 */

import type { User, UserRole } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Tab                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 切換分頁依使用者角色 — UI 顯示用
 *
 * 注意: 沒有 'driver' — 司機是獨立的 entity (cbl_drivers), 不進 cbl_users,
 * 也不透過 /login 登入。所以這裡沒有司機分頁。
 */
export type UserTab = 'all' | 'system_admin' | 'super_admin' | 'client' | 'nanny' | 'parent';

/** 對應顯示文字 (page chrome 用) */
export const USER_TAB_LABELS: Record<UserTab, string> = {
  all: '全部',
  system_admin: '系統開發者',
  super_admin: '系統管理員',
  client: '客戶管理員',
  nanny: '保姆',
  parent: '家長',
};

/** 對應語意色 */
export const USER_TAB_ACCENT: Record<
  UserTab,
  { header: 'primary' | 'violet' | 'warning' | 'success' | 'danger' | 'neutral'; pill: 'primary' | 'violet' | 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  all: { header: 'primary', pill: 'primary' },
  system_admin: { header: 'danger', pill: 'danger' },
  super_admin: { header: 'violet', pill: 'violet' },
  client: { header: 'primary', pill: 'primary' },
  nanny: { header: 'success', pill: 'success' },
  parent: { header: 'warning', pill: 'warning' },
};

/* -------------------------------------------------------------------------- */
/*  Feature keys (可分配的「功能模組」)                                           */
/* -------------------------------------------------------------------------- */

/**
 * 一個 user 可被授予的「功能」清單。
 * 規則: 加新功能時, 同時在 FEATURE_META 加一筆 + UserFeatureModal 會自動生成開關。
 */
export type FeatureKey =
  | 'view_trips'      // 查看班次 / 行程
  | 'checkin'         // 打卡
  | 'view_payments'   // 查看付款記錄
  | 'manage_students' // 管理學生資料
  | 'manage_parents'  // 管理家長資料
  | 'manage_buses'    // 管理校巴
  | 'manage_trips'    // 管理班次 (新增 / 編輯)
  | 'manage_drivers'  // 管理司機
  | 'manage_nannies'  // 管理保姆
  | 'export_reports'  // 匯出報表
  | 'post_announcements' // 發布公告
  | 'manage_users';   // 管理其他 user 的功能權限 (高權限)

export const FEATURE_KEYS: FeatureKey[] = [
  'view_trips',
  'checkin',
  'view_payments',
  'manage_students',
  'manage_parents',
  'manage_buses',
  'manage_trips',
  'manage_drivers',
  'manage_nannies',
  'export_reports',
  'post_announcements',
  'manage_users',
];

/** 功能的中文 label / 圖示 / 說明 — 在 modal 中用 */
export interface FeatureMeta {
  label: string;
  desc: string;
  iconKey:
    | 'bus' | 'check' | 'cash' | 'cap' | 'family' | 'wrench'
    | 'route' | 'driver' | 'heart' | 'chart' | 'megaphone' | 'shield';
}

export const FEATURE_META: Record<FeatureKey, FeatureMeta> = {
  view_trips:         { label: '查看班次',     desc: '可檢視校巴路線、班次、站點',     iconKey: 'route' },
  checkin:            { label: '打卡',         desc: '可執行學生接送打卡',             iconKey: 'check' },
  view_payments:      { label: '查看付款',     desc: '可查看家長付款記錄與狀態',       iconKey: 'cash' },
  manage_students:    { label: '管理學生',     desc: '新增 / 編輯 / 刪除學生資料',     iconKey: 'cap' },
  manage_parents:     { label: '管理家長',     desc: '新增 / 編輯 / 刪除家長資料',     iconKey: 'family' },
  manage_buses:       { label: '管理校巴',     desc: '編輯校巴資料 / 維護狀態',        iconKey: 'bus' },
  manage_trips:       { label: '管理班次',     desc: '新增 / 編輯 / 刪除班次與路線',   iconKey: 'wrench' },
  manage_drivers:     { label: '管理司機',     desc: '新增 / 編輯 / 刪除司機',         iconKey: 'driver' },
  manage_nannies:     { label: '管理保姆',     desc: '新增 / 編輯 / 刪除保姆',         iconKey: 'heart' },
  export_reports:     { label: '匯出報表',     desc: '可下載 Excel 出席統計',          iconKey: 'chart' },
  post_announcements: { label: '發布公告',     desc: '可建立與編輯機構公告',           iconKey: 'megaphone' },
  manage_users:       { label: '管理用戶權限', desc: '可調整其他用戶的功能開關',       iconKey: 'shield' },
};

/** 依角色預設的開關 (新 user / 沒設定過的 user 套用這份預設) */
export const ROLE_DEFAULT_FEATURES: Record<UserRole, FeatureKey[]> = {
  system_admin: [...FEATURE_KEYS], // 開發者預設全開
  super_admin: [...FEATURE_KEYS], // 管理員預設全開
  client:      ['view_trips', 'view_payments', 'manage_students', 'manage_parents', 'manage_buses', 'manage_trips', 'manage_drivers', 'manage_nannies', 'export_reports', 'post_announcements', 'manage_users'],
  parent:      ['view_trips', 'view_payments'],
  nanny:       ['view_trips', 'checkin'],
};

/* -------------------------------------------------------------------------- */
/*  Role metadata (console + modal 共用)                                        */
/* -------------------------------------------------------------------------- */

/** 角色 → 中文標籤 */
export const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: '系統開發者',
  super_admin: '系統管理員',
  client: '客戶管理員',
  parent: '家長',
  nanny: '保姆',
};

/** 角色 → pill tone (與 sidebar / 其他頁面同色票) */
export const ROLE_TONES: Record<UserRole, 'violet' | 'primary' | 'warning' | 'success' | 'danger'> = {
  system_admin: 'danger',
  super_admin: 'violet',
  client: 'primary',
  parent: 'warning',
  nanny: 'success',
};

/** 角色 → 說明 (新增帳號 modal 用) */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  system_admin: '開發者最高權限, 唯一能進 System Admin Setting 看敏感資料',
  super_admin: '營運最高權限, 可管理所有機構與所有用戶',
  client: '機構 (學校 / 公司) 管理員, 僅能管理自己機構的資料',
  parent: '家長, 僅能查看自己綁定的子女資料',
  nanny: '保姆, 可執行隨車接送打卡',
};

/* -------------------------------------------------------------------------- */
/*  Permission matrix (storage shape)                                            */
/* -------------------------------------------------------------------------- */

/** User 對各功能的開啟狀態 — key = user.id */
export type UserFeatureMap = Partial<Record<FeatureKey, boolean>>;

/** 全域權限矩陣 (LocalStorage 內存一份, 供 supabase 之後接 cbl_user_permissions 表) */
export type FeaturePermissionMatrix = Record<string /* userId */, UserFeatureMap>;

/* -------------------------------------------------------------------------- */
/*  Form / Modal state                                                          */
/* -------------------------------------------------------------------------- */

/** FeatureModal 的初始狀態 */
export interface UserFeatureFormState {
  userId: string;
  /** 對應 user 角色, 僅顯示 (不可改) */
  role: UserRole;
  /** 此 user 已授予的功能 — 完整快照, 含未勾 false */
  features: UserFeatureMap;
}

/** 為指定 role 開新 modal 時的初始 state */
export function emptyFeatureForm(userId: string, role: UserRole): UserFeatureFormState {
  const seed = ROLE_DEFAULT_FEATURES[role] ?? [];
  const features: UserFeatureMap = {};
  for (const k of FEATURE_KEYS) features[k] = seed.includes(k);
  return { userId, role, features };
}

/* -------------------------------------------------------------------------- */
/*  Account form (新增 / 編輯登入帳號)                                          */
/* -------------------------------------------------------------------------- */

/**
 * 帳號表單的初始狀態。
 *
 * 對應 cbl_users 欄位:
 *   name / phone (登入帳號) / password / email / role / clientId / status
 *
 * 密碼: 目前系統是明碼儲存 (見 supabase/migrations/0001_init.sql 的 ⚠️ 註記),
 * 這裡沿用現況; 上線前要改 hash。
 */
export interface UserAccountFormState {
  name: string;
  /** 登入帳號 — super_admin 允許非數字 (例如 admin), 其他角色必須 8 位數字 */
  phone: string;
  password: string;
  email: string;
  role: UserRole;
  /** 所屬學校 (cbl_clients = 學校表) — 選填，不限角色 */
  clientId: string | null;
  /** 所屬機構/公司 (cbl_companies) — 選填，不限角色 */
  companyId: string | null;
  status: 'active' | 'inactive';
}

/** 空表單 (add mode 預設) */
export const EMPTY_ACCOUNT_FORM: UserAccountFormState = {
  name: '',
  phone: '',
  password: '',
  email: '',
  role: 'client',
  clientId: null,
  companyId: null,
  status: 'active',
};

/* -------------------------------------------------------------------------- */
/*  Console props                                                               */
/* -------------------------------------------------------------------------- */

export interface UsersConsoleContext {
  users: User[];
}