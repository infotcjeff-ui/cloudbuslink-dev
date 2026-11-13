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
  ChevronLeft,
  ChevronRight,
  Info,
  Save,
  Plus,
  Pencil,
  Trash2,
  Hash,
  Route as RouteIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { STORAGE, resolveWriteAcademicYear } from '@/lib/storage';
import { useToast } from '@/components/ui/toast';
import { Pill, Button, IconButton } from '../[layout]/students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../[layout]/students/design-tokens';
import {
  EntitySelectWithCreate,
  busLabel,
} from '../components/EntitySelectWithCreate';
import { InlineMiniFormModal } from '../components/InlineMiniFormModal';
import { TripRouteFormModal } from '../bus/trips/TripRouteFormModal';
import type { RouteMasterInfo } from '../bus/trips/types';
import type { RouteStop } from '@/lib/types';
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
  const [customTypeLabel, setCustomTypeLabel] = React.useState<string>(initial?.customTypeLabel ?? '');
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
   * Wizard 步驟 (2026-10 重排):
   *   'template' — 第 1 步: 只顯示「選擇路線模板」(全屏卡片列表)
   *   'form'     — 第 2 步: 顯示 基本 / 指派人員 / 乘客 (學生) / 上落車地點與時間 / 預覽
   *
   * 編輯模式一律 'form' (既有班次可能 routeId=null, 不能強制要求模板)。
   */
  const [step, setStep] = React.useState<'template' | 'form'>('template');
  /** 新增模式且仍在第 1 步 → 顯示模板選擇頁 */
  const isTemplateStep = mode === 'add' && step === 'template';

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
    customTypeLabel: string;
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

  /**
   * 路線模板 baseline — 記住「套用模板當下」模板帶入咗咩值。
   *
   * 用嚟偵測使用者有冇改動模板帶入嘅欄位:
   *   busId / driverId / nannyId / studentIds / waypoints / plannedStartTime / plannedEndTime
   * 偏離 baseline = 使用者改過 → 顯示「以下改動只適用於今次新增的班次」提示。
   *
   * ⚠️ baseline 只喺「套用模板」嗰刻寫入, 唔會隨住使用者改動而更新,
   *    所以比較嘅係「模板原始值 vs 而家嘅值」。
   * 用 state (唔係 ref) 係因為 UI 要隨住 baseline 改變即時重繪。
   */
  const [routeBaseline, setRouteBaseline] = React.useState<{
    studentIds: string[];
    waypointSig: string;
  } | null>(null);

  // 「在表單內新增校巴」inline mini form
  const [inlineBuses, setInlineBuses] = React.useState<BusType[]>([]);
  const [busMiniOpen, setBusyMiniOpen] = React.useState(false);
  // 「在表單內新增保姆」inline mini form（中央彈出，與校巴同款）
  const [inlineNannies, setInlineNannies] = React.useState<Nanny[]>([]);
  const [nannyMiniOpen, setNannyMiniOpen] = React.useState(false);
  // 「在表單內新增司機」inline mini form（中央彈出，與校巴 / 保姆同款）
  const [inlineDrivers, setInlineDrivers] = React.useState<Driver[]>([]);
  const [driverMiniOpen, setDriverMiniOpen] = React.useState(false);
  // 「乘客 (學生)」popup — 學生名單可能好長 (30+), 主表單只顯示摘要, 點擊開 popup 勾選
  const [studentsPopupOpen, setStudentsPopupOpen] = React.useState(false);
  // 「在班次流程內直接新增路線模板」— 蓋在 TripFormModal 之上 (z 高一級)
  const [inlineRoutes, setInlineRoutes] = React.useState<Route[]>([]);
  const [routeCreatorOpen, setRouteCreatorOpen] = React.useState(false);
  const [routeCreatorSaving, setRouteCreatorSaving] = React.useState(false);

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
    setCustomTypeLabel(initial?.customTypeLabel ?? '');
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
    setRouteBaseline(null);
    setErrors({});
    setSuccess(false);
    setInlineBuses([]);
    setBusyMiniOpen(false);
    setInlineNannies([]);
    setNannyMiniOpen(false);
    setInlineDrivers([]);
    setDriverMiniOpen(false);
    setInlineRoutes([]);
    setRouteCreatorOpen(false);
    setRouteCreatorSaving(false);
    // 新增模式 → 停在第 1 步 (選路線模板); 編輯模式 → 直接顯示表單
    setStep(mode === 'add' ? 'template' : 'form');
  }, [open, initial, mode]);

  /**
   * 編輯模式: 由「路線模板本身」計 baseline。
   *
   * 新增模式 baseline 係套用模板嗰刻寫入 (見 applyRouteTemplate)。
   * 編輯模式冇「套用模板」呢個動作, 所以要由 template + routeStudentIds
   * 即場計出模板原始值, 再同班次現況比較。
   */
  React.useEffect(() => {
    if (!open || mode !== 'edit') return;
    const r = (context.routes ?? []).find((rr) => rr.id === initial?.routeId);
    if (!r) {
      setRouteBaseline(null);
      return;
    }
    const { start, end } = routeTimeRange(r);
    const rIds = routeStudentIds(r);
    const wps = routeStopsToWaypoints(r, {
      studentIds: rIds,
      genId: () => 'wp',
      pickupTime: start,
      dropoffTime: end,
    });
    setRouteBaseline({
      studentIds: [...rIds],
      waypointSig: wps
        .map((w) => `${w.type}:${w.location.name}:${w.scheduledTime}:${[...w.studentIds].sort().join(',')}`)
        .join('|'),
    });
  }, [open, mode, initial?.routeId, context.routes]);

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
  // inlineRoutes: 在班次流程內即時建立的路線 (未等 cbl-routes-refresh 回來前先顯示, 建完即選)
  const routes = React.useMemo(
    () => [...(context.routes ?? []), ...inlineRoutes],
    [context.routes, inlineRoutes],
  );
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
   * 編輯既有班次時已選的學生物件 (兜底: 即使佢哋唔再綁呢架車 / 唔在模板, 都要留返俾人睇同改)。
   *
   * 為什麼需要:
   *   截圖個案 — 班次自帶 2 個學生 (trip.studentIds 有值, 站點都有人),
   *   但佢哋嘅 student.busId 同而家揀緊嘅校巴唔同 (換過車 / 從未綁車),
   *   導致 busStudents = []、routeOnlyStudents = [] (無模板時必定 []) →
   *   表單顯示「此校巴目前沒有指派學生」, 已選嘅人都唔見埋。
   */
  const selectedStudentObjs = React.useMemo(
    () => context.students.filter((s) => studentIds.includes(s.id)),
    [context.students, studentIds],
  );

  /**
   * C2: 學生區顯示名單 — 有模板時為聯集（綁車學生＋路線獨有學生＋已選兜底）。
   * 聯集計算用「模板全部學生」（routeStudentIds），而非僅已選，
   * 這樣取消勾選後還能再勾回來，不會消失。
   * 已選兜底保證：換車 / 解綁後，已選學生唔會憑空消失。
   */
  const displayStudents = React.useMemo(() => {
    const byId = new Map<string, Student>();
    busStudents.forEach((s) => byId.set(s.id, s));
    if (routeId && selectedRoute) {
      context.students.forEach((s) => {
        if (!byId.has(s.id) && (selectedRoute.stops ?? []).some((st) => (st.studentIds ?? []).includes(s.id))) {
          byId.set(s.id, s);
        }
      });
    }
    selectedStudentObjs.forEach((s) => {
      if (!byId.has(s.id)) byId.set(s.id, s);
    });
    return [...byId.values()];
  }, [routeId, selectedRoute, busStudents, context.students, selectedStudentObjs]);

  /** 已選但無綁呢架車嘅學生 (無論有冇模板都要提示, 唔好靜靜唔見) */
  const unboundSelectedStudents = React.useMemo(() => {
    const busIds = new Set(busStudents.map((s) => s.id));
    return selectedStudentObjs.filter((s) => !busIds.has(s.id));
  }, [busStudents, selectedStudentObjs]);

  /**
   * 單行摘要用的已選學生名單 — 太多只顯示頭幾個 + 「…等 N 位」,
   * 避免單行欄位被長名單撐爆 (truncate 會處理, 但呢度直接控字數更乾淨)。
   */
  const selectedStudentNames = React.useMemo(() => {
    const names = displayStudents
      .filter((s) => studentIds.includes(s.id))
      .map((s) => s.name);
    if (names.length === 0) return '';
    if (names.length <= 3) return names.join('、');
    return `${names.slice(0, 3).join('、')}…等 ${names.length} 位`;
  }, [displayStudents, studentIds]);

  /**
   * 偏離模板 baseline 嘅欄位清單。
   *
   * 用途: 只有當使用者真係改動咗模板帶入嘅欄位時, 才需要提示
   *       「以下改動只適用於今次新增的班次」。冇改過就唔好騷擾用戶。
   *
   * 比較項目 (模板帶入嘅 field):
   *   - 學生名單
   *   - 站點 (位置 + 類型 + 預定時間)
   *   - 開始 / 結束時間
   *
   * 人員 (校巴 / 司機 / 保姆) 不再由模板帶入 — 路線已不再綁校巴,
   * 校巴由人手選擇, 故不列入偏離提示。
   */
  const routeDeviations = React.useMemo(() => {
    if (!routeBaseline) return [] as string[];
    const out: string[] = [];

    // 學生名單 (比較 id 集合, 唔理順序)
    const baseSet = new Set(routeBaseline.studentIds);
    const nowSet = new Set(studentIds);
    const studentsChanged =
      baseSet.size !== nowSet.size || [...baseSet].some((id) => !nowSet.has(id));
    if (studentsChanged) out.push('乘客 (學生)');

    // 站點 (位置 + 類型 + 時間 + 學生 的簽名)
    const nowSig = waypoints
      .map((w) => `${w.type}:${w.location.name}:${w.scheduledTime}:${[...w.studentIds].sort().join(',')}`)
      .join('|');
    if (nowSig !== routeBaseline.waypointSig) out.push('上落車地點與時間');

    return out;
  }, [routeBaseline, studentIds, waypoints]);

  /**
   * 此校巴已綁定的保姆 (busId 在 nannies.assignedBusIds 內)
   * 這只是「綁了這台車的保姆候選」, 用於自動帶入與下拉選單。
   */  const boundNannies = React.useMemo(
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
      // A2: 保底 — 當前已選的保姆一定在選項內（即使綁別台車 / inactive）。
      // 否則 Radix 找不到對應 <SelectItem>，欄位只會顯示 placeholder（空白）。
      if (nannyId && !listed.some((n) => n.id === nannyId)) {
        const cur = base.find((n) => n.id === nannyId);
        if (cur) return [...listed, cur];
      }
      return listed;
    },
    [context.nannies, busId, boundNannies, inlineNannies, nannyId],
  );

  // 司機選項保底 — 當前已選值一定在選項內。
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
   *   - 學生 (Route stops 裡出現過的學生)
   *   - 站點 (Route stops → pickup/dropoff waypoints, 依行車方向展開)
   *
   * 人員 (校巴 / 司機 / 保姆) 不再由模板帶入 — 路線已不再綁校巴,
   * 校巴由人手選擇, 司機 / 保姆在選擇校巴時由該車綁定自動填入 (見下方 bus-effect)。
   *
   * ⚠️ 套用後 waypointSourceRef 設為 'route', 之後使用者再改學生/校巴
   *    都不會自動重算站點 (避免模板的站點順序被洗掉)。
   *
   * B1: 首次套用前先存快照（取消模板時還原用）。
   */
  const applyRouteTemplate = React.useCallback((routeIdOrRoute: string | Route) => {
    const r = typeof routeIdOrRoute === 'string'
      ? routes.find((rr) => rr.id === routeIdOrRoute)
      : routeIdOrRoute;
    if (!r) return;
    // B1: 只在第一次套用時存快照（連續套 A→B 不覆蓋，取消時回到套用前）
    if (!templateSnapshotRef.current) {
      templateSnapshotRef.current = {
        type,
        customTypeLabel,
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
    // C1: 模板不再改 busId, bus-effect 無需跳過
    setRouteId(r.id);

    // 班次類型 + 起訖時間 (跟模板一致, 避免顯示 07:30-08:30 但模板是 07:15-08:40)
    setType(routeShiftToTripType(r.shiftType));
    // 套用模板時清空自訂名稱 — 模板類型由 shiftType 決定, 避免舊自訂字串殘留誤導
    setCustomTypeLabel('');
    const { start, end } = routeTimeRange(r);
    if (start) setPlannedStartTime(start);
    if (end) setPlannedEndTime(end);

    // 人員不再由模板帶入 — 校巴人手選, 司機 / 保姆等選車時由該車綁定自動填入

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

    // 記住模板帶入嘅原始值 → 之後可以偵測使用者改咗邊啲欄位
    setRouteBaseline({
      studentIds: [...rIds],
      waypointSig: wps
        .map((w) => `${w.type}:${w.location.name}:${w.scheduledTime}:${[...w.studentIds].sort().join(',')}`)
        .join('|'),
    });
    // Wizard: 套用模板後自動跳到第 2 步 (表單)
    setStep('form');
  }, [routes, type, customTypeLabel, plannedStartTime, plannedEndTime, busId, driverId, nannyId, studentIds, waypoints]);

  /**
   * 在班次流程內直接新增路線模板 → 存檔後即時套用, 留在班次流程繼續。
   *
   * 流程: TripRouteFormModal(onSave) → 寫 STORAGE + 推 Supabase →
   *       inlineRoutes 暫存 + dispatch refresh → applyRouteTemplate(newId)
   */
  const handleInlineRouteSave = React.useCallback(async (master: RouteMasterInfo, stops: RouteStop[]) => {
    setRouteCreatorSaving(true);
    try {
      const resolvedClientId = (() => {
        try {
          const raw = localStorage.getItem('cbl_auth');
          const u = raw ? JSON.parse(raw) : null;
          if (u?.clientId) return u.clientId as string;
          const firstBus = STORAGE.buses.getAll()[0];
          if (firstBus?.clientId) return firstBus.clientId as string;
          const firstRoute = STORAGE.routes.getAll()[0];
          if (firstRoute?.clientId) return firstRoute.clientId as string;
          return STORAGE.clients.getAll()[0]?.id || '';
        } catch {
          return STORAGE.clients.getAll()[0]?.id || '';
        }
      })();
      const now = new Date().toISOString();
      const newRoute: Route = {
        id: STORAGE.genId('route'),
        clientId: resolvedClientId,
        code: master.code.trim(),
        // 學年蓋章: 路線屬於建立當下的現行學年 (與路線頁 handleSave 一致)
        academicYear: resolveWriteAcademicYear(resolvedClientId),
        name: master.name.trim(),
        shiftType: master.shiftType,
        serviceDate: null,
        serviceTime: '',
        busId: '',
        driverId: '',
        nannyId: '',
        stops: stops.map((s, idx) => ({ ...s, seq: idx + 1 })),
        createdAt: now,
        updatedAt: now,
      };
      STORAGE.routes.add(newRoute);
      // 背景推雲端 (不阻擋班次流程)
      try {
        const { supabaseRouteRecords } = await import('@/lib/supabase-entities');
        const sbRes = await supabaseRouteRecords.add(newRoute);
        if (!sbRes.success) {
          console.warn('[TripFormModal] inline route cloud push failed:', sbRes.error);
          toast.warning(`路線已新增，但雲端同步失敗：${sbRes.error}`);
        }
      } catch (e) {
        console.warn('[TripFormModal] inline route cloud push failed:', e);
      }
      setInlineRoutes((prev) => [...prev, newRoute]);
      window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
      setRouteCreatorOpen(false);
      // 新增後即時套用 → 自動跳到第 2 步 (表單), 繼續整個新增班次流程
      // 直接傳 Route 物件 (唔經 routes.find), 避免 setInlineRoutes 未 flush 導致搵唔到
      applyRouteTemplate(newRoute);
      toast.success(`路線「${newRoute.name}」已新增並套用 — 請繼續完成班次資料`);
    } catch (err) {
      console.error('[TripFormModal] inline route save failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`新增路線失敗：${msg}`);
    } finally {
      setRouteCreatorSaving(false);
    }
  }, [applyRouteTemplate, toast]);

  /**
   * B2: 取消套用路線模板 → 還原套用前的快照（人員＋學生＋時間＋站點）。
   * 無快照（未曾套用）才退回 auto 重算。
   */
  const revertRouteTemplate = React.useCallback(() => {
    const snap = templateSnapshotRef.current;
    setRouteId('');
    // 清 baseline — 冇模板就唔應該再有「偏離模板」嘅提示
    setRouteBaseline(null);
    if (snap) {
      setType(snap.type);
      setCustomTypeLabel(snap.customTypeLabel);
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

  /* ---- 選校巴後, 自動帶入該校巴已綁的司機 / 保姆 ----
   * 觸發時機: busId 變化時 (使用者切換校巴)。
   * - 司機: 取 bus.driverId (Bus 對司機是 1 對 1), 直接覆寫 (換車即重帶)。
   *   若新車無綁定司機則清空, 由人手選擇。
   * - 保姆: 從 boundNannies 取第一個, 直接覆寫 (換車即重帶)。
   *   若新車無綁定保姆則清空, 由人手選擇。
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
   * C1: 還原模板同一拍改了 busId 時，skipNextBusEffectRef 為 true，
   *     直接跳過（快照已帶完整 studentIds，不可被 busStudents 覆寫）。
   */
  React.useEffect(() => {
    // C1: 模板套用 / 還原帶來 busId 變化 → 跳過這一次
    if (skipNextBusEffectRef.current) {
      skipNextBusEffectRef.current = false;
      return;
    }
    if (!busId) {
      // 未選車 → 清空司機 / 保姆等人手選 (新增模式開局 busId 本來就係空, 清空係 no-op)
      // 編輯模式且未郁過車則保留 initial 值
      if (mode === 'edit' && !busTouchedRef.current) return;
      setDriverId('');
      setNannyId('');
      return;
    }
    // 編輯模式且 busId 是初始值, 跳過 (避免覆寫 initial 帶入的司機/保姆/學生)
    if (mode === 'edit' && !busTouchedRef.current) return;
    // 選車即按該車綁定覆寫司機 / 保姆 (換車蓋掉已選值; 新車無綁定則清空等人手選)
    setDriverId(bus?.driverId ?? '');
    setNannyId(boundNannies[0]?.id ?? '');
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
    if (type === 'custom' && !customTypeLabel.trim()) e.customTypeLabel = '請輸入自訂班次名稱';

    /**
     * 人員 / 學生 / 站點 三區只喺「已套用路線模板」時顯示（新增模式）。
     * 所以新增模式冇模板 → 唔應該用隱藏欄位嘅校驗擋住用戶，
     * 而係明確要求先揀模板（否則用戶只見到「請檢查表單」但搵唔到錯）。
     * 編輯模式則照常校驗（既有班次可能有 routeId=null, 但欄位仍然顯示）。
     */
    if (mode === 'add' && !routeId) {
      e.routeId = '請先套用路線模板, 再調整人員、學生與站點';
    } else {
      if (!busId) e.busId = '請選擇校巴';
      if (!driverId) e.driverId = '請選擇司機';
      if (!nannyId) e.nannyId = '請選擇保姆';
      if (studentIds.length === 0) e.students = '請選擇至少一位學生';
      if (waypoints.length === 0) e.waypoints = '請安排至少一個站點';
      if (bus && studentIds.length > bus.capacity) {
        e.capacity = `人數 ${studentIds.length} 已超出校巴容量 ${bus.capacity}`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error(
        mode === 'add' && !routeId
          ? '請先套用路線模板, 再調整人員、學生與站點'
          : '請檢查並修正表單欄位',
      );
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        type,
        customTypeLabel: type === 'custom' ? (customTypeLabel.trim() || null) : null,
        date,
        plannedStartTime,
        plannedEndTime,
        busId,
        driverId,
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
      {open && !routeCreatorOpen && (
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
                    ? isTemplateStep
                      ? '第 1 步 — 選擇路線模板'
                      : '第 2 步 — 確認基本資料、指派人員、學生與站點。'
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
              {isTemplateStep ? (
                /* ============ 第 1 步: 選擇路線模板 (全屏) ============ */
                <RouteTemplateStep
                  routes={routes}
                  selectedId={routeId}
                  buses={[...context.buses, ...inlineBuses, ...storageBuses]}
                  students={context.students}
                  onSelect={(id) => {
                    applyRouteTemplate(id);
                    const applied = routes.find((r) => r.id === id);
                    toast.info(
                      `已套用路線模板「${applied?.name ?? ''}」— 下方改動只影響今次班次, 不會改動模板本身`,
                      6000,
                    );
                  }}
                  onCreate={() => setRouteCreatorOpen(true)}
                />
              ) : (
              <div className="lg:grid lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] lg:gap-5">
                {/* 左欄 */}
                <div className="px-5 lg:px-5 py-5 space-y-5 min-w-0">
                {/* 已選路線模板 (第 1 步的結果摘要, 可按「更換模板」回去重選) */}
                {mode === 'add' && (
                <Section icon={<RouteIcon width={14} height={14} />} title="路線模板">
                  {selectedRoute ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="min-w-0 flex-1 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 dark:border-blue-800/50 dark:bg-blue-950/30">
                        <p className="text-[12.5px] font-semibold text-blue-900 truncate dark:text-blue-200">
                          {selectedRoute.code} · {selectedRoute.name}
                        </p>
                        <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80 truncate">
                          {shiftTypeLabel(selectedRoute.shiftType)} · {fmtRouteTime(selectedRoute)} · {selectedRoute.stops?.length ?? 0} 站
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setStep('template')}
                      >
                        更換模板
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[12px] text-slate-500 inline-flex items-center gap-1 dark:text-slate-400">
                        <AlertCircle width={12} height={12} />
                        尚未選擇路線模板 — 請返回第 1 步選擇
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setStep('template')}
                      >
                        返回選擇模板
                      </Button>
                    </div>
                  )}
                </Section>
                )}
                {/* 基本 */}
                <Section icon={<Calendar width={14} height={14} />} title="基本" n="1">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="日期及時間" error={errors.date || errors.start || errors.end}>
                      <SameWidthDateTimeField
                        date={date}
                        startTime={plannedStartTime}
                        endTime={plannedEndTime}
                        onDateChange={setDate}
                        onStartChange={setPlannedStartTime}
                        onEndChange={setPlannedEndTime}
                        hasError={!!(errors.date || errors.start || errors.end)}
                      />
                    </Field>
                    <Field label="班次類型" error={errors.customTypeLabel}>
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
                      {/* 自訂班次名稱 — 選「自訂」時出現, 右邊預覽即時跟著變 */}
                      {type === 'custom' && (
                        <input
                          type="text"
                          value={customTypeLabel}
                          onChange={(e) => setCustomTypeLabel(e.target.value)}
                          placeholder="請輸入自訂班次名稱 (e.g. 課外活動、補習班…)"
                          maxLength={20}
                          className="mt-2 w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        />
                      )}
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

                {/* 路線模板 — 編輯模式沿用既有模板選單 (可更換 / 取消套用) */}
                {mode === 'edit' && (
                <Section icon={<RouteIcon width={14} height={14} />} title="路線模板">
                  {routes.length === 0 ? (
                    <p className="text-[12px] text-slate-500 inline-flex items-center gap-1">
                      <AlertCircle width={12} height={12} />
                      尚未建立路線模板 — 請到「校巴 › 路線」建立路線模板後, 回到這裡套用
                    </p>
                  ) : (
                    <>
                      <div>
                        <EntitySelectWithCreate<Route>
                          id="trip-form-route"
                          label="套用路線模板"
                          value={routeId}
                          options={routes}
                          onChange={(v) => {
                            if (!v) {
                              // B2: 取消模板 → 還原套用前的快照（人員＋學生＋時間＋站點）
                              revertRouteTemplate();
                              toast.info('已取消套用路線模板, 人員 / 學生 / 站點已還原');
                              return;
                            }
                            applyRouteTemplate(v);
                            const applied = routes.find((r) => r.id === v);
                            toast.info(
                              `已套用路線模板「${applied?.name ?? ''}」— 下方改動只影響今次班次, 不會改動模板本身`,
                              6000,
                            );
                          }}
                          onAddNew={() => setRouteCreatorOpen(true)}
                          placeholder="— 請選擇路線模板 —"
                          emptyHint="尚未建立任何路線模板, 可到「校巴 › 路線」建立第一條"
                          renderLabel={(r) => `${r.code} · ${r.name} (${r.stops?.length ?? 0} 站)`}
                        />
                        {errors.routeId && (
                          <p className="mt-1 text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
                            <AlertCircle width={10} height={10} />
                            {errors.routeId}
                          </p>
                        )}
                      </div>
                      {!selectedRoute && (
                        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1 dark:text-slate-400">
                          <Info width={12} height={12} />
                          套用路線模板後, 下方「指派人員 / 乘客 (學生) / 上落車地點與時間」三區會自動展開並帶入模板資料
                        </p>
                      )}
                    </>
                  )}
                </Section>
                )}
                {/* 人員 — 新增模式需先套用路線模板；編輯模式沿用既有班次資料（可能無模板） */}                {(mode !== 'add' || routeId) && (
                <Section icon={<BusIcon width={14} height={14} />} title="指派人員" n="2">
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
                        value={driverId}
                        options={driverOptions}
                        onChange={(v) => setDriverId(v)}
                        onAddNew={() => setDriverMiniOpen(true)}
                        emptyHint="尚未建立任何司機, 從 dropdown 最底「＋ 在此新增…」建立第一位"
                        placeholder="— 請選擇司機 —"
                        renderLabel={(d) => `${d.name} · ${d.phone}`}
                      />
                      <FieldError msg={errors.driverId} />
                      {bus?.driverId && driverId === bus.driverId && (
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
                      {/* 保姆綁定車自動帶入不另顯示來源字 */}
                      <FieldError msg={errors.nannyId} />
                    </div>
                  </div>
                </Section>
                )}

                {/* 學生 — 新增模式需先套用路線模板；編輯模式沿用既有班次資料（可能無模板） */}
                {(mode !== 'add' || routeId) && (
                <Section icon={<Users width={14} height={14} />} title="乘客 (學生)" n="3">
                  {!busId ? (
                    <p className="text-[12px] text-slate-500">請先選擇校巴以載入學生</p>
                  ) : (displayStudents.length === 0) ? (
                    <p className="text-[12px] text-slate-500">此校巴目前沒有指派學生</p>
                  ) : (
                    <>
                      {studentIds.length === busStudents.length && busStudents.length > 0 && !routeId && (
                        <p className="text-[10.5px] text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1 mb-2">
                          <CheckCircle2 width={11} height={11} /> 已自動帶入此校巴全部 {busStudents.length} 位學生 (可手動增刪)
                        </p>
                      )}
                      {/* 單行摘要 + 點擊開 popup — 避免 30+ 學生令 form 變成 15 行 */}
                      <button
                        type="button"
                        onClick={() => setStudentsPopupOpen(true)}
                        className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-left flex items-center gap-2 cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800/60"
                      >
                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">
                          已選 {studentIds.length} / {displayStudents.length}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate flex-1">
                          {studentIds.length === 0
                            ? '未選擇學生 — 點擊選取'
                            : selectedStudentNames}
                        </span>
                        <Users width={13} height={13} className="shrink-0 text-slate-400" />
                        <ChevronRight width={13} height={13} className="shrink-0 text-slate-400" />
                      </button>
                      {errors.capacity && (
                        <p className="mt-1 text-[10.5px] text-rose-600 inline-flex items-center gap-1">
                          <AlertCircle width={11} height={11} /> {errors.capacity}
                        </p>
                      )}
                      {routeOnlyStudents.length > 0 && (
                        <p className="mt-1 text-[10.5px] text-blue-600 dark:text-blue-300 inline-flex items-center gap-1 flex-wrap">
                          <RouteIcon width={11} height={11} />
                          路線學生 (未綁此車): {routeOnlyStudents.map((s) => s.name).join('、')} — 一併隨行
                        </p>
                      )}
                      {routeOnlyStudents.length === 0 && unboundSelectedStudents.length > 0 && (
                        <p className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-300 inline-flex items-center gap-1 flex-wrap">
                          <AlertCircle width={11} height={11} />
                          已選學生 (未綁此車): {unboundSelectedStudents.map((s) => s.name).join('、')} — 一併隨行
                        </p>
                      )}
                    </>
                  )}
                  <FieldError msg={errors.students} />
                </Section>
                )}

                {/* 站點 (自動 + 可手動加/刪) — 新增模式需先套用路線模板；編輯模式沿用既有班次資料 */}
                {(mode !== 'add' || routeId) && (
                <Section icon={<MapPin width={14} height={14} />} title="上落車地點與時間" n="4">
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
                )}

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
                          type === 'morning' ? '早班' : type === 'afternoon' ? '午班' : (customTypeLabel.trim() || '自訂')
                        } />
                        <PreviewRow label="校巴" value={bus ? `${bus.plateNumber} · ${bus.capacity}座` : '—'} />
                        <PreviewRow label="司機" value={driver?.name ?? '未指派'} />
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
                        {selectedRoute && (
                          <p className="text-[11px] text-slate-500 leading-relaxed pt-0.5">
                            {shiftTypeLabel(selectedRoute.shiftType)}
                            {' · '}
                            {fmtRouteTime(selectedRoute)}
                          </p>
                        )}
                        {waypoints.length > 0 && (
                          <p className="text-[11px] text-slate-500 leading-relaxed pt-0.5">
                            {waypoints[0].location.name}
                            {waypoints.length > 1 && ` → ${waypoints[waypoints.length - 1].location.name}`}
                          </p>
                        )}
                        {errors.busId || errors.driverId || errors.nannyId || errors.students || errors.waypoints || errors.capacity ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-rose-600 dark:text-rose-300">
                            <AlertCircle width={11} height={11} /> 有欄位未通過驗證
                          </p>
                        ) : (
                          <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-300">
                            <CheckCircle2 width={11} height={11} /> 資料齊備,可儲存
                          </p>
                        )}
                      </div>
                      {routeId && routeDeviations.length > 0 && (
                        <div
                          role="alert"
                          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5 dark:border-amber-800/50 dark:bg-amber-950/30"
                        >
                          <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-200 inline-flex items-center gap-1">
                            <AlertCircle width={12} height={12} />
                            以下改動只適用於今次班次
                          </p>
                          <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                            你已改動：<strong className="font-semibold">{routeDeviations.join('、')}</strong>。
                            這些改動<strong className="font-semibold">不會改動路線模板內的原有資料</strong>，
                            儲存後只會寫入今次的班次紀錄；模板本身維持原狀，日後其他班次套用同一路線時唔會受影響。
                          </p>
                          <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                            如需把改動永久更新到路線模板，請到{' '}
                            <span className="font-semibold">校巴 › 路線</span>{' '}
                            頁面編輯該路線模板（改動該模板則會影響所有套用它的班次）。
                          </p>
                        </div>
                      )}
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
                        <span className="text-slate-500">類型:</span> {type === 'morning' ? '早班' : type === 'afternoon' ? '午班' : (customTypeLabel.trim() || '自訂')}
                      </p>
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="text-slate-500">校巴:</span> {bus?.plateNumber ?? '—'}{' '}
                        <span className="text-slate-500">·</span> 司機 {driver?.name ?? '未指派'}
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
                      {selectedRoute && (
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="text-slate-500">模板:</span> {selectedRoute.name}
                          <span className="text-slate-500">
                            {' '}({shiftTypeLabel(selectedRoute.shiftType)})
                          </span>
                        </p>
                      )}
                    </div>
                    {routeId && routeDeviations.length > 0 && (
                      <div
                        role="alert"
                        className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5 dark:border-amber-800/50 dark:bg-amber-950/30"
                      >
                        <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-200 inline-flex items-center gap-1">
                          <AlertCircle width={12} height={12} />
                          以下改動只適用於今次班次
                        </p>
                        <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                          你已改動：<strong className="font-semibold">{routeDeviations.join('、')}</strong>。
                          這些改動<strong className="font-semibold">不會改動路線模板內的原有資料</strong>，
                          儲存後只會寫入今次的班次紀錄；模板本身維持原狀，日後其他班次套用同一路線時唔會受影響。
                        </p>
                      </div>
                    )}
                  </Section>
                </div>
              </div>
              )}
            </div>

            {/* Footer — 與 TripRouteFormModal 同款 */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
              {isTemplateStep ? (
                <>
                  <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                    <Info width={12} height={12} />
                    第 1 步 — 選擇路線模板後, 將自動帶入班次類型、時間、學生與站點; 校巴、司機、保姆請人手選擇
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      取消
                    </button>
                  </div>
                </>
              ) : (
                <>
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
                {mode === 'add' && (
                  <button
                    type="button"
                    onClick={() => setStep('template')}
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft width={12} height={12} />
                    上一步
                  </button>
                )}
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
                </>
              )}
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

    {/* 「乘客 (學生)」popup — 主表單只顯示單行摘要, 點擊開呢度勾選 / 取消 */}
    <StudentsPickerPopup
      open={studentsPopupOpen}
      students={displayStudents}
      selectedIds={studentIds}
      busStudents={busStudents}
      hasRoute={!!routeId}
      onToggle={(id) => toggleStudent(id)}
      onSelectAll={(ids) => {
        markWaypointsManual();
        setStudentIds(ids);
      }}
      onClose={() => setStudentsPopupOpen(false)}
    />

    {/* 「在班次流程內直接新增路線模板」— 蓋在 TripFormModal 之上 (z 高一級), 存檔後即時套用並回到班次表單繼續 */}
    <TripRouteFormModal
      open={routeCreatorOpen}
      mode="add"
      context={{
        routes,
        buses: [...context.buses, ...inlineBuses, ...storageBuses],
        drivers: [...context.drivers, ...inlineDrivers],
        nannies: [...context.nannies, ...inlineNannies],
        students: context.students,
      }}
      isSaving={routeCreatorSaving}
      onSave={handleInlineRouteSave}
      onClose={() => setRouteCreatorOpen(false)}
      overlayZ="z-[90]"
    />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * RouteTemplateStep — 第 1 步: 選擇路線模板 (全屏卡片列表)
 *
 * 設計:
 *   - 由下拉選單改成卡片列表, 因為路線模板有多個關鍵屬性 (方向 / 起訖時間 /
 *     站點數 / 隨車人數 / 校巴), 下拉選單放唔晒, 使用者只能靠文字猜。
 *   - 撳卡片即套用模板 → 自動跳到第 2 步 (表單)。
 *   - 沒有模板時顯示明確指引 + 「前往建立路線模板」連結。
 */
function RouteTemplateStep({
  routes,
  selectedId,
  buses,
  students,
  onSelect,
  onCreate,
}: {
  routes: Route[];
  selectedId: string;
  buses: BusType[];
  students: Student[];
  onSelect: (routeId: string) => void;
  onCreate: () => void;
}) {
  if (routes.length === 0) {
    return (
      <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <RouteIcon width={20} height={20} />
        </div>
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
          尚未建立路線模板
        </p>
        <p className="text-[11.5px] text-slate-500 max-w-sm dark:text-slate-400 leading-relaxed">
          新增班次需要先選擇一條路線模板 — 模板會帶入班次類型、起訖時間、
          司機、保姆、隨車學生與上落車站點。
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <RouteIcon width={12} height={12} />
          前往建立路線模板
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10.5px] font-bold tracking-[0.06em] text-slate-400 dark:text-slate-500 uppercase">
          1.
        </span>
        <span className="text-[12.5px] font-bold text-slate-900 dark:text-slate-100">
          選擇路線模板
        </span>
        <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          {routes.length} 條路線
        </span>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md bg-blue-600 text-[11px] font-semibold text-white hover:bg-blue-700 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 shrink-0"
        >
          <Plus width={11} height={11} />
          新增路線
        </button>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {routes.map((r) => {
          const { start, end } = routeTimeRange(r);
          const rIds = routeStudentIds(r);
          const bus = buses.find((b) => b.id === r.busId);
          const isSel = selectedId === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-pressed={isSel}
                className={cn(
                  'w-full text-left rounded-lg border px-3 py-2.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                  isSel
                    ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-300 dark:border-blue-500 dark:bg-blue-950/40 dark:ring-blue-700'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/20',
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12.5px] font-bold text-slate-900 truncate dark:text-slate-100">
                    {r.name}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mb-2">
                  {r.code}
                </p>

                <div className="flex flex-wrap items-center gap-1 mb-2">
                  <Pill
                    tone={r.shiftType === 'morning' ? 'primary' : r.shiftType === 'afternoon' ? 'info' : 'warning'}
                    size="sm"
                  >
                    {r.shiftType === 'morning' ? '早班' : r.shiftType === 'afternoon' ? '午班' : '課外'}
                  </Pill>
                  <Pill tone="neutral" size="sm">
                    {start} → {end}
                  </Pill>
                  <Pill tone="neutral" size="sm">
                    {r.stops?.length ?? 0} 站
                  </Pill>
                  <Pill tone="neutral" size="sm">
                    {rIds.length} 生
                  </Pill>
                </div>

                <div className="flex items-center gap-2 text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <BusIcon width={9} height={9} className="shrink-0" />
                    <span className="truncate">{bus?.plateNumber ?? '未綁校巴'}</span>
                  </span>
                  {rIds.length > 0 && (
                    <span className="truncate ml-auto shrink-0">
                      {students.filter((s) => rIds.includes(s.id)).length} 位在學生名單
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] text-slate-500 inline-flex items-center gap-1 dark:text-slate-400">
        <Info width={12} height={12} />
        選擇模板後會自動帶入班次類型、時間、學生與站點 — 校巴、司機、保姆請人手選擇, 選車後自動帶入該車綁定。
      </p>
    </div>
  );
}

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

/**
 * StudentsPickerPopup — 學生選取 popup。
 *
 * 為什麼需要: 乘客名單可以好長 (30+ 位 → 主表單會變成 15 行, 令整個 form 極長)。
 * 所以主表單只顯示單行摘要, 點擊先開呢個 popup 喺入面勾選 / 取消 / 全選。
 *
 * 勾選結果即時寫回上層 studentIds (受控), 唔使「套用」按鈕。
 */
function StudentsPickerPopup({
  open,
  students,
  selectedIds,
  busStudents,
  hasRoute,
  onToggle,
  onSelectAll,
  onClose,
}: {
  open: boolean;
  students: Student[];
  selectedIds: string[];
  busStudents: Student[];
  hasRoute: boolean;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <ModalPortal>
          <motion.div
            key="students-picker-backdrop"
            role="presentation"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={onClose}
          >
            <motion.div
              className="relative w-full max-w-[560px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700 max-h-[80vh]"
              initial={{ opacity: 0, y: MODAL_SLIDE }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: MODAL_SLIDE }}
              transition={{ duration: MODAL_FADE, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="students-picker-title"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80 shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                  <Users width={18} height={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2
                    id="students-picker-title"
                    className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                  >
                    選擇乘客 (學生)
                  </h2>
                  <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                    勾選要同行的學生 — 改動只影響今次班次
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

              {/* Toolbar */}
              <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2 dark:border-slate-700/80 shrink-0">
                <Button variant="secondary" size="sm" onClick={() => onSelectAll(students.map((s) => s.id))}>
                  全選
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onSelectAll([])}>
                  清除
                </Button>
                <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
                  已選 {selectedIds.length} / {students.length}
                </span>
              </div>

              {/* 名單 */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
                {students.length === 0 ? (
                  <p className="text-[12px] text-slate-500 py-4 text-center">
                    沒有可選的學生
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {students.map((s) => {
                      const selected = selectedIds.includes(s.id);
                      const isRouteOnly = hasRoute && !busStudents.some((b) => b.id === s.id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => onToggle(s.id)}
                            aria-pressed={selected}
                            className={cn(
                              'w-full text-left px-2.5 py-1.5 rounded-md text-[12px] flex items-center gap-2 transition-colors cursor-pointer',
                              selected
                                ? isRouteOnly
                                  ? 'bg-blue-50/60 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 ring-1 ring-blue-300 dark:ring-blue-700/50'
                                  : 'bg-blue-50/60 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60',
                            )}
                          >
                            <span
                              className={cn(
                                'inline-flex h-4 w-4 items-center justify-center rounded border-2 shrink-0',
                                selected
                                  ? 'border-blue-600 bg-blue-600'
                                  : 'border-slate-300 dark:border-slate-600',
                              )}
                            >
                              {selected && (
                                <Check width={10} height={10} className="text-white" strokeWidth={3.5} />
                              )}
                            </span>
                            <span className="truncate flex-1 font-medium">
                              {s.name}
                              {isRouteOnly && (
                                <span className="ml-1 text-[10px] text-blue-500">(路線)</span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                              {s.classNumber}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
                <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400">
                  已選 {selectedIds.length} 位學生
                </span>
                <Button variant="primary" size="sm" onClick={onClose}>
                  完成
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </ModalPortal>
      )}
    </AnimatePresence>
  );
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

/* -------------------------------------------------------------------------- */
/*  SameWidthDateField — 自訂日期選擇                                          */
/* -------------------------------------------------------------------------- */

/**
 * 為什麼不用原生 <input type="date">:
 *   原生日曆彈窗 (calendar picker) 的寬度由 browser / OS 控制 (Chrome 係 ~280px),
 *   CSS (width / ::-webkit-calendar-picker-indicator) 改唔到佢闊度,
 *   喺窄 field (grid-cols-2 一半) 會出現「彈窗闊過 field」。
 *
 * 做法: 自繪彈窗, 外層 relative + 彈窗 absolute left-0 right-0 top-full,
 *       強制同 field 一樣闊 (w-full), 唔受 browser 預設闊度影響。
 */

const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日'];

function isoToParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  return {
    y: y || now.getFullYear(),
    m: m || now.getMonth() + 1,
    d: d || now.getDate(),
  };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fmtDateZh(iso: string): string {
  if (!iso) return '';
  const { y, m, d } = isoToParts(iso);
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

function SameWidthDateField({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (iso: string) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // 撳出面 / Esc 閂彈窗
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'w-full h-9 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-colors cursor-pointer focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:text-slate-200',
          'flex items-center justify-between gap-2',
          hasError
            ? 'border-rose-300 dark:border-rose-700'
            : open
              ? 'border-blue-400'
              : 'border-slate-200 dark:border-slate-700',
        )}
      >
        <span className={cn('tabular-nums truncate', !value && 'text-slate-400 font-normal')}>
          {value ? fmtDateZh(value) : '請選擇日期'}
        </span>
        <Calendar width={14} height={14} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="選擇日期"
          className="absolute left-0 right-0 top-full z-30 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg dark:bg-slate-900 dark:border-slate-700"
        >
          <CalendarBody value={value} onPick={(iso) => { onChange(iso); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

/**
 * CalendarBody — 日曆本體 (無外框彈窗), 日期欄＋綜合欄共用。
 * 揀日子只 onPick, 閂唔閂由外層決定 (日期欄即閂 / 綜合欄留低揀時間)。
 */
function CalendarBody({
  value,
  onPick,
}: {
  value: string;
  onPick: (iso: string) => void;
}) {
  // 彈窗當前睇緊邊個月 (切月唔即時改 value, 撳到日子先 onPick)
  const [viewY, setViewY] = React.useState(() => isoToParts(value).y);
  const [viewM, setViewM] = React.useState(() => isoToParts(value).m);

  // value 喺出面變 (e.g. 模板帶入 / reset) → 彈窗月份跟住跳
  React.useEffect(() => {
    const p = isoToParts(value);
    setViewY(p.y);
    setViewM(p.m);
  }, [value ]);

  const sel = isoToParts(value);
  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // 本月格: (星期一為首欄) 前導空格 + 1..月底
  const firstWeekdayMon0 = (new Date(viewY, viewM - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekdayMon0).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const moveMonth = (delta: number) => {
    let y = viewY;
    let m = viewM + delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setViewY(y);
    setViewM(m);
  };

  return (
    <>
      {/* 月份頭 — 左右箭頭 h-8 w-8 正方形, 唔會拉扁; 標題置中 */}
      <div className="flex items-center justify-between px-2 pt-2">
        <button
          type="button"
          aria-label="上個月"
          onClick={() => moveMonth(-1)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-400"
        >
          <ChevronLeft width={14} height={14} />
        </button>
        <span className="text-[13px] font-semibold text-slate-700 tabular-nums dark:text-slate-200">
          {viewY} 年 {viewM} 月
        </span>
        <button
          type="button"
          aria-label="下個月"
          onClick={() => moveMonth(1)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-400"
        >
          <ChevronRight width={14} height={14} />
        </button>
      </div>
      {/* 星期頭 — 7 欄等寬, 每格正方形對齊日期格 */}
      <div className="grid grid-cols-7 gap-px px-2 pt-1.5 text-center text-[10px] font-medium text-slate-400">
        {WEEKDAY_ZH.map((w) => (
          <span key={w} className="flex h-6 items-center justify-center">{w}</span>
        ))}
      </div>
      {/* 日期格 — 固定 320px 寬, 每格 h-10 w-10 正方形, 唔跟 field 闊收窄 */}
      <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e-${i}`} className="h-10 w-10" />;
          const iso = toIso(viewY, viewM, day);
          const isSel = sel.y === viewY && sel.m === viewM && sel.d === day;
          const isToday = iso === todayIso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              aria-pressed={isSel}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-md text-[12px] tabular-nums cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                isSel
                  ? 'bg-blue-600 font-semibold text-white'
                  : isToday
                    ? 'font-semibold text-blue-600 ring-1 ring-inset ring-blue-300 dark:text-blue-300 dark:ring-blue-700'
                    : 'text-slate-700 dark:text-slate-200',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      {/* 今日捷徑 */}
      <div className="border-t border-slate-100 px-2 py-1 dark:border-slate-700/60">
        <button
          type="button"
          onClick={() => {
            onPick(todayIso);
            setViewY(today.getFullYear());
            setViewM(today.getMonth() + 1);
          }}
          className="w-full rounded px-1 py-1 text-center text-[11px] font-medium text-blue-600 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-blue-300"
        >
          今日 ({fmtDateZh(todayIso)})
        </button>
      </div>
    </>
  );
}

/**
 * SameWidthDateTimeField — 「日期及時間」綜合欄。
 *
 * 版面: 一個欄 (label「日期及時間」), 撳開一個同闊彈窗,
 *       上半日曆 (SameWidthDateField) + 下半開始/結束兩個 time input,
 *       一次過揀晒日期＋時段, 唔使跳三格。
 * state 照舊寫返 date / plannedStartTime / plannedEndTime, 儲存＋校驗唔變。
 */
function SameWidthDateTimeField({
  date,
  startTime,
  endTime,
  onDateChange,
  onStartChange,
  onEndChange,
  hasError,
}: {
  date: string;
  startTime: string;
  endTime: string;
  onDateChange: (iso: string) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = React.useState<{ left: number; top: number } | null>(null);

  // 計算彈窗 fixed 位置 (portal 到 body, 唔受 modal overflow / grid 半欄寬度影響)
  const placePopup = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 固定 320px 正方形日曆: 7 欄 × ~40px, cells 用 aspect-square 即正方形
    const W = 320;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    // 下面唔夠位就彈上面
    const H = 420;
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= H ? r.bottom + 4 : Math.max(8, r.top - H - 4);
    setPopPos({ left, top });
  }, []);

  const setOpenPlaced = React.useCallback((v: boolean) => {
    if (v) placePopup();
    setOpen(v);
  }, [placePopup]);

  // 撳出面 / Esc 閂彈窗 (popup 已 portal 到 body, 要同時檢查兩個 ref)
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // modal 捲動 / resize 時重算位置, 算唔到就閂 (避免錯位)
    const onReposition = () => placePopup();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, placePopup]);

  const summary = date
    ? `${fmtDateZh(date)} · ${startTime || '—'} → ${endTime || '—'}`
    : '請選擇日期及時間';

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpenPlaced(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'w-full h-9 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-colors cursor-pointer focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:text-slate-200',
          'flex items-center justify-between gap-2',
          hasError
            ? 'border-rose-300 dark:border-rose-700'
            : open
              ? 'border-blue-400'
              : 'border-slate-200 dark:border-slate-700',
        )}
      >
        <span className={cn('tabular-nums truncate', !date && 'text-slate-400 font-normal')}>
          {summary}
        </span>
        <Calendar width={14} height={14} className="shrink-0 text-slate-400" />
      </button>

      {open && popPos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="選擇日期及時間"
          style={{ position: 'fixed', left: popPos.left, top: popPos.top, width: 320, zIndex: 80 }}
          className="rounded-md border border-slate-200 bg-white shadow-xl dark:bg-slate-900 dark:border-slate-700"
        >
          {/* 上半: 日曆 (揀完唔閂, 留低繼續揀時間) */}
          <CalendarBody value={date} onPick={onDateChange} />
          {/* 下半: 開始＋結束時間 — 同一個彈窗一次過填 */}
          <div className="border-t border-slate-100 px-2 py-1.5 dark:border-slate-700/60">
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="text-[10px] font-medium text-slate-400 block mb-0.5">開始時間</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => onStartChange(e.target.value)}
                  className="w-full h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[12px] font-medium tabular-nums text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-medium text-slate-400 block mb-0.5">結束時間</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => onEndChange(e.target.value)}
                  className="w-full h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[12px] font-medium tabular-nums text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-1.5 w-full rounded-md bg-blue-600 py-1.5 text-center text-[12px] font-semibold text-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              完成
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
