'use client';

import type {
  Route,
  RouteStop,
  RouteShiftType,
  Bus,
  Driver,
  Nanny,
  Student,
} from '@/lib/types';

/** Routes 頁面的全域類型 (only used inside /cbl-admin-setting/bus/trips) */

export type RouteTab = 'all' | 'morning' | 'afternoon' | 'extracurricular';

/** 第一部分 Master Info 表單狀態 */
export interface RouteMasterInfo {
  code: string;                 // 路線編號 (e.g. A1-AM)
  name: string;                 // 路線名稱
  shiftType: RouteShiftType;    // 行車時段類型
  busId: string;                // 指派車輛
  driverId: string;             // 指派司機
  nannyId: string;              // 跟車保姆
}

/** 站點時間軸的「可編輯」表單狀態 (不包含 id / seq — 這兩個由外層管理) */
export interface RouteStopDraft {
  kind: RouteStop['kind'];
  eta: string;                  // HH:mm
  name: string;                 // 站點名稱
  latitude: number | null;
  longitude: number | null;
  studentIds: string[];
  notes: string;
}

export const EMPTY_STOP_DRAFT: RouteStopDraft = {
  kind: 'middle',
  eta: '',
  name: '',
  latitude: null,
  longitude: null,
  studentIds: [],
  notes: '',
};

export const EMPTY_ROUTE_MASTER: RouteMasterInfo = {
  code: '',
  name: '',
  shiftType: 'morning',
  busId: '',
  driverId: '',
  nannyId: '',
};

/** 時段類型對照 (UI label + tone) */
export const SHIFT_TYPE_OPTIONS: {
  value: RouteShiftType;
  label: string;
  hint: string;
}[] = [
  { value: 'morning',        label: '早上上學',  hint: '接學生到校' },
  { value: 'afternoon',      label: '下午放學',  hint: '送學生回家' },
  { value: 'extracurricular', label: '課外活動特快線', hint: '課外 / 週末活動' },
];

/** 站點類型對照 (UI label + hint) */
export const STOP_KIND_OPTIONS: {
  value: RouteStop['kind'];
  label: string;
  hint: string;
}[] = [
  { value: 'origin',   label: '起點站',  hint: '首個上車 / 學校' },
  { value: 'middle',   label: '分站',    hint: '沿途接送點' },
  { value: 'terminal', label: '終點站',  hint: '學校 / 最後落車' },
];

export interface RoutesPageContext {
  routes: Route[];
  buses: Bus[];
  drivers: Driver[];
  nannies: Nanny[];
  students: Student[];
}
