'use client';

/**
 * TripDetailDrawer — 右側滑出 Drawer
 *   三段:
 *   1. 基本 — 日期 / 時間 / 類型 / 狀態 (含 inline 切換)
 *   2. 人員 — 校巴 / 司機 / 保姆 (jumbo 卡片)
 *   3. 站點 × 學生 roster — 顯示每站點的學生, 含即時出席狀態 (Step 3 豐富)
 *
 * 不離開 Schedule Console, 由 page 透過 open / onClose 控制。
 * 不使用 hover (mobile-first 規則)。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Bus,
  Clock,
  MapPin,
  CheckCircle2,
  ChevronRight,
  Users,
  Calendar,
  Tag,
  Route as RouteIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Pill, Button, IconButton } from '../[layout]/students/primitives';
import type { TripWithRelations, TripProgress } from './types';
import type { TripStatus } from '@/lib/types';
import { STATUS_LABEL } from './types';
import { fmtHhMm } from './scheduleUtils';
import { RosterPreviewTable } from './RosterPreviewTable';

interface TripDetailDrawerProps {
  open: boolean;
  row: TripWithRelations | null;
  progress?: TripProgress;
  onClose: () => void;
  onEdit: () => void;
  onChangeStatus: (next: TripStatus) => void;
  onDelete: () => void;
}

export function TripDetailDrawer({
  open,
  row,
  progress,
  onClose,
  onEdit,
  onChangeStatus,
  onDelete,
}: TripDetailDrawerProps) {
  return (
    <AnimatePresence>
      {open && row && (
        <>
          {/* backdrop */}
          {/* !mt-0: 父層 schedule/page.tsx 是 `space-y-6`，其
              `> :not([hidden]) ~ :not([hidden])` 選擇器 (權重 0,3,0) 會套用
              margin-top: 24px 到本元素。普通 `mt-0` (權重 0,1,0) 無法覆蓋，
              必須用 Tailwind important modifier `!mt-0`。 */}
          <motion.div
            className="fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-sm !mt-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          {/* drawer */}
          <motion.aside
            className={cn(
              'fixed top-0 right-0 z-[60] h-[100dvh] w-full max-w-[480px] sm:max-w-[560px]',
              '!mt-0',
              'bg-white dark:bg-slate-900',
              'border-l border-slate-200 dark:border-slate-700',
              'shadow-2xl flex flex-col',
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            role="dialog"
            aria-modal="true"
          >
            <DrawerHeader
              row={row}
              progress={progress}
              onClose={onClose}
              onEdit={onEdit}
              onDelete={onDelete}
              onChangeStatus={onChangeStatus}
            />
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              <DrawerBody row={row} progress={progress}
              onEdit={onEdit} onDelete={onDelete} onChangeStatus={onChangeStatus} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  Drawer Header                                                              */
/* -------------------------------------------------------------------------- */

function DrawerHeader({
  row,
  onClose,
  onEdit,
  onDelete,
  onChangeStatus,
}: {
  row: TripWithRelations;
  progress?: TripProgress;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (next: TripStatus) => void;
}) {
  const trip = row.trip;
  return (
    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start gap-3 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shrink-0">
        <Bus width={18} height={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[15px] font-semibold leading-tight">
            {trip.waypoints?.[0]?.location?.name || row.bus?.plateNumber || '未命名班次'}
          </h2>
          <Pill tone={pillTone(trip.status)} size="sm">
            {STATUS_LABEL[trip.status]}
          </Pill>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 inline-flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Clock width={11} height={11} />
            {fmtHhMm(trip.plannedStartTime)} → {fmtHhMm(trip.plannedEndTime)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar width={11} height={11} />
            {trip.date}
          </span>
          <span className="inline-flex items-center gap-1">
            <Tag width={11} height={11} />
            {trip.id.slice(-6)}
          </span>
        </p>
      </div>
      <IconButton onClick={onClose} title="關閉" variant="ghost">
        <X width={14} height={14} />
      </IconButton>
    </div>
  );
}

function pillTone(s: TripStatus): 'primary' | 'warning' | 'success' | 'danger' {
  switch (s) {
    case 'in_progress': return 'warning';
    case 'completed':   return 'success';
    case 'cancelled':   return 'danger';
    default:            return 'primary';
  }
}

/* -------------------------------------------------------------------------- */
/*  Drawer Body                                                                */
/* -------------------------------------------------------------------------- */

function DrawerBody({
  row,
  progress,
  onEdit,
  onDelete,
  onChangeStatus,
}: {
  row: TripWithRelations;
  progress?: TripProgress;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (next: TripStatus) => void;
}) {
  return (
    <div className="px-5 py-5 space-y-5">
      {/* § 1. 基本 */}
      <DrawerSection icon={<Calendar width={14} height={14} />} title="基本">
        <DetailRow label="日期">{row.trip.date}</DetailRow>
        <DetailRow label="班次類型">{tripTypeZh(row.trip.type)}</DetailRow>
        <DetailRow label="計畫時間">
          {fmtHhMm(row.trip.plannedStartTime)} → {fmtHhMm(row.trip.plannedEndTime)}
        </DetailRow>
        {row.trip.actualStartTime && (
          <DetailRow label="實際開始">{row.trip.actualStartTime}</DetailRow>
        )}
        {row.trip.actualEndTime && (
          <DetailRow label="實際結束">{row.trip.actualEndTime}</DetailRow>
        )}
        <DetailRow label="狀態">
          <Pill tone={pillTone(row.trip.status)} size="sm">
            {STATUS_LABEL[row.trip.status]}
          </Pill>
        </DetailRow>
      </DrawerSection>

      {/* § 2. 人員 / 校巴 */}
      <DrawerSection icon={<Bus width={14} height={14} />} title="校巴 / 司機 / 保姆">
        <DetailRow label="校巴">
          {row.bus ? `${row.bus.plateNumber} · ${row.bus.model} · ${row.bus.capacity}座` : '未指派'}
        </DetailRow>
        <DetailRow label="司機">
          {row.driver ? `${row.driver.name} · ${row.driver.phone}` : '未指派'}
        </DetailRow>
        <DetailRow label="保姆">
          {row.nanny ? `${row.nanny.name} · ${row.nanny.phone}` : '未指派'}
        </DetailRow>
        <DetailRow label="路線模板">
          {row.route
            ? (
              <span className="inline-flex items-center gap-1 flex-wrap justify-end">
                <RouteIcon width={11} height={11} className="text-violet-500" />
                <span>{row.route.code} · {row.route.name}</span>
                <Pill tone="violet" size="sm">{row.route.stops?.length ?? 0} 站</Pill>
              </span>
            )
            : '未套用 (手動建立)'}
        </DetailRow>
      </DrawerSection>

      {/* § 3. 出席進度 */}
      {progress && (
        <DrawerSection icon={<CheckCircle2 width={14} height={14} />} title="出席進度">
          <ProgressLine label="上車完成度" value={`${progress.boardedCount}/${progress.expectedPickups}`} pct={progress.boardingRate} />
          <ProgressLine label="完成站點" value={`${progress.completedStops}/${progress.totalStops}`} pct={progress.totalStops ? progress.completedStops / progress.totalStops : 0} />
          <div className="flex items-center gap-2 text-[11px] mt-1">
            <Pill tone="success" size="sm">{progress.boardedCount} 已上車</Pill>
            {progress.lateCount > 0 && (
              <Pill tone="warning" size="sm">{progress.lateCount} 遲到</Pill>
            )}
            {progress.noShowCount > 0 && (
              <Pill tone="danger" size="sm">{progress.noShowCount} 缺席</Pill>
            )}
            {progress.droppedCount > 0 && (
              <Pill tone="primary" size="sm">{progress.droppedCount} 已下車</Pill>
            )}
          </div>
        </DrawerSection>
      )}

      {/* § 4. 站點 × 學生 roster (Step 3: 互動式, 可補打卡) */}
      <DrawerSection icon={<MapPin width={14} height={14} />} title={`站點 × 學生 (${row.trip.waypoints.length})`}>
        <RosterPreviewTable
          tripId={row.trip.id}
          waypoints={row.trip.waypoints}
          attendees={row.students}
          attendances={row.attendances}
          onChanged={() => {
            window.dispatchEvent(new CustomEvent('cbl-attendance-refresh'));
          }}
        />
      </DrawerSection>

      {/* § 5. 動作 */}
      <DrawerSection icon={<ChevronRight width={14} height={14} />} title="動作">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" size="sm" startIcon={<Users width={12} height={12} />} onClick={onEdit}>
            編輯
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onChangeStatus(row.trip.status === 'cancelled' ? 'scheduled' : 'cancelled')}>
            {row.trip.status === 'cancelled' ? '解除取消' : '取消班次'}
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            永久刪除
          </Button>
        </div>
      </DrawerSection>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-2">
        Trip ID: {row.trip.id}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                            */
/* -------------------------------------------------------------------------- */

function DrawerSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="flex items-center gap-1.5 mb-2 text-slate-700 dark:text-slate-300">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
          {icon}
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wider">{title}</span>
      </header>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[12px] py-1 border-b border-slate-100 dark:border-slate-700/60 last:border-b-0">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-right text-slate-800 dark:text-slate-200 min-w-0 break-words">{children}</span>
    </div>
  );
}

function ProgressLine({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number;
}) {
  const tone =
    pct === 1 ? 'bg-emerald-500' :
    pct >= 0.5 ? 'bg-amber-500' :
    pct === 0 ? 'bg-slate-300' : 'bg-sky-500';
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-700/60 overflow-hidden">
        <div className={cn('h-full transition-all', tone)} style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}

function tripTypeZh(t: 'morning' | 'afternoon' | 'custom'): string {
  return t === 'morning' ? '早班' : t === 'afternoon' ? '午班' : '自訂';
}
