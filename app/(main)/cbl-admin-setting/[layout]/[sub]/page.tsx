'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Baby, Receipt, FileSpreadsheet, UserCog, MapPin, Banknote,
  Clock, Wrench, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { useCblStats } from '../../hooks/useCblStats';
import { StatCard } from '../../components/Cards';
import { TripsConsoleContent } from '../../bus/trips/TripsConsoleContent';
import type { Route } from '@/lib/types';

/**
 * 巢狀 sub-page: 處理 /cbl-admin-setting/{layout}/{sub} 路徑
 *
 * 目前 sub 路徑:
 *   - bus/trips          → 校巴 / 路線 (related to 校巴)
 *   - bus/drivers        → 校巴 / 司機 (related to 校巴)
 *   - parents/childrens  → 家長 / 子女 (related to 家長, 路線)
 *   - parents/payment    → 家長 / 付款記錄 (應付未付, 應收未收, 完整 record, 即時 preview PDF)
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
      comingSoon: true,
    };
  }

  if (layout === 'parents' && sub === 'childrens') {
    return {
      title: '子女',
      description: '家長頁面下的子女檢視, 資料與 /cbl-admin-setting/students 同步, 此處只讀。',
      breadcrumb: [
        { label: '家長', path: '/cbl-admin-setting/parents' },
        { label: '子女' },
      ],
      features: [
        { icon: Baby,   label: '學生清單',     desc: '依家長檢視綁定的子女資料' },
        { icon: MapPin, label: '路線資訊',     desc: '每個子女對應的校巴路線與上下車點' },
        { icon: ShieldCheck, label: '監護人', desc: '緊急聯絡人 / 監護人權限檢視' },
      ],
      comingSoon: true,
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
  const [routes, setRoutes] = useState<Route[]>([]);
  const clientId = user?.clientId || '';

  useEffect(() => {
    const layout = (params?.layout as string) ?? '';
    const sub = (params?.sub as string) ?? '';
    if (layout !== 'bus' || sub !== 'trips') return;
    const load = () => {
      setRoutes(STORAGE.routes.getByClient(clientId));
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-routes-refresh', handler);
    return () => window.removeEventListener('cbl-routes-refresh', handler);
  }, [params?.layout, params?.sub, clientId]);

  const layout = (params?.layout as string) ?? '';
  const sub = (params?.sub as string) ?? '';
  const meta = getSubPageMeta(layout, sub);

  if (!user) return null;

  // 未匹配的 sub, 導回對應 group landing (或 overview)
  if (!meta) {
    const fallback =
      layout === 'bus' ? '/cbl-admin-setting/bus/trips' :
      layout === 'parents' ? '/cbl-admin-setting/parents/childrens' :
      '/cbl-admin-setting';
    if (typeof window !== 'undefined') router.replace(fallback);
    return null;
  }

  // ---- bus/trips: 自刻 console (OneFleet-style) ----
  if (meta.customConsole && layout === 'bus' && sub === 'trips') {
    return (
      <TripsConsoleContent
        routes={routes}
        buses={STORAGE.buses.getByClient(clientId)}
        drivers={STORAGE.drivers.getByClient(clientId)}
        nannies={STORAGE.nannies.getByClient(clientId)}
        students={STORAGE.students.getByClient(clientId)}
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
