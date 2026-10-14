'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, fmtDate, cnWeekday } from '@/lib/utils';

interface DatePillRowProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  className?: string;
}

export function DatePillRow({ value, onChange, className }: DatePillRowProps) {
  const date = new Date(value);

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onChange(fmtDate(d));
  };

  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onChange(fmtDate(d));
  };

  const todayStr = fmtDate(new Date());

  const isToday = value === todayStr;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={prevDay}
        aria-label="前一天"
        className="h-10 w-10 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center active:scale-95 transition-transform"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <motion.button
        type="button"
        key={value}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={() => {
          if (!isToday) {
            onChange(todayStr);
          }
        }}
        className={cn(
          'flex-1 h-10 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-colors',
          'border border-transparent',
          isToday
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/60 hover:bg-muted active:scale-95'
        )}
      >
        <span>{cnWeekday(value)}</span>
        <span className="text-muted-foreground opacity-60">|</span>
        <span>{value.slice(5).replace('-', '/')}</span>
        {!isToday && (
          <span className="ml-1 text-[10px] opacity-60">今天</span>
        )}
      </motion.button>

      <button
        type="button"
        onClick={nextDay}
        aria-label="後一天"
        className="h-10 w-10 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center active:scale-95 transition-transform"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
