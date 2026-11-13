'use client';

/**
 * DriversConsoleContent — OneFleet-style operator console
 *
 * 規格來源:
 *   md/organizations-page-style-reference.md
 *   (沿用 /students + /bus 的設計語言)
 *
 * 範圍: 僅 /cbl-admin-setting/bus/drivers/ 內使用。
 *
 * 5-layer vertical stack:
 *   L1. Header Row (Title + Stat Tiles)
 *   L2. Action Toolbar
 *   L3. Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   L4. Modals
 *
 * 重用上方 primitives.tsx (Pill / Button / IconButton / Card / SectionHeader /
 * StatTile / FilterTabGroup) 與 DriverFormModal, 不動全域任何檔案。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Search,
  FolderOpen,
  CheckCircle2,
  Clock,
  PowerOff,
  Users as UsersAllIcon,
  Bus as BusIcon,
  Hash,
  FileSpreadsheet,
  Calendar,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { CopyChip } from '@/components/ui/copy-button';
import { supabaseDrivers } from '@/lib/supabase-drivers';
import { supabaseBuses } from '@/lib/supabase-buses';
import { STORAGE, resolveClientId } from '@/lib/storage';
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
import { DriverFormModal } from './DriverFormModal';
import {
  EMPTY_DRIVER_FORM,
  type DriverFormState,
  type DriverTab,
} from './types';
import type { Driver, Bus } from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
} from './design-tokens';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<DriverTab>[] = [
  {
    value: 'all',
    label: '全部',
    icon: <UserCog width={11} height={11} />,
  },
  {
    value: 'available',
    label: '可派',
    icon: <CheckCircle2 width={11} height={11} />,
  },
  {
    value: 'on_trip',
    label: '行駛中',
    icon: <Clock width={11} height={11} />,
  },
  {
    value: 'off_duty',
    label: '休假',
    icon: <PowerOff width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  DriverTab,
  { header: 'primary' | 'success' | 'warning' | 'neutral'; pill: 'primary' | 'success' | 'warning' | 'neutral'; iconColor: string }
> = {
  all: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  available: {
    header: 'success',
    pill: 'success',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
  },
  on_trip: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  off_duty: {
    header: 'neutral',
    pill: 'neutral',
    iconColor: 'text-slate-600 dark:text-slate-300',
  },
};

const PAGE_SIZE = 10;

/* -------------------------------------------------------------------------- */
/*  Status helpers                                                              */
/* -------------------------------------------------------------------------- */

