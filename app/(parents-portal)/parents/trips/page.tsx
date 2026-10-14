'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, Users, Search, CalendarDays, Inbox, X } from 'lucide-react';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import {
  cn,
  today,
  cnWeekday,
  tripStatusLabel,
  tripTypeLabel,
} from '@/lib/utils';
import type { Trip, TripType, Parent, Student } from '@/lib/types';
import { DatePillRow } from '@/components/trips/date-pill-row';
import { SegmentedControl } from '@/components/trips/segmented-control';
import { MotionList } from '@/components/trips/motion-list';
import { DUR, EASE_OUT_QUART } from '@/lib/motion';

export default function ParentsTripsPage() {
  return (
    <Suspense fallback={null}>
      <ParentsTripsPageInner />
    </Suspense>
  );
}

type Tab = TripType | 'all';

/**
 * /parents/trips — 家長 portal 底下的班次列表。
 *
 * 與 (main) /trips 的差異:
 *   - 只顯示「班次的 studentIds 包含此家長任一綁定學生」的班次。
 *   - 家長不參與班次操作 (開始/完成/打卡), 所以隱藏編輯/新增/校巴篩選等管理工具。
 *   - 沿用 (parents-portal) layout 的 header/底部 nav, 視覺一致於「子女資訊」頁。
 *
 * 路由: 放在 (parents-portal) group 下, 與 /parents/portal、/parents/settings 同層。
 *       點擊 trip card 仍走 /trips/[id] (parent 在 (main) 的 PORTAL_EXTRA_PATHS
 *       之中, 允許進入班次詳情)。
 */
function ParentsTripsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [parent, setParent] = useState<Parent | null>(null);
  const [myStudents, setMyStudents] = useState<Student[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [studentFilter, setStudentFilter] = useState<string>(
    searchParams.get('studentId') || ''
  );
  const [search, setSearch] = useState('');

  // 找出此家長 + 其綁定學生
  useEffect(() => {
    if (!user) return;
    const parents = STORAGE.parents.getByClient(user.clientId || '');
    const foundParent =
      parents.find((p) => p.id === user.id.replace('user-', '')) ||
      parents.find((p) => p.phone === user.phone);
    setParent(foundParent || null);

    if (foundParent) {
      const all = STORAGE.students.getByClient(user.clientId || '');
      const mine = all.filter((s) => s.parentIds.includes(foundParent.id));
      setMyStudents(mine);
    } else {
      setMyStudents([]);
    }
  }, [user]);

  // 載入當天班次並過濾為「綁定學生相關」
  useEffect(() => {
    if (!user || myStudents.length === 0) {
      setTrips([]);
      return;
    }
    const myIds = new Set(myStudents.map((s) => s.id));
    const all = STORAGE.trips.getByDate(user.clientId || '', date);
    setTrips(all.filter((t) => t.studentIds.some((sid) => myIds.has(sid))));
  }, [user, date, myStudents]);

  const counts = useMemo(() => {
    const base = studentFilter
      ? trips.filter((t) => t.studentIds.includes(studentFilter))
      : trips;
    return {
      all: base.length,
      morning: base.filter((t) => t.type === 'morning').length,
      afternoon: base.filter((t) => t.type === 'afternoon').length,
      custom: base.filter((t) => t.type === 'custom').length,
    } as const;
  }, [trips, studentFilter]);

  const filtered = useMemo(() => {
    return trips
      .filter((t) => (studentFilter ? t.studentIds.includes(studentFilter) : true))
      .filter((t) => (tab === 'all' ? true : t.type === tab))
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        const bus = STORAGE.buses.getById(t.busId);
        const nanny = STORAGE.nannies.getById(t.nannyId);
        return (
          bus?.plateNumber.toLowerCase().includes(q) ||
          nanny?.name.toLowerCase().includes(q) ||
          t.waypoints.some((w) => w.location.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.plannedStartTime.localeCompare(b.plannedStartTime));
  }, [trips, tab, studentFilter, search]);

  const showAllTab =
    counts.all !== counts.morning + counts.afternoon + counts.custom;

  const tabs = useMemo(() => {
    const result: Array<{
      value: Tab;
      label: string;
      trailing?: React.ReactNode;
    }> = [];
    if (showAllTab) {
      result.push({
        value: 'all',
        label: '全部',
        trailing: counts.all > 0 ? <CountPill n={counts.all} /> : undefined,
      });
    }
    result.push({
      value: 'morning',
      label: tripTypeLabel('morning'),
      trailing: counts.morning > 0 ? <CountPill n={counts.morning} /> : undefined,
    });
    result.push({
      value: 'afternoon',
      label: tripTypeLabel('afternoon'),
      trailing:
        counts.afternoon > 0 ? <CountPill n={counts.afternoon} /> : undefined,
    });
    result.push({
      value: 'custom',
      label: tripTypeLabel('custom'),
      trailing: counts.custom > 0 ? <CountPill n={counts.custom} /> : undefined,
    });
    return result;
  }, [showAllTab, counts]);

  const filteredStudent = studentFilter
    ? myStudents.find((s) => s.id === studentFilter) || null
    : null;

  if (!user) return null;

  return (
    <div className="px-3 pt-3 pb-24">
      {/* Header: title + date row combined */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE_OUT_QUART }}
        className="mb-3"
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold tracking-tight">班次</h1>
          <p className="text-xs text-muted-foreground">{cnWeekday(date)}</p>
        </div>
        <DatePillRow value={date} onChange={setDate} />
      </motion.div>

      {/* 沒有綁定學生 → 不顯示搜尋與篩選, 直接提示去綁定 */}
      {myStudents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR.slow, ease: EASE_OUT_QUART }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-pink-500" />
          </div>
          <p className="text-sm font-medium">尚未綁定任何子女</p>
          <p className="text-xs text-muted-foreground mt-1">
            綁定後即可在此查看子女的乘車班次
          </p>
          <button
            type="button"
            onClick={() => router.push('/parents/settings/binding')}
            className="mt-4 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform"
          >
            前往綁定
          </button>
        </motion.div>
      ) : (
        <>
          {/* Search row */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.base, ease: EASE_OUT_QUART, delay: 0.08 }}
            className="flex items-center gap-2 mb-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋校巴 / 保姆 / 站點"
                className={cn(
                  'w-full h-9 pl-9 pr-3 rounded-full bg-muted/60 text-sm',
                  'border border-transparent focus:border-primary focus:bg-background',
                  'placeholder:text-muted-foreground outline-none transition-colors'
                )}
              />
            </div>
          </motion.div>

          {/* Active student filter chip */}
          <AnimatePresence>
            {filteredStudent && (
              <motion.div
                key="student-chip"
                initial={{ opacity: 0, y: -4, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -4, height: 0 }}
                transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
                className="mb-2 overflow-hidden"
              >
                <span className="inline-flex items-center gap-1.5 bg-pink-500/10 text-pink-600 text-xs font-medium pl-2.5 pr-1 py-1 rounded-full">
                  <Users className="w-3.5 h-3.5" />
                  {filteredStudent.name}
                  <button
                    type="button"
                    onClick={() => setStudentFilter('')}
                    aria-label="清除學生篩選"
                    className="ml-0.5 w-5 h-5 rounded-full bg-pink-500/20 flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.base, ease: EASE_OUT_QUART, delay: 0.1 }}
            className="mb-3 overflow-x-auto no-scrollbar -mx-3 px-3"
          >
            <SegmentedControl
              value={tab}
              onChange={setTab}
              options={tabs}
              layoutId="parent-trip-type-active"
              size="sm"
            />
          </motion.div>

          {/* Trip list / empty state */}
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DUR.slow, ease: EASE_OUT_QUART }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="relative w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <CalendarDays className="w-6 h-6 text-primary" />
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-primary/20"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
              <p className="text-sm font-medium">這天沒有你的班次</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tab === 'all' ? '試試切換日期或查看其他類型' : '此類型當日尚無資料'}
              </p>
            </motion.div>
          ) : (
            <MotionList
              items={filtered}
              getKey={(t) => t.id}
              className="space-y-2"
              renderItem={(trip) => (
                <ParentTripCard
                  trip={trip}
                  clientId={user.clientId || ''}
                  busPlate={STORAGE.buses.getById(trip.busId)?.plateNumber || '未指派校巴'}
                  driverName={
                    STORAGE.buses.getById(trip.busId)?.driverId
                      ? STORAGE.drivers.getById(
                          STORAGE.buses.getById(trip.busId)!.driverId!
                        )?.name || ''
                      : ''
                  }
                  nannyName={STORAGE.nannies.getById(trip.nannyId)?.name || '未指派'}
                  onClick={() => router.push(`/trips/${trip.id}`)}
                />
              )}
            />
          )}
        </>
      )}
    </div>
  );
}

