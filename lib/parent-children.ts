// ============================================================================
//  家長 ↔ 子女 關聯解析 (共用邏輯)
//
//  背景 (bug fix):
//    家長在 /parents、/parents/settings/binding、/parents/trips 三個頁面
//    都看不到自己已綁定的子女, 班次頁也找不到子女所屬的班次。
//
//  根因有兩類:
//
//  1) **後台「家長 → 關聯學生」只寫 localStorage, 沒推回 Supabase。**
//     /cbl-admin-setting/parents 儲存家長時, 會呼叫
//     `STORAGE.students.update(sid, { parentIds: [...] })` 綁定子女,
//     但沒有呼叫 `supabaseStudents.update(...)`。
//     → 下一次 syncFromSupabase() 用雲端快照覆蓋學生 → parentIds 連結消失。
//     → 家長端自然「查不到自己的子女」, 班次也跟著空。
//
//  2) **三個頁面各自用不同規則找家長。**
//     - /parents            → 用 `p.phone === user.phone` + `getByClient(user.clientId)`
//     - /parents/.../binding→ 用 `user.id.replace('user-','')` (實際上永遠配對不到)
//     - /parents/trips      → 先試 id 再試 phone
//     而且都直接用 `user.clientId` 過濾, clientId 為空時整批查不到資料。
//
//  → 這裡把「找家長 / 取子女 / 判斷班次」統一成一份實作, 三個頁面共用。
// ============================================================================

import { STORAGE } from './storage';
import type { Parent, Student, Trip, User } from './types';

/**
 * 找出登入帳號對應的家長記錄 (cbl_parents)。
 *
 * 查找順序 (先到先得):
 *   1. parent.id 與 user.id 完全相符
 *   2. parent.id 與 user.id 去掉 'user-' 前綴後相符 (少數流程沿用 user id)
 *   3. 電話完全相符
 *   4. 帳戶名稱不分大小寫相符
 *
 * ⚠️ 為什麼要跨機構查 (不先 getByClient):
 *   家長帳號的 clientId 有時是空的 (帳號是後來才補建立的),
 *   一旦先用 clientId 過濾就整批查不到 → 「明明有子女卻顯示 0 位」。
 */
export function findParentForUser(
  user: User | null | undefined,
  parents?: Parent[],
): Parent | null {
  if (!user) return null;

  const all = parents ?? STORAGE.parents.getAll();
  if (all.length === 0) return null;

  const phone = (user.phone || '').trim();
  const account = (user.accountName || '').trim().toLowerCase();
  const bareUserId = user.id.startsWith('user-') ? user.id.slice(5) : user.id;

  // 1 & 2) id 比對
  const byId = all.find(
    (p) => p.id === user.id || (!!bareUserId && p.id === bareUserId),
  );
  if (byId) return byId;

  // 3) 電話比對
  // 同一電話可能有多筆家長 (重複建立), 優先回「有綁子女」的那筆,
  // 否則登入會命中空的那筆 → 顯示暫無綁定學生。
  if (phone) {
    const samePhone = all.filter((p) => (p.phone || '').trim() === phone);
    if (samePhone.length === 1) return samePhone[0];
    if (samePhone.length > 1) {
      try {
        const students = STORAGE.students.getAll();
        const withKids = samePhone.find((p) =>
          students.some((s) => (s.parentIds || []).includes(p.id)),
        );
        return withKids ?? samePhone[0];
      } catch {
        return samePhone[0];
      }
    }
  }

  // 4) 帳戶名稱比對
  if (account) {
    const byAccount = all.find(
      (p) => (p.accountName || '').trim().toLowerCase() === account,
    );
    if (byAccount) return byAccount;
  }

  return null;
}

/**
 * 可視為「同一位家長」的 id 集合。
 *
 * 除了 parent.id, 也把 user.id (與去掉前綴的版本) 算進去 ——
 * 因為早期流程曾經把登入帳號 id 直接寫進 student.parentIds。
 * 少了這層, 那批資料會被判成「沒綁任何人」。
 */
export function parentIdCandidates(
  parent: Parent | null | undefined,
  user?: User | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (parent?.id) ids.add(parent.id);
  if (user?.id) {
    ids.add(user.id);
    if (user.id.startsWith('user-')) ids.add(user.id.slice(5));
  }
  return ids;
}

/**
 * 取得某位家長綁定的所有子女。
 *
 * @param parent  家長記錄 (可為 null → 回傳空陣列)
 * @param students 學生清單 (不傳則讀全部)
 * @param user    登入者 (用來補上 user id 形式的候選 id)
 */
export function getChildrenOfParent(
  parent: Parent | null | undefined,
  students?: Student[],
  user?: User | null | undefined,
): Student[] {
  const ids = parentIdCandidates(parent, user);
  if (ids.size === 0) return [];

  const all = students ?? STORAGE.students.getAll();
  // 同一電話若有多筆家長記錄 (重複建立), id 都視為同一人 ——
  // 綁到其中任一 id 都算, 否則家長端永遠找不到子女。
  try {
    if (parent?.phone) {
      const phone = parent.phone.trim();
      for (const p of STORAGE.parents.getAll()) {
        if ((p.phone || '').trim() === phone) ids.add(p.id);
      }
    }
  } catch {
    /* ignore */
  }
  return all.filter((s) => (s.parentIds || []).some((pid) => ids.has(pid)));
}

/**
 * 一次性取得「登入家長 + 他的所有子女」。
 *
 * 這是家長端三個頁面 (/parents、/parents/settings/binding、/parents/trips)
 * 共同的入口 ——
 *   1. 先用 cbl_parents 記錄找家長 (id → 電話 → 帳戶名稱)
 *   2. 再用 student.parentIds 找子女
 *   3. 若仍找不到 (parent 記錄遺失 / clientId 對不上), 退而用 user.id 比對
 *
 * @param user 登入者
 * @param opts.scope 資料可見範圍 (跨機構角色看全部); 不傳則用 user.clientId
 */
export function resolveParentChildren(
  user: User | null | undefined,
  opts?: { isSuperAdmin?: boolean; clientId?: string },
): { parent: Parent | null; students: Student[] } {
  if (!user) return { parent: null, students: [] };

  const parent = findParentForUser(user);

  // 先從全部學生找 (家長記錄的 clientId 有時對不上, 先用 id/電話配對比較穩)
  let students = getChildrenOfParent(parent, undefined, user);

  if (students.length === 0) {
    // 自癒: parent 記錄遺失 / clientId 不對 → 直接用 user id 比對 parentIds
    const bareId = user.id.replace(/^user-/, '');
    const all = opts?.isSuperAdmin
      ? STORAGE.students.getAll()
      : STORAGE.students.getByClient(opts?.clientId || user.clientId || '');
    students = all.filter((s) =>
      (s.parentIds || []).some((pid) => pid === user.id || pid === bareId),
    );
  }

  return { parent, students };
}

/**
 * 這個班次是否涉及指定的學生?
 *
 * 除了 trip.studentIds, 也要檢查 waypoints[].studentIds ——
 * 有些班次 (例如從路線模板帶出來的) 只把學生寫在站點上,
 * 沒寫到 trip.studentIds, 只看後者會漏掉 → 家長在班次頁看不到班次。
 */
export function tripInvolvesStudents(
  trip: Trip,
  studentIds: Set<string>,
): boolean {
  if (!trip || studentIds.size === 0) return false;
  if ((trip.studentIds || []).some((id) => studentIds.has(id))) return true;
  return (trip.waypoints || []).some((w) =>
    (w.studentIds || []).some((id) => studentIds.has(id)),
  );
}
