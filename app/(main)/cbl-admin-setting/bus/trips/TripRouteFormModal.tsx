'use client';

/**
 * TripRouteFormModal — 新增 / 編輯校巴路線
 *
 * 對應使用者需求:
 *   第一部分【路線主體資料 Master Info】
 *     - 路線編號  (e.g. A1-AM, B3-PM)
 *     - 路線名稱
 *     - 行車時段類型 (Radio: 早上/下午/課外活動特快線)
 *     - 指派車輛 (dropdown + inline 新增, 顯示座位上限)
 *     - 指派司機 (dropdown + inline 新增)
 *     - 跟車保姆 (dropdown + inline 新增)
 *   第二部分【核心】上落車地點與時間軸 (RouteStopsTimelineEditor)
 *     - 站點順序 (自動生成, 可拖曳)
 *     - 站點類型 (起點/分站/終點)
 *     - 大概到站時間 (Time Picker)
 *     - 站點名稱
 *     - 地理定位 (選填, 地圖預覽用)
 *     - 乘客 (學生) — 依第一步選的車輛已綁定學生
 *     - 司機/家長備註
 *
 * 額外功能:
 *   - 一鍵反轉路線 (在 stops editor 內)
 *   - 地圖路徑預覽 (在 stops editor 內)
 *
 * 範圍: 僅 /cbl-admin-setting/bus/trips/ 內使用。
 *
 * 設計語言: 沿用 OneFleet Modal chrome 風格, 跟 StudentFormModal 一致。
 * 故意 hand-coded, 不用 HeroUI。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Save,
  UserPlus,
  Pencil,
  Hash,
  Type,
  Bus as BusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill, Dot } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_ROUTE_MASTER,
  SHIFT_TYPE_OPTIONS,
  type RouteMasterInfo,
} from './types';
import { RouteStopsTimelineEditor } from './RouteStopsTimelineEditor';
import { InlineMiniFormModal } from '../../components/InlineMiniFormModal';
import {
  EntitySelectWithCreate,
  busLabel,
} from '../../components/EntitySelectWithCreate';
import { STORAGE } from '@/lib/storage';
import { onNannyRefresh } from '@/lib/cbl-events';
import type { Route, RouteStop, RouteShiftType, Bus, Driver, Nanny, Student } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Local label-input helper (與 students 風格一致)                                */
/* -------------------------------------------------------------------------- */

function LabeledInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  maxLength,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
          )}
        />
      </div>
    </div>
  );
}

