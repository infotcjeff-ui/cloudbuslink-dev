'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CalendarClock, ListChecks, Plus, CalendarDays, Clock,
  Route as RouteIcon, Bus, MapPin, ChevronRight, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { useCblStats } from '../hooks/useCblStats';
import { StatCard } from '../components/Cards';
import { cn, today, tripTypeLabel } from '@/lib/utils';
import type { Trip, TripType, TripStatus } from '@/lib/types';

/**
 * /cbl-admin-setting/schedule → 班次 (Schedule) 獨立頂層頁
 *
 * 角色定位:
 *   與 /cbl-admin-setting/bus/trips (校巴/路線) 平行, 但專注在「班次/時段」本身
 *   (每天的具體班次、起訖時間、當前狀態、自動派車), 不處理「路線模板」。
 *
 *   - 校巴/路線 (bus/trips):   路線模板 — 站點順序、學生名單、班次類型
 *   - 班次   (schedule):       每天的具體班次 — 日期、實際發車時間、狀態、駕駛/保姆指派
 *
 * 頁面結構 (沿用 CBL Admin 慣例):
 *   1. Hero 標題列 (含今日捷徑 + 新增班次 FAB)
 *   2. 4 格 stat tiles
 *   3. 今日班次清單 (依時間排序, 最多 8 筆, 點進去看詳情)
 *   4. 子模組捷徑 (新增班次 / 依路線瀏覽 / 行事曆檢視)
 */

type Tab = TripType | 'all';

