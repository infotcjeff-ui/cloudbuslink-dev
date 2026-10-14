'use client';

import type { Bus, Driver, Student } from '@/lib/types';

/** Buses 頁面的全域類型 (only used inside /cbl-admin-setting/bus) */

export type BusTab = 'all' | 'active' | 'maintenance' | 'inactive';

export interface BusFormState {
  plateNumber: string;
  model: string;
  capacity: string;        // 文字輸入, 送出時 parseInt
  driverId: string;        // '' 表示未指派
  gpsDeviceId: string;     // '' 表示未配對
  status: Bus['status'];
}

export const EMPTY_BUS_FORM: BusFormState = {
  plateNumber: '',
  model: '',
  capacity: '28',
  driverId: '',
  gpsDeviceId: '',
  status: 'active',
};

export interface BusesPageContext {
  buses: Bus[];
  drivers: Driver[];
  students: Student[];
}
