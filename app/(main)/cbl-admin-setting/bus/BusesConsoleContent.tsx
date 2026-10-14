'use client';

/**
 * BusesConsoleContent — OneFleet-style operator console
 *
 * 規格來源:
 *   md/organizations-page-style-reference.md
 *   md/vehicles-page-documentation.md (並把全校 / OneFleet 風格套到 /bus 簡化版)
 *
 * 範圍: 僅 /cbl-admin-setting/bus/ 內使用。
 *
 * 5-layer vertical stack:
 *   L1. Header Row (Title + Stat Tiles)
 *   L2. Action Toolbar
 *   L3. Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   L4. Modals
 *
 * 重用上方 primitives.tsx (Pill / Button / IconButton / Card / SectionHeader /
 * StatTile / FilterTabGroup) 與 BusFormModal, 不動全域任何檔案。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bus as BusIcon,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  Wrench,
  PowerOff,
  Users as UsersAllIcon,
  Wifi,
  WifiOff,
  UserCog,
  Hash,
  Copy,
  FileSpreadsheet,
  Calendar,
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
import { BusFormModal } from './BusFormModal';
import {
  EMPTY_BUS_FORM,
  type BusFormState,
  type BusTab,
} from './types';
import type { Bus, Driver, Student } from '@/lib/types';
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

const TAB_OPTIONS: FilterTabOption<BusTab>[] = [
  {
    value: 'all',
    label: '全部',
    icon: <BusIcon width={11} height={11} />,
  },
  {
    value: 'active',
    label: '運行中',
    icon: <CheckCircle2 width={11} height={11} />,
  },
  {
    value: 'maintenance',
    label: '維護中',
    icon: <Wrench width={11} height={11} />,
  },
  {
    value: 'inactive',
    label: '已停用',
    icon: <PowerOff width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  BusTab,
  { header: 'primary' | 'success' | 'warning' | 'danger'; pill: 'primary' | 'success' | 'warning' | 'danger'; iconColor: string }
> = {
  all: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  active: {
    header: 'success',
    pill: 'success',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
  },
  maintenance: {
    header: 'warning',
    pill: 'warning',
    iconColor: 'text-amber-600 dark:text-amber-300',
  },
  inactive: {
    header: 'danger',
    pill: 'danger',
    iconColor: 'text-rose-600 dark:text-rose-300',
  },
};

const PAGE_SIZE = 10;

/* -------------------------------------------------------------------------- */
/*  Status / helpers                                                            */
/* -------------------------------------------------------------------------- */

