'use client';

import * as React from 'react';
import { motion, AnimatePresence, type HTMLMotionProps } from 'framer-motion';
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
            variants={fadeUpItem}
            initial="hidden"
            animate="show"
            exit="exit"
            layout
            className={cn(itemClassName)}
          >
            {renderItem(item, idx)}
          </Item>
        ))}
      </AnimatePresence>
    </Container>
  );
}
