'use client';

// 同上: 跳過 static-paths-worker 的 vendor-chunks race condition
export const dynamic = 'force-dynamic';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Baby, Receipt, FileSpreadsheet, UserCog, MapPin, Banknote,
  Clock, Wrench, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { syncFromSupabase, isSupabaseAvailable } from '@/lib/supabase-data';
import { useCblStats } from '../../hooks/useCblStats';
import { StatCard } from '../../components/Cards';
import { TripsConsoleContent } from '../../bus/trips/TripsConsoleContent';
import { DriversConsoleContent } from '../../bus/drivers/DriversConsoleContent';
import type { Route, Bus, Driver, Nanny, Student } from '@/lib/types';

/**
 * 巢狀 sub-page: 處理 /cbl-admin-setting/{layout}/{sub} 路徑
 *
 * 目前 sub 路徑:
 *   - bus/trips          → 校巴 / 路線 (related to 校巴)
 *   - bus/drivers        → 校巴 / 司機 (related to 校巴)
 *   - parents/payment    → 家長 / 付款記錄 (應付未付, 應收未收, 完整 record, 即時 preview PDF)
 *
 * 注意: 「子女」子頁已移除 (子女資料統一在 /cbl-admin-setting/students 與
 * /cbl-admin-setting/parents 列表的「檢視」popup 內管理), 因此本檔不再處理
 * parents/childrens。
 *
 * 為什麼用 single dynamic [sub] 而不是 named folders:
 * - 全部子頁面共用同一個 layout.tsx (sidebar + header)
 * - 上層 [layout] 已 redirect group landing (例如 /bus → /bus/trips)
 * - 子頁面數量可能會增加, 集中在一個檔案方便維護
 */

type SubPageMeta = {
  title: string;
  description: string;
  features: { icon: any; label: string; desc: string }[];
  breadcrumb: { label: string; path?: string }[];
  comingSoon?: boolean;
  /** 標記此 sub 有自己專屬的 console component (e.g. bus/trips); 為 true 時
   *  render 時不走通用 meta 模板, 直接渲染對應 console。 */
  customConsole?: boolean;
};

function getSubPageMeta(layout: string, sub: string): SubPageMeta | null {
  if (layout === 'bus' && sub === 'trips') {
    return {
      title: '路線',
      description: '管理校巴路線、班次時間表、上下車站點與自動派車。',
      breadcrumb: [
        { label: '校巴', path: '/cbl-admin-setting/bus' },
        { label: '路線' },
      ],
      features: [
        { icon: MapPin,         label: '站點管理',     desc: '新增、編輯每條路線的上下車站點' },
        { icon: Clock,          label: '班次時間',     desc: '早上 / 下午 / 課後班次的發車時刻' },
        { icon: FileSpreadsheet,label: '路線清單',     desc: '檢視所有路線、校巴分配與學生名單' },
      ],
      // 有自刻的 TripsConsoleContent, render 時不走通用模板
      customConsole: true,
    };
  }

  if (layout === 'bus' && sub === 'drivers') {
    return {
      title: '司機',
      description: '管理司機資料、駕照有效期、排班, 以及校巴指派。',
      breadcrumb: [
        { label: '校巴', path: '/cbl-admin-setting/bus' },
        { label: '司機' },
      ],
      features: [
        { icon: UserCog, label: '司機檔案', desc: '聯絡資料、駕照類型、有效期提醒' },
        { icon: MapPin,  label: '排班',     desc: '綁定校巴 / 路線, 查看當週值勤表' },
        { icon: Wrench,  label: '狀態監控', desc: '可派 / 行駛中 / 休假 即時狀態' },
      ],
      // 有自刻的 DriversConsoleContent, render 時不走通用模板
      customConsole: true,
    };
  }

  if (layout === 'parents' && sub === 'childrens') {
    // 「子女」子頁已於 2026-10 移除 (子女資料統一在 /students 與 /parents 列表的
    // 「檢視」popup 內管理)。此處保留一個 redirect 兼容舊連結 (避免使用者收藏的 URL
    // 直接變 404), 重新導向到 /cbl-admin-setting/parents。
    if (typeof window !== 'undefined') {
      window.location.replace('/cbl-admin-setting/parents');
    }
    return {
      title: '子女',
      description: '已搬遷 — 請使用「家長」列表的「檢視」按鈕查看子女資料。',
      breadcrumb: [
        { label: '家長', path: '/cbl-admin-setting/parents' },
        { label: '子女 (已搬遷)' },
      ],
      features: [],
    };
  }

  if (layout === 'parents' && sub === 'payment') {
    return {
      title: '付款記錄',
      description: '家長 / 公司兩邊的財務記錄, 含應付未付、應收未收、完整交易歷史, 支援即時 PDF 預覽。',
      breadcrumb: [
        { label: '家長', path: '/cbl-admin-setting/parents' },
        { label: '付款記錄' },
      ],
      features: [
        { icon: Banknote,  label: '應付未付',     desc: '本月底前家長尚未繳費的應付帳單' },
        { icon: Receipt,   label: '應收未收',     desc: '已開立發票但公司尚未收款的紀錄' },
        { icon: FileSpreadsheet, label: '完整 record', desc: '依月份 / 家長 / 學生 篩選歷史付款' },
        { icon: FileSpreadsheet, label: '即時 PDF 預覽', desc: '收據 / 月結單 即時 preview, 一鍵下載' },
      ],
      comingSoon: true,
    };
  }

  return null;
}

