'use client';

/**
 * Add / Edit Driver Modal — 自刻 OneFleet-style
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §14 Modal Chrome (Hand-Coded, Not HeroUI)
 *   §16 Form Field Primitives
 *   §21 Modal Footer
 *
 * 範圍: 僅 /cbl-admin-setting/bus/drivers/ 使用。
 *
 * 表單欄位:
 *   - 姓名 (Name)             - 必填
 *   - 電話 (Phone)            - 必填, 8 碼
 *   - 駕照號碼 (License)      - 必填
 *   - 綁定校巴 (Assigned Bus) - 選填, dropdown (反向寫 Bus.driverId)
 *
 * - 與 BusFormModal 風格一致: 不引入 HeroUI, 全用 primitives + Tailwind
 * - 用 framer-motion 進出場 (modalfade=0.14, modalslide=6)
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserPlus,
  Pencil,
  X,
  Save,
  IdCard,
  Phone,
  Hash,
  UserCog,
  Info,
  Bus as BusIcon,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_DRIVER_FORM,
  type DriverFormState,
  type DriversPageContext,
} from './types';

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
  type?: 'text' | 'tel';
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
/*  NativeSelect — 包裝 native <select> (與 BusFormModal 一致)                    */
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
/*  DriverFormModal — 主表單                                                      */
/* -------------------------------------------------------------------------- */

export interface DriverFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: DriverFormState;
  /** 編輯模式時, 顯示姓名作為標識 */
  editingName?: string;
  /** 編輯中的司機 id — 用來判斷校巴是否已被其他司機綁定 */
  editingId?: string;
  context: DriversPageContext;
  isSaving: boolean;
  onSave: (state: DriverFormState) => void;
  onClose: () => void;
}

