'use client';

/**
 * TripRouteFormModal — 新增 / 編輯校巴路線
 *
 * 對應使用者需求 (2026-11-03 更新):
 *   第一部分【路線主體資料 Master Info】
 *     - 路線編號  (預設 學年-R序號+時段後綴, e.g. 2627-R001AM)
 *     - 路線名稱
 *     - 行車時段類型 (Radio: 早上/下午/課外活動特快線)
 *   第二部分【核心】上落車地點與時間軸 (RouteStopsTimelineEditor)
 *     - 站點順序 (自動生成, 可拖曳)
 *     - 站點類型 (起點/分站/終點)
 *     - 大概到站時間 (Time Picker)
 *     - 站點地址
 *     - 司機/家長備註
 *     - 確定按鈕 (按下後收起站點)
 *     - 地圖路徑預覽 (依站點地址自動定位)
 *
 * 已移除: 日期 / 綁定校巴 / 指派司機 / 跟車保姆 (表單 + listing 均不顯示)。
 * 已移除: 站點 GPS / 乘客 (學生) 欄位。地圖預覽保留, 改為按站點地址自動定位。
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_ROUTE_MASTER,
  SHIFT_TYPE_OPTIONS,
  type RouteMasterInfo,
} from './types';
import { RouteStopsTimelineEditor } from './RouteStopsTimelineEditor';
import { STORAGE } from '@/lib/storage';
import type { Route, RouteStop, RouteShiftType } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  路線編號預設值 — 學年-R序號+時段後綴 (e.g. 2627-R001AM)                      */
/* -------------------------------------------------------------------------- */

/** 行車時段 → 編號後綴: 早上 AM / 下午 PM / 課外 SP */
function shiftSuffix(shift: RouteShiftType): 'AM' | 'PM' | 'SP' {
  return shift === 'morning' ? 'AM' : shift === 'afternoon' ? 'PM' : 'SP';
}

/** 自動產生的編號格式: 4 位學年 + -R + 3 位序號 + 後綴 (e.g. 2627-R001AM, 舊格式 2627-001AM 亦兼容) */
const AUTO_CODE_RE = /^\d{4}-R?\d{3}(AM|PM|SP)$/i;

/** 目前學校的學年 (cbl_clients.academicYear, 兜底 2627) */
function resolveAcademicYear(): string {
  try {
    const raw = localStorage.getItem('cbl_auth');
    const u = raw ? JSON.parse(raw) : null;
    const cid: string = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
    const client = cid ? STORAGE.clients.getById(cid) : undefined;
    if (client?.academicYear) return client.academicYear;
    const settings = cid ? STORAGE.settings.getByClient(cid) : undefined;
    if (settings?.academicYear) return settings.academicYear;
  } catch {
    /* ignore */
  }
  return '2627';
}

/**
 * 依學年 + 時段後綴產生下一個路線編號。
 * 序號在「同一學年 + 同一後綴」分組內遞增 (e.g. 2627-R001AM, 2627-R001PM 各自編號)。
 * 同時兼容舊格式 (2627-001AM, 無 R) —— 舊編號亦計入 max, 避免重號。
 */
function buildDefaultRouteCode(routes: Route[], academicYear: string, shift: RouteShiftType): string {
  const suffix = shiftSuffix(shift);
  const re = new RegExp(`^${academicYear}-R?(\\d+)${suffix}$`, 'i');
  let max = 0;
  routes.forEach((r) => {
    const m = (r.code || '').trim().match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  });
  return `${academicYear}-R${String(max + 1).padStart(3, '0')}${suffix}`;
}

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
    buses?: unknown[];
    drivers?: unknown[];
    nannies?: unknown[];
    students?: unknown[];
  };
  isSaving: boolean;
  onSave: (master: RouteMasterInfo, stops: RouteStop[]) => void;
  onClose: () => void;
  /** 嵌在 TripFormModal 內使用時需蓋過其 z-[60] → 傳 'z-[80]' */
  overlayZ?: string;
}

