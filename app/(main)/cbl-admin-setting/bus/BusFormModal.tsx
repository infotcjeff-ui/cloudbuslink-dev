'use client';

/**
 * Add / Edit Bus Modal — 自刻 OneFleet-style
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §14 Modal Chrome (Hand-Coded, Not HeroUI)
 *   §16 Form Field Primitives
 *   §21 Modal Footer
 *
 * 範圍: 僅 /cbl-admin-setting/bus/ 內使用。
 *
 * 表單欄位:
 *   - 車牌 (Plate Number)        - 必填, 自動轉大寫
 *   - 型號 (Model)               - 必填
 *   - 座位上限 (Capacity)        - 必填, 數字
 *   - 司機 (Driver)              - 選填, dropdown
 *   - GPS 裝置 ID (Device ID)    - 選填, 文字
 *   - 狀態 (Status)              - 必填, toggle cards (active/maintenance/inactive)
 *
 * - 不引入 HeroUI, 也不依賴全域 components/ui/* (手刻風格)。
 * - 用 framer-motion 進出場 (modalfade=0.14, modalslide=6)。
 * - 表單欄位: 2-column grid + 全寬欄位。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserPlus,
  Pencil,
  X,
  Save,
  Hash,
  Type,
  Bus as BusIcon,
  UserCog,
  Wifi,
  CheckCircle2,
  Wrench,
  PowerOff,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Pill } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_BUS_FORM,
  type BusFormState,
  type BusesPageContext,
} from './types';
import type { Bus, Driver } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  LabeledInput — 2-欄 grid 表單欄位                                            */
/* -------------------------------------------------------------------------- */

function LabeledInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = 'text',
  required,
  inputMode,
  maxLength,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'number';
  required?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric';
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
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
          )}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NativeSelect — 包裝 native <select>                                          */
/* -------------------------------------------------------------------------- */

function NativeSelect({
  id,
  label,
  value,
  onChange,
  required,
  children,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  children: React.ReactNode;
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
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors cursor-pointer dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
          )}
        >
          {children}
        </select>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StatusCard — 校巴狀態選擇 (3 種 toggle cards)                                 */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS: {
  value: Bus['status'];
  label: string;
  hint: string;
  icon: React.ReactNode;
  ring: string;
  activeRing: string;
}[] = [
  {
    value: 'active',
    label: '運行中',
    hint: '正常提供服務',
    icon: <CheckCircle2 width={14} height={14} />,
    ring: 'border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800/60',
    activeRing: 'border-emerald-500 bg-emerald-50/60 ring-1 ring-inset ring-emerald-300 dark:border-emerald-400 dark:bg-emerald-950/40 dark:ring-emerald-700/50',
  },
  {
    value: 'maintenance',
    label: '維護中',
    hint: '暫停服務 / 維修',
    icon: <Wrench width={14} height={14} />,
    ring: 'border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800/60',
    activeRing: 'border-amber-500 bg-amber-50/60 ring-1 ring-inset ring-amber-300 dark:border-amber-400 dark:bg-amber-950/40 dark:ring-amber-700/50',
  },
  {
    value: 'inactive',
    label: '已停用',
    hint: '不再使用 / 待回收',
    icon: <PowerOff width={14} height={14} />,
    ring: 'border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800/60',
    activeRing: 'border-rose-500 bg-rose-50/60 ring-1 ring-inset ring-rose-300 dark:border-rose-400 dark:bg-rose-950/40 dark:ring-rose-700/50',
  },
];

