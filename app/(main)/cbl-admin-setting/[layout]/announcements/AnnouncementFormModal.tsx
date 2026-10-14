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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../students/design-tokens';
import {
  EMPTY_ANNOUNCEMENT_FORM,
  type AnnouncementFormState,
} from './types';
import type { Announcement } from '@/lib/types';

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
}

export function AnnouncementFormModal({
  open,
  mode,
  initial,
  editingTitle,
  isSaving,
  onSave,
  onClose,
}: AnnouncementFormModalProps) {
  const [form, setForm] = React.useState<AnnouncementFormState>(EMPTY_ANNOUNCEMENT_FORM);

  // open / mode / initial 變動時重置
  React.useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_ANNOUNCEMENT_FORM, ...initial });
    }
  }, [open, mode, initial]);

  // 校驗
  const fieldErrors = React.useMemo(() => {
    return {
      title: !form.title.trim() ? '請填寫「標題」' : null,
      content: !form.content.trim() ? '請填寫「內容」' : null,
      templateName:
        form.isTemplate && !form.templateName.trim() ? '請填寫「範本名稱」' : null,
      dates:
        form.startDate && form.endDate && form.startDate > form.endDate
          ? '結束日期不可早於開始日期'
          : null,
    };
  }, [form.title, form.content, form.isTemplate, form.templateName, form.startDate, form.endDate]);

  const canSubmit =
    !isSaving &&
    !fieldErrors.title &&
    !fieldErrors.content &&
    !fieldErrors.templateName &&
    !fieldErrors.dates;

  // 是否曾被觸碰 (blur)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    if (open) setTouched({});
  }, [open]);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  const title = mode === 'add' ? '新增公告' : '編輯公告';
  const subtitle =
    mode === 'add'
      ? '建立公告內容並設定顯示期間。'
      : '更新公告內容與顯示設定。';

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
            <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4 dark:scrollbar-thin">

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

              {/* 範本勾選 */}
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
                    同時儲存為範本
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
                      touched.templateName ? fieldErrors.templateName : null
                    }
                  />
                </div>
              )}

              {/* 日期範圍 */}
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

              {/* 顯示次數 */}
              <div>
                <NativeSelect
                  id="ann-form-display-count"
                  label="總顯示次數"
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
                  label="每用戶顯示上限"
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
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                {form.isTemplate && (
                  <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50 font-medium">
                    將同時儲存為範本
                  </span>
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
                  onClick={() => onSave(form)}
                  isLoading={isSaving}
                  disabled={!canSubmit}
                  startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                >
                  {mode === 'add' ? '新增公告' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
