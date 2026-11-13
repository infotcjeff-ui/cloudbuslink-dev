'use client';

/**
 * CopyButton / CopyChip / CopyIconButton — 全站統一的「複製」按鈕 + 動畫回饋
 *
 * 為什麼要抽成共用元件:
 * - 之前每個頁面都自己寫 `navigator.clipboard.writeText(...).catch(() => {})`,
 *   按下去之後完全沒有反應 —— 使用者不知道到底複製成功還是失敗。
 * - 這裡統一處理:
 *   1. 成功 → 右邊的 copy icon 變成 ✓ (tick 勾線由左下往右上畫出 + 圖示彈跳 pop)
 *   2. 失敗 → 紅色 ✗ + 左右搖晃 (shake) + 錯誤 toast
 *   3. 不支援 Clipboard API → 自動 fallback 到 execCommand('copy')
 *
 * ⚠️ 動畫用 CSS (@keyframes, 見 app/globals.css) 而不是 framer-motion:
 *    framer-motion 的 AnimatePresence + mode="wait" 在快速連點 / 狀態切換時
 *    會卡住 —— 舊 icon 不退出 → 新 icon 永遠不出現, 使用者看不到打勾。
 *    CSS class 切換每次點擊都一定重播, 而且效能更好。
 *
 * 不需要重新啟動 server —— 熱重載即時生效。
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

/* -------------------------------------------------------------------------- */
/*  Clipboard helper                                                           */
/* -------------------------------------------------------------------------- */

/**
 * 寫入剪貼簿, 盡量可靠:
 * 1. 先試 navigator.clipboard.writeText (需要 secure context)
 * 2. 文件失焦時搶回焦點再試一次
 * 3. 再失敗 → fallback 用隱藏 textarea + document.execCommand('copy')
 *
 * @returns true = 成功, false = 失敗
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  const value = text ?? '';

  const canUseAsync =
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function';

  // 1) 現代 API
  if (canUseAsync) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 往下走
    }

    // 1b) 視窗失焦時瀏覽器會拒絕 clipboard 寫入 —— 搶回焦點再試一次
    try {
      if (typeof window !== 'undefined' && !document.hasFocus()) {
        window.focus();
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // 往下走 fallback
    }
  }

  // 2) Fallback (http 環境 / 舊瀏覽器 / 權限被拒)
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  useCopyFeedback — 共用的複製狀態機                                          */
/* -------------------------------------------------------------------------- */

export type CopyStatus = 'idle' | 'copied' | 'error';

/**
 * 提供複製的行為 + 狀態。
 *
 * @param label 複製失敗時 toast 訊息的前綴 (例如 '電話')
 */
export function useCopyFeedback(label = '內容') {
  const toast = useToast();
  const [status, setStatus] = React.useState<CopyStatus>('idle');
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = React.useCallback(
    async (text: string) => {
      const ok = await writeToClipboard(text);

      if (timerRef.current) clearTimeout(timerRef.current);

      if (ok) {
        setStatus('copied');
        timerRef.current = setTimeout(() => setStatus('idle'), 1800);
      } else {
        setStatus('error');
        toast.error(`複製${label}失敗 — 請手動選取並複製`);
        timerRef.current = setTimeout(() => setStatus('idle'), 1800);
      }
      return ok;
    },
    [label, toast],
  );

  return { status, copy, reset: () => setStatus('idle') };
}

/* -------------------------------------------------------------------------- */
/*  CopyTick — 會「畫出來」的 ✓ (勾線由左下往右上)                              */
/* -------------------------------------------------------------------------- */

function CopyTick({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" pathLength={1} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  CopyGlyph — 右邊的 copy / tick / error 圖示 (CSS 動畫)                      */
/* -------------------------------------------------------------------------- */

export function CopyGlyph({
  status,
  iconSize = 12,
  className,
}: {
  status: CopyStatus;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('copy-glyph-layer', className)}
      style={{ width: iconSize, height: iconSize }}
      data-state={status}
      aria-hidden="true"
    >
      {/* copy icon — 預設狀態 */}
      <span className="copy-glyph-copy">
        <Copy width={iconSize} height={iconSize} />
      </span>

      {/* tick — 複製成功 (勾線畫出 + 彈跳) */}
      <span className="copy-glyph-tick">
        <CopyTick size={iconSize} />
      </span>

      {/* ✗ — 複製失敗 (搖晃) */}
      <span className="copy-glyph-error">
        <X width={iconSize} height={iconSize} />
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  CopyIconButton — 只有圖示的複製按鈕                                        */
/* -------------------------------------------------------------------------- */

export function CopyIconButton({
  value,
  title = '複製',
  label,
  className,
  iconSize = 12,
}: {
  value: string;
  title?: string;
  /** 複製失敗時 toast 用的名稱 (例: '設定值') */
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  const { status, copy } = useCopyFeedback(label ?? '內容');
  const isCopied = status === 'copied';
  const isError = status === 'error';

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      title={isCopied ? '已複製 ✓' : isError ? '複製失敗' : title}
      aria-label={title}
      aria-live="polite"
      className={cn(
        'inline-flex items-center justify-center rounded cursor-pointer transition-colors',
        isCopied
          ? 'text-emerald-600 dark:text-emerald-400'
          : isError
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        isCopied && 'copy-btn-copied',
        isError && 'copy-btn-error',
        className,
      )}
    >
      <CopyGlyph status={status} iconSize={iconSize} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  CopyChip — 「icon + 內容 + 複製icon」的 chip (表格內最常見的樣式)             */
/* -------------------------------------------------------------------------- */

export function CopyChip({
  value,
  display,
  title = '複製',
  label,
  icon,
  className,
  iconSize = 9,
  showCopiedText = false,
}: {
  /** 要複製的文字 */
  value: string;
  /** 顯示的內容 (預設等於 value) */
  display?: string;
  title?: string;
  /** 複製失敗時 toast 用的名稱 (例: '電話') */
  label?: string;
  /** 前置小圖示 (Phone / Hash ...) */
  icon?: React.ReactNode;
  className?: string;
  iconSize?: number;
  /** 複製成功時是否額外顯示「已複製」文字 (預設關閉 — 只換 icon, 保持版面寬度不跳動) */
  showCopiedText?: boolean;
}) {
  const { status, copy } = useCopyFeedback(label ?? '內容');
  const isCopied = status === 'copied';
  const isError = status === 'error';

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      title={isCopied ? '已複製 ✓' : isError ? '複製失敗' : title}
      aria-label={title}
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors',
        isCopied
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50'
          : isError
          ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50'
          : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:text-slate-200',
        isCopied && 'copy-btn-copied',
        isError && 'copy-btn-error',
        className,
      )}
    >
      {icon}

      {showCopiedText && isCopied ? (
        <span className="font-sans text-[10.5px] font-semibold">已複製</span>
      ) : (
        <span>{display ?? value}</span>
      )}

      <CopyGlyph status={status} iconSize={iconSize} />
    </button>
  );
}
