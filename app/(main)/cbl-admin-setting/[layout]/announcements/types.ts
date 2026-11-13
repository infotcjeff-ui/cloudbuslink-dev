'use client';

/** Announcements 頁面的類型定義 */

import type { AnnouncementScope } from '@/lib/types';

export type AnnouncementTab = 'active' | 'inactive' | 'templates';

export interface AnnouncementFormState {
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  displayCount: number;
  maxViewsPerUser: number;
  startDate: string;  // yyyy-mm-dd
  endDate: string;    // yyyy-mm-dd
  isTemplate: boolean;
  templateName: string;
  /**
   * 受眾類型
   * ─────────
   * - 'system'  系統公告 → 所有用戶都會看到 (跨機構、跨角色)
   * - 'payment' 繳費公告 → 只有 targetParentIds 內的家長會看到
   */
  scope: AnnouncementScope;
  /**
   * 繳費公告的指定家長 id (cbl_parents.id)。
   * scope = 'system' 時一律為空陣列。
   */
  targetParentIds: string[];
}

export const EMPTY_ANNOUNCEMENT_FORM: AnnouncementFormState = {
  title: '',
  content: '',
  type: 'info',
  displayCount: 1,
  maxViewsPerUser: 1,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  isTemplate: false,
  templateName: '',
  scope: 'system',
  targetParentIds: [],
};

/**
 * 繳費公告的「內容」預設值
 * ─────────────────────
 * ⚠️ 繳費公告的內容、類型、有效期、次數上限都**不是由管理員手動填**,
 *    而是綁定「付款記錄」(/cbl-admin-setting/parents/payment) 自動帶出:
 *      - 內容   → 帳單摘要 + 金額 + 到期日
 *      - 類型   → 依「逾期 / 即將到期 / 已繳」決定
 *      - 有效期 → 依帳單週期決定
 *      - 次數   → 依未繳戶數決定
 *
 * 但付款記錄功能**尚未開發** → 現在先放一段佔位文案,
 * 等該功能完成後由綁定的付款記錄資料覆蓋。
 */
export const PAYMENT_CONTENT_PLACEHOLDER =
  '繳費通知 — 帳單金額、到期日與付款狀態將自動帶入（付款記錄功能開發中）。';

/**
 * 繳費公告的預設有效期
 * ─────────────────────
 * 付款記錄未開發前, 繳費公告無法知道真實的帳單週期 →
 * 先給一個「不會意外過期」的長窗口 (今天 → 一年後),
 * 避免管理員發佈後一個月公告就自動失效、對家長消失。
 * (到期日 / 逾期提醒改由付款記錄提供後, 這裡就不再生效。)
 */
export function getPaymentDefaultDates(): { startDate: string; endDate: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
