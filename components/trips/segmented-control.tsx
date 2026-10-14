'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  trailing?: React.ReactNode;
}

interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  layoutId?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  layoutId = 'segmented-control',
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((o) => o.value === value);

  const hClass = size === 'sm' ? 'h-8' : 'h-10';

  return (
    <div
      role="tablist"
      className={cn(
        'relative inline-flex items-center rounded-full bg-muted/60 p-1 gap-0.5',
        hClass,
        className
      )}
    >
      {/* Animated pill background */}
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={value}
          layoutId={layoutId}
          className="absolute inset-y-1 rounded-full bg-background shadow-sm"
          initial={false}
          animate={{ left: 0, right: 0 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
          }}
          style={{
            // Position the pill under the active tab
            left: undefined,
            right: undefined,
            width: `${100 / options.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      </AnimatePresence>

      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-full',
              'text-sm font-medium whitespace-nowrap select-none',
              'transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5'
            )}
          >
            <span>{option.label}</span>
            {option.trailing}
          </button>
        );
      })}
    </div>
  );
}
