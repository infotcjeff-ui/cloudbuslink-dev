'use client';

/**
 * EntitySelectWithCreate — 帶「+ 在此新增」連結的 dropdown
 *
 * 設計目的:
 *   - 統一所有 cbl-admin-setting 表單的「選擇校巴/司機/保姆」欄位的呈現
 *     (原本 TripRouteFormModal 內建,其他表單各有不同實作)
 *   - 顯示格式與 TripRouteFormModal 對齊: `${plateNumber} · ${model || '未填型號'} · ${capacity}座`
 *     (對校巴實體) 或自訂 renderLabel
 *   - 內建「+ 在此新增」inline 新增 — 呼叫 onAddNew(),由父層 modal 決定如何開啟 mini form
 *
 * 底層使用 shadcn/ui Base Select (Radix UI) 來確保一致的 a11y/鍵盤操作。
 *
 * 範圍: /cbl-admin-setting/ 內任何 form modal 都可使用。
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Info, X as XIcon, Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn-select';

interface BaseProps<T extends { id: string }> {
  id: string;
  label: string;
  required?: boolean;
  options: T[];
  onAddNew: () => void;
  renderLabel: (o: T) => React.ReactNode;
  emptyHint?: string;
  /** 對齊 column, 預設 sm:col-span-1。設 2=全寬 */
  colSpan?: 1 | 2;
  /** placeholder (例如 "— 請選擇 —" / "+ 新增校巴") */
  placeholder?: string;
  /** 額外 className (例如錯誤狀態的 ring) */
  className?: string;
  /** 禁用 (例如校巴已綁司機時鎖定司機欄) */
  disabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Single-select variant                                                      */
/* -------------------------------------------------------------------------- */

export interface EntitySelectWithCreateSingleProps<T extends { id: string }>
  extends BaseProps<T> {
  multiple?: false;
  value: string;
  onChange: (next: string) => void;
}