export default function CblAdminSubPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { settings: siteSettings } = useSettings(user?.clientId);
  const stats = useCblStats(user?.clientId);

  // ---- bus/trips 頁面專用資料 (rule of hooks: 跟其他 hook 一起放在頂層) ----
  // 同步初始化: client side 立即從 LocalStorage 讀取, 避免首次 mount 空閃
  // 超管 (super_admin / system_admin) 沒有 clientId → 讀全部 (跨機構管理)
  const resolveVisibleInit = <T,>(getAll: () => T[], getByClient: (cid: string) => T[]): T[] => {
    try {
      const raw = localStorage.getItem('cbl_auth');
      const u = raw ? JSON.parse(raw) : null;
      const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
      if (superMode) return getAll();
      const cid = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
      return cid ? getByClient(cid) : [];
    } catch { return []; }
  };
  const [routes, setRoutes] = useState<Route[]>(() => {
    if (typeof window === 'undefined') return [];
    return resolveVisibleInit<Route>(() => STORAGE.routes.getAll(), (cid) => STORAGE.routes.getByClient(cid));
  });
  const [buses, setBuses] = useState<Bus[]>(() => {
    if (typeof window === 'undefined') return [];
    return resolveVisibleInit<Bus>(() => STORAGE.buses.getAll(), (cid) => STORAGE.buses.getByClient(cid));
  });
  const [drivers, setDrivers] = useState<Driver[]>(() => {
    if (typeof window === 'undefined') return [];
    return resolveVisibleInit<Driver>(() => STORAGE.drivers.getAll(), (cid) => STORAGE.drivers.getByClient(cid));
  });
  const [nannies, setNannies] = useState<Nanny[]>(() => {
    if (typeof window === 'undefined') return [];
    return resolveVisibleInit<Nanny>(() => STORAGE.nannies.getAll(), (cid) => STORAGE.nannies.getByClient(cid));
  });
  const [students, setStudents] = useState<Student[]>(() => {
    if (typeof window === 'undefined') return [];
    return resolveVisibleInit<Student>(() => STORAGE.students.getAll(), (cid) => STORAGE.students.getByClient(cid));
  });

  // clientId 解析: 超管沒有 clientId → 用 '' + superMode 旗標 (看全部);
  // 一般角色: 優先 user.clientId, fallback 到第一個 client
  const isSuperAdminSub = user?.role === 'super_admin' || user?.role === 'system_admin';
  const clientId = isSuperAdminSub ? '' : (user?.clientId || STORAGE.clients.getAll()[0]?.id || '');

  /**
   * 進場時從 Supabase 拉一次資料。
   *
   * 為什麼需要 (這是「編輯路線 → 跟車保姆顯示 undefined」的根因之一):
   *   這頁 (bus/trips、bus/drivers、parents/payment) 原本「只讀 localStorage」,
   *   從不向 Supabase 拉資料。相較之下 /cbl-admin-setting/bus 有自己呼叫
   *   syncFromSupabase()。
   *
   *   結果: 使用者若直接從登入後進到「路線」頁 (或 localStorage 還沒被
   *   登入頁的 initWithSupabase 填滿), cbl_nannies 是空的 →
   *   路線的 nannyId 找不到對應實體 → dropdown 只能顯示 id 殼 → "undefined · undefined"。
   *
   * 補充: syncFromSupabase() 完成後會 dispatch cbl-*-refresh 事件,
   *       下面的 reloadAll 會自動重讀, 所以這個 effect 只需負責「觸發同步」。
   */
  useEffect(() => {
    if (!isSupabaseAvailable()) return;
    let cancelled = false;
    const sync = async () => {
      try {
        await syncFromSupabase();
        if (cancelled) return;
        // sync 內部會 dispatch refresh 事件 → reloadAll 自動觸發。
        // 這裡再保險 dispatch 一次, 處理「sync 早於監聽器掛上」的情況。
        window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-nannies-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-nannys-refresh'));
      } catch (e) {
        console.warn('[CblAdminSubPage] Supabase sync failed:', e);
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const layout = (params?.layout as string) ?? '';
    const sub = (params?.sub as string) ?? '';

    // 通用資料載入 helper: 從 STORAGE 重新讀取所有相關資料
    // 超管讀全部 (getAll), 一般角色讀自己學校 (getByClient)
    // 注意: 用淺比較守衛 — 資料沒變就不 setState, 避免無謂重 render
    // (之前每次 event / 輪詢都直接 set 新 array, 表格會跟著閃一次)。
    const shallowSame = (a: { id: string }[], b: { id: string }[]) =>
      a.length === b.length && a.every((x, i) => x === b[i]);
    // 超管看全部 → clientId 為 '' 但 isSuperAdminSub 為 true 也要跑
    const visibleBuses = () =>
      isSuperAdminSub ? STORAGE.buses.getAll() : (clientId ? STORAGE.buses.getByClient(clientId) : []);
    const visibleDrivers = () =>
      isSuperAdminSub ? STORAGE.drivers.getAll() : (clientId ? STORAGE.drivers.getByClient(clientId) : []);
    const visibleNannies = () =>
      isSuperAdminSub ? STORAGE.nannies.getAll() : (clientId ? STORAGE.nannies.getByClient(clientId) : []);
    const visibleStudents = () =>
      isSuperAdminSub ? STORAGE.students.getAll() : (clientId ? STORAGE.students.getByClient(clientId) : []);
    const visibleRoutes = () =>
      isSuperAdminSub ? STORAGE.routes.getAll() : (clientId ? STORAGE.routes.getByClient(clientId) : []);
    const reloadAll = () => {
      if (!clientId && !isSuperAdminSub) return;
      setBuses((prev) => {
        const next = visibleBuses();
        return shallowSame(prev, next) ? prev : next;
      });
      setDrivers((prev) => {
        const next = visibleDrivers();
        return shallowSame(prev, next) ? prev : next;
      });
      setNannies((prev) => {
        const next = visibleNannies();
        return shallowSame(prev, next) ? prev : next;
      });
      setStudents((prev) => {
        const next = visibleStudents();
        return shallowSame(prev, next) ? prev : next;
      });
      if (layout === 'bus' && sub === 'trips') {
        setRoutes((prev) => {
          const next = visibleRoutes();
          return shallowSame(prev, next) ? prev : next;
        });
      }
    };

    // 首次載入
    reloadAll();

    // 監聽所有 cbl-*-refresh 事件, 任何資料同步完成都重新讀取
    // 解決: 使用者進入頁面時 Supabase 同步可能尚未完成, STORAGE 為空,
    // 等同步完成後 (syncFromSupabase dispatch events) 自動重新讀取,
    // 不必手動按「重新整理」按鈕。
    //
    // 注意: 輪詢 fallback 已移除 — 之前每 150ms reloadAll 一次、
    // 最多 5 秒, 每次都 set 新 array reference 觸發重 render,
    // 這正是切頁時多閃 1~2 次的主因。STORAGE.isInitialized() 完成時
    // 會 dispatch cbl-*-refresh, 只靠 event 就夠了。
    const events = [
      'cbl-drivers-refresh',
      'cbl-buses-refresh',
      'cbl-students-refresh',
      'cbl-parents-refresh',
      // 保姆事件有兩種拼法並存 → 兩種都要監聽, 否則收到一半的更新
      'cbl-nannies-refresh',
      'cbl-nannys-refresh',
      'cbl-trips-refresh',
      'cbl-routes-refresh',
      'cbl-attendances-refresh',
      'cbl-announcements-refresh',
      'cbl-clients-refresh',
      'cbl-users-refresh',
    ];
    events.forEach((ev) => window.addEventListener(ev, reloadAll));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reloadAll));
    };
  }, [params?.layout, params?.sub, clientId, isSuperAdminSub]);

  const layout = (params?.layout as string) ?? '';
  const sub = (params?.sub as string) ?? '';
  const meta = getSubPageMeta(layout, sub);

  if (!user) return null;

  // 未匹配的 sub, 導回對應 group landing (或 overview)
  if (!meta) {
    const fallback =
      layout === 'bus' ? '/cbl-admin-setting/bus/trips' :
      layout === 'parents' ? '/cbl-admin-setting/parents' :
      '/cbl-admin-setting';
    if (typeof window !== 'undefined') router.replace(fallback);
    return null;
  }

  // ---- bus/trips: 自刻 console (OneFleet-style) ----
  if (meta.customConsole && layout === 'bus' && sub === 'trips') {
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

  // ---- bus/drivers: 自刻 console (OneFleet-style) ----
  if (meta.customConsole && layout === 'bus' && sub === 'drivers') {
    return (
      <DriversConsoleContent
        drivers={drivers}
        buses={buses}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {meta.breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
            {b.path ? (
              <Link href={b.path} className="hover:text-blue-600 dark:hover:text-blue-400">
                {b.label}
              </Link>
            ) : (
              <span className="text-slate-700 dark:text-slate-200 font-medium">{b.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{meta.title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{meta.description}</p>
        </div>
      </div>

      {/* Quick stats — 子頁面用, 與 overview stats 區隔 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="相關學生"
          value={stats.students}
          icon={Baby}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          title="相關家長"
          value={stats.parents}
          icon={ShieldCheck}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          title="相關校巴"
          value={stats.buses}
          icon={FileSpreadsheet}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          title="本月待收"
          value="—"
          icon={Banknote}
          color="bg-rose-100 text-rose-600"
        />
      </div>

      {/* Features preview */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">功能模組</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meta.features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{f.label}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coming-soon banner */}
      {meta.comingSoon && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">即將推出</h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                這個頁面的完整 CRUD 介面、資料表格、批次操作以及匯出功能會在後續版本上線。
                目前先保留路由與 menu 結構以便日後無縫補上實作。
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Link
                  href="/settings/parents"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline"
                >
                  暫時可用完整頁面
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
