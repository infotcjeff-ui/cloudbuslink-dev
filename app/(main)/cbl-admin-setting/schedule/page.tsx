'use client';

/**
 * /cbl-admin-setting/schedule → 班次總覽
 *
 * 單頁面 = 1 section: Schedule Console (OneFleet-style)
 *   - TripFormModal: 中央 Modal (非右側 Drawer)
 *   - TripDetailDrawer: 右側 Drawer (檢視詳情 / 補打卡)
 *
 * Step 1: 改寫自舊版 (Hero + 4 stat + 今日清單 + 捷徑) 收斂成單一 Console section
 * Step 2: 統一表單 → TripFormModal (中央彈出, 符合使用者要求)
 * Step 3 之後: 進度即時、衝突強化、批次操作, ...
 */

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';

import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { useToast } from '@/components/ui/toast';
import {
  ensureTripParents,
  supabaseTrips,
  type TripRow,
} from '@/lib/supabase-trips';

import { useScheduleTrips } from './hooks/useScheduleTrips';
import { ScheduleConsoleContent } from './ScheduleConsoleContent';
import { TripFormModal } from './TripFormModal';
import { TripDetailDrawer } from './TripDetailDrawer';
import type {
  ScheduleFilter,
  ScheduleTab,
  ScheduleSort,
  TripWithRelations,
  TripFormValues,
} from './types';
import type { TripStatus, Trip } from '@/lib/types';

function statusLabel(s: TripStatus): string {
  switch (s) {
    case 'scheduled':   return '尚未發車';
    case 'in_progress': return '進行中';
    case 'completed':   return '已完成';
    case 'cancelled':   return '已取消';
    default:            return s;
  }
}

