'use client';

import { useEffect, useState, useCallback } from 'react';
import { STORAGE } from './storage';
import { initWithSupabase, isSupabaseAvailable } from './supabase-data';
import { resolveLoginAccount } from './auth-lookup';
import type { User, UserRole } from './types';

// 初始化資料 (僅在 client side, 只走 Supabase)
export function useInitData() {
  useEffect(() => {
    const init = async () => {
      if (isSupabaseAvailable()) {
        await initWithSupabase();
      }
    };
    init();
  }, []);
}

/**
 * 同步「登入帳號」到 LocalStorage — 每次 mount 都會執行 (不論是否已 initialized)。
 *
 * 為什麼要獨立於 useInitData:
 * - initWithSupabase() 在 localStorage 已 initialized 時會直接 return true,
 *   所以其他資料在第一次載入後就不再更新 (這是刻意的, 避免每次都重拉)
 * - 但「登入帳號」是安全相關資料: 密碼被改、帳號被停用、名稱被更新...
 *   這些都必須即時反映, 否則舊密碼仍可登入
 * - cbl_users 是一張很小的表, 每次 mount 拉一次的成本可以忽略
 */
export function useSyncUsers() {
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!isSupabaseAvailable()) return;
      try {
        const { supabaseUsers } = await import('./supabase-users');
        await supabaseUsers.syncToStorage();
      } catch (e) {
        console.warn('[Auth] user sync failed:', e);
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, []);
}

// 認證 Hook
export function useAuth() {
  // 同步初始化: SSR 階段沒有 localStorage, 走默認 false
  // client 階段直接讀 localStorage, 避免 loading=true 的初始空閃
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    return STORAGE.auth.get();
  });
  const [loading, setLoading] = useState(true);

  useInitData();
  useSyncUsers();

  useEffect(() => {
    setUser(STORAGE.auth.get());
    setLoading(false);
  }, []);

  // allowRoles: 可選, 限定只有特定角色可登入
  //
  // account 可以是「電話號碼」或「帳戶名稱」:
  //   - 電話號碼: 8 位數字 (香港)
  //   - 帳戶名稱: 3-32 位英數字元 (自訂, 例如 `siu-ming`)
  // 兩者都會先經過 STORAGE.users.findByAccount() 查找。
  const login = useCallback((
    account: string,
    password: string,
    allowedRoles?: UserRole[]
  ): { ok: boolean; error?: string; user?: User } => {
    // 帳號一律從 STORAGE 查找 (STORAGE 內的資料由 Supabase sync 帶進來,
    // 且 useSyncUsers() 每次 mount 都會把 cbl_users 拉回來覆蓋)。
    //
    // 註: 這裡「刻意」不再保留任何 bootstrap / 後門管理員帳號。
    // 舊版有一個 `admin` / `admin123` 的硬寫超管, 任何人知道帳密就能拿到
    // 系統最高權限 — 已經移除。現在的超管必須是在 /cbl-admin-setting/user
    // 建立的正式帳號 (密碼存在 cbl_users)。
    //
    // ⚠️ 帳戶名稱存在哪裡?
    //   早期以為帳戶名稱只是「電話的別名」, 所以只存在 cbl_users.account_name。
    //   但實際上 cbl_users 這張表在「有 RLS 政策 + 沒跑過 add migration」時
    //   讀不到剛建立的帳號 → 登入時查無此人 → 使用者看到「帳戶不存在」。
    //   為了讓「剛建立的帳號」一定找得到, 帳戶名稱同時寫在:
    //     1. cbl_users.account_name  (雲端 — 跨裝置)
    //     2. cbl_nannies.account_name / cbl_parents.account_name (該筆資料上)
    //   查找順序: 先查 cbl_users, 查不到再查 nannies / parents 兩張表,
    //   藉由該筆資料的 phone 反查 user。詳見 lib/auth-lookup.ts。
    const found = resolveLoginAccount(account);
    if (!found) return { ok: false, error: '帳戶不存在' };
    if (found.password !== password) return { ok: false, error: '密碼錯誤' };
    if (found.status !== 'active') return { ok: false, error: '帳戶已停用' };
    // 角色權限檢查
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(found.role)) {
      return { ok: false, error: '您無權使用此入口登入' };
    }
    STORAGE.auth.set(found);
    setUser(found);
    return { ok: true, user: found };
  }, []);

  const logout = useCallback(() => {
    STORAGE.auth.clear();
    setUser(null);
    // 清除後立即跳轉到登入頁，避免等待 useEffect 觸發
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, []);

  const updateProfile = useCallback((patch: Partial<User>) => {
    if (!user) return;
    STORAGE.users.update(user.id, patch);
    const updated = { ...user, ...patch };
    STORAGE.auth.set(updated);
    setUser(updated);
  }, [user]);

  return { user, loading, login, logout, updateProfile };
}

// 獲取當前 Client 設定
export function useSettings(clientId?: string) {
  // 不論 clientId 是否已就緒都先抓一份 (getByClient 會 fallback 到 default())。
  // 為何: 第一次 render 時 user 還沒從 localStorage 讀到, clientId 為 undefined;
  // 若回 null, 任何依賴 settings 的 setState (例如儲存) 會被 `if (!settings) return`
  // 吞掉。用 default() 兜底確保 hook 在 hydration race 期間仍是「可用」狀態。
  const [settings, setSettingsState] = useState(() =>
    STORAGE.settings.getByClient(clientId || '')
  );

  useEffect(() => {
    // 重新讀 storage 確保拿到最新值 (e.g. 別處改過 settings)
    setSettingsState(STORAGE.settings.getByClient(clientId || ''));
  }, [clientId]);

  const updateSettings = useCallback((patch: Partial<typeof settings>) => {
    // 防呆: clientId 還沒拿到時拒絕寫入, 避免把 default 物件以 '' 當 key 寫進 storage
    if (!clientId) return;
    // 即使 settings 之前是 default fallback, 也重新讀一次 storage 拿最新
    // (避免 stale state 蓋掉別處的更新)。
    const cur = STORAGE.settings.getByClient(clientId);
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    STORAGE.settings.set(next);
    setSettingsState(next);
  }, [clientId]);

  return { settings, updateSettings };
}
