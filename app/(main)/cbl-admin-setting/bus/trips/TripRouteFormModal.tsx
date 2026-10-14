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
  Plus,
  Bus as BusIcon,
  UserCog,
  UserCheck,
  MapPin as MapPinIcon,
  Route as RouteIcon,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Pill, Dot } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_ROUTE_MASTER,
  SHIFT_TYPE_OPTIONS,
  type RouteMasterInfo,
} from './types';
import { RouteStopsTimelineEditor } from './RouteStopsTimelineEditor';
import { InlineMiniFormModal } from './InlineMiniFormModal';
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
/*  EntitySelectWithCreate — 帶「+ 在此新增」連結的 dropdown                       */
/* -------------------------------------------------------------------------- */

function EntitySelectWithCreate<T extends { id: string }>({
  id,
  label,
  value,
  options,
  onChange,
  onAddNew,
  renderLabel,
  required,
  emptyHint,
}: {
  id: string;
  label: string;
  value: string;
  options: T[];
  onChange: (next: string) => void;
  onAddNew: () => void;
  renderLabel: (o: T) => React.ReactNode;
  required?: boolean;
  emptyHint?: string;
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
      <div className="flex items-stretch gap-1">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 cursor-pointer dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
        >
          <option value="">— 請選擇 —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {typeof renderLabel(o) === 'string' ? (renderLabel(o) as string) : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAddNew}
          title="在此新增"
          className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
        >
          <Plus width={13} height={13} />
        </button>
      </div>
      {options.length === 0 && emptyHint && (
        <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
          <Info width={10} height={10} />
          {emptyHint}
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
  const [master, setMaster] = React.useState<RouteMasterInfo>(EMPTY_ROUTE_MASTER);
  const [stops, setStops] = React.useState<RouteStop[]>([]);

  // 「在表單內新增」即時清單 (加到 master.busId 等可選清單)
  const [inlineBuses, setInlineBuses] = React.useState<Bus[]>([]);
  const [inlineDrivers, setInlineDrivers] = React.useState<Driver[]>([]);
  const [inlineNannies, setInlineNannies] = React.useState<Nanny[]>([]);

  // 三個 inline mini form
  const [miniOpen, setMiniOpen] = React.useState<'bus' | 'driver' | 'nanny' | null>(null);

  // 觸碰過的欄位 (避免初始全紅字)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  /* -------- open / editingRouteId 變動時重置 -------- */
  React.useEffect(() => {
    if (open) {
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
    }
  }, [open, mode, editingRouteId, context.routes]);

  /* -------- 合併 context + inline 新增的清單 -------- */
  const allBuses = React.useMemo(() => [...context.buses, ...inlineBuses], [context.buses, inlineBuses]);
  const allDrivers = React.useMemo(() => [...context.drivers, ...inlineDrivers], [context.drivers, inlineDrivers]);
  const allNannies = React.useMemo(() => [...context.nannies, ...inlineNannies], [context.nannies, inlineNannies]);

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
          : stops.some((s) => !s.eta.trim())
          ? '有站點尚未填寫到站時間'
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
    setStops((cur) =>
      cur.map((s) => ({
        ...s,
        studentIds: s.studentIds.filter((id) => validIds.has(id)),
      })),
    );
  }, [master.busId, busStudents.length]);

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
    if (!canSubmit) return;
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
              className="relative w-full max-w-[920px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700 max-h-[92vh]"
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
                {/* ===== 第一部分: Master Info ===== */}
                <section>
                  <SectionHeading
                    n="1"
                    title="路線主體資料"
                    hint="路線基本識別與指派人員"
                    icon={<MapPinIcon width={14} height={14} />}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div>
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
                    <div>
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
                    <div className="md:col-span-2">
                      <ShiftTypeRadio
                        value={master.shiftType}
                        onChange={handleShiftChange}
                      />
                    </div>

                    {/* 指派車輛 */}
                    <div>
                      <EntitySelectWithCreate
                        id="route-form-bus"
                        label="指派車輛"
                        value={master.busId}
                        options={allBuses}
                        onChange={(v) => setMaster((p) => ({ ...p, busId: v }))}
                        onAddNew={() => setMiniOpen('bus')}
                        emptyHint="尚未建立任何校巴, 點 + 建立第一輛"
                        required
                        renderLabel={(b) => `${b.plateNumber} · ${b.model || '未填型號'} · ${b.capacity}座`}
                      />
                      <InlineFieldError
                        message={touched.busId ? errors.busId : null}
                      />
                    </div>
                    {/* 指派司機 */}
                    <div>
                      <EntitySelectWithCreate
                        id="route-form-driver"
                        label="指派司機"
                        value={master.driverId}
                        options={allDrivers}
                        onChange={(v) => setMaster((p) => ({ ...p, driverId: v }))}
                        onAddNew={() => setMiniOpen('driver')}
                        emptyHint="尚未建立任何司機, 點 + 建立第一位"
                        required
                        renderLabel={(d) => `${d.name} · ${d.phone}`}
                      />
                      <InlineFieldError
                        message={touched.driverId ? errors.driverId : null}
                      />
                    </div>

                    {/* 跟車保姆 */}
                    <div className="md:col-span-2">
                      <EntitySelectWithCreate
                        id="route-form-nanny"
                        label="跟車保姆"
                        value={master.nannyId}
                        options={allNannies}
                        onChange={(v) => setMaster((p) => ({ ...p, nannyId: v }))}
                        onAddNew={() => setMiniOpen('nanny')}
                        emptyHint="尚未建立任何保姆, 點 + 建立第一位"
                        required
                        renderLabel={(n) => `${n.name} · ${n.phone}`}
                      />
                      <InlineFieldError
                        message={touched.nannyId ? errors.nannyId : null}
                      />
                    </div>
                  </div>
                </section>

                {/* divider */}
                <div className="my-5 border-t border-slate-100 dark:border-slate-700/80" />

                {/* ===== 第二部分: Route Stops Timeline ===== */}
                <section>
                  <SectionHeading
                    n="2"
                    title="上落車地點與時間軸"
                    hint="拖曳站點以調整順序, 學生依第一步選定車輛載入"
                    icon={<RouteIcon width={14} height={14} />}
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
  icon,
  right,
}: {
  n: string;
  title: string;
  hint?: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10.5px] font-bold tracking-[0.06em] text-slate-400 dark:text-slate-500 uppercase">
            Part {n}
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
