'use client';

/** Reports 頁面的類型定義 (only used inside /cbl-admin-setting/[layout]/reports) */

export type ReportTab = 'trips' | 'payments';

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  busId: string;
  status: string;
}
