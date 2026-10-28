'use client';

import type { Bus, Driver, Nanny, Student } from '@/lib/types';

/** Buses 頁面的全域類型 (only used inside /cbl-admin-setting/bus) */

export type BusTab = 'all' | 'active' | 'maintenance' | 'inactive';

export interface BusFormState {
  plateNumber: string;
  model: string;
  capacity: string;        // 文字輸入, 送出時 parseInt
  driverId: string;        // '' 表示未指派
  companyId: string;       // '' 表示未選擇所屬機構/公司 (非必填)
  nannyId: string;         // '' 表示未指派 — 以 Nanny.assignedBusIds 反向綁定
  gpsDeviceId: string;     // '' 表示未配對
  status: Bus['status'];
  /**
   * 綁定學生 ids（multi-select「車上學生」欄位）
   * - 儲存時: 把每個學生的 `busId = form.busId` （null 表示從此校巴解除）
   * - 編輯模式初始化: 從 `students.filter(s => s.busId === editingBusId)` 推導
   */
  studentIds: string[];
}

export const EMPTY_BUS_FORM: BusFormState = {
  plateNumber: '',
  model: '',
  capacity: '28',
  driverId: '',
  companyId: '',
  nannyId: '',
  gpsDeviceId: '',
  status: 'active',
  studentIds: [],
};

export interface BusesPageContext {
  buses: Bus[];
  drivers: Driver[];
  nannies: Nanny[];
  students: Student[];
}
