/**
 * lib/announcement-audience.ts — 公告受眾判斷
 *
 * 背景 (2026-11):
 *   公告分成兩類:
 *     - 'system'  系統公告 → 所有用戶都看得到
 *     - 'payment' 繳費公告 → 只有被選中的家長看得到
 *
 * 這個模組把「某個登入者能看到哪些公告」的判斷集中在一處,
 * 讓 /AnnouncementPopup、/NotificationDropdown 兩邊共用同一套規則。
 *
 * ⚠️ 為什麼要放在獨立檔案:
 *   它需要同時用到 STORAGE (讀公告/家長) 與 parent-children (找家長記錄),
 *   放進 storage.ts 會造成循環 import。
 */

import { STORAGE } from './storage';
import { findParentForUser, parentIdCandidates } from './parent-children';
import type { User } from './types';

/** 受眾判斷所需的上下文 */
export interface AnnouncementAudience {
  /** 登入者的角色 */
  role?: string;
  /**
   * 這位登入者「所有可能的身分 id」集合。
   *
   * ⚠️ 為什麼要用「集合」而不是單一 parentId:
   *   家長帳號在系統裡可能同時以幾種 id 形式出現:
   *     - cbl_parents.id
   *     - user.id
   *     - user.id 去掉 'user-' 前綴
   *   而公告的 target_parent_ids 存的是 cbl_parents.id。
   *   → 全部放進集合, 任一個命中就算看到。
   */
  parentIds?: Set<string>;
}

/**
 * 取得某位登入者的受眾上下文。
 *
 * @param user 登入者
 * @param isSuperAdmin 是否為跨機構管理員 (看得到所有公告)
 */
export function getAnnouncementAudience(
  user: User | null | undefined,
  isSuperAdmin = false,
): AnnouncementAudience {
  if (!user) return { role: undefined, parentIds: new Set() };

  const role = user.role;
  // 管理員角色 → 不受受眾過濾 (matchesAudience 會直接回 true)
  if (isSuperAdmin || role === 'client' || role === 'system_admin') {
    return { role, parentIds: new Set() };
  }

  // ⚠️ 只有「家長」角色才可能是繳費公告的受眾。
  //    保姆 (nanny) 即使手機號碼剛好跟某位家長一樣, 也不該看到繳費公告
  //    → 非家長角色直接回空集合。
  if (role !== 'parent') return { role, parentIds: new Set() };

  const ids = new Set<string>();

  // 1) 直接找家長記錄 (依 id / 電話 / 帳戶名稱比對)
  const parent = findParentForUser(user);
  for (const id of parentIdCandidates(parent, user)) ids.add(id);

  // 2) 同一電話的其他家長記錄 (重複建立的資料也要算同一人)
  if (parent?.phone) {
    const phone = parent.phone.trim();
    for (const p of STORAGE.parents.getAll()) {
      if ((p.phone || '').trim() === phone) ids.add(p.id);
    }
  }

  return { role, parentIds: ids };
}
