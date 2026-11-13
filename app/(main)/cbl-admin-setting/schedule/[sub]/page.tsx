'use client';

// 同上: 跳過 static-paths-worker 的 vendor-chunks race condition
export const dynamic = 'force-dynamic';

/**
 * /cbl-admin-setting/schedule/[sub] → 班次群組的子頁
 *
 * 目前支援的 sub:
 *   - bus     → 校巴  (BusesConsoleContent)
 *   - routes  → 路線  (TripsConsoleContent)
 *   - drivers → 司機  (DriversConsoleContent)
 *
 * 為什麼集中在這裡 (而不是三個各自的資料夾):
 *   - 三頁共用同一份「資料載入 + Supabase 同步 + refresh 事件監聽」邏輯,
 *     拆成三份必然會漂移 (例如某頁漏了 cbl-nannies-refresh 就會出現
 *     「跟車保姆顯示 undefined」)。
 *   - 內容 component 本身已各自獨立 (bus/、bus/trips/、bus/drivers/),
 *     這裡只負責組裝資料。
 *
 * 舊路徑相容 (見 [layout]/[sub]/page.tsx 的 redirect):
 *   - /cbl-admin-setting/bus/trips   → /cbl-admin-setting/schedule/routes
 *   - /cbl-admin-setting/bus/drivers → /cbl-admin-setting/schedule/drivers
 *   - /cbl-admin-setting/bus         → /cbl-admin-setting/schedule/bus
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { syncFromSupabase, isSupabaseAvailable } from '@/lib/supabase-data';

import { BusesConsoleContent } from '../../bus/BusesConsoleContent';
import { TripsConsoleContent } from '../../bus/trips/TripsConsoleContent';
import { DriversConsoleContent } from '../../bus/drivers/DriversConsoleContent';
import type { Route, Bus, Driver, Nanny, Student } from '@/lib/types';

type SubKey = 'bus' | 'routes' | 'drivers';

const SUB_KEYS: SubKey[] = ['bus', 'routes', 'drivers'];

export default function ScheduleSubPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const sub = ((params?.sub as string) ?? '').toLowerCase() as SubKey;
  const isValid = (SUB_KEYS as string[]).includes(sub);

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'system_admin';
  const clientId = isSuperAdmin ? '' : (user?.clientId || '');

  /**
   * 超管 (super_admin / system_admin) 沒有 clientId → 讀全部 (跨機構管理)。
   * 一般角色 → 只讀自己學校。
   */
  const resolveVisible = <T,>(getAll: () => T[], getByClient: (cid: string) => T[]): T[] => {
    if (isSuperAdmin) return getAll();
    if (!clientId) return [];
    return getByClient(clientId);
  };

  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [nannies, setNannies] = useState<Nanny[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // ---- 首次載入 + Supabase 同步 ----
  useEffect(() => {
    if (!user) return;
    if (!isSuperAdmin && !clientId) return;

    const load = () => {
      setRoutes(resolveVisible(() => STORAGE.routes.getAll(), (cid) => STORAGE.routes.getByClient(cid)));
      setBuses(resolveVisible(() => STORAGE.buses.getAll(), (cid) => STORAGE.buses.getByClient(cid)));
      setDrivers(resolveVisible(() => STORAGE.drivers.getAll(), (cid) => STORAGE.drivers.getByClient(cid)));
      setNannies(resolveVisible(() => STORAGE.nannies.getAll(), (cid) => STORAGE.nannies.getByClient(cid)));
      setStudents(resolveVisible(() => STORAGE.students.getAll(), (cid) => STORAGE.students.getByClient(cid)));
    };

    load();

    // 進場時拉一次雲端資料 (localStorage 只是快取)。
    // syncFromSupabase() 完成後會 dispatch cbl-*-refresh → 下面會自動重讀。
    let cancelled = false;
    const pull = async () => {
      if (!isSupabaseAvailable()) return;
      try {
        await syncFromSupabase();
        if (cancelled) return;
        // 保險 dispatch: 處理「sync 早於監聽器掛上」的情況
        window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-drivers-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-nannies-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-nannys-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
      } catch (e) {
        console.warn('[ScheduleSubPage] Supabase sync failed:', e);
      }
    };
    pull();

    const events = [
      'cbl-routes-refresh',
      'cbl-buses-refresh',
      'cbl-drivers-refresh',
      'cbl-nannies-refresh',
      'cbl-nannys-refresh',
      'cbl-students-refresh',
    ];
    events.forEach((ev) => window.addEventListener(ev, load));
    return () => {
      cancelled = true;
      events.forEach((ev) => window.removeEventListener(ev, load));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, clientId, isSuperAdmin]);

  // ---- 未匹配的 sub → 導回班次總覽 ----
  useEffect(() => {
    if (!isValid && typeof window !== 'undefined') {
      router.replace('/cbl-admin-setting/schedule');
    }
  }, [isValid, router]);

  if (!user) return null;
  if (!isValid) return null;

  if (sub === 'bus') {
    return (
      <BusesConsoleContent
        buses={buses}
        drivers={drivers}
        nannies={nannies}
        students={students}
      />
    );
  }

  if (sub === 'routes') {
    return (
      <TripsConsoleContent
        routes={routes}
        buses={buses}
        drivers={drivers}
        nannies={nannies}
        students={students}
      />
    );
  }

  return (
    <DriversConsoleContent
      drivers={drivers}
      buses={buses}
    />
  );
}
