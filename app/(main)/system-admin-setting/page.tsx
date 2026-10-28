'use client';

/**
 * /system-admin-setting — 概覽 (Overview)
 *
 * 設計語言與 /cbl-admin-setting 概覽頁一致:
 *   - 淺色 hero (project token: bg-card / border-border / rounded-2xl / shadow-sm)
 *   - 4 格 QuickStat (StatTile 語言)
 *   - Footer line
 *
 * 內容對應舊 /settings/system 的「Supabase 連線」+「範圍聲明」摘要。
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Sparkles, Activity, Sun, UserCircle2,
  Database, HardDrive, Radio, Users,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks';
import { Card, SectionHeader, StatTile, Pill } from '@/components/admin/console-primitives';
import { readSystemStatus } from './lib/systemStatus';

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5)  return '夜深了';
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

function todayStr(now: Date): string {
  return now.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export default function SystemAdminOverviewPage() {
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);

  // 避免 SSR/CSR hydration mismatch: 只在 client mount 後才 set time
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // localStorage 讀取是同步的, 但 SSR 階段沒有資料 → mount 後再讀一次
  const [status, setStatus] = useState(() => readSystemStatus());
  useEffect(() => {
    setStatus(readSystemStatus());
  }, []);

  // ⚠️ 所有 hook 必須在 early return 之前呼叫 (Rules of Hooks)
  if (!user) return null;

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const totalLocalRecords =
    Object.values(status.counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-6">
      {/* ============================================================
          1. Welcome Hero — 與 /cbl-admin-setting 概覽頁同一語言
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        {/* 淡漸層 */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(135deg, hsl(217 91% 60% / 0.06) 0%, hsl(0 0% 100%) 60%)',
          }}
        />
        {/* 右上角淡淡的裝飾光暈 */}
        <div
          aria-hidden
          className="absolute -top-16 -right-16 -z-10 h-48 w-48 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, hsl(217 91% 60% / 0.18) 0%, transparent 70%)',
          }}
        />

        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
          {/* 頂部 chips row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                系統運作中
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                <Activity className="h-3 w-3" />
                v1.0.0 · Build {process.env.NODE_ENV === 'production' ? 'prod' : 'dev'}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <Sun className="h-3 w-3" />
              System Admin
            </div>
          </div>

          {/* 主體: greeting + role + avatar */}
          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {now ? greeting(now) : '歡迎'}, {user.name}
              </p>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                System Admin 控制台
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground" suppressHydrationWarning>
                {now ? todayStr(now) : '載入中…'} · 平台維運 · 基礎設施與敏感資料維護
              </p>

              {/* 角色 chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Shield className="h-3 w-3" />
                  系統開發者
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  {user.email}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                  DEV ONLY
                </span>
              </div>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary flex items-center justify-center text-2xl sm:text-3xl font-bold text-primary-foreground ring-2 ring-primary/20 ring-offset-2 ring-offset-card">
                {user.photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.photo} alt={user.name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <UserCircle2 className="hidden sm:block h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </motion.section>

      {/* ============================================================
          2. 4 格 Quick Stats
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">平台概覽</h2>
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            {now ? todayStr(now) : ''}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Supabase 連線"
            value={status.env.available ? '可用' : '不可用'}
            hint={status.env.available ? '已載入 env' : '走 localStorage'}
            tone={status.env.available ? 'success' : 'danger'}
            icon={<Database width={12} height={12} />}
          />
          <StatTile
            label="本地快取"
            value={totalLocalRecords}
            hint="所有表筆數合計"
            tone="primary"
            icon={<HardDrive width={12} height={12} />}
          />
          <StatTile
            label="GPS 已配對"
            value={`${status.gps.paired} / ${status.gps.total}`}
            hint="校巴裝置配對"
            tone={status.gps.paired > 0 ? 'success' : 'neutral'}
            icon={<Radio width={12} height={12} />}
          />
          <StatTile
            label="初始化狀態"
            value={status.initialized ? '已同步' : '未同步'}
            hint={status.initialized ? '曾完成同步' : '尚未同步過'}
            tone={status.initialized ? 'success' : 'warning'}
            icon={<Users width={12} height={12} />}
          />
        </div>
      </motion.section>

      {/* ============================================================
          3. 範圍聲明
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <Card>
          <SectionHeader
            icon={<Shield width={18} height={18} />}
            title="範圍聲明"
            subtitle="本 console 的職責邊界"
            accent="warning"
            actions={<Pill tone="warning" size="sm">DEV ONLY</Pill>}
          />
          <div className="px-5 pb-5">
            <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              本頁只做基礎設施 (連線 / Key / 同步 / 快取)。
              學生 / 家長 / 校巴 / 路線等業務 CRUD 請回 CBL Admin — 那是 L3 營運的事,
              L4 不在此重複。
            </p>
          </div>
        </Card>
      </motion.section>

      {/* ============================================================
          4. Footer line
          ============================================================ */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <span>© {new Date().getFullYear()} CloudBusLink · System Admin Console</span>
        <span className="font-mono">/system-admin-setting</span>
      </div>
    </div>
  );
}
