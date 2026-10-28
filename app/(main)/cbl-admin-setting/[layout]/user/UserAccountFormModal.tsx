'use client';

/**
 * User Account Form Modal — 新增 / 編輯登入帳號
 *
 * 設計沿用 /cbl-admin-setting/[layout]/nannys/NannyFormModal 的語言:
 *   - 2-column grid + 右側「登入資訊 / 角色」sidebar
 *   - framer-motion 進出場 (MODAL_FADE / MODAL_SLIDE)
 *   - 不引入 HeroUI / shadcn, 只用本目錄內的 primitives
 *
 * 對應 DB 表: cbl_users
 *   name / phone(登入帳號) / password / email / role / client_id / status
 *
 * 密碼: 目前系統為明碼 (見 supabase/migrations/0001_init.sql ⚠️ 註記), 沿用現況。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/user/ 使用。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserPlus,
  Pencil,
  X,
  Save,
  Phone,
  Hash,
  Mail,
  ShieldCheck,
  CheckCircle,
  PowerOff,
  AlertTriangle,
  Eye,
  EyeOff,
  Building2,
  KeyRound,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill } from '../students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../students/design-tokens';
import {
  EMPTY_ACCOUNT_FORM,
  ROLE_LABELS,
  ROLE_TONES,
  ROLE_DESCRIPTIONS,
  type UserAccountFormState,
} from './types';
import type { UserRole, Client, Company } from '@/lib/types';

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
  disabled,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'password';
  required?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email';
  maxLength?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
  hint?: string;
  autoComplete?: string;
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
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete={autoComplete ?? 'off'}
          spellCheck={false}
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
            disabled &&
              'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 cursor-not-allowed',
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
/*  RoleOptionCards — 角色選擇卡片                                               */
/* -------------------------------------------------------------------------- */

const ROLE_ORDER: UserRole[] = ['system_admin', 'super_admin', 'client', 'nanny', 'parent'];

