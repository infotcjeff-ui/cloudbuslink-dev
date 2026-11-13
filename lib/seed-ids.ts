/**
 * lib/seed-ids.ts — 測試種子資料的識別旗標 (單一事實來源)
 *
 * 用途:
 *   1. 「一鍵移除測試資料」只刪 `seed-` / 舊 `test-` 前綴, 不碰真實資料。
 *   2. **打卡 / 班次推雲端前先擋下測試資料** ——
 *      測試班次只存在於 localStorage, 若打卡時把它 push 上 Supabase:
 *        - cbl_trips.update 會回「雲端找不到這筆資料」(該筆從未 insert)
 *        - cbl_attendances.upsert 會因 FK (trip_id / student_id) 撞 constraint 失敗
 *        - 若哪天補推上去, 後台就會出現一整批假班次 + 假打卡
 *      → 測試資料必須「永遠不上雲」。
 *
 * ⚠️ 為什麼不能只放在 lib/seed-schedule-test.ts:
 *    打卡頁 (app/(main)/trips/[id]/checkin/page.tsx) 需要這個判斷,
 *    但那個檔案 import 了排程頁的 scheduleUtils, 會造成不必要的耦合。
 */

export const SEED_PREFIX = 'seed-';
export const SEED_LEGACY_PREFIX = 'test-';

/** 這個 id 是測試種子資料嗎? (含舊的 test- 前綴) */
export function isSeedId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith(SEED_PREFIX) || id.startsWith(SEED_LEGACY_PREFIX);
}
