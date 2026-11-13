'use client';

/**
 * ScheduleConsoleContent — OneFleet-style Trip Operations Console
 * 範圍: 僅 /cbl-admin-setting/schedule/ 內使用。
 *
 * 5-Layer 結構 (沿用 /bus/trips TripsConsoleContent):
 *   L1. Header Row (Title + Stat Tiles)
 *   L2. Action Toolbar (filter chips + 匯出 + 多選批次 + 新增)
 *   L3. Table Card (SectionHeader + Filter Bar + Table + Pagination)
 *   L4. 警示列 (Conflict Banner)
 *   L5. Modals (新增/編輯 TripFormModal 預留, Detail Drawer, Batch)
 *
 * Step 1 skeleton:
 *   - 讀 / 列 / 篩選 / search / Excel 匯出 / 多選 / 進度 bar
 *   - Step 2 之後再補 TripFormModal (Drawer) + TripDetailDrawer
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  Plus,
  Eye,
  Pencil,
  Search,
  FolderOpen,
  CheckCircle2,
  Bus as BusIcon,
  Users as UsersAllIcon,
  Sun,
  Sunset,
  Sparkles,
  History,
  FlaskConical,
  Eraser,
  FileSpreadsheet,
  ChevronRight,
  AlertTriangle,
  CheckSquare,
  Square,
  PowerOff,
  Trash2,
  Clock,
  Hash,
  User as UserIcon,
  CopyPlus,
  Lock,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { cn } from '@/lib/utils';
import {
  Pill,
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from '../[layout]/students/primitives';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
} from '../bus/trips/design-tokens';
import type {
  ScheduleTab,
  TripWithRelations,
  TripConflict,
  TripProgress,
  ScheduleFilter,
  ScheduleSort,
} from './types';
import { SCHEDULE_TABS, STATUS_LABEL } from './types';
import { fmtHhMm, todayIso } from './scheduleUtils';
import type { TripType, TripStatus } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<ScheduleTab>[] = [
  { value: 'all',       label: '全部',     icon: <CalendarClock width={11} height={11} /> },
  { value: 'morning',   label: '早班',     icon: <Sun width={11} height={11} /> },
  { value: 'afternoon', label: '午班',     icon: <Sunset width={11} height={11} /> },
  { value: 'custom',    label: '自訂',     icon: <Sparkles width={11} height={11} /> },
  { value: 'history',   label: '過往紀錄', icon: <History width={11} height={11} /> },
];

const TRIP_TYPE_LABEL: Record<TripType, string> = {
  morning: '早班',
  afternoon: '午班',
  custom: '自訂',
};

/** 班次類型顯示 — 自訂且有自訂名稱時顯示該名稱 (e.g. 課外活動), 否則退回預設 */
function tripTypeDisplay(t: { type: TripType; customTypeLabel?: string | null }): string {
  if (t.type === 'custom' && t.customTypeLabel?.trim()) return t.customTypeLabel.trim();
  return TRIP_TYPE_LABEL[t.type];
}

const PAGE_SIZE = 8;

const STATUS_TONE: Record<TripStatus, 'primary' | 'warning' | 'success' | 'danger'> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

