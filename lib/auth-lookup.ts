// ============================================================================
//  登入帳號查找 — 支援「電話號碼」或「帳戶名稱」
//
//  背景 (bug fix):
//   使用者在「新增保姆」輸入了電話, 卻顯示「無帳號」→ 登入時查無此人。
//
//   根因有兩個, 這裡一併處理:
//
//   1) **帳戶沒有推到雲端**
//      NannysConsoleContent / ParentsConsoleContent 在新增保姆 / 家長時,
//      只寫了 localStorage 的 STORAGE.users, 卻沒有 push 到 Supabase 的 cbl_users。
//      而 useSyncUsers() → supabaseUsers.syncToStorage() → STORAGE.users.setAll(db)
//      會用雲端的資料「整批覆蓋」localStorage → 剛建立的帳號憑空消失。
//      → 表格顯示「無帳號」。
//
//   2) **帳戶名稱沒有落地到可查的地方**
//      就算帳戶推上了雲端, cbl_users 讀取也可能失敗 (RLS / schema cache)。
//      為了讓「剛建立的帳號」一定找得到, 帳戶名稱同時寫在該筆資料上
//      (cbl_nannies.account_name / cbl_parents.account_name),
//      查找時再由該筆資料的 phone 反查 user。
//
//  查找順序 (先到先得):
//   1. cbl_users.phone 完全相符
//   2. cbl_users.account_name 不分大小寫相符
//   3. cbl_nannies.account_name 相符 → 借其 phone 反查 cbl_users
//   4. cbl_parents.account_name 相符 → 借其 phone 反查 cbl_users
//
//  為什麼把這段抽成獨立檔案:
//    lib/hooks.ts (login) 、login 頁面、nannyloginportal、parentsloginportal
//    都需要同一套查找規則, 集中管理才不會各自寫一套而行為不一致。
// ============================================================================

import { STORAGE } from './storage';
import type { User } from './types';

/**
 * 以「登入帳號」找出對應的 User。
 *
 * @param account 電話號碼或帳戶名稱
 * @returns 找到的 User; 找不到回傳 undefined
 */
export function resolveLoginAccount(account: string): User | undefined {
  const trimmed = (account || '').trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();

  // ---- 1 & 2: 先在 cbl_users 裡找 (最權威) ----
  const byPhone = STORAGE.users.findByPhone(trimmed);
  if (byPhone) return byPhone;

  const byAccountName = STORAGE.users
    .getAll()
    .find((u) => (u.accountName || '').trim().toLowerCase() === lower);
  if (byAccountName) return byAccountName;

  // ---- 3: 保姆 / 家長 資料上的帳戶名稱 ----
  //    找不到直接的 user 時, 借該筆資料的 phone 反查。
  //    (資料上帶著 phone, 所以就算 cbl_users 那筆被 sync 洗掉,
  //     也能靠「本地資料 + 密碼」重建出可登入的 user。)
  const nanny = STORAGE.nannies
    .getAll()
    .find((n) => (n.accountName || '').trim().toLowerCase() === lower);
  if (nanny) {
    const linked = STORAGE.users.findByPhone(nanny.phone);
    if (linked) return linked;
    // cbl_users 沒有這筆 → 用保姆資料 + 預設密碼 (電話) 補回
    const rebuilt = rebuildUserFromNanny(nanny);
    if (rebuilt) return rebuilt;
  }

  const parent = STORAGE.parents
    .getAll()
    .find((p) => (p.accountName || '').trim().toLowerCase() === lower);
  if (parent) {
    const linked = STORAGE.users.findByPhone(parent.phone);
    if (linked) return linked;
    const rebuilt = rebuildUserFromParent(parent);
    if (rebuilt) return rebuilt;
  }

  return undefined;
}

/**
 * 從保姆資料補回登入帳號 (cbl_users 遺失時的自癒)。
 *
 * 密碼預設為電話號碼 (與「新增保姆」時的行為一致)。
 */
function rebuildUserFromNanny(nanny: {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  accountName?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}): User | null {
  if (!nanny.phone) return null;
  const user: User = {
    id: STORAGE.genId('user'),
    phone: nanny.phone,
    accountName: nanny.accountName,
    password: nanny.phone,
    role: 'nanny',
    name: nanny.name,
    clientId: nanny.clientId,
    status: nanny.status === 'inactive' ? 'inactive' : 'active',
    createdAt: nanny.createdAt,
  };
  STORAGE.users.add(user);
  return user;
}

/**
 * 從家長資料補回登入帳號 (cbl_users 遺失時的自癒)。
 *
 * 家長的密碼存在 cbl_parents.password (與電話共同作為登入憑證)。
 */
function rebuildUserFromParent(parent: {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  accountName?: string;
  password: string;
  status: 'active' | 'inactive';
  createdAt: string;
}): User | null {
  if (!parent.phone) return null;
  const user: User = {
    id: STORAGE.genId('user'),
    phone: parent.phone,
    accountName: parent.accountName,
    password: parent.password || parent.phone,
    role: 'parent',
    name: parent.name,
    clientId: parent.clientId,
    status: parent.status === 'inactive' ? 'inactive' : 'active',
    createdAt: parent.createdAt,
  };
  STORAGE.users.add(user);
  return user;
}

/**
 * 登入帳號的格式驗證 (前端用, 給出明確的錯誤訊息)。
 *
 * 規則:
 *   - 8 位數字 → 電話號碼
 *   - 3-32 位英數字元 / _ . - → 帳戶名稱
 */
export function isValidLoginAccount(account: string): boolean {
  const trimmed = (account || '').trim();
  if (!trimmed) return false;
  if (/^[0-9]{8}$/.test(trimmed)) return true;
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(trimmed);
}

/**
 * 判斷輸入看起來像「帳戶名稱」而不是電話 (用於切換 placeholder / 提示文案)。
 */
export function looksLikePhone(account: string): boolean {
  return /^[0-9]{8}$/.test((account || '').trim());
}