export default function CblAdminSchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'system_admin';
  // P1-3: client 解析 — user.clientId > URL ?client= > 記憶 > 第一位 client
  // 超管沒有 clientId → clientId='' + isSuperAdmin=true (看全部)
  const clientId = (() => {
    if (user?.clientId) return user.clientId;
    if (isSuperAdmin) return '';
    if (typeof window === 'undefined') return '';
    try {
      const sp = new URLSearchParams(window.location.search);
      const fromUrl = sp.get('client');
      if (fromUrl && STORAGE.clients.getById(fromUrl)) {
        STORAGE.selectedClient.set(fromUrl);
        return fromUrl;
      }
    } catch { /* ignore */ }
    const remembered = STORAGE.selectedClient.get();
    if (remembered && STORAGE.clients.getById(remembered)) return remembered;
    const first = STORAGE.clients.getAll()[0]?.id || '';
    if (first) STORAGE.selectedClient.set(first);
    return first;
  })();

  /* Schedule 主 Console state */
  const [tab, setTab] = useState<ScheduleTab>('all');
  // P0-0: 預設看「今日」— 管理員每天開頁就是要看今天的班
  const [filter, setFilter] = useState<ScheduleFilter>({ dateRange: 'today', q: '' });
  const [sort, setSort] = useState<ScheduleSort>('start_asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /* Drawer / Modal 狀態 */
  const [formModal, setFormModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: Partial<TripFormValues> | null;
  }>({ open: false, mode: 'add', initial: null });

  const [detailDrawer, setDetailDrawer] = useState<{
    open: boolean;
    row: TripWithRelations | null;
  }>({ open: false, row: null });

  const data = useScheduleTrips(clientId, filter, tab, isSuperAdmin);

  /* ---- Drawer / Modal 動作 ---- */
  const openAdd = useCallback(() => {
    setDetailDrawer({ open: false, row: null });
    setFormModal({ open: true, mode: 'add', initial: null });
  }, []);

  const openEdit = useCallback((row: TripWithRelations) => {
    setDetailDrawer({ open: false, row: null });
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        id: row.trip.id,
        type: row.trip.type,
        date: row.trip.date,
        plannedStartTime: row.trip.plannedStartTime?.slice(0, 5) ?? '07:30',
        plannedEndTime: row.trip.plannedEndTime?.slice(0, 5) ?? '08:30',
        busId: row.trip.busId,
        driverId: row.bus?.driverId ?? '',
        nannyId: row.trip.nannyId,
        studentIds: row.trip.studentIds,
        waypoints: row.trip.waypoints,
        routeId: row.trip.routeId ?? null,
      },
    });
  }, []);

  const openView = useCallback((row: TripWithRelations) => {
    setFormModal({ open: false, mode: 'add', initial: null });
    setDetailDrawer({ open: true, row });
  }, []);

  const closeForm = useCallback(() => {
    setFormModal({ open: false, mode: 'add', initial: null });
  }, []);

  const closeDetail = useCallback(() => {
    setDetailDrawer({ open: false, row: null });
  }, []);

  /* ---- 寫入 / 維護 ---- */

  /**
   * 把本機的 trip 推到 Supabase。
   *
   * 流程 (FK-safe):
   *   1. ensureTripParents — 保證 bus / driver / nanny / students / route 在 DB 存在
   *      (cbl_trips.bus_id 是 NOT NULL FK, 父列不存在會直接 insert 失敗)
   *   2. insert / update cbl_trips
   *
   * ⚠️ 失敗不阻擋本機寫入 — localStorage 仍保有資料 (mergeAll 會在下次 sync 保留),
   *    只提示使用者「已存本機但未同步到雲端」。
   */
  const pushTripToCloud = useCallback(async (
    trip: Trip,
    mode: 'insert' | 'update',
  ): Promise<string | null> => {
    try {
      const bus = STORAGE.buses.getById(trip.busId);
      const driver = bus?.driverId ? STORAGE.drivers.getById(bus.driverId) : null;
      const nanny = trip.nannyId ? STORAGE.nannies.getById(trip.nannyId) : null;
      const route = trip.routeId ? STORAGE.routes.getById(trip.routeId) : null;
      const students = STORAGE.students.getAll().filter((s) => trip.studentIds.includes(s.id));

      const ensured = await ensureTripParents({
        clientId: trip.clientId,
        busId: trip.busId,
        nannyId: trip.nannyId,
        driverId: bus?.driverId ?? null,
        studentIds: trip.studentIds,
        routeId: trip.routeId ?? null,
        client: STORAGE.clients.getById(trip.clientId),
        bus,
        driver,
        nanny,
        route,
        students,
      });

      if (!ensured.ok) {
        return `缺少關聯資料 (${ensured.missing.join(', ')})`;
      }

      const row: TripRow = {
        id: trip.id,
        clientId: trip.clientId,
        busId: trip.busId,
        nannyId: trip.nannyId,
        date: trip.date,
        type: trip.type,
        status: trip.status,
        plannedStartTime: trip.plannedStartTime,
        plannedEndTime: trip.plannedEndTime,
        actualStartTime: trip.actualStartTime,
        actualEndTime: trip.actualEndTime,
        waypoints: trip.waypoints,
        studentIds: trip.studentIds,
        currentRouteIndex: trip.currentRouteIndex,
        completedStops: trip.completedStops,
        routeId: trip.routeId ?? null,
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt,
      };

      const res = mode === 'insert'
        ? await supabaseTrips.add(row)
        : await supabaseTrips.update(trip.id, row);
      return res.success ? null : (res.error ?? '未知錯誤');
    } catch (err) {
      console.error('[Schedule] pushTripToCloud failed:', err);
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const handleSave = useCallback(async (values: TripFormValues) => {
    const now = new Date().toISOString();
    // 超管新增時 clientId='' → 用所選校巴 / 路線的學校兜底 (cbl_trips.client_id FK 必填)
    const resolveClientId = () => {
      if (clientId) return clientId;
      const bus = values.busId ? STORAGE.buses.getById(values.busId) : null;
      if (bus?.clientId) return bus.clientId;
      const route = values.routeId ? STORAGE.routes.getById(values.routeId) : null;
      if (route?.clientId) return route.clientId;
      return STORAGE.clients.getAll()[0]?.id || '';
    };
    try {
      if (formModal.mode === 'add' || !values.id) {
        const newId = STORAGE.genId('trip');
        const trip: Trip = {
          id: newId,
          clientId: resolveClientId(),
          type: values.type,
          date: values.date,
          busId: values.busId,
          nannyId: values.nannyId,
          status: 'scheduled',
          plannedStartTime: values.plannedStartTime,
          plannedEndTime: values.plannedEndTime,
          actualStartTime: null,
          actualEndTime: null,
          waypoints: values.waypoints,
          studentIds: values.studentIds,
          currentRouteIndex: 0,
          completedStops: [],
          routeId: values.routeId ?? null,
          createdAt: now,
          updatedAt: now,
        };
        STORAGE.trips.add(trip);
        window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
        toast('success', `已建立新班次 ${newId.slice(-6)}`);

        // 背景推雲端 (不阻擋 UI)
        const syncErr = await pushTripToCloud(trip, 'insert');
        if (syncErr) {
          toast('warning', `班次已存本機, 但未同步到雲端：${syncErr}`, 6000);
        }
      } else {
        const t = STORAGE.trips.getById(values.id);
        if (!t) {
          toast('error', '找不到原班次');
          return;
        }
        STORAGE.trips.update(values.id, {
          type: values.type,
          date: values.date,
          busId: values.busId,
          nannyId: values.nannyId,
          plannedStartTime: values.plannedStartTime,
          plannedEndTime: values.plannedEndTime,
          waypoints: values.waypoints,
          studentIds: values.studentIds,
          routeId: values.routeId ?? null,
        });
        window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
        toast('success', `班次 ${values.id.slice(-6)} 已儲存`);

        // 背景推雲端 (用 update 後的最新資料)
        const updated = STORAGE.trips.getById(values.id);
        if (updated) {
          const syncErr = await pushTripToCloud(updated, 'update');
          if (syncErr) {
            toast('warning', `班次已存本機, 但未同步到雲端：${syncErr}`, 6000);
          }
        }
      }
    } catch (err) {
      console.error('[Schedule] handleSave error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `儲存失敗：${msg}`);
    }
  }, [clientId, formModal.mode, toast, pushTripToCloud]);

  const onDelete = useCallback(async (row: TripWithRelations) => {
    if (!confirm(`刪除班次 ${row.trip.id.slice(-6)}？此操作無法撤銷。`)) return;
    try {
      STORAGE.trips.remove(row.trip.id);
      window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
      toast('success', `班次 ${row.trip.id.slice(-6)} 已刪除`);
      if (detailDrawer.row?.trip.id === row.trip.id) closeDetail();

      // 刪除雲端 (失敗只提示, 本機已刪)
      const res = await supabaseTrips.delete(row.trip.id);
      if (!res.success) {
        toast('warning', `已從本機刪除, 但雲端刪除失敗：${res.error ?? '未知錯誤'}`, 6000);
      }
    } catch (err) {
      console.error('[Schedule] onDelete error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `刪除失敗：${msg}`);
    }
  }, [toast, detailDrawer.row, closeDetail]);

  const onDuplicate = useCallback(async (row: TripWithRelations) => {
    try {
      const copy = STORAGE.trips.duplicate(row.trip.id, { date: row.trip.date });
      if (copy) {
        window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
        toast('success', `已複製新班次 ${copy.id.slice(-6)}`);

        const syncErr = await pushTripToCloud(copy, 'insert');
        if (syncErr) {
          toast('warning', `副本已存本機, 但未同步到雲端：${syncErr}`, 6000);
        }
      } else {
        toast('error', '複製失敗');
      }
    } catch (err) {
      console.error('[Schedule] onDuplicate error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `複製失敗：${msg}`);
    }
  }, [toast, pushTripToCloud]);

  const onChangeStatus = useCallback(async (rowOrIds: TripWithRelations | string[], next?: TripStatus) => {
    try {
      if (Array.isArray(rowOrIds)) {
        const ids = rowOrIds;
        const s = next!;
        const n = STORAGE.trips.bulkUpdateStatus(ids, s);
        window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
        toast('success', `已批次更新 ${n} 班狀態 → ${statusLabel(s)}`);

        // P0-5: 批次推雲端 — 一次 .in() 取代 N 個 update，失敗整批報數
        const res = await supabaseTrips.bulkUpdateStatus(
          ids,
          { status: s } as Parameters<typeof supabaseTrips.bulkUpdateStatus>[1],
        );
        if (!res.success) {
          toast('warning', `雲端同步失敗：${res.error ?? '未知錯誤'}（本機已更新）`, 6000);
        }
        return;
      }
      const s = next!;
      STORAGE.trips.update(rowOrIds.trip.id, { status: s });
      window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
      toast('success', `狀態已改為「${statusLabel(s)}」`);
      if (detailDrawer.row?.trip.id === rowOrIds.trip.id) {
        const refreshed = data.trips.find((t) => t.trip.id === rowOrIds.trip.id);
        if (refreshed) setDetailDrawer({ open: true, row: refreshed });
      }

      const updated = STORAGE.trips.getById(rowOrIds.trip.id);
      if (updated) {
        const syncErr = await pushTripToCloud(updated, 'update');
        if (syncErr) {
          toast('warning', `狀態已存本機, 但未同步到雲端：${syncErr}`, 6000);
        }
      }
    } catch (err) {
      console.error('[Schedule] onChangeStatus error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `狀態更新失敗：${msg}`);
    }
  }, [toast, detailDrawer.row, data.trips, pushTripToCloud]);

  const onBatchCancel = useCallback(async (ids: string[]) => {
    try {
      const n = STORAGE.trips.bulkUpdateStatus(ids, 'cancelled');
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
      toast(n > 0 ? 'success' : 'info', n > 0 ? `已批次取消 ${n} 個班次` : '無班次被取消 (可能已被刪除或更新)');

      // P0-5: 批次推雲端 — 一次 .in() 取代 N 個 update
      const res = await supabaseTrips.bulkUpdateStatus(
        ids,
        { status: 'cancelled' } as Parameters<typeof supabaseTrips.bulkUpdateStatus>[1],
      );
      if (!res.success) {
        toast('warning', `雲端同步失敗：${res.error ?? '未知錯誤'}（本機已更新）`, 6000);
      }
    } catch (err) {
      console.error('[Schedule] onBatchCancel error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `批次取消失敗：${msg}`);
    }
  }, [toast]);

  const onBatchDuplicate = useCallback(async (ids: string[]) => {
    try {
      const copies: Trip[] = [];
      ids.forEach((id) => {
        const out = STORAGE.trips.duplicate(id);
        if (out) copies.push(out);
      });
      const n = copies.length;
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
      toast(n > 0 ? 'success' : 'info', n > 0 ? `已批次複製 ${n} 個班次` : '無班次被複製 (可能已被刪除)');

      // P0-5: 批次推雲端 — 一次 insert 多筆 (先 ensure 父列再 bulkAdd)
      if (copies.length > 0) {
        const missing: string[] = [];
        for (const c of copies) {
          const bus = STORAGE.buses.getById(c.busId);
          const ensured = await ensureTripParents({
            clientId: c.clientId,
            busId: c.busId,
            nannyId: c.nannyId,
            driverId: bus?.driverId ?? null,
            studentIds: c.studentIds,
            routeId: c.routeId ?? null,
            client: STORAGE.clients.getById(c.clientId),
            bus,
            driver: bus?.driverId ? STORAGE.drivers.getById(bus.driverId) : null,
            nanny: c.nannyId ? STORAGE.nannies.getById(c.nannyId) : null,
            route: c.routeId ? STORAGE.routes.getById(c.routeId) : null,
            students: STORAGE.students.getAll().filter((s) => c.studentIds.includes(s.id)),
          });
          if (!ensured.ok) missing.push(c.id);
        }
        const ready = copies.filter((c) => !missing.includes(c.id));
        if (ready.length > 0) {
          const rows = ready.map((c) => ({
            id: c.id, clientId: c.clientId, busId: c.busId, nannyId: c.nannyId,
            date: c.date, type: c.type, status: c.status,
            plannedStartTime: c.plannedStartTime, plannedEndTime: c.plannedEndTime,
            actualStartTime: c.actualStartTime, actualEndTime: c.actualEndTime,
            waypoints: c.waypoints, studentIds: c.studentIds,
            currentRouteIndex: c.currentRouteIndex, completedStops: c.completedStops,
            routeId: c.routeId ?? null, createdAt: c.createdAt, updatedAt: c.updatedAt,
          }));
          const res = await supabaseTrips.bulkAdd(rows);
          if (!res.success) {
            toast('warning', `副本已存本機, 但雲端同步失敗：${res.error ?? '未知錯誤'}`, 6000);
          }
        }
        if (missing.length > 0) {
          toast('warning', `${missing.length} 個副本缺少關聯資料未同步（本機已存）`, 6000);
        }
      }
    } catch (err) {
      console.error('[Schedule] onBatchDuplicate error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `批次複製失敗：${msg}`);
    }
  }, [toast]);

  const onJumpToConflict = useCallback((c: import('./types').TripConflict) => {
    const first = c.tripIds[0];
    const target = data.trips.find((t) => t.trip.id === first);
    if (target) openView(target);
    else toast('info', `衝突: ${c.description}`);
  }, [data.trips, openView, toast]);

  if (!user) return null;

  /* 找出 detailDrawer 對應的最新 row (狀態更新後) */
  const liveDrawerRow = detailDrawer.row
    ? data.trips.find((t) => t.trip.id === detailDrawer.row!.trip.id) ?? detailDrawer.row
    : null;

  return (
    <div className="space-y-6">
      {/* ============================================================
          唯一區塊: 班次 Console
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2 border-b border-border">
          <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-3.5 h-3.5 text-primary" />
          </span>
          <h2 className="text-sm font-semibold">班次 Console</h2>
          <span className="text-[11px] text-muted-foreground ml-auto">
            共 {data.trips.length} 班 ·{' '}
            <span className="text-rose-600">{data.conflicts.length} 衝突</span>
          </span>
        </div>
        <ScheduleConsoleContent
          clientId={clientId}
          data={data}
          filter={filter}
          onFilterChange={setFilter}
          tab={tab}
          onTabChange={setTab}
          sort={sort}
          onSortChange={setSort}
          onOpenAdd={openAdd}
          onEdit={openEdit}
          onView={openView}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onChangeStatus={onChangeStatus}
          onJumpToConflict={onJumpToConflict}
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          onBatchChangeStatus={(ids, s) => onChangeStatus(ids, s)}
          onBatchCancel={onBatchCancel}
          onBatchDuplicate={onBatchDuplicate}
        />
      </motion.section>

      {/* ============================================================
          Drawer / Modal (在 section 外)
          ============================================================ */}
      <TripFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        context={{
          buses: data.buses,
          drivers: data.drivers,
          nannies: data.nannies,
          students: data.students,
          routes: data.routes,
        }}
        onSave={handleSave}
        onClose={closeForm}
      />

      <TripDetailDrawer
        open={detailDrawer.open}
        row={liveDrawerRow}
        progress={liveDrawerRow ? data.progress[liveDrawerRow.trip.id] : undefined}
        onClose={closeDetail}
        onEdit={() => liveDrawerRow && openEdit(liveDrawerRow)}
        onDelete={() => liveDrawerRow && onDelete(liveDrawerRow)}
        onChangeStatus={(s) => liveDrawerRow && onChangeStatus(liveDrawerRow, s)}
      />
    </div>
  );
}
