'use client';

/**
 * 機構/公司 (Company) 頁面的類型定義
 *
 * 「機構」= cbl_companies 表的一筆 = 公司/營運單位 (選填層)。
 *
 * 與「學校」(cbl_clients, 見 ../clients/types.ts) 的分工:
 * - 學校 (clientId) = 資料隔離根, 學生/家長/校巴/司機/保姆/班次/路線/公告/接送記錄都掛這裡
 * - 機構 (companyId) = 公司層, 僅保姆 / 司機 / 校巴 / 登入帳號可選配 (非必填)
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/companies/ 內使用。
 */

import type { Company } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Tab                                                                        */
/* -------------------------------------------------------------------------- */

/** 切換分頁依機構狀態 */
export type CompanyTab = 'all' | 'active' | 'inactive';

export const COMPANY_TAB_LABELS: Record<CompanyTab, string> = {
  all: '全部',
  active: '啟用中',
  inactive: '已停用',
};

export const COMPANY_TAB_ACCENT: Record<
  CompanyTab,
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
 * 機構 (公司) 表單的初始狀態。
 *
 * 對應 cbl_companies 欄位:
 *   name / email / phone / address / logo / status
 *
 * id 由父層產生 (company-<隨機>) — 因為 id 是 text primary key, 不是 uuid。
 */
export interface CompanyFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string;
  status: 'active' | 'inactive';
}

/** 空表單 (add mode 預設) */
export const EMPTY_COMPANY_FORM: CompanyFormState = {
  name: '',
  email: '',
  phone: '',
  address: '',
  logo: '',
  status: 'active',
};

/** 從既有 Company 物件轉成表單狀態 */
export function companyToFormState(c: Company): CompanyFormState {
  return {
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    logo: c.logo ?? '',
    status: c.status,
  };
}
