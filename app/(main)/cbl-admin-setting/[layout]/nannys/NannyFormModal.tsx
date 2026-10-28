'use client';

/**
 * Add / Edit Nanny Modal — 自刻 OneFleet-style
 *
 * 設計沿用 /cbl-admin-setting/[layout]/students/StudentFormModal 的語言:
 *   - 2-column grid + 右側「已選詳情」sidebar (規格 §14)
 *   - 多選校巴用 chip / tag pattern (§17)
 *   - framer-motion 進出場, modalfade=0.14, modalslide=6
 *   - 不引入 HeroUI, 也不依賴全域 components/ui/*
 *   - 員工編號 (employeeId) preview: 從 props 接收作為唯讀預覽 (add mode 預先生成)
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserPlus,
  Pencil,
  X,
  Save,
  Heart,
  Phone,
  Hash,
  Bus as BusIcon,
  AlertTriangle,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill } from '../students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_NANNY_FORM,
  type NannyFormState,
  type NannysPageContext,
} from './types';
import {
  EntitySelectWithCreate,
  EntitySelectWithCreateMulti,
  busLabel,
} from '../../components/EntitySelectWithCreate';
import { InlineMiniFormModal } from '../../components/InlineMiniFormModal';
import type { Nanny, Bus } from '@/lib/types';
import { STORAGE } from '@/lib/storage';

/* -------------------------------------------------------------------------- */
/*  SelectedBusDetail — 右欄「已選校巴」詳情卡片                                  */
/* -------------------------------------------------------------------------- */

function SelectedBusDetail({ bus }: { bus: Bus | undefined }) {
  if (!bus) {
    return (
      <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
        校巴資料已不存在
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
          <BusIcon width={13} height={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] font-semibold font-mono text-slate-900 dark:text-slate-100">
              {bus.plateNumber}
            </span>
            {bus.model && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                · {bus.model}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset shrink-0',
            bus.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50'
              : bus.status === 'maintenance'
              ? 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50'
              : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
          )}
        >
          {bus.status === 'active' ? '運行' : bus.status === 'maintenance' ? '維護' : '停用'}
        </span>
      </div>
    </div>
  );
}

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
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'date';
  required?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric';
  maxLength?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
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
          <span
            className={cn(
              'absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none',
              disabled && 'opacity-60',
            )}
          >
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
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
            disabled &&
              'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 cursor-not-allowed',
          )}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  BusToggleCards — 永遠可見的校巴 toggle 卡片清單                                  */
/*  取代 BusTagSelect 的「隱藏 dropdown + 搜尋」模式, 與 StudentFormModal 的         */
/*  NativeSelect 一樣「選項永遠在視線內」, 避免使用者找不到資料的問題。              */
/* -------------------------------------------------------------------------- */

interface BusChoice {
  id: string;
  plateNumber: string;
  model?: string;
  status: Bus['status'];
}

