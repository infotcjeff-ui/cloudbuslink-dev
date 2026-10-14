'use client';

/**
 * OneFleet-style design tokens.
 *
 * 規格來源: md/organizations-page-style-reference.md §6 Animation Tokens
 * (規範中所有頁面共用的 snappy ease + 一致 duration)。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/students/ 內使用,
 * 之後其他 cbl-admin-setting 頁面若要套同樣語言, 也應 import 自此處。
 * 不要散落在各元件檔。
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