function CountPill({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-current/15 text-[9px] tabular-nums">
      {n}
    </span>
  );
}

/**
 * ParentTripCard — 家長視角的班次卡片。
 *
 * 與 TripCard 的差異:
 *   - 拿掉「保姆」/「進度條」 (家長只在意時間 / 校巴 / 學生 / 司機)。
 *   - 多顯示「接送學生」chip, 直接點出家長會看到的子女姓名。
 *   - status 用中文, 與 binding 頁一致。
 */
function ParentTripCard({
  trip,
  clientId,
  busPlate,
  driverName,
  nannyName,
  onClick,
}: {
  trip: Trip;
  clientId: string;
  busPlate: string;
  driverName: string;
  nannyName: string;
  onClick: () => void;
}) {
  // 解析「我的學生」姓名 (trip.studentIds 是所有該班次的學生,
  // 但家長只在意自己綁定的; 透過 clientId + parentIds 過濾)。
  const studentNames = useMemo(() => {
    if (!clientId) return [];
    const allStudents = STORAGE.students.getByClient(clientId);
    const myIds = new Set(trip.studentIds);
    return allStudents.filter((s) => myIds.has(s.id)).map((s) => s.name);
  }, [trip.studentIds, clientId]);

  const statusColor = {
    scheduled: 'bg-muted text-muted-foreground',
    in_progress: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-destructive/10 text-destructive',
  }[trip.status];

  const typeColor = {
    morning: 'bg-amber-100 text-amber-700',
    afternoon: 'bg-blue-100 text-blue-700',
    custom: 'bg-purple-100 text-purple-700',
  }[trip.type];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'w-full text-left rounded-2xl p-3 bg-card border border-border/50',
        'shadow-sm active:scale-[0.98] transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', typeColor)}>
            {tripTypeLabel(trip.type)}
          </span>
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', statusColor)}>
            {tripStatusLabel(trip.status)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold tabular-nums">
          <span>{trip.plannedStartTime.slice(0, 5)}</span>
          <span className="text-muted-foreground">–</span>
          <span>{trip.plannedEndTime.slice(0, 5)}</span>
        </div>
      </div>

      {/* Bus + driver */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Bus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold truncate">{busPlate}</span>
        {driverName && (
          <>
            <span className="text-muted-foreground opacity-40">·</span>
            <span className="text-xs text-muted-foreground truncate">
              司機 {driverName}
            </span>
          </>
        )}
      </div>

      {/* 接送學生 */}
      {studentNames.length > 0 && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {studentNames.join('、')}
          </span>
        </div>
      )}

      {/* 保姆 / 站點 */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>隨車保姆 {nannyName}</span>
        <span className="flex items-center gap-1">
          <Inbox className="w-3 h-3" />
          {trip.waypoints.length} 站
        </span>
      </div>
    </motion.button>
  );
}