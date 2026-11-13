'use client';

// 同上: 跳過 static-paths-worker 的 vendor-chunks race condition
export const dynamic = 'force-dynamic';

/**
 * 巢狀 sub-page: 處理 /cbl-admin-setting/{layout}/{sub} 路徑
 *
 * 目前 sub 路徑:
 *   - parents/payment    → 家長 / 付款記錄 (應付未付, 應收未收, 完整 record, 即時 preview PDF)
 *
 * 注意 (2026-11):
 *   班次群組的子頁已搬到 /cbl-admin-setting/schedule/{sub} (由 schedule/[sub]/page.tsx 處理):
 *     - 校巴 → /cbl-admin-setting/schedule/bus
 *     - 路線 → /cbl-admin-setting/schedule/routes
 *     - 司機 → /cbl-admin-setting/schedule/drivers
 *   舊的 /cbl-admin-setting/bus/trips、/bus/drivers 會自動 redirect 去新路徑,
 *   避免使用者收藏的連結直接 404。
 *
 * 「子女」子頁已移除 (子女資料統一在 /cbl-admin-setting/students 與
 * /cbl-admin-setting/parents 列表的「檢視」popup 內管理), 因此本檔不再處理
 * parents/childrens。
 *
 * 為什麼用 single dynamic [sub] 而不是 named folders:
 * - 全部子頁面共用同一個 layout.tsx (sidebar + header)
 * - 子頁面數量可能會增加, 集中在一個檔案方便維護
 */

import * as React from 'react';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Baby, Receipt, FileSpreadsheet, Banknote,
  Clock, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { useCblStats } from '../../hooks/useCblStats';
import { StatCard } from '../../components/Cards';

type SubPageMeta = {
  title: string;
  description: string;
  features: { icon: any; label: string; desc: string }[];
  breadcrumb: { label: string; path?: string }[];
  comingSoon?: boolean;
};

function getSubPageMeta(layout: string, sub: string): SubPageMeta | null {
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

  const layout = (params?.layout as string) ?? '';
  const sub = (params?.sub as string) ?? '';
  const meta = getSubPageMeta(layout, sub);

  /**
   * 舊路徑相容 (2026-11): 班次群組的子頁搬到 /cbl-admin-setting/schedule/* 之後,
   * 舊的 /cbl-admin-setting/bus/trips、/bus/drivers 統一導去新路徑,
   * 避免使用者收藏的連結直接 404。
   */
  const legacyRedirect =
    layout === 'bus' && sub === 'trips' ? '/cbl-admin-setting/schedule/routes'
    : layout === 'bus' && sub === 'drivers' ? '/cbl-admin-setting/schedule/drivers'
    : null;

  useEffect(() => {
    if (!legacyRedirect) return;
    router.replace(legacyRedirect);
  }, [legacyRedirect, router]);

  if (!user) return null;

  if (legacyRedirect) return null;

  // 未匹配的 sub, 導回對應 group landing (或 overview)
  if (!meta) {
    const fallback =
      layout === 'bus' ? '/cbl-admin-setting/schedule/routes' :
      layout === 'parents' ? '/cbl-admin-setting/parents' :
      '/cbl-admin-setting';
    if (typeof window !== 'undefined') router.replace(fallback);
    return null;
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

      {/* Coming-soon banner
          ⚠️ 2026-11: 付款記錄頁的coming-soon 狀態同時是「繳費公告」的依賴 ——
             繳費公告的內容 / 類型 / 有效期 / 提醒次數都要由這頁的付款資料帶出。
             所以這裡寫清楚「開發中」而不是「即將推出」。 */}
      {meta.comingSoon && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">開發中</h3>
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-200/70 dark:bg-amber-900/60 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  <Clock className="w-2.5 h-2.5" />
                  Coming Soon
                </span>
              </div>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                這個頁面的完整 CRUD 介面、資料表格、批次操作以及匯出功能會在後續版本上線。
                目前先保留路由與 menu 結構以便日後無縫補上實作。
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1.5">
                <span className="font-semibold">繳費公告</span>
                的內容、類型、有效期與提醒次數會自動由這個頁面的付款資料帶出 ——
                在此功能完成前, 繳費公告只顯示「標題 + 指定家長」。
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
