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
  FolderOpen,
  CheckCircle2,
  Wrench,
  PowerOff,
  Users as UsersAllIcon,
  Wifi,
  WifiOff,
  UserCog,
  Hash,
  FileSpreadsheet,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { CopyChip } from '@/components/ui/copy-button';
import { supabaseBuses } from '@/lib/supabase-buses';
import { dispatchNannyRefresh } from '@/lib/cbl-events';
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
import type { Bus, Driver, Nanny, Student } from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
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
  nannies?: Nanny[];
  students: Student[];
}

export function BusesConsoleContent({
  buses: initialBuses,
  drivers: initialDrivers,
  nannies: initialNannies = [],
  students: initialStudents,
}: BusesConsoleContentProps) {
  const toast = useToast();
  const [tab, setTab] = React.useState<BusTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  // 在組件內部管理狀態, 確保新增/刪除後立即更新列表
  // 初始值: 優先用 props 傳入的資料, 若為空則立即從 LocalStorage 讀取 (避免首次 mount 空閃)
  // 超管 (super_admin / system_admin) 沒有 clientId → 讀全部 (跨機構管理)
  const resolveVisible = <T,>(getAll: () => T[], getByClient: (cid: string) => T[]): T[] => {
    try {
      const { STORAGE } = require('@/lib/storage');
      const raw = localStorage.getItem('cbl_auth');
      const u = raw ? JSON.parse(raw) : null;
      const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
      if (superMode) return getAll();
      const cid = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
      return cid ? getByClient(cid) : [];
    } catch {
      return [];
    }
  };
  const [buses, setBuses] = React.useState<Bus[]>(() => {
    if (initialBuses.length > 0) return initialBuses;
    if (typeof window === 'undefined') return [];
    try {
      const { STORAGE } = require('@/lib/storage');
      return resolveVisible<Bus>(
        () => STORAGE.buses.getAll(),
        (cid) => STORAGE.buses.getByClient(cid),
      );
    } catch {
      return [];
    }
  });
  const [drivers, setDrivers] = React.useState<Driver[]>(() => {
    if (initialDrivers.length > 0) return initialDrivers;
    if (typeof window === 'undefined') return [];
    try {
      const { STORAGE } = require('@/lib/storage');
      return resolveVisible<Driver>(
        () => STORAGE.drivers.getAll(),
        (cid) => STORAGE.drivers.getByClient(cid),
      );
    } catch {
      return [];
    }
  });
  const [students, setStudents] = React.useState<Student[]>(() => {
    if (initialStudents.length > 0) return initialStudents;
    if (typeof window === 'undefined') return [];
    try {
      const { STORAGE } = require('@/lib/storage');
      return resolveVisible<Student>(
        () => STORAGE.students.getAll(),
        (cid) => STORAGE.students.getByClient(cid),
      );
    } catch {
      return [];
    }
  });
  const [nannies, setNannies] = React.useState<Nanny[]>(() => {
    if (initialNannies.length > 0) return initialNannies;
    if (typeof window === 'undefined') return [];
    try {
      const { STORAGE } = require('@/lib/storage');
      return resolveVisible<Nanny>(
        () => STORAGE.nannies.getAll(),
        (cid) => STORAGE.nannies.getByClient(cid),
      );
    } catch {
      return [];
    }
  });

  // 當 prop 變化且新值非空時同步內部狀態 (避免初次 mount 的空陣列覆蓋 LocalStorage 資料)
  // 邏輯: 內部已有資料就保留 (使用者操作優先), 只有 prop 是新資料才採用
  React.useEffect(() => {
    if (initialBuses.length > 0) {
      setBuses((prev) => {
        // 若內部已有資料 (>= prop 數量), 保留內部資料 (含本地新增)
        // 若 prop 有更多資料 (例如 Supabase 同步回來), 用 prop
        return initialBuses.length >= prev.length ? initialBuses : prev;
      });
    }
  }, [initialBuses]);
  React.useEffect(() => {
    if (initialDrivers.length > 0) {
      setDrivers((prev) => {
        return initialDrivers.length >= prev.length ? initialDrivers : prev;
      });
    }
  }, [initialDrivers]);
  React.useEffect(() => {
    if (initialStudents.length > 0) {
      setStudents((prev) => {
        return initialStudents.length >= prev.length ? initialStudents : prev;
      });
    }
  }, [initialStudents]);
  React.useEffect(() => {
    if (initialNannies.length > 0) {
      setNannies((prev) => {
        return initialNannies.length >= prev.length ? initialNannies : prev;
      });
    }
  }, [initialNannies]);

  // 監聽 refresh 事件, 重新從 LocalStorage 讀取 (超管讀全部)
  React.useEffect(() => {
    const reloadVisible = (
      set: (v: any) => void,
      getAll: () => any[],
      getByClient: (cid: string) => any[],
    ) => {
      try {
        const { STORAGE } = require('@/lib/storage');
        const raw = localStorage.getItem('cbl_auth');
        const u = raw ? JSON.parse(raw) : null;
        const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
        if (superMode) {
          set(getAll());
          return;
        }
        const clientId = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
        if (clientId) {
          set(getByClient(clientId));
        }
      } catch (e) {
        console.warn('[BusesConsole] Failed to refresh:', e);
      }
    };
    const onBusesRefresh = () => {
      const { STORAGE } = require('@/lib/storage');
      reloadVisible(
        (v: Bus[]) => setBuses(v),
        () => STORAGE.buses.getAll(),
        (cid) => STORAGE.buses.getByClient(cid),
      );
    };
    const onDriversRefresh = () => {
      const { STORAGE } = require('@/lib/storage');
      reloadVisible(
        (v: Driver[]) => setDrivers(v),
        () => STORAGE.drivers.getAll(),
        (cid) => STORAGE.drivers.getByClient(cid),
      );
    };
    const onStudentsRefresh = () => {
      const { STORAGE } = require('@/lib/storage');
      reloadVisible(
        (v: Student[]) => setStudents(v),
        () => STORAGE.students.getAll(),
        (cid) => STORAGE.students.getByClient(cid),
      );
    };
    const onNanniesRefresh = () => {
      const { STORAGE } = require('@/lib/storage');
      reloadVisible(
        (v: Nanny[]) => setNannies(v),
        () => STORAGE.nannies.getAll(),
        (cid) => STORAGE.nannies.getByClient(cid),
      );
    };

    window.addEventListener('cbl-buses-refresh', onBusesRefresh);
    window.addEventListener('cbl-drivers-refresh', onDriversRefresh);
    window.addEventListener('cbl-students-refresh', onStudentsRefresh);
    // 保姆事件有兩種拼法並存 → 兩種都要監聽
    window.addEventListener('cbl-nannys-refresh', onNanniesRefresh);
    window.addEventListener('cbl-nannies-refresh', onNanniesRefresh);
    return () => {
      window.removeEventListener('cbl-buses-refresh', onBusesRefresh);
      window.removeEventListener('cbl-drivers-refresh', onDriversRefresh);
      window.removeEventListener('cbl-students-refresh', onStudentsRefresh);
      window.removeEventListener('cbl-nannys-refresh', onNanniesRefresh);
      window.removeEventListener('cbl-nannies-refresh', onNanniesRefresh);
    };
  }, []);

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
      const nannyIds = nannies.filter((n) => n.assignedBusIds.includes(b.id)).map((n) => n.id);
      const nannyHit = nannies.some(
        (n) => nannyIds.includes(n.id) && (n.name.toLowerCase().includes(q) || (n.employeeId ?? '').toLowerCase().includes(q)),
      );
      return (
        b.plateNumber.toLowerCase().includes(q) ||
        b.model.toLowerCase().includes(q) ||
        (b.gpsDeviceId ?? '').toLowerCase().includes(q) ||
        (driver?.name.toLowerCase().includes(q) ?? false) ||
        nannyHit
      );
    });
  }, [buses, drivers, nannies, tab, debouncedSearch]);

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
    // 從現有綁定推導初始值
    const boundStudentIds = students
      .filter((s) => s.busId === b.id)
      .map((s) => s.id);
    // 保姆綁定是反向存 (Nanny.assignedBusIds 含此車) — 必須推導, 否則編輯時永遠空白
    const boundNanny = nannies.find((n) => (n.assignedBusIds ?? []).includes(b.id));
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        plateNumber: b.plateNumber,
        model: b.model,
        capacity: String(b.capacity),
        driverId: b.driverId ?? '',
        companyId: b.companyId ?? '',
        nannyId: boundNanny?.id ?? '',
        gpsDeviceId: b.gpsDeviceId ?? '',
        status: b.status,
        studentIds: boundStudentIds,
      },
      editingId: b.id,
    });
  }, [students, nannies]);

  /**
   * 把 studentIds (multi-select) 同步到 storage 與 state。
   *
   * 規則:
   *  - selectedIds 內的學生 → busId = busId
   *  - 「原本」綁這輛但 selectedIds 沒有 → busId = null (解除綁定)
   *  - selectedIds 內但原本綁別輛 → 換綁 (busId = busId)
   *
   * 用「set diff」避免無謂寫入。
   */
  const syncStudentBindings = React.useCallback(
    (busId: string, selectedIds: string[]) => {
      const selected = new Set(selectedIds);
      const previous = new Set(
        students.filter((s) => s.busId === busId).map((s) => s.id),
      );

      // 1. 找出需綁 (在 selected 但不是 previous) — 包括「原本綁別輛」的換綁
      const toBind = [...selected].filter((id) => !previous.has(id));
      // 2. 找出需解除 (在 previous 但不在 selected)
      const toUnbind = [...previous].filter((id) => !selected.has(id));

      if (toBind.length === 0 && toUnbind.length === 0) return;

      // 更新 LocalStorage
      const { STORAGE } = require('@/lib/storage') as typeof import('@/lib/storage');
      toBind.forEach((sid) => STORAGE.students.update(sid, { busId }));
      toUnbind.forEach((sid) => STORAGE.students.update(sid, { busId: null }));

      // 同步本地 state (讓 UI 即時更新)
      setStudents((prev) =>
        prev.map((s) => {
          if (toBind.includes(s.id)) return { ...s, busId };
          if (toUnbind.includes(s.id)) return { ...s, busId: null };
          return s;
        }),
      );
    },
    [students],
  );

  /**
   * 把跟車保姆 (單選) 同步到 Nanny.assignedBusIds (反向綁定)。
   *
   * 背景: Bus 本體沒有 nannyId 欄位, 綁定只存在 Nanny.assignedBusIds。
   * 若這裡不寫, BusFormModal 選的保姆會在存檔時被丟掉,
   * 路線頁選車後就找不到已綁保姆 (永遠空白)。
   *
   * 規則 (單選語意):
   *  - nannyId 有值 → 該保姆的 assignedBusIds 必須含此車; 其他原本含此車的保姆一律移除
   *    (否則路線頁 find() 會抓到舊保姆, 不是使用者剛選的)
   *  - nannyId 為空 → 所有含此車的保姆一律移除 (解除綁定)
   */
  const syncNannyBinding = React.useCallback(
    async (busId: string, nannyId: string) => {
      const { STORAGE } = await import('@/lib/storage');
      const { supabaseNannies } = await import('@/lib/supabase-entities');
      const all = STORAGE.nannies.getAll();
      const prevBound = all.filter((n: Nanny) => (n.assignedBusIds ?? []).includes(busId));
      const prevIds = new Set(prevBound.map((n: Nanny) => n.id));
      const nextIds = new Set(nannyId ? [nannyId] : []);

      const toAdd = [...nextIds].filter((id) => !prevIds.has(id));
      const toRemove = [...prevIds].filter((id) => !nextIds.has(id));
      if (toAdd.length === 0 && toRemove.length === 0) return;

      toAdd.forEach((nid) => {
        const cur = STORAGE.nannies.getById(nid);
        if (!cur) return;
        const next = Array.from(new Set([...(cur.assignedBusIds ?? []), busId]));
        STORAGE.nannies.update(nid, { assignedBusIds: next });
      });
      toRemove.forEach((nid) => {
        const cur = STORAGE.nannies.getById(nid);
        if (!cur) return;
        STORAGE.nannies.update(nid, {
          assignedBusIds: (cur.assignedBusIds ?? []).filter((b: string) => b !== busId),
        });
      });

      // 同步本地 state (讓 UI 即時更新)
      setNannies((prev) =>
        prev.map((n) => {
          if (toAdd.includes(n.id))
            return { ...n, assignedBusIds: Array.from(new Set([...(n.assignedBusIds ?? []), busId])) };
          if (toRemove.includes(n.id))
            return { ...n, assignedBusIds: (n.assignedBusIds ?? []).filter((b) => b !== busId) };
          return n;
        }),
      );

      // 背景推回雲端 (逐筆 update, 失敗只 warn)
      for (const nid of [...toAdd, ...toRemove]) {
        try {
          const cur = STORAGE.nannies.getById(nid);
          if (!cur) continue;
          const res = await supabaseNannies.update(nid, { assignedBusIds: cur.assignedBusIds } as any);
          if (!res.success) console.warn('[BusesConsole] nanny cloud sync failed:', res.error);
        } catch (e) {
          console.warn('[BusesConsole] nanny cloud sync error:', e);
        }
      }

      // 通知保姆頁 / 路線頁重讀 (兩種拼法都送, 相容歷史 typo)
      dispatchNannyRefresh();
    },
    [],
  );

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
          toast.error('無法取得客戶端資訊，請重新登入');
          return;
        }
        const now = new Date().toISOString();

        if (formModal.mode === 'add') {
          // driverId 直接採用使用者選擇 — 雲端同步由 supabaseBuses 內部保證
          // (若司機尚未在雲端, 會自動用本機資料補建; 補不了才降級為 null)。
          // 這裡不再預先檢查 / 阻擋儲存, 避免雲端短暫失敗就讓整筆校巴存不下來。
          const resolvedDriverId: string | null = state.driverId || null;

          const newBus: Bus = {
            id: STORAGE.genId('bus'),
            clientId,
            plateNumber: state.plateNumber,
            model: state.model,
            capacity: Number(state.capacity),
            driverId: resolvedDriverId,
            gpsDeviceId: state.gpsDeviceId || null,
            status: state.status,
            // 未綁 808 設備前不設假定位 — 主頁只顯示 808 真實定位
            currentLocation: undefined,
            createdAt: now,
          };

          // 1. 先存入 LocalStorage (即時顯示)
          STORAGE.buses.add(newBus);

          // 2. 立即更新內部狀態 (確保列表立即顯示, 不依賴事件)
          setBuses((prev) => [...prev, newBus]);

          // 2.5 同步學生綁定 (新增模式: 只需把選中的學生綁到新車上)
          if (state.studentIds.length > 0) {
            state.studentIds.forEach((sid) => {
              STORAGE.students.update(sid, { busId: newBus.id });
            });
            setStudents((prev) =>
              prev.map((s) =>
                state.studentIds.includes(s.id) ? { ...s, busId: newBus.id } : s,
              ),
            );
          }

          // 2.6 同步跟車保姆綁定 (反向寫 Nanny.assignedBusIds, 否則路線頁選車帶不出保姆)
          await syncNannyBinding(newBus.id, state.nannyId || '');

          // 3. 同步到 Supabase (背景執行)
          const supabaseResult = await supabaseBuses.add(newBus);
          if (!supabaseResult.success) {
            console.warn('[BusesConsole] Supabase sync failed:', supabaseResult.error);
            // LocalStorage 已成功，仍顯示成功但加 warning
            toast.warning(`校巴已新增，但 Supabase 同步失敗: ${supabaseResult.error}`);
          } else {
            toast.success(`校巴 ${state.plateNumber} 新增成功！`);
          }
        } else if (formModal.editingId) {
          // 同 add 模式: driver 保證交給 supabaseBuses, 不在 UI 層阻擋儲存。
          const resolvedDriverId: string | null = state.driverId || null;

          const updates: Partial<Bus> = {
            plateNumber: state.plateNumber,
            model: state.model,
            capacity: Number(state.capacity),
            driverId: resolvedDriverId,
            gpsDeviceId: state.gpsDeviceId || null,
            status: state.status,
          };

          // 1. 先更新 LocalStorage (即時顯示)
          STORAGE.buses.update(formModal.editingId, updates);

          // 2. 立即更新內部狀態
          setBuses((prev) =>
            prev.map((b) =>
              b.id === formModal.editingId ? { ...b, ...updates } : b,
            ),
          );

          // 2.5 同步學生綁定 (diff 模式: 處理換綁與解除綁定)
          syncStudentBindings(formModal.editingId, state.studentIds);

          // 2.6 同步跟車保姆綁定 (反向寫 Nanny.assignedBusIds, 否則路線頁選車帶不出保姆)
          await syncNannyBinding(formModal.editingId, state.nannyId || '');

          // 3. 同步到 Supabase (背景執行)
          const supabaseResult = await supabaseBuses.update(formModal.editingId, updates);
          if (!supabaseResult.success) {
            console.warn('[BusesConsole] Supabase sync failed:', supabaseResult.error);
            toast.warning(`校巴已更新，但 Supabase 同步失敗: ${supabaseResult.error}`);
          } else {
            toast.success(`校巴 ${state.plateNumber} 更新成功！`);
          }
        }
        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
        dispatchNannyRefresh();
        // 若有變動 student 綁定, 也通知學生頁更新
        if (state.studentIds.length > 0 || formModal.mode === 'edit') {
          window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
        }
      } catch (err) {
        console.error('[BusesConsole] handleSave error:', err);
        toast.error('儲存失敗，請稍後再試');
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId, toast, syncStudentBindings, syncNannyBinding],
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

      // 立即更新內部狀態
      setBuses((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      // 也更新學生狀態 (解除綁定)
      setStudents((prev) =>
        prev.map((s) => (s.busId === deleteTarget.id ? { ...s, busId: null } : s)),
      );
      // 解除保姆反向綁定 (Nanny.assignedBusIds 移除此車, 否則殘留 dangling 引用)
      try {
        const boundNannies = STORAGE.nannies.getAll().filter((n: Nanny) => (n.assignedBusIds ?? []).includes(deleteTarget.id));
        boundNannies.forEach((n: Nanny) => {
          STORAGE.nannies.update(n.id, {
            assignedBusIds: (n.assignedBusIds ?? []).filter((bid: string) => bid !== deleteTarget.id),
          });
        });
        if (boundNannies.length > 0) {
          setNannies((prev) =>
            prev.map((n) =>
              (n.assignedBusIds ?? []).includes(deleteTarget.id)
                ? { ...n, assignedBusIds: (n.assignedBusIds ?? []).filter((bid) => bid !== deleteTarget.id) }
                : n,
            ),
          );
          const { supabaseNannies } = await import('@/lib/supabase-entities');
          for (const n of boundNannies) {
            try {
              const cur = STORAGE.nannies.getById(n.id);
              if (!cur) continue;
              const res = await supabaseNannies.update(n.id, { assignedBusIds: cur.assignedBusIds } as any);
              if (!res.success) console.warn('[BusesConsole] nanny unbind cloud sync failed:', res.error);
            } catch (e) {
              console.warn('[BusesConsole] nanny unbind cloud sync error:', e);
            }
          }
        }
      } catch (e) {
        console.warn('[BusesConsole] nanny unbind failed:', e);
      }

      // 同步刪除到 Supabase (背景執行)
      const supabaseResult = await supabaseBuses.delete(deleteTarget.id);
      if (!supabaseResult.success) {
        console.warn('[BusesConsole] Supabase delete sync failed:', supabaseResult.error);
        toast.warning(`校巴已刪除，但 Supabase 同步失敗: ${supabaseResult.error}`);
      } else {
        toast.success(`校巴 ${deleteTarget.plateNumber} 已刪除`);
      }

      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
      window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
    } catch (err) {
      console.error('[BusesConsole] handleDelete error:', err);
      toast.error('刪除失敗，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, students, toast]);

  const [isSyncing, setIsSyncing] = React.useState(false);

  /* -------- 從 808 GPS 同步車輛 (以 808 為準) -------- */
  const handleSyncFrom808 = React.useCallback(async () => {
    setIsSyncing(true);
    try {
      const { syncFrom808, normPlate } = await import('@/lib/onefleet');
      const { STORAGE } = await import('@/lib/storage');
      const res = await syncFrom808();
      if (!res.ok) {
        toast.error(res.error || '808 同步失敗');
        return;
      }
      const raw = localStorage.getItem('cbl_auth');
      const u = raw ? JSON.parse(raw) : null;
      const clientId: string =
        (u?.clientId as string) || STORAGE.clients.getAll()[0]?.id || '';
      if (!clientId) {
        toast.error('找不到學校資料, 請先建立學校');
        return;
      }
      const now = new Date().toISOString();
      let added = 0;
      let updated = 0;
      const existing = STORAGE.buses.getAll();
      const byPlate = new Map(existing.map((b) => [normPlate(b.plateNumber), b]));
      const byDevice = new Map(
        existing.filter((b) => b.gpsDeviceId).map((b) => [b.gpsDeviceId as string, b]),
      );
      for (const v of res.vehicles) {
        const plate = (v.plate || '').toUpperCase().trim();
        if (!plate) continue;
        const pos = res.byDeviceId[v.deviceId] || (plate ? res.byPlate[normPlate(plate)] : undefined);
        const matched = (v.deviceId && byDevice.get(v.deviceId)) || byPlate.get(normPlate(plate));
        const loc = pos
          ? {
              latitude: pos.latitude,
              longitude: pos.longitude,
              speed: pos.speed,
              lastUpdated: now,
              address: pos.address,
              gpsTime: pos.gpsTime,
              online: pos.online,
            }
          : undefined;
        if (matched) {
          const patch: Partial<Bus> = {};
          if (v.deviceId && matched.gpsDeviceId !== v.deviceId) patch.gpsDeviceId = v.deviceId;
          if (matched.status === 'inactive' && pos?.online) patch.status = 'active';
          if (loc) patch.currentLocation = loc;
          if (Object.keys(patch).length > 0) {
            STORAGE.buses.update(matched.id, patch);
            updated += 1;
          }
        } else {
          STORAGE.buses.add({
            id: STORAGE.genId('bus'),
            clientId,
            plateNumber: plate,
            model: '未知型號 (808 同步)',
            capacity: 28,
            driverId: null,
            gpsDeviceId: v.deviceId || null,
            status: pos?.online ? 'active' : 'active',
            currentLocation: loc,
            createdAt: now,
          });
          added += 1;
        }
      }
      // 重新讀回列表 (超管讀全部)
      try {
        const { STORAGE: S2 } = await import('@/lib/storage');
        const rawU = localStorage.getItem('cbl_auth');
        const uu = rawU ? JSON.parse(rawU) : null;
        const superMode = uu?.role === 'super_admin' || uu?.role === 'system_admin';
        setBuses(superMode ? S2.buses.getAll() : S2.buses.getByClient(clientId));
      } catch { /* noop */ }
      window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
      toast.success(`808 同步完成: 新增 ${added} 輛, 更新 ${updated} 輛 (共 ${res.vehicles.length} 輛)`);
    } catch (e) {
      toast.error(`808 同步失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSyncing(false);
    }
  }, [toast]);

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
          onClick={handleSyncFrom808}
          disabled={isSyncing}
          title="以 808 GPS 為準: 拉回車輛 + 設備號 + 即時位置"
        >
          {isSyncing ? '同步中…' : '從 808 GPS 同步車輛'}
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
        editingId={formModal.editingId}
        context={{ buses, drivers, nannies, students }}
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
    <table
      className="w-full">
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
        {rows.map((b) => {
          const driver = b.driverId ? driversById.get(b.driverId) : null;
          const studentCount = studentCountByBus.get(b.id) ?? 0;
          return (
            <tr
              key={b.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
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
                <CopyChip
                  value={b.plateNumber}
                  display={`${b.capacity} 座`}
                  title="複製車牌"
                  label="車牌"
                  icon={<Hash width={9} height={9} />}
                />
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
                  <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                    {studentCount} 個
                  </span>
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
