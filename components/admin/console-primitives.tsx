'use client';

/**
 * console-primitives — OneFleet-style console 元件的共用出口
 *
 * 原始實作在 /cbl-admin-setting/[layout]/students/primitives.tsx
 * (那一層是整個 cbl-admin-setting console 的 primitives 源頭)。
 *
 * 這裡做一個 barrel re-export, 好讓 /system-admin-setting 這些
 * 「同一套 console 語言」的頁面可以用乾淨的 alias import:
 *
 *   import { Card, SectionHeader, StatTile, Pill } from '@/components/admin/console-primitives';
 *
 * 而不是每次都寫 `../../cbl-admin-setting/[layout]/students/primitives`。
 *
 * ⚠️ hover: 政策 — 這套 primitives 是 PC 後台 console 專用,
 *    允許 hover: 變體 (與 /cbl-admin-setting 現況一致)。
 *    其他頁面 (手機版) 不應 import 這個檔案, 仍須遵守
 *    .cursor/rules/bus-app.mdc「只用 active:」的規定。
 */

export {
  Pill,
  Dot,
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from '../../app/(main)/cbl-admin-setting/[layout]/students/primitives';

export {
  EASE,
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
  TAB_SLIDE_DISTANCE,
  MODAL_FADE,
  MODAL_SLIDE,
  PILL_SPRING,
  ROW_STAGGER_BASE,
  ROW_STAGGER_CAP,
} from '../../app/(main)/cbl-admin-setting/[layout]/students/design-tokens';
