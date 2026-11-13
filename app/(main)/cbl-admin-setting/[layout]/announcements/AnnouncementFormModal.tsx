'use client';

/**
 * Add / Edit Announcement Modal — OneFleet-style console modal
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §14 Modal Chrome (Hand-Coded)
 *   §16 Form Field Primitives
 *   §21 Modal Footer
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/announcements/ 使用。
 *
 * ⚠️ 兩步驟流程 (2026-11):
 *   Step 1「選類型」→ 先決定這則公告的受眾 (系統公告 / 繳費公告)
 *   Step 2「填資料」→ 才輸入標題、內容、有效期、名單…
 *   為什麼要拆開: 公告類型決定了後面要填的欄位完全不同
 *   (繳費公告多一個「指定家長」), 先讓管理員想清楚受眾再填內容。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Pencil,
  X,
  Save,
  Megaphone,
  AlertTriangle,
  AlertCircle,
  Info,
  Globe,
  CreditCard,
  ArrowRight,
  ArrowLeft,
  Users as UsersIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '../students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../students/design-tokens';
import {
  EMPTY_ANNOUNCEMENT_FORM,
  PAYMENT_CONTENT_PLACEHOLDER,
  getPaymentDefaultDates,
  type AnnouncementFormState,
} from './types';
import { ParentMultiSelect } from './ParentMultiSelect';
import { PaymentBindingPanel } from './PaymentBindingPanel';
import type { Parent } from '@/lib/types';

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
  max,
  min,
  step,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'date' | 'textarea';
  required?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric';
  max?: string;
  min?: string;
  step?: string;
  icon?: React.ReactNode;
}) {
  const baseClass =
    'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200';

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
        {type === 'textarea' ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            rows={4}
            className={cn(
              baseClass,
              'h-auto py-2 px-2.5 resize-none',
              icon ? 'pl-8' : 'px-2.5',
            )}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            inputMode={inputMode}
            max={max}
            min={min}
            step={step}
            className={cn(baseClass, icon ? 'pl-8 pr-2.5' : 'px-2.5')}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NativeSelect — 包裝 native <select>                                         */
/* -------------------------------------------------------------------------- */

