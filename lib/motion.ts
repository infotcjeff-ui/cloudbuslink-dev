import type { Variants } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

// Stagger list container — children animate in sequence.
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

// Each list item — fade-up + small slide.
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 30 },
  },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

// Directional slide for step wizard (used with custom=direction prop: 1=forward, -1=backward)
export const stepSlide: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 32 : -32,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 32 },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -32 : 32,
    transition: { duration: 0.18, ease: 'easeIn' },
  }),
};

// Error shake animation (for validation feedback)
export const errorShake: Variants = {
  hidden: { opacity: 0, y: -4 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 600,
      damping: 20,
    },
  },
};

// Duration constants (in seconds)
export const DUR = {
  /** ~120ms — micro-interactions, toggles */
  micro: 0.12,
  /** ~180ms — standard UI transitions */
  fast: 0.18,
  /** ~280ms — default page-level transitions */
  base: 0.28,
  /** ~400ms — large layout animations */
  slow: 0.4,
} as const;

export type DUR = (typeof DUR)[keyof typeof DUR];

// Easing curves (cubic-bezier)
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT = [0.0, 0.0, 0.2, 1] as const;

// Spring presets
export const SPRING = {
  /** iOS-style snappy spring for pop-in/pop-out */
  pop: { type: 'spring', stiffness: 420, damping: 28 },
  /** Gentle settle */
  gentle: { type: 'spring', stiffness: 300, damping: 32 },
  /** Snappy for toggles / switches */
  snappy: { type: 'spring', stiffness: 500, damping: 30 },
  /** Stiff for drag / layout shifts */
  stiff: { type: 'spring', stiffness: 600, damping: 35 },
  /** Indicator animation (used for animated pill backgrounds) */
  indicator: { type: 'spring', stiffness: 500, damping: 35 },
} as const;

export { useReducedMotion };
