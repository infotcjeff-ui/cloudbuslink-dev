'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DUR, EASE_OUT_QUART } from '@/lib/motion';

export interface StickyActionBarProps {
  /** Show the back/cancel button. */
  showBack?: boolean;
  backLabel?: string;
  onBack?: () => void;
  /** Show the primary forward/submit button. */
  showNext?: boolean;
  nextLabel?: string;
  onNext?: () => void;
  /** Submit in progress. */
  loading?: boolean;
  /** Whether the primary action is disabled. */
  nextDisabled?: boolean;
  /** When true, the next button shows a check icon and success tone briefly. */
  success?: boolean;
  /** Optional secondary action (e.g. "Save as draft"). */
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  className?: string;
}

export function StickyActionBar({
  showBack = true,
  backLabel = '取消',
  onBack,
  showNext = true,
  nextLabel = '下一步',
  onNext,
  loading = false,
  nextDisabled = false,
  success = false,
  secondary,
  className,
}: StickyActionBarProps) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: DUR.base, ease: EASE_OUT_QUART, delay: 0.1 }}
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'bg-background/85 backdrop-blur-md border-t border-border',
        'safe-bottom',
        className
      )}
    >
      <div className="px-4 py-3 flex items-center gap-2">
        {showBack && (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="h-12 px-4 text-base"
            disabled={loading}
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </Button>
        )}
        {secondary && (
          <Button
            type="button"
            variant="outline"
            onClick={secondary.onClick}
            disabled={secondary.disabled || loading}
            className="h-12"
          >
            {secondary.label}
          </Button>
        )}
        <div className="flex-1" />
        {showNext && (
          <Button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || loading || success}
            className={cn(
              'h-12 px-6 text-base min-w-[120px] relative overflow-hidden',
              success && 'bg-primary'
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  處理中
                </motion.span>
              ) : success ? (
                <motion.span
                  key="success"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex items-center gap-2"
                >
                  <Check className="w-4 h-4" strokeWidth={3} />
                  完成
                </motion.span>
              ) : (
                <motion.span
                  key="next"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-2"
                >
                  {nextLabel}
                  <ArrowRight className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        )}
      </div>
    </motion.div>
  );
}
