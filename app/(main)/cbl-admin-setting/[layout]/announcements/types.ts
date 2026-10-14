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
};
