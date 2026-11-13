'use client';

/**
 * SearchableSelect — 可搜尋 + 可自訂新增的下拉選單
 *
 * 為什麼不用 Radix Select (components/ui/shadcn-select)?
 *   Radix Select 的 dropdown 內容只能放 SelectItem,
 *   放不進 <input> (Radix 會自己接管 keydown 做 typeahead)。
 *   → 「下拉內有搜尋bar」這種需求 Radix Select 做不到。
 *
 * 所以這裡自刻一個 combobox:
 *   - 觸發器外觀對齊 shadcn SelectTrigger (h-9 / rounded-md / border-slate-200)
 *   - 點開後 focus 到搜尋框, 直接打字過濾
 *   - ↑↓ 移動 highlight, Enter 選取, Esc 關閉
 *   - 搜尋無結果時可「就地新增」(onCreate) → 新值以**不同字色**標示
 *   - panel 用 createPortal 掛到 document.body → 不會被 modal 的
 *     overflow-hidden / framer-motion transform 裁切 (position: fixed 正常運作)
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/students/ 內使用。
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  /** 選項值 (唯一) */
  value: string;
  /** 顯示內容 — trigger 與清單都用它 (字色由 isCustom 決定, 這裡不用自帶顏色) */
  label: React.ReactNode;
  /** 搜尋比對用的純文字 (預設用 value) */
  searchText?: string;
  /** 是否為「使用者自訂」(非系統預設) → trigger 與清單用不同字色 */
  isCustom?: boolean;
  /** 停用 (例如該區沒有這種學校的系統資料) */
  disabled?: boolean;
  /** 清單項右側的次要說明 */
  hint?: React.ReactNode;
}

export interface SearchableSelectProps {
  id?: string;
  /** 目前選中的值 */
  value: string;
  /** 選項清單 */
  options: SearchableSelectOption[];
  /** 選中後回呼 */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 允許就地新增 (回傳使用者輸入的文字) */
  onCreate?: (query: string) => void;
  /** 「新增」按鈕文案 */
  createLabel?: (query: string) => string;
  /** 沒有符合項目時的提示文字 */
  emptyText?: string;
  /** 搜尋框 placeholder */
  searchPlaceholder?: string;
  className?: string;
}

