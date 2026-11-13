// /cbl-admin-setting/schedule — 共用純函式
// 不碰 storage / React, 易於單元測試與 server import

import type {
  Trip,
  TripType,
  Bus,
  Driver,
  Nanny,
  Student,
  Route,
  RouteStop,
  RouteShiftType,
  Attendance,
  Waypoint,
  Location,
} from '@/lib/types';
import type {
  TripWithRelations,
  TripProgress,
  TripConflict,
  ConflictKind,
  ScheduleFilter,
} from './types';
import type { Attendance as AttendanceRow } from '@/lib/types';
import { resolveTripRoute } from '@/lib/trip-route';

/* ============================================================================
 * Trip + Relations 聚合
 * ========================================================================== */

export function joinTripRelations(
  trip: Trip,
  buses: Bus[],
  drivers: Driver[],
  nannies: Nanny[],
  students: Student[],
  routes: Route[],
  attendances: AttendanceRow[],
): TripWithRelations {
  const maps = buildLookupMaps(buses, drivers, nannies, students, routes, attendances);
  return joinTripRelationsWithMaps(trip, maps);
}

/**
 * P0-3: Map 化聚合 — 避免每個 trip 都 filter 全表 (O(n*m))。
 * 一次建好索引後 enriched / progress / conflicts 共用。
 */
export interface TripLookupMaps {
  busById: Map<string, Bus>;
  driverById: Map<string, Driver>;
  nannyById: Map<string, Nanny>;
  /** 校巴 → 已綁定該車的 active 保姆 (trip.nannyId 缺失時的 fallback) */
  nanniesByBusId: Map<string, Nanny[]>;
  studentById: Map<string, Student>;
  studentsByTripId: Map<string, Student[]>;
  attendancesByTripId: Map<string, AttendanceRow[]>;
  routeById: Map<string, Route>;
  routes: Route[];
}

export function buildLookupMaps(
  buses: Bus[],
  drivers: Driver[],
  nannies: Nanny[],
  students: Student[],
  routes: Route[],
  attendances: AttendanceRow[],
  trips?: Trip[],
): TripLookupMaps {
  const busById = new Map(buses.map((b) => [b.id, b]));
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const nannyById = new Map(nannies.map((n) => [n.id, n]));
  // 校巴 → 已綁定該車的 active 保姆 (trip.nannyId 缺失/雲端被洗掉時的 fallback)
  const nanniesByBusId = new Map<string, Nanny[]>();
  nannies.forEach((n) => {
    if (n.status !== 'active') return;
    (n.assignedBusIds ?? []).forEach((busId) => {
      const arr = nanniesByBusId.get(busId) ?? [];
      arr.push(n);
      nanniesByBusId.set(busId, arr);
    });
  });
  const studentById = new Map(students.map((s) => [s.id, s]));
  const routeById = new Map(routes.map((r) => [r.id, r]));

  // 學生按 trip 預分組 (避免 trips.map 內重複 filter)
  const studentsByTripId = new Map<string, Student[]>();
  if (trips) {
    // O(total studentIds): 直接按 id 查表，不再每 trip 掃全表
    trips.forEach((t) => {
      const arr: Student[] = [];
      (t.studentIds ?? []).forEach((sid) => {
        const s = studentById.get(sid);
        if (s) arr.push(s);
      });
      studentsByTripId.set(t.id, arr);
    });
  } else {
    // 沒有 trips 傳入時退回空 Map (呼叫端自行 filter)
  }

  const attendancesByTripId = new Map<string, AttendanceRow[]>();
  attendances.forEach((a) => {
    const arr = attendancesByTripId.get(a.tripId) ?? [];
    arr.push(a);
    attendancesByTripId.set(a.tripId, arr);
  });

  return {
    busById,
    driverById,
    nannyById,
    nanniesByBusId,
    studentById,
    studentsByTripId,
    attendancesByTripId,
    routeById,
    routes,
  };
}

