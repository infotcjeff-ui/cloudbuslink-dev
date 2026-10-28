'use client';

// 強制 dynamic: 跳過 Next dev 的 static-paths-worker 對 vendor-chunks 的 require。
// 修正 dev 模式下進入 /cbl-admin-setting/[layout] 時反覆出現的
// "Cannot find module './vendor-chunks/next.js'" / '2884.js' 500 錯誤。
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileSpreadsheet, UserCog } from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { useCblStats } from '../hooks/useCblStats';
import { StudentsConsoleContent } from './students/StudentsConsoleContent';
import { AnnouncementsConsoleContent } from './announcements/AnnouncementsConsoleContent';
import { NannysConsoleContent } from './nannys/NannysConsoleContent';
import { ParentsConsoleContent } from './parents/ParentsConsoleContent';
import { UsersConsoleContent } from './user/UsersConsoleContent';
import { ClientsConsoleContent } from './clients/ClientsConsoleContent';
import { CompaniesConsoleContent } from './companies/CompaniesConsoleContent';
import type { Student, Parent, Bus as BusType, Announcement, User, Driver, Nanny, Client, Company } from '@/lib/types';

/**
 * Dynamic [layout] 對應以下路徑 (頂層):
 *   /cbl-admin-setting                  → 概覽
 *   /cbl-admin-setting/bus              → 校巴 (頂層 landing: 顯示子模組捷徑)
 *   /cbl-admin-setting/parents          → 家長 (頂層 landing: 顯示子模組捷徑)
 *   /cbl-admin-setting/students         → 學生
 *   /cbl-admin-setting/nannys           → 保姆
 *   /cbl-admin-setting/reports          → 報表
 *   /cbl-admin-setting/user             → 用戶
 *   /cbl-admin-setting/announcements    → 公告
 *   /cbl-admin-setting/site-tool        → 網站設定
 *
 * 巢狀子頁 (由 [layout]/[sub]/page.tsx 處理):
 *   /cbl-admin-setting/bus/trips        → 校巴 / 路線
 *   /cbl-admin-setting/bus/drivers      → 校巴 / 司機
 *   /cbl-admin-setting/parents/childrens→ 家長 / 子女
 *   /cbl-admin-setting/parents/payment  → 家長 / 付款記錄
 *
 * 設計說明:
 * - 校巴 / 家長 是「頂層 landing」, 點 sidebar 進來時停在 /cbl-admin-setting/bus
 *   或 /cbl-admin-setting/parents, 看到 stat cards + 子模組捷徑, 不再自動跳子頁
 * - 之所以仍保留這個 dynamic page (而不是改成 named folders):
 *   - 全部子頁面共用同一個 layout.tsx (sidebar + header)
 *   - 內容集中方便維護
 *   - 舊路徑 (例如 /buses, /drivers) 統一在此做 redirect 兼容
 */
