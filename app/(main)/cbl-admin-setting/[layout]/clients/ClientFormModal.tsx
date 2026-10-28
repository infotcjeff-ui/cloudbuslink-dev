'use client';

/**
 * ClientFormModal — 新增 / 編輯機構 (tenant)
 *
 * 設計沿用 /cbl-admin-setting/[layout]/user/UserAccountFormModal 的語言:
 *   - 2-column grid + 右側「機構摘要」sidebar
 *   - framer-motion 進出場 (MODAL_FADE / MODAL_SLIDE)
 *   - 只用本專案 primitives, 不引入 HeroUI / shadcn
 *
 * 對應 DB 表: cbl_clients
 *   name / email / phone / address / logo / primary_color / academic_year / status
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/clients/ 使用。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Pencil,
  Plus,
  X,
  Save,
  Mail,
  Phone,
  MapPin,
  Image as ImageIcon,
  Palette,
  Calendar,
  CheckCircle,
  PowerOff,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill } from '../students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../students/design-tokens';
import { EMPTY_CLIENT_FORM, type ClientFormState } from './types';

/* -------------------------------------------------------------------------- */
/*  Preset colors — 與 /settings/site 的色票一致                                */
/* -------------------------------------------------------------------------- */

const PRESET_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#6366f1',
];

/* -------------------------------------------------------------------------- */
/*  LabeledInput — 表單欄位                                                     */
/* -------------------------------------------------------------------------- */

function LabeledInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  inputMode,
  maxLength,
  icon,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email';
  required?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email';
  maxLength?: number;
  icon?: React.ReactNode;
  hint?: string;
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
      {hint && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  InlineFieldError                                                            */
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
/*  StatusSwitch — 啟用/停用 iOS-style switch                                     */
/* -------------------------------------------------------------------------- */

function StatusSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        checked
          ? 'bg-emerald-500 dark:bg-emerald-500'
          : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span className="sr-only">切換啟用狀態</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-out my-[2px]',
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  ClientFormModal — 主表單                                                    */
/* -------------------------------------------------------------------------- */

export interface ClientFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial: ClientFormState;
  isSaving: boolean;
  onSave: (state: ClientFormState) => void;
  onClose: () => void;
  /**
   * 額外 z-index class — 預設 'z-50'。
   * 從「新增登入帳號」modal 內嵌呼叫時需要疊在 z-50 之上 (用 'z-[60]')。
   */
  zIndexClass?: string;
}

