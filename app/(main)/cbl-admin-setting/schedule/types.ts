// /cbl-admin-setting/schedule — 區域 types
// 不改 lib/types.ts 的核心 Trip / Attendance schema (避免 mock data 重灌)
// 此處只放 UI 層擴充型別

import type {
  Trip,
  TripType,
  TripStatus,
  Bus,
  Driver,
  Nanny,
  Student,
  Route,
  Attendance,
  Waypoint,
  Attendance as AttendanceRow,
} from '@/lib/types';

/** Schedule 主 Console 的 tab */
export type ScheduleTab = TripType | 'all' | 'history';

/** 進階篩選條件 (L1 Filter Bar) */
export interface ScheduleFilter {
  busId?: string;
  driverId?: string;
  nannyId?: string;
  /** 狀態篩選: undefined / 'all' = 全部, 否則只顯示該狀態 */
  status?: TripStatus | 'all';
  /** 'today' | 'tomorrow' | ISO date | 'all' */
  dateRange: string;
  q: string;
}

/** Trip 連同 join 進來的關聯資料 */
export interface TripWithRelations {
  trip: Trip;
  bus: Bus | undefined;
  driver: Driver | undefined;
  nanny: Nanny | undefined;
  students: Student[];
  attendances: AttendanceRow[];
  /** 從 cbl_routes 找出的對應路線模板 (優先用 trip.routeId 精確匹配, 否則退回 shiftType + busId 鬆散匹配) */
  route: Route | undefined;
}

/** 出席進度彙總 */
export interface TripProgress {
  /** 站點數 */
  totalStops: number;
  /** 已完成站點數 */
  completedStops: number;
  /** 預期上車人次 (學生數 × pickup 站點, 通常 = 學生數) */
  expectedPickups: number;
  /** 已上車人次 (boardingTime != null) */
  boardedCount: number;
  /** 遲到人數 */
  lateCount: number;
  /** 缺席人數 */
  noShowCount: number;
  /** 預期下車人次 */
  expectedDropoffs: number;
  /** 已下車人次 */
  droppedCount: number;
  /** 0..1 的完成率 (使用 boarded/total) */
  boardingRate: number;
}

/** 衝突種類 */
export type ConflictKind =
  | 'student_overlap'
  | 'driver_overlap'
  | 'nanny_overlap'
  | 'bus_overlap'
  | 'capacity_overload';

/** 衝突偵測結果 */
export interface TripConflict {
  kind: ConflictKind;
  /** 衝突主體的識別 (e.g. studentId / busId) */
  refId: string;
  refLabel: string;
  /** 涉及到的 trip ids */
  tripIds: string[];
  /** 人類可讀描述 */
  description: string;
}

/** 表單填寫 (TripFormModal 用) */
export interface TripFormValues {
  id?: string;
  type: TripType;
  /** 自訂班次類型名稱 — 僅 type='custom' 時由表單輸入, 預覽即時顯示 */
  customTypeLabel?: string | null;
  date: string;
  plannedStartTime: string;
  plannedEndTime: string;
  busId: string;
  driverId: string;
  nannyId: string;
  studentIds: string[];
  waypoints: Waypoint[];
  notes?: string;
  /** Phase 2-A: 套用的路線模板 (cbl_routes.id) */
  routeId?: string | null;
  /** Route 模板的站點順序, 供 UI 顯示「套用模板」狀態 */
  routeStops?: string[];
}

/** Sort options */
export type ScheduleSort = 'start_asc' | 'start_desc' | 'created_desc' | 'status';

export const SCHEDULE_TABS: { id: ScheduleTab; label: string; color: string }[] = [
  { id: 'all',       label: '全部班次', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  { id: 'morning',   label: '早班',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200' },
  { id: 'afternoon', label: '午班',     color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200' },
  { id: 'custom',    label: '自訂',     color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' },
  { id: 'history',   label: '過往紀錄', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' },
];

export const STATUS_LABEL: Record<TripStatus, string> = {
  scheduled:   '尚未發車',
  in_progress: '進行中',
  completed:   '已完成',
  cancelled:   '已取消',
};
