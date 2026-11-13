'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserCheck, Settings, ArrowLeft, Siren } from 'lucide-react';
import { useAuth, useNannyTrips, useSettings } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { getParentPath } from '@/lib/navigation';
import { today } from '@/lib/utils';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import IncidentReportModal from './nanny/IncidentReportModal';
import { nannyHomePath, nannyTripsPath, nannySettingsPath, getNannySlug } from '@/lib/nanny-path';
import { ToastProvider } from '@/components/ui/toast';
import RealtimeSync from '@/components/RealtimeSync';

export default function NannyPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const [mounted, setMounted] = useState(false);
  // 異常回報 popup — 放 header, 全 portal 通用
  const [incidentOpen, setIncidentOpen] = useState(false);
  const { trips: headerTrips, nanny: headerNanny } = useNannyTrips(today());

  // 舊版 /nanny* 保留相容: 已登入保姆自動 redirect 去個人化路徑 (如 /wendy/route)
  // 未登入則維持原流程 (去 /nannyloginportal)
  useEffect(() => {
    if (loading || !user || user.role !== 'nanny') return;
    const slug = getNannySlug(user);
    if (!slug) return;
    if (pathname === '/nanny' || pathname === '/nanny/portal') {
      router.replace(nannyHomePath(slug));
    } else if (pathname === '/nanny/trips' || pathname.startsWith('/nanny/trips/')) {
      router.replace(pathname.replace('/nanny/trips', nannyTripsPath(slug)) || nannyTripsPath(slug));
    } else if (pathname === '/nanny/settings' || pathname.startsWith('/nanny/settings/')) {
      router.replace(pathname.replace('/nanny/settings', nannySettingsPath(slug)) || nannySettingsPath(slug));
    }
  }, [user, loading, pathname, router]);

  // 頂層頁面 (我的班次 / 設定) 不顯示返回鍵; 子頁才顯示
  //
  // 注意: /nanny/trips 已從底部 tab 移除 (只保留「我的班次」與「設定」),
  // 但頁面本身仍然保留 (由「我的班次」頁的「查看其他日期」進入),
  // 所以它不再算頂層頁 — 要顯示返回鍵返回 /nanny。
  const topLevelPaths = ['/nanny', '/nanny/portal', '/nanny/settings'];
  const isTopLevel = topLevelPaths.includes(pathname);
  const showBackButton = !isTopLevel;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/nannyloginportal');
    }
  }, [user, loading, router]);

  // 角色保護: 只允許 nanny 進入
  // 排除 /nannyloginportal: 那是未登入保姆的入口頁, 不應被踢走
  useEffect(() => {
    if (!loading && user && user.role !== 'nanny' && !pathname.includes('loginportal')) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (!mounted || (loading && !user)) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'nanny') {
    return null;
  }

  return (
    <ToastProvider>
      <RealtimeSync />
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 z-40 liquid-glass safe-top">
        <div className="flex items-center justify-between h-[61px] px-4">
          <div className="flex items-center gap-2 min-w-0">
            {/* 保姆主頁 (/nanny) 不顯示返回鍵 ——
                /nannyloginportal 在已登入時會 replace 回 portal, 按了等於原地踏步。
                子頁才顯示, 導回 /nanny/settings。 */}
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
              style={{ backgroundColor: settings?.primaryColor || '#10b981' }}
            >
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">保姆專區</span>
          </div>

          <div className="flex items-center gap-1">
            <NotificationDropdown />
            {/* 異常回報 — 只留 title, 放 noti 右邊 */}
            <button
              type="button"
              onClick={() => setIncidentOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-rose-500 text-white text-xs font-bold active:scale-95 transition-transform"
            >
              <Siren className="w-3.5 h-3.5" />
              異常回報
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </main>

      {/* 異常回報置中 popup — header 掣用, 全 portal 通用 */}
      {user && (
        <IncidentReportModal
          open={incidentOpen}
          onClose={() => setIncidentOpen(false)}
          reporterName={user.name}
          reporterPhone={user.phone}
          nannyId={headerNanny?.id ?? ''}
          clientId={user.clientId ?? ''}
          trips={headerTrips}
        />
      )}

      {/* Bottom Tab Bar — 只保留「我的班次」與「設定」 */}
      <nav className="fixed bottom-3 left-0 right-0 z-40 safe-bottom pointer-events-none">
        <div className="mx-auto max-w-[65vw] liquid-glass rounded-2xl shadow-lg p-1.5 pointer-events-auto">
          <div className="grid grid-cols-2 gap-1">
            <Link
              href="/nanny"
              className={cn(
                'relative flex flex-row items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors',
                pathname === '/nanny' || pathname === '/nanny/portal'
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-muted-foreground'
              )}
            >
              <UserCheck className="w-5 h-5" />
              <span>我的班次</span>
            </Link>
            <Link
              href="/nanny/settings"
              className={cn(
                'relative flex flex-row items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors',
                pathname.startsWith('/nanny/settings')
                  ? 'text-emerald-500 bg-emerald-500/10'
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
    </ToastProvider>
  );
}
