'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Fallback to no-op if not in provider
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 width={16} height={16} className="text-emerald-600" />,
  error: <XCircle width={16} height={16} className="text-rose-600" />,
  info: <Info width={16} height={16} className="text-blue-600" />,
  warning: <AlertCircle width={16} height={16} className="text-amber-600" />,
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/60',
  error: 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/60',
  info: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60',
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  React.useEffect(() => {
    const duration = toast.duration ?? 4000;
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <motion.div
      key={toast.id}
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg pointer-events-auto',
        'min-w-[280px] max-w-[420px]',
        TOAST_STYLES[toast.type],
      )}
    >
      <div className="shrink-0">{TOAST_ICONS[toast.type]}</div>
      <p className="flex-1 text-[13px] font-medium text-slate-800 dark:text-slate-100">
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className={cn(
          'shrink-0 p-1 rounded-md cursor-pointer transition-colors',
          'hover:bg-slate-200/50 dark:hover:bg-slate-700/50',
          'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
        )}
        aria-label="關閉提示"
      >
        <X width={14} height={14} />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    [],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (msg, d) => toast('success', msg, d),
      error: (msg, d) => toast('error', msg, d),
      info: (msg, d) => toast('info', msg, d),
      warning: (msg, d) => toast('warning', msg, d),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast Container — Fixed top-right */}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="通知"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
