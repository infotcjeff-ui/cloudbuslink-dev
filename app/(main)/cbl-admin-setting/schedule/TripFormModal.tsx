'use client';

import { createPortal } from 'react-dom';

/**
 * TripFormModal — Drawer 風統一新增/編輯表單
 *
 * 區塊 (沿用 /bus/trips TripRouteFormModal 的兩段式, 但精簡為一頁):
 *   基本   — 日期 / 時間 / 班次類型 / 備註
 *   人員   — 校巴 / 司機 / 保姆 (選 bus 自動帶司機 / 學生)
 *   學生   — 多選 (依 busId 過濾)
 *   站點   — 自動從 pickup/dropoff 聚合, 可手動增刪
 *   預覽   — 前 2 站 / 後 2 站 + 學生數
 *
 * 寫入 STORAGE.trips.add / update, 觸發 cbl-trips-refresh。
 * 不引入 hover, 純 active scale。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Calendar,
  Bus as BusIcon,
  Users,
  MapPin,
  AlertCircle,
  Check,
  CheckCircle2,
  Save,
  Plus,
  Pencil,
  Trash2,
  Hash,
  Route as RouteIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { STORAGE } from '@/lib/storage';
import { useToast } from '@/components/ui/toast';
import { Pill, Button, IconButton } from '../[layout]/students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../[layout]/students/design-tokens';
import {
  EntitySelectWithCreate,
  busLabel,
} from '../components/EntitySelectWithCreate';
import { InlineMiniFormModal } from '../components/InlineMiniFormModal';
import {
  localIsoDate,
  routeStopsToWaypoints,
  routeStudentIds,
  routeShiftToTripType,
  routeTimeRange,
} from './scheduleUtils';
import type {
  Trip,
  TripType,
  Bus as BusType,
  Driver,
  Nanny,
  Student,
  Waypoint,
  Location,
  Route,
} from '@/lib/types';
import type { TripFormValues } from './types';

interface TripFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: Partial<TripFormValues> | null;
  context: {
    buses: BusType[];  // DEPRECATED — 改用 STORAGE.buses.getAll() 直接讀
    drivers: Driver[];
    nannies: Nanny[];
    students: Student[];
    /** 路線模板 (Phase 2-A) — 供「套用路線模板」下拉使用 */
    routes?: Route[];
  };
  onSave: (values: TripFormValues) => void | Promise<void>;
  onClose: () => void;
}

