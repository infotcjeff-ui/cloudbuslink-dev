'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DUR, EASE_OUT_QUART, useReducedMotion } from '@/lib/motion';

export interface Step {
  key: string;
  label: string;
  /** Short hint shown below the label. */
  hint?: string;
}

export interface StepsProgressProps {
  steps: Step[];
  /** Zero-based current step index. */
  current: number;
  /** Highest index the user has reached (used to allow jumping back). */
  maxReached: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Top-of-form step indicator. Completed steps show ✓ in primary circle;
 * current step has a ring + dot pulse; future steps are muted.
 * Tapping a previously-reached step calls onStepClick to allow jump-back.
 */
export function StepsProgress({
  steps,
  current,
  maxReached,
  onStepClick,
  className,
}: StepsProgressProps) {
  const reduced = useReducedMotion();

  return (
    <div className={cn('w-full', className)}>
      <div className="relative flex items-start justify-between">
        {/* Connector lines (between dots). */}
        {steps.slice(0, -1).map((_, i) => {
          const passed = i < current;
          return (
            <div
              key={`line-${i}`}
              className="absolute top-4 h-0.5 bg-muted"
              style={{
                left: `calc(${(i + 0.5) * (100 / steps.length)}% + 12px)`,
                right: `calc(${100 - (i + 1.5) * (100 / steps.length)}% + 12px)`,
              }}
            >
              <motion.div
                className="h-full bg-primary origin-left"
                initial={false}
                animate={{ scaleX: passed ? 1 : 0 }}
                transition={{ duration: DUR.base, ease: EASE_OUT_QUART }}
                style={{ width: '100%' }}
              />
            </div>
          );
        })}

        {steps.map((s, i) => {
          const isCurrent = i === current;
          const isCompleted = i < current;
          const reachable = i <= maxReached;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!reachable || isCurrent}
              onClick={() => reachable && !isCurrent && onStepClick?.(i)}
              className={cn(
                'relative z-10 flex flex-col items-center gap-1.5 px-1',
                'flex-1 min-w-0',
                !reachable && 'cursor-not-allowed'
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <motion.div
                initial={false}
                animate={
                  isCompleted
                    ? { scale: 1, backgroundColor: 'hsl(var(--primary))' }
                    : isCurrent
                    ? { scale: 1.05, backgroundColor: 'hsl(var(--primary))' }
                    : { scale: 1, backgroundColor: 'hsl(var(--muted))' }
                }
                transition={{ duration: DUR.base, ease: EASE_OUT_QUART }}
                className={cn(
                  'relative w-8 h-8 rounded-full flex items-center justify-center',
                  'border-2',
                  isCurrent
                    ? 'border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]'
                    : isCompleted
                    ? 'border-primary'
                    : 'border-muted-foreground/30'
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isCompleted ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
                    >
                      <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="num"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
                      className={cn(
                        'text-xs font-bold',
                        isCurrent ? 'text-primary-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isCurrent && !reduced && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-primary/30"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </motion.div>
              <div className="flex flex-col items-center min-w-0 max-w-full">
                <span
                  className={cn(
                    'text-[11px] font-semibold truncate max-w-full',
                    isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
                {s.hint && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-full">
                    {s.hint}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
