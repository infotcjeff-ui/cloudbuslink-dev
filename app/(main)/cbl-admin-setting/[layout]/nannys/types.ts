'use client';

import type { Nanny, Bus } from '@/lib/types';

/** Nannys 頁面的全域類型 (only used inside /cbl-admin-setting/[layout]/nannys) */

export type NannyTab = 'all' | 'unassigned';

/** 保姆表單狀態 — 與 NannyFormModal 的 NannyFormState 保持一致 */
export interface NannyFormState {
  name: string;
  phone: string;
  employeeId: string;
  /** 員工編號是否鎖住 (edit 模式 = true, add 模式 = false, 由表單層自動生成 preview) */
  employeeIdLocked: boolean;
  assignedBusIds: string[];
  /** 備註 / 自我介紹 (選填) — UI 加的輕量欄位, 僅存儲於 form state, 儲存時寫入 description 欄位 */
  description: string;
}

export const EMPTY_NANNY_FORM: NannyFormState = {
  name: '',
  phone: '',
  employeeId: '',
  employeeIdLocked: false,
  assignedBusIds: [],
  description: '',
};

export interface NannysPageContext {
  nannies: Nanny[];
  buses: Bus[];
}