/** 自訂項目的字色 (trigger + 清單) */
const CUSTOM_TEXT = 'text-violet-600 dark:text-violet-300';

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder = '— 請選擇 —',
  disabled = false,
  onCreate,
  createLabel,
  emptyText = '沒有符合的項目',
  searchPlaceholder = '搜尋…',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);
  const [pos, setPos] = React.useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const createRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  /** listbox 的 id — 給 trigger 的 aria-controls / aria-activedescendant 用 */
  const listboxId = React.useId();

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  /** 依搜尋字串過濾 — 自訂 (isCustom) 置頂, 方便一眼找到 */
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? [...options]
      : options.filter((o) =>
          (o.searchText ?? o.value).toLowerCase().includes(q),
        );
    // 自訂值置頂 (stable sort, 組內保持原有順序)
    base.sort(
      (a, b) => Number(b.isCustom ?? false) - Number(a.isCustom ?? false),
    );
    return base;
  }, [options, query]);

  /** 可以「就地新增」嗎? (有輸入、且沒有完全相同的既有選項) */
  const canCreate = React.useMemo(() => {
    if (!onCreate) return false;
    const q = query.trim();
    if (!q) return false;
    const lower = q.toLowerCase();
    return !options.some(
      (o) => (o.searchText ?? o.value).toLowerCase() === lower,
    );
  }, [onCreate, options, query]);

  /* ---------------------------------------------------------------------- */
  /*  定位 — panel 用 position: fixed + portal, 需跟著 trigger 走           */
  /* ---------------------------------------------------------------------- */

  const updatePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    // 下方空間不足就往上開
    const openAbove = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(320, openAbove ? above : below));
    setPos({
      top: openAbove ? r.top - 6 : r.bottom + 6,
      left: Math.min(Math.max(8, r.left), Math.max(8, vw - r.width - 8)),
      width: r.width,
      maxHeight,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    // capture: true → 捕捉到所有祖先容器 (含 modal body) 的捲動
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  /* ---- 開/關時的重置 + 自動聚焦搜尋框 ---- */
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
      return;
    }
    // ⚠️ panel 要等 updatePosition() 算出位置 (pos) 才會掛載。
    //    第一次打開時 pos 還是 null → input 根本不在 DOM 裡,
    //    這時 focus 一定落空 → 變成「要打開第二次才能打字」。
    //    → 等 pos 就緒後才 focus (把 pos 放進 deps)。
    if (!pos) return;
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open, pos]);

  /* ---- 點外面關閉 (trigger 與 panel 都要判斷, panel 在 portal 裡) ---- */
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  /* ---- highlight 捲進可視範圍 (第 0 列可能是「新增」) ---- */
  React.useEffect(() => {
    if (!open) return;
    const el =
      canCreate && highlight === 0
        ? createRef.current
        : itemRefs.current[highlight - (canCreate ? 1 : 0)];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open, canCreate]);

  /* ---------------------------------------------------------------------- */
  /*  互動                                                                  */
  /* ---------------------------------------------------------------------- */

  const commit = React.useCallback(
    (option: SearchableSelectOption) => {
      if (option.disabled) return;
      onChange(option.value);
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [onChange],
  );

  /** 找下一個可選 (略過 disabled) 的列索引 — 第 0 列可能是「新增」 */
  const nextEnabledIndex = React.useCallback(
    (from: number, dir: 1 | -1): number => {
      const offset = canCreate ? 1 : 0;
      const n = filtered.length + offset;
      if (n === 0) return -1;
      for (let i = 0; i < n; i++) {
        const idx = (from + dir * (i + 1) + n * 2) % n;
        // 「新增」列永遠可選
        if (canCreate && idx === 0) return idx;
        const opt = filtered[idx - offset];
        if (opt && !opt.disabled) return idx;
      }
      return -1;
    },
    [filtered, canCreate],
  );

  /** highlight → 對應的選項 (null = 指向「新增」列) */
  const highlightedOption = React.useMemo(() => {
    const offset = canCreate ? 1 : 0;
    if (canCreate && highlight === 0) return null;
    return filtered[highlight - offset];
  }, [filtered, highlight, canCreate]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = nextEnabledIndex(highlight, 1);
      if (idx >= 0) setHighlight(idx);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = nextEnabledIndex(highlight, -1);
      if (idx >= 0) setHighlight(idx);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // highlight 停在「新增」列 (第 0 列) → 就地新增
      if (canCreate && highlight === 0 && onCreate) {
        const q = query.trim();
        setOpen(false);
        onCreate(q);
        return;
      }
      const opt = highlightedOption;
      if (opt && !opt.disabled) {
        commit(opt);
        return;
      }
      // 沒有 highlight 項目 → 試試就地新增
      if (canCreate && onCreate) {
        const q = query.trim();
        setOpen(false);
        onCreate(q);
      }
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  Render                                                                */
  /* ---------------------------------------------------------------------- */

  const panel =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[300] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-100 dark:border-slate-700 dark:bg-slate-900"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            // ⚠️ 注意: 這裡「不能」像以前那樣在整塊 panel 上 onMouseDown preventDefault。
            //    mousedown 的預設行為包含「把焦點移到被點的元素」——
            //    整塊擋掉的話, 萬一自動聚焦失敗, 使用者連「手動點搜尋框」都點不進去,
            //    只能關掉重開 (這正是「要打開第二次才能輸入」的另一個幫兇)。
            //    → preventDefault 只放在「選項清單」與「新增列」
            //      (點選項時焦點留在搜尋框, 連續搜尋更順),
            //      搜尋框本身保留預設行為, 保證永遠點得進去。
          >
            {/* 搜尋 bar */}
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5 dark:border-slate-700/80">
              <Search
                width={11}
                height={11}
                className="shrink-0 text-slate-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                aria-label="搜尋選項"
                className="h-6 w-full min-w-0 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery('');
                    setHighlight(0);
                    inputRef.current?.focus();
                  }}
                  aria-label="清除搜尋"
                  className="shrink-0 text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

            {/* 選項清單 */}
            <div
              className="overflow-y-auto py-1"
              style={{ maxHeight: Math.max(120, pos.maxHeight - 72) }}
              role="listbox"
              id={listboxId}
              aria-label="選項清單"
            >
              {filtered.length === 0 && !canCreate && (
                <p className="px-3 py-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                  {emptyText}
                </p>
              )}

            {/* 就地新增 — 置頂, 打字後 Enter 第一下就能新增 */}
            {canCreate && onCreate && (
              <button
                key="__create__"
                ref={createRef}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const q = query.trim();
                  setOpen(false);
                  onCreate(q);
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-[12px] font-medium transition-colors',
                  highlight === 0
                    ? 'bg-blue-50 dark:bg-slate-800'
                    : 'hover:bg-blue-50 dark:hover:bg-slate-800',
                  'text-blue-600 dark:text-blue-300',
                )}
              >
                <Plus width={12} height={12} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {createLabel
                    ? createLabel(query.trim())
                    : `新增「${query.trim()}」`}
                </span>
                <span className="shrink-0 rounded border border-blue-200 px-1 text-[9.5px] leading-4 dark:border-blue-800">
                  自訂
                </span>
              </button>
            )}

            {filtered.map((o, i) => {
              const idx = i + (canCreate ? 1 : 0);
              return (
              <button
                key={o.value}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={o.value === value}
                disabled={o.disabled}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center gap-1.5 rounded-sm py-1.5 pl-7 pr-2 text-left text-[13px] transition-colors',
                  'focus:bg-blue-50 focus:text-blue-900 dark:focus:bg-slate-800 dark:focus:text-slate-100',
                  o.disabled && 'pointer-events-none opacity-50',
                  idx === highlight && !o.disabled && 'bg-blue-50 dark:bg-slate-800',
                  o.isCustom ? CUSTOM_TEXT : 'text-slate-800 dark:text-slate-200',
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {o.value === value && (
                    <Check width={13} height={13} className="text-blue-600 dark:text-blue-300" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                    {o.hint}
                  </span>
                )}
              </button>
            )})}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
          className,
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            selected
              ? selected.isCustom
                ? CUSTOM_TEXT
                : 'text-slate-700 dark:text-slate-200'
              : 'text-slate-400 font-normal',
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown width={14} height={14} className="shrink-0 opacity-60" />
      </button>
      {panel}
    </>
  );
}