function RoleOptionCards({
  value,
  onChange,
  /** 目前登入者角色 — 只有 system_admin 能選 system_admin (防提權) */
  currentUserRole,
}: {
  value: UserRole;
  onChange: (r: UserRole) => void;
  currentUserRole?: UserRole;
}) {
  // 非 system_admin 看不到 system_admin 選項 (避免 super_admin 幫自己提權)
  const visibleRoles = currentUserRole === 'system_admin'
    ? ROLE_ORDER
    : ROLE_ORDER.filter((r) => r !== 'system_admin');
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {visibleRoles.map((role) => {
        const isSelected = value === role;
        return (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            className={cn(
              'flex items-start gap-2 px-2.5 py-2 rounded-md border text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
              isSelected
                ? 'bg-blue-50 border-blue-300 ring-1 ring-inset ring-blue-300 dark:bg-blue-950/30 dark:border-blue-700/60 dark:ring-blue-700/60'
                : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-blue-700/60',
            )}
          >
            <div
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border shrink-0 mt-px transition-colors',
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
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
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[12.5px] font-semibold leading-none',
                  isSelected
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-slate-900 dark:text-slate-100',
                )}
              >
                {ROLE_LABELS[role]}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  UserAccountFormModal — 主表單                                                */
/* -------------------------------------------------------------------------- */

export interface UserAccountFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial: UserAccountFormState;
  /** 現有所有帳號 — 用來擋重複登入帳號 */
  existingPhones: string[];
  /** 學校列表 (cbl_clients = 學校表) — 供選擇所屬學校 */
  clients: Client[];
  /** 機構/公司列表 (cbl_companies) — 供選擇所屬機構 */
  companies?: Company[];
  /** 「＋ 在此新增學校…」— 由父層開啟學校建立 modal (建立後自動選中新學校) */
  onCreateClient?: () => void;
  /** 外部指定的學校 — 用於「新增學校」完成後自動選中新學校 */
  preselectClientId?: string | null;
  /** 目前登入者 (用來標示「不能改自己的角色」/ 防止自我停用) */
  currentUserId?: string;
  /** 目前登入者角色 — 只有 system_admin 能選 system_admin (防提權) */
  currentUserRole?: UserRole;
  isSaving: boolean;
  onSave: (state: UserAccountFormState) => void;
  onClose: () => void;
}

export function UserAccountFormModal({
  open,
  mode,
  initial,
  existingPhones,
  clients,
  companies = [],
  onCreateClient,
  preselectClientId,
  currentUserId,
  currentUserRole,
  isSaving,
  onSave,
  onClose,
}: UserAccountFormModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<UserAccountFormState>(EMPTY_ACCOUNT_FORM);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [showPwd, setShowPwd] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_ACCOUNT_FORM, ...initial });
      setTouched({});
      setShowPwd(false);
    }
  }, [open, initial]);

  /**
   * 外部建立學校後回填「所屬學校」
   *
   * 使用者從「＋ 在此新增學校…」建立學校後, 新學校的 id 會傳進來,
   * 這裡即時把 select 的值換成新學校 (不需要關掉 modal 重開)。
   */
  React.useEffect(() => {
    if (!preselectClientId) return;
    setForm((p) => (p.clientId === preselectClientId ? p : { ...p, clientId: preselectClientId }));
  }, [preselectClientId]);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  /** system_admin / super_admin 允許非數字帳號 (例如 admin), 其他角色必須 8 位數字 */
  const phoneIsValid = (p: string, role: UserRole): boolean => {
    const trimmed = p.trim();
    if (!trimmed) return false;
    if (role === 'super_admin' || role === 'system_admin') return /^[a-zA-Z0-9_.-]{3,32}$/.test(trimmed);
    return /^[0-9]{8}$/.test(trimmed);
  };

  const fieldErrors = React.useMemo(() => {
    const errors: Record<string, string | null> = {
      name: !form.name.trim() ? '請填寫「姓名」' : null,
      phone: !form.phone.trim()
        ? '請填寫「登入帳號」'
        : !phoneIsValid(form.phone, form.role)
        ? (form.role === 'super_admin' || form.role === 'system_admin')
          ? '帳號需為 3-32 位英數字元'
          : '登入帳號需為 8 位數字'
        : null,
      password:
        // Edit mode: 密碼欄位留空 = 不修改現有密碼, 所以空值不算錯誤
        // Add mode: 密碼必填
        form.password.length === 0
          ? mode === 'add'
            ? '請填寫「密碼」'
            : null
          : form.password.length < 6
          ? '密碼至少 6 個字元'
          : form.password.length > 64
          ? '密碼不可超過 64 個字元'
          : null,
      email:
        form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
          ? 'Email 格式不正確'
          : null,
      // 所屬機構 / 所屬學校皆為選填 — 不做必填校驗
      clientId: null,
      companyId: null,
    };
    return errors;
  }, [form.name, form.phone, form.password, form.email, form.role, mode]);

  /** 登入帳號是否已被其他人使用 */
  const phoneTaken = React.useMemo(() => {
    const p = form.phone.trim();
    if (!p) return null;
    // add mode: 任何已存在都算重複
    // edit mode: 排除自己 (以 id 判斷, 但這裡拿不到 id, 靠 existingPhones + mode 判斷)
    if (mode === 'add') {
      return existingPhones.includes(p) ? p : null;
    }
    return null;
  }, [form.phone, existingPhones, mode]);

  const canSubmit =
    !isSaving &&
    phoneTaken === null &&
    Object.values(fieldErrors).every((e) => e === null);

  const handleSaveClick = () => {
    setTouched({ name: true, phone: true, password: true, email: true, clientId: true, companyId: true });
    if (phoneTaken) {
      toast.error(`登入帳號「${phoneTaken}」已被使用, 請換一個`);
      return;
    }
    if (!canSubmit) {
      const firstError = Object.entries(fieldErrors).find(([, v]) => v !== null)?.[0] ?? '';
      const       messages: Record<string, string> = {
        name: '請填寫「姓名」',
        phone:
          (form.role === 'super_admin' || form.role === 'system_admin')
            ? '帳號需為 3-32 位英數字元'
            : '登入帳號需為 8 位數字',
        password:
          mode === 'add'
            ? '請填寫「密碼」'
            : '密碼至少 6 個字元',
        email: 'Email 格式不正確',
      };
      toast.error(messages[firstError] || '請檢查並修正表單欄位');
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      // 兩者皆為選填：空字串 → null
      clientId: form.clientId || null,
      companyId: form.companyId || null,
    });
  };

  const title = mode === 'add' ? '新增登入帳號' : '編輯登入帳號';
  const subtitle =
    mode === 'add'
      ? '建立可登入後台的帳號, 並指定其角色與權限範圍。'
      : '更新帳號資料、角色與啟用狀態。';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="user-account-backdrop"
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
            aria-labelledby="user-account-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                {mode === 'add' ? (
                  <UserPlus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="user-account-form-title"
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
                  {/* Row 1: 姓名 / 登入帳號 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <LabeledInput
                        id="user-account-name"
                        label="姓名"
                        value={form.name}
                        onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                        placeholder="Jeff Chan"
                        required
                        icon={<ShieldCheck width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.name ? fieldErrors.name : null}
                      />
                    </div>
                    <div>
                      <LabeledInput
                        id="user-account-phone"
                        label="登入帳號"
                        value={form.phone}
                        onChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            phone: v.replace(/\s/g, '').slice(0, 32),
                          }))
                        }
                        placeholder={
                          (form.role === 'super_admin' || form.role === 'system_admin') ? 'admin' : '91234567'
                        }
                        required
                        type="tel"
                        inputMode={(form.role === 'super_admin' || form.role === 'system_admin') ? 'text' : 'numeric'}
                        icon={<Phone width={12} height={12} />}
                        hint="家長 / 保姆 / 客戶需為 8 位數字"
                      />
                      <InlineFieldError
                        message={
                          phoneTaken
                            ? `此登入帳號已被使用`
                            : touched.phone
                            ? fieldErrors.phone
                            : null
                        }
                      />
                    </div>
                  </div>

                  {/* Row 2: 密碼 / Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="user-account-password"
                        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                      >
                        密碼
                        {mode === 'add' && (
                          <span className="text-rose-500 ml-0.5">*</span>
                        )}
                        {mode === 'edit' && (
                          <span className="ml-1.5 normal-case tracking-normal font-normal text-slate-400">
                            留空 = 不修改
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <KeyRound width={12} height={12} />
                        </span>
                        <input
                          id="user-account-password"
                          type={showPwd ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, password: e.target.value }))
                          }
                          placeholder={
                            mode === 'add' ? '至少 6 個字元' : '留空則保留原密碼'
                          }
                          autoComplete="new-password"
                          spellCheck={false}
                          className="w-full h-9 rounded-md border border-slate-200 bg-white pl-8 pr-8 text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((s) => !s)}
                          aria-label={showPwd ? '隱藏密碼' : '顯示密碼'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                        >
                          {showPwd ? (
                            <EyeOff width={12} height={12} />
                          ) : (
                            <Eye width={12} height={12} />
                          )}
                        </button>
                      </div>
                      <InlineFieldError
                        message={touched.password ? fieldErrors.password : null}
                      />
                    </div>
                    <div>
                      <LabeledInput
                        id="user-account-email"
                        label="Email (選填)"
                        value={form.email}
                        onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                        placeholder="name@example.com"
                        type="email"
                        inputMode="email"
                        icon={<Mail width={12} height={12} />}
                      />
                      <InlineFieldError
                        message={touched.email ? fieldErrors.email : null}
                      />
                    </div>
                  </div>

                  {/* Row 3: 角色 */}
                  <div>
                    <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1.5 dark:text-slate-400">
                      角色
                      <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <RoleOptionCards
                      value={form.role}
                      currentUserRole={currentUserRole}
                      onChange={(r) =>
                        setForm((p) => ({
                          ...p,
                          role: r,
                        }))
                      }
                    />
                  </div>

                  {/* Row 4: 所屬學校 + 所屬機構 (同一行，皆選填) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="user-account-client"
                        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                      >
                        所屬學校 (選填)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <Building2 width={12} height={12} />
                        </span>
                        <select
                          id="user-account-client"
                          value={form.clientId ?? ''}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              clientId: e.target.value || null,
                            }))
                          }
                          className="w-full h-9 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors cursor-pointer dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        >
                          <option value="">— 未選擇 —</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {onCreateClient && (
                        <button
                          type="button"
                          onClick={onCreateClient}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer transition-colors"
                        >
                          <Plus width={11} height={11} />
                          在此新增學校…
                        </button>
                      )}
                      <InlineFieldError
                        message={touched.clientId ? fieldErrors.clientId : null}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="user-account-company"
                        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                      >
                        所屬機構 (選填)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <Building2 width={12} height={12} />
                        </span>
                        <select
                          id="user-account-company"
                          value={form.companyId ?? ''}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              companyId: e.target.value || null,
                            }))
                          }
                          className="w-full h-9 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors cursor-pointer dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                        >
                          <option value="">— 未選擇 —</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {companies.length === 0 ? (
                        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                          尚未建立任何機構，可先到「網站設定 → 所屬機構」新增
                        </p>
                      ) : (
                        <div className="min-h-[14px] mt-1" />
                      )}
                      <InlineFieldError
                        message={touched.companyId ? fieldErrors.companyId : null}
                      />
                    </div>
                  </div>
                </div>

                {/* ============== RIGHT COLUMN (角色摘要 + 登入資訊) ============== */}
                <aside className="px-4 py-5 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
                  {/* 目前角色 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-2 dark:text-slate-400">
                      目前角色
                    </p>
                    <div className="flex items-center gap-2">
                      <Pill tone={ROLE_TONES[form.role]} size="sm">
                        {ROLE_LABELS[form.role]}
                      </Pill>
                      <span className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                        {ROLE_DESCRIPTIONS[form.role]}
                      </span>
                    </div>
                  </div>

                  {/* 登入資訊 */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-blue-700 dark:text-blue-300 mb-2 inline-flex items-center gap-1.5">
                      <KeyRound width={11} height={11} />
                      登入資訊
                    </p>
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
                        <span className="text-[12px] font-mono font-semibold text-slate-900 dark:text-slate-100 truncate ml-auto">
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
                        <span className="text-[12px] font-mono font-semibold text-slate-900 dark:text-slate-100 truncate ml-auto">
                          {form.password ? '••••••••' : '—'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-start gap-1 pt-0.5">
                        <AlertTriangle
                          width={9}
                          height={9}
                          className="text-amber-500 shrink-0 mt-px"
                        />
                        <span>
                          目前系統以明碼儲存密碼, 上線前需改為 hash。
                        </span>
                      </p>
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
                              ? '可正常登入系統'
                              : '無法登入 (帳戶已停用)'}
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
                </aside>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 z-10 px-5 py-3 bg-white/95 backdrop-blur-sm border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/95 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone={ROLE_TONES[form.role]} size="sm">
                  {ROLE_LABELS[form.role]}
                </Pill>
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
                  startIcon={
                    !isSaving ? <Save width={12} height={12} /> : undefined
                  }
                >
                  {mode === 'add' ? '建立帳號' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