const TRIP_TABS: { id: Tab; label: string; color: string }[] = [
  { id: 'all',       label: '全部',     color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  { id: 'morning',   label: '早班',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200' },
  { id: 'afternoon', label: '午班',     color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200' },
  { id: 'custom',    label: '自訂',     color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' },
];

function statusLabel(s: TripStatus): string {
  switch (s) {
    case 'scheduled':   return '尚未發車';
    case 'in_progress': return '進行中';
    case 'completed':   return '已完成';
    case 'cancelled':   return '已取消';
    default:            return s;
  }
}

function statusPillClass(s: TripStatus): string {
  switch (s) {
    case 'scheduled':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
    case 'in_progress':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'completed':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
    case 'cancelled':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200';
  }
}

function fmtTime(iso: string): string {
  // 從 ISO 抽出 HH:mm, 若無效就原樣回傳
  const m = iso?.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : (iso || '—');
}

export default function CblAdminSchedulePage() {
  const { user } = useAuth();
  const stats = useCblStats(user?.clientId);
  const [tab, setTab] = useState<Tab>('all');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const clientId = user?.clientId || '';

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    const t = STORAGE.trips.getByDate(clientId, today());
    setTrips(t);
    setLoading(false);

    const handler = () => {
      const next = STORAGE.trips.getByDate(clientId, today());
      setTrips(next);
    };
    window.addEventListener('cbl-trips-refresh', handler);
    return () => window.removeEventListener('cbl-trips-refresh', handler);
  }, [clientId]);

  if (!user) return null;

  // 依 tab 篩選 + 依出發時間排序
  const filtered = trips
    .filter((t) => tab === 'all' || t.type === tab)
    .sort((a, b) => (a.plannedStartTime || '').localeCompare(b.plannedStartTime || ''));

  const counts = {
    all:       trips.length,
    morning:   trips.filter((t) => t.type === 'morning').length,
    afternoon: trips.filter((t) => t.type === 'afternoon').length,
    custom:    trips.filter((t) => t.type === 'custom').length,
  };

  return (
    <div className="space-y-6">
      {/* ============================================================
          1. Hero — 標題 + 今日日期 + 新增班次 CTA
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(135deg, hsl(262 83% 60% / 0.06) 0%, hsl(0 0% 100%) 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-16 -right-16 -z-10 h-48 w-48 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, hsl(262 83% 60% / 0.18) 0%, transparent 70%)',
          }}
        />

        <div className="relative px-6 py-7 sm:px-8 sm:py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
                <CalendarClock className="h-3 w-3 text-violet-600" />
                班次管理
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                <CalendarDays className="h-3 w-3" />
                今日 · {today()}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              班次總覽
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              管理每天的具體班次 — 早班 / 午班 / 自訂, 含發車時間、駕駛與跟車保姆指派、即時狀態。
            </p>
          </div>
          <Link
            href="/trips/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" />
            新增班次
          </Link>
        </div>
      </motion.section>

      {/* ============================================================
          2. 4 格 Stat Tiles
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="今日班次"
            value={trips.length}
            icon={CalendarClock}
            color="bg-violet-100 text-violet-600"
          />
          <StatCard
            title="進行中"
            value={trips.filter((t) => t.status === 'in_progress').length}
            icon={Clock}
            color="bg-emerald-100 text-emerald-600"
          />
          <StatCard
            title="本月接送"
            value={stats.totalAttendance}
            icon={ListChecks}
            color="bg-blue-100 text-blue-600"
          />
          <StatCard
            title="出席率"
            value={`${stats.attendanceRate}%`}
            icon={Sparkles}
            color="bg-amber-100 text-amber-600"
          />
        </div>
      </motion.section>

      {/* ============================================================
          3. 今日班次清單
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="bg-card border border-border rounded-2xl shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">今日班次</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              依出發時間排序, 點選查看詳情或打卡。
            </p>
          </div>
          {/* Tab chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TRIP_TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : `${t.color} hover:opacity-80`
                  )}
                >
                  {t.label}
                  <span className={cn(
                    'tabular-nums rounded-full px-1.5 text-[10px] font-bold',
                    active ? 'bg-white/25' : 'bg-black/10 dark:bg-white/10'
                  )}>
                    {counts[t.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 sm:p-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">載入中…</div>
          ) : filtered.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <CalendarDays className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">今日沒有班次</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tab === 'all' ? '點選右上方「新增班次」開始建立第一個班次。' : `目前「${TRIP_TABS.find((t) => t.id === tab)?.label}」沒有班次。`}
              </p>
              <Link
                href="/trips/new"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95 transition-transform"
              >
                <Plus className="h-3.5 w-3.5" />
                新增班次
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.slice(0, 8).map((trip) => {
                const bus = STORAGE.buses.getById(trip.busId);
                const driver = bus?.driverId
                  ? STORAGE.drivers.getById(bus.driverId)
                  : undefined;
                // 取第一個 waypoint 的地點名稱作為路線名稱
                const routeName =
                  trip.waypoints?.[0]?.location?.name ||
                  bus?.plateNumber ||
                  '未命名班次';
                return (
                  <li key={trip.id}>
                    <Link
                      href={`/trips/${trip.id}`}
                      className="group flex items-center gap-3 sm:gap-4 px-3 py-3.5 rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      {/* 時間 */}
                      <div className="flex flex-col items-center justify-center min-w-[58px]">
                        <span className="text-base font-bold tabular-nums text-foreground leading-none">
                          {fmtTime(trip.plannedStartTime)}
                        </span>
                        <span className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                          → {fmtTime(trip.plannedEndTime)}
                        </span>
                      </div>

                      {/* 主資訊 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {routeName}
                          </span>
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                            statusPillClass(trip.status)
                          )}>
                            {statusLabel(trip.status)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <RouteIcon className="h-3 w-3" />
                            {tripTypeLabel(trip.type)}
                          </span>
                          {bus && (
                            <span className="inline-flex items-center gap-1">
                              <Bus className="h-3 w-3" />
                              {bus.plateNumber}
                            </span>
                          )}
                          {driver && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {driver.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > 8 && (
            <div className="mt-3 text-center">
              <Link
                href="/trips"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                查看全部 {filtered.length} 筆班次
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </motion.section>

      {/* ============================================================
          4. 子模組捷徑
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">班次相關工具</h2>
          <span className="text-xs text-muted-foreground">快速前往常用功能</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ShortcutCard
            href="/trips/new"
            icon={Plus}
            title="新增班次"
            desc="建立一次性班次, 自動指派或手動綁定校巴 / 司機 / 保姆"
            color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300"
          />
          <ShortcutCard
            href="/cbl-admin-setting/bus/trips"
            icon={RouteIcon}
            title="校巴 · 路線模板"
            desc="維護常駐路線: 站點順序、班次類型、學生名單 (作為班次的來源)"
            color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
          />
          <ShortcutCard
            href="/trips"
            icon={CalendarDays}
            title="班次完整列表"
            desc="檢視所有日期的班次, 含歷史、篩選、批次操作"
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
          />
        </div>
      </motion.section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <span>© {new Date().getFullYear()} CloudBusLink · Schedule Console</span>
        <span className="font-mono">/cbl-admin-setting/schedule</span>
      </div>
    </div>
  );
}

function ShortcutCard({
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