export default function CblAdminTabPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { settings: siteSettings } = useSettings(user?.clientId);
  const stats = useCblStats(user?.clientId);

  const layout = (params?.layout as string) ?? '';

  // ---- students-only data layer (hook order is preserved across switch) ----
  // 為什麼用頂層 hooks 而不是 switch case 內: Rules of Hooks 要求 hook 順序一致。
  // 用 ref 控制只在 case='students' 載入, 不影響其他 case 渲染。
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [buses, setBuses] = useState<BusType[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // ---- nannies-only data layer ----
  const [nannies, setNannies] = useState<Nanny[]>([]);
  // 共用: nannys 頁需要全部 user (供檢視 popup 與「是否登入帳號」標記)
  const [users, setUsers] = useState<User[]>([]);
  // 共用: user 頁新增帳號時需要學校列表 (「所屬學校」下拉)
  const [clients, setClients] = useState<Client[]>([]);
  // 共用: user 頁新增帳號時需要機構/公司列表 (「所屬機構」下拉)
  const [companies, setCompanies] = useState<Company[]>([]);

  // site-tool 頁的子頁切換: 'clients' = 機構管理 (學校, 預設), 'companies' = 所屬機構 (公司), 'overview' = 網站設定摘要
  const [siteTab, setSiteTab] = useState<'clients' | 'companies' | 'overview'>('clients');

  // 各機構底下的登入帳號數 — 給機構列表的「帳號」欄位
  const userCountByClient = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => {
      if (u.clientId) counts[u.clientId] = (counts[u.clientId] ?? 0) + 1;
    });
    return counts;
  }, [users]);

  // 各公司底下的登入帳號數 — 給「所屬機構」列表的「帳號」欄位
  const userCountByCompany = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => {
      if (u.companyId) counts[u.companyId] = (counts[u.companyId] ?? 0) + 1;
    });
    return counts;
  }, [users]);

  // ---- announcements data layer ----
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const clientId = user?.clientId || '';

  /**
   * 跨機構角色 (system_admin / super_admin) 沒有自己的 clientId。
   * 公告是機構層級的資料, 但跨機構角色需要跨機構管理 → 看得到所有公告,
   * 發佈時則必須指定「目標機構」(cbl_announcements.client_id 有 FK 約束)。
   */
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'system_admin';

  /** 可發佈的機構清單 (給 super_admin 選目標機構) */
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (layout !== 'announcements') return;
    const loadClients = () =>
      setClientOptions(
        STORAGE.clients.getAll().map((c) => ({ id: c.id, name: c.name })),
      );
    loadClients();
    window.addEventListener('cbl-clients-refresh', loadClients);
    return () => window.removeEventListener('cbl-clients-refresh', loadClients);
  }, [layout]);

  useEffect(() => {
    if (layout !== 'students') return;
    const load = () => {
      // 超管 (super_admin / system_admin) 沒有自己的 clientId → 讀全部 (跨機構管理)
      if (isSuperAdmin) {
        setStudents(STORAGE.students.getAll());
        setParents(STORAGE.parents.getAll());
        setBuses(STORAGE.buses.getAll());
        setDrivers(STORAGE.drivers.getAll());
      } else {
        setStudents(clientId ? STORAGE.students.getByClient(clientId) : []);
        setParents(clientId ? STORAGE.parents.getByClient(clientId) : []);
        setBuses(clientId ? STORAGE.buses.getByClient(clientId) : []);
        setDrivers(clientId ? STORAGE.drivers.getByClient(clientId) : []);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-students-refresh', handler);
    window.addEventListener('cbl-parents-refresh', handler);
    window.addEventListener('cbl-buses-refresh', handler);
    window.addEventListener('cbl-drivers-refresh', handler);
    return () => {
      window.removeEventListener('cbl-students-refresh', handler);
      window.removeEventListener('cbl-parents-refresh', handler);
      window.removeEventListener('cbl-buses-refresh', handler);
      window.removeEventListener('cbl-drivers-refresh', handler);
    };
  }, [layout, clientId, isSuperAdmin]);

  useEffect(() => {
    if (layout !== 'announcements') return;
    const load = () => {
      // super_admin 看得到所有機構的公告 (跨機構管理需求)
      setAnnouncements(
        STORAGE.announcements.getVisible(clientId, isSuperAdmin),
      );
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-announcements-refresh', handler);
    return () => window.removeEventListener('cbl-announcements-refresh', handler);
  }, [layout, clientId, isSuperAdmin]);

  // 進「公告」頁時從 Supabase 拉一次最新公告 (localStorage 只是快取)。
  // 公告現在是存在 DB 的, 其他管理員/裝置改過之後, 這裡必須重新拉,
  // 否則會看到舊資料。
  useEffect(() => {
    if (layout !== 'announcements') return;
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabaseAnnouncements } = await import('@/lib/supabase-announcements');
        const res = await supabaseAnnouncements.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[AnnouncementsConsole] sync failed:', res.error);
        }
      } catch (e) {
        console.warn('[AnnouncementsConsole] sync error:', e);
      }
    };
    pull();
    return () => { cancelled = true; };
  }, [layout]);

  // nannys data layer — 同樣遵守 Rules of Hooks, 頂層呼叫 effect
  // 超管 (super_admin / system_admin) 沒有 clientId → 讀全部 (跨機構管理)
  useEffect(() => {
    if (layout !== 'nannys') return;
    const load = () => {
      if (isSuperAdmin) {
        setNannies(STORAGE.nannies.getAll());
        setBuses(STORAGE.buses.getAll());
      } else {
        setNannies(clientId ? STORAGE.nannies.getByClient(clientId) : []);
        setBuses(clientId ? STORAGE.buses.getByClient(clientId) : []);
      }
      setUsers(STORAGE.users.getAll());
    };
    load();
    const handler = () => load();
    // 保姆事件有兩種拼法並存 → 兩種都要監聽 (nannys 頁是 cbl-nannys-*)
    window.addEventListener('cbl-nannys-refresh', handler);
    window.addEventListener('cbl-nannies-refresh', handler);
    window.addEventListener('cbl-buses-refresh', handler);
    window.addEventListener('cbl-users-refresh', handler);
    return () => {
      window.removeEventListener('cbl-nannys-refresh', handler);
      window.removeEventListener('cbl-nannies-refresh', handler);
      window.removeEventListener('cbl-buses-refresh', handler);
      window.removeEventListener('cbl-users-refresh', handler);
    };
  }, [layout, clientId, isSuperAdmin]);

  // user data layer — /cbl-admin-setting/user 需要完整的使用者清單 (含 super_admin,
  // 這種沒有 clientId 的帳號), 所以不能用 getByClient 過濾, 直接 getAll()。
  // 注意: 這層 effect 一定要獨立存在 — 之前 setUsers 只在 nannys / parents 的
  // effect 內被呼叫, 導致 case 'user' 永遠拿到空陣列 (使用者看不到自己的帳號)。
  useEffect(() => {
    if (layout !== 'user') return;
    const load = () => {
      setUsers(STORAGE.users.getAll());
      setClients(STORAGE.clients.getAll());
      setCompanies(STORAGE.companies.getAll());
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-users-refresh', handler);
    window.addEventListener('cbl-clients-refresh', handler);
    window.addEventListener('cbl-companies-refresh', handler);
    return () => {
      window.removeEventListener('cbl-users-refresh', handler);
      window.removeEventListener('cbl-clients-refresh', handler);
      window.removeEventListener('cbl-companies-refresh', handler);
    };
  }, [layout]);

  // 進「用戶」頁時從 Supabase 拉一次最新的帳號 (帳號 / 密碼 / 角色是安全相關資料,
  // 不能只靠 localStorage 的快取, 否則管理員改了密碼後這裡仍顯示舊資料)。
  useEffect(() => {
    if (layout !== 'user') return;
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabaseUsers } = await import('@/lib/supabase-users');
        const res = await supabaseUsers.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[UsersConsole] user sync failed:', res.error);
        }
      } catch (e) {
        console.warn('[UsersConsole] user sync error:', e);
      }
    };
    pull();
    return () => {
      cancelled = true;
    };
  }, [layout]);

  // site-tool data layer — 「網站設定」頁需要機構列表 (租戶根) + 帳號數統計
  useEffect(() => {
    if (layout !== 'site-tool') return;
    const load = () => {
      setClients(STORAGE.clients.getAll());
      setCompanies(STORAGE.companies.getAll());
      setUsers(STORAGE.users.getAll());
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-clients-refresh', handler);
    window.addEventListener('cbl-companies-refresh', handler);
    window.addEventListener('cbl-users-refresh', handler);

    // 進頁時從 Supabase 拉一次最新的機構 (localStorage 只是快取,
    // 後台改過機構名稱/狀態後, 這裡仍顯示舊資料)
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabaseClients } = await import('@/lib/supabase-clients');
        const res = await supabaseClients.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[ClientsConsole] client sync failed:', res.error);
        } else if (!cancelled) {
          load();
        }
      } catch (e) {
        console.warn('[ClientsConsole] client sync error:', e);
      }
      // 同步拉取公司層 (cbl_companies) — 失敗不影響機構 (學校) 列表
      try {
        const { supabaseCompanies } = await import('@/lib/supabase-companies');
        const res = await supabaseCompanies.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[CompaniesConsole] company sync failed:', res.error);
        } else if (!cancelled) {
          load();
        }
      } catch (e) {
        console.warn('[CompaniesConsole] company sync error:', e);
      }
    };
    pull();

    return () => {
      cancelled = true;
      window.removeEventListener('cbl-clients-refresh', handler);
      window.removeEventListener('cbl-companies-refresh', handler);
      window.removeEventListener('cbl-users-refresh', handler);
    };
  }, [layout]);

  // parents data layer
  useEffect(() => {
    if (layout !== 'parents') return;
    const load = () => {
      // 超管沒有自己的 clientId → 讀全部 (跨機構管理)
      if (isSuperAdmin) {
        setParents(STORAGE.parents.getAll());
        setStudents(STORAGE.students.getAll());
        setBuses(STORAGE.buses.getAll());
      } else {
        setParents(clientId ? STORAGE.parents.getByClient(clientId) : []);
        setStudents(clientId ? STORAGE.students.getByClient(clientId) : []);
        setBuses(clientId ? STORAGE.buses.getByClient(clientId) : []);
      }
      setUsers(STORAGE.users.getAll());
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-parents-refresh', handler);
    window.addEventListener('cbl-students-refresh', handler);
    window.addEventListener('cbl-buses-refresh', handler);
    window.addEventListener('cbl-drivers-refresh', handler);
    return () => {
      window.removeEventListener('cbl-parents-refresh', handler);
      window.removeEventListener('cbl-students-refresh', handler);
      window.removeEventListener('cbl-buses-refresh', handler);
      window.removeEventListener('cbl-drivers-refresh', handler);
    };
  }, [layout, clientId, isSuperAdmin]);

  if (!user) return null;

  switch (layout) {
    case 'students':
      return (
        <StudentsConsoleContent
          students={students}
          parents={parents}
          buses={buses}
          drivers={drivers}
        />
      );

    case 'parents':
      // /cbl-admin-setting/parents → 家長主控台 (與 /students 同級, 使用 parentsconsoleContent 顯示清單)
      // 透過 /cbl-parents 群組頂層的「付款記錄」連結 (sidebar children) 仍可達子頁。
      return (
        <ParentsConsoleContent
          parents={parents}
          students={students}
          buses={buses}
          users={users}
        />
      );

    case 'bus': {
      // /cbl-admin-setting/bus → 校巴群組的頂層 landing page
      // 列出「路線」「司機」兩個子模組的捷徑 + 即時概況
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">校巴管理</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                管理校巴路線、班次、司機值勤與校巴狀態。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.buses}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">校巴總數</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900/40 shadow-sm">
              <p className="text-2xl font-bold text-green-600">{stats.busesActive}</p>
              <p className="text-sm text-green-600/70">運行中</p>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-900/40 shadow-sm">
              <p className="text-2xl font-bold text-amber-600">{stats.busesMaintenance}</p>
              <p className="text-sm text-amber-600/70">維護中</p>
            </div>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm">
              <p className="text-2xl font-bold text-indigo-600">{stats.totalTrips}</p>
              <p className="text-sm text-indigo-600/70">總班次</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">子模組捷徑</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                href="/cbl-admin-setting/bus/trips"
                className="group block p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">路線</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">站點、班次、學生名單</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/cbl-admin-setting/bus/drivers"
                className="group block p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <UserCog className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">司機</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">駕照、值勤、校巴指派</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    case 'buses':
      // 舊路徑 /cbl-admin-setting/buses → 改到 /cbl-admin-setting/bus/trips
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/bus/trips');
      return null;

    case 'drivers':
      // 舊路徑 /cbl-admin-setting/drivers → 改到 /cbl-admin-setting/bus/drivers
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/bus/drivers');
      return null;

    case 'nannies':
      // 舊路徑 /cbl-admin-setting/nannies → 改到 /cbl-admin-setting/nannys
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/nannys');
      return null;

    case 'nannys':
      // /cbl-admin-setting/nannys → 與 /students 同級的「保姆管理」頁面
      return (
        <NannysConsoleContent
          nannies={nannies}
          buses={buses}
          users={users}
        />
      );

    case 'reports':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">行程報表</h2>
            <Link
              href="/settings/reports"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              前往完整頁面 →
            </Link>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              匯出 Excel 格式的行程報表及學生出席統計。
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalTrips}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">總班次</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{stats.attendanceRate}%</p>
                <p className="text-sm text-green-600/70">出席率</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{stats.totalAttendance}</p>
                <p className="text-sm text-blue-600/70">總接送記錄</p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{stats.activeTrips}</p>
                <p className="text-sm text-purple-600/70">進行中</p>
              </div>
            </div>
          </div>
        </div>
      );

    case 'announcements':
      return (
        <AnnouncementsConsoleContent
          announcements={announcements}
          clientId={clientId}
          isSuperAdmin={isSuperAdmin}
          clients={clientOptions}
        />
      );

    case 'site':
      // 舊路徑 /cbl-admin-setting/site → 改到 /cbl-admin-setting/site-tool
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/site-tool');
      return null;

    case 'site-tool':
      // /cbl-admin-setting/site-tool → 網站設定
      // 兩個子頁: 機構管理 (租戶根, 新增/編輯機構) + 網站設定摘要 (目前機構的 Logo/主色/聯絡資訊)
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">網站設定</h2>
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:bg-slate-800 dark:border-slate-700">
                {(
                  [
                    { value: 'clients', label: '所屬學校' },
                    { value: 'companies', label: '所屬機構' },
                    { value: 'overview', label: '網站設定' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSiteTab(opt.value)}
                    aria-pressed={siteTab === opt.value}
                    className={
                      siteTab === opt.value
                        ? 'px-2.5 h-7 text-[11px] font-medium rounded-[5px] bg-blue-600 text-white shadow-sm transition-colors cursor-pointer'
                        : 'px-2.5 h-7 text-[11px] font-medium rounded-[5px] text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 transition-colors cursor-pointer'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <Link
              href="/settings/site"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              前往完整頁面 →
            </Link>
          </div>

          {siteTab === 'clients' ? (
            <ClientsConsoleContent
              clients={clients}
              userCountByClient={userCountByClient}
            />
          ) : siteTab === 'companies' ? (
            <CompaniesConsoleContent
              companies={companies}
              userCountByCompany={userCountByCompany}
            />
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <p className="text-slate-600 dark:text-slate-300 mb-4">
                設定公司資料、Logo、主題色及聯絡資訊。
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">公司名稱</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{siteSettings?.title || 'CloudBusLink'}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">主題色</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: siteSettings?.primaryColor || '#3b82f6' }}></div>
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{siteSettings?.primaryColor || '#3b82f6'}</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">聯絡電話</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{siteSettings?.phone || '未設定'}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Email</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{siteSettings?.email || '未設定'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      );

    case 'user':
      // /cbl-admin-setting/user → 功能權限分配 + 帳號管理
      // 透過 switch button 把某些功能的權限給予其他可登入 user (不是設定自己的權限)
      return (
        <UsersConsoleContent
          users={users}
          clients={clients}
          companies={companies}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      );

    case 'organizations':
      // 舊路徑 /cbl-admin-setting/organizations → 從 menu 移除, 導回 overview
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting');
      return null;

    case 'extensions':
      // 舊路徑 /cbl-admin-setting/extensions → 從 menu 移除, 導回 overview
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting');
      return null;

    default:
      // 未匹配的 layout, 導回 overview
      if (typeof window !== 'undefined') {
        router.replace('/cbl-admin-setting');
      }
      return null;
  }
}