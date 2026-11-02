// ============================================================================
//  班次 ↔ 路線模板 的解析 (共用純函式)
//
//  背景:
//    Trip (班次) 可以「套用」Route (路線模板), 兩者關係記在 trip.routeId。
//    但舊班次 / 手動建立的班次可能冇 routeId, 這時要靠「時段 + 校巴」
//    反查返出佢對應嘅路線模板。
//
//  ⚠️ 為什麼要抽成共用:
//     管理員排程頁 (joinTripRelationsWithMaps) 同保姆 portal 必須用同一套
//     規則, 否則管理員見到「黃大仙早上線」而保姆見到「自訂路線」,
//     兩邊對同一班次嘅講法唔一致, 保姆會以為自己睇錯咗。
//
//  本檔案刻意唔 import storage — 保持純函式, 方便 server import / 單元測試。
// ============================================================================

import type { Route, RouteShiftType, Trip } from './types';

/**
 * Trip 的班次類型 → Route 的行車時段類型。
 *
 * Route 有三種 (morning / afternoon / extracurricular),
 * Trip 只有三種 (morning / afternoon / custom)。
 * extracurricular (課外活動) 對應到 Trip 的 'custom'。
 */
export function tripToRouteShiftType(trip: Trip): RouteShiftType {
  if (trip.type === 'morning') return 'morning';
  if (trip.type === 'afternoon') return 'afternoon';
  return 'extracurricular';
}

/**
 * 解析某個班次套用的路線模板。
 *
 * 兩級解析:
 *   1. **精確匹配** — trip.routeId 指向的模板 (管理員在排程頁「套用路線模板」時寫入)
 *   2. **鬆散匹配** — 同一台校巴 + 同一行車時段 (處理冇 routeId 的舊班次)
 *
 * @param trip   班次
 * @param routes 候選路線模板 (通常已按租戶/學校過濾)
 * @returns 對應的模板; 搵唔到就 undefined (代表手動建立、冇套用模板)
 */
export function resolveTripRoute(
  trip: Trip,
  routes: Route[],
): Route | undefined {
  if (!Array.isArray(routes) || routes.length === 0) return undefined;

  // 1) 精確匹配
  if (trip.routeId) {
    const exact = routes.find((r) => r.id === trip.routeId);
    if (exact) return exact;
  }

  // 2) 時段 + 校巴 fallback
  const shiftType = tripToRouteShiftType(trip);
  return routes.find(
    (r) => r.shiftType === shiftType && r.busId === trip.busId,
  );
}
