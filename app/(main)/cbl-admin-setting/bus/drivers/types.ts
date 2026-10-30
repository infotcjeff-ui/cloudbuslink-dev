'use client';

import type { Driver, Bus } from '@/lib/types';

/** Drivers 頁面的全域類型 (only used inside /cbl-admin-setting/bus/drivers) */

export type DriverTab = 'all' | 'available' | 'on_trip' | 'off_duty';

export interface DriverFormState {
  name: string;
  phone: string;
  licenseNumber: string;
  companyId: string;       // '' 表示未選擇所屬機構/公司 (非必填)
  assignedBusId: string;   // '' 表示未綁定校巴 (對應 Bus.driverId 反向關聯)
  status: Driver['status']; // 執勤狀態 (非必填, 預設 'available')
}

export const EMPTY_DRIVER_FORM: DriverFormState = {
  name: '',
  phone: '',
  licenseNumber: '',
  companyId: '',
  assignedBusId: '',
  status: 'available',
};

export interface DriversPageContext {
  drivers: Driver[];
  buses: Bus[];
}