function statusBadge(status: Bus['status']) {
  if (status === 'active') {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        運行中
      </Pill>
    );
  }
  if (status === 'maintenance') {
    return (
      <Pill tone="warning" size="sm">
        <Dot tone="warning" />
        維護中
      </Pill>
    );
  }
  return (
    <Pill tone="danger" size="sm">
      <Dot tone="danger" />
      已停用
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 確認刪除對話框                                          */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  busLabel,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  busLabel: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bus-confirm-delete-backdrop"
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
            aria-labelledby="bus-confirm-delete-title"
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
                  id="bus-confirm-delete-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  確認刪除校巴
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷, 將一併移除綁定關係。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除校巴{' '}
                <span className="font-semibold">{busLabel}</span>？
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                若該校巴已被學生綁定, 將一併解除綁定關係。
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

export interface BusesConsoleContentProps {
  buses: Bus[];
  drivers: Driver[];
  students: Student[];
}

export function BusesConsoleContent({
  buses,
  drivers,
  students,
}: BusesConsoleContentProps) {
  const [tab, setTab] = React.useState<BusTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: BusFormState;
    editingId: string | undefined;
  }>({ open: false, mode: 'add', initial: EMPTY_BUS_FORM, editingId: undefined });
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Bus | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Edit / view stub
  const [, setViewing] = React.useState<Bus | null>(null);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return buses.filter((b) => {
      if (tab !== 'all' && b.status !== tab) return false;
      if (!q) return true;
      const driver = b.driverId ? drivers.find((d) => d.id === b.driverId) : null;
      return (
        b.plateNumber.toLowerCase().includes(q) ||
        b.model.toLowerCase().includes(q) ||
        (b.gpsDeviceId ?? '').toLowerCase().includes(q) ||
        (driver?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [buses, drivers, tab, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const total = buses.length;
  const activeCount = buses.filter((b) => b.status === 'active').length;
  const maintenanceCount = buses.filter((b) => b.status === 'maintenance').length;
  const inactiveCount = buses.filter((b) => b.status === 'inactive').length;
  const pairedCount = buses.filter((b) => !!b.gpsDeviceId).length;

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
    setFormModal({ open: true, mode: 'add', initial: EMPTY_BUS_FORM, editingId: undefined });
  }, []);

  const openEdit = React.useCallback((b: Bus) => {
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        plateNumber: b.plateNumber,
        model: b.model,
        capacity: String(b.capacity),
        driverId: b.driverId ?? '',
        gpsDeviceId: b.gpsDeviceId ?? '',
        status: b.status,
      },
      editingId: b.id,
    });
  }, []);

  const handleSave = React.useCallback(
    async (state: BusFormState) => {
      setIsSaving(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        // 取得 clientId (優先用目前登入用戶的 clientId, 若無則 fallback 到唯一 demo 客戶端)
        const clientId = (() => {
          try {
            const raw = localStorage.getItem('cbl_auth');
            const u = raw ? JSON.parse(raw) : null;
            if (u?.clientId) return u.clientId as string;
            // fallback: 找第一個 client (demo 階段只有一個客戶端)
            const clients = STORAGE.clients.getAll();
            return clients[0]?.id || '';
          } catch {
            const clients = STORAGE.clients.getAll();
            return clients[0]?.id || '';
          }
        })();
        if (!clientId) {
          console.error('[BusesConsole] 無法取得 clientId, 取消儲存');
          return;
        }
        const now = new Date().toISOString();
        if (formModal.mode === 'add') {
          STORAGE.buses.add({
            id: STORAGE.genId('bus'),
            clientId,
            plateNumber: state.plateNumber,
            model: state.model,
            capacity: Number(state.capacity),
            driverId: state.driverId || null,
            gpsDeviceId: state.gpsDeviceId || null,
            status: state.status,
            createdAt: now,
          });
        } else if (formModal.editingId) {
          STORAGE.buses.update(formModal.editingId, {
            plateNumber: state.plateNumber,
            model: state.model,
            capacity: Number(state.capacity),
            driverId: state.driverId || null,
            gpsDeviceId: state.gpsDeviceId || null,
            status: state.status,
          });
        }
        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
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
      // 解除綁定此校巴的學生
      const relatedStudents = students.filter((s) => s.busId === deleteTarget.id);
      relatedStudents.forEach((s) => {
        STORAGE.students.update(s.id, { busId: null });
      });
      STORAGE.buses.remove(deleteTarget.id);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
      window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, students]);

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
    window.setTimeout(() => setIsRefreshing(false), 400);
  }, []);

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((b) => {
      const driver = b.driverId ? drivers.find((d) => d.id === b.driverId) : null;
      const studentCount = students.filter((s) => s.busId === b.id).length;
      return {
        '車牌': b.plateNumber,
        '型號': b.model,
        '座位上限': b.capacity,
        '司機': driver?.name ?? '未指派',
        '司機電話': driver?.phone ?? '',
        'GPS 裝置 ID': b.gpsDeviceId ?? '',
        '狀態': b.status === 'active' ? '運行中' : b.status === 'maintenance' ? '維護中' : '已停用',
        '綁定學生數': studentCount,
        '建立日期': formatSystemAdminDate(b.createdAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '校巴名單');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `buses-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, drivers, students, tab]);

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
            <BusIcon width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                校巴
              </h1>
              <Pill tone="primary" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 輛
              </Pill>
              {maintenanceCount > 0 && (
                <Pill tone="warning" size="sm">
                  <Dot tone="warning" />
                  {maintenanceCount} 維護中
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理校巴基本資料、座位、司機指派、GPS 裝置與運行狀態。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
          <StatTile
            label="運行中"
            value={activeCount}
            hint={`${total} 輛總數`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="維護中"
            value={maintenanceCount}
            hint="暫停服務"
            icon={<Wrench width={12} height={12} />}
            tone="warning"
          />
          <StatTile
            label="已停用"
            value={inactiveCount}
            hint="已下線"
            icon={<PowerOff width={12} height={12} />}
            tone="danger"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="warning"
          size="sm"
          startIcon={<Wrench width={12} height={12} />}
          onClick={() => {
            setTab('maintenance');
            setPage(1);
          }}
        >
          檢視維護中
        </Button>
        {maintenanceCount > 0 && (
          <Pill tone="warning" size="sm">
            {maintenanceCount}
          </Pill>
        )}

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

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
            新增校巴
          </Button>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<BusIcon width={18} height={18} />}
          title={
            tab === 'all'
              ? '全部校巴'
              : tab === 'active'
              ? '運行中校巴'
              : tab === 'maintenance'
              ? '維護中校巴'
              : '已停用校巴'
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
            layoutId="buses-tab-pill"
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
              placeholder="搜尋車牌、型號、司機、GPS ID…"
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

        {/* L3c. Table scroll region — AnimatePresence 雙態 (empty / rows) */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {filtered.length === 0 ? (
              <EmptyState
                key={`empty-${tab}-${debouncedSearch}`}
                tab={tab}
                search={debouncedSearch}
              />
            ) : (
              <DataTable
                key={`rows-${tab}`}
                rows={pageItems}
                drivers={drivers}
                students={students}
                onView={(b) => setViewing(b)}
                onEdit={openEdit}
                onDelete={(b) => setDeleteTarget(b)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* L3d. Pagination footer */}
        {filtered.length > 0 && (
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
      <BusFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        editingPlate={
          formModal.editingId
            ? buses.find((b) => b.id === formModal.editingId)?.plateNumber
            : undefined
        }
        context={{ buses, drivers, students }}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        busLabel={
          deleteTarget
            ? `${deleteTarget.plateNumber} · ${deleteTarget.model}`
            : ''
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
              <div className="h-3 w-32 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            <div className="h-5 w-12 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
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
  tab: BusTab;
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
            ? '沒有符合條件的校巴'
            : tab === 'active'
            ? '目前沒有運行中的校巴'
            : tab === 'maintenance'
            ? '目前沒有維護中的校巴'
            : tab === 'inactive'
            ? '目前沒有已停用的校巴'
            : '尚未新增任何校巴'}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : '點擊右上角的「新增校巴」按鈕以建立第一輛校巴。'}
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                   */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  drivers,
  students,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Bus[];
  drivers: Driver[];
  students: Student[];
  onView: (b: Bus) => void;
  onEdit: (b: Bus) => void;
  onDelete: (b: Bus) => void;
}) {
  const driversById = React.useMemo(() => {
    const m = new Map<string, Driver>();
    drivers.forEach((d) => m.set(d.id, d));
    return m;
  }, [drivers]);

  const studentCountByBus = React.useMemo(() => {
    const m = new Map<string, number>();
    students.forEach((s) => {
      if (s.busId) m.set(s.busId, (m.get(s.busId) ?? 0) + 1);
    });
    return m;
  }, [students]);

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
            校巴
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            座位
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            司機
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            GPS 裝置
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            綁定學生
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            狀態
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b, idx) => {
          const driver = b.driverId ? driversById.get(b.driverId) : null;
          const studentCount = studentCountByBus.get(b.id) ?? 0;
          const utilization =
            b.capacity > 0 ? Math.round((studentCount / b.capacity) * 100) : 0;
          return (
            <motion.tr
              key={b.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.22,
                ease: ANIMATION_EASE,
                delay: Math.min(idx * ROW_STAGGER_BASE, ROW_STAGGER_CAP),
              }}
            >
              {/* 校巴 (icon + plate + model) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-md ring-1 ring-inset flex items-center justify-center',
                      b.status === 'active'
                        ? 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50'
                        : b.status === 'maintenance'
                        ? 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50'
                        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
                    )}
                  >
                    <BusIcon width={14} height={14} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[160px] dark:text-slate-100"
                      title={b.plateNumber}
                    >
                      {b.plateNumber}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate dark:text-slate-400">
                      {b.model || '— 未填型號 —'}
                    </p>
                  </div>
                </div>
              </td>

              {/* 座位 (copyable chip) */}
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(b.plateNumber).catch(() => {});
                    }
                  }}
                  title="複製車牌"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:text-slate-200"
                >
                  <Hash width={9} height={9} />
                  {b.capacity} 座
                  <Copy width={9} height={9} />
                </button>
              </td>

              {/* 司機 */}
              <td className="px-3 py-2.5">
                {driver ? (
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 w-fit">
                      <UserCog width={9} height={9} />
                      {driver.name}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      {driver.phone}
                    </span>
                  </div>
                ) : (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400">未指派</span>
                )}
              </td>

              {/* GPS 裝置 */}
              <td className="px-3 py-2.5">
                {b.gpsDeviceId ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50 font-mono">
                    <Wifi width={9} height={9} />
                    {b.gpsDeviceId}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <WifiOff width={9} height={9} />
                    未配對
                  </span>
                )}
              </td>

              {/* 綁定學生 */}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Pill tone="info" size="sm">
                    {studentCount} 生
                  </Pill>
                  {b.capacity > 0 && (
                    <span
                      className={cn(
                        'text-[10px] tabular-nums',
                        utilization >= 100
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : utilization >= 80
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {utilization}%
                    </span>
                  )}
                </div>
              </td>

              {/* 狀態 */}
              <td className="px-3 py-2.5">{statusBadge(b.status)}</td>

              {/* 操作 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => onView(b)} title="檢視 / 編輯校巴">
                    <Eye width={13} height={13} />
                  </IconButton>
                  <IconButton onClick={() => onEdit(b)} title="編輯校巴">
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(b)}
                    title="刪除校巴"
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
