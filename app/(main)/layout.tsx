'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Bus, Settings, ArrowLeft, User as UserIcon, Menu as MenuIcon } from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { getParentPath } from '@/lib/navigation';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { SideMenu } from '@/components/SideMenu';

const navItems = [
  { href: '/', label: '主頁', icon: Home },
  { href: '/trips', label: '班次', icon: Bus },
  { href: '/settings', label: '設定', icon: Settings },
];

/** portal 用戶被拒絕時的落點 (自己的設定頁) */
const PORTAL_HOME: Record<'parent' | 'nanny', string> = {
  parent: '/parents/settings',
  nanny: '/nanny/settings',
};

/**
 * portal 用戶 (nanny / parent) 額外放行的 (main) 頁面。
 *
 * 背景: 保姆要從 /nanny 點「開始打卡 / 繼續打卡」進 /trips/[id]/checkin,
 *       也需要瀏覽自己的班次列表 /trips;
 *       家長要進 /trips/[id] 看乘車紀錄 —— 這些頁面實體上屬於 (main) 群組,
 *       但對 portal 用戶是必要流程的一環, 不能被整個群組關掉。
 *
 * 這些頁面都是「自帶完整 UI、不依賴 (main) 的後台底 nav」的頁面:
 *   - /trips              班次列表
 *   - /trips/[id]/checkin 打卡頁
 *   - /trips/[id]         班次詳情 (完成打卡後的回跳目標)
 * 其餘 (/、/settings 全部) 依然擋掉。
 *
 * 註: /trips/[id]/edit 與 /trips/new 是「編輯班次」, 屬後台操作, 不放行。
 */
const PORTAL_EXTRA_PATHS: Record<'parent' | 'nanny', RegExp[]> = {
  // 家長: 班次列表 + 班次詳情 (從 /parents/trips 進入時的返回路徑)
  parent: [/^\/trips$/, /^\/trips\/[^/]+$/],
  // 保姆: 班次列表 + 班次詳情 + 打卡頁
  nanny: [/^\/trips$/, /^\/trips\/[^/]+$/, /^\/trips\/[^/]+\/checkin$/],
};

/**
 * 判斷 portal 用戶 (parent / nanny) 能否進入目前路徑。
 *
 * (main) 群組對 portal 用戶預設關閉 —— 這裡放行自己 portal 的設定頁,
 * 加上 PORTAL_EXTRA_PATHS 指定的必要流程頁 (打卡 / 班次詳情),
 * 其餘路徑 (/、/trips、/settings 與其所有子頁...) 全部踢回 PORTAL_HOME。
 *
 * 註: 家長的 /parents/settings/binding 與保姆的 /nanny 都在各自的 portal 群組,
 *     不經過本 layout, 因此不受此規則影響。
 */
