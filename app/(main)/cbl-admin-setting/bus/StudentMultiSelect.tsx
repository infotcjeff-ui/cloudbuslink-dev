'use client';

/**
 * StudentMultiSelect — 大量學生 (20+) 多選 Inline Panel
 *
 * 設計目標 — 一次過選擇 20+ 學生時保持流暢:
 *   1. Trigger 永遠只顯示「總數 + 班別彙總」(避免塞 30 個 chip 把 trigger 撐爆)
 *   2. 點擊 trigger 後展開為 inline panel (而不是浮動 popover), 跟在欄位下直接展開:
 *      ├─ 工具列: 搜尋 + 動作 (全選-當前 / 清除)
 *      ├─ 二欄 grid:
 *      │  ├─ 左欄: 班別快速切換 (一鍵縮小範圍)
 *      │  └─ 右欄: 學生 grid (兩欄顯示更多學生)
 *   3. 已選 chip 顯示在 panel 下方 (而不是擠爆 trigger)
 *   4. 學生列 checkbox + 「現有」/「來自 XX」標籤
 *
 * 範圍: 僅 /cbl-admin-setting/bus/ 內使用 (校巴編輯)。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  GraduationCap,
  Search,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '../[layout]/students/primitives';
import { MODAL_FADE, EASE } from './design-tokens';
import type { Student, Bus } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 從 students 列表取出所有出現過的班別, 並依課堂序排序
 * (簡單字典序, 對「1A / 1B / 2A / K1A」已經夠用)
 */
