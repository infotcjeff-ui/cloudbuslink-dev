'use client';

// /cbl-admin-setting/schedule — 統一載入 trips + 關聯 + 衝突 + 即時 refresh
// 同時監聽 cbl-trips-refresh 與 cbl-attendance-refresh 事件。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE } from '@/lib/storage';
import { syncFromSupabase } from '@/lib/supabase-data';
import type {
  Trip,
  Bus,
  Driver,
  Nanny,
  Student,
  Route,
  Attendance,
} from '@/lib/types';
import {
  joinTripRelationsWithMaps,
  buildLookupMaps,
  sortTripsByStart,
  applyScheduleFilter,
  findConflicts,
} from '../scheduleUtils';
import { filterByAcademicYear } from '@/lib/academic-year';
import { useAcademicYear } from '../../AcademicYearProvider';
import type {
  ScheduleFilter,
  TripConflict,
  TripWithRelations,
  ScheduleTab,
  TripProgress,
} from '../types';
import { summarizeProgress } from '../scheduleUtils';

interface UseScheduleTripsResult {
  trips: TripWithRelations[];
  /** 篩選前的全部班次數 (P0-1: 標題顯示 today n / 全部 m) */
  totalCount: number;
  loading: boolean;
  /** 預先彙總好的 progress, key = tripId (P0-1: 只算 filtered 範圍) */
  progress: Record<string, TripProgress>;
  /** 全部衝突 (P0-1: 只算 date±7天窗口) */
  conflicts: TripConflict[];
  /** 下層引用 */
  buses: Bus[];
  drivers: Driver[];
  nannies: Nanny[];
  students: Student[];
  routes: Route[];
}

