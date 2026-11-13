'use client';

// 強制 dynamic: 跳過 Next dev 的 static-paths-worker 對 vendor-chunks 的 require。
// 修正 dev 模式下進入 /cbl-admin-setting/[layout] 時反覆出現的
// "Cannot find module './vendor-chunks/next.js'" / '2884.js' 500 錯誤。
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { StudentsConsoleContent } from './students/StudentsConsoleContent';
import { AnnouncementsConsoleContent } from './announcements/AnnouncementsConsoleContent';
import { NannysConsoleContent } from './nannys/NannysConsoleContent';
import { ParentsConsoleContent } from './parents/ParentsConsoleContent';
import { ReportsConsoleContent } from './reports/ReportsConsoleContent';
import { UsersConsoleContent } from './user/UsersConsoleContent';
import { CompaniesConsoleContent } from './companies/CompaniesConsoleContent';
import { IncidentsConsoleContent } from './incidents/IncidentsConsoleContent';
import type { Student, Parent, Bus as BusType, Announcement, User, Driver, Nanny, Company, IncidentReport } from '@/lib/types';

/**
 * Dynamic [layout] 對應以下路徑 (頂層):
 *   /cbl-admin-setting                  → 概覽
 *   /cbl-admin-setting/parents          → 家長 (頂層 landing: 顯示子模組捷徑)
 *   /cbl-admin-setting/students         → 學生
 *   /cbl-admin-setting/nannys           → 保姆
 *   /cbl-admin-setting/reports          → 報表
 *   /cbl-admin-setting/user             → 用戶 (帳號管理 + 所屬機構)
 *   /cbl-admin-setting/announcements    → 公告
 *   /cbl-admin-setting/site-tool        → 網站設定 (摘要)
 *
 * 班次群組 (2026-11 已搬到 schedule 底下, 由 schedule/page.tsx + schedule/[sub]/page.tsx 處理):
 *   /cbl-admin-setting/schedule         → 班次
 *   /cbl-admin-setting/schedule/bus     → 校巴
 *   /cbl-admin-setting/schedule/routes  → 路線
 *   /cbl-admin-setting/schedule/drivers → 司機
 *
 * 巢狀子頁 (由 [layout]/[sub]/page.tsx 處理):
 *   /cbl-admin-setting/parents/childrens→ 家長 / 子女
 *   /cbl-admin-setting/parents/payment  → 家長 / 付款記錄
 *
 * 設計說明:
 * - 家長 是「頂層 landing」, 點 sidebar 進來時停在 /cbl-admin-setting/parents
 *   看到 stat cards + 子模組捷徑, 不再自動跳子頁
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
  // 共用: user 頁新增帳號時需要機構/公司列表 (「所屬機構」下拉)
  const [companies, setCompanies] = useState<Company[]>([]);

  // user 頁的子頁切換: 'accounts' = 帳號管理 (用戶·功能權限), 'companies' = 所屬機構 (公司)
  // ⚠️ 2026-11: 「所屬機構」tab 從 site-tool (網站設定) 搬到 user 底下 ——
  //    網站設定只剩「網站設定摘要」, 機構統一在用戶頁管理。
  const [userSubTab, setUserSubTab] = useState<'accounts' | 'companies'>('accounts');

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

  // ---- incidents data layer ----
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);

  const clientId = user?.clientId || '';

  /**
   * 跨機構角色 (system_admin / super_admin) 沒有自己的 clientId。
   * 公告是機構層級的資料, 但跨機構角色需要跨機構管理 → 看得到所有公告。
   */
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'system_admin';

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
      // 繳費公告的受眾選擇器需要家長清單
      setParents(
        isSuperAdmin
          ? STORAGE.parents.getAll()
          : clientId
          ? STORAGE.parents.getByClient(clientId)
          : [],
      );
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-announcements-refresh', handler);
    window.addEventListener('cbl-parents-refresh', handler);
    return () => {
      window.removeEventListener('cbl-announcements-refresh', handler);
      window.removeEventListener('cbl-parents-refresh', handler);
    };
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

  // incidents data layer — /cbl-admin-setting/incidents 保姆異常回報留底
  // 超管 (super_admin / system_admin) 看全部, 其他角色只看自己 clientId
  useEffect(() => {
    if (layout !== 'incidents') return;
    const load = () => {
      setIncidents(STORAGE.incidents.getVisible(clientId, isSuperAdmin));
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-incidents-refresh', handler);
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabaseIncidents } = await import('@/lib/supabase-incidents');
        const res = await supabaseIncidents.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[IncidentsConsole] sync failed:', res.error);
        } else if (!cancelled) {
          load();
        }
      } catch (e) {
        console.warn('[IncidentsConsole] sync error:', e);
      }
    };
    pull();
    return () => {
      cancelled = true;
      window.removeEventListener('cbl-incidents-refresh', handler);
    };
  }, [layout, clientId, isSuperAdmin]);

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
      setCompanies(STORAGE.companies.getAll());
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-users-refresh', handler);
    window.addEventListener('cbl-companies-refresh', handler);
    return () => {
      window.removeEventListener('cbl-users-refresh', handler);
      window.removeEventListener('cbl-companies-refresh', handler);
    };
  }, [layout]);

  // 進「用戶」頁時從 Supabase 拉一次最新的帳號 (帳號 / 密碼 / 角色是安全相關資料,
  // 不能只靠 localStorage 的快取, 否則管理員改了密碼後這裡仍顯示舊資料)。
  // 同時同步機構 (cbl_companies) —— 「所屬機構」tab 已從 site-tool 搬到 user 底下 (2026-11),
  // 新增帳號的「所屬機構」下拉與機構列表都需要最新資料。
  useEffect(() => {
    if (layout !== 'user') return;
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabaseUsers } = await import('@/lib/supabase-users');
        const res = await supabaseUsers.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[UsersConsole] user sync failed:', res.error);
        } else if (!cancelled) {
          setUsers(STORAGE.users.getAll());
        }
      } catch (e) {
        console.warn('[UsersConsole] user sync error:', e);
      }
      // 同步拉取公司層 (cbl_companies)
      try {
        const { supabaseCompanies } = await import('@/lib/supabase-companies');
        const res = await supabaseCompanies.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[CompaniesConsole] company sync failed:', res.error);
        } else if (!cancelled) {
          setCompanies(STORAGE.companies.getAll());
        }
      } catch (e) {
        console.warn('[CompaniesConsole] company sync error:', e);
      }
    };
    pull();
    return () => {
      cancelled = true;
    };
  }, [layout]);

  // site-tool data layer — 「網站設定」頁只剩摘要 (Logo/主色/聯絡資訊, 由 useSettings 提供),
  // 機構 (公司) 列表已搬到 user 底下 (2026-11), 這裡不再載入 companies/users。
  // ⚠️ 雖然「所屬學校」tab 已移除, 這裡仍同步 cbl_clients —— 其他頁面
  //    (學年管理 / 各資料頁) 都依賴 localStorage 的 cbl_clients。
  useEffect(() => {
    if (layout !== 'site-tool') return;
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabaseClients } = await import('@/lib/supabase-clients');
        const res = await supabaseClients.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[ClientsConsole] client sync failed:', res.error);
        }
      } catch (e) {
        console.warn('[ClientsConsole] client sync error:', e);
      }
    };
    pull();

    return () => {
      cancelled = true;
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

    case 'bus':
      // 舊路徑 /cbl-admin-setting/bus → 校巴頁已搬到班次群組底下
      // /cbl-admin-setting/schedule/bus (2026-11)
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/schedule/bus');
      return null;

    case 'buses':
      // 舊路徑 /cbl-admin-setting/buses → 改到 /cbl-admin-setting/schedule/routes
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/schedule/routes');
      return null;

    case 'drivers':
      // 舊路徑 /cbl-admin-setting/drivers → 改到 /cbl-admin-setting/schedule/drivers
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/schedule/drivers');
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
      // /cbl-admin-setting/reports → OneFleet 報表主控台 (與 /students 同級)
      return (
        <ReportsConsoleContent
          clientId={clientId}
          isSuperAdmin={isSuperAdmin}
        />
      );

    case 'announcements':
      return (
        <AnnouncementsConsoleContent
          announcements={announcements}
          clientId={clientId}
          parents={parents}
        />
      );

    case 'site':
      // 舊路徑 /cbl-admin-setting/site → 改到 /cbl-admin-setting/site-tool
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/site-tool');
      return null;

    case 'site-tool':
      // /cbl-admin-setting/site-tool → 網站設定摘要 (目前機構的 Logo/主色/聯絡資訊)
      // ⚠️ 「所屬機構 (公司)」tab 已搬到 /cbl-admin-setting/user 底下 (2026-11) ——
      //    cbl_companies 改為由用戶頁統一管理; 「所屬學校 (機構)」tab 更早已移除,
      //    cbl_clients 改為由資料頁自動沿用。
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">網站設定</h2>
            </div>
            <Link
              href="/settings/site"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              前往完整頁面 →
            </Link>
          </div>

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
        </div>
      );

    case 'user':
      // /cbl-admin-setting/user → 帳號管理 + 所屬機構 (公司)
      // 透過 switch button 把某些功能的權限給予其他可登入 user (不是設定自己的權限);
      // 「所屬機構」tab 於 2026-11 從 site-tool 搬到這裡, 與帳號的新增「所屬機構」下拉共用同一份 companies。
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">用戶</h2>
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:bg-slate-800 dark:border-slate-700">
                {(
                  [
                    { value: 'accounts', label: '帳號管理' },
                    { value: 'companies', label: '所屬機構' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUserSubTab(opt.value)}
                    aria-pressed={userSubTab === opt.value}
                    className={
                      userSubTab === opt.value
                        ? 'px-2.5 h-7 text-[11px] font-medium rounded-[5px] bg-blue-600 text-white shadow-sm transition-colors cursor-pointer'
                        : 'px-2.5 h-7 text-[11px] font-medium rounded-[5px] text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 transition-colors cursor-pointer'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {userSubTab === 'companies' ? (
            <CompaniesConsoleContent
              companies={companies}
              userCountByCompany={userCountByCompany}
            />
          ) : (
            <UsersConsoleContent
              users={users}
              companies={companies}
              currentUserId={user?.id}
              currentUserRole={user?.role}
            />
          )}
        </div>
      );

    case 'incidents':
      // /cbl-admin-setting/incidents → 保姆異常回報留底 (保姆 popup 送出即寫一筆)
      return (
        <IncidentsConsoleContent
          incidents={incidents}
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