/** Map 版 join — P0-3 主路徑 */
export function joinTripRelationsWithMaps(
  trip: Trip,
  maps: TripLookupMaps,
): TripWithRelations {
  const bus = maps.busById.get(trip.busId);
  // 司機: 班次快照優先 (建班時表單所選值, 選車時已按該車綁定自動填入),
  // 舊班次快照為空才退回現時校巴綁定。
  const driverId = trip.driverIdSnapshot ?? bus?.driverId;
  const driver = driverId ? maps.driverById.get(driverId) : undefined;
  // 保姆三級解析: 1) trip.nannyId 精確匹配 → 2) 該校巴已綁定的保姆 fallback
  // (雲端 trips 同步時 nanny 可能被洗掉/不同步, 或舊班次 nannyId 為空)
  const nanny =
    (trip.nannyId ? maps.nannyById.get(trip.nannyId) : undefined) ??
    (trip.busId ? maps.nanniesByBusId.get(trip.busId)?.[0] : undefined);
  const myStudents =
    maps.studentsByTripId.get(trip.id) ??
    (trip.studentIds ?? [])
      .map((sid) => maps.studentById.get(sid))
      .filter((s): s is Student => !!s);
  const myAttendances = maps.attendancesByTripId.get(trip.id) ?? [];
  // 路線模板解析規則抽到 lib/trip-route.ts, 令保姆 portal 同管理員排程頁一致
  const route = resolveTripRoute(trip, maps.routes);
  return { trip, bus, driver, nanny, students: myStudents, attendances: myAttendances, route };
}

/* ============================================================================
 * 出席進度 (Trip-level summary)
 * ========================================================================== */

export function summarizeProgress(
  trip: Trip,
  attendances: AttendanceRow[],
): TripProgress {
  const pickupWp = trip.waypoints.filter((w) => w.type === 'pickup');
  const dropoffWp = trip.waypoints.filter((w) => w.type === 'dropoff');
  const expectedPickups = pickupWp.reduce((a, w) => a + w.studentIds.length, 0);
  const expectedDropoffs = dropoffWp.reduce((a, w) => a + w.studentIds.length, 0);

  // 過濾到本 trip 且對應到正確 waypoint type
  const attByWp = new Map<string, AttendanceRow[]>();
  attendances.forEach((a) => {
    const arr = attByWp.get(a.waypointId) ?? [];
    arr.push(a);
    attByWp.set(a.waypointId, arr);
  });

  let boardedCount = 0;
  let lateCount = 0;
  let noShowCount = 0;
  let droppedCount = 0;
  let completedStops = 0;

  pickupWp.forEach((wp) => {
    const atts = attByWp.get(wp.id) ?? [];
    let allDone = atts.length >= wp.studentIds.length && atts.length > 0;
    atts.forEach((a) => {
      if (a.boardingTime) boardedCount++;
      if (a.boardingStatus === 'late') lateCount++;
      if (a.boardingStatus === 'no_show' || a.boardingStatus === 'absent')
        noShowCount++;
      if (a.boardingStatus === 'no_show' || a.boardingStatus === 'absent') {
        // 缺席的不算完成
      } else if (!a.boardingTime) {
        allDone = false;
      }
    });
    if (atts.length === 0) allDone = false;
    // waypoint 已標記 status = 'completed' / 'arrived' 也算
    if (wp.status === 'completed' || wp.status === 'arrived') allDone = true;
    if (allDone) completedStops++;
  });

  dropoffWp.forEach((wp) => {
    const atts = attByWp.get(wp.id) ?? [];
    let allDone = atts.length >= wp.studentIds.length && atts.length > 0;
    atts.forEach((a) => {
      if (a.dropoffTime) droppedCount++;
      if (!a.dropoffTime && a.dropoffStatus !== 'no_show') allDone = false;
    });
    if (atts.length === 0) allDone = false;
    if (wp.status === 'completed' || wp.status === 'arrived') allDone = true;
    if (allDone) completedStops++;
  });

  const totalStops = trip.waypoints.length;
  // Fallback (bug 3): 打卡已做但進度仍 0 的兩種情況 —
  //  1) trip 沒有 pickup 站點 (expectedPickups=0) → 用全車學生數做分母
  //  2) waypoint id 漂移 (班次被編輯/重建站點後, 舊打卡的 waypointId 對不上新站點)
  //     → 直接按 (tripId + studentId) 去重計算, 不依賴 waypointId 匹配
  let finalExpected = expectedPickups;
  let finalBoarded = boardedCount;
  if (finalExpected === 0 || (finalBoarded === 0 && attendances.length > 0)) {
    const boardedStudents = new Set<string>();
    const lateStudents = new Set<string>();
    const noShowStudents = new Set<string>();
    attendances.forEach((a) => {
      if (a.boardingTime || a.dropoffTime) boardedStudents.add(a.studentId);
      if (a.boardingStatus === 'late') lateStudents.add(a.studentId);
      if (a.boardingStatus === 'no_show' || a.boardingStatus === 'absent') noShowStudents.add(a.studentId);
    });
    const inTrip = (sid: string) =>
      trip.studentIds.length === 0 || trip.studentIds.includes(sid);
    const distinctBoarded = [...boardedStudents].filter(inTrip).length;
    if (finalExpected === 0) {
      finalExpected = trip.studentIds.length > 0 ? trip.studentIds.length : boardedStudents.size;
      finalBoarded = distinctBoarded;
    } else if (finalBoarded === 0 && distinctBoarded > 0) {
      // waypoint 漂移: 有打卡但對不上站點 → 用去重人數, 避免顯示 0/2 誤導
      finalBoarded = Math.min(distinctBoarded, finalExpected);
    }
    if (lateCount === 0 && lateStudents.size > 0) lateCount = [...lateStudents].filter(inTrip).length;
    if (noShowCount === 0 && noShowStudents.size > 0) {
      noShowCount = [...noShowStudents].filter(inTrip).length;
    }
  }
  return {
    totalStops,
    completedStops,
    expectedPickups: finalExpected,
    boardedCount: finalBoarded,
    lateCount,
    noShowCount,
    expectedDropoffs,
    droppedCount,
    boardingRate:
      finalExpected === 0 ? (finalBoarded > 0 ? 1 : 0) : Math.min(1, finalBoarded / finalExpected),
  };
}

