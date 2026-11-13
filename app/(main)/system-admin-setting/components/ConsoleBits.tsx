'use client';

/**
 * system-admin-setting 的共用 console 元件
 *
 * 沿用 /cbl-admin-setting 的 OneFleet-style 語言:
 *   - Card / SectionHeader / StatTile / Pill / Dot / Button (from console-primitives)
 *   - 這裡補幾個「設定頁專用」的小元件: 狀態點 / 設定列 / 遮罩值
 *
 * ⚠️ hover: 政策 — PC 後台 console, 允許 hover: 變體。
 */

import * as React from 'react';
import {
  Eye, EyeOff, Pencil, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyIconButton } from '@/components/ui/copy-button';
import type { ConfigSource } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  StatusDot — 狀態點 + 文字                                             */
/* ------------------------------------------------------------------ */

export function StatusDot({
  ok,
  label,
  tone = 'auto',
}: {
  ok: boolean;
  label: string;
  /** auto = 依 ok 決定綠/紅; 其他則強制指定色 */
  tone?: 'auto' | 'success' | 'danger' | 'warning' | 'neutral';
}) {
  const resolved = tone === 'auto' ? (ok ? 'success' : 'danger') : tone;
  const color =
    resolved === 'success' ? 'bg-emerald-500'
    : resolved === 'danger' ? 'bg-rose-500'
    : resolved === 'warning' ? 'bg-amber-500'
    : 'bg-slate-400';
  const textColor =
    resolved === 'success' ? 'text-emerald-700 dark:text-emerald-300'
    : resolved === 'danger' ? 'text-rose-700 dark:text-rose-300'
    : resolved === 'warning' ? 'text-amber-700 dark:text-amber-300'
    : 'text-slate-600 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${textColor}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  ConfigSourcePill — 顯示設定值來自哪一層                            */
/* ------------------------------------------------------------------ */

const SOURCE_META: Record<
  ConfigSource,
  { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' | 'info' | 'violet' }
> = {
  override: { label: '本機覆寫', tone: 'warning' },
  cloud: { label: '平台設定', tone: 'info' },
  env: { label: '環境變數', tone: 'success' },
  default: { label: '預設值', tone: 'neutral' },
  none: { label: '未設定', tone: 'danger' },
};

const SOURCE_TONES: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',
  info: 'bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',
};

export function ConfigSourcePill({
  source,
  className = '',
}: {
  source: ConfigSource;
  className?: string;
}) {
  const meta = SOURCE_META[source] ?? SOURCE_META.none;
  return (
    <span
      title={`設定來源: ${meta.label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-md ring-1 ring-inset font-medium tracking-wide uppercase px-1.5 py-0.5 text-[10px]',
        SOURCE_TONES[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  SettingRow — 設定列 (左 label / 右 value)                            */
/* ------------------------------------------------------------------ */

export function SettingRow({
  label,
  hint,
  children,
  mono = false,
  onEdit,
  onReset,
  editable = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  /** 值用等寬字體 (適合 URL / key / 數值) */
  mono?: boolean;
  /** 點擊後開啟編輯彈窗 */
  onEdit?: () => void;
  /** 還原預設 (清除該欄的 override) */
  onReset?: () => void;
  /** 顯示 pencil 按鈕 */
  editable?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint && (
          <p className="text-[11px] text-slate-500 mt-0.5 leading-tight dark:text-slate-400">{hint}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={
            mono
              ? 'text-right font-mono text-[11px] text-slate-600 dark:text-slate-300'
              : 'text-right text-[12px] font-medium text-slate-800 dark:text-slate-100'
          }
        >
          {children}
        </div>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            title="還原預設 (清除本機覆寫)"
            aria-label="還原預設"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <RotateCcw width={12} height={12} />
          </button>
        )}
        {editable && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="編輯"
            aria-label="編輯"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-blue-950/40 dark:hover:text-blue-400"
          >
            <Pencil width={12} height={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MaskedValue — 遮罩顯示 secret (預設 ••••, 點眼睛才顯示明文)         */
/* ------------------------------------------------------------------ */

export function MaskedValue({
  value,
  emptyHint = '未設定',
  source,
  onEdit,
  className = '',
}: {
  value: string;
  emptyHint?: string;
  /** 顯示「設定來源」badge */
  source?: ConfigSource;
  /** 點擊後開啟編輯彈窗 */
  onEdit?: () => void;
  className?: string;
}) {
  const [show, setShow] = React.useState(false);

  if (!value) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-slate-400 dark:text-slate-500">{emptyHint}</span>
        {source && <ConfigSourcePill source={source} />}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="編輯"
            aria-label="編輯"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
          >
            <Pencil width={12} height={12} />
          </button>
        )}
      </span>
    );
  }
  const masked = `${value.slice(0, 6)}••••••${value.slice(-6)}`;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {show ? value : masked}
      </code>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={show ? '隱藏' : '顯示'}
      >
        {show ? <EyeOff width={12} height={12} /> : <Eye width={12} height={12} />}
      </button>
      {show && (
        <CopyIconButton
          value={value}
          title="複製"
          label="設定值"
          className="h-6 w-6"
        />
      )}
      {source && <ConfigSourcePill source={source} />}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title="編輯"
          aria-label="編輯"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
        >
          <Pencil width={12} height={12} />
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  SwitchRow — 開關式設定列                                             */
/* ------------------------------------------------------------------ */

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  onEdit,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint && (
          <p className="text-[11px] text-slate-500 mt-0.5 leading-tight dark:text-slate-400">{hint}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed',
            checked
              ? 'bg-blue-600'
              : 'bg-slate-300 dark:bg-slate-700',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
            )}
          />
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="編輯"
            aria-label="編輯"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
          >
            <Pencil width={12} height={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KeyValueGrid — 環境變數檢查的格狀展示                               */
/* ------------------------------------------------------------------ */

export function KeyValueGrid({
  items,
}: {
  items: {
    label: string;
    ok: boolean;
    note?: string;
    source?: ConfigSource;
    onEdit?: () => void;
  }[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-3.5 py-3 dark:border-slate-700/60 dark:bg-slate-800/60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {it.label}
            </span>
            <div className="flex items-center gap-1.5">
              <StatusDot ok={it.ok} label={it.ok ? '已載入' : '缺失'} />
              {it.source && <ConfigSourcePill source={it.source} />}
              {it.onEdit && (
                <button
                  type="button"
                  onClick={it.onEdit}
                  title="編輯"
                  aria-label="編輯"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                >
                  <Pencil width={12} height={12} />
                </button>
              )}
            </div>
          </div>
          {it.note && (
            <p className="mt-1.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              {it.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