export function TripFormModal({
  open,
  mode,
  initial,
  context,
  onSave,
  onClose,
}: TripFormModalProps) {
  const toast = useToast();
  /* ---- 表單狀態 ---- */
  const [type, setType] = React.useState<TripType>(initial?.type ?? 'morning');
  const [date, setDate] = React.useState<string>(initial?.date ?? localIsoDate());
  const [plannedStartTime, setPlannedStartTime] = React.useState(initial?.plannedStartTime ?? '07:30');
  const [plannedEndTime, setPlannedEndTime] = React.useState(initial?.plannedEndTime ?? '08:30');
  const [busId, setBusId] = React.useState(initial?.busId ?? '');
  const [nannyId, setNannyId] = React.useState(initial?.nannyId ?? '');
  const [driverId, setDriverId] = React.useState(initial?.driverId ?? '');
  const [studentIds, setStudentIds] = React.useState<string[]>(initial?.studentIds ?? []);
  const [waypoints, setWaypoints] = React.useState<Waypoint[]>(initial?.waypoints ?? []);
  const [notes, setNotes] = React.useState(initial?.notes ?? '');
  const [routeId, setRouteId] = React.useState<string>(initial?.routeId ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  /**
   * waypoints 的「來源」— 決定要不要自動重算站點。
   *
   * ⚠️ 這是本專案最嚴重的資料遺失 bug 的修法:
   *   舊版在編輯既有班次時, waypoints effect 會無條件依 studentIds 重算,
   *   把管理員手動調整過的站點 (改了時間、加了臨時站、當日已打卡) 直接洗掉。
   *
   * 三種來源:
   *   'auto'   — 由學生的 pickup/dropoffLocation 自動聚合 (預設, 新增班次時)
   *   'route'  — 由「路線模板」套用而來 (Route.stops → waypoints)
   *   'manual' — 使用者手動編輯過, 或編輯模式載入的既有站點 → 不可自動覆寫
   */
  const waypointSourceRef = React.useRef<'auto' | 'route' | 'manual'>('auto');
  /** 使用者是否主動改過校巴 (用來區分「載入 initial」與「使用者切換」) */
  const busTouchedRef = React.useRef(false);
  /**
   * B1: 套用模板前的快照 — 取消模板時還原用。
   * 只在「第一次套用模板」時存（避免連續套 A→B 時快照被 B 覆蓋）。
   */
  const templateSnapshotRef = React.useRef<{
    type: TripType;
    plannedStartTime: string;
    plannedEndTime: string;
    busId: string;
    driverId: string;
    nannyId: string;
    studentIds: string[];
    waypoints: Waypoint[];
    waypointSource: 'auto' | 'route' | 'manual';
  } | null>(null);
  /**
   * C1: 套用模板同一拍會改 busId，bus-effect 必須跳過一次，
   * 否則模板帶入的 studentIds 會被 busStudents 覆寫。
   */
  const skipNextBusEffectRef = React.useRef(false);

  // 「在表單內新增校巴」inline mini form
  const [inlineBuses, setInlineBuses] = React.useState<BusType[]>([]);
  const [busMiniOpen, setBusyMiniOpen] = React.useState(false);
  // 「在表單內新增保姆」inline mini form（中央彈出，與校巴同款）
  const [inlineNannies, setInlineNannies] = React.useState<Nanny[]>([]);
  const [nannyMiniOpen, setNannyMiniOpen] = React.useState(false);
  // 「在表單內新增司機」inline mini form（中央彈出，與校巴 / 保姆同款）
  const [inlineDrivers, setInlineDrivers] = React.useState<Driver[]>([]);
  const [driverMiniOpen, setDriverMiniOpen] = React.useState(false);

  /** 直接從 STORAGE 讀取全部校巴 (繞過 clientId 過濾) */
  const [storageBuses, setStorageBuses] = React.useState<BusType[]>([]);

  React.useEffect(() => {
    setStorageBuses(STORAGE.buses.getAll());
    const onBusRefresh = () => setStorageBuses(STORAGE.buses.getAll());
    window.addEventListener('cbl-buses-refresh', onBusRefresh);
    return () => window.removeEventListener('cbl-buses-refresh', onBusRefresh);
  }, []);

  /* ---- 重置 (modal 關閉再開) ---- */
  React.useEffect(() => {
    if (!open) return;
    setType((initial?.type as TripType) ?? 'morning');
    setDate(initial?.date ?? localIsoDate());
    setPlannedStartTime(initial?.plannedStartTime ?? '07:30');
    setPlannedEndTime(initial?.plannedEndTime ?? '08:30');
    setBusId(initial?.busId ?? '');
    setNannyId(initial?.nannyId ?? '');
    setDriverId(initial?.driverId ?? '');
    setStudentIds(initial?.studentIds ?? []);
    setWaypoints(initial?.waypoints ?? []);
    setNotes(initial?.notes ?? '');
    setRouteId(initial?.routeId ?? '');
    // 編輯模式載入既有站點 → 標記為 'manual', 自動重算 effect 不得覆寫
    waypointSourceRef.current =
      mode === 'edit' && (initial?.waypoints?.length ?? 0) > 0 ? 'manual' : 'auto';
    busTouchedRef.current = false;
    // B0 / C0: 清掉模板快照與 bus-effect 跳過旗標，避免上一次開啟的狀態污染
    templateSnapshotRef.current = null;
    skipNextBusEffectRef.current = false;
    setErrors({});
    setSuccess(false);
    setInlineBuses([]);
    setBusyMiniOpen(false);
    setInlineNannies([]);
    setNannyMiniOpen(false);
    setInlineDrivers([]);
    setDriverMiniOpen(false);
  }, [open, initial, mode]);

  /* ---- 衍生 ---- */
  // bus 查找要包含 inline 新增的校巴（否則剛新增完預覽顯示「—」）
  const bus = React.useMemo(
    () => [...context.buses, ...inlineBuses, ...storageBuses].find((b) => b.id === busId),
    [context.buses, inlineBuses, storageBuses, busId],
  );
  // driver 查找要包含 inline 新增的司機（否則剛新增完預覽顯示「未指派」）
  const driver = React.useMemo(
    () => [...context.drivers, ...inlineDrivers].find((d) => d.id === driverId),
    [context.drivers, inlineDrivers, driverId],
  );
  // A1: nanny 查找同樣要包含 inline 新增（與 driver 一致，否則剛新增完預覽顯示「未指派」）
  const nanny = React.useMemo(
    () => [...context.nannies, ...inlineNannies].find((n) => n.id === nannyId),
    [context.nannies, inlineNannies, nannyId],
  );

  const busStudents = React.useMemo(
    () => context.students.filter((s) => s.busId === busId && s.status === 'active'),
    [context.students, busId],
  );

  /* ---- Phase 2-A: 路線模板 (Route) ---- */
  const routes = React.useMemo(() => context.routes ?? [], [context.routes]);
  const selectedRoute = React.useMemo(
    () => routes.find((r) => r.id === routeId),
    [routes, routeId],
  );

  /**
   * 課外/特殊班的不在校巴名單學生
   *
   * 場景: 午班套模板時, 某學生可能臨時改車但 route.stops 仍記他,
   * 或跨線併車時 template 含非此車學生。
   *
   * 顯示上, 這些學生會在學生區以「路線學生 (未綁此車)」提示,
   * 避免「模板說有 3 個學生, 表單只顯示 2 個」的混淆。
   */
  const routeOnlyStudents = React.useMemo(() => {
    if (!routeId || !selectedRoute) return [];
    const busIds = new Set(busStudents.map((s) => s.id));
    return context.students.filter(
      (s) => studentIds.includes(s.id) && !busIds.has(s.id),
    );
  }, [routeId, selectedRoute, busStudents, context.students, studentIds]);

  /**
   * C2: 學生區顯示名單 — 有模板時為聯集（綁車學生＋路線獨有學生）。
   * 聯集計算用「模板全部學生」（routeStudentIds），而非僅已選，
   * 這樣取消勾選後還能再勾回來，不會消失。
   */
  const displayStudents = React.useMemo(() => {
    if (!routeId || !selectedRoute) return busStudents;
    const busIds = new Set(busStudents.map((s) => s.id));
    const extras = context.students.filter(
      (s) => !busIds.has(s.id) && (selectedRoute.stops ?? []).some((st) => (st.studentIds ?? []).includes(s.id)),
    );
    return [...busStudents, ...extras];
  }, [routeId, selectedRoute, busStudents, context.students]);

  /**
   * 此校巴已綁定的保姆 (busId 在 nannies.assignedBusIds 內)
   * 這只是「綁了這台車的保姆候選」, 用於自動帶入與下拉選單。
   */
  const boundNannies = React.useMemo(
    () => context.nannies.filter(
      (n) => n.status === 'active' && (n.assignedBusIds ?? []).includes(busId),
    ),
    [context.nannies, busId],
  );

  const nannyOptions = React.useMemo(
    () => {
      const base = [...context.nannies, ...inlineNannies];
      const listed = (busId
      // 已綁該車的保姆排前面, 其它 active 保姆列在後
      ? [
          ...boundNannies,
          ...base.filter(
            (n) => n.status === 'active'
              && !boundNannies.some((bn) => bn.id === n.id)
              && (!n.assignedBusIds || n.assignedBusIds.length === 0 || n.assignedBusIds.includes(busId)),
          ),
        ]
      : base.filter((n) => n.status === 'active'));
      // A2: 保底 — 當前已選的保姆一定在選項內（即使綁別台車 / inactive / 來自模板）。
      // 否則 Radix 找不到對應 <SelectItem>，欄位只會顯示 placeholder（空白）。
      if (nannyId && !listed.some((n) => n.id === nannyId)) {
        const cur = base.find((n) => n.id === nannyId);
        if (cur) return [...listed, cur];
      }
      return listed;
    },
    [context.nannies, busId, boundNannies, inlineNannies, nannyId],
  );

  // A2: 司機同理保底 — 模板帶入的司機若不在 bus.driverId 上，也要保證選項存在。
  const driverOptions = React.useMemo(
    () => {
      const base = [...context.drivers, ...inlineDrivers];
      if (driverId && !base.some((d) => d.id === driverId)) return base;
      return base;
    },
    [context.drivers, inlineDrivers, driverId],
  );

  /**
   * 套用路線模板。
   *
   * 一鍵把 Route 的 master info + stops 帶入班次:
   *   - 班次類型 (Route.shiftType → Trip.type)
   *   - 起訖時間 (第一站 / 最後一站的 ETA)
   *   - 校巴 / 司機 / 保姆 (Route 上指派的人)
   *   - 學生 (Route stops 裡出現過的學生)
   *   - 站點 (Route stops → pickup/dropoff waypoints, 依行車方向展開)
   *
   * ⚠️ 套用後 waypointSourceRef 設為 'route', 之後使用者再改學生/校巴
   *    都不會自動重算站點 (避免模板的站點順序被洗掉)。
   *
   * B1: 首次套用前先存快照（取消模板時還原用）。
   * C1: 套用同一拍會改 busId，bus-effect 必須跳過一次，
   *     否則模板的 studentIds 會被 busStudents 覆寫。
   */
  const applyRouteTemplate = React.useCallback((routeIdToApply: string) => {
    const r = routes.find((rr) => rr.id === routeIdToApply);
    if (!r) return;
    // B1: 只在第一次套用時存快照（連續套 A→B 不覆蓋，取消時回到套用前）
    if (!templateSnapshotRef.current) {
      templateSnapshotRef.current = {
        type,
        plannedStartTime,
        plannedEndTime,
        busId,
        driverId,
        nannyId,
        studentIds: [...studentIds],
        waypoints: [...waypoints],
        waypointSource: waypointSourceRef.current,
      };
    }
    // C1: 模板換車時 bus-effect 會跟著觸發，必須跳過一次
    if (r.busId && r.busId !== busId) {
      skipNextBusEffectRef.current = true;
    }
    setRouteId(r.id);

    // 班次類型 + 起訖時間 (跟模板一致, 避免顯示 07:30-08:30 但模板是 07:15-08:40)
    setType(routeShiftToTripType(r.shiftType));
    const { start, end } = routeTimeRange(r);
    if (start) setPlannedStartTime(start);
    if (end) setPlannedEndTime(end);

    // 人員
    if (r.busId) setBusId(r.busId);
    if (r.driverId) setDriverId(r.driverId);
    if (r.nannyId) setNannyId(r.nannyId);
    busTouchedRef.current = true;

    // 學生
    const rIds = routeStudentIds(r);
    setStudentIds(rIds);

    // 站點
    const wps = routeStopsToWaypoints(r, {
      studentIds: rIds,
      genId: () => STORAGE.genId('wp'),
      pickupTime: start,
      dropoffTime: end,
    });
    setWaypoints(wps);
    waypointSourceRef.current = 'route';
  }, [routes, type, plannedStartTime, plannedEndTime, busId, driverId, nannyId, studentIds, waypoints]);

  /**
   * B2: 取消套用路線模板 → 還原套用前的快照（人員＋學生＋時間＋站點）。
   * 無快照（未曾套用）才退回 auto 重算。
   */
  const revertRouteTemplate = React.useCallback(() => {
    const snap = templateSnapshotRef.current;
    setRouteId('');
    if (snap) {
      setType(snap.type);
      setPlannedStartTime(snap.plannedStartTime);
      setPlannedEndTime(snap.plannedEndTime);
      // 還原 busId 同一拍也會觸發 bus-effect，同樣要跳過一次
      if (snap.busId !== busId) {
        skipNextBusEffectRef.current = true;
      }
      setBusId(snap.busId);
      setDriverId(snap.driverId);
      setNannyId(snap.nannyId);
      setStudentIds([...snap.studentIds]);
      setWaypoints([...snap.waypoints]);
      waypointSourceRef.current = snap.waypointSource;
      templateSnapshotRef.current = null;
    } else {
      // 未曾套用 → 回到自動重算模式
      waypointSourceRef.current = 'auto';
    }
  }, [busId]);

  /**
   * 使用者手動調整站點 → 標記為 'manual', 之後自動重算不得覆寫。
   */
  const markWaypointsManual = React.useCallback(() => {
    waypointSourceRef.current = 'manual';
  }, []);

  /** 手動新增/刪除站點 / 改學生 → 脫離模板與自動重算 */
  const toggleStudent = (id: string) => {
    markWaypointsManual();
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  /* ---- 選校巴後, 自動帶入該校巴已綁的司機 / 保姆 / 學生 ----
   * 觸發時機: busId 變化時 (使用者切換校巴)。
   * - 司機: 取 bus.driverId (Bus 對司機是 1 對 1)。
   * - 保姆: 從 boundNannies 取第一個 (一個保姆可綁多台車, 該校巴只顯示一位自動帶入)。
   * - 學生: 帶入所有 busStudents (學生跟車是 1 對 1, busStudents 即「這台車的學生」)。
   * - 站點會在下一個 effect 依 studentIds 自動重算, 不需在此處理。
   * - 編輯模式 (initial 已有值) 時, 跳過自動帶入, 保留使用者既有選擇。
   *
   * ⚠️ waypointSourceRef 的處理:
   *   - 'auto'   → 換校巴 → 站點回到自動重算 (由下一個 effect 處理)
   *   - 'route'  → 換校巴 → **保留模板站點不動** (C3: 不再重建，
   *                模板順序優先；學生增刪時才按需過濾)
   *   - 'manual' → 換校巴 → 站點保持不動 (使用者刻意編輯過的結果)
   *
   *   舊版無條件設成 'auto', 導致「套用路線模板 → 換校巴」的站點被自動重算洗掉,
   *   模板的站點順序全失 (這是 Phase 2-A 實測時發現的 bug)。
   *
   * C1: 套用 / 還原模板同一拍改了 busId 時，skipNextBusEffectRef 為 true，
   *     直接跳過（模板已帶入完整 studentIds，不可被 busStudents 覆寫）。
   */
  React.useEffect(() => {
    // C1: 模板套用 / 還原帶來 busId 變化 → 跳過這一次
    if (skipNextBusEffectRef.current) {
      skipNextBusEffectRef.current = false;
      return;
    }
    if (!busId) return;
    // 編輯模式且 busId 是初始值, 跳過 (避免覆寫 initial 帶入的司機/保姆/學生)
    if (mode === 'edit' && !busTouchedRef.current) return;
    // 帶入司機 (若尚未手動指定)
    if (bus?.driverId && driverId !== bus.driverId) {
      setDriverId(bus.driverId);
    }
    // 帶入保姆 (取第一個綁該車的保姆, 僅在尚未選保姆時)
    if (!nannyId && boundNannies.length > 0) {
      setNannyId(boundNannies[0].id);
    }
    // 學生跟車是 1 對 1 → 切換校巴時, 學生成名單直接換成新校巴的學生
    // C3: 有模板時不覆寫學生（模板名單可能含跨車學生）；只在無模板時才換名單
    if (!routeId) {
      const nextStudents = busStudents.length > 0
        ? busStudents.map((s) => s.id)
        : [];
      setStudentIds(nextStudents);
    }

    // 站點來源處理 (見上方說明)
    // C3: 'route' → 換校巴時站點保持不動（模板順序優先，不重建）
    // 'auto' → 由下一個 effect 自動重算
    // 'manual' → 保持不動
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busId]);

  /* ---- 自動推算 waypoints (僅當來源為 'auto') ---- */
  React.useEffect(() => {
    // 來源不是 auto → 保留使用者 / 路線模板的站點, 絕不自動覆寫
    if (waypointSourceRef.current !== 'auto') return;

    if (!busId || studentIds.length === 0) {
      setWaypoints([]);
      return;
    }
    const selected = context.students.filter((s) => studentIds.includes(s.id));
    const pickupMap = new Map<string, Student[]>();
    const dropoffMap = new Map<string, Student[]>();
    selected.forEach((s) => {
      if (s.pickupLocation) {
        const k = `${s.pickupLocation.latitude},${s.pickupLocation.longitude}`;
        const arr = pickupMap.get(k) ?? [];
        arr.push(s);
        pickupMap.set(k, arr);
      }
      if (s.dropoffLocation) {
        const k = `${s.dropoffLocation.latitude},${s.dropoffLocation.longitude}`;
        const arr = dropoffMap.get(k) ?? [];
        arr.push(s);
        dropoffMap.set(k, arr);
      }
    });

    const next: Waypoint[] = [];
    pickupMap.forEach((stds) => {
      const loc = stds[0].pickupLocation!;
      next.push({
        id: STORAGE.genId('wp'),
        location: { ...loc },
        type: 'pickup',
        scheduledTime: plannedStartTime,
        actualTime: null,
        status: 'pending',
        studentIds: stds.map((s) => s.id),
        notes: null,
      });
    });
    dropoffMap.forEach((stds) => {
      const loc = stds[0].dropoffLocation!;
      next.push({
        id: STORAGE.genId('wp'),
        location: { ...loc },
        type: 'dropoff',
        scheduledTime: plannedEndTime,
        actualTime: null,
        status: 'pending',
        studentIds: stds.map((s) => s.id),
        notes: null,
      });
    });
    setWaypoints(next);
    // 依 studentIds 的「內容」而非「長度」觸發 ——
    // 否則「加一位、減一位」長度不變, 站點不會重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busId, studentIds.join(',')]);

  /* ---- validate ---- */
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!date) e.date = '請選擇日期';
    if (!plannedStartTime) e.start = '請選擇開始時間';
    if (!plannedEndTime) e.end = '請選擇結束時間';
    if (plannedStartTime && plannedEndTime && plannedStartTime >= plannedEndTime) {
      e.end = '結束時間需晚於開始時間';
    }
    if (!busId) e.busId = '請選擇校巴';
    if (!nannyId) e.nannyId = '請選擇保姆';
    if (studentIds.length === 0) e.students = '請選擇至少一位學生';
    if (waypoints.length === 0) e.waypoints = '請安排至少一個站點';
    if (bus && studentIds.length > bus.capacity) {
      e.capacity = `人數 ${studentIds.length} 已超出校巴容量 ${bus.capacity}`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error('請檢查並修正表單欄位');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        type,
        date,
        plannedStartTime,
        plannedEndTime,
        busId,
        driverId: driverId || bus?.driverId || '',
        nannyId,
        studentIds,
        waypoints,
        notes,
        routeId: routeId || null,
      });
      setSuccess(true);
      window.setTimeout(() => onClose(), 600);
    } catch (err) {
      console.error('[TripFormModal] submit failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`儲存失敗：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <AnimatePresence>
      {open && (
        <ModalPortal>
          <motion.div
            key="trip-form-backdrop"
            role="presentation"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={onClose}
          >
          <motion.div
            className="relative w-full max-w-[1100px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700 max-h-[92vh]"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-form-title"
            aria-busy={saving || undefined}
          >
            {/* Header — 與 TripRouteFormModal 同款 chrome */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-white dark:bg-slate-900 dark:border-slate-700/80 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100 shrink-0 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50">
                {mode === 'add' ? (
                  <Plus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="trip-form-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {mode === 'add' ? '新增班次' : '編輯班次'}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {mode === 'add'
                    ? '建立班次, 含基本資料、指派人員、學生與站點。'
                    : '更新班次基本資料、指派人員、學生或站點。'}
                </p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X width={14} height={14} />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5">
                {/* 左欄 */}
                <div className="px-5 lg:px-5 py-5 space-y-5 min-w-0">
                {/* 基本 */}
                <Section icon={<Calendar width={14} height={14} />} title="基本" n="1">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="日期" error={errors.date}>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={cn(
                          'w-full h-9 rounded-md border bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:text-slate-200',
                          errors.date
                            ? 'border-rose-300 dark:border-rose-700'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      />
                    </Field>
                    <Field label="班次類型">
                      <div className="flex items-center gap-1">
                        {(['morning', 'afternoon', 'custom'] as TripType[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={type === t}
                            onClick={() => setType(t)}
                            className={cn(
                              'h-9 flex-1 px-2.5 rounded-md text-[12px] font-medium border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                              type === t
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
                            )}
                          >
                            {t === 'morning' ? '早班' : t === 'afternoon' ? '午班' : '自訂'}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="開始時間" error={errors.start}>
                      <input
                        type="time"
                        value={plannedStartTime}
                        onChange={(e) => setPlannedStartTime(e.target.value)}
                        className={cn(
                          'w-full h-9 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:text-slate-200',
                          errors.start
                            ? 'border-rose-300 dark:border-rose-700'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      />
                    </Field>
                    <Field label="結束時間" error={errors.end}>
                      <input
                        type="time"
                        value={plannedEndTime}
                        onChange={(e) => setPlannedEndTime(e.target.value)}
                        className={cn(
                          'w-full h-9 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:text-slate-200',
                          errors.end
                            ? 'border-rose-300 dark:border-rose-700'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      />
                    </Field>
                  </div>
                  <Field label="備註 (選填)">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. 家長陪同、特殊接送需求…"
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal resize-y focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                  </Field>
                </Section>

                {/* 路線模板 (Phase 2-A) */}
                <Section icon={<RouteIcon width={14} height={14} />} title="路線模板" n="2">
                  {routes.length === 0 ? (
                    <p className="text-[12px] text-slate-500 inline-flex items-center gap-1">
                      <AlertCircle width={12} height={12} />
                      尚未建立路線模板 — 可到「校巴 › 路線」建立, 或直接手動填寫下方班次資料
                    </p>
                  ) : (
                    <>
                      <div>
                        <EntitySelectWithCreate<Route>
                          id="trip-form-route"
                          label="套用路線模板 (選填)"
                          value={routeId}
                          options={routes}
                          onChange={(v) => {
                            if (!v) {
                              // B2: 取消模板 → 還原套用前的快照（人員＋學生＋時間＋站點）
                              revertRouteTemplate();
                              return;
                            }
                            applyRouteTemplate(v);
                          }}
                          onAddNew={() => {
                            toast.info('請到「校巴 › 路線」建立路線模板, 完成後回到這裡選擇');
                          }}
                          placeholder="— 不套用模板 (手動填寫) —"
                          emptyHint="尚未建立任何路線模板, 可到「校巴 › 路線」建立第一條"
                          renderLabel={(r) => `${r.code} · ${r.name} (${r.stops?.length ?? 0} 站)`}
                        />
                      </div>
                      {selectedRoute && (
                        <div className="rounded-md border border-blue-200/70 bg-blue-50/60 px-3 py-2 space-y-1.5 dark:border-blue-800/40 dark:bg-blue-950/30">
                          <p className="text-[12px] font-medium text-blue-800 dark:text-blue-200 inline-flex items-center gap-1">
                            <CheckCircle2 width={12} height={12} />
                            已套用「{selectedRoute.name}」
                          </p>
                          <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                            {/* C4: 站點數用實際 waypoints（方向展開後），不用 stops.length，避免數字誤導 */}
                            已帶入校巴 / 司機 / 保姆 / {routeStudentIds(selectedRoute).length} 位學生 / {waypoints.length} 個站點
                          </p>
                          <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                            行車方向: {shiftTypeLabel(selectedRoute.shiftType)} · 班次類型已設為{' '}
                            {type === 'morning' ? '早班' : type === 'afternoon' ? '午班' : '自訂'} ·{' '}
                            {fmtRouteTime(selectedRoute)}
                          </p>
                          {selectedRoute.stops && selectedRoute.stops.length > 0 && (
                            <ol className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 list-decimal list-inside">
                              {[...selectedRoute.stops].sort((a, b) => a.seq - b.seq).map((s) => (
                                <li key={s.id}>{s.name} · {s.eta} · {s.studentIds?.length ?? 0} 生</li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </Section>

                {/* 人員 */}
                <Section icon={<BusIcon width={14} height={14} />} title="指派人員" n="3">
                  <div>
                    <EntitySelectWithCreate<BusType>
                      id="trip-form-bus"
                      label="綁定校巴"
                      value={busId}
                      options={[...storageBuses, ...inlineBuses]}
                      onChange={(v) => {
                        busTouchedRef.current = true;
                        setBusId(v);
                      }}
                      onAddNew={() => setBusyMiniOpen(true)}
                      emptyHint="尚未建立任何校巴, 從 dropdown 最底「＋ 在此新增…」建立第一輛"
                      renderLabel={busLabel}
                    />
                    <FieldError msg={errors.busId} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <EntitySelectWithCreate<Driver>
                        id="trip-form-driver"
                        label="指派司機"
                        value={driverId || bus?.driverId || ''}
                        options={driverOptions}
                        onChange={(v) => setDriverId(v)}
                        onAddNew={() => setDriverMiniOpen(true)}
                        emptyHint="尚未建立任何司機, 從 dropdown 最底「＋ 在此新增…」建立第一位"
                        placeholder="— 請選擇司機 —"
                        disabled={!!bus?.driverId}
                        renderLabel={(d) => `${d.name} · ${d.phone}`}
                      />
                      {bus?.driverId && (
                        <p className="mt-1 text-[10.5px] text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1">
                          <CheckCircle2 width={11} height={11} /> 已帶入綁定司機 {[...context.drivers, ...inlineDrivers].find((d) => d.id === bus.driverId)?.name ?? ''}
                        </p>
                      )}
                    </div>
                    <div>
                      <EntitySelectWithCreate<Nanny>
                        id="trip-form-nanny"
                        label="跟車保姆"
                        value={nannyId}
                        options={nannyOptions}
                        onChange={(v) => setNannyId(v)}
                        onAddNew={() => setNannyMiniOpen(true)}
                        emptyHint="尚未建立任何保姆, 從 dropdown 最底「＋ 在此新增…」建立第一位"
                        placeholder="— 請選擇保姆 —"
                        renderLabel={(n) => `${n.name} · ${n.phone}`}
                      />
                      {/* 保姆來自路線模板時才顯示來源提示；綁定車自動帶入不另顯示綠字 */}
                      {nannyId && nanny && routeId && !boundNannies.some((bn) => bn.id === nannyId) ? (
                        <p className="mt-1 text-[10.5px] text-blue-600 dark:text-blue-300 inline-flex items-center gap-1">
                          <RouteIcon width={11} height={11} /> 來自路線模板 {nanny.name}
                        </p>
                      ) : null}
                      <FieldError msg={errors.nannyId} />
                    </div>
                  </div>
                </Section>

                {/* 學生 */}
                <Section icon={<Users width={14} height={14} />} title="乘客 (學生)" n="4">
                  {!busId ? (
                    <p className="text-[12px] text-amber-600 dark:text-amber-300 inline-flex items-center gap-1">
                      <AlertCircle width={12} height={12} /> 請先選擇校巴以載入學生
                    </p>
                  ) : (busStudents.length === 0 && routeOnlyStudents.length === 0) ? (
                    <p className="text-[12px] text-slate-500">此校巴目前沒有指派學生</p>
                  ) : (
                    <>
                      {studentIds.length === busStudents.length && busStudents.length > 0 && !routeId && (
                        <p className="text-[10.5px] text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1 mb-2">
                          <CheckCircle2 width={11} height={11} /> 已自動帶入此校巴全部 {busStudents.length} 位學生 (可手動增刪)
                        </p>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            markWaypointsManual();
                            // C2: 有模板時全選 = 顯示聯集全部
                            setStudentIds(displayStudents.map((s) => s.id));
                          }}
                        >
                          全選
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            markWaypointsManual();
                            setStudentIds([]);
                          }}
                        >
                          清除
                        </Button>
                        <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
                          已選 {studentIds.length} / {displayStudents.length}
                        </span>
                        {errors.capacity && (
                          <span className="text-[10.5px] text-rose-600 inline-flex items-center gap-1">
                            <AlertCircle width={11} height={11} /> {errors.capacity}
                          </span>
                        )}
                      </div>
                      {routeOnlyStudents.length > 0 && (
                        <p className="text-[10.5px] text-blue-600 dark:text-blue-300 inline-flex items-center gap-1 mb-2 flex-wrap">
                          <RouteIcon width={11} height={11} />
                          路線學生 (未綁此車): {routeOnlyStudents.map((s) => s.name).join('、')} — 一併隨行
                        </p>
                      )}
                      <ul className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto -mx-1 px-1">
                        {/* C2: 模板模式顯示聯集（綁車學生＋路線獨有學生），兩種都可勾選 */}
                        {displayStudents.map((s) => {
                          const selected = studentIds.includes(s.id);
                          const isRouteOnly = routeId && !busStudents.some((b) => b.id === s.id);
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => toggleStudent(s.id)}
                                className={cn(
                                  'w-full text-left px-2.5 py-1.5 rounded-md text-[12px] flex items-center gap-2 transition-colors cursor-pointer',
                                  selected
                                    ? isRouteOnly
                                      ? 'bg-blue-50/60 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 ring-1 ring-blue-300 dark:ring-blue-700/50'
                                      : 'bg-blue-50/60 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60',
                                )}
                              >
                                <span className={cn(
                                  'inline-flex h-4 w-4 items-center justify-center rounded border-2 shrink-0',
                                  selected
                                    ? 'border-blue-600 bg-blue-600'
                                    : 'border-slate-300 dark:border-slate-600',
                                )}>
                                  {selected && <Check width={10} height={10} className="text-white" strokeWidth={3.5} />}
                                </span>
                                <span className="truncate flex-1 font-medium">
                                  {s.name}
                                  {isRouteOnly && <span className="ml-1 text-[10px] text-blue-500">(路線)</span>}
                                </span>
                                <span className="text-[10px] text-slate-400 tabular-nums">{s.classNumber}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  <FieldError msg={errors.students} />
                </Section>

                {/* 站點 (自動 + 可手動加/刪) */}
                <Section icon={<MapPin width={14} height={14} />} title="上落車地點與時間" n="5">
                  <FieldError msg={errors.waypoints} />
                  {waypoints.length === 0 ? (
                    <p className="text-[12px] text-slate-500">選擇校巴與學生後, 系統會自動從接送地點聚合站點。</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {waypoints.map((wp, idx) => (
                        <li
                          key={wp.id}
                          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 flex items-center gap-2"
                        >
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <Pill tone={wp.type === 'pickup' ? 'primary' : 'violet'} size="sm">
                            {wp.type === 'pickup' ? '上車' : '下車'}
                          </Pill>
                          <span className="text-[12px] truncate flex-1 font-medium text-slate-700 dark:text-slate-200">{wp.location.name}</span>
                          <input
                            type="time"
                            value={wp.scheduledTime}
                            onChange={(e) => {
                              markWaypointsManual();
                              const next = [...waypoints];
                              next[idx] = { ...wp, scheduledTime: e.target.value };
                              setWaypoints(next);
                            }}
                            className="h-7 w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-[11px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:text-slate-200"
                          />
                          <span className="text-[10px] text-slate-500 tabular-nums">{wp.studentIds.length} 生</span>
                          <IconButton
                            onClick={() => {
                              markWaypointsManual();
                              setWaypoints(waypoints.filter((_, i) => i !== idx));
                            }}
                            title="移除站點"
                            variant="danger"
                          >
                            <Trash2 width={11} height={11} />
                          </IconButton>
                        </li>
                      ))}
                      <li>
                        <Button
                          variant="secondary"
                          size="sm"
                          startIcon={<Plus width={11} height={11} />}
                          onClick={() => {
                            markWaypointsManual();
                            const loc: Location = {
                              name: '自訂站點',
                              address: '',
                              latitude: 0,
                              longitude: 0,
                              type: 'transit',
                            };
                            setWaypoints([
                              ...waypoints,
                              {
                                id: STORAGE.genId('wp'),
                                location: loc,
                                type: 'dropoff',
                                scheduledTime: plannedEndTime,
                                actualTime: null,
                                status: 'pending',
                                studentIds: [],
                                notes: null,
                              },
                            ]);
                          }}
                        >
                          手動新增站點
                        </Button>
                      </li>
                    </ul>
                  )}
                </Section>
                </div>
                {/* /左欄 */}

                {/* 右欄: 預覽 (sticky) */}
                <aside className="hidden lg:block px-5 py-5 border-l border-slate-100 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/30">
                  <div className="sticky top-0 pt-1">
                    <Section icon={<Hash width={14} height={14} />} title="預覽">
                      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-[12px] space-y-1.5">
                        <PreviewRow label="日期" value={date || '—'} />
                        <PreviewRow label="時段" value={`${plannedStartTime || '—'} → ${plannedEndTime || '—'}`} />
                        <PreviewRow label="類型" value={
                          type === 'morning' ? '早班' : type === 'afternoon' ? '午班' : '自訂'
                        } />
                        <PreviewRow label="校巴" value={bus ? `${bus.plateNumber} · ${bus.capacity}座` : '—'} />
                        <PreviewRow label="司機" value={driver?.name ?? (bus?.driverId ? '(沿用校巴司機)' : '未指派')} />
                        <PreviewRow label="保姆" value={nanny?.name ?? '未指派'} />
                        <PreviewRow
                          label="學生"
                          value={bus
                            ? `${studentIds.length} / ${bus.capacity}`
                            : `${studentIds.length} 位`}
                        />
                        <PreviewRow
                          label="站點"
                          value={waypoints.length === 0
                            ? '—'
                            : `${waypoints.length} 個`}
                        />
                        <PreviewRow
                          label="模板"
                          value={selectedRoute
                            ? `${selectedRoute.code} · ${selectedRoute.name}`
                            : '—'}
                        />
                        {waypoints.length > 0 && (
                          <p className="text-[11px] text-slate-500 leading-relaxed pt-0.5">
                            {waypoints[0].location.name}
                            {waypoints.length > 1 && ` → ${waypoints[waypoints.length - 1].location.name}`}
                          </p>
                        )}
                        {errors.busId || errors.nannyId || errors.students || errors.waypoints || errors.capacity ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-rose-600 dark:text-rose-300">
                            <AlertCircle width={11} height={11} /> 有欄位未通過驗證
                          </p>
                        ) : (
                          <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-300">
                            <CheckCircle2 width={11} height={11} /> 資料齊備,可儲存
                          </p>
                        )}
                      </div>
                    </Section>
                  </div>
                </aside>

                {/* 手機版: 仍然在底部顯示預覽 (非 sticky) */}
                <div className="lg:hidden px-5 pb-5">
                  <Section icon={<Hash width={14} height={14} />} title="預覽">
                    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40 px-3 py-2 text-[12px] space-y-1">
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">日期:</span> {date}{' '}
                        <span className="text-slate-500">·</span> {plannedStartTime} → {plannedEndTime}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">校巴:</span> {bus?.plateNumber ?? '—'}{' '}
                        <span className="text-slate-500">·</span> 司機 {driver?.name ?? (bus?.driverId ? '(沿用)' : '未指派')}
                        {' '}· 保姆 {nanny?.name ?? '未指派'}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">學生:</span> {studentIds.length} 位
                        {bus && ` / 容量 ${bus.capacity}`}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">站點:</span> {waypoints.length} 個
                        {waypoints.length > 0 && (
                          <span className="text-slate-500">
                            {' '}({waypoints[0].location.name}
                            {waypoints.length > 1 && ` … ${waypoints[waypoints.length - 1].location.name}`})
                          </span>
                        )}
                      </p>
                    </div>
                  </Section>
                </div>
              </div>
            </div>

            {/* Footer — 與 TripRouteFormModal 同款 */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone="primary" size="sm">
                  {studentIds.length} 生
                </Pill>
                <Pill tone="info" size="sm">
                  {waypoints.length} 站
                </Pill>
                {bus && (
                  <Pill tone="neutral" size="sm">
                    <BusIcon width={9} height={9} />
                    {bus.plateNumber}
                  </Pill>
                )}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  isLoading={saving}
                  disabled={saving || success}
                  startIcon={!saving && !success ? <Save width={12} height={12} /> : undefined}
                >
                  {success ? '已儲存' : mode === 'add' ? '新增班次' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
          </motion.div>
        </ModalPortal>
      )}
    </AnimatePresence>

    {/* 「在此新增校巴」inline mini form (z 比 TripFormModal 更高) */}
    <InlineMiniFormModal
      open={busMiniOpen}
      mode="bus"
      isSaving={false}
      onClose={() => setBusyMiniOpen(false)}
      onCreated={(b) => {
        setInlineBuses((prev) => [...prev, b]);
        setBusId(b.id);
        setBusyMiniOpen(false);
      }}
    />
    {/* 「在此新增保姆」inline mini form（中央彈出，與校巴同款） */}
    <InlineMiniFormModal
      open={nannyMiniOpen}
      mode="nanny"
      isSaving={false}
      onClose={() => setNannyMiniOpen(false)}
      onCreated={(n) => {
        setInlineNannies((prev) => [...prev, n]);
        setNannyId(n.id);
        setNannyMiniOpen(false);
      }}
    />
    {/* 「在此新增司機」inline mini form（中央彈出，與校巴 / 保姆同款） */}
    <InlineMiniFormModal
      open={driverMiniOpen}
      mode="driver"
      isSaving={false}
      onClose={() => setDriverMiniOpen(false)}
      onCreated={(d) => {
        setInlineDrivers((prev) => [...prev, d]);
        setDriverId(d.id);
        setDriverMiniOpen(false);
      }}
    />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                            */
/* -------------------------------------------------------------------------- */

/** Route.shiftType → 中文行車方向 */
function shiftTypeLabel(shiftType: Route['shiftType']): string {
  if (shiftType === 'morning') return '屋苑 → 學校 (沿途上車)';
  if (shiftType === 'afternoon') return '學校 → 屋苑 (沿途下車)';
  return '課外 / 方向待定';
}

/** 模板的起訖時間字串 (第一站 / 最後一站的 ETA) */
function fmtRouteTime(route: Route): string {
  const { start, end } = routeTimeRange(route);
  return `${start} → ${end}`;
}

/**
 * ModalPortal — 用 createPortal 把 children 渲染到 document.body,
 * 跳過 cbl-admin-setting layout 的 motion.div stacking context (含 transform),
 * 確保 fixed inset-0 overlay 覆蓋整個 viewport。
 *
 * - AnimatePresence 必須放外層 (它需要追蹤 React tree 內的 child)
 * - children 內的 motion.div 才用 createPortal 輸出到 body
 * - SSR 安全: typeof document 守衛
 */
function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function Section({
  icon, title, n, children,
}: {
  icon: React.ReactNode;
  title: string;
  /** 區塊編號 (對齊 TripRouteFormModal 的 SectionHeading) */
  n?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {n && (
              <span className="text-[10.5px] font-bold tracking-[0.06em] text-slate-400 dark:text-slate-500 uppercase">
                {n}.
              </span>
            )}
            <span className="text-[12.5px] font-bold text-slate-900 dark:text-slate-100">
              {title}
            </span>
          </div>
        </div>
        {icon && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 shrink-0 dark:bg-slate-800 dark:text-slate-400">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 leading-tight">
      <span className="text-slate-500 w-10 shrink-0">{label}</span>
      <span className="text-slate-700 dark:text-slate-200 font-medium break-words min-w-0">{value}</span>
    </div>
  );
}

function Field({
  label, error, children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
        {label}
      </span>
      <div className="mt-0">{children}</div>
      <FieldError msg={error} />
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1 text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {msg}
    </p>
  );
}
