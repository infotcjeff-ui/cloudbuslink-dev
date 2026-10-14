'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bus, Plus, X, Search, CalendarDays, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AriaSelectRoot, AriaSelectItem, SelectedCheck } from '@/components/ui/aria-select';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { cn, today, cnWeekday, tripTypeLabel } from '@/lib/utils';
import type { Trip, TripType } from '@/lib/types';
import { DatePillRow } from '@/components/trips/date-pill-row';
import { SegmentedControl } from '@/components/trips/segmented-control';
import { TripCard } from '@/components/trips/trip-card';
import { TripFab } from '@/components/trips/trip-fab';
import { MotionList } from '@/components/trips/motion-list';
import { DUR, EASE_OUT_QUART } from '@/lib/motion';

export default function TripsPage() {
  return (
    <Suspense fallback={null}>
      <TripsPageInner />
    </Suspense>
  );
}

type Tab = TripType | 'all';

function TripsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [busFilter, setBusFilter] = useState<string>(searchParams.get('busId') || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    const all = STORAGE.trips.getByDate(user.clientId || '', date);
    if (user.role === 'nanny') {
      const nanny = STORAGE.nannies.getByClient(user.clientId || '')
        .find((n) => n.phone === user.phone);
      setTrips(nanny ? all.filter((t) => t.nannyId === nanny.id) : []);
      return;
    }
    setTrips(all);
  }, [user, date]);

  const buses = useMemo(() => {
    if (!user) return [];
    return STORAGE.buses.getByClient(user.clientId || '');
  }, [user]);

  const filteredBus = busFilter ? STORAGE.buses.getById(busFilter) : null;

  // Counts per type (for segmented badges)
  const counts = useMemo(() => {
    const base = busFilter ? trips.filter((t) => t.busId === busFilter) : trips;
    return {
      all: base.length,
      morning: base.filter((t) => t.type === 'morning').length,
      afternoon: base.filter((t) => t.type === 'afternoon').length,
      custom: base.filter((t) => t.type === 'custom').length,
    } as const;
  }, [trips, busFilter]);

  const filtered = useMemo(() => {
    return trips
      .filter((t) => (tab === 'all' ? true : t.type === tab))
      .filter((t) => (busFilter ? t.busId === busFilter : true))
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
      });
  }, [trips, tab, busFilter, search]);

  // Smart tabs: hide 'all' when all counts equal the sum of types
  const showAllTab = counts.all !== counts.morning + counts.afternoon + counts.custom;
  
  const tabs: Array<{
    value: Tab;
    label: string;
    trailing?: React.ReactNode;
  }> = useMemo(() => {
    const result: Array<{ value: Tab; label: string; trailing?: React.ReactNode }> = [];
    
    if (showAllTab) {
      result.push({ value: 'all', label: '全部', trailing: counts.all > 0 ? <CountPill n={counts.all} /> : undefined });
    }
    result.push({ value: 'morning', label: tripTypeLabel('morning'), trailing: counts.morning > 0 ? <CountPill n={counts.morning} /> : undefined });
    result.push({ value: 'afternoon', label: tripTypeLabel('afternoon'), trailing: counts.afternoon > 0 ? <CountPill n={counts.afternoon} /> : undefined });
    result.push({ value: 'custom', label: tripTypeLabel('custom'), trailing: counts.custom > 0 ? <CountPill n={counts.custom} /> : undefined });
    
    return result;
  }, [showAllTab, counts]);

  const canCreate = user?.role === 'super_admin' || user?.role === 'client';

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
        {buses.length > 0 && (
          <AriaSelectRoot
            aria-label="校巴篩選"
            selectedKey={busFilter}
            onSelectionChange={(k) => setBusFilter((k as string) || '')}
            icon={<Bus className="w-3.5 h-3.5" />}
            triggerClassName="h-9 px-3 text-sm"
          >
            <AriaSelectItem id="" textValue="全部校巴">
              <span className="text-sm">全部校巴</span>
              <SelectedCheck visible={!busFilter} />
            </AriaSelectItem>
            {buses.map((b) => (
              <AriaSelectItem key={b.id} id={b.id} textValue={b.plateNumber}>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{b.plateNumber}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{b.model}</span>
                </div>
                <SelectedCheck visible={busFilter === b.id} />
              </AriaSelectItem>
            ))}
          </AriaSelectRoot>
        )}
      </motion.div>

      {/* Active bus filter chip */}
      <AnimatePresence>
        {filteredBus && (
          <motion.div
            key="bus-chip"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
            className="mb-2 overflow-hidden"
          >
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-2.5 pr-1 py-1 rounded-full">
              <Bus className="w-3.5 h-3.5" />
              {filteredBus.plateNumber}
              <button
                type="button"
                onClick={() => setBusFilter('')}
                aria-label="清除校巴篩選"
                className="ml-0.5 w-5 h-5 rounded-full hover:bg-primary/20 flex items-center justify-center"
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
          layoutId="trip-type-active"
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
          <p className="text-sm font-medium">當日沒有班次</p>
          <p className="text-xs text-muted-foreground mt-1">
            {tab === 'all' ? '試試切換日期或新增一個班次' : '此類型當日尚無資料'}
          </p>
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 h-9"
              onClick={() => router.push('/trips/new')}
            >
              <Plus className="w-4 h-4" />
              新增班次
            </Button>
          )}
        </motion.div>
      ) : (
        <MotionList
          items={filtered}
          getKey={(t) => t.id}
          className="space-y-2"
          renderItem={(trip, idx) => {
            const bus = STORAGE.buses.getById(trip.busId);
            const nanny = STORAGE.nannies.getById(trip.nannyId);
            return (
              <TripCard
                trip={trip}
                busPlate={bus?.plateNumber || '未指派校巴'}
                driverName={bus?.driverId ? STORAGE.drivers.getById(bus.driverId)?.name || '' : ''}
                nannyName={nanny?.name || '未指派'}
                index={idx}
                onClick={() => router.push(`/trips/${trip.id}`)}
              />
            );
          }}
        />
      )}

      {/* New FAB */}
      {canCreate && (
        <TripFab visible={filtered.length > 0} onClick={() => router.push('/trips/new')} />
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