function extractClasses(students: Student[]): string[] {
  const set = new Set<string>();
  students.forEach((s) => {
    const c = s.classNumber?.trim();
    if (c) set.add(c);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

export interface StudentMultiSelectProps {
  id?: string;
  label?: string;
  /** 完整學生清單 (與 BusFormModal 現有 students prop 一致) */
  students: Student[];
  /** 目前校巴 (用於計算「已選」與「提示換綁」) — edit mode 必填, add mode 為 undefined */
  currentBusId?: string;
  /** 所有校巴列表, 用於顯示「原本屬於 XX」標籤 */
  buses?: Bus[];
  /** 受控值 */
  value: string[];
  /** 值變動時回呼 */
  onChange: (next: string[]) => void;
  /** 禁用 */
  disabled?: boolean;
}

export function StudentMultiSelect({
  id = 'bus-form-students',
  label = '車上學生',
  students,
  currentBusId,
  buses = [],
  value,
  onChange,
  disabled,
}: StudentMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [classFilter, setClassFilter] = React.useState<string>(''); // '' = 全部
  const [showOnlySelected, setShowOnlySelected] = React.useState(false);

  // 班別清單
  const allClasses = React.useMemo(() => extractClasses(students), [students]);
  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const studentsById = React.useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);
  const busesById = React.useMemo(() => {
    const m = new Map<string, Bus>();
    buses.forEach((b) => m.set(b.id, b));
    return m;
  }, [buses]);

  // 篩選後的可勾選學生 (按班別 + 學號排序, 視覺穩定)
  const visibleStudents = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => s.status === 'active') // 預設只列在學
      .filter((s) => !classFilter || s.classNumber === classFilter)
      .filter((s) => {
        if (showOnlySelected) return selectedSet.has(s.id);
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q) ||
          s.classNumber.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => {
        const ca = a.classNumber || '';
        const cb = b.classNumber || '';
        if (ca !== cb) return ca.localeCompare(cb, 'zh-Hant');
        return a.studentId.localeCompare(b.studentId, 'zh-Hant');
      });
  }, [students, classFilter, query, showOnlySelected, selectedSet]);

  // 已選學生的彙總資訊 (Trigger 顯示用)
  const selectedStudents = React.useMemo(
    () => value.map((sid) => studentsById.get(sid)).filter((s): s is Student => !!s),
    [value, studentsById],
  );
  const selectedByClass = React.useMemo(() => {
    const counts: Record<string, number> = {};
    selectedStudents.forEach((s) => {
      const k = s.classNumber || '未分班';
      counts[k] = (counts[k] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'));
  }, [selectedStudents]);

  const toggle = React.useCallback(
    (sid: string) => {
      if (disabled) return;
      const next = selectedSet.has(sid)
        ? value.filter((v) => v !== sid)
        : [...value, sid];
      onChange(next);
    },
    [disabled, selectedSet, value, onChange],
  );

  const selectAllVisible = React.useCallback(() => {
    if (disabled) return;
    const visibleIds = visibleStudents.map((s) => s.id);
    const next = Array.from(new Set([...value, ...visibleIds]));
    onChange(next);
  }, [disabled, visibleStudents, value, onChange]);

  const clearAll = React.useCallback(() => {
    if (disabled) return;
    onChange([]);
  }, [disabled, onChange]);

  const selectedCount = value.length;
  const totalActiveCount = students.filter((s) => s.status === 'active').length;

  return (
    <div className="md:col-span-2">
      <label
        htmlFor={id}
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        <span className="inline-flex items-center gap-1.5">
          <UsersIcon width={11} height={11} />
          {label}
        </span>
        <span className="ml-1 text-[10px] text-slate-400 normal-case font-medium tracking-normal">
          (已選 {selectedCount})
        </span>
      </label>

      {/* Trigger (always visible) */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        aria-expanded={open}
        className={cn(
          'w-full min-h-[36px] px-2.5 py-1.5 rounded-md border bg-white text-left',
          'flex items-start gap-2 transition-colors cursor-pointer',
          'border-slate-200 dark:bg-slate-900 dark:border-slate-700',
          open
            ? 'border-blue-400 ring-2 ring-blue-400/40'
            : 'hover:border-slate-300 dark:hover:border-slate-600',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {selectedCount === 0 ? (
          <span className="flex-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 self-center">
            <UsersIcon width={11} height={11} />
            點擊選擇學生 (可一次選多個)
          </span>
        ) : (
          <span className="flex-1 flex flex-wrap items-center gap-1">
            <Pill tone="info" size="sm">
              <UsersIcon width={9} height={9} />
              {selectedCount} 位學生
            </Pill>
            {selectedByClass.slice(0, 3).map(([cls, n]) => (
              <Pill tone="primary" size="sm" key={cls}>
                {cls} · {n}
              </Pill>
            ))}
            {selectedByClass.length > 3 && (
              <Pill tone="neutral" size="sm">+{selectedByClass.length - 3} 班</Pill>
            )}
          </span>
        )}
        <span className="self-center inline-flex items-center justify-center w-5 h-5 rounded text-slate-400">
          {open ? (
            <ChevronUp width={12} height={12} />
          ) : (
            <ChevronDown width={12} height={12} />
          )}
        </span>
      </button>

      {/* Inline panel (展開時) */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="student-multi-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 dark:border-slate-700 overflow-hidden">
              {/* 工具列: 搜尋 + 動作 */}
              <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700/80 space-y-2 bg-white dark:bg-slate-900">
                {/* 搜尋 + tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search
                      width={11}
                      height={11}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜尋姓名 / 學號 / 班別…"
                      className="w-full h-8 pl-7 pr-7 rounded-md border border-slate-200 bg-white text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="清除搜尋"
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-4 h-4 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X width={9} height={9} />
                      </button>
                    )}
                  </div>

                  {/* Tabs: 全部 / 已選 */}
                  <div className="inline-flex items-center rounded-md border border-slate-200 p-0.5 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowOnlySelected(false)}
                      className={cn(
                        'inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                        !showOnlySelected
                          ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                      )}
                    >
                      全部 ({visibleStudents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowOnlySelected(true)}
                      className={cn(
                        'inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                        showOnlySelected
                          ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                      )}
                    >
                      <Check width={10} height={10} />
                      已選 ({selectedCount})
                    </button>
                  </div>

                  {/* 動作 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      disabled={visibleStudents.length === 0 || disabled}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      全選當前
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      disabled={selectedCount === 0 || disabled}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      清除全部
                    </button>
                  </div>
                </div>
              </div>

              {/* 主體: 兩欄 grid (左班別 / 右學生) */}
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] min-h-[260px] max-h-[380px]">
                {/* ---- 左欄: 班別清單 ---- */}
                <div className="border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700/80 px-2 py-2 overflow-y-auto bg-slate-50/40 dark:bg-slate-800/40">
                  <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400 px-2 mb-1.5 inline-flex items-center gap-1">
                    <Filter width={10} height={10} />
                    班別
                  </div>
                  <ul className="space-y-0.5">
                    <li>
                      <button
                        type="button"
                        onClick={() => setClassFilter('')}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11.5px] font-medium transition-colors cursor-pointer',
                          classFilter === ''
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
                        )}
                      >
                        <span>全部</span>
                        <span
                          className={cn(
                            'text-[10.5px] tabular-nums',
                            classFilter === ''
                              ? 'text-blue-100'
                              : 'text-slate-400 dark:text-slate-500',
                          )}
                        >
                          {totalActiveCount}
                        </span>
                      </button>
                    </li>
                    {allClasses.map((cls) => {
                      const count = students.filter(
                        (s) => s.classNumber === cls && s.status === 'active',
                      ).length;
                      const active = classFilter === cls;
                      return (
                        <li key={cls}>
                          <button
                            type="button"
                            onClick={() => setClassFilter(active ? '' : cls)}
                            className={cn(
                              'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11.5px] font-medium transition-colors cursor-pointer',
                              active
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
                            )}
                          >
                            <span>{cls}</span>
                            <span
                              className={cn(
                                'text-[10.5px] tabular-nums',
                                active
                                  ? 'text-blue-100'
                                  : 'text-slate-400 dark:text-slate-500',
                              )}
                            >
                              {count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* ---- 右欄: 學生 grid (兩列) ---- */}
                <div className="overflow-y-auto py-1.5 dark:scrollbar-thin">
                  {visibleStudents.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-8 px-4 text-center">
                      <GraduationCap
                        width={20}
                        height={20}
                        className="text-slate-300 dark:text-slate-600"
                      />
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        {showOnlySelected
                          ? '尚未選擇任何學生'
                          : students.length === 0
                          ? '系統內未有學生資料'
                          : '冇符合條件嘅學生'}
                      </p>
                      {students.length === 0 && (
                        <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
                          請先到「學生」頁建立資料
                        </p>
                      )}
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-1 gap-y-0 px-2">
                      {visibleStudents.map((s) => {
                        const checked = selectedSet.has(s.id);
                        // 已綁到別輛校巴 — 顯示「來自 XX」標籤
                        const fromOtherBus =
                          s.busId && s.busId !== currentBusId
                            ? busesById.get(s.busId)
                            : null;
                        // 已綁到呢輛 (edit mode) — 標記為「現有」
                        const isCurrent =
                          !!currentBusId && s.busId === currentBusId;
                        return (
                          <li
                            key={s.id}
                            role="option"
                            aria-selected={checked}
                            onClick={() => toggle(s.id)}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[12px] transition-colors select-none',
                              checked
                                ? 'bg-blue-50/70 dark:bg-blue-950/30'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700/70',
                            )}
                          >
                            {/* Custom checkbox */}
                            <span
                              aria-hidden
                              className={cn(
                                'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                                checked
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600',
                              )}
                            >
                              {checked && (
                                <Check width={9} height={9} strokeWidth={3} />
                              )}
                            </span>

                            {/* 學生名 (姓名 + 學號) */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1 min-w-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                  {s.name}
                                </span>
                                <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                                  #{s.studentId.slice(-3)}
                                </span>
                              </div>
                            </div>

                            {/* 提示 (來自 / 現有) */}
                            {fromOtherBus ? (
                              <span
                                title={`原本綁喺 ${fromOtherBus.plateNumber}`}
                                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-700/50 shrink-0"
                              >
                                來自 {fromOtherBus.plateNumber}
                              </span>
                            ) : isCurrent ? (
                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-700/50 shrink-0">
                                現有
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
