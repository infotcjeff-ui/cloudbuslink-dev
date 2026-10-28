'use client';

/**
 * 機構 (Client) 頁面的類型定義
 *
 * 「機構」= cbl_clients 表的一筆 = 一個 tenant (學校 / 公司)。
 * 學生、家長、校巴、司機、保姆、班次、公告全部掛在某個 client_id 底下;
 * `client` 角色的登入帳號也綁定機構, 只能看到自己機構的資料。
 * `super_admin` 不綁機構 (跨機構)。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/clients/ 內使用。
 */

import type { Client } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Tab                                                                        */
/* -------------------------------------------------------------------------- */

/** 切換分頁依機構狀態 */
export type ClientTab = 'all' | 'active' | 'inactive';

export const CLIENT_TAB_LABELS: Record<ClientTab, string> = {
  all: '全部',
  active: '啟用中',
  inactive: '已停用',
};

export const CLIENT_TAB_ACCENT: Record<
  ClientTab,
  { header: 'primary' | 'success' | 'neutral'; pill: 'primary' | 'success' | 'neutral' }
> = {
  all: { header: 'primary', pill: 'primary' },
  active: { header: 'success', pill: 'success' },
  inactive: { header: 'neutral', pill: 'neutral' },
};

/* -------------------------------------------------------------------------- */
/*  Form state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 機構表單的初始狀態。
 *
 * 對應 cbl_clients 欄位:
 *   name / email / phone / address / logo / primaryColor / academicYear / status
 *
 * id 由父層產生 (client-<隨機>) — 因為 id 是 text primary key, 不是 uuid。
 */
export interface ClientFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string;
  primaryColor: string;
  academicYear: string;
  status: 'active' | 'inactive';
}

/** 空表單 (add mode 預設) */
export const EMPTY_CLIENT_FORM: ClientFormState = {
  name: '',
  email: '',
  phone: '',
  address: '',
  logo: '',
  primaryColor: '#3b82f6',
  academicYear: '2627',
  status: 'active',
};

/** 從既有 Client 物件轉成表單狀態 */
export function clientToFormState(c: Client): ClientFormState {
  return {
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    logo: c.logo ?? '',
    primaryColor: c.primaryColor || '#3b82f6',
    academicYear: c.academicYear || '2627',
    status: c.status,
  };
}

/* -------------------------------------------------------------------------- */
/*  Console props                                                               */
/* -------------------------------------------------------------------------- */

export interface ClientsConsoleProps {
  clients: Client[];
  /** 各機構底下的登入帳號數 — 給表格「帳號」欄位顯示 */
  userCountByClient: Record<string, number>;
  isSaving: boolean;
}
