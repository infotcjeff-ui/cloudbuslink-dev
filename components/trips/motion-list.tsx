'use client';

import * as React from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { fadeUpItem, staggerContainer } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface MotionListProps<T> {
  items: T[];
  getKey: (item: T, idx: number) => string;
  renderItem: (item: T, idx: number) => React.ReactNode;
  className?: string;
  itemClassName?: string;
  /** If true, uses <ul>/<li> semantics. */
  asList?: boolean;
  /** AnimatePresence mode. */
  mode?: 'sync' | 'wait' | 'popLayout';
  /** 預設 true。設 false 可關掉 layout 動畫 (打卡列狀態切換時避免卡片變形)。 */
  layout?: boolean;
  /** 自訂 item variants，預設 fadeUpItem。打卡列傳 fadeItem 只做 fade。 */
  itemVariants?: Variants;
}

/**
 * Boilerplate-free stagger list. Replaces the "motion.div with map(idx delay)" pattern
 * in every list view.
 *
 * @example
 *   <MotionList
 *     items={trips}
 *     getKey={(t) => t.id}
 *     renderItem={(t, i) => <TripCard ... index={i} />}
 *   />
 */
export function MotionList<T>({
  items,
  getKey,
  renderItem,
  className,
  itemClassName,
  asList = false,
  mode = 'popLayout',
  layout = true,
  itemVariants = fadeUpItem,
}: MotionListProps<T>) {
  const Container: any = asList ? motion.ul : motion.div;
  const Item: any = asList ? motion.li : motion.div;

  return (
    <Container
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={cn(className)}
    >
      <AnimatePresence mode={mode} initial={false}>
        {items.map((item, idx) => (
          <Item
            key={getKey(item, idx)}
            variants={itemVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            {...(layout ? { layout: true } : {})}
            className={cn(itemClassName)}
          >
            {renderItem(item, idx)}
          </Item>
        ))}
      </AnimatePresence>
    </Container>
  );
}
