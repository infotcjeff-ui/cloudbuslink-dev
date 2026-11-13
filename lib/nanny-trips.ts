// ============================================================================
//  保姆視角的班次解析 (共用邏輯)
//
//  背景 (bug fix):
//    登入保姆後, 「今日班次」一直顯示為空 — 但管理員在排程頁明明看得到
//    該班次, 而且該班次的跟車保姆正是這位保姆。
//
//  根因有三個, 這裡一次解決:
//
//  1) **UTC 日期錯誤**
//     保姆頁原本用 `new Date().toISOString().split('T')[0]` 取「今日」。
//     toISOString() 回傳 UTC, 香港 (UTC+8) 在 00:00–07:59 期間 UTC 日期還是
//     「昨天」 → 今天的班次全部對不上。
//     → 改用本地時區的 `today()` (見 lib/utils.ts)。
//
//  2) **只認 trip.nannyId, 不認「校巴綁定」**
//     管理員在排程頁顯示跟車保姆時用的是「三級解析」:
//       (a) trip.nannyId 精確匹配 → (b) 該校巴綁定的 active 保姆 → (c) 無
//     但保姆 portal 只做了 (a)。而實際上很多班次是靠「校巴綁定」才綁到人的
//     (校巴管理頁選了跟車保姆 → 反向寫入 Nanny.assignedBusIds;
//      路線模板帶出來的班次也可能沒有寫死 nannyId)。
//     → 這裡實作與管理員頁完全一致的解析規則。
//
//  3) **資料同步後沒有重繪**
//     useAuth() 會在背景跑 initWithSupabase() 拉雲端資料,
//     但那是非同步的; 保姆頁的 useEffect 在同步完成前就讀完了 localStorage
//     (空的) → 畫面顯示「今日沒有班次」。
//     而保姆頁完全沒有監聽 cbl-trips-refresh 事件 → 同步完成後不會重畫,
//     使用者必須手動重新整理才看得到。
//     → 見 lib/hooks.ts 的 useNannyTrips (會監聽各 refresh 事件)。
// ============================================================================

import { STORAGE } from './storage';
import { isTripTombstoned } from './trip-tombstones';
import type { Nanny, Trip, User } from './types';

/**
 * 找出登入帳號對應的保姆記錄。
 *
 * 查找順序 (先到先得):
 *   1. 同一學校內, phone 完全相符
 *   2. 同一學校內, accountName 不分大小寫相符
 *   3. 同一學校內, name 不分大小寫相符 (兜底: 電話/帳號改過但人名未改)
 *   4. 全域 (跨機構) phone 相符
 *   5. 全域 (跨機構) accountName 相符
 *   6. 全域 (跨機構) name 相符 (兜底)
 *
 * ⚠️ 為什麼不只靠 phone:
 *   登入支援「帳戶名稱」, 而 cbl_users 與 cbl_nannies 的資料同步時機不同,
 *   帳號的 clientId 也可能與保姆記錄不同 (例如帳號被管理員改過機構)。
 *   所以 phone / accountName 兩種都要試, 且不能只限同一 clientId。
 *   name 兜底是最後手段: 保姆名 (如 Wendy) 在同校內通常唯一,
 *   電話換過但名未換時仍能對上人, 避免「歡迎 Wendy 但今日 0 班」的靜默失敗。
 */
export function findNannyForUser(
  user: User | null | undefined,
): Nanny | undefined {
  if (!user) return undefined;

  const phone = (user.phone || '').trim();
  const account = (user.accountName || '').trim().toLowerCase();
  const name = (user.name || '').trim().toLowerCase();
  if (!phone && !account && !name) return undefined;

  const all = STORAGE.nannies.getAll();
  const clientId = (user.clientId || '').trim();

  const matchPhone = (n: Nanny) => !!phone && (n.phone || '').trim() === phone;
  const matchAccount = (n: Nanny) =>
    !!account && (n.accountName || '').trim().toLowerCase() === account;
  const matchName = (n: Nanny) =>
    !!name && (n.name || '').trim().toLowerCase() === name;

  // 1) 同一學校
  if (clientId) {
    const sameClient = all.filter((n) => n.clientId === clientId);
    const hit =
      sameClient.find(matchPhone) ?? sameClient.find(matchAccount) ?? sameClient.find(matchName);
    if (hit) return hit;
  }

  // 2) 跨機構
  return all.find(matchPhone) ?? all.find(matchAccount) ?? all.find(matchName);
}