export function EntitySelectWithCreate<T extends { id: string }>(
  props: EntitySelectWithCreateSingleProps<T>,
) {
  const {
    id,
    label,
    value,
    options,
    onChange,
    onAddNew,
    renderLabel,
    required,
    emptyHint,
    colSpan = 1,
    placeholder = '— 請選擇 —',
    className,
    disabled = false,
  } = props;

  /**
   * 保險: 目前選中的值一定要出現在 options 裡。
   *
   * 為什麼需要: Radix Select 找不到對應的 <SelectItem> 時,
   * trigger 只會顯示 placeholder (空白) —— 使用者看起來像「沒選到」,
   * 但實際上 state 有值。這在做「選校巴 → 自動帶入保姆」時特別明顯:
   * 帶入的保姆若不在 options (例如 context 是舊快照), 欄位就是空白。
   *
   * 解法: 把當前值補進 options 尾端 (若尚未存在)。
   *
   * ⚠️ 補進去的是一個「只有 id 的殼」, 沒有 name / phone 等欄位。
   *    如果直接丟給 renderLabel, 會渲染成 "undefined · undefined"。
   *    所以補殼時一併標記 isMissing, 由下方 renderOptionLabel 改成顯示
   *    「⚠ 資料不存在 (id)」而不是 undefined。
   */
  const optionsWithCurrent = React.useMemo(() => {
    if (!value) return options;
    if (options.some((o) => o.id === value)) return options;
    return [...options, { id: value, __missing: true } as T & { __missing?: boolean }];
  }, [options, value]);

  /**
   * 產生 option 的顯示文字。
   *
   * - 正常實體 → 用呼叫端給的 renderLabel
   * - 補進來的殼 (實體已不存在於清單) → 顯示明確的警告文字,
   *   絕不顯示 "undefined · undefined" 這種讓人看不懂的東西。
   */
  const renderOptionLabel = (o: T): string => {
    if ((o as { __missing?: boolean }).__missing) {
      return `⚠ 資料已不存在 (${o.id})`;
    }
    const rendered = renderLabel(o);
    if (typeof rendered === 'string') {
      // 防止 renderLabel 遇到欄位缺失時回傳 "undefined · undefined"
      if (rendered.includes('undefined') || rendered.trim() === '') {
        return `⚠ 資料已不存在 (${o.id})`;
      }
      return rendered;
    }
    return String(o.id);
  };

  return (
    <div className={cn(colSpan === 2 ? 'sm:col-span-2' : undefined, className)}>
      <label
        htmlFor={id}
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <Select
        disabled={disabled}
        value={value || '__unset__'}
        onValueChange={(v) => {
          if (v === '__add_new__') {
            onAddNew();
            return;
          }
          if (v === '__unset__') {
            onChange('');
            return;
          }
          onChange(v);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {/* 「未選」代表清空選項,但 Radix 不可用空字串當 value,
              用 __unset__ 標記,內部翻譯回空字串 */}
          <SelectItem value="__unset__">
            <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
          </SelectItem>
          {optionsWithCurrent.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {renderOptionLabel(o)}
            </SelectItem>
          ))}
          {optionsWithCurrent.length > 0 && <SelectSeparator />}
          <SelectItem
            value="__add_new__"
            className="text-blue-600 focus:text-blue-700 dark:text-blue-400 dark:focus:text-blue-300 font-medium whitespace-nowrap"
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Plus className="h-3 w-3 shrink-0" />
              在此新增…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {options.length === 0 && emptyHint && (
        <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
          <Info width={10} height={10} />
          {emptyHint}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Multi-select variant — chip-style                                           */
/* -------------------------------------------------------------------------- */

export interface EntitySelectWithCreateMultiProps<T extends { id: string }>
  extends BaseProps<T> {
  multiple: true;
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * 多選版本 — 顯示已選 chips + 一個 shadcn Select 來加入新項目。
 * - 從 Select 選 option → 加到 chips (不重複)
 * - 點 chip 上的 X → 從 chips 移除
 * - Select 最後一個 item 是「＋ 在此新增…」呼叫 onAddNew
 */
export function EntitySelectWithCreateMulti<T extends { id: string }>(
  props: EntitySelectWithCreateMultiProps<T>,
) {
  const {
    id,
    label,
    value,
    options,
    onChange,
    onAddNew,
    renderLabel,
    required,
    emptyHint,
    colSpan = 1,
    placeholder,
    className,
  } = props;

  const addId = (nextId: string) => {
    if (nextId === '__add_new__') {
      onAddNew();
      return;
    }
    if (!value.includes(nextId)) {
      onChange([...value, nextId]);
    }
  };

  const removeId = (rid: string) => {
    onChange(value.filter((v) => v !== rid));
  };

  // chips 區只顯示已選的,dropdown 只列「未選」避免重複
  const remaining = options.filter((o) => !value.includes(o.id));

  return (
    <div className={cn(colSpan === 2 ? 'sm:col-span-2' : undefined, className)}>
      <label
        htmlFor={id}
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
        <span className="ml-1 text-[10px] text-slate-400 normal-case font-medium tracking-normal">
          (已選 {value.length})
        </span>
      </label>

      {/* 已選 chips */}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {value.map((idVal) => {
            const item = options.find((o) => o.id === idVal);
            const rendered = item ? renderLabel(item) : null;
            const display =
              typeof rendered === 'string'
                ? rendered
                : item
                  ? String(item.id)
                  : `(${idVal.slice(0, 8)}…)`;
            return (
              <span
                key={idVal}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800/60"
              >
                <span className="truncate max-w-[200px]">{display}</span>
                <button
                  type="button"
                  onClick={() => removeId(idVal)}
                  aria-label={`移除 ${display}`}
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-blue-200/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 transition-colors cursor-pointer"
                >
                  <XIcon width={9} height={9} />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* 下拉新增 (shadcn Select) */}
      <Select
        value="__add_placeholder__"
        onValueChange={(v) => {
          if (v && v !== '__add_placeholder__') {
            addId(v);
          }
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue
            placeholder={placeholder ?? (value.length === 0 ? '— 請選擇 —' : '＋ 新增校巴')}
          />
        </SelectTrigger>
        <SelectContent>
          {/* placeholder item — 始終不能選 */}
          <SelectItem value="__add_placeholder__" disabled>
            <span className="text-slate-400 dark:text-slate-500">
              {placeholder ?? (value.length === 0 ? '— 請選擇 —' : '＋ 新增校巴')}
            </span>
          </SelectItem>
          {remaining.map((o) => {
            const rendered = renderLabel(o);
            const display = typeof rendered === 'string' ? rendered : String(o.id);
            return (
              <SelectItem key={o.id} value={o.id}>
                {display}
              </SelectItem>
            );
          })}
          {options.length > 0 && <SelectSeparator />}
          <SelectItem
            value="__add_new__"
            className="text-blue-600 focus:text-blue-700 dark:text-blue-400 dark:focus:text-blue-300 font-medium whitespace-nowrap"
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Plus className="h-3 w-3 shrink-0" />
              在此新增新校巴…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {options.length === 0 && emptyHint && (
        <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
          <Info width={10} height={10} />
          {emptyHint}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Convenience helpers — 用於校巴的 label 渲染                                  */
/* -------------------------------------------------------------------------- */

/**
 * 校巴的標準顯示格式: `${plateNumber} · ${model || '未填型號'} · ${capacity}座`
 * (與 TripRouteFormModal 內 EntitySelectWithCreate 完全相同)
 */
export function busLabel(b: { plateNumber: string; model?: string; capacity: number }): string {
  return `${b.plateNumber} · ${b.model || '未填型號'} · ${b.capacity}座`;
}