/* ============================================================================
 * 篩選 + 排序 + 群組
 * ========================================================================== */

export function applyScheduleFilter(
  items: TripWithRelations[],
  filter: ScheduleFilter,
  tab: 'all' | 'morning' | 'afternoon' | 'custom' | 'history',
  students: Student[] = [],
): TripWithRelations[] {
  const q = filter.q.trim().toLowerCase();
  const today = todayIso();
  return items.filter((row) => {
    const trip = row.trip;
    // 過往紀錄: 所有非今天的班次 (已完成 / 未完成都收進來), 不分早午自訂
    if (tab === 'history') {
      if (trip.date === today) return false;
    } else {
      if (tab !== 'all' && trip.type !== tab) return false;
    }
    if (filter.status && filter.status !== 'all' && trip.status !== filter.status) return false;
    // 過往紀錄 tab 不受日期篩選限制 (本身已定義為「所有非今天」)
    if (tab !== 'history') {
    if (filter.dateRange === 'today' && trip.date !== todayIso()) return false;
    if (filter.dateRange === 'tomorrow' && trip.date !== tomorrowIso()) return false;
    if (filter.dateRange === 'yesterday' && trip.date !== yesterdayIso()) return false;
    // 過去 7 天 (含今日): trip.date 落在 [today-6, today]
    if (filter.dateRange === 'past7') {
      const from = addDaysIso(todayIso(), -6);
      const to = todayIso();
      if (trip.date < from || trip.date > to) return false;
    } else if (
      filter.dateRange &&
      filter.dateRange !== 'today' &&
      filter.dateRange !== 'tomorrow' &&
      filter.dateRange !== 'yesterday' &&
      filter.dateRange !== 'past7' &&
      filter.dateRange !== 'all' &&
      trip.date !== filter.dateRange
    ) return false;
    }
    if (filter.busId && trip.busId !== filter.busId) return false;
    if (filter.driverId && row.bus?.driverId !== filter.driverId) return false;
    if (filter.nannyId && trip.nannyId !== filter.nannyId) return false;
    if (!q) return true;
    const studentNames = trip.studentIds
      .map((sid) => students.find((s) => s.id === sid)?.name ?? '')
      .filter(Boolean);
    const haystack = [
      trip.plannedStartTime,
      trip.plannedEndTime,
      trip.type,
      row.bus?.plateNumber,
      row.bus?.model,
      row.driver?.name,
      row.driver?.phone,
      row.nanny?.name,
      row.nanny?.phone,
      ...trip.waypoints.map((w) => w.location.name),
      ...studentNames,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/* ============================================================================
   * 衝突偵測
   *
   * 設計原則 (2026-10 重寫):
   *   1. **一律用區間重疊判定** ——
   *      舊版學生衝突用「完全相同時段字串」當 key, 但校巴/司機/保姆用區間 overlap。
   *      結果: 學生被 07:30-08:30 與 08:00-09:00 兩班撞到卻偵測不到。
   *      現在 5 類全部走同一個 overlap() 語意, 行為一致。
   *
   *   2. **先依日期 + 資源分桶, 桶內才兩兩比對** ——
   *      舊版 3 個資源各跑一次 O(n²) 全域比對。改成分桶後:
   *      - 不同日期的班次永遠不會互相比對 (時間重疊只在同一天有意義)
   *      - 不同資源的班次不會互相比對
   *      - 實際比對量從 O(n²) 降到 O(sum(bucket²)), 而 bucket 通常很小
   * ========================================================================== */

export function findConflicts(
  trips: Trip[],
  buses: Bus[],
  students: Student[],
  drivers: import('@/lib/types').Driver[] = [],
  nannies: Nanny[] = [],
  /** P0-1: 只算此窗口內的衝突 (避免 all 模式下歷史全量 O(n²))。傳 undefined = 全量 */
  window?: { from: string; to: string } | null,
  /** 只保留涉及這些 trip id 的衝突 (listing 為空時不彈紅色 alert) */
  opts?: { onlyIds?: Set<string> },
): TripConflict[] {
  const conflicts: TripConflict[] = [];

  // P0-1: 視窗過濾 — 先縮小 n 再分桶比對
  let inWindow = window
    ? trips.filter((t) => t.date >= window.from && t.date <= window.to)
    : trips;
  // 只保留可見清單的班次 (解決: 清單空但紅色 alert 依然顯示)
  if (opts?.onlyIds) {
    const only = opts.onlyIds;
    inWindow = inWindow.filter((t) => only.has(t.id));
  }

  const busById = new Map(buses.map((b) => [b.id, b]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const nannyById = new Map(nannies.map((n) => [n.id, n]));

  /* ----------------------------------------------------------------------
   * 1) 學生同時段衝突 (學生優先 — q3-a)
   *    分桶: date + studentId → 該學生當天的所有班次
   * -------------------------------------------------------------------- */
  const studentBuckets = new Map<string, Trip[]>();
  inWindow.forEach((t) => {
    (t.studentIds ?? []).forEach((sid) => {
      const k = `${t.date}__${sid}`;
      const arr = studentBuckets.get(k) ?? [];
      arr.push(t);
      studentBuckets.set(k, arr);
    });
  });
  studentBuckets.forEach((arr, key) => {
    if (arr.length < 2) return;
    const [date, sid] = key.split('__');
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (!overlap(a, b)) continue;
        const student = studentById.get(sid);
        const name = student?.name ?? sid;
        conflicts.push({
          kind: 'student_overlap',
          refId: sid,
          refLabel: name,
          tripIds: [a.id, b.id],
          description:
            `學生「${name}」在 ${date} ` +
            `${slotLabel(a)} 與 ${slotLabel(b)} 時段重疊`,
        });
      }
    }
  });

  /* ----------------------------------------------------------------------
   * 2) 校巴容量超載
   * -------------------------------------------------------------------- */
  inWindow.forEach((t) => {
    const bus = busById.get(t.busId);
    if (!bus) return;
    if ((t.studentIds?.length ?? 0) > bus.capacity) {
      conflicts.push({
        kind: 'capacity_overload',
        refId: t.id,
        refLabel: bus.plateNumber,
        tripIds: [t.id],
        description: `校巴 ${bus.plateNumber} (容量 ${bus.capacity}) 超載指派 ${t.studentIds.length} 位學生`,
      });
    }
  });

  /* ----------------------------------------------------------------------
   * 3) 校巴同時段重疊
   * -------------------------------------------------------------------- */
  const busBuckets = new Map<string, Trip[]>();
  inWindow.forEach((t) => {
    if (!t.busId) return;
    const k = `${t.date}__${t.busId}`;
    const arr = busBuckets.get(k) ?? [];
    arr.push(t);
    busBuckets.set(k, arr);
  });
  busBuckets.forEach((arr) => {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (!overlap(a, b)) continue;
        const bus = busById.get(a.busId);
        conflicts.push({
          kind: 'bus_overlap',
          refId: a.busId,
          refLabel: bus?.plateNumber ?? a.busId,
          tripIds: [a.id, b.id],
          description:
            `校巴 ${bus?.plateNumber ?? a.busId} 在 ${a.date} ` +
            `${slotLabel(a)} 與 ${slotLabel(b)} 被重複指派`,
        });
      }
    }
  });

  /* ----------------------------------------------------------------------
   * 4) 司機同時段重疊 (司機由校巴.driverId 推導)
   * -------------------------------------------------------------------- */
  const driverBuckets = new Map<string, Trip[]>();
  inWindow.forEach((t) => {
    const driverId = busById.get(t.busId)?.driverId;
    if (!driverId) return;
    const k = `${t.date}__${driverId}`;
    const arr = driverBuckets.get(k) ?? [];
    arr.push(t);
    driverBuckets.set(k, arr);
  });
  driverBuckets.forEach((arr, key) => {
    const driverId = key.split('__')[1];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (!overlap(a, b)) continue;
        const driver = driverById.get(driverId);
        conflicts.push({
          kind: 'driver_overlap',
          refId: driverId,
          refLabel: driver?.name ?? driverId,
          tripIds: [a.id, b.id],
          description:
            `司機 ${driver?.name ?? driverId} 在 ${a.date} ` +
            `${slotLabel(a)} 與 ${slotLabel(b)} 被指派到 2 班`,
        });
      }
    }
  });

  /* ----------------------------------------------------------------------
   * 5) 保姆同時段重疊
   * -------------------------------------------------------------------- */
  const nannyBuckets = new Map<string, Trip[]>();
  inWindow.forEach((t) => {
    if (!t.nannyId) return;
    const k = `${t.date}__${t.nannyId}`;
    const arr = nannyBuckets.get(k) ?? [];
    arr.push(t);
    nannyBuckets.set(k, arr);
  });
  nannyBuckets.forEach((arr, key) => {
    const nannyId = key.split('__')[1];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (!overlap(a, b)) continue;
        const nanny = nannyById.get(nannyId);
        conflicts.push({
          kind: 'nanny_overlap',
          refId: nannyId,
          refLabel: nanny?.name ?? nannyId,
          tripIds: [a.id, b.id],
          description:
            `保姆 ${nanny?.name ?? nannyId} 在 ${a.date} ` +
            `${slotLabel(a)} 與 ${slotLabel(b)} 被指派到 2 班`,
        });
      }
    }
  });

  return conflicts;
}

