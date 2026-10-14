'use client';

/**
 * TripsConsoleContent — OneFleet-style operator console
 *
 * 規格來源: md/organizations-page-style-reference.md (沿用 /students 設計語言)
 * 範圍: 僅 /cbl-admin-setting/bus/trips/ 內使用。
 *
 * 5-layer vertical stack:
 *   L1. Header Row (Title + Stat Tiles)
 *   L2. Action Toolbar
 *   L3. Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   L4. Modals
 *
 * 重用上方 primitives.tsx (Pill / Button / IconButton / Card / SectionHeader /
 * StatTile / FilterTabGroup) 與 TripRouteFormModal, 不動全域任何檔案。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Route as RouteIcon,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  Bus as BusIcon,
  Users as UsersAllIcon,
  Sun,
  Sunset,
  Sparkles,
  FileSpreadsheet,
  Hash,
  User as UserIcon,
  Copy,
  Clock,
  PowerOff,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import {
  Pill,
  Dot,
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from './primitives';
import { TripRouteFormModal } from './TripRouteFormModal';
import {
  SHIFT_TYPE_OPTIONS,
  type RouteTab,
} from './types';
import type {
  Route,
  RouteStop,
  Bus,
  Driver,
  Nanny,
  Student,
  RouteShiftType,
} from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
  ROW_STAGGER_BASE,
  ROW_STAGGER_CAP,
} from './design-tokens';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<RouteTab>[] = [
  { value: 'all',             label: '全部',     icon: <RouteIcon width={11} height={11} /> },
  { value: 'morning',         label: '早上上學', icon: <Sun width={11} height={11} /> },
  { value: 'afternoon',       label: '下午放學', icon: <Sunset width={11} height={11} /> },
  { value: 'extracurricular', label: '課外活動', icon: <Sparkles width={11} height={11} /> },
];

const TAB_ACCENT: Record<
  RouteTab,
  { header: 'primary' | 'warning' | 'violet' | 'neutral'; pill: 'primary' | 'warning' | 'violet' | 'neutral'; iconColor: string }
> = {
  all: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  morning: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-amber-500 dark:text-amber-300',
  },
  afternoon: {
    header: 'violet',
    pill: 'violet',
    iconColor: 'text-violet-600 dark:text-violet-300',
  },
  extracurricular: {
    header: 'warning',
    pill: 'warning',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
  },
};

const PAGE_SIZE = 10;

const SHIFT_LABEL: Record<RouteShiftType, string> = {
  morning: '早上上學',
  afternoon: '下午放學',
  extracurricular: '課外活動',
};

const SHIFT_TONE: Record<RouteShiftType, 'primary' | 'violet' | 'warning'> = {
  morning: 'primary',
  afternoon: 'violet',
  extracurricular: 'warning',
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function stopKindLabel(kind: RouteStop['kind']): string {
  return kind === 'origin' ? '起點' : kind === 'terminal' ? '終點' : '分站';
}

function stopKindTone(kind: RouteStop['kind']): 'success' | 'danger' | 'neutral' {
  return kind === 'origin' ? 'success' : kind === 'terminal' ? 'danger' : 'neutral';
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 確認刪除對話框                                          */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  routeLabel,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  routeLabel: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="route-confirm-delete-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: ANIMATION_EASE }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-confirm-delete-title"
            className="relative w-full max-w-[420px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14, ease: ANIMATION_EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 shrink-0 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                <Trash2 width={18} height={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="route-confirm-delete-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  確認刪除路線
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷, 將一併移除此路線所有站點。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除 <span className="font-semibold">{routeLabel}</span>？
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-end gap-2 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={onConfirm}
              >
                確認刪除
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main content                                                                */
/* -------------------------------------------------------------------------- */

export interface TripsConsoleContentProps {
  routes: Route[];
  buses: Bus[];
  drivers: Driver[];
  nannies: Nanny[];
  students: Student[];
  initiallyLoading?: boolean;
}

