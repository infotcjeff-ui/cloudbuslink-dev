'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, DUR, EASE_OUT_QUART, useReducedMotion } from '@/lib/motion';

export interface TripFabProps {
  onClick: () => void;
  /** Show or hide. */
  visible?: boolean;
  /** Optional aria-label override. */
  label?: string;
  className?: string;
}

export function TripFab({ onClick, visible = true, label = '新增班次', className }: TripFabProps) {
  const reduced = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      initial={false}
      animate={
        visible
          ? { scale: 1, rotate: 0, opacity: 1 }
          : { scale: 0, rotate: -90, opacity: 0 }
      }
      whileHover={
        reduced
          ? undefined
          : {
              scale: 1.08,
              boxShadow: '0 12px 28px -4px hsl(var(--primary) / 0.55), 0 4px 12px -2px hsl(var(--primary) / 0.4)',
              transition: { duration: DUR.fast, ease: EASE_OUT_QUART },
            }
      }
      whileTap={reduced ? undefined : { scale: 0.9 }}
      transition={reduced ? { duration: 0 } : SPRING.pop}
      className={cn(
        'fixed right-4 bottom-24 z-30',
        'h-14 w-14 rounded-full bg-primary text-primary-foreground',
        'flex items-center justify-center',
        'shadow-[0_8px_24px_-4px_hsl(var(--primary)/0.45),0_2px_8px_-2px_hsl(var(--primary)/0.3)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className
      )}
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary opacity-0 hover:opacity-100 transition-opacity"
      />
    </motion.button>
  );
}
