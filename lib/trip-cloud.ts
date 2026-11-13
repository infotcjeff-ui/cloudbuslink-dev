// ============================================================================
//  班次 → Supabase 推送 (共用)
// ============================================================================
//
//  為什麼要抽成共用模組:
//
//    1. /cbl-admin-setting/schedule (後台排程頁) 有一份 pushTripToCloud。
//    2. /trips/new (前台新增班次) 原本 **完全沒有** 推雲端的路徑 ——
//       只寫 localStorage, 換裝置/換分頁就看不到自己剛建的班次。
//
//    兩邊各寫一份必然會漂移 (欄位新增時只改到一邊), 所以抽成共用。
//
//  流程 (FK-safe):
//    1. ensureTripParents — 保證 bus / driver / nanny / students / route 在 DB 存在
//       (cbl_trips.bus_id 是 NOT NULL FK, 父列不存在會直接 insert 失敗)
//    2. insert / update cbl_trips
//
//  ⚠️ 回傳 null = 成功; 回傳字串 = 失敗原因 (呼叫端自行決定要不要提示使用者)
//     失敗不阻擋本機寫入 —— localStorage 仍保有資料 (mergeAll 會在下次 sync 保留)。
// ============================================================================

import { STORAGE, markSynced } from './storage';
import { ensureTripParents, supabaseTrips, type TripRow } from './supabase-trips';
import type { Trip } from './types';

/** 把本機的 Trip 物件轉成 Supabase row (欄位對齊 cbl_trips) */
export function tripToSupabaseRow(trip: Trip): TripRow {
  return {
    id: trip.id,
    clientId: trip.clientId,
    busId: trip.busId,
    nannyId: trip.nannyId,
    date: trip.date,
    // 學年蓋章 + 司機/車牌快照 (migration 0017)
    // ⚠️ 這三個欄位是「歷史保真」的關鍵 ——
    //    沒有 academic_year, 不同學年的班次會混在一起;
    //    沒有快照, 校巴改綁司機後歷史班次會顯示錯的人。
    academicYear: trip.academicYear,
    driverIdSnapshot: trip.driverIdSnapshot ?? null,
    busPlateNumberSnapshot: trip.busPlateNumberSnapshot ?? null,
    type: trip.type,
    customTypeLabel: trip.customTypeLabel ?? null,
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
}

/**
 * 把本機的 trip 推到 Supabase。
 *
 * @param trip  要推送的班次
 * @param mode  'insert' = 新增, 'update' = 更新
 * @returns null = 成功; 字串 = 失敗原因
 */
export async function pushTripToCloud(
  trip: Trip,
  mode: 'insert' | 'update',
): Promise<string | null> {
  try {
    const bus = STORAGE.buses.getById(trip.busId);
    // 司機以班次快照為準 (表單所選值), 舊班次快照為空才退回現時校巴綁定
    const tripDriverId = trip.driverIdSnapshot ?? bus?.driverId ?? null;
    const driver = tripDriverId ? STORAGE.drivers.getById(tripDriverId) : null;
    const nanny = trip.nannyId ? STORAGE.nannies.getById(trip.nannyId) : null;
    const route = trip.routeId ? STORAGE.routes.getById(trip.routeId) : null;
    const students = STORAGE.students.getAll().filter((s) => trip.studentIds.includes(s.id));

    const ensured = await ensureTripParents({
      clientId: trip.clientId,
      busId: trip.busId,
      nannyId: trip.nannyId,
      driverId: tripDriverId,
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

    const row = tripToSupabaseRow(trip);
    const res = mode === 'insert'
      ? await supabaseTrips.add(row)
      : await supabaseTrips.update(trip.id, row);
    if (res.success) {
      try { markSynced('trips', trip.id); } catch { /* ignore */ }
      return null;
    }
    return (res.error ?? '未知錯誤');
  } catch (err) {
    console.error('[TripCloud] pushTripToCloud failed:', err);
    return err instanceof Error ? err.message : String(err);
  }
}
