// ============================================================================
//  路線刪除墓碑 (route tombstones) — 防止「刪除後幾秒又復活」
// ============================================================================
//
//  【問題】
//  路線刪除原本是:
//    1. STORAGE.routes.remove(id)        → localStorage 移除
//    2. supabaseRouteRecords.remove(id)  → DELETE FROM cbl_routes
//    3. 之後任何一次 syncFromSupabase() → STORAGE.routes.setAll(雲端快照)
//
//  第 3 步是「整批覆蓋」。只要雲端那筆還在 (DELETE 被 RLS 過濾 / 同步競態拿到
//  舊快照 / 刪除推回失敗), 下一次同步就會把它原封不動寫回 localStorage
//  → 使用者看到「刪除後幾秒又出現」。
//
//  【解法】
//  刪除時留一個「墓碑」(tombstone), 記住這筆已經被刪:
//    - 合併時: 雲端 / 本機任何一邊帶著墓碑 id 的路線, 一律丟掉
//    - 雲端刪除失敗: 墓碑保留, 並在下次同步自動重試刪除
//    - 雲端確認刪掉: 移除墓碑
//
//  墓碑同時保存「刪除前的完整內容」 → 這就是本機的備份 (可還原)。
//
//  ⚠️ 為什麼不直接用 DB 的 soft delete (deleted_at)？
//     cbl_routes 的 unique (client_id, code) 會擋住同編號的路線重新建立,
//     soft delete 要一併改 unique 索引, 風險比墓碑大得多。
//     墓碑是「純前端」方案, 不需要改 DB schema, 也不影響其他裝置。
// ============================================================================

import type { Route } from './types';

/** localStorage key — value: { [routeId]: { deletedAt: string; route: Route | null } } */
const TOMBSTONE_KEY = 'cbl_route_tombstones';

/** 墓碑最多保留筆數 (避免 localStorage 無限膨脹) */
const MAX_TOMBSTONES = 100;

export interface RouteTombstone {
  /** 刪除時間 (ISO) */
  deletedAt: string;
  /** 刪除前的完整內容 (本機備份, 可還原) */
  route: Route | null;
  /**
   * 雲端是否已確認刪除。
   * false = 雲端刪除還沒成功 (或失敗) → 每次同步都要重試刪除。
   * true  = 雲端已刪掉 → 墓碑只留作本機備份, 不再重試。
   *
   * ⚠️ 墓碑「成功後不刪」是刻意的: 這就是使用者要的 backup ——
   *    雲端資料真的沒了, 但本機還留著完整內容, 可隨時還原。
   */
  cloudDeleted: boolean;
}

type TombstoneMap = Record<string, RouteTombstone>;

