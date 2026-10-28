'use client';

/**
 * ParentFormModal — 共用的家長 / 監護人表單
 *
 * 設計目的:
 * - 同時供 StudentFormModal 內聯 (在新增學生時順便建立家長) 與
 *   /settings/parents 頁面頂部「新增家長」按鈕 兩種場景使用。
 * - 表單欄位遵守使用者的需求:
 *     必填: 姓名 / 與學生關係 / 行動電話 / 密碼
 *     選填 (進階): 住家電話 / 公司電話 / 通訊地址
 *     (主要聯繫人標記已移至「學生 → 關聯家長」中設定)
 * - 不依賴 HeroUI; 沿用既有 StudentFormModal 的 LabeledInput / NativeSelect 風格。
 *
 * 範圍: 跨 /cbl-admin-setting/[layout]/students/ 與 /settings/parents 兩處。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserPlus,
  Pencil,
  X,
  Save,
  User,
  Phone as PhoneIcon,
  Home as HomeIcon,
  Briefcase,
  MapPin,
  KeyRound,
  Users,
  CheckCircle,
  Info,
  Lock,
  GraduationCap,
  Search,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import type { Parent, ParentRelationship, Student } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const RELATIONSHIP_OPTIONS: { value: ParentRelationship; label: string }[] = [
  { value: 'father',                label: '父親' },
  { value: 'mother',                label: '母親' },
  { value: 'grandfather_paternal',  label: '祖父' },
  { value: 'grandmother_paternal',  label: '祖母' },
  { value: 'grandfather_maternal',  label: '外祖父' },
  { value: 'grandmother_maternal',  label: '外祖母' },
  { value: 'guardian_other',        label: '其他監護人' },
];

export const GENDER_OPTIONS = [
  { value: 'male',   label: '男' },
  { value: 'female', label: '女' },
  { value: 'other',  label: '其他' },
] as const;

export const EMPTY_PARENT_FORM: ParentFormState = {
  name: '',
  relationship: 'father',
  phone: '',
  password: '',
  homePhone: '',
  officePhone: '',
  address: '',
  studentIds: [],
};

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ParentFormState {
  name: string;
  relationship: ParentRelationship;
  phone: string;
  password: string;
  homePhone: string;
  officePhone: string;
  address: string;
  /** 此家長已關聯的學生 ids (將寫入 Student.parentIds) */
  studentIds: string[];
}

export interface ParentFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial: ParentFormState;
  existingParents: Parent[];
  /** 全部學生清單 — 用於「關聯學生」多選欄位。 */
  students?: Student[];
  editingId?: string;
  isSaving: boolean;
  onSave: (state: ParentFormState) => void;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/*  LabeledInput (reused style)                                                */
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
  disabled,
  icon,
  rightHint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'password';
  required?: boolean;
  inputMode?: 'text' | 'tel' | 'numeric';
  maxLength?: number;
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Optional small hint rendered after the label (e.g. "登入帳號不可更改"). */
  rightHint?: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
        {rightHint && (
          <span className="ml-1 normal-case font-medium tracking-normal text-slate-400 dark:text-slate-500">
            {rightHint}
          </span>
        )}
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
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
            disabled && 'bg-slate-100 text-slate-500 cursor-not-allowed dark:bg-slate-800 dark:text-slate-400',
          )}
        />
      </div>
    </div>
  );
}

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
/*  Toggle switch                                                              */
/* -------------------------------------------------------------------------- */

