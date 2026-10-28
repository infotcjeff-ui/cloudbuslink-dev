'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { syncFromSupabase, isSupabaseAvailable } from '@/lib/supabase-data';
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
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'system_admin';
  /** 超管沒有 clientId → 看全部 (跨機構管理), 一般角色只看自己學校 */
  const resolveAll = (getAll: () => Bus[] | Driver[] | Student[], getByClient: (cid: string) => any[]) => {
    try {
      const raw = localStorage.getItem('cbl_auth');
      const u = raw ? JSON.parse(raw) : null;
      const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
      if (superMode) return getAll() as any;
      const cid = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
      return cid ? getByClient(cid) : [];
    } catch {
      return [];
    }
  };
  // 同步初始化: client side 立即從 LocalStorage 讀取, 避免首次 mount 空閃
  const [buses, setBuses] = useState<Bus[]>(() =>
    resolveAll(STORAGE.buses.getAll.bind(STORAGE.buses), (cid) => STORAGE.buses.getByClient(cid)) as Bus[],
  );
  const [drivers, setDrivers] = useState<Driver[]>(() =>
    resolveAll(STORAGE.drivers.getAll.bind(STORAGE.drivers), (cid) => STORAGE.drivers.getByClient(cid)) as Driver[],
  );
  const [students, setStudents] = useState<Student[]>(() =>
    resolveAll(STORAGE.students.getAll.bind(STORAGE.students), (cid) => STORAGE.students.getByClient(cid)) as Student[],
  );
  const [isSyncing, setIsSyncing] = useState(true);

  const clientId = user?.clientId || '';

  /** 依目前登入者重讀 STORAGE (超管讀全部, 一般讀自己學校) */
  const reloadFromStorage = () => {
    try {
      const raw = localStorage.getItem('cbl_auth');
      const u = raw ? JSON.parse(raw) : null;
      const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
      if (superMode) {
        setBuses(STORAGE.buses.getAll());
        setDrivers(STORAGE.drivers.getAll());
        setStudents(STORAGE.students.getAll());
        return;
      }
      const cid = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
      if (!cid) return;
      setBuses(STORAGE.buses.getByClient(cid));
      setDrivers(STORAGE.drivers.getByClient(cid));
      setStudents(STORAGE.students.getByClient(cid));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    // 超管沒有 clientId 也要跑 (看全部), 一般角色才需要等 clientId
    if (!clientId && !isSuperAdmin) return;

    // 初始化時從 Supabase 同步資料 (如果可用)
    const initData = async () => {
      setIsSyncing(true);
      try {
        if (isSupabaseAvailable()) {
          await syncFromSupabase();
        }
      } catch (err) {
        console.warn('[BusPage] Supabase sync failed, using local data:', err);
      } finally {
        // 無論 Supabase 是否成功, 都從 LocalStorage 讀取 (超管看全部)
        reloadFromStorage();
        setIsSyncing(false);
      }
    };

    initData();

    // 校巴變更 (新增/編輯/刪除)
    const onBusesRefresh = () => {
      reloadFromStorage();
    };
    // 司機變更 (司機指派變動時)
    const onDriversRefresh = () => {
      reloadFromStorage();
    };
    // 學生變更 (解除綁定等連帶影響)
    const onStudentsRefresh = () => {
      reloadFromStorage();
    };

    window.addEventListener('cbl-buses-refresh', onBusesRefresh);
    window.addEventListener('cbl-drivers-refresh', onDriversRefresh);
    window.addEventListener('cbl-students-refresh', onStudentsRefresh);
    return () => {
      window.removeEventListener('cbl-buses-refresh', onBusesRefresh);
      window.removeEventListener('cbl-drivers-refresh', onDriversRefresh);
      window.removeEventListener('cbl-students-refresh', onStudentsRefresh);
    };
  }, [clientId, isSuperAdmin]);

  if (!user) return null;

  return (
    <BusesConsoleContent
      buses={buses}
      drivers={drivers}
      students={students}
    />
  );
}
