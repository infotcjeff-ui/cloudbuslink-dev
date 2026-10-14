'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Bus, Settings, LogOut, ArrowLeft } from 'lucide-react';
import { useAuth, useSettings } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { getParentPath } from '@/lib/navigation';
import { NotificationDropdown } from '@/components/NotificationDropdown';

export default function ParentsPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const [mounted, setMounted] = useState(false);

  // 頂層頁面 (子女資訊 / 班次 / 設定) 不顯示返回鍵; 子頁 (如 /parents/settings/binding) 才顯示
  const topLevelPaths = ['/parents', '/parents/portal', '/parents/trips', '/parents/settings'];
  const isTopLevel = topLevelPaths.includes(pathname);
  const showBackButton = !isTopLevel;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/parentsloginportal');
    }
  }, [user, loading, router]);

  // 角色保護: 只允許 parent 進入
  useEffect(() => {
    if (!loading && user && user.role !== 'parent') {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (!mounted || (loading && !user)) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'parent') {
    return null;
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 z-40 liquid-glass safe-top">
        <div className="flex items-center justify-between h-[61px] px-4">
          <div className="flex items-center gap-2 min-w-0">
            {/* 家長主頁 (/parents/portal) 不顯示返回鍵 ——
                /parentsloginportal 在已登入時會 replace 回 portal, 按了等於原地踏步。
                子頁 (/parents/settings/binding) 才顯示, 導回 /parents/settings。 */}
            {showBackButton && (
              <button
                type="button"
                onClick={() => router.push(getParentPath(pathname))}
                className="p-2 -ml-2 rounded-full active:bg-muted active:scale-95 transition-transform"
                aria-label="返回"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: settings?.primaryColor || '#ec4899' }}
            >
              <Users className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">家長專區</span>
          </div>

          <div className="flex items-center gap-1">
            <NotificationDropdown />
            <button
              onClick={() => {
                logout();
                router.push('/parentsloginportal');
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center active:bg-destructive/10 active:scale-95 transition-transform"
              aria-label="登出"
            >
              <LogOut className="w-5 h-5 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-3 left-0 right-0 z-40 safe-bottom pointer-events-none">
        <div className="mx-auto max-w-[80vw] liquid-glass rounded-2xl shadow-lg p-1.5 pointer-events-auto">
          <div className="flex justify-around">
            <Link
              href="/parents/portal"
              className={cn(
                'flex flex-col items-center gap-1 py-2 px-4 rounded-xl text-xs font-medium transition-colors',
                pathname === '/parents/portal' || pathname === '/parents'
                  ? 'text-pink-500 bg-pink-500/10'
                  : 'text-muted-foreground'
              )}
            >
              <Users className="w-5 h-5" />
              <span>子女資訊</span>
            </Link>
            <Link
              href="/parents/trips"
              className={cn(
                'flex flex-col items-center gap-1 py-2 px-4 rounded-xl text-xs font-medium transition-colors',
                pathname === '/parents/trips'
                  ? 'text-pink-500 bg-pink-500/10'
                  : 'text-muted-foreground'
              )}
            >
              <Bus className="w-5 h-5" />
              <span>班次</span>
            </Link>
            {/* /parents/settings 是家長 portal 自己的設定頁 */}
            <Link
              href="/parents/settings"
              className={cn(
                'flex flex-col items-center gap-1 py-2 px-4 rounded-xl text-xs font-medium transition-colors',
                pathname === '/parents/settings' || pathname.startsWith('/parents/settings')
                  ? 'text-pink-500 bg-pink-500/10'
                  : 'text-muted-foreground'
              )}
            >
              <Settings className="w-5 h-5" />
              <span>設定</span>
            </Link>
          </div>
        </div>
      </nav>
    </div>
  );
}
