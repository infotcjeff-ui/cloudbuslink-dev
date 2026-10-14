'use client';

/**
 * Add / Edit Student Modal — 自刻 OneFleet-style
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §14 Modal Chrome (Hand-Coded, Not HeroUI)
 *   §16 Form Field Primitives (LabeledInput, Select)
 *   §17 Role / Toggle Cards (Multi-Select Pill-Buttons)
 *   §21 Modal Footer (Cancel + Primary)
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/students/ 使用。
 *
 * 設計重構重點:
 * - 學生編號 (Student ID) preview: 從 props 接收 studentId 顯示為唯讀預覽 (add mode 預先生成)。
 * - 新增欄位: 性別 / 出生日期 / 緊急聯絡人姓名+電話。
 * - 移除欄位: 狀態 select (僅保留在資料層)。
 * - 關聯家長改為「選擇現有家長 + 在表單內即時新增家長」兩種動作。
 * - 不引入 HeroUI, 也不依賴全域 components/ui/* (手機版風格)。
 * - 用 framer-motion 進出場 (modalfade=0.14, modalslide=6)。
 * - 表單欄位: 2-column grid + 2-col span fields (對應規範 §16)。
 * - 多選家長: 用 toggle card pattern (對應規範 §17), 自帶 selected/unselected 兩種樣式。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserPlus,
  Pencil,
  X,
  Save,
  GraduationCap,
  Phone,
  IdCard,
  CheckCircle,
  Users as UsersIcon,
  Bus as BusIcon,
  User,
  Calendar,
  Hash,
  AlertTriangle,
  Plus,
  Heart,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Pill } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import {
  EMPTY_STUDENT_FORM,
  type StudentFormState,
  type StudentsPageContext,
} from './types';
import {
  ParentFormModal,
  EMPTY_PARENT_FORM,
  GENDER_OPTIONS,
  type ParentFormState,
} from './ParentFormModal';
import type { Student, Parent } from '@/lib/types';

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
  type?: 'text' | 'tel' | 'email';
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
/*  NativeSelect — 包裝 native <select>, 視覺與 LabeledInput 一致                */
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
/*  ParentTagSelect — Tag/Chip 多選 (取代原本的 toggle card pattern)             */
/* -------------------------------------------------------------------------- */

interface ParentChoice {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  createdAt?: string; // 用於「最近新增」排序
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  father: '父',
  mother: '母',
  grandfather_paternal: '祖父',
  grandmother_paternal: '祖母',
  grandfather_maternal: '外祖父',
  grandmother_maternal: '外祖母',
  guardian_other: '監護人',
};

/** 緊急聯絡人 section 使用的「與學生關係」標籤 — 較完整的稱謂, 用於 select option */
const EMERGENCY_RELATIONSHIP_LABEL: Record<string, string> = {
  father: '父親',
  mother: '母親',
  grandfather_paternal: '祖父',
  grandmother_paternal: '祖母',
  grandfather_maternal: '外祖父',
  grandmother_maternal: '外祖母',
  guardian_other: '監護人',
};

/**
 * Tag/Chip 模式的多選家長
 * - 選中的家長以 chip 顯示, 點 X 移除
 * - 輸入框可搜尋未選家長 (typeahead)
 * - 下拉預設只顯示最近新增的 3 位, 內部 scroll 查看更多
 * - 下拉底部「+ 在此新增家長」連結
 * - chip 上的 ★ 按鈕可設/取消「主要聯繫人」(每個學生獨立)
 * - 隨家長數量增加, 高度保持固定 (透過 wrap)
 */