function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  hint,
  required,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <div className="flex items-center gap-3 h-9">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer',
            checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm',
              checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
            )}
          />
        </button>
        <span className="text-[12px] text-slate-700 dark:text-slate-200">
          {checked ? '是' : '否'}
        </span>
        {hint && (
          <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Block helpers                                                              */
/* -------------------------------------------------------------------------- */

function InlineBlocker({ message }: { message: string }) {
  return (
    <div className="shrink-0 flex items-start gap-2 px-2.5 py-2 rounded-md border border-amber-200/70 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-amber-600 dark:text-amber-400 shrink-0 mt-px"
      >
        <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">{message}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StudentTagSelect — 關聯學生多選晶片                                           */
/* -------------------------------------------------------------------------- */

/**
 * Tag/Chip 模式的多選學生:
 * - 選中的學生以 chip 顯示, 點 X 移除
 * - 輸入框可搜尋未選學生 (name / studentId / classNumber)
 * - 下拉依 createdAt 倒序 (最近的在前)
 * - 每個 student chip 顯示: 姓名 + 學號 + 班別
 */
function StudentTagSelect({
  students,
  selectedIds,
  onToggle,
}: {
  students: Student[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIdx, setHighlightedIdx] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 依 query 篩選未選學生
  const filteredUnselected = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const unselected = students.filter((s) => !selectedIds.includes(s.id));
    if (!q) {
      return [...unselected].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
    }
    return unselected.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.classNumber.toLowerCase().includes(q),
    );
  }, [students, selectedIds, query]);

  // 已選的學生
  const selectedStudents = React.useMemo(
    () => selectedIds.map((id) => students.find((s) => s.id === id)).filter(Boolean) as Student[],
    [students, selectedIds],
  );

  // 點外面關閉
  React.useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  // 重設 highlighted index
  React.useEffect(() => {
    setHighlightedIdx(0);
  }, [query, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, filteredUnselected.length - 1));
      setIsOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredUnselected[highlightedIdx];
      if (target) {
        onToggle(target.id);
        setQuery('');
      }
    } else if (e.key === 'Backspace' && !query && selectedStudents.length > 0) {
      e.preventDefault();
      onToggle(selectedStudents[selectedStudents.length - 1].id);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (students.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-3 py-2.5 text-[11px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
        尚未建立任何學生資料, 無可關聯。
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Label */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
          關聯學生
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">選填</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          · {selectedIds.length}/{students.length}
        </span>
      </div>

      {/* 已選 + 輸入框容器 */}
      <div
        className={cn(
          'relative flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-2 rounded-md border bg-white cursor-text transition-colors',
          'focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/40',
          'border-slate-200 dark:bg-slate-900 dark:border-slate-700',
          isOpen && filteredUnselected.length > 0 && 'rounded-bl-none rounded-br-none',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* 已選 chip */}
        {selectedStudents.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800/60"
          >
            <GraduationCap width={10} height={10} className="text-blue-500 dark:text-blue-300 shrink-0" />
            <span className="truncate max-w-[120px]">{s.name}</span>
            <span className="text-blue-600/60 dark:text-blue-300/60 font-mono text-[10px]">{s.studentId}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(s.id);
              }}
              aria-label={`移除 ${s.name}`}
              className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-blue-200/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 transition-colors cursor-pointer"
            >
              <X width={9} height={9} />
            </button>
          </span>
        ))}

        {/* 搜尋輸入框 */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedStudents.length === 0
              ? '搜尋學生姓名、學號或班別…'
              : ''
          }
          className="flex-1 min-w-[120px] h-6 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
        />

        {/* Dropdown chevron — 視覺提示, 可直接點擊展開 */}
        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
          aria-label={isOpen ? '收合學生清單' : '展開學生清單'}
          className="shrink-0 ml-auto inline-flex items-center justify-center h-6 w-5 rounded-sm text-slate-400 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-500"
        >
          <ChevronDown
            width={12}
            height={12}
            className={cn(
              'transition-transform duration-150',
              isOpen && 'rotate-180 text-blue-500 dark:text-blue-300',
            )}
          />
        </button>
      </div>

      {/* 下拉建議 */}
      <AnimatePresence>
        {isOpen && filteredUnselected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.1 }}
            className="absolute z-20 top-full left-0 right-0 bg-white rounded-md rounded-tl-none border border-slate-200 border-t-0 shadow-lg dark:bg-slate-900 dark:border-slate-700"
          >
            <ul className="max-h-[200px] overflow-y-auto py-1">
              {filteredUnselected.map((s, idx) => (
                <li
                  key={s.id}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onToggle(s.id);
                    setQuery('');
                  }}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 cursor-pointer text-[12px] transition-colors',
                    idx === highlightedIdx
                      ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                  )}
                >
                  <GraduationCap
                    width={11}
                    height={11}
                    className={cn(
                      'shrink-0',
                      idx === highlightedIdx
                        ? 'text-blue-500 dark:text-blue-300'
                        : 'text-slate-400',
                    )}
                  />
                  <span className="font-semibold truncate">{s.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">{s.studentId}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{s.classNumber || '—'}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* 搜尋無結果 */}
        {isOpen && query && filteredUnselected.length === 0 && (
          <div className="absolute z-20 top-full left-0 right-0 bg-white rounded-md rounded-tl-none border border-slate-200 border-t-0 shadow-lg dark:bg-slate-900 dark:border-slate-700">
            <div className="px-3 py-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              沒有符合「{query}」的學生
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main modal                                                                 */
/* -------------------------------------------------------------------------- */

export function ParentFormModal({
  open,
  mode,
  initial,
  existingParents,
  students = [],
  editingId,
  isSaving,
  onSave,
  onClose,
}: ParentFormModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<ParentFormState>(EMPTY_PARENT_FORM);
  // 用 ref 記住上次是否已開啟過 (避免每次 open 切換都重置使用者已輸入的資料)
  const hasInitializedRef = React.useRef(false);

  /**
   * 重置策略:
   * - 第一次開啟: 用 initial 初始化
   * - 之後關閉再開: 保留使用者輸入 (避免資料意外遺失)
   * - 外部主動呼叫 resetForm(): 清空 (供儲存成功後使用)
   * - initial 變動 (例如 edit mode 換編輯對象): 重置
   */
  React.useEffect(() => {
    if (open) {
      if (!hasInitializedRef.current) {
        setForm({ ...EMPTY_PARENT_FORM, ...initial });
        hasInitializedRef.current = true;
      }
    } else {
      // modal 關閉時保留 form (供下次開啟時沿用)
    }
  }, [open, initial]);

  // 切換 mode 或 editingId 時 (編輯不同對象) 重置
  React.useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_PARENT_FORM, ...initial });
    }
  }, [mode, editingId]);

  // 暴露 reset 方法給父層 — 父層可在 onSave 完成後呼叫
  // (透過 ref 拿到這份內部 state; 但本專案用 callback onSave, 所以父層在 onSave 裡直接重置即可)
  // 為簡化, 我們在 onSave 觸發時也自動清空 (不論儲存成功與否)
  // 但這會讓「儲存失敗」時資料也消失, 所以加一個 submittedRef 標記。
  const submittedRef = React.useRef(false);
  const handleSaveClick = () => {
    // 客戶端基本驗證 — 給使用者明確的錯誤提示
    if (!form.name.trim()) {
      toast.error('請輸入姓名');
      return;
    }
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 8) {
      toast.error('請輸入有效的電話號碼 (至少 8 位數字)');
      return;
    }
    if (mode === 'add' && !form.password) {
      toast.error('請設定登入密碼');
      return;
    }
    if (mode === 'add' && form.password && form.password.length < 6) {
      toast.error('密碼至少需要 6 個字元');
      return;
    }
    // 電話是否已被其他家長使用
    if (mode === 'add' && existingParents.some((p) => p.phone === form.phone.trim())) {
      toast.error('此電話已被另一位家長使用，請更換其他號碼');
      return;
    }
    submittedRef.current = true;
    onSave(form);
  };
  React.useEffect(() => {
    if (submittedRef.current && !open) {
      // modal 關閉且剛剛送過儲存 → 清空
      setForm(EMPTY_PARENT_FORM);
      hasInitializedRef.current = false;
      submittedRef.current = false;
    }
  }, [open]);

  // 檢查電話是否已被其他家長使用
  const phoneTakenByOther = React.useMemo(() => {
    if (!form.phone.trim()) return null;
    return existingParents.find(
      (p) => p.phone === form.phone.trim() && p.id !== editingId,
    ) ?? null;
  }, [form.phone, existingParents, editingId]);

  // 校驗 (家長層級不再檢查「主要聯繫人」標記; 主要聯繫人已改為「學生視角」)
  // - 編輯模式: 密碼改為選填 (留空 = 保留現有密碼), 但若有填則至少 4 字元
  // - 電話在編輯模式由 UI 鎖住, 不需重複校驗
  const isEdit = mode === 'edit';
  const blocker = !form.name.trim()
    ? '請填寫「家長姓名」'
    : !form.phone.trim()
    ? '請填寫「行動電話」'
    : form.phone.trim().length < 8
    ? '行動電話需要 8 碼'
    : phoneTakenByOther
    ? `此電話已被「${phoneTakenByOther.name}」使用`
    : !isEdit && !form.password
    ? '請設定「家長登入密碼」'
    : isEdit && form.password && form.password.length < 4
    ? '密碼至少 4 個字元'
    : !isEdit && form.password.length < 4
    ? '密碼至少 4 個字元'
    : null;

  const canSubmit = !isSaving && blocker === null;

  const title = mode === 'add' ? '新增家長' : '編輯家長';
  const subtitle =
    mode === 'add'
      ? '建立家長資料, 之後可在「關聯家長」中綁定此學生。'
      : '更新家長資料與聯絡方式。電話為登入帳號不可更改, 密碼留空表示保留現有密碼。';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="parent-form-backdrop"
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[760px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-visible flex flex-col dark:bg-slate-900 dark:border-slate-700"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 shrink-0 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                {mode === 'add' ? (
                  <UserPlus width={18} height={18} />
                ) : (
                  <Pencil width={18} height={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="parent-form-title"
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

            {/* Body — 兩欄: 左基本資料, 右關聯學生 + 進階 */}
            <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 dark:scrollbar-thin overflow-y-auto flex-1">
              {/* ========== 左欄: 基本資料 ========== */}
              <div className="flex flex-col gap-4">
                {/* Row 1: 家長姓名 / 與學生關係 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LabeledInput
                    id="parent-form-name"
                    label="家長姓名"
                    value={form.name}
                    onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="陳大文"
                    required
                    icon={<User width={12} height={12} />}
                  />

                  <NativeSelect
                    id="parent-form-relationship"
                    label="與學生關係"
                    value={form.relationship}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, relationship: v as ParentRelationship }))
                    }
                    required
                  >
                    {RELATIONSHIP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                {/* Row 2: 行動電話 / 家長登入密碼 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LabeledInput
                    id="parent-form-phone"
                    label="行動電話 (登入帳號)"
                    value={form.phone}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, phone: v.replace(/\D/g, '').slice(0, 8) }))
                    }
                    placeholder="91234567"
                    type="tel"
                    inputMode="tel"
                    maxLength={8}
                    required
                    disabled={isEdit}
                    icon={isEdit ? <Lock width={11} height={11} /> : <PhoneIcon width={12} height={12} />}
                    rightHint={
                      isEdit ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Lock width={9} height={9} />
                          不可更改
                        </span>
                      ) : undefined
                    }
                  />

                  <LabeledInput
                    id="parent-form-password"
                    label="家長登入密碼"
                    value={form.password}
                    onChange={(v) => setForm((p) => ({ ...p, password: v }))}
                    placeholder={isEdit ? '留空保留現有密碼, 或輸入新密碼覆蓋' : '至少 4 個字元'}
                    type="password"
                    required={!isEdit}
                    icon={<KeyRound width={12} height={12} />}
                    rightHint={
                      isEdit ? (
                        <span className="inline-flex items-center gap-0.5">
                          選填
                        </span>
                      ) : undefined
                    }
                  />
                </div>

                {/* Row 3: 住家電話 / 公司電話 (選填) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LabeledInput
                    id="parent-form-home-phone"
                    label="住家電話"
                    value={form.homePhone}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, homePhone: v.replace(/\D/g, '').slice(0, 8) }))
                    }
                    placeholder="23456789"
                    type="tel"
                    inputMode="tel"
                    maxLength={8}
                    icon={<HomeIcon width={12} height={12} />}
                  />
                  <LabeledInput
                    id="parent-form-office-phone"
                    label="公司電話"
                    value={form.officePhone}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, officePhone: v.replace(/\D/g, '').slice(0, 8) }))
                    }
                    placeholder="23456789"
                    type="tel"
                    inputMode="tel"
                    maxLength={8}
                    icon={<Briefcase width={12} height={12} />}
                  />
                </div>

                {/* Row 4: 通訊地址 (跨整列) */}
                <div>
                  <label
                    htmlFor="parent-form-address"
                    className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                  >
                    通訊地址
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none">
                      <MapPin width={12} height={12} />
                    </span>
                    <textarea
                      id="parent-form-address"
                      value={form.address}
                      onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                      placeholder="香港九龍... (若與學生地址相同, 可留空由後續流程同步)"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-2.5 py-2 text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 resize-none"
                    />
                  </div>
                </div>

                {/* 提示: 主要聯繫人已在「學生 → 關聯家長」中標記 */}
                <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-md bg-slate-50 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700/60">
                  <Info width={11} height={11} className="text-slate-400 mt-px shrink-0" />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    「主要聯繫人」標記已移至「學生 → 關聯家長」中設定 (每位學生可獨立指定不同主要聯繫人)。
                  </p>
                </div>
              </div>

              {/* ========== 右欄: 關聯學生 ========== */}
              <div className="flex flex-col gap-4">
                {/* 關聯學生 — 多選晶片 (整個右欄的焦點) */}
                <StudentTagSelect
                  students={students}
                  selectedIds={form.studentIds}
                  onToggle={(id) =>
                    setForm((prev) => ({
                      ...prev,
                      studentIds: prev.studentIds.includes(id)
                        ? prev.studentIds.filter((s) => s !== id)
                        : [...prev.studentIds, id],
                    }))
                  }
                />
              </div>

              {blocker && (
                <div className="md:col-span-2">
                  <InlineBlocker message={blocker} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                {form.relationship && (
                  <Pill tone="violet" size="sm">
                    <Users width={9} height={9} />
                    {RELATIONSHIP_OPTIONS.find((o) => o.value === form.relationship)?.label}
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
                  {mode === 'add' ? '新增家長' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
