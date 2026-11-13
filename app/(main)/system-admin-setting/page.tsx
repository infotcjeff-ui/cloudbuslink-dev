'use client';

/**
 * /system-admin-setting — 概覽 (維運審計視角)
 *
 * 資料來源: lib/admin-audit.ts (本機 localStorage):
 *   1. 網站 error (window.onerror / unhandledrejection 自動收集)
 *   2. 各 user 做了什麼動作 (login / logout / secrets-update / user CRUD / gps-view / page-view)
 *   3. 登入時長 (login → logout sessions, 未登出即時計算)
 *   4. 校巴 GPS 查看情況 (誰、何時、看了哪台車) + 裝置配對總覽
 *
 * 注意: 這是 L4 維運視角, 不上雲 — 不需要跨裝置一致, 也不為審計另開 RLS 表。
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Activity, Clock3, Satellite, Shield, UserCircle2, Sun,
  Trash2, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks';
import { Card, SectionHeader, StatTile, Pill, Button } from '@/components/admin/console-primitives';
import { readSystemStatus } from './lib/systemStatus';
import {
  getActions, getErrors, getSessions, getGpsViews,
  clearActions, clearErrors, clearSessions, clearGpsViews,
  hookWindowErrors,
  type AuditAction, type AuditError, type AuditSession, type GpsView,
} from '@/lib/admin-audit';

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return '夜深了';
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

function todayStr(now: Date): string {
  return now.toLocaleDateString('zh-HK', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

function timeStr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-HK', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分${sec % 60 > 0 ? ` ${sec % 60} 秒` : ''}`;
  const h = Math.floor(m / 60);
  return `${h} 時 ${m % 60} 分`;
}

const KIND_LABEL: Record<string, string> = {
  login: '登入', logout: '登出', 'gps-view': '查看 GPS',
  'user-create': '新增帳號', 'user-update': '編輯帳號',
  'user-delete': '刪除帳號 (入垃圾桶)', 'user-restore': '還原帳號',
  'user-perm-delete': '永久刪除帳號', sync: '同步',
  'secrets-update': '更新密鑰', 'page-view': '瀏覽頁面',
};

export default function SystemAdminOverviewPage() {
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);
  const [status, setStatus] = useState(() => {
    try { return readSystemStatus(); } catch { return null; }
  });
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [errors, setErrors] = useState<AuditError[]>([]);
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [gpsViews, setGpsViews] = useState<GpsView[]>([]);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    hookWindowErrors();
    try { setStatus(readSystemStatus()); } catch { /* ignore */ }
    setActions(getActions());
    setErrors(getErrors());
    setSessions(getSessions());
    setGpsViews(getGpsViews());
    const t = setInterval(() => {
      setSessions(getSessions());
      setActions(getActions());
      setGpsViews(getGpsViews());
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const initial = ((user?.name || user?.email) || '?').trim().charAt(0).toUpperCase();

  const err24h = useMemo(() => {
    const cut = Date.now() - 24 * 3600 * 1000;
    return errors.filter((e) => new Date(e.at).getTime() >= cut).length;
  }, [errors]);

  const filteredActions = useMemo(() => {
    const q = actionFilter.trim().toLowerCase();
    if (!q) return actions.slice(0, 50);
    return actions.filter((a) =>
      (a.userName || '').toLowerCase().includes(q) ||
      (a.detail || '').toLowerCase().includes(q) ||
      (KIND_LABEL[a.kind] || a.kind).toLowerCase().includes(q),
    ).slice(0, 50);
  }, [actions, actionFilter]);

  const totalOnlineSec = useMemo(
    () => sessions.reduce((s, x) => s + (x.seconds || 0), 0),
    [sessions],
  );

  // 所有 hooks 行完先 early return, 否則違反 rules-of-hooks (build 會 fail)
  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* 1. Welcome Hero */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(135deg, hsl(217 91% 60% / 0.06) 0%, hsl(0 0% 100%) 60%)' }} />
        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
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
              <Sun className="h-3 w-3" /> System Admin
            </div>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{now ? greeting(now) : '歡迎'}, {user.name}</p>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">System Admin 控制台</h1>
              <p className="mt-1.5 text-sm text-muted-foreground" suppressHydrationWarning>
                {now ? todayStr(now) : '載入中…'} · 維運審計 · 錯誤 / 行為 / 時長 / GPS
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Shield className="h-3 w-3" /> 系統開發者
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{user.email}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">DEV ONLY</span>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary flex items-center justify-center text-2xl sm:text-3xl font-bold text-primary-foreground ring-2 ring-primary/20 ring-offset-2 ring-offset-card">
                {user.photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.photo} alt={user.name} className="h-full w-full rounded-full object-cover" />
                ) : initial}
              </div>
              <UserCircle2 className="hidden sm:block h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. 4 格維運統計 */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">維運概覽</h2>
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>{now ? todayStr(now) : ''}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="網站錯誤 (24h)" value={err24h} hint={`${errors.length} 筆累積`} tone={err24h > 0 ? 'danger' : 'success'} icon={<AlertTriangle width={12} height={12} />} />
          <StatTile label="用戶動作" value={actions.length} hint="login / CRUD / 密鑰…" tone="primary" icon={<Activity width={12} height={12} />} />
          <StatTile label="累積登入時長" value={fmtDuration(totalOnlineSec)} hint={`${sessions.length} 個 sessions`} tone="neutral" icon={<Clock3 width={12} height={12} />} />
          <StatTile label="GPS 已配對" value={status ? `${status.gps.paired} / ${status.gps.total}` : '—'} hint={`${gpsViews.length} 次查看記錄`} tone={status && status.gps.paired > 0 ? 'success' : 'warning'} icon={<Satellite width={12} height={12} />} />
        </div>
      </motion.section>

      {/* 3. 網站錯誤 */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }}>
        <Card>
          <SectionHeader
            icon={<AlertTriangle width={18} height={18} />} title="網站錯誤" subtitle={`最近 ${errors.length} 筆 · window.onerror / unhandledrejection 自動收集`}
            accent="danger"
            actions={
              <div className="flex items-center gap-1.5">
                <Pill tone="danger" size="sm">{errors.length}</Pill>
                <Button variant="ghost" size="sm" startIcon={<Trash2 width={12} height={12} />} onClick={() => { clearErrors(); setErrors([]); }}>清空</Button>
              </div>
            }
          />
          {errors.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-slate-500">目前沒有錯誤記錄 — 系統乾淨。</p>
          ) : (
            <div className="border-t border-slate-100 dark:border-slate-700/80 max-h-[300px] overflow-auto">
              {errors.slice(0, 30).map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 px-5 py-2.5 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100 break-words">{e.message}</p>
                    <p className="text-[11px] text-slate-500 truncate">{e.path}{e.source ? ` · ${e.source}` : ''}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{timeStr(e.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.section>

      {/* 4. 用戶動作 + 登入時長 */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeader
            icon={<Activity width={18} height={18} />} title="各用戶動作" subtitle="誰在何時做了什麼"
            accent="primary"
            actions={
              <div className="flex items-center gap-1.5">
                <Pill tone="primary" size="sm">{actions.length}</Pill>
                <Button variant="ghost" size="sm" startIcon={<Trash2 width={12} height={12} />} onClick={() => { clearActions(); setActions([]); }}>清空</Button>
              </div>
            }
          />
          <div className="px-5 pt-3">
            <input
              value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="搜尋用戶 / 動作…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12px] focus:border-blue-400 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
          </div>
          {filteredActions.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-slate-500">尚無動作記錄。</p>
          ) : (
            <div className="mt-2 border-t border-slate-100 dark:border-slate-700/80 max-h-[320px] overflow-auto">
              {filteredActions.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
                  <div className="min-w-0 flex items-center gap-2">
                    <Pill tone="neutral" size="sm">{KIND_LABEL[a.kind] || a.kind}</Pill>
                    <p className="text-[12px] text-slate-700 truncate dark:text-slate-200"><strong>{a.userName}</strong> <span className="text-slate-400">({a.role || '—'})</span> · {a.detail}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{timeStr(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader
            icon={<Clock3 width={18} height={18} />} title="登入時長" subtitle="login → logout sessions"
            accent="neutral"
            actions={
              <div className="flex items-center gap-1.5">
                <Pill tone="neutral" size="sm">{sessions.length}</Pill>
                <Button variant="ghost" size="sm" startIcon={<RefreshCw width={12} height={12} />} onClick={() => setSessions(getSessions())}>重讀</Button>
                <Button variant="ghost" size="sm" startIcon={<Trash2 width={12} height={12} />} onClick={() => { clearSessions(); setSessions([]); }}>清空</Button>
              </div>
            }
          />
          {sessions.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-slate-500">尚無登入記錄。</p>
          ) : (
            <div className="border-t border-slate-100 dark:border-slate-700/80 max-h-[364px] overflow-auto">
              {sessions.slice(0, 30).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100">{s.userName} <span className="text-slate-400 font-normal">({s.role || '—'})</span></p>
                    <p className="font-mono text-[10.5px] text-slate-500">{timeStr(s.loginAt)} → {s.logoutAt ? timeStr(s.logoutAt) : '線上中'}</p>
                  </div>
                  <Pill tone={s.logoutAt ? 'neutral' : 'success'} size="sm">{fmtDuration(s.seconds)}{s.logoutAt ? '' : ' · 線上'}</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.section>

      {/* 5. GPS 查看情況 */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.12 }}>
        <Card>
          <SectionHeader
            icon={<Satellite width={18} height={18} />} title="校巴 GPS 查看情況" subtitle={`配對 ${status?.gps.paired ?? '—'} / ${status?.gps.total ?? '—'} · 誰在何時看了哪台車`}
            accent="success"
            actions={
              <div className="flex items-center gap-1.5">
                <Pill tone="success" size="sm">{gpsViews.length} 次查看</Pill>
                <Button variant="ghost" size="sm" startIcon={<Trash2 width={12} height={12} />} onClick={() => { clearGpsViews(); setGpsViews([]); }}>清空</Button>
              </div>
            }
          />
          {gpsViews.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-slate-500">尚無 GPS 查看記錄 — 前台打開校巴定位頁即會記錄。</p>
          ) : (
            <div className="border-t border-slate-100 dark:border-slate-700/80 max-h-[300px] overflow-auto">
              {gpsViews.slice(0, 50).map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 px-5 py-2 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
                  <p className="text-[12px] text-slate-700 truncate dark:text-slate-200"><strong>{g.userName}</strong> 查看 <span className="font-mono">{g.plate || '—'}</span> <span className="text-slate-400 font-mono text-[11px]">{g.deviceId}</span></p>
                  <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{timeStr(g.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <span>© {new Date().getFullYear()} CloudBusLink · System Admin Console</span>
        <span className="font-mono">/system-admin-setting</span>
      </div>
    </div>
  );
}
