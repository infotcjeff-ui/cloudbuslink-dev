'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserCheck, Settings, ArrowLeft, Siren } from 'lucide-react';
import { useAuth, useNannyTrips, useSettings } from '@/lib/hooks';
import { cn, today } from '@/lib/utils';
import { getPersonalizedNannyParentPath, getNannySlug, nannyHomePath, nannySettingsPath } from '@/lib/nanny-path';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import IncidentReportModal from '@/app/(nanny-portal)/nanny/IncidentReportModal';
import { ToastProvider } from '@/components/ui/toast';
import RealtimeSync from '@/components/RealtimeSync';

export default function PersonalizedNannyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const urlSlug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params?.slug[0] : '';
  const { user, loading } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const [mounted, setMounted] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const { trips: headerTrips, nanny: headerNanny } = useNannyTrips(today());

  const homePath = user ? nannyHomePath(user) : urlSlug ? `/${urlSlug}/route` : '/nanny';
  const settingsPath = user ? nannySettingsPath(user) : urlSlug ? `/${urlSlug}/settings` : '/nanny/settings';

  // 頂層頁 (route / settings) 不顯示返回鍵; 子頁才顯示
  const isTopLevel = pathname === homePath || pathname === settingsPath;
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
  useEffect(() => {
    if (!loading && user && user.role !== 'nanny' && !pathname.includes('loginportal')) {
      router.replace('/login');
    }
  }, [user, loading, router, pathname]);

  // slug 一致性: 登入者只能看自己的 slug, 串錯 slug 自動導回自己的首頁
  // (例如 wendy 登入卻手打 /bob/route → 踢回 /wendy/route, 避免看到別人的路徑)
  useEffect(() => {
    if (loading || !user || user.role !== 'nanny') return;
    if (!urlSlug) return;
    const own = getNannySlug(user);
    if (own && urlSlug.toLowerCase() !== own.toLowerCase()) {
      router.replace(nannyHomePath(user));
    }
  }, [user, loading, urlSlug, router]);

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
            {showBackButton && (
              <button
                type="button"
                onClick={() => router.push(getPersonalizedNannyParentPath(pathname))}
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

      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </main>

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
              href={homePath}
              className={cn(
                'relative flex flex-row items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors',
                pathname === homePath
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-muted-foreground'
              )}
            >
              <UserCheck className="w-5 h-5" />
              <span>我的班次</span>
            </Link>
            <Link
              href={settingsPath}
              className={cn(
                'relative flex flex-row items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors',
                pathname === settingsPath || pathname.startsWith(settingsPath + '/')
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