function NativeSelect({
  id,
  label,
  value,
  onChange,
  required,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  children: React.ReactNode;
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
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors cursor-pointer dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
      >
        {children}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TypeCard — 公告類型選擇 (3 種卡片, toggle card pattern)                      */
/* -------------------------------------------------------------------------- */

const TYPE_OPTIONS = [
  {
    value: 'info' as const,
    label: '資訊',
    icon: <Info width={14} height={14} />,
    desc: '一般通知',
    tone: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50',
    activeTone: 'bg-blue-600 text-white shadow-sm',
  },
  {
    value: 'warning' as const,
    label: '警告',
    icon: <AlertTriangle width={14} height={14} />,
    desc: '需要注意',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',
    activeTone: 'bg-amber-600 text-white shadow-sm',
  },
  {
    value: 'urgent' as const,
    label: '緊急',
    icon: <AlertCircle width={14} height={14} />,
    desc: '急需處理',
    tone: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',
    activeTone: 'bg-rose-600 text-white shadow-sm',
  },
];

/* -------------------------------------------------------------------------- */
/*  SCOPE_OPTIONS — 受眾分類 (系統公告 / 繳費公告)                               */
/*                                                                             */
/*  ⚠️ Step 1 就是選這個 —— 管理員先想清楚「誰看得到」再填內容。                  */
/* -------------------------------------------------------------------------- */

const SCOPE_OPTIONS = [
  {
    value: 'system' as const,
    label: '系統公告',
    icon: <Globe width={16} height={16} />,
    desc: '所有用戶都會看到',
    tone: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50',
    activeTone: 'bg-sky-600 text-white shadow-sm',
    bullets: [
      '家長、保姆、機構員工全部都會看到',
      '不受機構限制, 全站適用',
      '適合: 假期安排、系統維護、全域通知',
    ],
  },
  {
    value: 'payment' as const,
    label: '繳費公告',
    icon: <CreditCard width={16} height={16} />,
    desc: '只顯示給選定的家長',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50',
    activeTone: 'bg-emerald-600 text-white shadow-sm',
    bullets: [
      '只有你在下一步選中的家長會看到',
      '其他家長完全看不到這則公告',
      '內容、有效期由付款記錄自動帶出',
      '適合: 個別帳單、補繳通知',
    ],
  },
];

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
/*  AnnouncementFormModal — 主表單                                              */
/* -------------------------------------------------------------------------- */

export interface AnnouncementFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial: AnnouncementFormState;
  /** 編輯模式時, 顯示公告標題作為標識 */
  editingTitle?: string;
  isSaving: boolean;
  onSave: (state: AnnouncementFormState) => void;
  onClose: () => void;
  /**
   * 可選的家長清單 (繳費公告的指定受眾)。
   */
  parents?: Parent[];
  /**
   * 開啟時要停在哪個步驟 (預設: 新增 → Step 1, 編輯 → Step 2)。
   *
   * ⚠️ 「從範本建立」會指定 'data' — 因為範本已經帶了受眾與內容,
   *    再要求管理員重選一次類型是多余的。
   */
  startStep?: FormStep;
}

/** 表單步驟 — type = 先選受眾類型, data = 再填內容 */
type FormStep = 'type' | 'data';

export function AnnouncementFormModal({
  open,
  mode,
  initial,
  editingTitle,
  isSaving,
  onSave,
  onClose,
  parents = [],
  startStep,
}: AnnouncementFormModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<AnnouncementFormState>(EMPTY_ANNOUNCEMENT_FORM);
  const [step, setStep] = React.useState<FormStep>('type');

  // open / mode / initial 變動時重置
  React.useEffect(() => {
    if (open) {
      const next: AnnouncementFormState = { ...EMPTY_ANNOUNCEMENT_FORM, ...initial };
      // ⚠️ 繳費公告 → 內容 / 類型 / 有效期 / 次數上限都「由付款記錄帶出」,
      //    管理員不手動填 → 這裡先塞入佔位值 (付款記錄功能尚未開發)。
      if ((next.scope || 'system') === 'payment') {
        if (!next.content.trim()) next.content = PAYMENT_CONTENT_PLACEHOLDER;
        if (!next.startDate || !next.endDate) {
          const d = getPaymentDefaultDates();
          next.startDate = next.startDate || d.startDate;
          next.endDate = next.endDate || d.endDate;
        }
      }
      setForm(next);
      // ⚠️ 新增 → 先選類型 (Step 1); 編輯 → 直接進資料頁 (已有類型)
      setStep(startStep ?? (mode === 'add' ? 'type' : 'data'));
    }
  }, [open, mode, initial, startStep]);

  // 校驗
  const fieldErrors = React.useMemo(() => {
    // ⚠️ 繳費公告 → 內容 / 有效期由「付款記錄」帶出, 管理員不填 → 不檢查
    const isPayment = (form.scope || 'system') === 'payment';
    return {
      title: !form.title.trim() ? '請填寫「標題」' : null,
      content:
        !isPayment && !form.content.trim() ? '請填寫「內容」' : null,
      templateName:
        form.isTemplate && !form.templateName.trim() ? '請填寫「範本名稱」' : null,
      dates:
        !isPayment &&
        form.startDate &&
        form.endDate &&
        form.startDate > form.endDate
          ? '結束日期不可早於開始日期'
          : null,
      targetParentIds:
        isPayment && form.targetParentIds.length === 0
          ? '請至少選擇一位家長'
          : null,
    };
  }, [
    form.title,
    form.content,
    form.isTemplate,
    form.templateName,
    form.startDate,
    form.endDate,
    form.scope,
    form.targetParentIds,
  ]);

  const canSubmit =
    !isSaving &&
    !fieldErrors.title &&
    !fieldErrors.content &&
    !fieldErrors.templateName &&
    !fieldErrors.dates &&
    !fieldErrors.targetParentIds;

  // 是否曾被觸碰 (blur)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    if (open) setTouched({});
  }, [open]);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  const handleSaveClick = () => {
    setTouched({ title: true, content: true, templateName: true, startDate: true, endDate: true, targetParentIds: true });
    if (!canSubmit) {
      const errorMessages: Record<string, string> = {
        title: '請填寫「標題」',
        content: '請填寫「內容」',
        templateName: '請填寫「範本名稱」',
        dates: '結束日期不可早於開始日期',
        targetParentIds: '請至少選擇一位家長',
      };
      const firstError = Object.entries(fieldErrors).find(([, v]) => v !== null)?.[0] ?? '';
      toast.error(errorMessages[firstError] || '請檢查並修正表單欄位');
      return;
    }
    onSave(form);
  };

  const title = mode === 'add' ? '新增公告' : '編輯公告';
  const subtitle =
    mode === 'add'
      ? step === 'type'
        ? '先選擇這則公告的受眾類型。'
        : '建立公告內容並設定顯示期間。'
      : '更新公告內容與顯示設定。';

  const scopeMeta = SCOPE_OPTIONS.find((o) => o.value === (form.scope || 'system'));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="announcement-form-backdrop"
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[640px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-visible flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                {mode === 'add' ? (
                  <Plus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="announcement-form-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {subtitle}
                </p>
              </div>
              {/* 步驟指示 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <StepDot active={step === 'type'} done={step === 'data'} label="1" />
                <span className="w-3 h-px bg-slate-300 dark:bg-slate-600" />
                <StepDot active={step === 'data'} done={false} label="2" />
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

            {/* ============================ Step 1 — 選類型 ============================ */}
            {step === 'type' ? (
              <div className="px-5 py-6 space-y-4">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                    這則公告會顯示給誰？
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5 dark:text-slate-400">
                    選好類型後, 下一步才會出現對應的資料欄位。
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SCOPE_OPTIONS.map((opt) => {
                    const isActive = (form.scope || 'system') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            scope: opt.value,
                            // 切回系統公告 → 清掉家長名單 (避免殘留髒資料)
                            targetParentIds:
                              opt.value === 'system' ? [] : p.targetParentIds,
                          }))
                        }
                        className={cn(
                          'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                          isActive
                            ? opt.activeTone + ' border-transparent'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                            isActive
                              ? 'bg-white/20 text-white'
                              : opt.tone,
                          )}
                        >
                          {opt.icon}
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              'text-[14px] font-semibold',
                              isActive
                                ? 'text-white'
                                : 'text-slate-900 dark:text-slate-100',
                            )}
                          >
                            {opt.label}
                          </span>
                          <span
                            className={cn(
                              'text-[11.5px]',
                              isActive
                                ? 'text-white/80'
                                : 'text-slate-500 dark:text-slate-400',
                            )}
                          >
                            {opt.desc}
                          </span>
                        </span>
                        <ul
                          className={cn(
                            'mt-1 space-y-1 w-full',
                            isActive ? 'text-white/85' : 'text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {opt.bullets.map((b) => (
                            <li key={b} className="flex items-start gap-1.5 text-[11px]">
                              <span
                                aria-hidden
                                className={cn(
                                  'mt-[6px] h-1 w-1 rounded-full shrink-0',
                                  isActive ? 'bg-white/70' : 'bg-slate-400',
                                )}
                              />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ========================= Step 2 — 填資料 ========================= */
              <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4 dark:scrollbar-thin">
                {/* 受眾摘要 — 從 Step 1 帶過來, 可按「更改」回去 */}
                <div className="md:col-span-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                  <span
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                      scopeMeta?.tone,
                    )}
                  >
                    {scopeMeta?.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                      受眾：{scopeMeta?.label ?? '系統公告'}
                      {form.scope === 'payment' && (
                        <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
                          · 已選 {form.targetParentIds.length} 位家長
                        </span>
                      )}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      {form.scope === 'payment'
                        ? '只有下面選中的家長會看到這則公告。內容與有效期由付款記錄自動帶出。'
                        : '所有用戶 (家長 / 保姆 / 機構員工) 都會看到這則公告。'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('type')}
                    className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11.5px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
                  >
                    更改類型
                  </button>
                </div>

                {/* 指定家長 — 只有繳費公告才需要 */}
                {form.scope === 'payment' && (
                  <div className="md:col-span-2">
                    <ParentMultiSelect
                      parents={parents}
                      value={form.targetParentIds}
                      onChange={(ids) => {
                        setForm((p) => ({ ...p, targetParentIds: ids }));
                        markTouched('targetParentIds');
                      }}
                    />
                    <InlineFieldError
                      message={
                        touched.targetParentIds
                          ? fieldErrors.targetParentIds
                          : null
                      }
                    />
                  </div>
                )}

                {/* 標題 */}
                <div className="md:col-span-2">
                  <LabeledInput
                    id="ann-form-title"
                    label="標題"
                    value={form.title}
                    onChange={(v) => setForm((p) => ({ ...p, title: v }))}
                    onBlur={() => markTouched('title')}
                    placeholder="例如: 明日校巴服務暫停通知"
                    required
                    icon={<Megaphone width={12} height={12} />}
                  />
                  <InlineFieldError
                    message={touched.title ? fieldErrors.title : null}
                  />
                </div>

                {/* ============================================================
                    繳費公告 → 內容 / 類型 / 有效期 / 次數上限 全部「由付款記錄帶出」
                    → 這些欄位不顯示, 改成顯示「綁定付款記錄」的開發中面板
                    ============================================================ */}
                {form.scope === 'payment' ? (
                  <PaymentBindingPanel />
                ) : (
                  <>
                    {/* 公告類型 — 3 卡片橫排 */}
                    <div className="md:col-span-2">
                      <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-2 dark:text-slate-400">
                        公告類型
                        <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {TYPE_OPTIONS.map((opt) => {
                          const isActive = form.type === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setForm((p) => ({ ...p, type: opt.value }));
                                markTouched('type');
                              }}
                              className={cn(
                                'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-[12px] font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                                isActive
                                  ? opt.activeTone
                                  : opt.tone + ' border-transparent hover:border-current',
                              )}
                            >
                              {opt.icon}
                              <span>{opt.label}</span>
                              <span className="text-[10px] font-normal opacity-70">
                                {opt.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 內容 */}
                    <div className="md:col-span-2">
                      <LabeledInput
                        id="ann-form-content"
                        label="內容"
                        value={form.content}
                        onChange={(v) => setForm((p) => ({ ...p, content: v }))}
                        onBlur={() => markTouched('content')}
                        placeholder="請輸入公告詳細內容..."
                        type="textarea"
                        required
                      />
                      <InlineFieldError
                        message={touched.content ? fieldErrors.content : null}
                      />
                    </div>
                  </>
                )}

                {/* 範本勾選
                    語意: 「另外建立一份範本」— 不是把這則公告本身變成範本。
                    早期實作把 isTemplate 寫在「同一筆」資料上, 結果該公告被
                    getActive() 的 `!a.isTemplate` 條件濾掉 → 公告從此不再顯示。
                    現在改成: 勾選時額外建立一筆獨立的範本資料。 */}
                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="ann-form-is-template"
                      checked={form.isTemplate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, isTemplate: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                    />
                    <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
                      同時另存一份為範本
                    </span>
                  </label>
                </div>

                {/* 範本名稱 (條件顯示) */}
                {form.isTemplate && (
                  <div className="md:col-span-2">
                    <LabeledInput
                      id="ann-form-template-name"
                      label="範本名稱"
                      value={form.templateName}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, templateName: v }))
                      }
                      onBlur={() => markTouched('templateName')}
                      placeholder="例如: 雨天通告、假期通知"
                      required
                    />
                    <InlineFieldError
                      message={
                        touched.templateName
                          ? fieldErrors.templateName
                          : null
                      }
                    />
                  </div>
                )}

                {/* 日期範圍 + 次數上限
                    ⚠️ 繳費公告 → 這些欄位「由付款記錄帶出」(帳單週期 / 未繳戶數),
                        管理員不填 → 整段不顯示 (見上方 PaymentBindingPanel)。 */}
                {form.scope !== 'payment' && (
                  <>
                    <div>
                      <LabeledInput
                        id="ann-form-start"
                        label="開始日期"
                        value={form.startDate}
                        onChange={(v) => setForm((p) => ({ ...p, startDate: v }))}
                        type="date"
                        max={form.endDate || undefined}
                      />
                    </div>
                    <div>
                      <LabeledInput
                        id="ann-form-end"
                        label="結束日期"
                        value={form.endDate}
                        onChange={(v) => setForm((p) => ({ ...p, endDate: v }))}
                        type="date"
                        min={form.startDate || undefined}
                      />
                      <InlineFieldError message={fieldErrors.dates} />
                    </div>

                    {/* 顯示次數 — 純統計用途
                        註: 從 2026-10-26 起, 生效中的公告在限期內「每次進入主頁」
                        都會自動彈出, 這兩個數字不再限制彈出行為, 僅作為統計參考。 */}
                    <div>
                      <NativeSelect
                        id="ann-form-display-count"
                        label="總顯示次數 (統計)"
                        value={String(form.displayCount)}
                        onChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            displayCount: Math.max(1, parseInt(v) || 1),
                          }))
                        }
                      >
                        {[1, 2, 3, 5, 10, 20].map((n) => (
                          <option key={n} value={n}>
                            {n} 次
                          </option>
                        ))}
                      </NativeSelect>
                    </div>

                    <div>
                      <NativeSelect
                        id="ann-form-max-views"
                        label="每用戶顯示上限 (統計)"
                        value={String(form.maxViewsPerUser)}
                        onChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            maxViewsPerUser: Math.max(1, parseInt(v) || 1),
                          }))
                        }
                      >
                        {[1, 2, 3, 5].map((n) => (
                          <option key={n} value={n}>
                            {n} 次
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </>
                )}
              </div>
            )}

            <p className="px-5 pb-1 text-[10.5px] text-slate-500 leading-relaxed dark:text-slate-400">
              {form.scope === 'payment' && step === 'data' ? (
                <>
                  繳費公告的內容、類型、有效期與提醒次數由付款記錄自動帶出
                  (該功能開發中) — 現在只有標題與指定家長需要設定。
                </>
              ) : (
                <>
                  生效中的公告會在有效期內「每一次進入主頁」自動彈出, 除非使用者勾選
                  「不再顯示此通告」。上述兩個次數設定僅為統計數字, 不會限制自動彈出。
                </>
              )}
            </p>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                {step === 'type' ? (
                  <>
                    <UsersIcon width={11} height={11} />
                    步驟 1 / 2 — 先選受眾類型
                  </>
                ) : (
                  <>
                    {form.isTemplate && (
                      <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50 font-medium">
                        將另存一份為範本
                      </span>
                    )}
                    {form.scope === 'payment' && (
                      <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50 font-medium">
                        繳費 · {form.targetParentIds.length} 位家長
                      </span>
                    )}
                  </>
                )}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {step === 'type' ? (
                  <>
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
                      onClick={() => setStep('data')}
                      startIcon={<ArrowRight width={12} height={12} />}
                    >
                      下一步
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setStep('type')}
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <ArrowLeft width={12} height={12} />
                      上一步
                    </button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveClick}
                      isLoading={isSaving}
                      disabled={!canSubmit}
                      startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                    >
                      {mode === 'add' ? '新增公告' : '儲存變更'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  StepDot — 步驟指示圓點                                                      */
/* -------------------------------------------------------------------------- */

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
        active
          ? 'bg-blue-600 text-white'
          : done
          ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
          : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
      )}
    >
      {label}
    </span>
  );
}
