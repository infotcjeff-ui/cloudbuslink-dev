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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';

import { useAuth } from '@/lib/hooks';
import { STORAGE, resolveWriteAcademicYear } from '@/lib/storage';
import { purgeResidualTestData } from '@/lib/purge-test-data';
import {
  seedScheduleTestData,
  removeScheduleTestData,
  countScheduleTestTrips,
} from '@/lib/seed-schedule-test';
import { useToast } from '@/components/ui/toast';
import {
  ensureTripParents,
  supabaseTrips,
  type TripRow,
} from '@/lib/supabase-trips';
import { pushTripToCloud as pushTripToCloudShared } from '@/lib/trip-cloud';

import { useScheduleTrips } from './hooks/useScheduleTrips';
import { ScheduleConsoleContent } from './ScheduleConsoleContent';
import { useAcademicYear } from '../AcademicYearProvider';
import { TripFormModal } from './TripFormModal';
import { TripDetailDrawer } from './TripDetailDrawer';
import { tomorrowIso, yesterdayIso } from './scheduleUtils';
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

  // 一次性掃尾:清掉舊瀏覽器本機殘留的 test- 測試資料 (功能已移除,只清殘留)
  useEffect(() => {
    purgeResidualTestData();
  }, []);

  // ⚠️ 學年範圍 — 封存的學年是唯讀的 (決策 D6)
  const { selectedYear, isReadOnly: yearReadOnly } = useAcademicYear();
  const [seedingTestData, setSeedingTestData] = useState(false);
  /* 測試資料筆數 (只讀 localStorage 的 test- 前綴, data.trips 變動即重算) */
  const testTripCount = useMemo(() => countScheduleTestTrips(), [data.trips]);

  /* 一鍵新增 / 移除測試資料 — 只寫 localStorage, 不推雲端 */
  const handleSeedTestData = useCallback(() => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能新增測試資料');
      return;
    }
    if (!confirm('確定生成 10 個測試班次？含校巴 / 司機 / 保姆 / 學生 / 家長 / 路線 / 打卡 (隨機時段、混合狀態、含髒資料)，只存本機、不推雲端。')) return;
    setSeedingTestData(true);
    try {
      const targetClient =
        clientId ||
        STORAGE.selectedClient.get() ||
        STORAGE.clients.getAll()[0]?.id ||
        '';
      if (!targetClient) {
        toast('error', '找不到學校 (client)，無法生成測試資料');
        return;
      }
      const year = selectedYear || resolveWriteAcademicYear(targetClient);
      const res = seedScheduleTestData(targetClient, year);
      [
        'cbl-trips-refresh', 'cbl-buses-refresh', 'cbl-drivers-refresh',
        'cbl-nannies-refresh', 'cbl-nannys-refresh', 'cbl-students-refresh',
        'cbl-routes-refresh', 'cbl-attendance-refresh',
        'cbl-users-refresh',
      ].forEach((e) => window.dispatchEvent(new CustomEvent(e)));
      // 把登入帳號直接回報給測試者 — 免得還要去 localStorage 翻
      const acc = res.accounts[0];
      const accLine = acc
        ? `　登入：/nannyloginportal 帳號 ${acc.accountName}（密碼 = 電話 ${acc.phone}）`
        : '';
      toast('success', `已生成測試資料：${res.trips} 班 / 校巴 ${res.buses} / 學生 ${res.students} / 打卡 ${res.attendances}（只存本機）${accLine}`);
    } catch (err) {
      console.error('[Schedule] seed test data error:', err);
      toast('error', `生成失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSeedingTestData(false);
    }
  }, [clientId, selectedYear, yearReadOnly, toast]);

  const handleClearTestData = useCallback(() => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能移除測試資料');
      return;
    }
    if (!confirm('確定移除測試資料？只刪除 test- 前綴的資料，不會碰真實資料。')) return;
    try {
      const { removed, trips } = removeScheduleTestData();
      [
        'cbl-trips-refresh', 'cbl-buses-refresh', 'cbl-drivers-refresh',
        'cbl-nannies-refresh', 'cbl-nannys-refresh', 'cbl-students-refresh',
        'cbl-routes-refresh', 'cbl-attendance-refresh',
        'cbl-users-refresh',
      ].forEach((e) => window.dispatchEvent(new CustomEvent(e)));
      toast(removed > 0 ? 'success' : 'info', removed > 0 ? `已移除測試資料：${trips} 班，共 ${removed} 筆` : '目前沒有測試資料可移除');
    } catch (err) {
      console.error('[Schedule] clear test data error:', err);
      toast('error', `移除失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [yearReadOnly, toast]);

  /* ---- Drawer / Modal 動作 ---- */
  /**
   * 開啟「新增班次」。
   *
   * 帶入篩選中的日期 (2026-10):
   *   使用者常在「今日」或某指定日期的檢視下按新增, 預設日期應該跟住該上下文,
   *   否則新增後又要手動改一次日期 (而班次清單預設只顯示「今日」)。
   *   filter.dateRange 為 'today' / 'tomorrow' / 'all' 等非 ISO 值時 → 退回今日。
   */
  const openAdd = useCallback(() => {
    // ⚠️ 封存學年 → 唯讀 (決策 D6): 不能在歷史學年建立班次
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 只能查看與匯出, 不能新增或修改資料');
      return;
    }
    setDetailDrawer({ open: false, row: null });
    const dr = filter.dateRange;
    const isoDate =
      /^\d{4}-\d{2}-\d{2}$/.test(dr) ? dr
      : dr === 'tomorrow' ? tomorrowIso()
      : dr === 'yesterday' ? yesterdayIso()
      : undefined;
    setFormModal({
      open: true,
      mode: 'add',
      initial: isoDate ? { date: isoDate } : null,
    });
  }, [filter.dateRange, yearReadOnly, toast]);

  const openEdit = useCallback((row: TripWithRelations) => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 只能查看與匯出, 不能新增或修改資料');
      return;
    }
    setDetailDrawer({ open: false, row: null });
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        id: row.trip.id,
        type: row.trip.type,
        customTypeLabel: row.trip.customTypeLabel ?? null,
        date: row.trip.date,
        plannedStartTime: row.trip.plannedStartTime?.slice(0, 5) ?? '07:30',
        plannedEndTime: row.trip.plannedEndTime?.slice(0, 5) ?? '08:30',
        busId: row.trip.busId,
        driverId: row.trip.driverIdSnapshot ?? row.bus?.driverId ?? '',
        // 保姆三級解析的寫入側: listing 已用 bound 保姆 fallback 顯示,
        // 編輯時也要帶入同樣的值, 否則表單 nannyId 為空會被 validate 擋下或存成未指派
        nannyId: row.trip.nannyId || row.nanny?.id || '',
        studentIds: row.trip.studentIds,
        waypoints: row.trip.waypoints,
        routeId: row.trip.routeId ?? null,
      },
    });
  }, [yearReadOnly, toast]);

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
   * 共用實作見 lib/trip-cloud.ts (前台 /trips/new 也用同一份, 避免欄位漂移)。
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
    return pushTripToCloudShared(trip, mode);
  }, []);

  const handleSave = useCallback(async (values: TripFormValues) => {
    // ⚠️ 封存學年 → 唯讀 (決策 D6)
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能儲存變更');
      return;
    }
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
    // 同一校巴 × 同一日 × 時段重疊 → 硬擋 (bug 2: 新增兩個一樣時段不應成功)
    // 注意: 時間以 HH:mm 字串比較, 與 findConflicts 的 overlap 語意一致
    const toMin = (t: string | null | undefined): number => {
      if (!t) return -1;
      const m = t.match(/^(\d{2}):(\d{2})/);
      if (!m) return -1;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const checkBusOverlap = (ignoreId?: string): string | null => {
      if (!values.busId || !values.date) return null;
      const s = toMin(values.plannedStartTime);
      const e = toMin(values.plannedEndTime);
      if (s < 0 || e < 0 || !(s < e)) return null;
      const clash = STORAGE.trips.getAll().find((t) => {
        if (t.status === 'cancelled') return false;
        if (ignoreId && t.id === ignoreId) return false;
        if (t.busId !== values.busId) return false;
        if (t.date !== values.date) return false;
        const ts = toMin(t.plannedStartTime);
        const te = toMin(t.plannedEndTime);
        if (ts < 0 || te < 0) return false;
        return s < te && ts < e;
      });
      if (!clash) return null;
      const bus = STORAGE.buses.getById(values.busId);
      return `校巴 ${bus?.plateNumber ?? ''} 在 ${values.date} ${clash.plannedStartTime}-${clash.plannedEndTime} 已有班次, 時段重疊不可新增`;
    };
    try {
      if (formModal.mode === 'add' || !values.id) {
        const clashMsg = checkBusOverlap();
        if (clashMsg) {
          toast('error', clashMsg);
          return;
        }
        const newId = STORAGE.genId('trip');
        const tripClientId = resolveClientId();
        const tripBus = STORAGE.buses.getById(values.busId);
        const trip: Trip = {
          id: newId,
          clientId: tripClientId,
          type: values.type,
          customTypeLabel: values.type === 'custom' ? (values.customTypeLabel?.trim() || null) : null,
          date: values.date,
          busId: values.busId,
          nannyId: values.nannyId,
          // 學年蓋章: 班次屬於建立當下的現行學年
          academicYear: resolveWriteAcademicYear(tripClientId),
          // 司機/車牌快照 —— 建班當下寫死表單所選值 (選車時已按該車綁定自動填入),
          // 確保日後校巴改綁司機時, 歷史班次仍顯示當時的司機與車牌。
          driverIdSnapshot: values.driverId || null,
          busPlateNumberSnapshot: tripBus?.plateNumber ?? null,
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
        // 新增成功後跳到該班次日期 (解決: 選了 10-15 新增成功, 清單仍是今日 → 顯示空白)
        setFilter((prev) => ({ ...prev, dateRange: trip.date }));
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
        // 編輯模式同樣硬擋 (排除自己)
        const clashMsg = checkBusOverlap(values.id);
        if (clashMsg) {
          toast('error', clashMsg);
          return;
        }
        STORAGE.trips.update(values.id, {
          type: values.type,
          customTypeLabel: values.type === 'custom' ? (values.customTypeLabel?.trim() || null) : null,
          date: values.date,
          busId: values.busId,
          nannyId: values.nannyId,
          driverIdSnapshot: values.driverId || null,
          plannedStartTime: values.plannedStartTime,
          plannedEndTime: values.plannedEndTime,
          waypoints: values.waypoints,
          studentIds: values.studentIds,
          routeId: values.routeId ?? null,
        });
        window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
        setFilter((prev) => ({ ...prev, dateRange: values.date }));
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
  }, [clientId, formModal.mode, toast, pushTripToCloud, setFilter, yearReadOnly]);

  const onDelete = useCallback(async (row: TripWithRelations) => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能刪除資料');
      return;
    }
    if (!confirm(`刪除班次 ${row.trip.id.slice(-6)}？此操作無法撤銷。`)) return;
    try {
      // ⚠️ 先留墓碑再刪 — 與路線刪除同一套 (見 lib/trip-tombstones.ts):
      //   墓碑會讓這筆在任何一次雲端同步後都不會被拉回來,
      //   就算雲端刪除失敗也不會「刪除後又復活」。
      const { markTripTombstoned, markCloudTripDeleted } = await import('@/lib/trip-tombstones');
      markTripTombstoned(row.trip, row.trip.id);

      STORAGE.trips.remove(row.trip.id);
      window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
      toast('success', `班次 ${row.trip.id.slice(-6)} 已刪除`);
      if (detailDrawer.row?.trip.id === row.trip.id) closeDetail();

      // 刪除雲端 (失敗只提示, 本機已刪; 墓碑保留 → 下次同步自動重試)
      const res = await supabaseTrips.delete(row.trip.id);
      if (!res.success) {
        toast('warning', `已從本機刪除, 但雲端刪除失敗：${res.error ?? '未知錯誤'} (將自動重試)`, 6000);
      } else {
        markCloudTripDeleted(row.trip.id);
      }
    } catch (err) {
      console.error('[Schedule] onDelete error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast('error', `刪除失敗：${msg}`);
    }
  }, [toast, detailDrawer.row, closeDetail, yearReadOnly]);

  const onDuplicate = useCallback(async (row: TripWithRelations) => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能新增或修改資料');
      return;
    }
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
  }, [toast, pushTripToCloud, yearReadOnly]);

  const onChangeStatus = useCallback(async (rowOrIds: TripWithRelations | string[], next?: TripStatus) => {
    // ⚠️ 封存學年 → 唯讀 (決策 D6): 不能改變歷史班次的狀態
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能改變班次狀態');
      return;
    }
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
  }, [toast, detailDrawer.row, data.trips, pushTripToCloud, yearReadOnly]);

  const onBatchCancel = useCallback(async (ids: string[]) => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能批次取消班次');
      return;
    }
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
  }, [toast, yearReadOnly]);

  const onBatchDuplicate = useCallback(async (ids: string[]) => {
    if (yearReadOnly) {
      toast('warning', '目前檢視的學年為唯讀 — 不能複製班次');
      return;
    }
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
          const cDriverId = c.driverIdSnapshot ?? bus?.driverId ?? null;
          const ensured = await ensureTripParents({
            clientId: c.clientId,
            busId: c.busId,
            nannyId: c.nannyId,
            driverId: cDriverId,
            studentIds: c.studentIds,
            routeId: c.routeId ?? null,
            client: STORAGE.clients.getById(c.clientId),
            bus,
            driver: cDriverId ? STORAGE.drivers.getById(cDriverId) : null,
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
            academicYear: c.academicYear, driverIdSnapshot: c.driverIdSnapshot ?? null,
            busPlateNumberSnapshot: c.busPlateNumberSnapshot ?? null,
            date: c.date, type: c.type, customTypeLabel: c.customTypeLabel ?? null, status: c.status,
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
  }, [toast, yearReadOnly]);

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
          readOnly={yearReadOnly}
          onSeedTestData={handleSeedTestData}
          onClearTestData={handleClearTestData}
          testTripCount={testTripCount}
          seedingTestData={seedingTestData}
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