function readMap(): TombstoneMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TombstoneMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: TombstoneMap): void {
  if (typeof window === 'undefined') return;
  try {
    // 只保留最新的 MAX_TOMBSTONES 筆 (依刪除時間排序)
    const entries = Object.entries(map)
      .sort((a, b) => (b[1].deletedAt || '').localeCompare(a[1].deletedAt || ''))
      .slice(0, MAX_TOMBSTONES);
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (e) {
    console.error('[RouteTombstones] Failed to write:', e);
  }
}

/** 取得全部墓碑 */
export function getRouteTombstones(): TombstoneMap {
  return readMap();
}

/** 取得全部被刪的 route id */
export function getTombstonedRouteIds(): string[] {
  return Object.keys(readMap());
}

/** 這筆 id 是否已被刪除 */
export function isRouteTombstoned(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(readMap(), id);
}

/**
 * 記錄一筆「已被刪除」的路線。
 *
 * @param route 刪除前的完整內容 (當成本機備份); 沒有就傳 null
 */
export function markRouteTombstoned(route: Route | null, id?: string): void {
  const routeId = id ?? route?.id;
  if (!routeId) return;
  const map = readMap();
  map[routeId] = {
    deletedAt: new Date().toISOString(),
    route: route ?? null,
    cloudDeleted: false,
  };
  writeMap(map);
}

/**
 * 雲端已確認刪除 → 把墓碑標成「已完成」。
 *
 * ⚠️ 注意: 這裡「不刪掉墓碑」, 只改 flag。
 *    因為墓碑同時是「本機備份」—— 雲端資料真的刪掉了, 但本機還留著
 *    完整內容, 使用者可隨時還原。這就是使用者問的 "沒有 backup?" 的答案。
 *
 *    墓碑依然會擋住同步合併 (防止萬一雲端又出現這筆 → 不會復活),
 *    但不會再觸發重試刪除。
 */
export function markCloudRouteDeleted(id: string): void {
  const map = readMap();
  if (!(id in map)) return;
  map[id] = { ...map[id], cloudDeleted: true };
  writeMap(map);
}

/** 完全移除墓碑 (放棄備份 + 允許雲端同 id 資料重新進入) */
export function clearRouteTombstone(id: string): void {
  const map = readMap();
  if (!(id in map)) return;
  delete map[id];
  writeMap(map);
}

/** 取得「雲端還沒刪掉、需要重試」的路線 id */
export function getPendingRouteDeleteIds(): string[] {
  return Object.entries(readMap())
    .filter(([, t]) => !t.cloudDeleted)
    .map(([id]) => id);
}

/**
 * 合併本機 / 雲端路線時, 把帶墓碑 id 的路線全部剔除。
 *
 * @param local 本機現有路線
 * @param db    雲端拉回的路線
 * @returns merged 合併結果; staleInCloud = 雲端還在、但本機已刪的 id
 *                 (這些代表上次雲端刪除失敗, 需要重試)
 */
export function mergeRoutesWithTombstones<T extends { id: string }>(
  local: T[],
  db: T[],
): { merged: T[]; staleInCloud: string[] } {
  const tombstones = readMap();
  const tombstoned = new Set(Object.keys(tombstones));

  // 雲端還在、但本機已刪 → 雲端刪除沒生效, 需要重試
  // (只重試 cloudDeleted=false 的; 已完成的只是備份, 不再重試)
  const staleInCloud = db
    .filter((r) => tombstoned.has(r.id) && !tombstones[r.id]?.cloudDeleted)
    .map((r) => r.id);

  // ⚠️ 即使墓碑已完成 (cloudDeleted=true) 也要擋掉 —— 這是「不會復活」的最後一道防線:
  //    万一雲端因為其他原因又出現這筆 (例如另一台裝置重推), 也不會把它寫回來。
  const dbKept = db.filter((r) => !tombstoned.has(r.id));
  const localKept = local.filter((r) => !tombstoned.has(r.id));

  // 同 id 以雲端為準 (與 mergeCloudRecords 相同規則: 雲端是 source of truth)
  const dbIds = new Set(dbKept.map((r) => r.id));
  const merged = [
    ...dbKept,
    ...localKept.filter((r) => !dbIds.has(r.id)),
  ];

  return { merged, staleInCloud };
}

/**
 * 重試刪除「本機已刪、但雲端還在」的路線。
 *
 * 為什麼需要:
 *   刪除時如果雲端 DELETE 被擋掉 (回傳成功但沒刪), 該筆會一直留在雲端,
 *   每次 sync 都會被拉回來。用這裡的背景重試補刪, 直到成功為止。
 *
 * 刪除成功後只是把墓碑標成 cloudDeleted=true (備份仍然保留),
 * 在此之前本機一律視為「已刪」, 不會復活。
 */
export async function retryRouteDeletes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { supabaseRouteRecords } = await import('./supabase-entities');
    for (const id of ids) {
      const res = await supabaseRouteRecords.remove(id);
      if (res.success) {
        // 雲端已確認刪掉 → 標記完成 (備份仍留在本機)
        markCloudRouteDeleted(id);
        console.log(`[RouteTombstones] 路線 ${id} 已成功從雲端刪除`);
      } else {
        console.warn(`[RouteTombstones] 重試刪除路線 ${id} 失敗:`, res.error);
      }
    }
  } catch (e) {
    console.warn('[RouteTombstones] retryRouteDeletes failed:', e);
  }
}

/**
 * 還原一筆被刪除的路線 (從本機備份 / 墓碑還原)。
 *
 * 這是「沒有 backup?」的答案:
 *   刪除時會把完整內容存進墓碑 → 就算雲端真的刪乾淨了, 這筆資料仍然
 *   留在本機 (最多 100 筆), 可隨時還原回本機並重新推上雲端。
 *
 * @returns 還原後的路線; 找不到備份回傳 null
 */
export async function restoreRouteFromTombstone(id: string): Promise<Route | null> {
  const map = readMap();
  const tombstone = map[id];
  if (!tombstone || !tombstone.route) return null;

  const route = tombstone.route;

  // 先寫回本機
  const { STORAGE } = await import('./storage');
  const all = STORAGE.routes.getAll();
  if (!all.some((r) => r.id === route.id)) {
    all.push(route);
    STORAGE.routes.setAll(all);
  }

  // 移除墓碑 (否則 merge 會把它又剔掉)
  clearRouteTombstone(id);

  // 重新推上雲端
  try {
    const { supabaseRouteRecords } = await import('./supabase-entities');
    const res = await supabaseRouteRecords.add(route);
    if (!res.success) {
      console.warn('[RouteTombstones] 還原後推上雲端失敗:', res.error);
    }
  } catch (e) {
    console.warn('[RouteTombstones] 還原後推上雲端失敗:', e);
  }

  return route;
}

/**
 * 列出所有可還原的 (已刪) 路線 — 供 UI 顯示「已刪除的路線 (可還原)」。
 */
export function listRestorableRoutes(): { id: string; deletedAt: string; route: Route | null }[] {
  const map = readMap();
  return Object.entries(map)
    .map(([id, t]) => ({ id, deletedAt: t.deletedAt, route: t.route }))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