function BusToggleCards({
  buses,
  selectedIds,
  onToggle,
  onAddNewHint,
}: {
  buses: BusChoice[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAddNewHint?: () => void;
}) {
  if (buses.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-[11.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400 inline-flex items-center gap-1.5">
        <AlertTriangle width={11} height={11} className="text-amber-500" />
        尚未建立任何校巴資料。
        <a
          href="/cbl-admin-setting/bus"
          onClick={(e) => {
            e.preventDefault();
            onAddNewHint?.();
          }}
          className="ml-1 text-blue-600 dark:text-blue-300 hover:underline font-medium"
        >
          到校巴頁新增
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-700 p-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto">
        {buses.map((b) => {
          const isSelected = selectedIds.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b.id)}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded-md border text-left text-[12px] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                isSelected
                  ? 'bg-emerald-50 border-emerald-300 ring-1 ring-inset ring-emerald-300 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-700/60 dark:ring-emerald-700/60 dark:text-emerald-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-700/60 dark:hover:bg-emerald-950/20',
              )}
            >
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border shrink-0 transition-colors',
                  isSelected
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-600',
                )}
              >
                {isSelected && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <BusIcon
                width={11}
                height={11}
                className={cn(
                  'shrink-0',
                  isSelected
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : 'text-slate-400',
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'font-mono font-semibold leading-none truncate',
                    isSelected ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-900 dark:text-slate-100',
                  )}
                  title={b.plateNumber}
                >
                  {b.plateNumber}
                </p>
                {b.model && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                    {b.model}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  InlineFieldError — 單一欄位下方的錯誤提示                                       */
/* -------------------------------------------------------------------------- */

function InlineFieldError({
  message,
  onShow,
}: {
  message: string | null;
  onShow?: () => void;
}) {
  return (
    <div onMouseEnter={onShow} onFocusCapture={onShow} className="min-h-[14px] mt-0.5">
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
/*  NannyFormModal — 主表單                                                       */
/* -------------------------------------------------------------------------- */

export interface NannyFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial: NannyFormState;
  context: NannysPageContext;
  /** Add mode 時預先生成的員工編號 preview (EMP-001 格式) */
  previewEmployeeId?: string;
  /** Edit mode 時, 顯示原本的員工編號 (唯讀) */
  employeeId?: string;
  /** 機構 id — 用於員工編號生成 */
  clientId?: string;
  isSaving: boolean;
  onSave: (state: NannyFormState) => void;
  onClose: () => void;
}

export function NannyFormModal({
  open,
  mode,
  initial,
  context,
  previewEmployeeId,
  employeeId,
  clientId,
  isSaving,
  onSave,
  onClose,
}: NannyFormModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<NannyFormState>(EMPTY_NANNY_FORM);

  // 「在表單內新增校巴」inline mini form
  const [inlineBuses, setInlineBuses] = React.useState<Bus[]>([]);
  const [busMiniOpen, setBusMiniOpen] = React.useState(false);

  /** 直接從 STORAGE 讀取全部校巴 (繞過 clientId 過濾) */
  const [storageBuses, setStorageBuses] = React.useState<Bus[]>([]);

  React.useEffect(() => {
    setStorageBuses(STORAGE.buses.getAll());
    const onBusRefresh = () => setStorageBuses(STORAGE.buses.getAll());
    window.addEventListener('cbl-buses-refresh', onBusRefresh);
    return () => window.removeEventListener('cbl-buses-refresh', onBusRefresh);
  }, []);

  React.useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_NANNY_FORM,
        ...initial,
        // 確保 employeeId 預設帶入 (add 模式用 preview, edit 模式帶原值)
        employeeId: initial.employeeId || (mode === 'add' ? previewEmployeeId || '' : employeeId || ''),
        employeeIdLocked: mode === 'edit',
      });
      setTouched({});
      setInlineBuses([]);
    }
  }, [open, mode, initial, previewEmployeeId, employeeId]);

  const busChoices = React.useMemo<BusChoice[]>(
    () =>
      storageBuses.map((b) => ({
        id: b.id,
        plateNumber: b.plateNumber,
        model: b.model,
        status: b.status,
      })),
    [storageBuses],
  );

  const toggleBus = React.useCallback((id: string) => {
    setForm((prev) => {
      const has = prev.assignedBusIds.includes(id);
      return {
        ...prev,
        assignedBusIds: has
          ? prev.assignedBusIds.filter((b) => b !== id)
          : [...prev.assignedBusIds, id],
      };
    });
  }, []);

  // 校驗
  const fieldErrors = React.useMemo(() => {
    const errors: Record<string, string | null> = {
      name: !form.name.trim() ? '請填寫「姓名」' : null,
      phone:
        !form.phone.trim()
          ? '請填寫「電話」'
          : form.phone.replace(/\D/g, '').length < 8
          ? '電話需要 8 碼'
          : null,
      description: form.description.length > 200 ? '備註不可超過 200 字' : null,
    };
    return errors;
  }, [form.name, form.phone, form.description]);

  const canSubmit =
    !isSaving && Object.values(fieldErrors).every((e) => e === null);

  // 是否曾被觸碰
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  const handleSaveClick = () => {
    setTouched({ name: true, phone: true, description: true });
    if (!canSubmit) {
      const firstError = Object.entries(fieldErrors).find(([, v]) => v !== null)?.[0] ?? '';
      const errorMessages: Record<string, string> = {
        name: '請填寫「姓名」',
        phone: '電話需要 8 碼',
        description: '備註不可超過 200 字',
      };
      toast.error(errorMessages[firstError] || '請檢查並修正表單欄位');
      return;
    }
    onSave(form);
  };

  const previewId =
    mode === 'add'
      ? previewEmployeeId || '—'
      : form.employeeId || employeeId || '—';

  const title = mode === 'add' ? '新增保姆' : '編輯保姆';
  const subtitle =
    mode === 'add'
      ? '建立保姆資料並指派校巴。'
      : '更新保姆資料、員工編號與校巴指派。';

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          key="nanny-form-backdrop"
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[900px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nanny-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header — 規格 §14.2 */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 shrink-0 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                {mode === 'add' ? (
                  <UserPlus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="nanny-form-title"
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

            {/* Body — 2-Column 佈局 */}
            <div className="flex-1 min-h-0 overflow-y-auto dark:scrollbar-thin">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0">
                {/* ============== LEFT COLUMN (輸入欄位) ============== */}
                <div className="px-5 py-5 space-y-4 lg:border-r border-slate-100 dark:border-slate-700/80">
                  {/* 員工編號 (置頂 — 唯讀 preview) */}
                  <div>
                    <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-1 inline-flex items-center gap-1.5 dark:text-slate-400">
                      員工編號
                      <span className="text-[10px] text-slate-400 normal-case font-medium tracking-normal">
                        (自動生成, 不可修改)
                      </span>
                    </label>
                    <div className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 text-[12px] font-mono text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <Hash width={11} height={11} className="text-slate-400" />
                      {previewId}
                    </div>
                  </div>

                  {/* Row 1: 姓名 / 電話 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <LabeledInput
                        id="nanny-form-name"
                        label="姓名"
                        value={form.name}
                        onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                        onBlur={() => markTouched('name')}
                        placeholder="王小美"
                        required
                        icon={<Heart width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.name ? fieldErrors.name : null}
                        onShow={() => markTouched('name')}
                      />
                    </div>
                    <div>
                      <LabeledInput
                        id="nanny-form-phone"
                        label="電話 (登入帳號)"
                        value={form.phone}
                        onChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            phone: v.replace(/\D/g, '').slice(0, 8),
                          }))
                        }
                        onBlur={() => markTouched('phone')}
                        placeholder="91234567"
                        required
                        type="tel"
                        inputMode="tel"
                        maxLength={8}
                        icon={<Phone width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.phone ? fieldErrors.phone : null}
                        onShow={() => markTouched('phone')}
                      />
                    </div>
                  </div>

                  {/* Row 2: 綁定校巴 + 備註 */}
                  <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                    <EntitySelectWithCreateMulti<Bus>
                      id="nanny-form-bus"
                      label="綁定校巴 (選填, 可多選)"
                      multiple
                      value={form.assignedBusIds}
                      options={[...storageBuses, ...inlineBuses]}
                      onChange={(v) => setForm((p) => ({ ...p, assignedBusIds: v }))}
                      onAddNew={() => setBusMiniOpen(true)}
                      emptyHint="尚未建立任何校巴, 從 dropdown 最底「＋ 在此新增…」建立第一輛"
                      renderLabel={busLabel}
                    />

                    <div>
                      <label
                        htmlFor="nanny-form-description"
                        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                      >
                        備註 (選填)
                        <span className="ml-1 text-[10px] text-slate-400 normal-case font-medium tracking-normal">
                          {form.description.length}/200
                        </span>
                      </label>
                      <div className="relative">
                        <textarea
                          id="nanny-form-description"
                          value={form.description}
                          onChange={(e) => {
                            const next = e.target.value.slice(0, 200);
                            setForm((p) => ({ ...p, description: next }));
                          }}
                          rows={3}
                          placeholder="例如: 早班為主, 熟悉 1A & 2B 路線家長…"
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors resize-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        />
                      </div>
                      <InlineFieldError
                        message={touched.description ? fieldErrors.description : null}
                        onShow={() => markTouched('description')}
                      />
                    </div>
                  </div>
                </div>

                {/* ============== RIGHT COLUMN (已選詳情 + 登入預覽) ============== */}
                <aside className="px-4 py-5 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
                  {/* 已選校巴 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                        <BusIcon width={11} height={11} />
                        已選校巴
                        <span className="ml-1 inline-flex items-center px-1 py-px rounded text-[9.5px] font-semibold tabular-nums bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                          {form.assignedBusIds.length}
                        </span>
                      </p>
                    </div>
                    {form.assignedBusIds.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {form.assignedBusIds.map((id) => {
                          const b = busChoices.find((bb) => bb.id === id);
                          if (!b) return null;
                          return (
                            <div
                              key={id}
                              className="flex items-center gap-1 pl-1.5 pr-1 h-7 rounded-md border border-slate-200 bg-white text-[11.5px] text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <BusIcon
                                width={11}
                                height={11}
                                className="text-emerald-500 shrink-0"
                              />
                              <span className="font-semibold font-mono leading-none truncate flex-1 min-w-0">
                                {b.plateNumber}
                              </span>
                              {b.model && (
                                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-none shrink-0">
                                  {b.model}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleBus(id)}
                                aria-label={`移除 ${b.plateNumber}`}
                                className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                              >
                                <X width={10} height={10} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-1.5">
                          <BusIcon
                            width={14}
                            height={14}
                            className="text-slate-400"
                          />
                        </div>
                        <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                          尚未指派校巴
                        </p>
                        <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">
                          在左側「指派校巴」選擇
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 登入資訊 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-blue-700 dark:text-blue-300 inline-flex items-center gap-1.5">
                        <User width={11} height={11} />
                        登入帳號
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60">
                        <Phone
                          width={11}
                          height={11}
                          className="text-slate-400 shrink-0"
                        />
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0">
                          帳號
                        </span>
                        <span className="text-[12px] font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {form.phone || '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60">
                        <Hash
                          width={11}
                          height={11}
                          className="text-slate-400 shrink-0"
                        />
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0">
                          密碼
                        </span>
                        <span className="text-[12px] font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {form.phone || '—'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-start gap-1 pt-0.5">
                        <AlertTriangle
                          width={9}
                          height={9}
                          className="text-amber-500 shrink-0 mt-px"
                        />
                        <span>
                          預設密碼與電話相同。保姆首次登入後可至「個人資料」修改。
                        </span>
                      </p>
                    </div>
                  </div>

                </aside>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 z-10 px-5 py-3 bg-white/95 backdrop-blur-sm border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/95 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone="primary" size="sm">
                  {form.assignedBusIds.length} 部校巴
                </Pill>
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
                  onClick={handleSaveClick}
                  isLoading={isSaving}
                  disabled={!canSubmit}
                  startIcon={
                    !isSaving ? <Save width={12} height={12} /> : undefined
                  }
                >
                  {mode === 'add' ? '新增保姆' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* 「在此新增校巴」inline mini form (z 60) */}
    <InlineMiniFormModal
      open={busMiniOpen}
      mode="bus"
      isSaving={false}
      onClose={() => setBusMiniOpen(false)}
      onCreated={(b) => {
        setInlineBuses((prev) => [...prev, b]);
        setForm((p) => ({
          ...p,
          assignedBusIds: p.assignedBusIds.includes(b.id)
            ? p.assignedBusIds
            : [...p.assignedBusIds, b.id],
        }));
        setBusMiniOpen(false);
      }}
    />
    </>
  );
}