/** 班次時段的顯示字串, 例: "07:30-08:30" */
function slotLabel(t: Trip): string {
  const s = t.plannedStartTime ?? '';
  const e = t.plannedEndTime ?? '';
  return s && e ? `${s}-${e}` : (s || e || '未排時間');
}

function overlap(
  a: Trip,
  b: Trip,
): boolean {
  // 時間字串 HH:mm
  const aStart = toMinutes(a.plannedStartTime);
  const aEnd = toMinutes(a.plannedEndTime);
  const bStart = toMinutes(b.plannedStartTime);
  const bEnd = toMinutes(b.plannedEndTime);
  if (aStart < 0 || aEnd < 0 || bStart < 0 || bEnd < 0) return false;
  return aStart < bEnd && bStart < aEnd;
}

function toMinutes(t: string | null | undefined): number {
  if (!t) return -1;
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* ============================================================================
 * 時間工具 (以本地時區為準)
 * ========================================================================== */

/**
 * 取本地時區的 YYYY-MM-DD。
 *
 * ⚠️ 不可用 new Date().toISOString().slice(0, 10) ——
 *   toISOString() 回傳的是 **UTC**。香港 (UTC+8) 在凌晨 00:00–07:59,
 *   UTC 日期還是「昨天」, 會讓「今日」篩選 / 預設日期整組錯一天。
 *
 *   專案為香港系統 (layout.tsx 的時鐘明確用 Asia/Hong_Kong),
 *   所以這裡一律用「本地時區」組字串。
 */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return localIsoDate(new Date());
}

