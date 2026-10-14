'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { BusesConsoleContent } from './BusesConsoleContent';
import type { Bus, Driver, Student } from '@/lib/types';

/**
 * /cbl-admin-setting/bus → 校巴管理主控台
 *
 * 規格來源:
 *   - md/organizations-page-style-reference.md (沿用 /students 設計語言)
 *   - md/vehicles-page-documentation.md
 *
 * 設計語言與 /cbl-admin-setting/[layout]/students/ 完全一致:
 *   - 5-layer vertical stack (Header / Toolbar / Table Card / Modals)
 *   - 共用 primitives (Pill / Button / Card / StatTile / FilterTabGroup)
 *   - 用 framer-motion 進出場 + AnimatePresence 三態切換
 *
 * 與 [layout]/page.tsx 的關係:
 *   /cbl-admin-setting/bus 本身有具名 page.tsx, 不會 fall through 到
 *   [layout]/page.tsx 的 'bus' case (那段保留做舊版 landing, 但已不再被觸發)。
 *
 * 資料流:
 *   - 透過 STORAGE 讀取真實資料
 *   - 監聽 cbl-buses-refresh / cbl-drivers-refresh / cbl-students-refresh
 *     三個事件, 任何一邊更新都可即時刷新頁面
 */

export default function CblAdminBusPage() {
  const { user } = useAuth();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const clientId = user?.clientId || '';

  useEffect(() => {
    if (!clientId) return;

    // 立即讀取一次 (首次 mount)
    setBuses(STORAGE.buses.getByClient(clientId));
    setDrivers(STORAGE.drivers.getByClient(clientId));
    setStudents(STORAGE.students.getByClient(clientId));

    // 校巴變更 (新增/編輯/刪除)
    const onBusesRefresh = () => {
      setBuses(STORAGE.buses.getByClient(clientId));
    };
    // 司機變更 (司機指派變動時)
    const onDriversRefresh = () => {
      setDrivers(STORAGE.drivers.getByClient(clientId));
    };
    // 學生變更 (解除綁定等連帶影響)
    const onStudentsRefresh = () => {
      setStudents(STORAGE.students.getByClient(clientId));
    };

    window.addEventListener('cbl-buses-refresh', onBusesRefresh);
    window.addEventListener('cbl-drivers-refresh', onDriversRefresh);
    window.addEventListener('cbl-students-refresh', onStudentsRefresh);
    return () => {
      window.removeEventListener('cbl-buses-refresh', onBusesRefresh);
      window.removeEventListener('cbl-drivers-refresh', onDriversRefresh);
      window.removeEventListener('cbl-students-refresh', onStudentsRefresh);
    };
  }, [clientId]);

  if (!user) return null;

  return (
    <BusesConsoleContent
      buses={buses}
      drivers={drivers}
      students={students}
    />
  );
}