function InlineFieldError({ message }: { message: string | null }) {
  return (
    <div className="min-h-[14px] mt-0.5">
      {message && (
        <p className="text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {message}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ShiftTypeRadio — 時段類型 (Radio 3 選 1)                                       */
/* -------------------------------------------------------------------------- */

function ShiftTypeRadio({
  value,
  onChange,
}: {
  value: RouteShiftType;
  onChange: (next: RouteShiftType) => void;
}) {
  return (
    <div>
      <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1.5 dark:text-slate-400">
        行車時段類型 <span className="text-rose-500">*</span>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {SHIFT_TYPE_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                'text-left rounded-lg border p-2.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                active
                  ? 'border-blue-500 bg-blue-50/60 ring-1 ring-inset ring-blue-300 dark:border-blue-400 dark:bg-blue-950/40 dark:ring-blue-700/50'
                  : 'border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800/60',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full border-2 shrink-0',
                    active
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span
                  className={cn(
                    'text-[12.5px] font-semibold',
                    active
                      ? 'text-blue-900 dark:text-blue-200'
                      : 'text-slate-700 dark:text-slate-200',
                  )}
                >
                  {opt.label}
                </span>
              </div>
              <p
                className={cn(
                  'mt-0.5 text-[10.5px] pl-6',
                  active
                    ? 'text-blue-700/80 dark:text-blue-300/80'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {opt.hint}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TripRouteFormModal                                                          */
/* -------------------------------------------------------------------------- */

export interface TripRouteFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  editingRouteId?: string;
  context: {
    routes: Route[];
    buses: Bus[];
    drivers: Driver[];
    nannies: Nanny[];
    students: Student[];
  };
  isSaving: boolean;
  onSave: (master: RouteMasterInfo, stops: RouteStop[]) => void;
  onClose: () => void;
}

export function TripRouteFormModal({
  open,
  mode,
  editingRouteId,
  context,
  isSaving,
  onSave,
  onClose,
}: TripRouteFormModalProps) {
  const toast = useToast();
  const [master, setMaster] = React.useState<RouteMasterInfo>(EMPTY_ROUTE_MASTER);
  const [stops, setStops] = React.useState<RouteStop[]>([]);

  // 「在表單內新增」即時清單 (加到 master.busId 等可選清單)
  const [inlineBuses, setInlineBuses] = React.useState<Bus[]>([]);
  const [inlineDrivers, setInlineDrivers] = React.useState<Driver[]>([]);
  const [inlineNannies, setInlineNannies] = React.useState<Nanny[]>([]);

  /** 直接從 STORAGE 讀取全部校巴 (繞過 clientId 過濾) */
  const [storageBuses, setStorageBuses] = React.useState<Bus[]>([]);

  React.useEffect(() => {
    setStorageBuses(STORAGE.buses.getAll());
    const onBusRefresh = () => setStorageBuses(STORAGE.buses.getAll());
    window.addEventListener('cbl-buses-refresh', onBusRefresh);
    return () => window.removeEventListener('cbl-buses-refresh', onBusRefresh);
  }, []);

  /**
   * 直接從 STORAGE 讀取保姆清單。
   *
   * 為什麼不能只用 context.nannies (父層傳進來的):
   *   - 父層的 nannies 是「頁面 mount 時」從 STORAGE 讀的快照,
   *     校巴管理頁剛綁完保姆 → 路線頁的 context.nannies 還是舊的
   *   - 事件名又分成 cbl-nannys-refresh / cbl-nannies-refresh 兩種拼法,
   *     父層只監聽其中一種 → 有一半的更新收不到
   *   結果: 「綁定校巴」選完後, 跟車保姆查不到 → 永遠空白。
   *
   * 保險起見直接讀 STORAGE (localStorage 是唯一真實來源), 並同時監聽兩種事件名。
   */
  const [storageNannies, setStorageNannies] = React.useState<Nanny[]>([]);

  React.useEffect(() => {
    const read = () => {
      const all = STORAGE.nannies.getAll();
      try {
        const raw = localStorage.getItem('cbl_auth');
        const u = raw ? JSON.parse(raw) : null;
        const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
        if (superMode) {
          setStorageNannies(all);
          return;
        }
        // 一般角色只看自己學校的保姆 (與父層 getByClient 過濾一致)
        const cid = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
        setStorageNannies(cid ? all.filter((n) => n.clientId === cid) : []);
      } catch {
        setStorageNannies(all);
      }
    };
    read();
    // 保姆事件有兩種拼法並存 → 用共用 helper 同時監聽兩種
    const onRefresh = () => read();
    const offNanny = onNannyRefresh(onRefresh);
    window.addEventListener('cbl-buses-refresh', onRefresh);
    window.addEventListener('cbl-routes-refresh', onRefresh);
    return () => {
      offNanny();
      window.removeEventListener('cbl-buses-refresh', onRefresh);
      window.removeEventListener('cbl-routes-refresh', onRefresh);
    };
  }, []);

  // 三個 inline mini form
  const [miniOpen, setMiniOpen] = React.useState<'bus' | 'driver' | 'nanny' | null>(null);

  // 觸碰過的欄位 (避免初始全紅字)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  /* -------- open / editingRouteId 變動時重置 -------- */
  //
  // 重要: 依賴陣列裡「不可」放 context.routes。
  //   父層每次 reload 都會產生新的 routes array (即使內容沒變) →
  //   這個 effect 會不斷重跑 → 把使用者剛選的校巴 / 保姆 / 站點全部清掉。
  //   症狀: 選了校巴 → 保姆欄位被清空 → 存檔失敗。
  // 解法: 用 ref 追蹤「已經初始化過的 editingRouteId」, 只在 modal 真正開啟
  //       或切換到另一條路線時重置一次。
  const initializedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      initializedForRef.current = null;
      return;
    }
    // 同一條路線已經初始化過 → 不重置 (避免父層 re-render 把表單洗掉)
    const initKey = mode === 'edit' && editingRouteId ? editingRouteId : '__new__';
    if (initializedForRef.current === initKey) return;
    initializedForRef.current = initKey;

    if (mode === 'edit' && editingRouteId) {
      const r = context.routes.find((rr) => rr.id === editingRouteId);
      if (r) {
        setMaster({
          code: r.code,
          name: r.name,
          shiftType: r.shiftType,
          busId: r.busId,
          driverId: r.driverId,
          nannyId: r.nannyId,
        });
        setStops(r.stops.map((s) => ({ ...s, studentIds: [...s.studentIds] })));
      }
    } else {
      setMaster(EMPTY_ROUTE_MASTER);
      setStops([]);
    }
    setInlineBuses([]);
    setInlineDrivers([]);
    setInlineNannies([]);
    setTouched({});
    setMiniOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, editingRouteId]);

  /* -------- 合併 storage + inline 新增的清單 -------- */
  const allBuses = React.useMemo(() => [...storageBuses, ...inlineBuses], [storageBuses, inlineBuses]);
  const allDrivers = React.useMemo(() => [...context.drivers, ...inlineDrivers], [context.drivers, inlineDrivers]);

  /**
   * 保姆清單: 以 STORAGE 為主 (最新), 再補上 context 與 inline 建立的。
   * 去重 (by id) — STORAGE 與 context 可能是同一筆資料的不同快照。
   */
  const allNannies = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Nanny[] = [];
    [...storageNannies, ...context.nannies, ...inlineNannies].forEach((n) => {
      if (!n || seen.has(n.id)) return;
      seen.add(n.id);
      out.push(n);
    });
    return out;
  }, [storageNannies, context.nannies, inlineNannies]);

  /**
   * 校正 master.nannyId —— 解決「編輯路線時跟車保姆顯示 undefined」。
   *
   * 背景:
   *   路線存的 nannyId 可能「指向不存在的保姆」(該保姆被刪 / 資料還沒同步過 /
   *   雲端既有資料是舊的)。此時 dropdown 找不到對應 option, Radix 只能顯示
   *   一個只有 id 的殼 → 使用者看到 "undefined · undefined"。
   *
   * 處理順序:
   *   1. nannyId 指向的保姆存在 → 保持不動 (使用者可能刻意選別的保姆)
   *   2. nannyId 無效, 但該車有綁保姆 → 自動改帶該車綁定的保姆 (且該保姆存在於清單)
   *   3. nannyId 無效, 該車沒綁保姆 → 清空 (讓使用者自己選)
   *
   * 注意: 只在「nannyId 無效」時才動, 所以使用者手動改選後不會被覆蓋。
   */
  React.useEffect(() => {
    if (!master.nannyId) return;
    // 已找到對應實體 → 不動
    if (allNannies.some((n) => n.id === master.nannyId)) return;

    // 找該校巴綁定的保姆 (且必須真的在清單裡, 否則帶進去還是 undefined)
    const boundNanny = allNannies.find(
      (n) => n.status === 'active' && (n.assignedBusIds ?? []).includes(master.busId),
    );

    setMaster((p) => {
      if (p.nannyId !== master.nannyId) return p; // 期間已被使用者改掉 → 不動
      return { ...p, nannyId: boundNanny ? boundNanny.id : '' };
    });
  }, [allNannies, master.busId, master.nannyId]);

  /* -------- 第一步選定車輛 → 學生清單 -------- */
  const busStudents = React.useMemo(
    () => context.students.filter((s) => s.busId === master.busId && s.status === 'active'),
    [context.students, master.busId],
  );

  /* -------- 校驗: master 欄位 + stops 數量 -------- */
  const errors = React.useMemo(() => {
    const e: Record<string, string | null> = {
      code: !master.code.trim() ? '請填寫「路線編號」' : null,
      name: !master.name.trim() ? '請填寫「路線名稱」' : null,
      busId: !master.busId ? '請選擇車輛' : null,
      driverId: !master.driverId ? '請選擇司機' : null,
      nannyId: !master.nannyId ? '請選擇跟車保姆' : null,
      stops:
        stops.length < 2
          ? '至少需要 2 個站點 (起點 + 終點)'
          : !stops.some((s) => s.kind === 'origin')
          ? '缺少「起點站」'
          : !stops.some((s) => s.kind === 'terminal')
          ? '缺少「終點站」'
          : stops.some((s) => !s.name.trim())
          ? '有站點尚未填寫名稱'
          : null,
    };
    return e;
  }, [master, stops]);

  const canSubmit = !isSaving && Object.values(errors).every((e) => e === null);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  /* -------- 切換車輛時, 把 stops 內「已不屬於此車輛的學生」清空 (避免髒資料) -------- */
  React.useEffect(() => {
    if (!master.busId) return;
    const validIds = new Set(busStudents.map((s) => s.id));
    setStops((cur) => {
      // 沒有髒資料就不 set, 避免無限重算
      let dirty = false;
      const next = cur.map((s) => {
        const filtered = s.studentIds.filter((id) => validIds.has(id));
        if (filtered.length !== s.studentIds.length) dirty = true;
        return { ...s, studentIds: filtered };
      });
      return dirty ? next : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.busId, context.students]);

  /* -------- 選車輛 → 自動帶入該車已綁司機 + 已綁保姆；取消選車 → 一併清空 -------- */
  const handleBusChange = React.useCallback(
    (nextBusId: string) => {
      setMaster((p) => {
        if (!nextBusId) return { ...p, busId: '', driverId: '', nannyId: '' };
        const boundBus = allBuses.find((b) => b.id === nextBusId)
          ?? context.buses.find((b) => b.id === nextBusId);
        const next: typeof p = { ...p, busId: nextBusId };
        // 該車有綁司機 → 預選該司機；無綁定 → 清空回「— 請選擇 —」
        // (使用者仍可手動改選其它司機)
        next.driverId = boundBus?.driverId ?? '';
        // 該車有綁保姆 (nanny.assignedBusIds 含此車) → 預選第一位 active 保姆；
        // 無綁定 → 清空回「— 請選擇 —」
        //
        // 用 allNannies (STORAGE 為主的合併清單) 查找 —— 舊版只查 context.nannies,
        // 而 context.nannies 是頁面 mount 時的快照, 校巴管理頁剛綁的保姆不在裡面,
        // 結果就是「選了校巴但跟車保姆空白」。
        const boundNanny = allNannies.find(
          (n) => n.status === 'active' && (n.assignedBusIds ?? []).includes(nextBusId),
        );
        next.nannyId = boundNanny ? boundNanny.id : '';
        return next;
      });
      markTouched('busId');
    },
    [allBuses, allNannies, context.buses],
  );

  /** 目前所選校巴 (用於司機提示文案) */
  const selectedBus = React.useMemo(
    () => allBuses.find((b) => b.id === master.busId) ?? context.buses.find((b) => b.id === master.busId),
    [allBuses, context.buses, master.busId],
  );
  const boundDriverName = React.useMemo(() => {
    if (!selectedBus?.driverId) return '';
    return (
      allDrivers.find((d) => d.id === selectedBus.driverId)?.name
      ?? context.drivers.find((d) => d.id === selectedBus!.driverId!)?.name
      ?? ''
    );
  }, [selectedBus, allDrivers, context.drivers]);

  /* -------- Handlers: 切換時段, 自動調整 stops 第一/最後 kind -------- */
  const handleShiftChange = (next: RouteShiftType) => {
    setMaster((p) => ({ ...p, shiftType: next }));
    if (stops.length > 0) {
      // 早上: 起點=首站, 終點=末站
      // 下午: 起點=學校 (末站), 終點=首站 (學生下車的地方)
      // 課外: 保留使用者決定
      if (next === 'morning' || next === 'afternoon') {
        const sorted = [...stops];
        // 確保起點/終點標記正確
        if (sorted[0].kind !== 'origin') sorted[0] = { ...sorted[0], kind: 'origin' };
        if (sorted[sorted.length - 1].kind !== 'terminal') {
          sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], kind: 'terminal' };
        }
        // 確保中間不重複起/終
        sorted.forEach((s, i) => {
          if (i > 0 && i < sorted.length - 1) {
            if (s.kind === 'origin' || s.kind === 'terminal') {
              sorted[i] = { ...s, kind: 'middle' };
            }
          }
        });
        setStops(sorted.map((s, i) => ({ ...s, seq: i + 1 })));
      }
    }
  };

  const handleSubmit = () => {
    // 觸碰所有欄位
    const all: Record<string, boolean> = {};
    ['code', 'name', 'busId', 'driverId', 'nannyId'].forEach((k) => (all[k] = true));
    setTouched(all);
    if (!canSubmit) {
      // 找出第一個錯誤欄位, 給 toast 一個明確訊息
      const errorMessages: Record<string, string> = {
        code: '請輸入路線編號',
        name: '請輸入路線名稱',
        busId: '請選擇車輛',
        driverId: '請選擇司機',
        nannyId: '請選擇保姆',
      };
      const firstError = Object.entries(errors).find(([, v]) => v !== null)?.[0] ?? '';
      toast.error(errorMessages[firstError] || '請檢查並修正表單欄位');
      return;
    }
    onSave(master, stops);
  };

  const title = mode === 'add' ? '新增路線' : '編輯路線';
  const subtitle =
    mode === 'add'
      ? '建立一條校巴路線, 含基本資料、指派人員與站點時間軸。'
      : '更新路線基本資料、指派人員或站點時間軸。';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="trip-form-backdrop"
            role="presentation"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
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
              aria-busy={isSaving || undefined}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-white dark:bg-slate-900 dark:border-slate-700/80 shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100 shrink-0 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50">
                  {mode === 'add' ? (
                    <UserPlus width={18} height={18} />
                  ) : (
                    <Pencil width={18} height={18} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2
                    id="trip-form-title"
                    className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {title}
                  </h2>
                  <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                    {subtitle}
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
              <div className="px-5 py-5 overflow-y-auto flex-1 min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* ===== 左欄: Master Info ===== */}
                  <section className="lg:border-r lg:border-slate-100 lg:pr-5 lg:dark:border-slate-700/80">
                    <SectionHeading
                      n="1"
                      title="路線主體資料"
                      hint="路線基本識別與指派人員"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      <div className="sm:col-span-2">
                        <LabeledInput
                          id="route-form-code"
                          label="路線編號"
                          value={master.code}
                          onChange={(v) => setMaster((p) => ({ ...p, code: v }))}
                          onBlur={() => markTouched('code')}
                          placeholder="A1-AM"
                          required
                          icon={<Hash width={12} height={12} />}
                          maxLength={20}
                        />
                        <InlineFieldError
                          message={touched.code ? errors.code : null}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <LabeledInput
                          id="route-form-name"
                          label="路線名稱"
                          value={master.name}
                          onChange={(v) => setMaster((p) => ({ ...p, name: v }))}
                          onBlur={() => markTouched('name')}
                          placeholder="沙田及馬鞍山早上線"
                          required
                          icon={<Type width={12} height={12} />}
                          maxLength={50}
                        />
                        <InlineFieldError
                          message={touched.name ? errors.name : null}
                        />
                      </div>

                      {/* 行車時段類型 (Radio) */}
                      <div className="sm:col-span-2">
                        <ShiftTypeRadio
                          value={master.shiftType}
                          onChange={handleShiftChange}
                        />
                      </div>

                      {/* 綁定校巴 */}
                      <div>
                        <EntitySelectWithCreate<Bus>
                          id="route-form-bus"
                          label="綁定校巴"
                          value={master.busId}
                          options={allBuses}
                          onChange={handleBusChange}
                          onAddNew={() => setMiniOpen('bus')}
                          emptyHint="尚未建立任何校巴, 從 dropdown 最底「＋ 在此新增…」建立第一輛"
                          required
                          renderLabel={busLabel}
                        />
                        <InlineFieldError
                          message={touched.busId ? errors.busId : null}
                        />
                      </div>
                      {/* 指派司機 (選車後若該車已綁司機, 自動帶入) */}
                      <div>
                        <EntitySelectWithCreate
                          id="route-form-driver"
                          label="指派司機"
                          value={master.driverId}
                          options={allDrivers}
                          onChange={(v) => setMaster((p) => ({ ...p, driverId: v }))}
                          onAddNew={() => setMiniOpen('driver')}
                          emptyHint="尚未建立任何司機, 從 dropdown 最底「＋ 在此新增…」建立第一位"
                          required
                          renderLabel={(d) => `${d.name} · ${d.phone}`}
                        />
                        {selectedBus?.driverId && master.driverId === selectedBus.driverId && boundDriverName ? (
                          <p className="mt-1 text-[10.5px] text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                            已帶入該校巴綁定司機 {boundDriverName}
                          </p>
                        ) : null}
                        <InlineFieldError
                          message={touched.driverId ? errors.driverId : null}
                        />
                      </div>

                      {/* 跟車保姆 (選車後若該車已綁保姆, 自動帶入) */}
                      <div className="sm:col-span-2">
                        <EntitySelectWithCreate
                          id="route-form-nanny"
                          label="跟車保姆"
                          value={master.nannyId}
                          options={allNannies}
                          onChange={(v) => setMaster((p) => ({ ...p, nannyId: v }))}
                          onAddNew={() => setMiniOpen('nanny')}
                          emptyHint="尚未建立任何保姆, 從 dropdown 最底「＋ 在此新增…」建立第一位"
                          required
                          renderLabel={(n) => `${n.name} · ${n.phone}`}
                        />
                        <InlineFieldError
                          message={touched.nannyId ? errors.nannyId : null}
                        />
                      </div>
                    </div>
                  </section>

                  {/* ===== 右欄: Route Stops Timeline ===== */}
                  <section className="lg:max-h-[calc(92vh-180px)] lg:overflow-y-auto lg:pr-1">
                    <SectionHeading
                      n="2"
                      title="上落車地點與時間軸"
                      hint="拖曳站點以調整順序, 學生依第一步選定車輛載入"
                      right={
                        master.busId ? (
                          <Pill tone="info" size="sm">
                            <BusIcon width={9} height={9} />
                            {busStudents.length} 位已綁定學生
                          </Pill>
                        ) : (
                          <Pill tone="warning" size="sm">
                            請先選車輛
                          </Pill>
                        )
                      }
                    />
                    <div className="mt-3">
                      <RouteStopsTimelineEditor
                        stops={stops}
                        onChange={setStops}
                        busId={master.busId}
                        busStudents={busStudents}
                      />
                      <InlineFieldError
                        message={touched.stops ? errors.stops : null}
                      />
                    </div>
                  </section>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
                <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                  <Pill tone="primary" size="sm">
                    {stops.length} 站
                  </Pill>
                  {stops.reduce((acc, s) => acc + s.studentIds.length, 0) > 0 && (
                    <Pill tone="info" size="sm">
                      {stops.reduce((acc, s) => acc + s.studentIds.length, 0)} 生
                    </Pill>
                  )}
                  {master.busId && (
                    <Pill tone="neutral" size="sm">
                      <BusIcon width={9} height={9} />
                      {allBuses.find((b) => b.id === master.busId)?.plateNumber || '—'}
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
                    isLoading={isSaving}
                    disabled={!canSubmit}
                    startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                  >
                    {mode === 'add' ? '新增路線' : '儲存變更'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 三個 inline mini forms (z 60, 在主 modal 之上) */}
      {miniOpen === 'bus' && (
        <InlineMiniFormModal
          open
          mode="bus"
          isSaving={isSaving}
          onClose={() => setMiniOpen(null)}
          onCreated={(b) => {
            setInlineBuses((prev) => [...prev, b]);
            setMaster((p) => ({ ...p, busId: b.id }));
            markTouched('busId');
            setMiniOpen(null);
          }}
        />
      )}
      {miniOpen === 'driver' && (
        <InlineMiniFormModal
          open
          mode="driver"
          isSaving={isSaving}
          onClose={() => setMiniOpen(null)}
          onCreated={(d) => {
            setInlineDrivers((prev) => [...prev, d]);
            setMaster((p) => ({ ...p, driverId: d.id }));
            markTouched('driverId');
            setMiniOpen(null);
          }}
        />
      )}
      {miniOpen === 'nanny' && (
        <InlineMiniFormModal
          open
          mode="nanny"
          isSaving={isSaving}
          onClose={() => setMiniOpen(null)}
          onCreated={(n) => {
            setInlineNannies((prev) => [...prev, n]);
            setMaster((p) => ({ ...p, nannyId: n.id }));
            markTouched('nannyId');
            setMiniOpen(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  SectionHeading — modal 內的 section title                                      */
/* -------------------------------------------------------------------------- */

function SectionHeading({
  n,
  title,
  hint,
  right,
}: {
  n: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10.5px] font-bold tracking-[0.06em] text-slate-400 dark:text-slate-500 uppercase">
            {n}.
          </span>
          <span className="text-[12.5px] font-bold text-slate-900 dark:text-slate-100">
            {title}
          </span>
          {hint && (
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-normal">
              · {hint}
            </span>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}