export function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localIsoDate(d);
}

export function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localIsoDate(d);
}

/** YYYY-MM-DD 加減天 (scheduleUtils 共用版，供 filter/hook 使用, 本地時區中午定錨避 DST) */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function fmtHhMm(isoOrTime: string | null | undefined): string {
  if (!isoOrTime) return '—';
  // HH:mm 直傳
  if (/^\d{2}:\d{2}$/.test(isoOrTime)) return isoOrTime;
  const m = isoOrTime.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : isoOrTime;
}

/** 依出發時間升冪排序 (預設) */
export function sortTripsByStart(items: TripWithRelations[], asc = true): TripWithRelations[] {
  return [...items].sort((a, b) => {
    const ka = `${a.trip.date}_${a.trip.plannedStartTime}`;
    const kb = `${b.trip.date}_${b.trip.plannedStartTime}`;
    return asc ? ka.localeCompare(kb) : kb.localeCompare(ka);
  });
}

/** 將 waypoints 以時間或原本 seq 排序, 並重新給 seq */
export function renumberWaypoints(waypoints: Waypoint[]): Waypoint[] {
  return waypoints
    .slice()
    .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
    .map((w, idx) => ({ ...w, id: w.id || `wp-${idx}` }));
}

/* ============================================================================
 * Route (路線模板) → Trip waypoints 轉換
 * ========================================================================== */