function ParentTagSelect({
  parents,
  selectedIds,
  primaryId,
  onToggle,
  onSetPrimary,
  onAddNew,
}: {
  parents: ParentChoice[];
  selectedIds: string[];
  primaryId: string | null;
  onToggle: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onAddNew: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIdx, setHighlightedIdx] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 依 query 篩選未選家長 — 不限制數量 (由下拉 max-height + scroll 控制)
  const filteredUnselected = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const unselected = parents.filter((p) => !selectedIds.includes(p.id));
    if (!q) {
      // 無搜尋: 依 createdAt 倒序 (最近的在前), 若無 createdAt 則維持原序
      return [...unselected].sort((a, b) => {
        const ta = (a as any).createdAt ? Date.parse((a as any).createdAt) : 0;
        const tb = (b as any).createdAt ? Date.parse((b as any).createdAt) : 0;
        return tb - ta;
      });
    }
    return unselected.filter(
      (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q),
    );
  }, [parents, selectedIds, query]);

  // 已選的家長 (按選中順序)
  const selectedParents = React.useMemo(
    () => selectedIds.map((id) => parents.find((p) => p.id === id)).filter(Boolean) as ParentChoice[],
    [parents, selectedIds],
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

  const addById = (id: string) => {
    onToggle(id);
    setQuery('');
    inputRef.current?.focus();
  };

  const removeById = (id: string) => {
    onToggle(id);
    inputRef.current?.focus();
  };

  const handleAddNewFromDropdown = () => {
    setIsOpen(false);
    onAddNew();
  };

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
      if (target) addById(target.id);
    } else if (e.key === 'Backspace' && !query && selectedParents.length > 0) {
      // 類似 Gmail: 在空輸入按 Backspace 移除最後一個 chip
      e.preventDefault();
      removeById(selectedParents[selectedParents.length - 1].id);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (parents.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-3 py-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
        尚未建立任何家長資料。
        <button
          type="button"
          onClick={onAddNew}
          className="ml-2 inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-300 hover:underline font-medium"
        >
          <Plus width={10} height={10} />
          在此新增家長
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 已選 + 輸入框的容器 */}
      <div
        className={cn(
          'relative flex flex-wrap items-center gap-1.5 min-h-[38px] px-2 py-1.5 rounded-md border bg-white cursor-text transition-colors',
          'focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/40',
          'border-slate-200 dark:bg-slate-900 dark:border-slate-700',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* 已選的 chip — 簡化為單一藍色風格 (主要聯繫人統一在下方列表設定) */}
        {selectedParents.map((p) => {
          const relLabel = p.relationship ? RELATIONSHIP_LABEL[p.relationship] : null;
          return (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800/60"
            >
              <UsersIcon width={10} height={10} className="text-blue-500 dark:text-blue-300" />
              <span>{p.name}</span>
              {relLabel && (
                <span className="text-blue-600/60 dark:text-blue-300/60">({relLabel})</span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeById(p.id);
                }}
                aria-label={`移除 ${p.name}`}
                className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-blue-200/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 transition-colors"
              >
                <X width={9} height={9} />
              </button>
            </span>
          );
        })}

        {/* 輸入框 */}
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
          placeholder={selectedParents.length === 0 ? '搜尋家長姓名或電話…' : ''}
          className="flex-1 min-w-[120px] h-6 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
        />

        {/* 計數 (右上) */}
        <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
          {selectedParents.length}/{parents.length}
        </span>

        {/* 下拉建議 — 預設只顯示最近 3 個, 整個 dropdown 可滾動 */}
        <AnimatePresence>
          {isOpen && filteredUnselected.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12, ease: EASE }}
              className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-md border border-slate-200 shadow-lg dark:bg-slate-900 dark:border-slate-700"
            >
              <ul className="max-h-[180px] overflow-y-auto py-1">
                {filteredUnselected.map((p, idx) => {
                  const relLabel = p.relationship ? RELATIONSHIP_LABEL[p.relationship] : null;
                  return (
                    <li
                      key={p.id}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addById(p.id);
                      }}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-[12px] transition-colors',
                        idx === highlightedIdx
                          ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                      )}
                    >
                      <UsersIcon
                        width={11}
                        height={11}
                        className={cn(
                          idx === highlightedIdx
                            ? 'text-blue-500 dark:text-blue-300'
                            : 'text-slate-400',
                        )}
                      />
                      <span className="font-semibold">{p.name}</span>
                      {relLabel && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          ({relLabel})
                        </span>
                      )}
                      <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">
                        {p.phone}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* dropdown 底部: 在此新增家長 */}
              <div className="border-t border-slate-100 dark:border-slate-700/80">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAddNewFromDropdown();
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
                >
                  <Plus width={12} height={12} />
                  在此新增家長
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 搜尋無結果 — 也提供「在此新增家長」連結 */}
        {isOpen && query && filteredUnselected.length === 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-md border border-slate-200 shadow-lg text-[11px] dark:bg-slate-900 dark:border-slate-700">
            <div className="px-3 py-2 text-slate-500 dark:text-slate-400">
              沒有符合「{query}」的家長
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700/80">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAddNewFromDropdown();
                }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
              >
                <Plus width={12} height={12} />
                在此新增家長
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  InlineFieldError — 單一欄位下方的錯誤提示 (紅色, 取代原本底部總合 alert)     */
/* -------------------------------------------------------------------------- */

