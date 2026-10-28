'use client';

/**
 * /system-admin-setting — System Admin Setting (L4 開發者專用 console)
 *
 * 守衛: 只有 system_admin 能進, 其他一律踢回 /settings。
 *
 * 範圍: 只放基礎設施 (敏感資料 + 維運工具), 不放業務 CRUD
 * (學生/家長/校巴日常管理留在 /cbl-admin-setting, 那是 L3 的事)。
 *
 * UI/UX: 與 /cbl-admin-setting 完全一致 — 共用 components/admin/AdminShell.tsx
 * (header / 巢狀 sidebar / dark mode / HK 時間) + OneFleet-style console primitives。
 *
 * 路由:
 *   /system-admin-setting                     → 概覽
 *   /system-admin-setting/connection          → 連線 (Supabase + 環境變數)
 *   /system-admin-setting/integrations        → 整合 (GPS / 推送 / 郵件)
 *   /system-admin-setting/sync                → 同步與快取
 *   /system-admin-setting/accounts            → 帳號 (system_admin 管理)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Database, Satellite, RefreshCw, ShieldAlert,
} from 'lucide-react';
import { AdminShell, type AdminTabItem } from '@/components/admin/AdminShell';
import { useAuth } from '@/lib/hooks';

const TABS: AdminTabItem[] = [
  { id: 'overview',      label: '概覽',       path: '/system-admin-setting',              icon: LayoutDashboard },
  { id: 'connection',    label: '連線',       path: '/system-admin-setting/connection',    icon: Database },
  { id: 'integrations',  label: '整合',       path: '/system-admin-setting/integrations',  icon: Satellite },
  { id: 'sync',          label: '同步與快取', path: '/system-admin-setting/sync',          icon: RefreshCw },
  { id: 'accounts',      label: '帳號',       path: '/system-admin-setting/accounts',      icon: ShieldAlert },
];

export default function SystemAdminSettingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // 守衛: 非 system_admin 踢回 /settings (縱深防禦: /settings 入口按鈕本身也不渲染)
  useEffect(() => {
    if (!loading && user && user.role !== 'system_admin') {
      router.replace('/settings');
    }
  }, [user, loading, router]);

  // 尚未載入 / 權限不符 → 顯示 spinner (不渲染敏感內容)
  if (!user || user.role !== 'system_admin') {
    return (
      <div className="h-[60dvh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AdminShell
      title="System Admin Setting"
      tabs={TABS}
      backHref="/settings"
      backLabel="返回設定"
      footerText="CloudBusLink v1.0.0 · System Admin"
    >
      {children}
    </AdminShell>
  );
}
