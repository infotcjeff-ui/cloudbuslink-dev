// ============================================================================
//  班次刪除墓碑 (trip tombstones) — 防止「刪除後又復活 / 保姆端殘留」
//
//  【問題】
//  班次刪除原本是:
//    1. STORAGE.trips.remove(id)  → localStorage 移除
//    2. supabaseTrips.delete(id)  → DELETE FROM cbl_trips
//    3. 之後任何一次 syncFromSupabase() / refreshCloud()
//       → STORAGE.trips.mergeAll(雲端快照)
//
//  mergeAll 的規則是「只有本機有的 trip 一律保留」(見 lib/storage.ts),
//  註解寫明「跨裝置刪除目前不同步回來 — 寧可暫時多留一筆」。
//  結果:
//    - A 裝置刪了班次 (雲端已刪), B 裝置 (保姆手機) 本機還留著那筆 →
//      mergeAll 把它當 localOnly 原樣保留 → 保姆班次列表永遠刪不掉。
//    - 雲端 DELETE 失敗 (RLS / 網路) → 下次 sync 把雲端那筆拉回來 → 復活。
//
//  【解法】(與 lib/route-tombstones.ts 同一套)
//  刪除時留一個「墓碑」, 記住這筆已經被刪:
//    - 合併時: 雲端 / 本機任何一邊帶著墓碑 id 的班次, 一律丟掉
//    - 雲端刪除失敗: 墓碑保留, 並在下次同步自動重試刪除
//    - 雲端確認刪掉: 墓碑標 cloudDeleted=true (備份仍留本機, 可還原)
//
//  墓碑同時保存「刪除前的完整內容」 → 就是本機的備份 (可還原)。
//
//  純前端方案, 不需要改 DB schema, 也不影響其他裝置。
// ============================================================================

import type { Trip } from './types';

/** localStorage key — value: { [tripId]: { deletedAt: string; trip: Trip | null } } */
const TOMBSTONE_KEY = 'cbl_trip_tombstones';

/**
 * 已知被刪、但刪的時候還沒有墓碑系統的班次 id (歷史殘留)。
 * 這些 id 在任何裝置一律視為已刪 —— 不顯示、不合併回來、雲端還在就重試刪除。
 * 本次: trip-mwcvry8a-c7whm (保姆端殘留, 排程頁已移除)。
 */
const LEGACY_DELETED_TRIP_IDS: ReadonlySet<string> = new Set([
  'trip-mwcvry8a-c7whm',
]);

/** 墓碑最多保留筆數 (避免 localStorage 無限膨脹) */
const MAX_TOMBSTONES = 200;

export interface TripTombstone {
  /** 刪除時間 (ISO) */
  deletedAt: string;
  /** 刪除前的完整內容 (本機備份, 可還原) */
  trip: Trip | null;
  /**
   * 雲端是否已確認刪除。
   * false = 雲端刪除還沒成功 (或失敗) → 每次同步都要重試刪除。
   * true  = 雲端已刪掉 → 墓碑只留作本機備份, 不再重試。
   */
  cloudDeleted: boolean;
}

type TombstoneMap = Record<string, TripTombstone>;

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
    console.error('[TripTombstones] Failed to write:', e);
  }
}

/** 取得全部墓碑 */
export function getTripTombstones(): TombstoneMap {
  return readMap();
}

/** 取得全部被刪的 trip id (含歷史殘留硬編碼) */
export function getTombstonedTripIds(): string[] {
  const ids = new Set<string>([...Object.keys(readMap()), ...LEGACY_DELETED_TRIP_IDS]);
  return Array.from(ids);
}

/** 這筆 id 是否已被刪除 (含歷史殘留硬編碼) */
export function isTripTombstoned(id: string): boolean {
  if (LEGACY_DELETED_TRIP_IDS.has(id)) return true;
  return Object.prototype.hasOwnProperty.call(readMap(), id);
}

/**
 * 記錄一筆「已被刪除」的班次。
 *
 * @param trip 刪除前的完整內容 (當成本機備份); 沒有就傳 null
 */
export function markTripTombstoned(trip: Trip | null, id?: string): void {
  const tripId = id ?? trip?.id;
  if (!tripId) return;
  const map = readMap();
  map[tripId] = {
    deletedAt: new Date().toISOString(),
    trip: trip ?? null,
    cloudDeleted: false,
  };
  writeMap(map);
}

/**
 * 雲端已確認刪除 → 把墓碑標成「已完成」。
 *
 * 注意: 這裡「不刪掉墓碑」, 只改 flag。
 * 因為墓碑同時是「本機備份」—— 雲端資料真的刪掉了, 但本機還留著
 * 完整內容, 可隨時還原。
 *
 * 墓碑依然會擋住同步合併 (防止萬一雲端又出現這筆 → 不會復活),
 * 但不會再觸發重試刪除。
 */
export function markCloudTripDeleted(id: string): void {
  const map = readMap();
  if (!(id in map)) return;
  map[id] = { ...map[id], cloudDeleted: true };
  writeMap(map);
}

/** 完全移除墓碑 (放棄備份 + 允許雲端同 id 資料重新進入) */
export function clearTripTombstone(id: string): void {
  const map = readMap();
  if (!(id in map)) return;
  delete map[id];
  writeMap(map);
}

/** 取得「雲端還沒刪掉、需要重試」的班次 id */
export function getPendingTripDeleteIds(): string[] {
  return Object.entries(readMap())
    .filter(([, t]) => !t.cloudDeleted)
    .map(([id]) => id);
}

