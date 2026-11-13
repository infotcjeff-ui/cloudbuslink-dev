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
  Users as UsersAllIcon,
  Sun,
  Sunset,
  Sparkles,
  FileSpreadsheet,
  Hash,
  Clock,
  Archive,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { filterByAcademicYear } from '@/lib/academic-year';
import { useAcademicYear } from '../../AcademicYearProvider';
import { useToast } from '@/components/ui/toast';
import { CopyChip } from '@/components/ui/copy-button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
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
import type { RouteTab } from './types';
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
  TAB_FADE_DURATION,
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
  const toast = useToast();
  // 學年範圍 (路線是分學年的 entity; 封存學年 → 唯讀)
  const { selectedYear, isReadOnly: yearReadOnly, readOnlyMessage } = useAcademicYear();
  const [tab, setTab] = React.useState<RouteTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);

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

  // 已刪除路線 (本機備份, 可還原)
  const [deletedRoutes, setDeletedRoutes] = React.useState<
    { id: string; deletedAt: string; route: Route | null }[]
  >([]);
  const [showDeleted, setShowDeleted] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  /** 重新讀取本機備份清單 */
  const loadDeletedRoutes = React.useCallback(async () => {
    const { listRestorableRoutes } = await import('@/lib/route-tombstones');
    setDeletedRoutes(listRestorableRoutes());
  }, []);

  React.useEffect(() => {
    void loadDeletedRoutes();
  }, [loadDeletedRoutes, routes]);

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
    // ⚠️ 學年篩選 — 路線是分學年的 entity, 每學年各有一套路線
    const byYear = filterByAcademicYear(routes, selectedYear);
    return byYear.filter((r) => {
      if (tab !== 'all' && r.shiftType !== tab) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
      );
    });
  }, [routes, tab, debouncedSearch, selectedYear]);

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
    // ⚠️ 封存學年 → 唯讀 (決策 D6)
    if (yearReadOnly) {
      toast.warning(readOnlyMessage.hint);
      return;
    }
    setFormModal({ open: true, mode: 'add', editingId: undefined });
  }, [yearReadOnly, toast]);

  const openEdit = React.useCallback((r: Route) => {
    if (yearReadOnly) {
      toast.warning(readOnlyMessage.hint);
      return;
    }
    setFormModal({ open: true, mode: 'edit', editingId: r.id });
  }, [yearReadOnly, toast]);

  const handleSave = React.useCallback(
    async (master: import('./types').RouteMasterInfo, stops: RouteStop[]) => {
      setIsSaving(true);
      try {
        const { STORAGE, resolveWriteAcademicYear } = await import('@/lib/storage');
        // 超管新增時若沒有所屬學校 → 掛到第一間學校 (cbl_routes.client_id 有 FK 必填)
        const clientId = (() => {
          try {
            const raw = localStorage.getItem('cbl_auth');
            const u = raw ? JSON.parse(raw) : null;
            if (u?.clientId) return u.clientId as string;
            if (u?.role === 'super_admin' || u?.role === 'system_admin') {
              const firstBus = STORAGE.buses.getAll()[0];
              if (firstBus?.clientId) return firstBus.clientId as string;
              const firstRoute = STORAGE.routes.getAll()[0];
              if (firstRoute?.clientId) return firstRoute.clientId as string;
            }
            return STORAGE.clients.getAll()[0]?.id || '';
          } catch {
            return STORAGE.clients.getAll()[0]?.id || '';
          }
        })();
        const now = new Date().toISOString();
        if (formModal.mode === 'add') {
          const newRoute = {
            id: STORAGE.genId('route'),
            clientId,
            code: master.code.trim(),
            // 學年蓋章: 路線屬於建立當下的現行學年
            academicYear: resolveWriteAcademicYear(clientId),
            name: master.name.trim(),
            shiftType: master.shiftType,
            // 已移除欄位 → 新增一律留空 (舊資料仍保留在 DB, 僅不再顯示/編輯)
            serviceDate: null,
            serviceTime: '',
            busId: '',
            driverId: '',
            nannyId: '',
            stops: stops.map((s, idx) => ({ ...s, seq: idx + 1 })),
            createdAt: now,
            updatedAt: now,
          };
          STORAGE.routes.add(newRoute);

          // 推回雲端 (背景)
          const { supabaseRouteRecords } = await import('@/lib/supabase-entities');
          const sbRes = await supabaseRouteRecords.add(newRoute);
          if (!sbRes.success) {
            console.warn('[TripsConsole] Supabase add failed:', sbRes.error);
            toast.warning(`路線已新增，但雲端同步失敗：${sbRes.error}`);
          }
        } else if (formModal.editingId) {
          const updates = {
            code: master.code.trim(),
            name: master.name.trim(),
            shiftType: master.shiftType,
            stops: stops.map((s, idx) => ({ ...s, seq: idx + 1 })),
          };
          STORAGE.routes.update(formModal.editingId, updates);

          // 推回雲端 (背景)
          const { supabaseRouteRecords } = await import('@/lib/supabase-entities');
          const sbRes = await supabaseRouteRecords.update(formModal.editingId, updates);
          if (!sbRes.success) {
            console.warn('[TripsConsole] Supabase update failed:', sbRes.error);
            toast.warning(`路線已更新，但雲端同步失敗：${sbRes.error}`);
          }
        }
        setFormModal((p) => ({ ...p, open: false }));
        if (formModal.mode === 'add') {
          toast.success(`路線「${master.name.trim()} (${master.code.trim()})」新增成功！`);
        } else {
          toast.success(`路線「${master.name.trim()} (${master.code.trim()})」更新成功！`);
        }
        window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
      } catch (err) {
        console.error('[TripsConsole] handleSave error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`儲存失敗：${msg}`);
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId, toast],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { STORAGE } = await import('@/lib/storage');
      const targetName = deleteTarget.name;

      // ⚠️ 先留墓碑 (含刪除前的完整內容 → 本機備份) 再刪 ——
      //   墓碑會讓這筆路線在任何一次雲端同步後都不會被拉回來,
      //   就算雲端刪除失敗 (RLS / 權限不足) 也不會「刪除後幾秒復活」。
      const { markRouteTombstoned, markCloudRouteDeleted } = await import('@/lib/route-tombstones');
      markRouteTombstoned(deleteTarget, deleteTarget.id);

      STORAGE.routes.remove(deleteTarget.id);

      // 推回雲端 (刪除)
      const { supabaseRouteRecords } = await import('@/lib/supabase-entities');
      const sbRes = await supabaseRouteRecords.remove(deleteTarget.id);
      if (!sbRes.success) {
        console.warn('[TripsConsole] Supabase delete failed:', sbRes.error);
        // 墓碑保留 (cloudDeleted=false) → 下次同步會自動重試刪除, 路線不會復活
        toast.warning(`路線已從本機刪除，但雲端同步失敗（將自動重試）：${sbRes.error}`);
      } else {
        // 雲端已確認刪除 → 標記完成, 但「備份」仍留在本機 (可還原)
        markCloudRouteDeleted(deleteTarget.id);
      }

      toast.success(`路線「${targetName}」已刪除`);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
    } catch (err) {
      console.error('[TripsConsole] handleDelete error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`刪除失敗：${msg}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, toast]);

  /* -------- 還原已刪除的路線 (本機備份) -------- */
  const handleRestore = React.useCallback(
    async (id: string) => {
      setRestoringId(id);
      try {
        const { restoreRouteFromTombstone } = await import('@/lib/route-tombstones');
        const route = await restoreRouteFromTombstone(id);
        if (!route) {
          toast.error('找不到這筆路線的備份');
          return;
        }
        toast.success(`路線「${route.name}」已還原`);
        await loadDeletedRoutes();
        window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
      } catch (err) {
        console.error('[TripsConsole] handleRestore error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`還原失敗：${msg}`);
      } finally {
        setRestoringId(null);
      }
    },
    [toast, loadDeletedRoutes],
  );

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows: Record<string, string | number>[] = [];
    filtered.forEach((r) => {
      // 一條路線展開成多列 (一列 = 一個站點)
      if (r.stops.length === 0) {
        rows.push({
          '路線編號': r.code,
          '路線名稱': r.name,
          '時段': SHIFT_LABEL[r.shiftType],
          '站點順序': '',
          '站點類型': '',
          '站點類別': '',
          '到站時間': '',
          '站點名稱': '',
          '備註': '',
        });
      } else {
        r.stops.forEach((s) => {
          rows.push({
            '路線編號': r.code,
            '路線名稱': r.name,
            '時段': SHIFT_LABEL[r.shiftType],
            '站點順序': s.seq,
            '站點類型': stopKindLabel(s.kind),
            '站點類別': s.kind,
            '到站時間': s.eta,
            '站點名稱': s.name,
            '備註': s.notes,
          });
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 10 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '路線');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `routes-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, tab]);

  /* -------- Render -------- */

  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
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
              管理校巴路線編號、班次時段, 以及上落車站點時間軸。
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
          startIcon={<FileSpreadsheet width={12} height={12} />}
          onClick={handleExportExcel}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? '沒有可匯出的資料' : '匯出為 Excel'}
        >
          匯出 Excel ({filtered.length})
        </Button>

        {/* 已刪除路線 (本機備份, 可還原) */}
        {deletedRoutes.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            startIcon={<Archive width={12} height={12} />}
            onClick={() => setShowDeleted((v) => !v)}
            title="查看已刪除的路線 (本機備份)"
          >
            已刪除 ({deletedRoutes.length})
          </Button>
        )}

        <div className="ml-auto">
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus width={12} height={12} />}
            onClick={openAdd}
            disabled={yearReadOnly}
            title={
              yearReadOnly
                ? '目前檢視的學年為唯讀 — 只能查看與匯出, 不能新增'
                : '新增路線'
            }
          >
            新增路線
          </Button>
        </div>
      </div>

      {/* L2b. 已刪除路線清單 (本機備份) */}
      {showDeleted && deletedRoutes.length > 0 && (
        <Card className="shrink-0">
          <SectionHeader
            icon={<Archive width={18} height={18} />}
            title="已刪除的路線"
            subtitle={`${deletedRoutes.length} 筆 · 雲端已刪除, 但本機保留完整備份, 可隨時還原`}
            accent="neutral"
          />
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {deletedRoutes.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-5 py-2.5 text-[12px]"
              >
                <Trash2 width={13} height={13} className="text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {d.route?.code ?? '—'}
                </span>
                <span className="truncate text-slate-600 dark:text-slate-300">
                  {d.route?.name ?? '（無名稱）'}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                  {d.route?.stops?.length ?? 0} 站點 · 刪除於{' '}
                  {new Date(d.deletedAt).toLocaleString('zh-HK')}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={restoringId === d.id}
                  onClick={() => handleRestore(d.id)}
                >
                  還原
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

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
              placeholder="搜尋編號 / 路線名…"
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
                onView={(r) => setViewing(r)}
                onEdit={openEdit}
                onDelete={(r) => setDeleteTarget(r)}
                readOnly={yearReadOnly}
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
  const title = search
    ? '沒有符合條件的路線'
    : tab === 'all'
      ? '尚未新增任何路線'
      : `目前沒有${SHIFT_OPTIONS_LABEL(tab)}的路線`;
  const description = search
    ? '嘗試不同的搜尋字串, 或切換分頁。'
    : '點擊右上角的「新增路線」按鈕以建立第一條路線。';
  return (
    <motion.div
      key={`empty-${tab}-${search}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <Empty className="border-0 bg-transparent py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RouteIcon className="w-6 h-6" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
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
  onView,
  onEdit,
  onDelete,
  readOnly = false,
}: {
  rows: Route[];
  onView: (r: Route) => void;
  onEdit: (r: Route) => void;
  onDelete: (r: Route) => void;
  /** 封存學年 → 唯讀模式 (不能編輯/刪除) */
  readOnly?: boolean;
}) {
  return (
    <table
      className="w-full">
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
        {rows.map((r) => {
          return (
            <tr
              key={r.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
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
                  </div>
                </div>
              </td>

              {/* 編號 (copyable chip) */}
              <td className="px-3 py-2.5">
                <CopyChip
                  value={r.code}
                  title="複製路線編號"
                  label="路線編號"
                  icon={<Hash width={9} height={9} />}
                />
              </td>

              {/* 時段 */}
              <td className="px-3 py-2.5">
                <Pill tone={SHIFT_TONE[r.shiftType]} size="sm">
                  {SHIFT_LABEL[r.shiftType]}
                </Pill>
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
                        {r.stops.reduce((acc, s) => acc + s.studentIds.length, 0)} 個
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
                  {/* ⚠️ 封存學年 → 唯讀 (決策 D6) */}
                  <IconButton
                    onClick={() => onEdit(r)}
                    title={readOnly ? '目前檢視的學年為唯讀 — 只能查看, 不能編輯' : '編輯路線'}
                    disabled={readOnly}
                  >
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(r)}
                    title={readOnly ? '目前檢視的學年為唯讀 — 只能查看, 不能刪除' : '刪除路線'}
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
