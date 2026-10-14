'use client';

import { useEffect, useState, useCallback } from 'react';
import { STORAGE } from './storage';
import { initMockData } from './mock-data';
import { initWithSupabase, isSupabaseAvailable } from './supabase-data';
import type { User, UserRole } from './types';

// 初始化 mock 數據 (僅在 client side)
export function useInitData() {
  useEffect(() => {
    // 如果有 Supabase 配置，先嘗試同步，否則使用 mock 數據
    const init = async () => {
      if (isSupabaseAvailable()) {
        const synced = await initWithSupabase();
        if (!synced) {
          console.log('[Auth] Falling back to mock data');
          initMockData();
        }
      } else {
        initMockData();
      }
    };
    init();
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

  useEffect(() => {
    setUser(STORAGE.auth.get());
    setLoading(false);
  }, []);

  // allowRoles: 可選, 限定只有特定角色可登入
  const login = useCallback((
    phone: string,
    password: string,
    allowedRoles?: UserRole[]
  ): { ok: boolean; error?: string; user?: User } => {
    initMockData();

    // 內建超級管理員帳號 (Bootstrap Admin)
    // - 永遠存在, 與資料來源 (mock / Supabase) 解耦
    // - 當 admin 嘗試登入時, 若 storage 內找不到, 自動補回, 避免「帳戶不存在」
    // - 密碼不符仍回傳「密碼錯誤」(不繞過密碼檢查)
    const ensureBootstrapAdmin = (): User | null => {
      const BOOTSTRAP_ADMIN_PHONE = 'admin';
      const BOOTSTRAP_ADMIN_PASSWORD = 'admin123';
      if (password !== BOOTSTRAP_ADMIN_PASSWORD) return null;

      const existing = STORAGE.users.findByPhone(BOOTSTRAP_ADMIN_PHONE);
      if (existing) return existing;

      const adminUser: User = {
        id: 'user-admin-bootstrap',
        phone: BOOTSTRAP_ADMIN_PHONE,
        password: BOOTSTRAP_ADMIN_PASSWORD,
        role: 'super_admin',
        name: '系統管理員',
        email: 'admin@cloudbuslink.com',
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      STORAGE.users.add(adminUser);
      console.log('[Auth] Bootstrap admin account created on demand');
      return adminUser;
    };

    // 支援 admin 登入 (超級管理員)
    if (phone === 'admin') {
      const found =
        ensureBootstrapAdmin() ?? STORAGE.users.findByPhone('admin');
      if (!found) return { ok: false, error: '帳戶不存在' };
      if (found.password !== password) return { ok: false, error: '密碼錯誤' };
      if (found.status !== 'active') return { ok: false, error: '帳戶已停用' };
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(found.role)) {
        return { ok: false, error: '您無權使用此入口登入' };
      }
      STORAGE.auth.set(found);
      setUser(found);
      return { ok: true, user: found };
    }
    
    const found = STORAGE.users.findByPhone(phone);
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