export function ClientFormModal({
  open,
  mode,
  initial,
  isSaving,
  onSave,
  onClose,
  zIndexClass = 'z-50',
}: ClientFormModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<ClientFormState>(EMPTY_CLIENT_FORM);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_CLIENT_FORM, ...initial });
      setTouched({});
    }
  }, [open, initial]);

  const fieldErrors = React.useMemo(() => {
    const errors: Record<string, string | null> = {
      name: !form.name.trim() ? '請填寫「學校名稱」' : null,
      email:
        form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
          ? 'Email 格式不正確'
          : null,
      phone:
        form.phone.trim() && !/^[\d\s-]{6,20}$/.test(form.phone.trim())
          ? '電話格式不正確 (6-20 位數字)'
          : null,
      academicYear:
        !form.academicYear.trim()
          ? '請填寫「學年」'
          : !/^\d{2,4}$/.test(form.academicYear.trim())
          ? '學年格式不正確 (例如 2627)'
          : null,
      primaryColor:
        !/^#[0-9a-fA-F]{6}$/.test(form.primaryColor.trim())
          ? '主色需為 #RRGGBB 格式'
          : null,
    };
    return errors;
  }, [form.name, form.email, form.phone, form.academicYear, form.primaryColor]);

  const canSubmit =
    !isSaving && Object.values(fieldErrors).every((e) => e === null);

  const handleSaveClick = () => {
    setTouched({
      name: true,
      email: true,
      phone: true,
      academicYear: true,
      primaryColor: true,
    });
    if (!canSubmit) {
      const firstError = Object.entries(fieldErrors).find(([, v]) => v !== null)?.[0] ?? '';
      const messages: Record<string, string> = {
        name: '請填寫「學校名稱」',
        email: 'Email 格式不正確',
        phone: '電話格式不正確 (6-20 位數字)',
        academicYear: '學年格式不正確 (例如 2627)',
        primaryColor: '主色需為 #RRGGBB 格式',
      };
      toast.error(messages[firstError] || '請檢查並修正表單欄位');
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      logo: form.logo.trim(),
      primaryColor: form.primaryColor.trim(),
      academicYear: form.academicYear.trim(),
    });
  };

  const title = mode === 'add' ? '新增學校' : '編輯學校';
  const subtitle =
    mode === 'add'
      ? '建立一個新的學校, 作為學生、家長、班次等資料的隔離單位。'
      : '更新機構的基本資料與啟用狀態。';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="client-form-backdrop"
          role="presentation"
          className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[820px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 shrink-0 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                {mode === 'add' ? (
                  <Plus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="client-form-title"
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
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-0">
                {/* ============== LEFT COLUMN ============== */}
                <div className="px-5 py-5 space-y-4 lg:border-r border-slate-100 dark:border-slate-700/80">
                  {/* Row 1: 機構名稱 / 學年 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <LabeledInput
                        id="client-form-name"
                        label="學校名稱"
                        value={form.name}
                        onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                        placeholder="示範小學"
                        required
                        maxLength={60}
                        icon={<Building2 width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.name ? fieldErrors.name : null}
                      />
                    </div>
                    <div>
                      <LabeledInput
                        id="client-form-academic-year"
                        label="學年"
                        value={form.academicYear}
                        onChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            academicYear: v.replace(/\D/g, '').slice(0, 4),
                          }))
                        }
                        placeholder="2627"
                        required
                        inputMode="numeric"
                        icon={<Calendar width={12} height={12} />}
                        hint="格式: 2627 = 2026/27 學年"
                      />
                      <InlineFieldError
                        message={touched.academicYear ? fieldErrors.academicYear : null}
                      />
                    </div>
                  </div>

                  {/* Row 2: Email / 電話 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <LabeledInput
                        id="client-form-email"
                        label="Email"
                        value={form.email}
                        onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                        placeholder="info@school.edu.hk"
                        type="email"
                        inputMode="email"
                        icon={<Mail width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.email ? fieldErrors.email : null}
                      />
                    </div>
                    <div>
                      <LabeledInput
                        id="client-form-phone"
                        label="聯絡電話"
                        value={form.phone}
                        onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                        placeholder="23456789"
                        type="tel"
                        inputMode="tel"
                        icon={<Phone width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.phone ? fieldErrors.phone : null}
                      />
                    </div>
                  </div>

                  {/* Row 3: 地址 */}
                  <div>
                    <LabeledInput
                      id="client-form-address"
                      label="地址"
                      value={form.address}
                      onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                      placeholder="香港九龍..."
                      icon={<MapPin width={12} height={12} />}
                    />
                  </div>

                  {/* Row 4: Logo */}
                  <div>
                    <label
                      htmlFor="client-form-logo"
                      className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                    >
                      Logo (URL)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <ImageIcon width={12} height={12} />
                        </span>
                        <input
                          id="client-form-logo"
                          type="text"
                          value={form.logo}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, logo: e.target.value }))
                          }
                          placeholder="https://..."
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full h-9 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        />
                      </div>
                      {form.logo.trim() && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={form.logo.trim()}
                          alt="logo preview"
                          className="h-9 w-9 rounded-md object-contain border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      留空將使用默認 Logo 佔位符
                    </p>
                  </div>

                  {/* Row 5: 主色 */}
                  <div>
                    <label
                      htmlFor="client-form-primary-color"
                      className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1.5 dark:text-slate-400"
                    >
                      主題色
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`主色 ${c}`}
                          onClick={() => setForm((p) => ({ ...p, primaryColor: c }))}
                          className={cn(
                            'w-7 h-7 rounded-full border-2 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                            form.primaryColor.toLowerCase() === c.toLowerCase()
                              ? 'border-slate-900 scale-110 dark:border-white'
                              : 'border-transparent',
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Palette width={12} height={12} />
                      </span>
                      <input
                        id="client-form-primary-color"
                        type="text"
                        value={form.primaryColor}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, primaryColor: e.target.value }))
                        }
                        placeholder="#3b82f6"
                        spellCheck={false}
                        className="w-full h-9 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white font-mono text-[12px] font-medium text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                      />
                    </div>
                    <InlineFieldError
                      message={touched.primaryColor ? fieldErrors.primaryColor : null}
                    />
                  </div>
                </div>

                {/* ============== RIGHT COLUMN (機構摘要) ============== */}
                <aside className="px-4 py-5 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
                  {/* 機構預覽 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-2 dark:text-slate-400">
                      機構預覽
                    </p>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white shrink-0"
                        style={{ backgroundColor: form.primaryColor || '#3b82f6' }}
                      >                        {form.logo.trim() ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={form.logo.trim()}
                            alt=""
                            className="h-6 w-6 object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Building2 width={16} height={16} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-900 truncate dark:text-slate-100">
                          {form.name || '未命名學校'}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {form.academicYear || '—'} 學年
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 聯絡資訊 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-blue-700 dark:text-blue-300 mb-2">
                      聯絡資訊
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60">
                        <Mail width={11} height={11} className="text-slate-400 shrink-0" />
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate ml-auto">
                          {form.email || '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60">
                        <Phone width={11} height={11} className="text-slate-400 shrink-0" />
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate ml-auto">
                          {form.phone || '—'}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60">
                        <MapPin
                          width={11}
                          height={11}
                          className="text-slate-400 shrink-0 mt-0.5"
                        />
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug ml-auto text-right">
                          {form.address || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 啟用狀態切換 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset shrink-0',
                            form.status === 'active'
                              ? 'bg-emerald-50 text-emerald-600 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50'
                              : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
                          )}
                        >
                          {form.status === 'active' ? (
                            <CheckCircle width={13} height={13} />
                          ) : (
                            <PowerOff width={13} height={13} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
                            {form.status === 'active' ? '啟用中' : '已停用'}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {form.status === 'active'
                              ? '可指派帳號到此學校'
                              : '停用 (資料保留)'}
                          </p>
                        </div>
                      </div>
                      <StatusSwitch
                        checked={form.status === 'active'}
                        onChange={() =>
                          setForm((p) => ({
                            ...p,
                            status: p.status === 'active' ? 'inactive' : 'active',
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* 提示 */}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-start gap-1 px-1">
                    <AlertTriangle width={9} height={9} className="text-amber-500 shrink-0 mt-px" />
                    <span>
                      學校是資料的隔離單位。停用後, 該學校的帳號仍存在但無法綁定新資料。
                    </span>
                  </p>
                </aside>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 z-10 px-5 py-3 bg-white/95 backdrop-blur-sm border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/95 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                {form.status === 'active' ? (
                  <Pill tone="success" size="sm">
                    啟用
                  </Pill>
                ) : (
                  <Pill tone="neutral" size="sm">
                    停用
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
                  onClick={handleSaveClick}
                  isLoading={isSaving}
                  disabled={!canSubmit}
                  startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                >
                  {mode === 'add' ? '建立學校' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