/**
 * 把一條 Route 模板的 stops 轉成 Trip 的 waypoints。
 *
 * 為什麼需要這層轉換:
 *   - Route (cbl_routes) 是「路線模板」: 有站點順序、ETA、起終點、隨車學生
 *   - Trip (cbl_trips) 是「某一天的實例」: 需要 waypoints (含 pickup/dropoff
 *     類型、實際到站時間、狀態) 供當日打卡流程使用
 *   - 所以「套用路線模板」= 把 stops 展開成 pickup + dropoff 兩組 waypoints
 *
 * ⚠️ 上下車方向必須依「行車方向」決定, 不能每站都上下車:
 *
 *   早班 (morning) — 屋苑 → 學校
 *     沿途各站「上車」, 終點 (學校) 統一「下車」
 *     wp-001: 黃大仙站(上車) → 鑽石山站(上車) → 示範小學(下車, 全員)
 *
 *   午班 (afternoon) — 學校 → 屋苑
 *     起點 (學校) 統一「上車」, 沿途各站「下車」
 *     wp-003: 示範小學(上車, 全員) → 黃大仙站(下車) → 鑽石山站(下車)
 *
 *   課外/自訂 (extracurricular) — 方向不明
 *     保守做法: 每站都建立上車 + 下車 (等同舊行為)
 *
 * 舊版每站都建 pickup+dropoff, 導致早班出現「示範小學上車 + 示範小學下車」
 * 的鬼影站點, 也讓每日打卡流程出現不存在的上下車點。
 */
