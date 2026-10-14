'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Sparkles, Activity, Sun, UserCircle2,
  MapPin, ChevronRight, Users, Bus, Baby, UserCheck,
  BarChart3, Megaphone, Wrench, FileSpreadsheet, Receipt,
  CalendarClock,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks';
import { useCblStats } from './hooks/useCblStats';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * /cbl-admin-setting → 概覽頁 (overview)
 *
 * 設計風格: 跟隨專案 design token
 * - 背景: bg-background (slate-100 light, slate-900 dark)
 * - 卡片: bg-card + border-border + rounded-2xl + shadow-sm
 * - 強調色: text-primary / bg-primary/10 (不超過 5% 面積)
 * - 排版: 跟專案其他 admin 頁面一致 — 不使用 cyberpunk 深色 hero
 *
 * 內容:
 *  1. Welcome hero  (淺色, 含 greeting + 即時時間 + 角色 chip)
 *  2. 4 格 quick-stat (用現有 useCblStats, 配色跟專案 StatCard 一致)
 *  3. 模組捷徑 grid (每個 menu tab 一張卡, 點擊直達)
 */

function roleLabel(role: string | undefined): string {
  switch ((role || '').toLowerCase()) {
    case 'super_admin':
    case 'admin':       return '系統管理員';
    case 'client':      return '客戶管理員';
    case 'parent':      return '家長';
    case 'attendant':
    case 'nanny':       return '保姆';
    case 'driver':      return '司機';
    default:            return '使用者';
  }
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5)  return '夜深了';
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

function todayStr(now: Date): string {
  return now.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export default function CblAdminOverviewPage() {
  const { user } = useAuth();
  const stats = useCblStats(user?.clientId);
  const [now, setNow] = useState<Date | null>(null);

  // 避免 SSR/CSR hydration mismatch: 只在 client mount 後才 set time
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!user) return null;

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const role = roleLabel(user.role);

  return (
    <div className="space-y-6">
      {/* ============================================================
          1. Welcome Hero — 淺色, 用 project token, 不走 dark cyberpunk
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        {/* 淡漸層 — 從 primary-50 過渡到 white, 維持整體明亮的 project 風格 */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(135deg, hsl(217 91% 60% / 0.06) 0%, hsl(0 0% 100%) 60%)',
          }}
        />
        {/* 右上角淡淡的裝飾光暈 — 比 cyberpunk 收斂很多, 只是淡淡的藍 */}
        <div
          aria-hidden
          className="absolute -top-16 -right-16 -z-10 h-48 w-48 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, hsl(217 91% 60% / 0.18) 0%, transparent 70%)',
          }}
        />

        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
          {/* 頂部 chips row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                系統運作中
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                <Activity className="h-3 w-3" />
                v1.0.0 · Build {process.env.NODE_ENV === 'production' ? 'prod' : 'dev'}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <Sun className="h-3 w-3" />
              CBL Admin
            </div>
          </div>

          {/* 主體: greeting + role + avatar */}
          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {now ? greeting(now) : '歡迎'}, {user.name}
              </p>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                CBL Admin 控制台
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground" suppressHydrationWarning>
                {now ? todayStr(now) : '載入中…'} · 從左側選單開始管理班次、校巴、路線、司機、學生
              </p>

              {/* 角色 chips — 跟 StatCard 用同樣的色票 */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Shield className="h-3 w-3" />
                  {role}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  {user.email}
                </span>
                {user.clientId && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Client · {String(user.clientId).slice(0, 8)}
                  </span>
                )}
              </div>
            </div>

            {/* Avatar — 沒有 conic glow, 跟 (main) layout 一致的風格 */}
            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary flex items-center justify-center text-2xl sm:text-3xl font-bold text-primary-foreground ring-2 ring-primary/20 ring-offset-2 ring-offset-card">
                {user.photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.photo} alt={user.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <UserCircle2 className="hidden sm:block h-4 w-4 text-muted-foreground" />
            </div>
          </div>

        </div>
      </motion.section>

      {/* ============================================================
          2. 4 格 Quick Stats — 跟 StatCard 一致, 顏色不變
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">平台概覽</h2>
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            {now ? todayStr(now) : ''}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickStat
            title="學生"
            value={stats.students}
            hint={`已分配 ${stats.studentsAssigned} · 待分配 ${stats.studentsUnassigned}`}
            icon={Baby}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
          />
          <QuickStat
            title="家長"
            value={stats.parents}
            hint="已綁定可登入"
            icon={Users}
            color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300"
          />
          <QuickStat
            title="校巴"
            value={stats.buses}
            hint={`運行中 ${stats.busesActive} · 維護 ${stats.busesMaintenance}`}
            icon={Bus}
            color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
          />
          <QuickStat
            title="本月出席率"
            value={`${stats.attendanceRate}%`}
            hint={`${stats.totalAttendance} 筆接送`}
            icon={BarChart3}
            color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300"
          />
        </div>
      </motion.section>

      {/* ============================================================
          3. 模組捷徑 — 每個 menu tab 一張卡
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">模組捷徑</h2>
          <span className="text-xs text-muted-foreground">從左側選單亦可進入</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <ModuleCard
            href="/cbl-admin-setting/schedule"
            icon={CalendarClock}
            title="班次"
            desc="今日班次、發車時間、即時狀態"
            color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/bus"
            icon={Bus}
            title="班次 · 校巴"
            desc="校巴總覽、運行狀態、維護"
            color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/bus/trips"
            icon={FileSpreadsheet}
            title="班次 · 路線"
            desc="站點、班次、學生名單"
            color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/bus/drivers"
            icon={MapPin}
            title="班次 · 司機"
            desc="駕照、值勤、校巴指派"
            color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/parents/childrens"
            icon={Baby}
            title="家長 · 子女"
            desc="依家長檢視綁定子女"
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/parents/payment"
            icon={Receipt}
            title="家長 · 付款記錄"
            desc="應付 / 應收 / 完整記錄 / PDF"
            color="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/students"
            icon={Baby}
            title="學生"
            desc="完整資料含班級 / 監護人"
            color="bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/nannys"
            icon={UserCheck}
            title="保姆"
            desc="校巴分配、聯絡資料"
            color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/reports"
            icon={BarChart3}
            title="報表"
            desc="匯出 Excel 出席統計"
            color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/user"
            icon={Shield}
            title="用戶 · 功能權限"
            desc="switch button 分配功能"
            color="bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/announcements"
            icon={Megaphone}
            title="公告"
            desc="發布通告給家長 / 保姆"
            color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300"
          />
          <ModuleCard
            href="/cbl-admin-setting/site-tool"
            icon={Wrench}
            title="網站設定"
            desc="公司資料、主題色、聯絡資訊"
            color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          />
        </div>
      </motion.section>

      {/* ============================================================
          4. Footer line
          ============================================================ */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <span>© {new Date().getFullYear()} CloudBusLink · CBL Admin Console</span>
        <span className="font-mono">/cbl-admin-setting</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Sub-components (local; 沿用 StatCard 的色票但換成 lighter 視覺)
// ----------------------------------------------------------------

function QuickStat({
  title,
  value,
  hint,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground tabular-nums">{value}</p>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ModuleCard({
  href,
  icon: Icon,
  title,
  desc,
  color,
}: {
  href: string;
  icon: any;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className={cn('h-10 w-10 flex-shrink-0 rounded-xl flex items-center justify-center', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{desc}</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}