const STATUS_DOT: Record<TripStatus, 'primary' | 'warning' | 'success' | 'danger'> = {
  scheduled: 'primary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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

function tripTypePillClass(t: TripType): string {
  switch (t) {
    case 'morning':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
    case 'afternoon':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200';
    default:
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200';
  }
}

function formatIsoDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function describeConflict(c: TripConflict): string {
  return c.description;
}

/* -------------------------------------------------------------------------- */
/*  ScheduleConsoleContent                                                     */
/* -------------------------------------------------------------------------- */

export interface ScheduleConsoleContentProps {
  /** 注入 useScheduleTrips 的結果, 由 page.tsx 控制, 提高可測試性 */
  data: {
    trips: TripWithRelations[];
    totalCount: number;
    loading: boolean;
    progress: Record<string, TripProgress>;
    conflicts: TripConflict[];
    buses: import('@/lib/types').Bus[];
    drivers: import('@/lib/types').Driver[];
    nannies: import('@/lib/types').Nanny[];
    students: import('@/lib/types').Student[];
    routes: import('@/lib/types').Route[];
  };
  /** 受控 filter */
  filter: ScheduleFilter;
  onFilterChange: (next: ScheduleFilter) => void;
  tab: ScheduleTab;
  onTabChange: (t: ScheduleTab) => void;
  sort: ScheduleSort;
  onSortChange: (s: ScheduleSort) => void;

  /** 動作 hooks */
  onOpenAdd: () => void;
  onEdit: (trip: TripWithRelations) => void;
  onView: (trip: TripWithRelations) => void;
  onDelete: (trip: TripWithRelations) => void;
  onDuplicate: (trip: TripWithRelations) => void;
  onChangeStatus: (trip: TripWithRelations, status: TripStatus) => void;
  onJumpToConflict: (c: TripConflict) => void;

  /** 多選批次 */
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onBatchChangeStatus: (ids: string[], status: TripStatus) => void;
  onBatchCancel: (ids: string[]) => void;
  onBatchDuplicate: (ids: string[]) => void;
  /** 封存學年 → 唯讀 (停用所有會改動資料的按鈕) */
  readOnly?: boolean;
  /** 一鍵測試資料 (僅 localStorage, 不推雲端) */
  onSeedTestData?: () => void;
  onClearTestData?: () => void;
  testTripCount?: number;
  seedingTestData?: boolean;
}

export function ScheduleConsoleContent(props: ScheduleConsoleContentProps) {
  const {
    data,
    filter,
    onFilterChange,
    tab,
    onTabChange,
    sort,
    onSortChange,
    onOpenAdd,
    onEdit,
    onView,
    onDelete,
    onDuplicate,
    onChangeStatus,
    onJumpToConflict,
    selectedIds,
    onSelectedChange,
    onBatchChangeStatus,
    onBatchCancel,
    onBatchDuplicate,
    readOnly = false,
    onSeedTestData,
    onClearTestData,
    testTripCount = 0,
    seedingTestData = false,
  } = props;

  const [page, setPage] = React.useState(1);
  const [statusMenuFor, setStatusMenuFor] = React.useState<string | null>(null);

  /* 統計 */
  const stats = React.useMemo(() => {
    const all = data.trips;
    return {
      total: all.length,
      morning: all.filter((t) => t.trip.type === 'morning').length,
      afternoon: all.filter((t) => t.trip.type === 'afternoon').length,
      custom: all.filter((t) => t.trip.type === 'custom').length,
      inProgress: all.filter((t) => t.trip.status === 'in_progress').length,
      completed: all.filter((t) => t.trip.status === 'completed').length,
      cancelled: all.filter((t) => t.trip.status === 'cancelled').length,
      scheduled: all.filter((t) => t.trip.status === 'scheduled').length,
      conflictCount: data.conflicts.length,
    };
  }, [data.trips, data.conflicts.length]);

  /* 排序 — 過往紀錄 tab: 未完成置頂 / 已完成置底, 同組內日期新→舊, 同日再按早→午→自訂 */
  const sorted = React.useMemo(() => {
    const list = [...data.trips];
    if (tab === 'history') {
      const typeOrder: Record<string, number> = { morning: 0, afternoon: 1, custom: 2 };
      list.sort((a, b) => {
        const aDone = a.trip.status === 'completed' ? 1 : 0;
        const bDone = b.trip.status === 'completed' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        if (a.trip.date !== b.trip.date) return b.trip.date.localeCompare(a.trip.date);
        const ta = typeOrder[a.trip.type] ?? 99;
        const tb = typeOrder[b.trip.type] ?? 99;
        if (ta !== tb) return ta - tb;
        return a.trip.plannedStartTime.localeCompare(b.trip.plannedStartTime);
      });
      return list;
    }
    list.sort((a, b) => {
      switch (sort) {
        case 'start_desc':
          return `${b.trip.date}_${b.trip.plannedStartTime}`.localeCompare(
            `${a.trip.date}_${a.trip.plannedStartTime}`,
          );
        case 'created_desc':
          return b.trip.createdAt.localeCompare(a.trip.createdAt);
        case 'status': {
          const order: TripStatus[] = ['in_progress', 'scheduled', 'completed', 'cancelled'];
          return order.indexOf(a.trip.status) - order.indexOf(b.trip.status);
        }
        case 'start_asc':
        default:
          return `${a.trip.date}_${a.trip.plannedStartTime}`.localeCompare(
            `${b.trip.date}_${b.trip.plannedStartTime}`,
          );
      }
    });
    return list;
  }, [data.trips, sort, tab]);

  /* 分頁 */
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showingFrom = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, sorted.length);

  /* 多選 */
  const allSelected = pageItems.length > 0 && pageItems.every((p) => selectedIds.includes(p.trip.id));
  const toggleAllOnPage = () => {
    if (allSelected) {
      onSelectedChange(selectedIds.filter((id) => !pageItems.some((p) => p.trip.id === id)));
    } else {
      const newOnes = pageItems.map((p) => p.trip.id).filter((id) => !selectedIds.includes(id));
      onSelectedChange(Array.from(new Set([...selectedIds, ...newOnes])));
    }
  };
  const toggleOne = (id: string) => {
    onSelectedChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  /* Excel 匯出 */
  const handleExportExcel = React.useCallback(() => {
    if (sorted.length === 0) return;
    const rows: Record<string, string | number>[] = [];
    sorted.forEach((row) => {
      const { trip, bus, driver, nanny, attendances } = row;
      const prog = data.progress[trip.id];
      rows.push({
        日期: trip.date,
        班次類型: tripTypeDisplay(trip),
        開始: trip.plannedStartTime,
        結束: trip.plannedEndTime,
        校巴: bus?.plateNumber || '未指派',
        容量: bus?.capacity ?? '',
        司機: driver?.name || '未指派',
        保姆: nanny?.name || '未指派',
        站點數: trip.waypoints.length,
        學生數: trip.studentIds.length,
        已上車: prog?.boardedCount ?? 0,
        缺席: prog?.noShowCount ?? 0,
        遲到: prog?.lateCount ?? 0,
        狀態: STATUS_LABEL[trip.status],
        出席率: prog ? `${Math.round(prog.boardingRate * 100)}%` : '—',
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 10 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '班次');
    const stamp = todayIso();
    const tabLabel = SCHEDULE_TABS.find((t) => t.id === tab)?.label ?? '全部';
    XLSX.writeFile(wb, `schedule-${tabLabel}-${stamp}.xlsx`);
  }, [sorted, data.progress, tab]);

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white shrink-0">
            <CalendarClock width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                班次總覽
              </h1>
              <Pill tone="primary" size="sm">
                <Hash width={9} height={9} />
                {/* P0-1: 篩選 n / 全部 m */}
                {data.trips.length}{data.totalCount !== data.trips.length ? ` / ${data.totalCount}` : ''} 班
              </Pill>
              {stats.conflictCount > 0 && (
                <Pill tone="danger" size="sm">
                  <AlertTriangle width={9} height={9} />
                  {stats.conflictCount} 衝突
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理每天的具體班次 — 站點 × 學生 × 校巴 × 司機 × 保姆, 連即時出席進度。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[420px]">
          <StatTile
            label="早班"
            value={stats.morning}
            hint={`進行中 ${stats.inProgress}`}
            icon={<Sun width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="午班"
            value={stats.afternoon}
            hint={`已完成 ${stats.completed}`}
            icon={<Sunset width={12} height={12} />}
            tone="violet"
          />
          <StatTile
            label="自訂"
            value={stats.custom}
            hint={`已取消 ${stats.cancelled}`}
            icon={<Sparkles width={12} height={12} />}
            tone="warning"
          />
        </div>
      </motion.div>

      {/* L1.5. 封存學年提示 (決策 D6: 歷史學年唯讀) */}
      {readOnly && (
        <div
          className="flex items-start gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
        >
          <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
          <div>
            <p className="font-semibold">目前檢視的學年為唯讀模式</p>
            <p className="mt-0.5 opacity-80">
              你可以查看班次、出席記錄並匯出報表, 但不能新增、編輯、刪除或改變班次狀態。
              切回現行學年即可繼續編輯。
            </p>
          </div>
        </div>
      )}

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="secondary"
          size="sm"
          startIcon={<FileSpreadsheet width={12} height={12} />}
          onClick={handleExportExcel}
          disabled={sorted.length === 0}
          title={sorted.length === 0 ? '沒有可匯出的資料' : '匯出為 Excel'}
        >
          匯出 Excel ({sorted.length})
        </Button>

        {/* 多選批次 */}
        {selectedIds.length > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
            <Pill tone="primary" size="sm">
              已選 {selectedIds.length}
            </Pill>
            <Button
              variant="warning"
              size="sm"
              startIcon={<PowerOff width={12} height={12} />}
              onClick={() => onBatchCancel(selectedIds)}
              disabled={readOnly}
              title={readOnly ? '目前檢視的學年為唯讀 — 不能批次取消班次' : undefined}
            >
              批次取消
            </Button>
            <Button
              variant="secondary"
              size="sm"
              startIcon={<CopyPlus width={12} height={12} />}
              onClick={() => onBatchDuplicate(selectedIds)}
              disabled={readOnly}
              title={readOnly ? '目前檢視的學年為唯讀 — 不能複製班次' : undefined}
            >
              批次複製
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* 一鍵測試資料 */}
          {onSeedTestData && (
            <Button
              variant="secondary"
              size="sm"
              startIcon={<FlaskConical width={12} height={12} />}
              onClick={onSeedTestData}
              disabled={readOnly || seedingTestData}
              title={readOnly ? '目前檢視的學年為唯讀 — 不能新增測試資料' : '隨機生成 10 個測試班次 (校巴/保姆/學生/打卡, 只存本機不推雲端)'}
            >
              {seedingTestData ? '生成中…' : '一鍵新增測試資料'}
            </Button>
          )}
          {onClearTestData && testTripCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              startIcon={<Eraser width={12} height={12} />}
              onClick={onClearTestData}
              disabled={readOnly || seedingTestData}
              title="只刪除 test- 前綴的測試資料, 不碰真實資料"
            >
              移除測試資料 ({testTripCount})
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus width={12} height={12} />}
            onClick={onOpenAdd}
            disabled={readOnly}
            title={
              readOnly ? '目前檢視的學年為唯讀 — 只能查看與匯出, 不能新增' : undefined
            }
          >
            新增班次
          </Button>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        <SectionHeader
          icon={<CalendarClock width={18} height={18} />}
          title="班次清單"
          subtitle={`${sorted.length} 班 · 已選 ${selectedIds.length} 班 · 衝突 ${stats.conflictCount} 件`}
          accent="violet"
          actions={
            <Pill tone="violet" size="sm">
              {sorted.length}
            </Pill>
          }
        />

        {/* Filter Bar */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              onTabChange(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="schedule-tab-pill"
          />

          {(() => {
            // 指定 ISO 日期 (非 today/tomorrow/yesterday/past7/all) → 顯示 date input
            const DR = filter.dateRange;
            const isHistoryTab = tab === 'history';
            const isCustomDate =
              !!DR && !['today', 'tomorrow', 'yesterday', 'past7', 'all'].includes(DR);
            // 過往紀錄 tab: 日期範圍固定為「所有非今天」, 隱藏日期切換避免誤導
            if (isHistoryTab) {
              return (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    所有非今天班次 · 未完成置頂 / 已完成置底
                  </span>
                  {/* 狀態篩選 */}
                  <select
                    aria-label="狀態篩選"
                    value={filter.status ?? 'all'}
                    onChange={(e) => {
                      const v = e.target.value as ScheduleFilter['status'];
                      onFilterChange({ ...filter, status: v === 'all' ? 'all' : v });
                      setPage(1);
                    }}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  >
                    <option value="all">全部狀態</option>
                    <option value="scheduled">尚未發車</option>
                    <option value="in_progress">進行中</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>

                  {/* Search */}
                  <div className="relative min-w-[220px]">
                    <Search
                      width={11}
                      height={11}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={filter.q}
                      onChange={(e) => {
                        onFilterChange({ ...filter, q: e.target.value });
                        setPage(1);
                      }}
                      placeholder="搜尋車牌 / 司機 / 保姆 / 學生 / 站點…"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                    {filter.q && (
                      <button
                        onClick={() => onFilterChange({ ...filter, q: '' })}
                        aria-label="清除搜尋"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return (
          <div className="ml-auto flex items-center gap-2">
            {/* 日期快速切換 */}
            <select
              aria-label="日期快速切換"
              value={isCustomDate ? '__custom__' : filter.dateRange}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') {
                  // 切到日期 input 時預設帶今日, 讓用戶可直接改
                  onFilterChange({ ...filter, dateRange: todayIso() });
                } else {
                  onFilterChange({ ...filter, dateRange: v });
                }
                setPage(1);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              <option value="today">今日</option>
              <option value="tomorrow">明日</option>
              <option value="yesterday">昨日</option>
              <option value="past7">過去 7 天</option>
              <option value="all">全部日期</option>
              <option value="__custom__">指定日期…</option>
            </select>
            {/* 指定日期 input — 選「指定日期」或目前已是某 ISO 日期時顯示 */}
            {isCustomDate && (
              <input
                type="date"
                aria-label="指定日期"
                value={filter.dateRange}
                onChange={(e) => {
                  if (e.target.value) {
                    onFilterChange({ ...filter, dateRange: e.target.value });
                    setPage(1);
                  }
                }}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
              />
            )}

            {/* 狀態篩選 */}
            <select
              aria-label="狀態篩選"
              value={filter.status ?? 'all'}
              onChange={(e) => {
                const v = e.target.value as ScheduleFilter['status'];
                onFilterChange({ ...filter, status: v === 'all' ? 'all' : v });
                setPage(1);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              <option value="all">全部狀態</option>
              <option value="scheduled">尚未發車</option>
              <option value="in_progress">進行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>

            {/* 排序 */}
            <select
              aria-label="排序"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as ScheduleSort)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              <option value="start_asc">依出發時間 (早 → 晚)</option>
              <option value="start_desc">依出發時間 (晚 → 早)</option>
              <option value="created_desc">依建立時間 (新 → 舊)</option>
              <option value="status">依狀態優先順序</option>
            </select>

            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search
                width={11}
                height={11}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={filter.q}
                onChange={(e) => {
                  onFilterChange({ ...filter, q: e.target.value });
                  setPage(1);
                }}
                placeholder="搜尋車牌 / 司機 / 保姆 / 學生 / 站點…"
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
              />
              {filter.q && (
                <button
                  onClick={() => onFilterChange({ ...filter, q: '' })}
                  aria-label="清除搜尋"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>
            );
          })()}
        </div>

        {/* Conflict Banner (所見即所得: 只顯示目前可見清單的衝突, 清單空時不顯示) */}
        {sorted.length > 0 && data.conflicts.length > 0 && (
          <div className="mx-5 mb-3 rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800/60 dark:bg-rose-950/30">
            <div className="flex items-center gap-2 px-3 py-2 text-rose-700 dark:text-rose-300">
              <AlertTriangle width={14} height={14} />
              <span className="text-[12px] font-semibold">
                目前清單偵測到 {data.conflicts.length} 項衝突 (以學生優先)
              </span>
            </div>
            <ul className="px-3 pb-2 space-y-1">
              {data.conflicts.slice(0, 3).map((c, idx) => (
                <li key={idx} className="text-[11px] text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2">
                  <span className="truncate">{describeConflict(c)}</span>
                  <button
                    type="button"
                    className="text-rose-600 dark:text-rose-300 underline text-[10px] shrink-0"
                    onClick={() => onJumpToConflict(c)}
                  >
                    檢視
                  </button>
                </li>
              ))}
              {data.conflicts.length > 3 && (
                <li className="text-[10px] text-slate-500 dark:text-slate-400">
                  …還有 {data.conflicts.length - 3} 項
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Table */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {data.loading ? (
              <SkeletonRows key="loading" />
            ) : sorted.length === 0 ? (
              <EmptyState
                key={`empty-${tab}-${filter.dateRange}-${filter.q}`}
                tab={tab}
                search={filter.q}
                dateRange={filter.dateRange}
                onAdd={onOpenAdd}
              />
            ) : (
              <DataTable
                key={`rows-${tab}-${filter.dateRange}-${sort}-${pageItems.map((r) => r.trip.id).join(',').slice(0, 64)}`}
                rows={pageItems}
                progress={data.progress}
                conflictIdsByTrip={collectConflictIds(data.conflicts)}
                selectedIds={selectedIds}
                onToggleOne={toggleOne}
                allSelected={allSelected}
                onToggleAll={toggleAllOnPage}
                statusMenuFor={statusMenuFor}
                setStatusMenuFor={setStatusMenuFor}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onChangeStatus={onChangeStatus}
                readOnly={readOnly}
                highlightCompleted={tab === 'history'}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {!data.loading && sorted.length > 0 && (
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500 gap-3 flex-wrap dark:bg-slate-900/40 dark:border-slate-700/80 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              顯示
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {showingFrom}
              </span>
              -
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {showingTo}
              </span>
              共
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {sorted.length}
              </span>
              筆
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              第 {safePage} / {pageCount} 頁
            </span>
            {pageCount > 1 && (
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  ‹ 上一頁
                </Button>
                <span className="px-2 text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{safePage}</span>
                  <span className="text-slate-400 dark:text-slate-500"> / {pageCount}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage >= pageCount}
                >
                  下一頁 ›
                </Button>
              </span>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function collectConflictIds(conflicts: TripConflict[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  conflicts.forEach((c) => {
    c.tripIds.forEach((tid) => {
      const arr = m.get(tid) ?? [];
      arr.push(c.description);
      m.set(tid, arr);
    });
  });
  return m;
}

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                   */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  progress,
  conflictIdsByTrip,
  selectedIds,
  onToggleOne,
  allSelected,
  onToggleAll,
  statusMenuFor,
  setStatusMenuFor,
  onView,
  onEdit,
  onDelete,
  onDuplicate,
  onChangeStatus,
  readOnly = false,
  highlightCompleted = false,
}: {
  rows: TripWithRelations[];
  progress: Record<string, TripProgress>;
  conflictIdsByTrip: Map<string, string[]>;
  selectedIds: string[];
  onToggleOne: (id: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  statusMenuFor: string | null;
  setStatusMenuFor: (id: string | null) => void;
  onView: (t: TripWithRelations) => void;
  onEdit: (t: TripWithRelations) => void;
  onDelete: (t: TripWithRelations) => void;
  onDuplicate: (t: TripWithRelations) => void;
  onChangeStatus: (t: TripWithRelations, status: TripStatus) => void;
  /** 封存學年 → 唯讀 (停用編輯/複製/刪除) */
  readOnly?: boolean;
  /** 過往紀錄 tab → 已完成班次以透綠底色區分 */
  highlightCompleted?: boolean;
}) {
  return (
    <table
      className="w-full">
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95 w-8">
            <button
              type="button"
              onClick={onToggleAll}
              className="text-slate-500 hover:text-slate-700 cursor-pointer dark:text-slate-300"
              aria-label={allSelected ? '取消全選' : '全選'}
            >
              {allSelected ? <CheckSquare width={13} height={13} /> : <Square width={13} height={13} />}
            </button>
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            日期 / 時間
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            班次類型
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            校巴 / 司機
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            保姆
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            學生 / 站點
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            出席進度
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            狀態
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const { trip, bus, driver, nanny } = row;
          const prog = progress[trip.id];
          const conflicts = conflictIdsByTrip.get(trip.id) ?? [];
          const selected = selectedIds.includes(trip.id);

          return (
            <tr
              key={trip.id}
              className={cn(
                'border-b border-slate-100 last:border-b-0 transition-colors dark:border-slate-700/80',
                highlightCompleted && trip.status === 'completed'
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/15 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/15'
                  : selected
                    ? 'bg-violet-50/60 dark:bg-violet-950/20'
                    : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/50',
                conflicts.length > 0 && 'bg-rose-50/40 dark:bg-rose-950/20',
              )}
            >
              {/* 多選 */}
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onToggleOne(trip.id)}
                  className="text-slate-500 hover:text-violet-600 dark:text-slate-300"
                  aria-label={selected ? '取消選取' : '選取'}
                >
                  {selected ? <CheckSquare width={13} height={13} /> : <Square width={13} height={13} />}
                </button>
              </td>
              {/* 日期 / 時間 */}
              <td className="px-3 py-2.5">
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                    {formatIsoDate(trip.date)}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums inline-flex items-center gap-1">
                    <Clock width={9} height={9} />
                    {fmtHhMm(trip.plannedStartTime)} → {fmtHhMm(trip.plannedEndTime)}
                  </span>
                </div>
              </td>
              {/* 班次類型 */}
              <td className="px-3 py-2.5">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', tripTypePillClass(trip.type))}>
                  {tripTypeDisplay(trip)}
                </span>
              </td>
              {/* 校巴 / 司機 */}
              <td className="px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 w-fit">
                    <BusIcon width={9} height={9} />
                    {bus ? `${bus.plateNumber} · ${bus.capacity}座` : '未指派'}
                  </span>
                  {driver && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <UserIcon width={9} height={9} />
                      {driver.name}
                    </span>
                  )}
                </div>
              </td>
              {/* 保姆 */}
              <td className="px-3 py-2.5">
                {nanny ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50">
                    {nanny.name}
                  </span>
                ) : (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400">未指派</span>
                )}
              </td>
              {/* 學生 / 站點 */}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1 flex-wrap">
                  <Pill tone="neutral" size="sm">
                    <UsersAllIcon width={9} height={9} />
                    {trip.studentIds.length} 個
                  </Pill>
                  <Pill tone="neutral" size="sm">
                    {trip.waypoints.length} 站
                  </Pill>
                  {conflicts.length > 0 && (
                    <Pill tone="danger" size="sm">
                      <AlertTriangle width={9} height={9} />
                      衝突 {conflicts.length}
                    </Pill>
                  )}
                </div>
              </td>
              {/* 出席進度 */}
              <td className="px-3 py-2.5">
                <AttendanceProgressBar prog={prog} />
              </td>
              {/* 狀態 (可直接切換) */}
              <td className="px-3 py-2.5">
                <div className="relative w-fit">
                  <button
                    type="button"
                    onClick={() => setStatusMenuFor(statusMenuFor === trip.id ? null : trip.id)}
                    disabled={readOnly}
                    title={readOnly ? '目前檢視的學年為唯讀 — 不能改變班次狀態' : '點擊切換狀態'}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium inline-flex items-center gap-1',
                      statusPillClass(trip.status),
                      readOnly ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:opacity-80',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', {
                      'bg-slate-500': trip.status === 'scheduled',
                      'bg-emerald-500': trip.status === 'in_progress',
                      'bg-blue-500': trip.status === 'completed',
                      'bg-rose-500': trip.status === 'cancelled',
                    })} />
                    {STATUS_LABEL[trip.status]}
                  </button>
                  {statusMenuFor === trip.id && !readOnly && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setStatusMenuFor(null)}
                      />
                      <div className="absolute left-0 top-full z-30 mt-1 w-28 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {(['scheduled', 'in_progress', 'completed', 'cancelled'] as TripStatus[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setStatusMenuFor(null);
                              if (s !== trip.status) onChangeStatus(row, s);
                            }}
                            className={cn(
                              'flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800',
                              s === trip.status ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300',
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', {
                              'bg-slate-500': s === 'scheduled',
                              'bg-emerald-500': s === 'in_progress',
                              'bg-blue-500': s === 'completed',
                              'bg-rose-500': s === 'cancelled',
                            })} />
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </td>
              {/* 操作 */}
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-80">
                  <IconButton onClick={() => onView(row)} title="檢視 / 編輯班次">
                    <Eye width={13} height={13} />
                  </IconButton>
                  {/* ⚠️ 封存學年 → 唯讀 (決策 D6) */}
                  <IconButton
                    onClick={() => onEdit(row)}
                    title={readOnly ? '目前檢視的學年為唯讀 — 只能查看, 不能編輯' : '編輯班次'}
                    disabled={readOnly}
                  >
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDuplicate(row)}
                    title={readOnly ? '目前檢視的學年為唯讀 — 不能複製班次' : '複製到其他日期'}
                    disabled={readOnly}
                  >
                    <CopyPlus width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(row)}
                    title={readOnly ? '目前檢視的學年為唯讀 — 不能刪除班次' : '刪除班次'}
                    variant="danger"
                    disabled={readOnly}
                  >
                    <Trash2 width={13} height={13} />
                  </IconButton>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */
/*  AttendanceProgressBar                                                      */
/* -------------------------------------------------------------------------- */

function AttendanceProgressBar({ prog }: { prog: TripProgress | undefined }) {
  if (!prog) {
    return <span className="text-[11px] text-slate-400">—</span>;
  }
  const pct = Math.round(prog.boardingRate * 100);
  const tone =
    pct === 100 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-amber-500' :
    pct === 0 ? 'bg-slate-300' : 'bg-sky-500';
  return (
    <div className="min-w-[120px]">
      <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden dark:bg-slate-700/70">
        <div className={cn('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums flex items-center justify-between gap-1">
        <span>
          {prog.boardedCount}/{prog.expectedPickups}
        </span>
        {prog.noShowCount > 0 && (
          <span className="text-rose-600 dark:text-rose-300 inline-flex items-center gap-0.5">
            ✕ {prog.noShowCount}
          </span>
        )}
        {prog.lateCount > 0 && (
          <span className="text-amber-600 dark:text-amber-300 inline-flex items-center gap-0.5">
            ⚠ {prog.lateCount}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkeletonRows                                                                */
/* -------------------------------------------------------------------------- */

function SkeletonRows() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="h-5 w-5 rounded-md bg-slate-100 animate-pulse dark:bg-slate-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            <div className="h-5 w-12 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EmptyState                                                                  */
/* -------------------------------------------------------------------------- */

function EmptyState({
  tab,
  search,
  dateRange,
  onAdd,
}: {
  tab: ScheduleTab;
  search: string;
  dateRange: string;
  onAdd: () => void;
}) {
  const isHistory = tab === 'history';
  const dateLabel =
    isHistory ? ''
    : dateRange === 'today' ? '今日'
    : dateRange === 'tomorrow' ? '明日'
    : dateRange === 'yesterday' ? '昨日'
    : dateRange === 'past7' ? '過去 7 天'
    : dateRange === 'all' ? '' : dateRange;
  return (
    <motion.div
      key={`empty-${tab}-${search}-${dateRange}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="flex flex-col items-center gap-2 py-12 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <FolderOpen width={20} height={20} />
        </div>
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
          {search
            ? '沒有符合條件的班次'
            : dateLabel
              ? `${dateLabel}尚無班次`
              : tab === 'all'
                ? '尚未建立任何班次'
                : `目前沒有${SCHEDULE_TABS.find((t) => t.id === tab)?.label}的班次`}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁 / 日期範圍。'
            : dateLabel
              ? '點擊下方按鈕立即為這天建立班次。'
              : '點擊右上角的「新增班次」按鈕以建立第一個班次。'}
        </p>
        <Button
          variant="primary"
          size="sm"
          startIcon={<Plus width={12} height={12} />}
          onClick={onAdd}
          className="mt-2"
        >
          {/* P2-5: 有日期上下文時按鈕帶日期 */}
          {dateLabel && !search ? `${dateLabel}新增班次` : '新增班次'}
        </Button>
      </div>
    </motion.div>
  );
}