function InlineFieldError({
  message,
  onShow,
}: {
  message: string | null;
  onShow?: () => void;
}) {
  // 透過 onMouseEnter 觸發, 表示使用者「看到」此欄位
  return (
    <div
      onMouseEnter={onShow}
      onFocusCapture={onShow}
      className="min-h-[14px] mt-0.5"
    >
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
/*  PrimarySwitch — 主要聯繫人 toggle (iOS 風格, 較小尺寸)                        */
/* -------------------------------------------------------------------------- */

function PrimarySwitch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        checked
          ? 'bg-amber-500 dark:bg-amber-500'
          : 'bg-slate-200 dark:bg-slate-700',
      )}
    >
      <span className="sr-only">設為主要聯繫人</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-[14px] w-[14px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-out my-[2px]',
          checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  StudentFormModal — 主表單                                  */
/* -------------------------------------------------------------------------- */

export interface StudentFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial: StudentFormState;
  context: StudentsPageContext;
  /** 編輯模式時, 顯示學生編號 (唯讀) */
  studentId?: string;
  /** Add mode 時, 預先產生的 studentId 預覽 (stu-2627001 格式) */
  previewStudentId?: string;
  /** 機構 id — 用於在新增家長時帶入正確的 clientId */
  clientId?: string;
  isSaving: boolean;
  onSave: (state: StudentFormState) => void;
  onClose: () => void;
}

