'use client';

/**
 * ParentMultiSelect — 家長多選 (繳費公告的指定受眾)
 *
 * 設計目標 — 家長可能有幾十位, 需要一次過勾選:
 *   1. Trigger 顯示「已選 N 位 + 前幾位姓名」, 不塞爆 trigger
 *   2. 點開後展開 inline panel: 搜尋 + 全選/清除 + 家長 checkbox 清單
 *   3. 已選的家長在各列左邊顯示勾選狀態
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/announcements/ 內使用。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '../students/primitives';
import { MODAL_FADE, EASE } from '../students/design-tokens';
import type { Parent } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

export interface ParentMultiSelectProps {
  id?: string;
  label?: string;
  /** 可選的家長清單 */
  parents: Parent[];
  /** 受控值 (parent.id 清單) */
  value: string[];
  /** 值變動時回呼 */
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function ParentMultiSelect({
  id = 'ann-form-target-parents',
  label = '指定家長',
  parents,
  value,
  onChange,
  disabled,
}: ParentMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const parentsById = React.useMemo(() => {
    const m = new Map<string, Parent>();
    parents.forEach((p) => m.set(p.id, p));
    return m;
  }, [parents]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return parents
      .filter((p) => p.status !== 'inactive')
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.phone || '').toLowerCase().includes(q) ||
          (p.accountName || '').toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }, [parents, query]);

  const selectedParents = React.useMemo(
    () => value.map((pid) => parentsById.get(pid)).filter((p): p is Parent => !!p),
    [value, parentsById],
  );

  const toggle = React.useCallback(
    (pid: string) => {
      if (disabled) return;
      const next = selectedSet.has(pid)
        ? value.filter((v) => v !== pid)
        : [...value, pid];
      onChange(next);
    },
    [disabled, selectedSet, value, onChange],
  );

  const selectAllVisible = React.useCallback(() => {
    if (disabled) return;
    const visibleIds = visible.map((p) => p.id);
    onChange(Array.from(new Set([...value, ...visibleIds])));
  }, [disabled, visible, value, onChange]);

  const clearAll = React.useCallback(() => {
    if (disabled) return;
    onChange([]);
  }, [disabled, onChange]);

  const selectedCount = value.length;
  const totalCount = parents.filter((p) => p.status !== 'inactive').length;

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

      {/* Trigger */}
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
            點擊選擇家長 (只有被選中的家長會看到這則繳費公告)
          </span>
        ) : (
          <span className="flex-1 flex flex-wrap items-center gap-1">
            <Pill tone="info" size="sm">
              <UsersIcon width={9} height={9} />
              {selectedCount} 位家長
            </Pill>
            {selectedParents.slice(0, 3).map((p) => (
              <Pill tone="primary" size="sm" key={p.id}>
                {p.name}
              </Pill>
            ))}
            {selectedParents.length > 3 && (
              <Pill tone="neutral" size="sm">
                +{selectedParents.length - 3} 位
              </Pill>
            )}
          </span>
        )}
        <span className="self-center inline-flex items-center justify-center w-5 h-5 rounded text-slate-400">
          {open ? <ChevronUp width={12} height={12} /> : <ChevronDown width={12} height={12} />}
        </span>
      </button>

      {/* Inline panel */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="parent-multi-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 dark:border-slate-700 overflow-hidden">
              {/* 工具列 */}
              <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700/80 space-y-2 bg-white dark:bg-slate-900">
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
                      placeholder="搜尋家長姓名 / 電話 / 帳戶名稱…"
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

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      disabled={visible.length === 0 || disabled}
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

              {/* 家長清單 */}
              <div className="max-h-[320px] overflow-y-auto py-1.5 dark:scrollbar-thin">
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-8 px-4 text-center">
                    <UsersIcon
                      width={20}
                      height={20}
                      className="text-slate-300 dark:text-slate-600"
                    />
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">
                      {parents.length === 0
                        ? '系統內未有家長資料'
                        : '冇符合條件嘅家長'}
                    </p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-1 gap-y-0 px-2">
                    {visible.map((p) => {
                      const checked = selectedSet.has(p.id);
                      return (
                        <li
                          key={p.id}
                          role="option"
                          aria-selected={checked}
                          onClick={() => toggle(p.id)}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[12px] transition-colors select-none',
                            checked
                              ? 'bg-blue-50/70 dark:bg-blue-950/30'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700/70',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                              checked
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600',
                            )}
                          >
                            {checked && <Check width={9} height={9} strokeWidth={3} />}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1 min-w-0">
                              <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {p.name}
                              </span>
                              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                                {p.phone}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900">
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  共 {totalCount} 位家長 · 已選 {selectedCount} 位
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