export function routeStopsToWaypoints(
  route: Route,
  opts?: {
    /** 只保留這些學生的站點 (預設 = 全部) */
    studentIds?: string[];
    /** 產生 waypoint id 的函式 (測試時可注入) */
    genId?: () => string;
    /** 覆寫 pickup / dropoff 的預設時間 */
    pickupTime?: string;
    dropoffTime?: string;
    /** 行車方向 (預設 = route.shiftType) */
    shiftType?: RouteShiftType;
  },
): Waypoint[] {
  const gen = opts?.genId ?? (() => `wp-${Math.random().toString(36).slice(2, 10)}`);
  const allowed = opts?.studentIds ? new Set(opts.studentIds) : null;
  const shiftType = opts?.shiftType ?? route.shiftType;

  const keep = (id: string) => !allowed || allowed.has(id);

  // 只留「有學生且學生在範圍內」的站點, 並依 seq 排序
  const stops = [...(route.stops ?? [])]
    .sort((a, b) => a.seq - b.seq)
    .filter((s) => (s.studentIds ?? []).some(keep));

  // C4 防呆：模板有 stops 但過濾後全空（例如舊資料 studentIds 為空、
  // 或學生名單對不上）→ 保留站點骨架（studentIds=[]），而不是回傳空陣列。
  // 否則表單站點區顯示 0 站，使用者以為「沒帶入」。
  const effectiveStops = stops.length > 0
    ? stops
    : [...(route.stops ?? [])].sort((a, b) => a.seq - b.seq);

  /** 該站參與的學生 id */
  const stopStudents = (s: RouteStop): string[] =>
    (s.studentIds ?? []).filter(keep);

  /** 全線參與學生（去重） */
  const allStudents = [
    ...new Set(stops.flatMap((s) => stopStudents(s))),
  ];

  /**
   * 找出「終點 (學校)」與「起點 (學校)」。
   *
   * 優先用 RouteStop.kind (origin/middle/terminal), 但舊資料可能沒標 kind,
   * 這時退回「第一站 = 起點 / 最後一站 = 終點」的位置推斷。
   *
   * C4: 用 effectiveStops（防呆骨架）計算起終點，避免全空時索引錯亂。
   */
  const terminalIdx = (() => {
    const i = effectiveStops.findIndex((s) => s.kind === 'terminal');
    return i >= 0 ? i : effectiveStops.length - 1;
  })();
  const originIdx = (() => {
    const i = effectiveStops.findIndex((s) => s.kind === 'origin');
    return i >= 0 ? i : 0;
  })();

  const mk = (
    stop: RouteStop,
    type: 'pickup' | 'dropoff',
    studentIds: string[],
    fallbackTime: string,
  ): Waypoint => ({
    id: gen(),
    location: {
      name: stop.name,
      address: stop.notes ?? '',
      latitude: stop.latitude ?? 0,
      longitude: stop.longitude ?? 0,
      type,
    },
    type,
    scheduledTime: stop.eta || fallbackTime,
    actualTime: null,
    status: 'pending',
    studentIds: [...studentIds],
    notes: stop.notes || null,
  });

  const out: Waypoint[] = [];
  const pickupFallback = opts?.pickupTime ?? '07:30';
  const dropoffFallback = opts?.dropoffTime ?? '08:30';

  if (shiftType === 'morning') {
    // 屋苑 → 學校: 沿途上車, 終點 (學校) 統一下車
    effectiveStops.forEach((stop, i) => {
      if (i === terminalIdx) return; // 終點不接客
      out.push(mk(stop, 'pickup', stopStudents(stop), pickupFallback));
    });
    const terminal = effectiveStops[terminalIdx];
    if (terminal) {
      out.push(mk(terminal, 'dropoff', allStudents, dropoffFallback));
    }
  } else if (shiftType === 'afternoon') {
    // 學校 → 屋苑: 起點 (學校) 統一上車, 沿途下車
    const origin = effectiveStops[originIdx];
    if (origin) {
      out.push(mk(origin, 'pickup', allStudents, pickupFallback));
    }
    effectiveStops.forEach((stop, i) => {
      if (i === originIdx) return; // 起點不送客 (已在上車點統一上車)
      out.push(mk(stop, 'dropoff', stopStudents(stop), dropoffFallback));
    });
  } else {
    // 課外/自訂: 方向不明 → 每站上下車
    effectiveStops.forEach((stop) => {
      const ids = stopStudents(stop);
      out.push(mk(stop, 'pickup', ids, pickupFallback));
      out.push(mk(stop, 'dropoff', ids, dropoffFallback));
    });
  }

  return out;
}

/** 從 Route 模板取出所有隨車學生的 id (去重) */
export function routeStudentIds(route: Route): string[] {
  const set = new Set<string>();
  (route.stops ?? []).forEach((s) => (s.studentIds ?? []).forEach((id) => set.add(id)));
  return [...set];
}

/**
 * Route 模板的行車時段 → Trip 的班次類型。
 *
 * Route 有三種 (morning / afternoon / extracurricular),
 * Trip 只有三種 (morning / afternoon / custom)。
 * extracurricular (課外活動) 對應到 Trip 的 'custom'。
 */
export function routeShiftToTripType(shiftType: RouteShiftType): TripType {
  if (shiftType === 'morning') return 'morning';
  if (shiftType === 'afternoon') return 'afternoon';
  return 'custom';
}

/**
 * 取 Route 模板的起訖時間 (第一站 / 最後一站的 ETA)。
 *
 * 用於「套用模板時同步班次的開始/結束時間」, 避免表單顯示 07:30-08:30
 * 卻與模板的 07:15-08:40 不一致。
 */
export function routeTimeRange(route: Route): { start: string; end: string } {
  const stops = [...(route.stops ?? [])].sort((a, b) => a.seq - b.seq);
  const first = stops.find((s) => !!s.eta);
  const last = [...stops].reverse().find((s) => !!s.eta);
  return {
    start: first?.eta ?? '07:30',
    end: last?.eta ?? '08:30',
  };
}