function canPortalUserAccess(role: 'parent' | 'nanny', pathname: string): boolean {
  if (pathname === PORTAL_HOME[role]) return true;
  return PORTAL_EXTRA_PATHS[role].some(re => re.test(pathname));
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!user) return;

    // Role-based route protection
    // - parent / nanny 不可進入 (main) 群組的任何頁面, 一律踢回自己的設定頁
    // - 其他角色 (super_admin / client) 自由進出
    if (user.role === 'parent' || user.role === 'nanny') {
      if (!canPortalUserAccess(user.role, pathname)) {
        router.replace(PORTAL_HOME[user.role]);
      }
      return;
    }
  }, [user, loading, router, pathname]);

  // 第一次 render (SSR/尚未 mount) 顯示 loading;
  // 用 mounted 確保 server/client 一致: server render 時 mounted=false → 顯示 loading
  // client hydrate 後 useEffect 設定 mounted=true, 才渲染真實 UI
  // 當 user 已從 localStorage 同步讀到時立即渲染
  // (login/logout 切換時 loading=true 的短暫空檔才顯示 spinner)
  if (!mounted || (loading && !user)) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null; // 等待 useEffect 跳轉到 /login
  }

  // Portal 用戶 (parent / nanny) 未被放行時, 連 children 都不渲染。
  //
  // 為什麼需要這段: 上面的 useEffect 是在 paint 後才執行, 若先渲染 children
  // 再跳轉, 使用者會看到自己無權進入的頁面 (例如家長輸入 /settings/students
  // 會先閃一下學生管理畫面)。這裡在 render 階段就擋掉, 杜絕那個閃爍。
  const isPortalUser = user.role === 'parent' || user.role === 'nanny';
  const portalBlocked =
    isPortalUser && !canPortalUserAccess(user.role as 'parent' | 'nanny', pathname);

  if (portalBlocked) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Bottom Nav 頂層頁面 (主頁/班次/設定): 屬於 Tab 切換, 不顯示返回鍵
  // 從子頁 (如 /trips/[id], /settings/profile) 進入才顯示返回鍵
  const topLevelPaths = ['/', '/trips', '/settings'];
  const isTopLevel = topLevelPaths.includes(pathname);

  // CBL Admin Setting 頁面使用自己的 Dashboard UI, 不顯示 Bottom Nav
  // 注意: cbl-admin-setting 的 path 已從 /settings/cbl-admin-setting 改成 /cbl-admin-setting,
  // 子頁面 (/cbl-admin-setting/students, /parents, ...) 也要涵蓋。
  const isCblAdminSetting =
    pathname === '/cbl-admin-setting' || pathname.startsWith('/cbl-admin-setting/');

  // 表單頁面 (/trips/new, /trips/[id]/edit) 自帶頁內返回/取消,
  // 不需要全局 header 的返回鍵重複顯示
  const isFormPage = /^\/trips\/new$/.test(pathname) || /^\/trips\/[^/]+\/edit$/.test(pathname);
  const showBackButton = !isTopLevel && !isFormPage;

  // 角色判斷 - parent / nanny 只能使用自己的 portal, 不顯示後台 nav
  const portalTitle = user.role === 'parent' ? '家長 Portal' :
                      user.role === 'nanny' ? '保姆 Portal' :
                      settings?.title || 'CloudBusLink';

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Header - h-[61px] (56 + 5) + liquid-glass backdrop + 公告 + burger 按鈕
          CBL Admin Setting 頁面自帶完整 header (有返回鍵 / 搜尋 / 暗色 / 時間),
          隱藏 layout 頂部 header 避免重複顯示 */}
      {!isCblAdminSetting && (
        <header className="flex-shrink-0 z-40 liquid-glass safe-top">
          <div className="flex items-center justify-between h-[61px] px-4">
          <div className="flex items-center gap-2 min-w-0">
            {showBackButton && (
              <button
                onClick={() => router.push(
                  user?.role === 'nanny'
                    ? '/nanny'
                    : user?.role === 'parent'
                    ? '/parents/trips'
                    : getParentPath(pathname)
                )}
                className="p-2 -ml-2 rounded-full active:bg-muted active:scale-95 transition-transform"
                aria-label="返回"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            {settings?.logo && !isPortalUser ? (
              <img src={settings.logo} alt="Logo" className="h-7 w-auto object-contain" />
            ) : (
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    user.role === 'parent' ? 'bg-pink-500' :
                    user.role === 'nanny' ? 'bg-emerald-500' : ''
                  }`}
                  style={!isPortalUser ? { backgroundColor: settings?.primaryColor || '#3b82f6' } : undefined}
                >
                  <UserIcon className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-sm truncate">
                  {portalTitle}
                </span>
              </div>
            )}
          </div>

          {/* 右側: 公告 (Bell) + 漢堡選單 (Menu) */}
          <div className="flex items-center gap-1">
            <NotificationDropdown />
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center active:bg-muted active:scale-95 transition-transform"
              aria-label="選單"
            >
              <MenuIcon className="w-5 h-5 text-foreground/80" />
            </button>
          </div>
        </div>
      </header>
      )}

      {/* 主要內容 - 各 page 自行控制滾動
          - 用 popLayout 讓新舊內容疊加, 避免 mode="wait" 的空檔期
          - 初始 opacity 0.4 避免「從 0 載入」的感覺, 視覺上直接是換頁
          - 頁面本身已是相對定位 + 絕對填充, 配合 absolute inset-0 */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute inset-0 overflow-y-auto no-scrollbar"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav - iOS-style 浮動 pill, 寬度 65% 置中
          - portal 用戶 (parent/nanny) 只有單一頁面, 不顯示底 nav
          - CBL Admin Setting 頁面有自己的 Dashboard UI, 不顯示底 nav */}
      {!isPortalUser && !isCblAdminSetting && (
        <nav className="fixed bottom-3 left-0 right-0 z-40 safe-bottom pointer-events-none">
          <div className="mx-auto max-w-[65vw] liquid-glass rounded-2xl shadow-lg p-1.5 pointer-events-auto">
            <div className="grid grid-cols-3 gap-1">
              {navItems.map((item) => {
                const active = pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex flex-row items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors',
                      active ? 'text-primary' : 'text-foreground/70'
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute inset-0 bg-primary/15 rounded-xl"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className="w-5 h-5 relative" />
                    <span className="relative">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* 側邊選單 — 2026 Refined Glassmorphism, 從右側滑入 */}
      <SideMenu open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
