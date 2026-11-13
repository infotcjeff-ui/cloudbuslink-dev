'use client';

// 同上: 跳過 static-paths-worker 的 vendor-chunks race condition
export const dynamic = 'force-dynamic';

/**
 * /cbl-admin-setting/bus → 舊路徑, 已搬到班次群組底下 (2026-11)
 *
 * 新的位置:
 *   - 校巴 → /cbl-admin-setting/schedule/bus
 *   - 路線 → /cbl-admin-setting/schedule/routes
 *   - 司機 → /cbl-admin-setting/schedule/drivers
 *
 * 保留這個具名 page.tsx 是因為具名資料夾的優先度高於 [layout]/page.tsx,
 * 沒有它的話 /cbl-admin-setting/bus 會被 [layout] 的 'bus' case 接走
 * (雖然那邊也已改成 redirect, 但兩邊都維護容易漂移)。
 */

import { useRouter } from 'next/navigation';

export default function LegacyBusPage() {
  const router = useRouter();
  if (typeof window !== 'undefined') {
    router.replace('/cbl-admin-setting/schedule/bus');
  }
  return null;
}