export function DriverFormModal({
  open,
  mode,
  initial,
  editingName,
  editingId,
  context,
  isSaving,
  onSave,
  onClose,
}: DriverFormModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<DriverFormState>(EMPTY_DRIVER_FORM);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  // open / mode / initial 變動時重置
  React.useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_DRIVER_FORM, ...(initial ?? {}) });
      setTouched({});
    }
  }, [open, mode, initial]);

  // 校驗
  const fieldErrors = React.useMemo(() => {
    const nameNorm = form.name.trim();
    const phoneDigits = form.phone.replace(/\D/g, '');
    const licenseNorm = form.licenseNumber.trim();
    const errors: Record<string, string | null> = {
      name: !nameNorm
        ? '請輸入姓名'
        : context.drivers.some(
            (d) =>
              d.name.trim().toLowerCase() === nameNorm.toLowerCase() &&
              (mode === 'add' || d.name.trim() !== (initial?.name ?? '').trim()),
          )
        ? '已有同名司機'
        : null,
      phone: !phoneDigits
        ? '請輸入電話'
        : phoneDigits.length < 8
        ? '電話需 8 碼'
        : context.drivers.some(
            (d) =>
              d.phone.replace(/\D/g, '') === phoneDigits &&
              (mode === 'add' || d.phone.replace(/\D/g, '') !== (initial?.phone ?? '').replace(/\D/g, '')),
          )
        ? '電話已被使用'
        : null,
      licenseNumber: !licenseNorm
        ? '請輸入駕照號碼'
        : licenseNorm.length < 4
        ? '駕照號碼過短'
        : null,
    };
    return errors;
  }, [form.name, form.phone, form.licenseNumber, context.drivers, mode, initial]);

  const canSubmit =
    !isSaving && Object.values(fieldErrors).every((e) => e === null);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  const handleSubmit = () => {
    setTouched({ name: true, phone: true, licenseNumber: true });
    if (!canSubmit) {
      // 找出第一個錯誤欄位, 給 toast 一個明確訊息
      const firstErrorField = Object.entries(fieldErrors).find(([, v]) => v !== null)?.[0] ?? '';
      const errorMessages: Record<string, string> = {
        name: '請輸入姓名',
        phone: '請輸入有效的電話號碼 (8位數字)',
        licenseNumber: '請輸入駕照號碼',
      };
      toast.error(errorMessages[firstErrorField] || '請檢查並修正表單欄位');
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, '').slice(0, 8),
      licenseNumber: form.licenseNumber.trim().toUpperCase(),
    });
  };

  const title = mode === 'add' ? '新增司機' : '編輯司機';
  const subtitle =
    mode === 'add'
      ? '建立司機資料, 含姓名、聯絡電話、駕照號碼與綁定校巴。'
      : '更新司機資料 — 姓名、電話、駕照號碼或綁定校巴。';

  // 校巴選項: 已被其他司機綁定的車要標示 (仍可選 = 換綁, 會解除原司機綁定)
  const busBoundDriverName = React.useMemo(() => {
    const m = new Map<string, string>();
    context.drivers.forEach((d) => {
      const b = context.buses.find((bus) => bus.driverId === d.id);
      if (b) m.set(b.id, d.name);
    });
    // 編輯中的司機自己的綁定不算佔用
    if (editingId) {
      const own = context.buses.find((bus) => bus.driverId === editingId);
      if (own) m.delete(own.id);
    }
    return m;
  }, [context.buses, context.drivers, editingId]);

  const currentBinding = React.useMemo(
    () => context.buses.find((b) => b.id === form.assignedBusId) ?? null,
    [context.buses, form.assignedBusId],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="driver-form-backdrop"
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
            aria-labelledby="driver-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-white dark:bg-slate-900 dark:border-slate-700/80 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 shrink-0 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                {mode === 'add' ? (
                  <UserPlus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="driver-form-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {editingName && mode === 'edit' ? `${editingName} · ` : ''}
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

            {/* Body */}
            <div className="px-5 py-5 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 姓名 */}
                <div>
                  <LabeledInput
                    id="driver-form-name"
                    label="姓名"
                    value={form.name}
                    onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                    onBlur={() => markTouched('name')}
                    placeholder="陳大文"
                    required
                    maxLength={40}
                    icon={<IdCard width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.name ? fieldErrors.name : null}
                  />
                </div>

                {/* 電話 */}
                <div>
                  <LabeledInput
                    id="driver-form-phone"
                    label="電話"
                    value={form.phone}
                    onChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        phone: v.replace(/\D/g, '').slice(0, 8),
                      }))
                    }
                    onBlur={() => markTouched('phone')}
                    placeholder="91234567"
                    type="tel"
                    inputMode="tel"
                    required
                    maxLength={8}
                    icon={<Phone width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.phone ? fieldErrors.phone : null}
                  />
                </div>

                {/* 執勤狀態 (選填) */}
                <div>
                  <NativeSelect
                    id="driver-form-status"
                    label="執勤狀態 (選填)"
                    value={form.status}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, status: v as DriverFormState['status'] }))
                    }
                    icon={<Activity width={12} height={12} />}
                  >
                    <option value="available">可派</option>
                    <option value="on_trip">行駛中</option>
                    <option value="off_duty">休假</option>
                  </NativeSelect>
                </div>

                {/* 駕照號碼 (全寬) */}
                <div className="md:col-span-3">
                  <LabeledInput
                    id="driver-form-license"
                    label="駕照號碼"
                    value={form.licenseNumber}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, licenseNumber: v.toUpperCase() }))
                    }
                    onBlur={() => markTouched('licenseNumber')}
                    placeholder="例如: A1234567"
                    required
                    maxLength={20}
                    icon={<Hash width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.licenseNumber ? fieldErrors.licenseNumber : null}
                  />
                  <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                    <Info width={10} height={10} />
                    香港私家車或輕型貨車駕照 8 碼
                  </p>
                </div>

                {/* 綁定校巴 (全寬, 選填) */}
                <div className="md:col-span-3">
                  <NativeSelect
                    id="driver-form-bus"
                    label="綁定校巴 (選填)"
                    value={form.assignedBusId}
                    onChange={(v) => setForm((p) => ({ ...p, assignedBusId: v }))}
                    icon={<BusIcon width={12} height={12} />}
                  >
                    <option value="">— 暫不綁定 —</option>
                    {context.buses.map((b) => {
                      const occupant = busBoundDriverName.get(b.id);
                      return (
                        <option key={b.id} value={b.id}>
                          {b.plateNumber} · {b.model}
                          {occupant ? ` (已綁: ${occupant})` : ''}
                        </option>
                      );
                    })}
                  </NativeSelect>
                  {context.buses.length === 0 ? (
                    <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <Info width={10} height={10} />
                      尚未建立任何校巴, 請先到校巴頁新增
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80 shrink-0">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone="violet" size="sm">
                  <UserCog width={9} height={9} />
                  {form.name.trim() || '—'}
                </Pill>
                {form.phone.replace(/\D/g, '') && (
                  <Pill tone="info" size="sm">
                    {form.phone.replace(/\D/g, '')}
                  </Pill>
                )}
                {currentBinding && (
                  <Pill tone="warning" size="sm">
                    <BusIcon width={9} height={9} />
                    {currentBinding.plateNumber}
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
                  {mode === 'add' ? '新增司機' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}