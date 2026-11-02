'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { STORAGE } from './storage';
import { initWithSupabase, syncFromSupabase, isSupabaseAvailable } from './supabase-data';
import { resolveLoginAccount } from './auth-lookup';
import { findNannyForUser, getNannyTrips } from './nanny-trips';
import type { User, UserRole, Nanny, Trip } from './types';

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

/**
 * useNannyTrips — 取得登入保姆在指定日期的班次, 並在雲端同步完成後自動重畫。
 *
 * 為什麼需要這個 hook (而不是各頁自己 useEffect):
 *   1. **雲端同步是非同步的**
 *      useAuth() → useInitData() → initWithSupabase() 會在背景拉雲端資料。
 *      保姆頁 mount 時 localStorage 可能還是空的 → 讀到 0 班。
 *      同步完成後 supabase-data 會 dispatch 'cbl-trips-refresh' 等事件,
 *      這個 hook 監聽它們 → 重新讀取 → 畫面自動更新。
 *      之前保姆頁完全沒有監聽 → 使用者必須手動重新整理才看得到班次。
 *
 *   2. **班次歸屬規則要一致**
 *      「這班是不是我的」在管理員排程頁與保姆 portal 必須同一套規則
 *      (trip.nannyId 精確匹配 → 校巴綁定 fallback), 否則管理員看得到、
 *      保姆看不到。共用邏輯放在 lib/nanny-trips.ts。
 *
 * @param date YYYY-MM-DD (本地時區日期字串)
 */
export function useNannyTrips(date: string) {
  const { user } = useAuth();
  const [nanny, setNanny] = useState<Nanny | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  // 用 ref 保存最新的 nanny / date, 讓 interval 回呼 (effect 閉包外的舊值)
  // 不會讀到過期的資料。
  const nannyRef = useRef<Nanny | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;

  useEffect(() => {
    if (!user) {
      nannyRef.current = null;
      setNanny(null);
      setTrips([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const reload = () => {
      if (cancelled) return;
      const found = findNannyForUser(user) ?? null;
      nannyRef.current = found;
      setNanny(found);
      setTrips(found ? getNannyTrips(found, dateRef.current, user.clientId) : []);
      setLoading(false);
    };

    // 立即載入一次 (localStorage 已有資料時秒開)
    reload();

    // ⚠️ 主動從雲端拉一次 (核心修復)
    //
    // 為什麼需要:
    //   initWithSupabase() 在 localStorage 已 initialized (cbl_initialized=true) 時
    //   會直接 return true → 永遠不會再拉雲端。
    //   結果: 管理員在別的分頁/裝置新增班次並綁了保姆, 保姆這邊的 localStorage
    //   還是舊快照 → 「今日沒有班次」, 而且重新整理也救不了 (因為 initialized 還是 true)。
    //
    //   所以保姆頁 mount 時要主動 syncFromSupabase()。
    //   (tripStorage.mergeAll 以 updatedAt 較新者為準, 會把雲端新班次合併進來,
    //    又不會吃掉本機尚未 push 的變更。)
    let syncTimer: number | undefined;
    const doSync = async () => {
      if (!isSupabaseAvailable()) return;
      try {
        await syncFromSupabase();
      } catch (e) {
        console.warn('[useNannyTrips] cloud sync failed:', e);
      }
    };
    void doSync();

    // 監聽各實體的 refresh 事件 (雲端同步完成 / 後台改資料)
    const events = [
      'cbl-trips-refresh',
      'cbl-nannys-refresh',
      'cbl-nannies-refresh',
      'cbl-buses-refresh',
      'cbl-users-refresh',
      'cbl-clients-refresh',
    ];
    events.forEach((ev) => window.addEventListener(ev, reload));

    // 定期重新拉取雲端 (每 2 分鐘) + 跨日更新 (每分鐘檢查日期)
    const timer = window.setInterval(() => {
      if (cancelled) return;
      const cur = nannyRef.current;
      setTrips(cur ? getNannyTrips(cur, dateRef.current, user.clientId) : []);
    }, 60_000);

    const syncTimerHandle = window.setInterval(() => {
      if (cancelled) return;
      void doSync();
    }, 120_000);
    syncTimer = syncTimerHandle;

    // 從背景切回前景時也拉一次 (手機 App 常用情境)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void doSync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      events.forEach((ev) => window.removeEventListener(ev, reload));
      window.clearInterval(timer);
      if (syncTimer !== undefined) window.clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, date]);

  return { nanny, trips, loading };
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