export function useScheduleTrips(
  clientId: string | undefined,
  filter: ScheduleFilter,
  tab: ScheduleTab,
  isSuperAdmin = false,
): UseScheduleTripsResult {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [nannies, setNannies] = useState<Nanny[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  // ⚠️ 學年範圍 — 班次是分學年的 entity。
  //    這裡是「班次清單」的單一過濾點: 所有下游 (enriched / filtered / progress /
  //    conflicts) 都從 filtered 的結果推導, 所以只要在這裡過濾一次就夠。
  const { selectedYear } = useAcademicYear();

  /** 從 localStorage 重載 (供 storage 事件用) */
  const refresh = useCallback(() => {
    try {
      const superMode = isSuperAdmin;
      if (superMode) {
        // 超管看全部 (跨機構管理)
        setBuses(STORAGE.buses.getAll());
        setDrivers(STORAGE.drivers.getAll());
        setNannies(STORAGE.nannies.getAll());
        setStudents(STORAGE.students.getAll());
        setRoutes(STORAGE.routes.getAll());
        setTrips(STORAGE.trips.getAll());
      } else {
        const cid = clientId || '';
        if (cid) {
          setBuses(STORAGE.buses.getByClient(cid));
          setDrivers(STORAGE.drivers.getByClient(cid));
          setNannies(STORAGE.nannies.getByClient(cid));
          setStudents(STORAGE.students.getByClient(cid));
          setRoutes(STORAGE.routes.getByClient(cid));
          setTrips(STORAGE.trips.getByClient(cid));
        } else {
          // P1-2/3 修法後 clientId 應由 page 解析，此處保留空陣列避免誤讀全站資料
          setBuses([]); setDrivers([]); setNannies([]);
          setStudents([]); setRoutes([]); setTrips([]);
        }
      }
      setAttendances(STORAGE.attendances.getAll());
    } catch {
      // 本地重載失敗時保持現有資料
    }
  }, [clientId, isSuperAdmin]);

  // 初次 + 監聽 storage 事件 (P0-2: 不做假轉圈，背景 sync 用 isSyncing)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // 1) 立即從 localStorage 渲染 (避免空白閃)
    // 超管讀全部，一般角色讀自己學校
    if (isSuperAdmin) {
      setBuses(STORAGE.buses.getAll());
      setDrivers(STORAGE.drivers.getAll());
      setNannies(STORAGE.nannies.getAll());
      setStudents(STORAGE.students.getAll());
      setRoutes(STORAGE.routes.getAll());
      setTrips(STORAGE.trips.getAll());
      setAttendances(STORAGE.attendances.getAll());
    } else {
      const cid = clientId || '';
      if (cid) {
        setBuses(STORAGE.buses.getByClient(cid));
        setDrivers(STORAGE.drivers.getByClient(cid));
        setNannies(STORAGE.nannies.getByClient(cid));
        setStudents(STORAGE.students.getByClient(cid));
        setRoutes(STORAGE.routes.getByClient(cid));
        setTrips(STORAGE.trips.getByClient(cid));
        setAttendances(STORAGE.attendances.getAll());
      }
    }
    setLoading(false);

    // 2) 背景從 Supabase 同步 (確保資料即時) — 顯示真實 syncing 狀態
    const loadVisible = (cid: string) => {
      if (isSuperAdmin) {
        return {
          buses: STORAGE.buses.getAll(),
          drivers: STORAGE.drivers.getAll(),
          nannies: STORAGE.nannies.getAll(),
          students: STORAGE.students.getAll(),
          routes: STORAGE.routes.getAll(),
          trips: STORAGE.trips.getAll(),
        };
      }
      return {
        buses: STORAGE.buses.getByClient(cid),
        drivers: STORAGE.drivers.getByClient(cid),
        nannies: STORAGE.nannies.getByClient(cid),
        students: STORAGE.students.getByClient(cid),
        routes: STORAGE.routes.getByClient(cid),
        trips: STORAGE.trips.getByClient(cid),
      };
    };
    const sync = async () => {
      const cid = clientId || '';
      // 超管沒有 clientId 也要跑同步 (看全部)
      if (!cid && !isSuperAdmin) return;
      try {
        await syncFromSupabase();
        if (cancelled) return;
        // 3) 同步完後重載 state
        const v = loadVisible(cid);
        setBuses(v.buses);
        setDrivers(v.drivers);
        setNannies(v.nannies);
        setStudents(v.students);
        setRoutes(v.routes);
        setTrips(v.trips);
        setAttendances(STORAGE.attendances.getAll());
        console.log('[useScheduleTrips] background sync done', {
          buses: v.buses.length,
          trips: v.trips.length,
        });
      } catch (e) {
        console.warn('[useScheduleTrips] background sync failed', e);
      }
    };
    sync();

    const onRefresh = () => {
      refresh();
    };
    const onAttendanceRefresh = () => {
      setAttendances(STORAGE.attendances.getAll());
    };
    window.addEventListener('cbl-trips-refresh', onRefresh);
    window.addEventListener('cbl-attendance-refresh', onAttendanceRefresh);
    // 也要聽 buses / drivers / nannies / students / routes 變更
    // (例如 /cbl-admin-setting/bus 增刪校巴後, 切回 schedule 開 modal 選單要立即更新)
    window.addEventListener('cbl-buses-refresh', onRefresh);
    window.addEventListener('cbl-drivers-refresh', onRefresh);
    // 保姆事件有兩種拼法並存 → 兩種都要監聽
    window.addEventListener('cbl-nannies-refresh', onRefresh);
    window.addEventListener('cbl-nannys-refresh', onRefresh);
    window.addEventListener('cbl-students-refresh', onRefresh);
    window.addEventListener('cbl-routes-refresh', onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('cbl-trips-refresh', onRefresh);
      window.removeEventListener('cbl-attendance-refresh', onAttendanceRefresh);
      window.removeEventListener('cbl-buses-refresh', onRefresh);
      window.removeEventListener('cbl-drivers-refresh', onRefresh);
      window.removeEventListener('cbl-nannies-refresh', onRefresh);
      window.removeEventListener('cbl-nannys-refresh', onRefresh);
      window.removeEventListener('cbl-students-refresh', onRefresh);
      window.removeEventListener('cbl-routes-refresh', onRefresh);
    };
  }, [clientId, refresh, isSuperAdmin]);

  // P0-3: 一次建好 Map 索引，enriched / progress 共用 — O(n×m) → O(n+m)
  //
  // ⚠️ 學生與路線是分學年的 entity → 也要依學年過濾。
  //    否則會出現「班次是 26-27, 但它的乘客清單混進 27-28 的學生」。
  const scopedStudents = useMemo(
    () => filterByAcademicYear(students, selectedYear),
    [students, selectedYear],
  );
  const scopedRoutes = useMemo(
    () => filterByAcademicYear(routes, selectedYear),
    [routes, selectedYear],
  );

  const lookupMaps = useMemo(
    () =>
      buildLookupMaps(
        buses,
        drivers,
        nannies,
        scopedStudents,
        scopedRoutes,
        attendances,
        trips,
      ),
    [
      buses,
      drivers,
      nannies,
      scopedStudents,
      scopedRoutes,
      attendances,
      trips,
    ],
  );

  const enriched: TripWithRelations[] = useMemo(
    () =>
      trips
        // ⚠️ 學年隔離: 只保留「目前檢視的學年」的班次。
        //    舊資料 (沒有 academicYear) 會被保留 (見 filterByAcademicYear 說明)。
        .filter((t) => {
          if (!t.academicYear) return true;
          return t.academicYear === selectedYear;
        })
        .map((t) => joinTripRelationsWithMaps(t, lookupMaps)),
    [trips, lookupMaps, selectedYear],
  );

  const filtered: TripWithRelations[] = useMemo(
    () =>
      sortTripsByStart(
        applyScheduleFilter(enriched, filter, tab, scopedStudents),
      ),
    [enriched, filter, tab, scopedStudents],
  );

  // P0-1: progress 只算當前 filtered 範圍 (all 模式下不算歷史全量)
  const progress: Record<string, TripProgress> = useMemo(() => {
    const m: Record<string, TripProgress> = {};
    filtered.forEach(({ trip, attendances: atts }) => {
      m[trip.id] = summarizeProgress(trip, atts);
    });
    return m;
  }, [filtered]);

  // 衝突只按「目前可見清單」計算 — 清單為空時不彈紅色 alert。
  // 舊版用全部 trips ± 7 天窗口, 今日無班仍顯示其他日期的衝突, 誤導。
  // 新版直接用 filtered 的 trips, 所見即所得。
  const conflicts: TripConflict[] = useMemo(
    () =>
      findConflicts(
        filtered.map((r) => r.trip),
        buses,
        scopedStudents,
        drivers,
        nannies,
        null,
      ),
    [filtered, buses, scopedStudents, drivers, nannies],
  );

  return {
    trips: filtered,
    // ⚠️ totalCount 是「篩選前」的全部班次數 (P0-1: 標題顯示 today n / 全部 m)
    //    這裡的「篩選前」指的是「日期/分頁篩選前」, 但仍應該已經過學年隔離 ——
    //    否則會顯示「全部 500 班」而清單只有 20 班, 使用者會以為漏資料。
    totalCount: enriched.length,
    loading,
    progress,
    conflicts,
    buses,
    drivers,
    nannies,
    students: scopedStudents,
    routes: scopedRoutes,
  };
}
