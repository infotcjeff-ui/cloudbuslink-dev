'use client';

/**
 * OneFleet-style design tokens — Parents console
 *
 * 與 /cbl-admin-setting/[layout]/students/design-tokens.ts 對齊, 共用同樣的
 * snappy ease + 一致 duration, 確保兩頁面切換時的視覺一致性。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/parents/ 內使用。
 */

export const EASE = [0.25, 0.1, 0.25, 1] as const;
export const ANIMATION_EASE = EASE;

export const PAGE_FADE_DURATION = 0.2;
export const TAB_FADE_DURATION = 0.22;
export const TAB_SLIDE_DISTANCE = 6;
export const MODAL_FADE = 0.14;
export const MODAL_SLIDE = 6;

export const PILL_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.6,
} as const;

export const ROW_STAGGER_BASE = 0.025;
export const ROW_STAGGER_CAP = 0.2;