/**
 * 合併本機 / 雲端班次時, 把帶墓碑 id 的班次全部剔除。
 *
 * 合併規則 (在墓碑過濾之後):
 *   1. DB 與 local 都有的 trip → 比較 updatedAt, 較新的勝出
 *      (與 tripStorage.mergeAll 一致, 保護「本機先寫、雲端後推」)
 *   2. 只有 local 有的 trip → 保留 (尚未 push 成功)
 *   3. 只有 DB 有的 trip → 使用 (其他裝置新建的)
 *
 * @param local 本機現有班次
 * @param db    雲端拉回的班次
 * @param opts.syncedIds  上次同步時雲端見過的 id ——
 *   這次雲端沒有、但上次見過 → 已在別處被刪 → 跟著刪 (跨裝置刪除傳遞)。
 *   ⚠️ 呼叫端必須只在「雲端查詢成功」時傳這個, 否則一次查詢失敗
 *   (RLS / 斷網) 會把本機班次誤判成「被刪」而清空。
 * @returns merged 合併結果; staleInCloud = 雲端還在、但本機已刪的 id
 *                 (這些代表上次雲端刪除失敗, 需要重試)
 */
export function mergeTripsWithTombstones<T extends { id: string; updatedAt?: string | null }>(
  local: T[],
  db: T[],
): { merged: T[]; staleInCloud: string[] } {
  const tombstones = readMap();
  // 歷史殘留一併視為墓碑 (刪時還沒有墓碑系統, 但確定已刪)
  const tombstoned = new Set<string>([...Object.keys(tombstones), ...LEGACY_DELETED_TRIP_IDS]);

  // 雲端還在、但本機已刪 → 雲端刪除沒生效, 需要重試
  // (只重試 cloudDeleted=false 的; 已完成的只是備份, 不再重試;
  //  歷史殘留視為 cloudDeleted=false, 雲端還在就重試刪)
  const staleInCloud = db
    .filter((r) => tombstoned.has(r.id) && tombstones[r.id]?.cloudDeleted !== true)
    .map((r) => r.id);

  // 即使墓碑已完成 (cloudDeleted=true) 也要擋掉 —— 「不會復活」的最後一道防線:
  // 万一雲端因為其他原因又出現這筆 (例如另一台裝置重推), 也不會把它寫回來。
  const dbKept = db.filter((r) => !tombstoned.has(r.id));
  const localKept = local.filter((r) => !tombstoned.has(r.id));

  // 同 id 以 updatedAt 較新者為準 (與 tripStorage.mergeAll 相同)
  const localById = new Map(localKept.map((t) => [t.id, t]));
  const merged: T[] = dbKept.map((dbItem) => {
    const localItem = localById.get(dbItem.id);
    if (!localItem) return dbItem;
    if (
      localItem.updatedAt && dbItem.updatedAt &&
      localItem.updatedAt > dbItem.updatedAt
    ) {
      return localItem;
    }
    return dbItem;
  });

  const dbIds = new Set(dbKept.map((r) => r.id));
  const localOnly = localKept.filter((r) => !dbIds.has(r.id));

  return { merged: [...merged, ...localOnly], staleInCloud };
}

/**
 * 重試刪除「本機已刪、但雲端還在」的班次。
 *
 * 為什麼需要:
 *   刪除時如果雲端 DELETE 被擋掉 (回傳成功但沒刪 / RLS 過濾 / 網路失敗),
 *   該筆會一直留在雲端, 每次 sync 都會被拉回來。用這裡的背景重試補刪,
 *   直到成功為止。
 *
 * 刪除成功後只是把墓碑標成 cloudDeleted=true (備份仍然保留),
 * 在此之前本機一律視為「已刪」, 不會復活。
 */
export async function retryTripDeletes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { supabaseTrips } = await import('./supabase-trips');
    for (const id of ids) {
      const res = await supabaseTrips.delete(id);
      if (res.success) {
        // 雲端已確認刪掉 → 標記完成 (備份仍留在本機)
        markCloudTripDeleted(id);
        console.log(`[TripTombstones] 班次 ${id} 已成功從雲端刪除`);
      } else {
        console.warn(`[TripTombstones] 重試刪除班次 ${id} 失敗:`, res.error);
      }
    }
  } catch (e) {
    console.warn('[TripTombstones] retryTripDeletes failed:', e);
  }
}

/**
 * 還原一筆被刪除的班次 (從本機備份 / 墓碑還原)。
 *
 * @returns 還原後的班次; 找不到備份回傳 null
 */
export async function restoreTripFromTombstone(id: string): Promise<Trip | null> {
  const map = readMap();
  const tombstone = map[id];
  if (!tombstone || !tombstone.trip) return null;

  const trip = tombstone.trip;

  // 先寫回本機
  const { STORAGE } = await import('./storage');
  const all = STORAGE.trips.getAll();
  if (!all.some((r) => r.id === trip.id)) {
    all.push(trip);
    STORAGE.trips.setAll(all);
  }

  // 移除墓碑 (否則 merge 會把它又剔掉)
  clearTripTombstone(id);

  // 重新推上雲端
  try {
    const { pushTripToCloud } = await import('./trip-cloud');
    const err = await pushTripToCloud(trip, 'insert');
    if (err) {
      console.warn('[TripTombstones] 還原後推上雲端失敗:', err);
    }
  } catch (e) {
    console.warn('[TripTombstones] 還原後推上雲端失敗:', e);
  }

  return trip;
}

/**
 * 列出所有可還原的 (已刪) 班次 — 供 UI 顯示「已刪除的班次 (可還原)」。
 */
export function listRestorableTrips(): { id: string; deletedAt: string; trip: Trip | null }[] {
  const map = readMap();
  return Object.entries(map)
    .map(([id, t]) => ({ id, deletedAt: t.deletedAt, trip: t.trip }))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