export function TripsConsoleContent({
  routes,
  buses,
  drivers,
  nannies,
  students,
  initiallyLoading = false,
}: TripsConsoleContentProps) {
  const [tab, setTab] = React.useState<RouteTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    editingId: string | undefined;
  }>({ open: false, mode: 'add', editingId: undefined });
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Route | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // View stub (edit + view share the same modal in v1)
  const [, setViewing] = React.useState<Route | null>(null);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Simulated initial load -------- */
  React.useEffect(() => {
    if (!initiallyLoading) return;
    setIsLoading(true);
    const id = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [initiallyLoading]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return routes.filter((r) => {
      if (tab !== 'all' && r.shiftType !== tab) return false;
      if (!q) return true;
      const bus = r.busId ? buses.find((b) => b.id === r.busId) : null;
      const driver = r.driverId ? drivers.find((d) => d.id === r.driverId) : null;
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        bus?.plateNumber.toLowerCase().includes(q) ||
        driver?.name.toLowerCase().includes(q)
      );
    });
  }, [routes, tab, debouncedSearch, buses, drivers]);

  /* -------- Stats (KPIs) -------- */
  const total = routes.length;
  const morningCount = routes.filter((r) => r.shiftType === 'morning').length;
  const afternoonCount = routes.filter((r) => r.shiftType === 'afternoon').length;
  const extraCount = routes.filter((r) => r.shiftType === 'extracurricular').length;

  /* -------- Pagination -------- */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

  /* -------- Handlers -------- */
  const openAdd = React.useCallback(() => {
    setFormModal({ open: true, mode: 'add', editingId: undefined });
  }, []);

  const openEdit = React.useCallback((r: Route) => {
    setFormModal({ open: true, mode: 'edit', editingId: r.id });
  }, []);

  const handleSave = React.useCallback(
    async (master: import('./types').RouteMasterInfo, stops: RouteStop[]) => {
      setIsSaving(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const clientId = (() => {
          try {
            const raw = localStorage.getItem('cbl_auth');
            return raw ? JSON.parse(raw)?.clientId || '' : '';
          } catch {
            return '';
          }
        })();
        const now = new Date().toISOString();
        if (formModal.mode === 'add') {
          STORAGE.routes.add({
            id: STORAGE.genId('route'),
            clientId,
            code: master.code.trim(),
            name: master.name.trim(),
            shiftType: master.shiftType,
            busId: master.busId,
            driverId: master.driverId,
            nannyId: master.nannyId,
            stops: stops.map((s, idx) => ({ ...s, seq: idx + 1 })),
            createdAt: now,
            updatedAt: now,
          });
        } else if (formModal.editingId) {
          STORAGE.routes.update(formModal.editingId, {
            code: master.code.trim(),
            name: master.name.trim(),
            shiftType: master.shiftType,
            busId: master.busId,
            driverId: master.driverId,
            nannyId: master.nannyId,
            stops: stops.map((s, idx) => ({ ...s, seq: idx + 1 })),
          });
        }
        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { STORAGE } = await import('@/lib/storage');
      STORAGE.routes.remove(deleteTarget.id);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
    window.setTimeout(() => setIsRefreshing(false), 400);
  }, []);

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows: Record<string, string | number>[] = [];
    filtered.forEach((r) => {
      const bus = r.busId ? buses.find((b) => b.id === r.busId) : null;
      const driver = r.driverId ? drivers.find((d) => d.id === r.driverId) : null;
      const nanny = r.nannyId ? nannies.find((n) => n.id === r.nannyId) : null;
      // 一條路線展開成多列 (一列 = 一個站點)
      if (r.stops.length === 0) {
        rows.push({
          '路線編號': r.code,
          '路線名稱': r.name,
          '時段': SHIFT_LABEL[r.shiftType],
          '車輛': bus?.plateNumber || '未指派',
          '司機': driver?.name || '未指派',
          '保姆': nanny?.name || '未指派',
          '站點順序': '',
          '站點類型': '',
          '站點類別': '',
          '到站時間': '',
          '站點名稱': '',
          '學生數': '',
          '備註': '',
        });
      } else {
        r.stops.forEach((s) => {
          rows.push({
            '路線編號': r.code,
            '路線名稱': r.name,
            '時段': SHIFT_LABEL[r.shiftType],
            '車輛': bus?.plateNumber || '未指派',
            '司機': driver?.name || '未指派',
            '保姆': nanny?.name || '未指派',
            '站點順序': s.seq,
            '站點類型': stopKindLabel(s.kind),
            '站點類別': s.kind,
            '到站時間': s.eta,
            '站點名稱': s.name,
            '學生數': s.studentIds.length,
            '備註': s.notes,
          });
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 8 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '路線');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `routes-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, buses, drivers, nannies, tab]);

  /* -------- Render -------- */

  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600 text-white shrink-0">
            <RouteIcon width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                校巴路線
              </h1>
              <Pill tone="primary" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 條
              </Pill>
              {extraCount > 0 && (
                <Pill tone="warning" size="sm">
                  <Dot tone="warning" />
                  {extraCount} 條課外
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理校巴路線編號、班次時段、車輛 / 司機 / 保姆, 以及上落車站點時間軸。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
          <StatTile
            label="早上"
            value={morningCount}
            hint="接學生到校"
            icon={<Sun width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="下午"
            value={afternoonCount}
            hint="送學生回家"
            icon={<Sunset width={12} height={12} />}
            tone="violet"
          />
          <StatTile
            label="課外"
            value={extraCount}
            hint="特快線"
            icon={<Sparkles width={12} height={12} />}
            tone="warning"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        {extraCount > 0 && (
          <>
            <Button
              variant="warning"
              size="sm"
              startIcon={<Sparkles width={12} height={12} />}
              onClick={() => setTab('extracurricular')}
            >
              檢視課外線
            </Button>
            <Pill tone="warning" size="sm">
              {extraCount}
            </Pill>
            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          </>
        )}

        <Button
          variant="secondary"
          size="sm"
          startIcon={<RefreshCw width={12} height={12} />}
          onClick={handleRefresh}
          isLoading={isRefreshing}
        >
          重新整理
        </Button>

        <Button
          variant="secondary"
          size="sm"
          startIcon={<FileSpreadsheet width={12} height={12} />}
          onClick={handleExportExcel}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? '沒有可匯出的資料' : '匯出為 Excel'}
        >
          匯出 Excel ({filtered.length})
        </Button>

        <div className="ml-auto">
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus width={12} height={12} />}
            onClick={openAdd}
          >
            新增路線
          </Button>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<RouteIcon width={18} height={18} />}
          title={
            tab === 'all' ? '全部路線' :
            tab === 'morning' ? '早上上學路線' :
            tab === 'afternoon' ? '下午放學路線' :
            '課外活動特快線'
          }
          subtitle={`${filtered.length} 筆 · ${TAB_OPTIONS.find((o) => o.value === tab)?.label ?? ''}`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {filtered.length}
            </Pill>
          }
        />

        {/* L3b. Filter Bar (tabs + refresh + search) */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="routes-tab-pill"
          />

          <IconButton
            onClick={handleRefresh}
            title="重新整理列表"
            variant="subtle"
          >
            <RefreshCw
              width={13}
              height={13}
              className={cn(isRefreshing && 'animate-spin text-blue-600')}
            />
          </IconButton>

          <div className="relative ml-auto min-w-[220px]">
            <Search
              width={11}
              height={11}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋編號 / 路線名 / 車牌 / 司機…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="清除搜尋"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* L3c. Table scroll region */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {isLoading ? (
              <SkeletonRows key="loading" />
            ) : filtered.length === 0 ? (
              <EmptyState
                key={`empty-${tab}-${debouncedSearch}`}
                tab={tab}
                search={debouncedSearch}
              />
            ) : (
              <DataTable
                key={`rows-${tab}`}
                rows={pageItems}
                buses={buses}
                drivers={drivers}
                nannies={nannies}
                onView={(r) => setViewing(r)}
                onEdit={openEdit}
                onDelete={(r) => setDeleteTarget(r)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* L3d. Pagination footer */}
        {!isLoading && filtered.length > 0 && (
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
                {filtered.length}
              </span>
              筆
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              <Dot tone="primary" />
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

      {/* L4. Modals */}
      <TripRouteFormModal
        open={formModal.open}
        mode={formModal.mode}
        editingRouteId={formModal.editingId}
        context={{ routes, buses, drivers, nannies, students }}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        routeLabel={
          deleteTarget ? `${deleteTarget.code} · ${deleteTarget.name}` : ''
        }
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkeletonRows — Loading state                                                */
/* -------------------------------------------------------------------------- */

function SkeletonRows() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse dark:bg-slate-800" />
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
}: {
  tab: RouteTab;
  search: string;
}) {
  return (
    <motion.div
      key={`empty-${tab}-${search}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="flex flex-col items-center gap-2 py-12 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <FolderOpen width={20} height={20} />
        </div>
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
          {search
            ? '沒有符合條件的路線'
            : tab === 'all'
            ? '尚未新增任何路線'
            : `目前沒有${SHIFT_OPTIONS_LABEL(tab)}的路線`}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : '點擊右上角的「新增路線」按鈕以建立第一條路線。'}
        </p>
      </div>
    </motion.div>
  );
}

function SHIFT_OPTIONS_LABEL(tab: RouteTab): string {
  if (tab === 'morning') return '早上上學';
  if (tab === 'afternoon') return '下午放學';
  if (tab === 'extracurricular') return '課外活動';
  return '';
}

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                   */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  buses,
  drivers,
  nannies,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Route[];
  buses: Bus[];
  drivers: Driver[];
  nannies: Nanny[];
  onView: (r: Route) => void;
  onEdit: (r: Route) => void;
  onDelete: (r: Route) => void;
}) {
  const busesById = React.useMemo(() => {
    const m = new Map<string, Bus>();
    buses.forEach((b) => m.set(b.id, b));
    return m;
  }, [buses]);
  const driversById = React.useMemo(() => {
    const m = new Map<string, Driver>();
    drivers.forEach((d) => m.set(d.id, d));
    return m;
  }, [drivers]);
  const nanniesById = React.useMemo(() => {
    const m = new Map<string, Nanny>();
    nannies.forEach((n) => m.set(n.id, n));
    return m;
  }, [nannies]);

  return (
    <motion.table
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            路線
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            編號
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            時段
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            車輛 / 司機
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            保姆
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            站點
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            建立日期
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const bus = r.busId ? busesById.get(r.busId) : null;
          const driver = r.driverId ? driversById.get(r.driverId) : null;
          const nanny = r.nannyId ? nanniesById.get(r.nannyId) : null;
          return (
            <motion.tr
              key={r.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.22,
                ease: ANIMATION_EASE,
                delay: Math.min(idx * ROW_STAGGER_BASE, ROW_STAGGER_CAP),
              }}
            >
              {/* 路線 (icon + name) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100 flex items-center justify-center dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50">
                    <RouteIcon width={14} height={14} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[200px] dark:text-slate-100"
                      title={r.name}
                    >
                      {r.name}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <UserIcon width={9} height={9} />
                      {driver?.name || '— 未指派司機 —'}
                    </p>
                  </div>
                </div>
              </td>

              {/* 編號 (copyable chip) */}
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(r.code).catch(() => {});
                    }
                  }}
                  title="複製路線編號"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:text-slate-200"
                >
                  <Hash width={9} height={9} />
                  {r.code}
                  <Copy width={9} height={9} />
                </button>
              </td>

              {/* 時段 */}
              <td className="px-3 py-2.5">
                <Pill tone={SHIFT_TONE[r.shiftType]} size="sm">
                  {SHIFT_LABEL[r.shiftType]}
                </Pill>
              </td>

              {/* 車輛 / 司機 */}
              <td className="px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 w-fit">
                    <BusIcon width={9} height={9} />
                    {bus ? `${bus.plateNumber} · ${bus.capacity}座` : '未指派'}
                  </span>
                  {driver && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
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

              {/* 站點 (起 / 終 / 學生總數) */}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1 flex-wrap">
                  {r.stops.length === 0 ? (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400">無站點</span>
                  ) : (
                    <>
                      <Pill tone={stopKindTone(r.stops[0].kind)} size="sm">
                        1. {stopKindLabel(r.stops[0].kind)}
                      </Pill>
                      <span className="text-slate-300 dark:text-slate-600 text-[10px]">→</span>
                      {r.stops.length > 2 && (
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          {r.stops.length - 2} 站
                        </span>
                      )}
                      {r.stops.length >= 2 && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600 text-[10px]">→</span>
                          <Pill tone={stopKindTone(r.stops[r.stops.length - 1].kind)} size="sm">
                            {r.stops.length}. {stopKindLabel(r.stops[r.stops.length - 1].kind)}
                          </Pill>
                        </>
                      )}
                      <Pill tone="neutral" size="sm" className="ml-1">
                        {r.stops.reduce((acc, s) => acc + s.studentIds.length, 0)} 生
                      </Pill>
                    </>
                  )}
                </div>
              </td>

              {/* 建立日期 */}
              <td className="px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1">
                  <Clock width={11} height={11} className="text-slate-400" />
                  <span className="tabular-nums">{formatSystemAdminDate(r.createdAt)}</span>
                </span>
              </td>

              {/* 操作 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => onView(r)} title="檢視 / 編輯路線">
                    <Eye width={13} height={13} />
                  </IconButton>
                  <IconButton onClick={() => onEdit(r)} title="編輯路線">
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(r)}
                    title="刪除路線"
                    variant="danger"
                  >
                    <PowerOff width={13} height={13} />
                  </IconButton>
                </div>
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </motion.table>
  );
}

/* -------------------------------------------------------------------------- */
/*  Date format helper                                                          */
/* -------------------------------------------------------------------------- */

function formatSystemAdminDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