export function TripRouteFormModal({
  open,
  mode,
  editingRouteId,
  context,
  isSaving,
  onSave,
  onClose,
  overlayZ = 'z-50',
}: TripRouteFormModalProps) {
  const toast = useToast();
  const [master, setMaster] = React.useState<RouteMasterInfo>(EMPTY_ROUTE_MASTER);
  const [stops, setStops] = React.useState<RouteStop[]>([]);

  // 觸碰過的欄位 (避免初始全紅字)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  /* -------- open / editingRouteId 變動時重置 -------- */
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
        });
        setStops(r.stops.map((s) => ({ ...s, studentIds: [...(s.studentIds ?? [])] })));
      }
    } else {
      // 新增模式: 路線編號預設 學年-R序號+時段後綴 (e.g. 2627-R001AM)
      const ay = resolveAcademicYear();
      const existing = STORAGE.routes.getAll();
      const base = existing.length > 0 ? existing : context.routes;
      setMaster({
        ...EMPTY_ROUTE_MASTER,
        shiftType: 'morning',
        code: buildDefaultRouteCode(base, ay, 'morning'),
      });
      setStops([]);
    }
    setTouched({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, editingRouteId]);

  /* -------- 校驗: master 欄位 + stops 數量 -------- */
  const errors = React.useMemo(() => {
    const e: Record<string, string | null> = {
      code: !master.code.trim() ? '請填寫「路線編號」' : null,
      name: !master.name.trim() ? '請填寫「路線名稱」' : null,
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

  /* -------- Handlers: 切換時段, 自動調整 stops 第一/最後 kind -------- */
  const handleShiftChange = (next: RouteShiftType) => {
    setMaster((p) => {
      // 新增模式 + 編號仍是自動格式 → 跟住時段轉後綴並重取序號 (e.g. AM → PM)
      let code = p.code;
      if (mode === 'add' && AUTO_CODE_RE.test(code.trim())) {
        const ayMatch = code.trim().match(/^(\d{4})-R?\d{3}(AM|PM|SP)$/i);
        const ay = ayMatch ? ayMatch[1] : resolveAcademicYear();
        const existing = STORAGE.routes.getAll();
        code = buildDefaultRouteCode(existing.length > 0 ? existing : context.routes, ay, next);
      }
      return { ...p, shiftType: next, code };
    });
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
    ['code', 'name'].forEach((k) => (all[k] = true));
    setTouched(all);
    if (!canSubmit) {
      // 找出第一個錯誤欄位, 給 toast 一個明確訊息
      const errorMessages: Record<string, string> = {
        code: '請輸入路線編號',
        name: '請輸入路線名稱',
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
      ? '建立一條校巴路線, 含基本資料與站點時間軸。'
      : '更新路線基本資料或站點時間軸。';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="trip-form-backdrop"
            role="presentation"
            className={`fixed inset-0 ${overlayZ} flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4`}
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
                      hint="路線基本識別"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      {/* 路線編號 40% + 路線名稱 60% 同行 */}
                      <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <div className="sm:col-span-2">
                          <LabeledInput
                            id="route-form-code"
                            label="路線編號"
                            value={master.code}
                            onChange={(v) => setMaster((p) => ({ ...p, code: v }))}
                            onBlur={() => markTouched('code')}
                            placeholder="2627-R001AM"
                            required
                            icon={<Hash width={12} height={12} />}
                            maxLength={20}
                          />
                          <InlineFieldError
                            message={touched.code ? errors.code : null}
                          />
                        </div>
                        <div className="sm:col-span-3">
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
                      </div>

                      {/* 行車時段類型 (Radio) */}
                      <div className="sm:col-span-2">
                        <ShiftTypeRadio
                          value={master.shiftType}
                          onChange={handleShiftChange}
                        />
                      </div>
                    </div>
                  </section>

                  {/* ===== 右欄: Route Stops Timeline ===== */}
                  <section className="lg:max-h-[calc(92vh-180px)] lg:overflow-y-auto lg:pr-1">
                    <SectionHeading
                      n="2"
                      title="上落車地點與時間軸"
                      hint="拖曳站點以調整順序"
                    />
                    <div className="mt-3">
                      <RouteStopsTimelineEditor
                        stops={stops}
                        onChange={setStops}
                      />
                      <InlineFieldError
                        message={touched.stops ? errors.stops : null}
                      />
                    </div>
                  </section>
                </div>
              </div>

              {/* Footer — 只保留 取消 / 儲存變更 */}
              <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-end gap-2 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
}: {
  n: string;
  title: string;
  hint?: string;
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
    </div>
  );
}