function statusBadge(status: Driver['status']) {
  if (status === 'available') {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        可派
      </Pill>
    );
  }
  if (status === 'on_trip') {
    return (
      <Pill tone="primary" size="sm">
        <Dot tone="primary" />
        行駛中
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" size="sm">
      <Dot tone="neutral" />
      休假
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 確認刪除對話框                                          */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  driverName,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  driverName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="driver-confirm-delete-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: ANIMATION_EASE }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-confirm-delete-title"
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
                  id="driver-confirm-delete-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  確認刪除司機
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷, 將一併移除綁定關係。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除司機{' '}
                <span className="font-semibold">{driverName}</span>？
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                若該司機已被校巴指派, 將一併解除綁定關係。
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

export interface DriversConsoleContentProps {
  drivers: Driver[];
  buses: Bus[];
}

export function DriversConsoleContent({
  drivers: initialDrivers,
  buses: initialBuses,
}: DriversConsoleContentProps) {
  const toast = useToast();
  const [tab, setTab] = React.useState<DriverTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);

  // 在組件內部管理狀態, 確保新增/刪除後立即更新列表
  // 超管 (super_admin / system_admin) 沒有 clientId → 讀全部 (跨機構管理)
  const resolveVisible = <T,>(getAll: () => T[], getByClient: (cid: string) => T[]): T[] => {
    try {
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
  const [drivers, setDrivers] = React.useState<Driver[]>(() => {
    if (initialDrivers.length > 0) return initialDrivers;
    if (typeof window === 'undefined') return [];
    return resolveVisible<Driver>(
      () => STORAGE.drivers.getAll(),
      (cid) => STORAGE.drivers.getByClient(cid),
    );
  });

  const [buses, setBuses] = React.useState<Bus[]>(() => {
    if (initialBuses.length > 0) return initialBuses;
    if (typeof window === 'undefined') return [];
    return resolveVisible<Bus>(
      () => STORAGE.buses.getAll(),
      (cid) => STORAGE.buses.getByClient(cid),
    );
  });

  // 當 prop 變化且新值非空時同步內部狀態
  React.useEffect(() => {
    if (initialDrivers.length > 0) {
      setDrivers((prev) =>
        initialDrivers.length >= prev.length ? initialDrivers : prev,
      );
    }
  }, [initialDrivers]);

  React.useEffect(() => {
    if (initialBuses.length > 0) {
      setBuses((prev) =>
        initialBuses.length >= prev.length ? initialBuses : prev,
      );
    }
  }, [initialBuses]);

  // 監聽 refresh 事件, 重新從 LocalStorage 讀取 (超管讀全部)
  React.useEffect(() => {
    const reloadVisible = (
      set: (v: any) => void,
      getAll: () => any[],
      getByClient: (cid: string) => any[],
    ) => {
      try {
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
        console.warn('[DriversConsole] Failed to refresh:', e);
      }
    };
    const onDriversRefresh = () => {
      reloadVisible(
        (v: Driver[]) => setDrivers(v),
        () => STORAGE.drivers.getAll(),
        (cid) => STORAGE.drivers.getByClient(cid),
      );
    };

    const onBusesRefresh = () => {
      reloadVisible(
        (v: Bus[]) => setBuses(v),
        () => STORAGE.buses.getAll(),
        (cid) => STORAGE.buses.getByClient(cid),
      );
    };

    window.addEventListener('cbl-drivers-refresh', onDriversRefresh);
    window.addEventListener('cbl-buses-refresh', onBusesRefresh);

    // Race condition 防護: 監聽事件可能在 sync 完成 dispatch 之前/之後才掛上,
    // 加上輪詢 fallback — 當 drivers/buses 為空且 STORAGE 已 init 或時間到,
    // 自動重新讀取, 避免使用者必須手動按「重新整理」才能看到資料。
    // (超管模式: 直接讀全部, 不需要等 clientId)
    const startTime = Date.now();
    const pollInterval = window.setInterval(() => {
      try {
        const raw = localStorage.getItem('cbl_auth');
        const u = raw ? JSON.parse(raw) : null;
        const superMode = u?.role === 'super_admin' || u?.role === 'system_admin';
        const cid = u?.clientId || STORAGE.clients.getAll()[0]?.id || '';
        if (!cid && !superMode) return;
        const elapsed = Date.now() - startTime;
        const initialized = STORAGE.isInitialized();
        const visibleDrivers = superMode ? STORAGE.drivers.getAll() : STORAGE.drivers.getByClient(cid);
        const visibleBuses = superMode ? STORAGE.buses.getAll() : STORAGE.buses.getByClient(cid);
        const driversEmpty = visibleDrivers.length === 0;
        const busesEmpty = visibleBuses.length === 0;
        if (initialized || elapsed > 5000) {
          onDriversRefresh();
          onBusesRefresh();
          window.clearInterval(pollInterval);
        } else if (!driversEmpty || !busesEmpty) {
          onDriversRefresh();
          onBusesRefresh();
        }
      } catch {
        window.clearInterval(pollInterval);
      }
    }, 150);

    return () => {
      window.removeEventListener('cbl-drivers-refresh', onDriversRefresh);
      window.removeEventListener('cbl-buses-refresh', onBusesRefresh);
      window.clearInterval(pollInterval);
    };
  }, []);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: DriverFormState;
    editingId: string | undefined;
  }>({ open: false, mode: 'add', initial: EMPTY_DRIVER_FORM, editingId: undefined });
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Driver | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // View stub
  const [, setViewing] = React.useState<Driver | null>(null);

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
    return drivers.filter((d) => {
      if (tab !== 'all' && d.status !== tab) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.phone.includes(q) ||
        d.licenseNumber.toLowerCase().includes(q)
      );
    });
  }, [drivers, tab, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const total = drivers.length;
  const availableCount = drivers.filter((d) => d.status === 'available').length;
  const onTripCount = drivers.filter((d) => d.status === 'on_trip').length;
  const offDutyCount = drivers.filter((d) => d.status === 'off_duty').length;

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
    setFormModal({ open: true, mode: 'add', initial: EMPTY_DRIVER_FORM, editingId: undefined });
  }, []);

  const openEdit = React.useCallback((d: Driver) => {
    const boundBus = buses.find((b) => b.driverId === d.id);
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        name: d.name,
        phone: d.phone,
        licenseNumber: d.licenseNumber,
        companyId: d.companyId ?? '',
        assignedBusId: boundBus?.id ?? '',
        status: d.status ?? 'available',
      },
      editingId: d.id,
    });
  }, [buses]);

  const handleSave = React.useCallback(
    async (state: DriverFormState) => {
      setIsSaving(true);
      try {
        // 超管新增時若沒有所屬學校 → 掛到第一間學校 (cbl_drivers.client_id 有 FK 必填)
        // ⚠️ 用共用的 resolveClientId, 確保與其他頁面 (校巴/學生/保姆) 取到同一個 client id。
        //    這裡自己刻一份 fallback 順序會與 resolveClientId 不同 → 寫出雲端不存在的 client_id → FK violation。
        const clientId = resolveClientId(
          (() => {
            try {
              const raw = localStorage.getItem('cbl_auth');
              const u = raw ? JSON.parse(raw) : null;
              return u?.clientId ?? null;
            } catch {
              return null;
            }
          })(),
        );
        if (!clientId) {
          console.error('[DriversConsole] 無法取得 clientId, 取消儲存');
          toast.error('無法取得客戶端資訊，請重新登入');
          return;
        }
        const now = new Date().toISOString();

        if (formModal.mode === 'add') {
          const newId = STORAGE.genId('driver');
          const newDriver: Driver = {
            id: newId,
            clientId,
            name: state.name,
            phone: state.phone,
            licenseNumber: state.licenseNumber,
            photo: null,
            status: state.status || 'available',
            createdAt: now,
          };

          // 1. 先存入 LocalStorage (即時顯示)
          STORAGE.drivers.add(newDriver);

          // 2. 立即更新內部狀態
          setDrivers((prev) => [...prev, newDriver]);

          // 2.5 同步校巴綁定 (反向寫 Bus.driverId)
          //     ⚠️ 這裡只寫本機, 雲端寫入留到司機建立成功後 (見下方 step 4)
          //        — 因為 cbl_buses.driver_id 有 FK 指向 cbl_drivers.id,
          //          司機還沒上雲就先寫綁定會被清成 null。
          if (state.assignedBusId) {
            STORAGE.buses.update(state.assignedBusId, { driverId: newId });
            setBuses((prev) =>
              prev.map((b) =>
                b.id === state.assignedBusId ? { ...b, driverId: newId } : b,
              ),
            );
          }

          // 3. 同步到 Supabase (背景執行)
          let supabaseResult: { success: boolean; error?: string };
          try {
            supabaseResult = await supabaseDrivers.add(newDriver);
          } catch (supaErr) {
            console.error('[DriversConsole] supabaseDrivers.add threw:', supaErr);
            supabaseResult = {
              success: false,
              error: supaErr instanceof Error ? supaErr.message : String(supaErr),
            };
          }

          // 4. 司機上雲後才寫校巴綁定 (FK 順序)
          if (state.assignedBusId && supabaseResult.success) {
            try {
              const res = await supabaseBuses.update(state.assignedBusId, { driverId: newId });
              if (!res.success) console.warn('[DriversConsole] bus binding cloud sync failed:', res.error);
            } catch (e) {
              console.warn('[DriversConsole] bus binding cloud sync error:', e);
            }
            window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
          }

          if (!supabaseResult.success) {
            console.warn('[DriversConsole] Supabase sync failed:', supabaseResult.error);
            toast.warning(`司機已新增，但 Supabase 同步失敗: ${supabaseResult.error}`);
          } else {
            toast.success(`司機 ${state.name} 新增成功！`);
          }
        } else if (formModal.editingId) {
          const editingId = formModal.editingId;
          const updates: Partial<Driver> = {
            name: state.name,
            phone: state.phone,
            licenseNumber: state.licenseNumber,
            // 執勤狀態 (表單選填, 未填則維持原值)
            ...(state.status ? { status: state.status } : {}),
          };

          // 1. 先更新 LocalStorage (即時顯示)
          STORAGE.drivers.update(editingId, updates);

          // 2. 立即更新內部狀態
          setDrivers((prev) =>
            prev.map((d) =>
              d.id === editingId ? { ...d, ...updates } : d,
            ),
          );

          // 2.5 同步校巴綁定 (反向寫 Bus.driverId)
          // 規則: 選中的車 → driverId = editingId; 原本綁此司機但沒被選中的車 → driverId = null (解除)
          // 若選中的車原本綁別的司機 → 換綁 (原司機自動解除, 因 Bus.driverId 只能指向一人)
          const prevBoundBusIds = new Set(
            STORAGE.buses.getAll().filter((b) => b.driverId === editingId).map((b) => b.id),
          );
          const nextBoundBusIds = new Set(state.assignedBusId ? [state.assignedBusId] : []);
          const toBind = [...nextBoundBusIds].filter((id) => !prevBoundBusIds.has(id));
          const toUnbind = [...prevBoundBusIds].filter((id) => !nextBoundBusIds.has(id));
          if (toBind.length > 0 || toUnbind.length > 0) {
            toBind.forEach((bid) => STORAGE.buses.update(bid, { driverId: editingId }));
            toUnbind.forEach((bid) => STORAGE.buses.update(bid, { driverId: null }));
            setBuses((prev) =>
              prev.map((b) => {
                if (toBind.includes(b.id)) return { ...b, driverId: editingId };
                if (toUnbind.includes(b.id)) return { ...b, driverId: null };
                return b;
              }),
            );
            window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
          }

          // 3. 同步到 Supabase (背景執行)
          let supabaseResult: { success: boolean; error?: string };
          try {
            supabaseResult = await supabaseDrivers.update(formModal.editingId, updates);
          } catch (supaErr) {
            console.error('[DriversConsole] supabaseDrivers.update threw:', supaErr);
            supabaseResult = {
              success: false,
              error: supaErr instanceof Error ? supaErr.message : String(supaErr),
            };
          }

          // 4. 司機上雲後, 才寫校巴綁定
          //    ⚠️ 順序很重要: cbl_buses.driver_id 有 FK 指向 cbl_drivers.id。
          //       司機還沒在雲端就先寫綁定 → 補建司機失敗 → driverId 被清成 null
          //       → 雲端的綁定就消失了 → 下次 refresh 顯示「未綁定」。
          if (toBind.length > 0 || toUnbind.length > 0) {
            for (const bid of [...toBind, ...toUnbind]) {
              try {
                const cur = STORAGE.buses.getById(bid);
                const res = await supabaseBuses.update(bid, { driverId: cur?.driverId ?? null });
                if (!res.success) {
                  console.warn('[DriversConsole] bus binding cloud sync failed:', res.error);
                }
              } catch (e) {
                console.warn('[DriversConsole] bus binding cloud sync error:', e);
              }
            }
            window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
          }

          if (!supabaseResult.success) {
            console.warn('[DriversConsole] Supabase sync failed:', supabaseResult.error);
            toast.warning(`司機已更新，但 Supabase 同步失敗: ${supabaseResult.error}`);
          } else {
            toast.success(`司機 ${state.name} 更新成功！`);
          }
        }

        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-drivers-refresh'));
      } catch (err) {
        console.error('[DriversConsole] handleSave error:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        toast.error(`儲存失敗: ${errMsg}`);
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
      // 解除綁定此司機的校巴
      const relatedBuses = buses.filter((b) => b.driverId === deleteTarget.id);
      relatedBuses.forEach((b) => {
        STORAGE.buses.update(b.id, { driverId: null });
      });

      STORAGE.drivers.remove(deleteTarget.id);

      // 立即更新內部狀態
      setDrivers((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      // 也更新校巴狀態 (解除綁定)
      setBuses((prev) =>
        prev.map((b) =>
          b.driverId === deleteTarget.id ? { ...b, driverId: null } : b,
        ),
      );

      // 同步刪除到 Supabase (背景執行)
      let supabaseResult: { success: boolean; error?: string };
      try {
        supabaseResult = await supabaseDrivers.remove(deleteTarget.id);
      } catch (supaErr) {
        console.error('[DriversConsole] supabaseDrivers.remove threw:', supaErr);
        supabaseResult = {
          success: false,
          error: supaErr instanceof Error ? supaErr.message : String(supaErr),
        };
      }
      if (!supabaseResult.success) {
        console.warn('[DriversConsole] Supabase delete sync failed:', supabaseResult.error);
        toast.warning(`司機已刪除，但 Supabase 同步失敗: ${supabaseResult.error}`);
      } else {
        toast.success(`司機 ${deleteTarget.name} 已刪除`);
      }

      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-drivers-refresh'));
      window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
    } catch (err) {
      console.error('[DriversConsole] handleDelete error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`刪除失敗: ${errMsg}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, buses, toast]);

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((d) => {
      const assignedBus = d.id ? buses.find((b) => b.driverId === d.id) : null;
      return {
        '姓名': d.name,
        '電話': d.phone,
        '駕照號碼': d.licenseNumber,
        '指派校巴': assignedBus?.plateNumber ?? '未指派',
        '狀態': d.status === 'available' ? '可派' : d.status === 'on_trip' ? '行駛中' : '休假',
        '建立日期': formatSystemAdminDate(d.createdAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '司機名單');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `drivers-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, buses, tab]);

  /* -------- Render -------- */
  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white shrink-0">
            <UserCog width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                司機
              </h1>
              <Pill tone="primary" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 人
              </Pill>
              {offDutyCount > 0 && (
                <Pill tone="neutral" size="sm">
                  <Dot tone="neutral" />
                  {offDutyCount} 休假中
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理司機資料、駕照有效期與執勤狀態。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
          <StatTile
            label="可派"
            value={availableCount}
            hint={`${total} 人總數`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="success"
          />
          <StatTile
            label="行駛中"
            value={onTripCount}
            hint="正在執勤"
            icon={<Clock width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="休假"
            value={offDutyCount}
            hint="暫停服務"
            icon={<PowerOff width={12} height={12} />}
            tone="neutral"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="success"
          size="sm"
          startIcon={<CheckCircle2 width={12} height={12} />}
          onClick={() => {
            setTab('available');
            setPage(1);
          }}
        >
          檢視可派司機
        </Button>
        {availableCount > 0 && (
          <Pill tone="success" size="sm">
            {availableCount}
          </Pill>
        )}

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

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
            新增司機
          </Button>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<UserCog width={18} height={18} />}
          title={
            tab === 'all'
              ? '全部司機'
              : tab === 'available'
              ? '可派司機'
              : tab === 'on_trip'
              ? '行駛中司機'
              : '休假司機'
          }
          subtitle={`${filtered.length} 筆 · ${TAB_OPTIONS.find((o) => o.value === tab)?.label ?? ''}`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {filtered.length}
            </Pill>
          }
        />

        {/* L3b. Filter Bar */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="drivers-tab-pill"
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
              placeholder="搜尋姓名、電話、駕照號碼…"
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
                buses={buses}
                onView={(d) => setViewing(d)}
                onEdit={openEdit}
                onDelete={(d) => setDeleteTarget(d)}
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
      <DriverFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        editingName={
          formModal.editingId
            ? drivers.find((d) => d.id === formModal.editingId)?.name
            : undefined
        }
        editingId={formModal.editingId}
        context={{ drivers, buses }}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        driverName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EmptyState                                                                  */
/* -------------------------------------------------------------------------- */

function EmptyState({
  tab,
  search,
}: {
  tab: DriverTab;
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
            ? '沒有符合條件的司機'
            : tab === 'available'
            ? '目前沒有可派司機'
            : tab === 'on_trip'
            ? '目前沒有行駛中司機'
            : tab === 'off_duty'
            ? '目前沒有休假司機'
            : '尚未新增任何司機'}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : '點擊右上角的「新增司機」按鈕以建立第一筆資料。'}
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
  buses,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Driver[];
  buses: Bus[];
  onView: (d: Driver) => void;
  onEdit: (d: Driver) => void;
  onDelete: (d: Driver) => void;
}) {
  const assignedBusByDriver = React.useMemo(() => {
    const m = new Map<string, Bus>();
    buses.forEach((b) => {
      if (b.driverId) m.set(b.driverId, b);
    });
    return m;
  }, [buses]);

  return (
    <table
      className="w-full">
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            司機
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            電話
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            駕照號碼
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            指派校巴
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
        {rows.map((d) => {
          const assignedBus = d.id ? assignedBusByDriver.get(d.id) : null;
          return (
            <tr
              key={d.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
            >
              {/* 司機 (icon + name) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-md ring-1 ring-inset flex items-center justify-center',
                      d.status === 'available'
                        ? 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50'
                        : d.status === 'on_trip'
                        ? 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50'
                        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
                    )}
                  >
                    <UserCog width={14} height={14} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[160px] dark:text-slate-100"
                      title={d.name}
                    >
                      {d.name}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate dark:text-slate-400">
                      {formatSystemAdminDate(d.createdAt)} 加入
                    </p>
                  </div>
                </div>
              </td>

              {/* 電話 (copyable) */}
              <td className="px-3 py-2.5">
                <CopyChip
                  value={d.phone}
                  title="複製電話"
                  label="電話"
                  icon={<Hash width={9} height={9} />}
                />
              </td>

              {/* 駕照號碼 */}
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                  {d.licenseNumber}
                </span>
              </td>

              {/* 指派校巴 */}
              <td className="px-3 py-2.5">
                {assignedBus ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50">
                    <BusIcon width={9} height={9} />
                    {assignedBus.plateNumber}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">未指派</span>
                )}
              </td>

              {/* 狀態 */}
              <td className="px-3 py-2.5">{statusBadge(d.status)}</td>

              {/* 操作 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => onView(d)} title="檢視司機資料">
                    <Eye width={13} height={13} />
                  </IconButton>
                  <IconButton onClick={() => onEdit(d)} title="編輯司機">
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(d)}
                    title="刪除司機"
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