export function StudentFormModal({
  open,
  mode,
  initial,
  context,
  studentId,
  previewStudentId,
  clientId,
  isSaving,
  onSave,
  onClose,
}: StudentFormModalProps) {
  const [form, setForm] = React.useState<StudentFormState>(EMPTY_STUDENT_FORM);

  // 「在表單內新增家長」彈窗
  const [parentModal, setParentModal] = React.useState<{
    open: boolean;
  }>({ open: false });
  const [isAddingParent, setIsAddingParent] = React.useState(false);

  // 在 modal 開啟期間, 即時的家長清單 (包含 form 內剛新增的)
  const [inlineParents, setInlineParents] = React.useState<Parent[]>([]);

  // open / mode / initial 變動時重置 — 避免殘留舊資料。
  React.useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_STUDENT_FORM,
        ...initial,
      });
      setInlineParents([]); // 每次開啟重置
    }
  }, [open, mode, initial]);

  // 合併 context 傳入的家長與「本次表單內新增的」家長
  const mergedParents = React.useMemo(
    () => [...context.parents, ...inlineParents],
    [context.parents, inlineParents],
  );

  const toggleParent = React.useCallback((id: string) => {
    setForm((prev) => {
      const has = prev.parentIds.includes(id);
      const nextParentIds = has
        ? prev.parentIds.filter((p) => p !== id)
        : [...prev.parentIds, id];
      // 若移除的家長是當前主要聯繫人 → 自動清空 primaryParentId
      const nextPrimary = has && prev.primaryParentId === id ? '' : prev.primaryParentId;
      // 若加入新家長且目前沒有主要聯繫人 → 自動設為主要
      const finalPrimary = !has && !prev.primaryParentId ? id : nextPrimary;
      return {
        ...prev,
        parentIds: nextParentIds,
        primaryParentId: finalPrimary,
      };
    });
  }, []);

  // 設為 / 取消 主要聯繫人 (學生視角)
  const setPrimaryParent = React.useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      primaryParentId: prev.primaryParentId === id ? '' : id,
    }));
  }, []);

  // 在表單內新增家長 → 寫入 storage + 自動勾選到 parentIds
  const handleInlineAddParent = React.useCallback(
    async (parentState: ParentFormState) => {
      setIsAddingParent(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const effectiveClientId = clientId || '';
        const newParent: Parent = {
          id: STORAGE.genId('parent'),
          clientId: effectiveClientId,
          name: parentState.name.trim(),
          phone: parentState.phone.trim(),
          alternatePhone: null,
          homePhone: parentState.homePhone.trim() || null,
          officePhone: parentState.officePhone.trim() || null,
          address: parentState.address.trim() || null,
          relationship: parentState.relationship,
          isPickupAuth: true,
          password: parentState.password,
          notificationEnabled: true,
          status: 'active',
          createdAt: new Date().toISOString(),
        };

        STORAGE.parents.add(newParent);

        // 1) 寫入到 inlineParents (讓本次 modal 立即可見)
        setInlineParents((prev) => [...prev, newParent]);
        // 2) 自動勾選此家長到 parentIds, 若學生目前無主要聯繫人 → 自動設為主要
        setForm((prev) => {
          const alreadyLinked = prev.parentIds.includes(newParent.id);
          const nextParentIds = alreadyLinked
            ? prev.parentIds
            : [...prev.parentIds, newParent.id];
          const nextPrimary = !prev.primaryParentId ? newParent.id : prev.primaryParentId;
          return {
            ...prev,
            parentIds: nextParentIds,
            primaryParentId: nextPrimary,
          };
        });
        // 3) 通知父層重新讀取 (讓儲存學生時 parent 已在 storage)
        window.dispatchEvent(new CustomEvent('cbl-students-refresh'));

        setParentModal({ open: false });
      } finally {
        setIsAddingParent(false);
      }
    },
    [clientId],
  );

  // 校驗: 改為「per-field errors」 — 每個欄位下方獨立顯示提示
  const fieldErrors = React.useMemo(() => {
    const errors: Record<string, string | null> = {
      name: !form.name.trim() ? '請填寫「姓名」' : null,
      classNumber: !form.classNumber.trim() ? '請填寫「班別」' : null,
      dateOfBirth: !form.dateOfBirth ? '請填寫「出生日期」' : null,
      parents:
        form.parentIds.length === 0 ? '請至少關聯一位家長' : null,
      emergencyContactPhone:
        form.emergencyContactPhone.trim() &&
        form.emergencyContactPhone.replace(/\D/g, '').length < 8
          ? '緊急聯絡人電話需要 8 碼'
          : null,
    };
    return errors;
  }, [form.name, form.classNumber, form.dateOfBirth, form.parentIds.length, form.emergencyContactPhone]);

  const canSubmit = !isSaving && Object.values(fieldErrors).every((e) => e === null);

  // 是否曾被觸碰 (blur) — 避免初次開啟就顯示一堆紅字
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    if (open) setTouched({});
  }, [open]);

  const markTouched = (field: string) => setTouched((p) => ({ ...p, [field]: true }));

  const parentChoices = React.useMemo(
    () =>
      mergedParents.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone || '',
        relationship: p.relationship,
        createdAt: p.createdAt,
      })),
    [mergedParents],
  );

  // 計算預覽的 studentId
  const previewId = mode === 'add'
    ? (previewStudentId || studentId || '—')
    : (studentId || '—');

  const title = mode === 'add' ? '新增學生' : '編輯學生';
  const subtitle =
    mode === 'add'
      ? '建立學生資料並關聯家長與校巴。'
      : '更新學生資料、家長關聯與校巴綁定。';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="student-form-backdrop"
            role="presentation"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={onClose}
          >
          <motion.div
            className="relative w-full max-w-[760px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-visible flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header — 規範 §14.2 */}
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
                  id="student-form-title"
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

            {/* Body — 2-column grid */}
            <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4 dark:scrollbar-thin">
              {/* 學年 (edit mode) — 顯示現有 studentId, 唯讀 */}
              {mode === 'edit' && studentId && (
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    學生編號
                  </label>
                  <div className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 text-[12px] font-mono text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <Hash width={11} height={11} className="text-slate-400" />
                    {studentId}
                  </div>
                </div>
              )}

              {/* Add mode: 學生編號預覽 (唯讀) */}
              {mode === 'add' && (
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    學生編號 <span className="text-[10px] text-slate-400 normal-case font-medium">(自動生成, 不可修改)</span>
                  </label>
                  <div className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 text-[12px] font-mono text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    <Hash width={11} height={11} className="text-slate-400" />
                    {previewId}
                  </div>
                </div>
              )}

              <div>
                <LabeledInput
                  id="student-form-name"
                  label="姓名"
                  value={form.name}
                  onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                  onBlur={() => markTouched('name')}
                  placeholder="張小明"
                  required
                  icon={<IdCard width={12} height={12} />}
                />
                <InlineFieldError
                  message={touched.name ? fieldErrors.name : null}
                  onShow={() => markTouched('name')}
                />
              </div>

              <div>
                <LabeledInput
                  id="student-form-class"
                  label="班別"
                  value={form.classNumber}
                  onChange={(v) => setForm((p) => ({ ...p, classNumber: v }))}
                  onBlur={() => markTouched('classNumber')}
                  placeholder="1A"
                  required
                  icon={<GraduationCap width={12} height={12} />}
                />
                <InlineFieldError
                  message={touched.classNumber ? fieldErrors.classNumber : null}
                  onShow={() => markTouched('classNumber')}
                />
              </div>

              <NativeSelect
                id="student-form-gender"
                label="性別"
                value={form.gender}
                onChange={(v) =>
                  setForm((p) => ({ ...p, gender: v as Student['gender'] }))
                }
                required
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </NativeSelect>

              <div>
                <label
                  htmlFor="student-form-dob"
                  className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                >
                  出生日期
                  <span className="text-rose-500 ml-0.5">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Calendar width={12} height={12} />
                  </span>
                  <input
                    id="student-form-dob"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, dateOfBirth: e.target.value }));
                      markTouched('dateOfBirth');
                    }}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white pl-8 pr-2.5 text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
                <InlineFieldError
                  message={touched.dateOfBirth ? fieldErrors.dateOfBirth : null}
                  onShow={() => markTouched('dateOfBirth')}
                />
              </div>

              <LabeledInput
                id="student-form-phone"
                label="電話 (選填)"
                value={form.phone}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    phone: v.replace(/\D/g, '').slice(0, 8),
                  }))
                }
                placeholder="91234567"
                type="tel"
                inputMode="tel"
                maxLength={8}
                icon={<Phone width={12} height={12} />}
              />

              <div className="md:col-span-2">
                <NativeSelect
                  id="student-form-bus"
                  label="綁定校巴"
                  value={form.busId}
                  onChange={(v) => setForm((p) => ({ ...p, busId: v }))}
                >
                  <option value="">未指派</option>
                  {context.buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.plateNumber}
                      {b.model ? ` — ${b.model}` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              {/* 關聯家長 (現在放在「緊急聯絡人」上方) */}
              <div className="md:col-span-2">
                <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-1.5 block dark:text-slate-400 inline-flex items-center gap-1.5">
                  關聯家長
                  <span className="text-rose-500">*</span>
                </label>
                <ParentTagSelect
                  parents={parentChoices}
                  selectedIds={form.parentIds}
                  primaryId={form.primaryParentId || null}
                  onToggle={(id) => {
                    toggleParent(id);
                    markTouched('parents');
                  }}
                  onSetPrimary={(id) => {
                    setPrimaryParent(id);
                    markTouched('parents');
                  }}
                  onAddNew={() => {
                    markTouched('parents');
                    setParentModal({ open: true });
                  }}
                />
                <InlineFieldError
                  message={touched.parents ? fieldErrors.parents : null}
                  onShow={() => markTouched('parents')}
                />
              </div>

              {/* 已選家長 — 每位可設為「主要聯繫人」 (學生視角) */}
              {form.parentIds.length > 0 && (
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                      已選家長 ({form.parentIds.length})
                    </p>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      選填 · 僅一位
                    </span>
                  </div>
                  <ul className="rounded-md border border-slate-200 divide-y divide-slate-100 bg-white overflow-hidden dark:border-slate-700 dark:divide-slate-700/80 dark:bg-slate-900">
                    {form.parentIds.map((id) => {
                      const p = parentChoices.find((pp) => pp.id === id);
                      if (!p) return null;
                      const relLabel = p.relationship ? RELATIONSHIP_LABEL[p.relationship] : null;
                      const isPrimary = form.primaryParentId === id;
                      return (
                        <li
                          key={id}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 transition-colors',
                            isPrimary
                              ? 'bg-amber-50/60 dark:bg-amber-950/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                          )}
                        >
                          <div
                            className={cn(
                              'p-1.5 rounded-md shrink-0',
                              isPrimary
                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                            )}
                          >
                            <UsersIcon width={13} height={13} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={cn(
                                  'text-[12.5px] font-semibold truncate',
                                  isPrimary
                                    ? 'text-amber-900 dark:text-amber-100'
                                    : 'text-slate-800 dark:text-slate-200',
                                )}
                              >
                                {p.name}
                              </span>
                              {relLabel && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  ({relLabel})
                                </span>
                              )}
                              {isPrimary && (
                                <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-semibold bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800/50">
                                  ★ 主要
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug dark:text-slate-400 tabular-nums">
                              {p.phone || '未填電話'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                              主要聯繫人
                            </span>
                            <PrimarySwitch
                              checked={isPrimary}
                              onChange={() => setPrimaryParent(id)}
                              id={`primary-switch-${id}`}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {touched.parents && form.parentIds.length > 0 && !form.primaryParentId && (
                    <p className="mt-1.5 text-[10.5px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                      <span>提示:</span>
                      有任何事情時，第一順位負責聯絡的家長或法定監護人
                    </p>
                  )}
                </div>
              )}

              {/* 緊急聯絡人 (選填, 與 parentIds 獨立) */}
              <div className="md:col-span-2 pt-2 mt-1 border-t border-slate-100 dark:border-slate-700/80">
                <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-400 mb-2 dark:text-slate-500 inline-flex items-center gap-1.5">
                  <AlertTriangle width={11} height={11} />
                  緊急聯絡人 (選填 — 若與關聯家長不同, 可在此填寫)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <LabeledInput
                    id="student-form-emergency-name"
                    label="緊急聯絡人姓名"
                    value={form.emergencyContactName}
                    onChange={(v) => setForm((p) => ({ ...p, emergencyContactName: v }))}
                    placeholder="王阿姨 (姑姑)"
                    icon={<Heart width={12} height={12} />}
                  />
                  <div>
                    <NativeSelect
                      id="student-form-emergency-relationship"
                      label="與學生關係"
                      value={form.emergencyContactRelationship}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, emergencyContactRelationship: v }))
                      }
                    >
                      <option value="">未指定</option>
                      {Object.entries(EMERGENCY_RELATIONSHIP_LABEL).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div>
                    <LabeledInput
                      id="student-form-emergency-phone"
                      label="緊急聯絡人電話"
                      value={form.emergencyContactPhone}
                      onChange={(v) =>
                        setForm((p) => ({
                          ...p,
                          emergencyContactPhone: v.replace(/\D/g, '').slice(0, 8),
                        }))
                      }
                      placeholder="91234567"
                      type="tel"
                      inputMode="tel"
                      maxLength={8}
                      icon={<Phone width={12} height={12} />}
                    />
                    <InlineFieldError
                      message={touched.emergencyContactPhone ? fieldErrors.emergencyContactPhone : null}
                      onShow={() => markTouched('emergencyContactPhone')}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer — 規範 §21 */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone="primary" size="sm">
                  {form.parentIds.length} 位家長
                </Pill>
                {form.busId && (
                  <Pill tone="info" size="sm">
                    已綁定校巴
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
                  onClick={() => onSave(form)}
                  isLoading={isSaving}
                  disabled={!canSubmit}
                  startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                >
                  {mode === 'add' ? '新增學生' : '儲存變更'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* 「在此新增家長」彈窗 (z-index 60, 在 student modal 之上) */}
    <ParentFormModal
      open={parentModal.open}
      mode="add"
      initial={EMPTY_PARENT_FORM}
      existingParents={mergedParents}
      isSaving={isAddingParent}
      onSave={handleInlineAddParent}
      onClose={() => setParentModal({ open: false })}
    />
    </>
  );
}