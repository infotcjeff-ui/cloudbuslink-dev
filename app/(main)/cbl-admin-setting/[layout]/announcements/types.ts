'use client';

/** Announcements 頁面的類型定義 */

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
   * 目標機構 id (super_admin 必填)。
   *
   * 為什麼需要這個欄位:
   * - cbl_announcements.client_id 有 NOT NULL + FK 約束 (指向 cbl_clients.id)
   * - super_admin 自己沒有 clientId, 公告必須發佈給「某個」機構
   * - 沒有這個欄位 → super_admin 存檔時 clientId 會是空字串 → FK violation
   *
   * 非 super_admin (client / parent / nanny) 不需要這個欄位 —
   * 發佈目標自動就是自己的 clientId。
   */
  targetClientId: string;
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
  targetClientId: '',
};
