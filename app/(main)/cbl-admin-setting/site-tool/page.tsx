'use client';

/**
 * /cbl-admin-setting/site-tool → 網站設定主控台 (靜態路由覆蓋)
 *
 * 為什麼用靜態路由而不是走 [layout] 動態路由:
 * - 與 schedule/、academic-years/ 同理, 靜態路由優先級高於 [layout],
 *   可直接渲染新的三頁籤主控台, 不必動 [layout]/page.tsx 大檔。
 * - 舊的 [layout] 內 site-tool 摘要分支保留為 fallback, 不影響。
 */

import { SiteToolConsoleContent } from '../[layout]/site-tool/SiteToolConsoleContent';

export const dynamic = 'force-dynamic';

export default function CblAdminSiteToolPage() {
  return <SiteToolConsoleContent />;
}