function StatusCard({
  value,
  onChange,
}: {
  value: Bus['status'];
  onChange: (next: Bus['status']) => void;
}) {
  return (
    <div>
      <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1.5 dark:text-slate-400">
        校巴狀態 <span className="text-rose-500">*</span>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {STATUS_OPTIONS.map((opt) => {
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
                active ? opt.activeRing : opt.ring,
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full border-2 shrink-0',
                    active
                      ? opt.value === 'active'
                        ? 'border-emerald-600 bg-emerald-600'
                        : opt.value === 'maintenance'
                        ? 'border-amber-600 bg-amber-600'
                        : 'border-rose-600 bg-rose-600'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span
                  className={cn(
                    'text-[12.5px] font-semibold inline-flex items-center gap-1',
                    active
                      ? opt.value === 'active'
                        ? 'text-emerald-900 dark:text-emerald-200'
                        : opt.value === 'maintenance'
                        ? 'text-amber-900 dark:text-amber-200'
                        : 'text-rose-900 dark:text-rose-200'
                      : 'text-slate-700 dark:text-slate-200',
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </span>
              </div>
              <p
                className={cn(
                  'mt-0.5 text-[10.5px] pl-6',
                  active
                    ? opt.value === 'active'
                      ? 'text-emerald-700/80 dark:text-emerald-300/80'
                      : opt.value === 'maintenance'
                      ? 'text-amber-700/80 dark:text-amber-300/80'
                      : 'text-rose-700/80 dark:text-rose-300/80'
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
/*  InlineFieldError — 欄位下方的紅色錯誤提示                                    */
/* -------------------------------------------------------------------------- */

function InlineFieldError({ message }: { message: string | null }) {
  return (
    <div className="min-h-[14px] mt-0.5">
      {message && (
        <p className="text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="shrink-0"
          >
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
/*  BusFormModal — 主表單                                                       */
/* -------------------------------------------------------------------------- */

export interface BusFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: BusFormState;
  /** 編輯模式時, 顯示車牌作為標識 */
  editingPlate?: string;
  context: BusesPageContext;
  isSaving: boolean;
  onSave: (state: BusFormState) => void;
  onClose: () => void;
}

export function BusFormModal({
  open,
  mode,
  initial,
  editingPlate,
  context,
  isSaving,
  onSave,
  onClose,
}: BusFormModalProps) {
  const [form, setForm] = React.useState<BusFormState>(EMPTY_BUS_FORM);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  // open / mode / initial 變動時重置
  React.useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_BUS_FORM, ...(initial ?? {}) });
      setTouched({});
    }
  }, [open, mode, initial]);

  // 校驗
  const fieldErrors = React.useMemo(() => {
    const plateNorm = form.plateNumber.trim().toUpperCase();
    const errors: Record<string, string | null> = {
      plateNumber: !plateNorm
        ? '請輸入車牌'
        : context.buses.some(
            (b) =>
              b.plateNumber.toUpperCase() === plateNorm &&
              (mode === 'add' || b.id !== initial?.plateNumber),
          )
        ? '車牌已存在'
        : null,
      model: !form.model.trim() ? '請輸入型號' : null,
      capacity: !form.capacity
        ? '請輸入座位上限'
        : isNaN(Number(form.capacity)) || Number(form.capacity) < 1
        ? '座位數需 > 0'
        : Number(form.capacity) > 80
        ? '座位數過大, 請確認'
        : null,
    };
    return errors;
  }, [form.plateNumber, form.model, form.capacity, context.buses, mode, initial]);

  const canSubmit =
    !isSaving && Object.values(fieldErrors).every((e) => e === null);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  const handleSubmit = () => {
    // 觸碰所有欄位以觸發錯誤顯示
    setTouched({ plateNumber: true, model: true, capacity: true });
    if (!canSubmit) return;
    onSave({
      ...form,
      plateNumber: form.plateNumber.trim().toUpperCase(),
      model: form.model.trim(),
      capacity: form.capacity.replace(/\D/g, '').slice(0, 3),
    });
  };

  const title = mode === 'add' ? '新增校巴' : '編輯校巴';
  const subtitle =
    mode === 'add'
      ? '建立一輛校巴, 含基本資料、指派司機、GPS 裝置與狀態。'
      : '更新校巴資料 — 車牌、型號、座位、司機、GPS 裝置或狀態。';

  // 將司機按可服務 / 不可服務分組 (maintenance/inactive 校巴不應指派司機)
  const availableDrivers = context.drivers.filter(
    (d) => d.status === 'available' || d.status === 'on_trip',
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bus-form-backdrop"
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[680px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700 max-h-[92vh]"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bus-form-title"
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
                  id="bus-form-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {editingPlate && mode === 'edit' ? `${editingPlate} · ` : ''}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 車牌 */}
                <div>
                  <LabeledInput
                    id="bus-form-plate"
                    label="車牌"
                    value={form.plateNumber}
                    onChange={(v) => setForm((p) => ({ ...p, plateNumber: v.toUpperCase() }))}
                    onBlur={() => markTouched('plateNumber')}
                    placeholder="AB-1234"
                    required
                    maxLength={12}
                    icon={<Hash width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.plateNumber ? fieldErrors.plateNumber : null}
                  />
                </div>

                {/* 型號 */}
                <div>
                  <LabeledInput
                    id="bus-form-model"
                    label="型號"
                    value={form.model}
                    onChange={(v) => setForm((p) => ({ ...p, model: v }))}
                    onBlur={() => markTouched('model')}
                    placeholder="Toyota Coaster"
                    required
                    maxLength={50}
                    icon={<Type width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.model ? fieldErrors.model : null}
                  />
                </div>

                {/* 座位上限 */}
                <div>
                  <LabeledInput
                    id="bus-form-capacity"
                    label="座位上限"
                    value={form.capacity}
                    onChange={(v) => setForm((p) => ({ ...p, capacity: v.replace(/\D/g, '').slice(0, 3) }))}
                    onBlur={() => markTouched('capacity')}
                    placeholder="28"
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={3}
                    icon={<BusIcon width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.capacity ? fieldErrors.capacity : null}
                  />
                </div>

                {/* 司機 (可選) */}
                <div>
                  <NativeSelect
                    id="bus-form-driver"
                    label="指派司機 (選填)"
                    value={form.driverId}
                    onChange={(v) => setForm((p) => ({ ...p, driverId: v }))}
                    icon={<UserCog width={12} height={12} />}
                  >
                    <option value="">— 暫不指派 —</option>
                    {availableDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.phone}
                      </option>
                    ))}
                  </NativeSelect>
                  {context.drivers.length === 0 && (
                    <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <Info width={10} height={10} />
                      尚未建立任何司機
                    </p>
                  )}
                </div>

                {/* GPS 裝置 ID (全寬) */}
                <div className="md:col-span-2">
                  <LabeledInput
                    id="bus-form-gps"
                    label="GPS 裝置 ID (選填)"
                    value={form.gpsDeviceId}
                    onChange={(v) => setForm((p) => ({ ...p, gpsDeviceId: v.trim() }))}
                    placeholder="例如: GPS-DEV-001"
                    maxLength={40}
                    icon={<Wifi width={12} height={12} />}
                  />
                  <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                    <Info width={10} height={10} />
                    配對後可即時追蹤校巴位置
                  </p>
                </div>

                {/* 狀態 (全寬, toggle cards) */}
                <div className="md:col-span-2">
                  <StatusCard
                    value={form.status}
                    onChange={(v) => setForm((p) => ({ ...p, status: v }))}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone="warning" size="sm">
                  <BusIcon width={9} height={9} />
                  {form.plateNumber.trim() || '—'}
                </Pill>
                {form.capacity && Number(form.capacity) > 0 && (
                  <Pill tone="info" size="sm">
                    {form.capacity} 座
                  </Pill>
                )}
                {form.driverId && (
                  <Pill tone="violet" size="sm">
                    <UserCog width={9} height={9} />
                    {
                      context.drivers.find((d) => d.id === form.driverId)
                        ?.name ?? '司機'
                    }
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
                  {mode === 'add' ? '新增校巴' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
