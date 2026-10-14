'use client';

/**
 * OneFleet-style Primitives — 規格來源
 *   md/organizations-page-style-reference.md §7 Core Reusable Primitives
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/students/ 內使用。
 * 之後其他 cbl-admin-setting 頁面套同樣語言時, 應 import 自此處 (並考慮搬出去)。
 *
 * 故意 hand-coded, 不用任何 HeroUI / shadcn — 對應 .cursor/rules/no-heroui-mandate。
 * 圖標統一用 lucide-react (此專案已有, 不引入新依賴),
 * 而非規範裡的 solar: — 因為這頁與全域共用 layout 不做後續大規模改造,
 * 並嚴格隔離在本子目錄內。
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PILL_SPRING } from './design-tokens';

/* -------------------------------------------------------------------------- */
/*  Pill — 狀態徽章                                                            */
/* -------------------------------------------------------------------------- */

type PillTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'violet'
  | 'info';

export function Pill({
  children,
  tone = 'neutral',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  tone?: PillTone;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const tones: Record<PillTone, string> = {
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    primary: 'bg-blue-50 text-blue-700 ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',
    warning: 'bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50',
    info: 'bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50',
  };
  const sizes =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px]'
      : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md ring-1 ring-inset font-medium tracking-wide uppercase',
        tones[tone],
        sizes,
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dot — 小狀態點                                                              */
/* -------------------------------------------------------------------------- */

type DotTone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary' | 'violet';

export function Dot({ tone = 'neutral' }: { tone?: DotTone }) {
  const tones: Record<DotTone, string> = {
    neutral: 'bg-slate-400',
    success: 'bg-emerald-500',
    danger: 'bg-rose-500',
    warning: 'bg-amber-500',
    primary: 'bg-blue-500',
    violet: 'bg-violet-500',
  };
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tones[tone])} />;
}

/* -------------------------------------------------------------------------- */
/*  Button — 通用按鈕 (6 variants, 2 sizes)                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'subtle'
  | 'warning'
  | 'success';

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  startIcon,
  endIcon,
  title,
  className = '',
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  isLoading?: boolean;
  disabled?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  title?: string;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm dark:bg-blue-600 dark:border-blue-600',
    secondary:
      'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-700 border-transparent dark:hover:bg-slate-800 dark:text-slate-200',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-sm',
    subtle:
      'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200',
    warning:
      'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-sm',
  };
  const sizes = size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-[13px]';
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes,
        className,
      )}
    >
      {isLoading && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {!isLoading && startIcon}
      <span className="truncate">{children}</span>
      {!isLoading && endIcon}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  IconButton — 方形 icon 觸發器                                                */
/* -------------------------------------------------------------------------- */

type IconButtonVariant = 'ghost' | 'danger' | 'subtle' | 'primary' | 'warning' | 'success';

export function IconButton({
  onClick,
  children,
  title,
  variant = 'ghost',
  className = '',
}: {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  title?: string;
  variant?: IconButtonVariant;
  className?: string;
}) {
  const variants: Record<IconButtonVariant, string> = {
    ghost:
      'hover:bg-slate-100 text-slate-500 hover:text-slate-700 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
    danger:
      'hover:bg-rose-50 text-slate-400 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:text-slate-400 dark:hover:text-rose-400',
    subtle:
      'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300',
    primary:
      'hover:bg-blue-50 text-slate-400 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:text-slate-400 dark:hover:text-blue-400',
    warning:
      'hover:bg-amber-50 text-slate-400 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:text-slate-400 dark:hover:text-amber-400',
    success:
      'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:text-slate-400 dark:hover:text-emerald-400',
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card — 頁面 chrome 卡片                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden dark:bg-slate-900 dark:border-slate-700',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SectionHeader — 卡片標題列                                                  */
/* -------------------------------------------------------------------------- */

type SectionAccent = 'primary' | 'violet' | 'warning' | 'success' | 'danger' | 'neutral';

export function SectionHeader({
  icon,
  title,
  subtitle,
  actions,
  accent = 'primary',
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  accent?: SectionAccent;
}) {
  const accentBg: Record<SectionAccent, string> = {
    primary:
      'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50',
    violet:
      'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50',
    warning:
      'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',
    success:
      'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50',
    danger:
      'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',
    neutral:
      'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  };
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset shrink-0',
            accentBg[accent],
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900 leading-tight dark:text-slate-100">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StatTile — 緊湊 KPI                                                          */
/* -------------------------------------------------------------------------- */

type StatTone = 'neutral' | 'primary' | 'violet' | 'success' | 'danger' | 'warning';

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
}) {
  const tones: Record<StatTone, string> = {
    neutral: 'text-slate-700 dark:text-slate-200',
    primary: 'text-blue-700 dark:text-blue-300',
    violet: 'text-violet-700 dark:text-violet-300',
    success: 'text-emerald-700 dark:text-emerald-300',
    danger: 'text-rose-700 dark:text-rose-300',
    warning: 'text-amber-700 dark:text-amber-300',
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3.5 py-3 dark:bg-slate-800/60 dark:border-slate-700/60">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <span className={cn('text-lg font-semibold tabular-nums leading-none', tones[tone])}>
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-slate-500 leading-tight dark:text-slate-400">
          {hint}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  FilterTabGroup — 分段控制器 + 滑動 pill                                       */
/* -------------------------------------------------------------------------- */

export interface FilterTabOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export function FilterTabGroup<T extends string>({
  value,
  onChange,
  options,
  layoutId,
}: {
  value: T;
  onChange: (next: T) => void;
  options: FilterTabOption<T>[];
  layoutId: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 relative dark:bg-slate-800 dark:border-slate-700">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isActive}
            className={cn(
              'relative z-10 px-2.5 h-7 text-[11px] font-medium rounded-[5px] cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 inline-flex items-center gap-1',
              isActive ? 'text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[5px] bg-blue-600 shadow-[0_1px_2px_rgba(37,99,235,0.35)]"
                transition={PILL_SPRING}
              />
            )}
            {opt.icon && (
              <span className="relative z-10 flex items-center">{opt.icon}</span>
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}