/**
 * 這個班次是不是這位保姆的班次?
 *
 * 與管理員排程頁 (`joinTripRelationsWithMaps`) 的解析規則一致:
 *   1. trip.nannyId === nanny.id → 是
 *   2. trip.nannyId 有值但該保姆已不存在 (被刪 / 雲端 FK set null / 舊資料)
 *      → fallback: 這位保姆有綁這台校巴 → 是
 *   3. trip.nannyId 有值且指向另一位「仍存在」的保姆 → 否
 *      (該班次明確指派給別人, 不能因為同車就搶過來)
 *   4. trip.nannyId 為空 → fallback: 這位保姆有綁這台校巴 → 是
 *
 * @param nannyById 已知保姆索引 (用來判斷 trip.nannyId 指向的保姆是否還存在)
 */
export function isTripOfNanny(
  trip: Trip,
  nanny: Nanny,
  nannyById?: Map<string, Nanny>,
): boolean {
  if (trip.nannyId === nanny.id) return true;

  // 明確指派給另一位「仍存在」的保姆 → 不屬於這位保姆
  if (trip.nannyId && nannyById?.has(trip.nannyId)) return false;

  // 其餘情況 (未指派 / 指派對象已不存在) → 用校巴綁定 fallback
  return (nanny.assignedBusIds ?? []).includes(trip.busId);
}

/**
 * 取某位保姆在指定日期的班次 (依出發時間排序)。
 *
 * @param date YYYY-MM-DD (本地時區)
 */
export function getNannyTrips(
  nanny: Nanny,
  date: string,
  userClientId?: string,
): Trip[] {
  const nannyById = new Map(
    STORAGE.nannies.getAll().map((n) => [n.id, n] as const),
  );
  const allowedClients = new Set(
    [nanny.clientId, userClientId].filter(Boolean) as string[],
  );

  return STORAGE.trips
    .getAll()
    .filter((t) => {
      // 已刪班次 (本機墓碑) 一律不顯示 — 防止「刪後又復活」殘留 (見 lib/trip-tombstones.ts)
      if (isTripTombstoned(t.id)) return false;
      // 租戶隔離: 班次必須屬於保姆 (或登入帳號) 的學校
      if (allowedClients.size > 0 && !allowedClients.has(t.clientId)) {
        return false;
      }
      if (t.date !== date) return false;
      return isTripOfNanny(t, nanny, nannyById);
    })
    .sort((a, b) => a.plannedStartTime.localeCompare(b.plannedStartTime));
}

/** 這位保姆綁定的校巴 (assignedBusIds) */
export function getNannyBuses(nanny: Nanny) {
  const all = STORAGE.buses.getAll();
  const byId = new Map(all.map((b) => [b.id, b] as const));
  return (nanny.assignedBusIds ?? [])
    .map((id) => byId.get(id))
    .filter((b): b is NonNullable<typeof b> => !!b);
}

/**
 * 找出「繼續打卡」應該回到的站點索引。
 *
 * 背景:
 *   班次站點 (waypoints) 係有序的, 每站都要逐個「打卡 → 完成上車/下車」。
 *   使用者離開打卡頁再回來時, 若永遠由第 1 站開始, 就要重新做已完成的站點。
 *
 * 判定順序:
 *   1. 已完成 (status='completed') 的站點 → 跳過, 唔會係當前步驟
 *   2. 第一個「未完成」站點 → 呢個就係應該回到的步驟
 *      (該站可能已打了一部分學生的卡, 但站點本身未完成 → 直接回到佢)
 *   3. 全部站點都完成 → 回傳最後一站 (班次應該收尾)
 *
 * @param trip 班次
 */
export function getResumeWaypointIndex(trip: Trip): number {
  const wps = trip.waypoints ?? [];
  if (wps.length === 0) return 0;

  // 已完成站點的索引集合
  // 判斷依據 (兩者取聯集, 避免不同步造成重複打卡):
  //   1. waypoint.status === 'completed'
  //   2. trip.completedStops 包含該 waypoint.id (雲端同步後 status 可能未落地)
  const doneStopIds = new Set(trip.completedStops ?? []);
  const completed = new Set<number>();
  wps.forEach((wp, i) => {
    if (wp.status === 'completed' || doneStopIds.has(wp.id)) completed.add(i);
  });

  // 第一個未完成站點
  for (let i = 0; i < wps.length; i++) {
    if (!completed.has(i)) return i;
  }

  // 全部完成 → 回到最後一站
  return wps.length - 1;
}
