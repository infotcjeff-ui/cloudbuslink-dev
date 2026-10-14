'use client';

import PortalSettings from '@/components/portal/PortalSettings';

/**
 * /nanny/settings — 保姆 portal 的設定頁。
 *
 * 只顯示: 編輯個人資料 + 登出 (付款與訂閱僅家長可見)。
 * 「我的班次」在 portal 首頁 (/nanny), 不在此重複列出。
 */
export default function NannySettingsPage() {
  return <PortalSettings />;
}