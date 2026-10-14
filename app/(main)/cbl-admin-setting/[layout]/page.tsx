'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Baby, Receipt, FileSpreadsheet, UserCog } from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useCblStats } from '../hooks/useCblStats';
import { StatCard, QuickAction } from '../components/Cards';
import { StudentsConsoleContent } from './students/StudentsConsoleContent';
import { AnnouncementsConsoleContent } from './announcements/AnnouncementsConsoleContent';
import type { Student, Parent, Bus as BusType, Announcement } from '@/lib/types';

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

  // ---- announcements data layer ----
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const clientId = user?.clientId || '';

  useEffect(() => {
    if (layout !== 'students') return;
    const load = () => {
      setStudents(STORAGE.students.getByClient(clientId));
      setParents(STORAGE.parents.getByClient(clientId));
      setBuses(STORAGE.buses.getByClient(clientId));
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-students-refresh', handler);
    return () => window.removeEventListener('cbl-students-refresh', handler);
  }, [layout, clientId]);

  useEffect(() => {
    if (layout !== 'announcements') return;
    const load = () => {
      setAnnouncements(STORAGE.announcements.getByClient(clientId));
    };
    load();
    const handler = () => load();
    window.addEventListener('cbl-announcements-refresh', handler);
    return () => window.removeEventListener('cbl-announcements-refresh', handler);
  }, [layout, clientId]);

  if (!user) return null;

  switch (layout) {
    case 'students':
      return (
        <StudentsConsoleContent
          students={students}
          parents={parents}
          buses={buses}
        />
      );

    case 'parents': {
      // /cbl-admin-setting/parents → 家長群組的頂層 landing page
      // 列出「子女」「付款記錄」兩個子模組的捷徑 + 即時概況
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">家長管理</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                管理家長帳號、子女綁定與付款記錄。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.parents}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">家長總數</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/40 shadow-sm">
              <p className="text-2xl font-bold text-blue-600">{stats.students}</p>
              <p className="text-sm text-blue-600/70">綁定子女</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900/40 shadow-sm">
              <p className="text-2xl font-bold text-green-600">—</p>
              <p className="text-sm text-green-600/70">本月已收</p>
            </div>
            <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-900/40 shadow-sm">
              <p className="text-2xl font-bold text-rose-600">—</p>
              <p className="text-sm text-rose-600/70">本月待收</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">子模組捷徑</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                href="/cbl-admin-setting/parents/childrens"
                className="group block p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Baby className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">子女</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">依家長檢視綁定子女資料</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/cbl-admin-setting/parents/payment"
                className="group block p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-900/20 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">付款記錄</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">應付 / 應收 / 完整記錄 / PDF</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      );
    }

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
      // 新路徑 /cbl-admin-setting/nannys
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">保姆管理</h2>
            <Link
              href="/settings/nannies"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              前往完整頁面 →
            </Link>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              管理保姆資料及校巴分配。
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.nannies}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">保姆總數</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{stats.nanniesAssigned}</p>
                <p className="text-sm text-green-600/70">已分配</p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-2xl font-bold text-amber-600">{stats.nanniesUnassigned}</p>
                <p className="text-sm text-amber-600/70">待分配</p>
              </div>
            </div>
          </div>
        </div>
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
        />
      );

    case 'site':
      // 舊路徑 /cbl-admin-setting/site → 改到 /cbl-admin-setting/site-tool
      if (typeof window !== 'undefined') router.replace('/cbl-admin-setting/site-tool');
      return null;

    case 'site-tool':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">網站設定</h2>
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
      // /cbl-admin-setting/user → 功能權限分配
      // 透過 switch button 把某些功能的權限給予其他可登入 user (不是設定自己的權限)
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">功能權限分配</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              透過 <span className="font-semibold text-blue-600 dark:text-blue-400">switch button</span>,
              把某些功能模組的權限「給予」其他可登入的用戶。
              <br />
              例如: 開放「報表下載」給某位保姆, 或開放「付款記錄查看」給某位家長。
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-5">
            {/* 模擬一個 user row, 每個 user 有多個功能 switch */}
            {[
              { name: '張小明 (保姆)',  email: 'zhang@cbl.com', enabled: true,  switches: { '查看行程': true, '打卡': true, '查看付款': false, '管理學生': false } },
              { name: '李大媽 (保姆)',  email: 'li@cbl.com',    enabled: true,  switches: { '查看行程': true, '打卡': true, '查看付款': true,  '管理學生': false } },
              { name: '陳爸爸 (家長)',  email: 'chen@parent.tw', enabled: false, switches: { '查看行程': true, '打卡': false, '查看付款': true, '管理學生': false } },
            ].map((u, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">可登入</span>
                    <button
                      type="button"
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        u.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                      )}
                      aria-label="切換登入權限"
                    >
                      <span className={cn(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                        u.enabled ? 'translate-x-5' : 'translate-x-1'
                      )} />
                    </button>
                  </div>
                </div>

                {/* 功能開關 grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                  {Object.entries(u.switches).map(([feature, on]) => (
                    <label key={feature} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-700/40 cursor-pointer">
                      <span className="text-xs text-slate-700 dark:text-slate-200">{feature}</span>
                      <button
                        type="button"
                        className={cn(
                          'relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0',
                          on ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                        )}
                        aria-label={`切換 ${feature}`}
                      >
                        <span className={cn(
                          'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                          on ? 'translate-x-3.5' : 'translate-x-0.5'
                        )} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-2 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
              這是 UI 預覽。完整的功能權限矩陣 (含 batch update / 角色預設 / 稽核日誌) 將於後續版本上線。
            </div>
          </div>
        </div>
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