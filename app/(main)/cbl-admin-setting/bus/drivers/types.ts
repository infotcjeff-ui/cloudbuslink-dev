'use client';

import type { Driver, Bus } from '@/lib/types';

/** Drivers 頁面的全域類型 (only used inside /cbl-admin-setting/bus/drivers) */

export type DriverTab = 'all' | 'available' | 'on_trip' | 'off_duty';

export interface DriverFormState {
  name: string;
  phone: string;
  licenseNumber: string;
  companyId: string;       // '' 表示未選擇所屬機構/公司 (非必填)
  status: Driver['status'];
}

export const EMPTY_DRIVER_FORM: DriverFormState = {
  name: '',
  phone: '',
  licenseNumber: '',
  companyId: '',
  status: 'available',
};

export interface DriversPageContext {
  drivers: Driver[];
  buses: Bus[];
}