'use client';

/**
 * IntegrationsPanel — API 密鑰 (server-only 保密版)
 *
 * 安全邊界:
 *   - GPS 帳號 / 密碼 / API Key 一律只存 server (env 或 data/system-secrets.json),
 *     經由 /api/system-admin/secrets 讀寫。
 *   - GET 只回「有/無 + 遮罩」(accountMasked / hasPassword / hasApiKey), 永不回明文。
 *   - eye icon 按需解密: 按下才 POST { reveal } 取一次明文 (no-store, 只存記憶體
 *     15 秒自動清除, server 寫 access log + 前端寫審計), 離開頁面清除。
 *   - 編輯 modal 的輸入框永遠空白 (空 = 不改), 不做明文預填;
 *     modal 內輸入框自帶 eye (只切換本地輸入可見性, 安全)。
 *   - 舊的本機覆寫若殘留 password / apiKey, 首次載入即遷移到 server 並清除本機機密。
 *   - 非 system_admin 看到拒絕卡, 不發任何密鑰請求 (layout 已擋, 此為縱深防禦)。
 */

import * as React from 'react';
import {
  Pencil, CheckCircle2, Satellite, Database, MapPin, Bell, Mail,
  ShieldCheck, Lock, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Card, SectionHeader, StatTile, Pill, Button } from '@/components/admin/console-primitives';
import { useAuth } from '@/lib/hooks';
import { ConfigEditModal, type ConfigGroup } from '../components/ConfigEditModal';
import {
  resolveSystemConfig, subscribeSystemConfig,
  getOverride, setOverride,
  GPS_PROVIDER_LABELS,
} from '@/lib/system-config';
import { readSystemStatus } from '../lib/systemStatus';
import { logAction } from '@/lib/admin-audit';

type SecretsStatus = {
  hasAccount: boolean;
  accountMasked: string;
  hasPassword: boolean;
  hasApiKey: boolean;
  endpoint: string;
};

type RevealKind = 'account' | 'password' | 'apiKey';

function readSystemStatusSafe() {
  try {
    return readSystemStatus();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  EyeButton — 密鑰行的眼睛開關                                        */
/* ------------------------------------------------------------------ */

function EyeButton({ active, loading, onClick, label }: {
  active: boolean;
  loading: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={loading}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors cursor-pointer',
        'hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        active && 'bg-emerald-50 text-emerald-600 hover:text-emerald-700 dark:bg-emerald-950/40',
        loading && 'opacity-50 cursor-wait',
      )}
    >
      {loading ? (
        <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : active ? (
        <EyeOff width={13} height={13} />
      ) : (
        <Eye width={13} height={13} />
      )}
    </button>
  );
}

export function IntegrationsPanel() {
  const toast = useToast();
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'system_admin';
  const [status, setStatus] = React.useState(() => readSystemStatusSafe());
  const [secrets, setSecrets] = React.useState<SecretsStatus | null>(null);
  const [secretsLoading, setSecretsLoading] = React.useState(true);
  const [secretsDenied, setSecretsDenied] = React.useState(false);
  const [editGroup, setEditGroup] = React.useState<ConfigGroup | null>(null);
  const [secretModalOpen, setSecretModalOpen] = React.useState(false);
  // 按需解密後的明文快取 (只存記憶體, 15 秒自動清除, 不落盤)
  const [revealed, setRevealed] = React.useState<Partial<Record<RevealKind, string>>>({});
  const [revealing, setRevealing] = React.useState<Partial<Record<RevealKind, boolean>>>({});
  const revealTimers = React.useRef<Partial<Record<RevealKind, ReturnType<typeof setTimeout>>>>({});

  const authHeaders = React.useMemo(
    () => ({ 'Content-Type': 'application/json', 'x-cbl-role': user?.role ?? '' }),
    [user?.role],
  );

  const reloadLocal = React.useCallback(() => {
    setStatus(readSystemStatusSafe());
    try {
      resolveSystemConfig();
    } catch { /* noop */ }
  }, []);

  const loadSecrets = React.useCallback(async () => {
    if (!isSystemAdmin) {
      setSecretsLoading(false);
      setSecretsDenied(true);
      setSecrets(null);
      return;
    }
    setSecretsLoading(true);
    setSecretsDenied(false);
    try {
      const res = await fetch('/api/system-admin/secrets', {
        cache: 'no-store',
        headers: { 'x-cbl-role': user?.role ?? '' },
      });
      const j = (await res.json().catch(() => ({}))) as Partial<SecretsStatus> & { ok?: boolean };
      if (res.status === 403 || (j as { error?: string }).error === '僅系統開發者可查看密鑰') {
        setSecretsDenied(true);
        setSecrets(null);
        return;
      }
      if (j && typeof j === 'object') {
        setSecrets({
          hasAccount: !!j.hasAccount,
          accountMasked: typeof j.accountMasked === 'string' ? j.accountMasked : '',
          hasPassword: !!j.hasPassword,
          hasApiKey: !!j.hasApiKey,
          endpoint: typeof j.endpoint === 'string' ? j.endpoint : '',
        });
      }
    } catch {
      /* ignore — 顯示未知狀態 */
    } finally {
      setSecretsLoading(false);
    }
  }, [isSystemAdmin, user?.role]);

  const reload = React.useCallback(() => {
    reloadLocal();
    loadSecrets();
  }, [reloadLocal, loadSecrets]);

  React.useEffect(() => subscribeSystemConfig(reload), [reload]);
  React.useEffect(() => { loadSecrets(); }, [loadSecrets]);

  // 離開頁面清除已解密的明文 (不留記憶體)
  React.useEffect(() => {
    const timers = revealTimers.current;
    return () => {
      Object.values(timers).forEach((t) => { if (t) clearTimeout(t); });
    };
  }, []);

  const scheduleHide = React.useCallback((kind: RevealKind) => {
    const prev = revealTimers.current[kind];
    if (prev) clearTimeout(prev);
    revealTimers.current[kind] = setTimeout(() => {
      setRevealed((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
    }, 15000);
  }, []);

  // eye icon: 按下才向 server 要一次明文 (no-store, 只存記憶體 15 秒, 審計留痕)
  const toggleReveal = React.useCallback(async (kind: RevealKind) => {
    if (!isSystemAdmin) {
      toast.error('僅系統開發者可查看密鑰');
      return;
    }
    // 已顯示 → 隱藏 (立即清除記憶體)
    if (revealed[kind]) {
      const t = revealTimers.current[kind];
      if (t) clearTimeout(t);
      setRevealed((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
      return;
    }
    if (!window.confirm('即將在畫面顯示一次明文 (15 秒後自動隱藏), 並記錄查看審計。繼續?')) return;
    setRevealing((p) => ({ ...p, [kind]: true }));
    try {
      const res = await fetch('/api/system-admin/secrets', {
        method: 'POST',
        cache: 'no-store',
        headers: authHeaders,
        body: JSON.stringify({ reveal: kind }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || '讀取失敗');
      setRevealed((p) => ({ ...p, [kind]: typeof j.value === 'string' ? j.value : '' }));
      scheduleHide(kind);
      try { logAction('secrets-update', `查看密鑰明文 (${kind}, 已審計)`); } catch { /* ignore */ }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '讀取失敗');
    } finally {
      setRevealing((p) => ({ ...p, [kind]: false }));
    }
  }, [authHeaders, isSystemAdmin, revealed, scheduleHide, toast]);

  // 一次性遷移: 舊本機覆寫殘留的 account / password / apiKey / endpoint → 推上 server 後清除本機機密
  // (之前只遷 password/apiKey 漏了 account，會造成「整合頁顯示已設定、但 /api/onefleet 拿不到帳號 400」)
  React.useEffect(() => {
    if (!isSystemAdmin) return;
    (async () => {
      try {
        const ov = getOverride();
        const acc = ov?.gps.account?.trim();
        const pw = ov?.gps.password;
        const ak = ov?.gps.apiKey;
        const ep = ov?.gps.endpoint?.trim();
        if (!acc && !pw && !ak && !ep) return;
        await fetch('/api/system-admin/secrets', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            ...(acc ? { account: acc } : {}),
            ...(pw ? { password: pw } : {}),
            ...(ak ? { apiKey: ak } : {}),
            ...(ep ? { endpoint: ep } : {}),
          }),
        });
        const cur = getOverride();
        if (cur) {
          setOverride({
            ...cur,
            supabase: { ...cur.supabase },
            gps: { ...cur.gps, account: null, password: null, apiKey: null, endpoint: null },
          });
        }
        loadSecrets();
      } catch { /* ignore */ }
    })();
  }, [authHeaders, isSystemAdmin, loadSecrets]);

  const gps = status?.gps;
  const env = status?.env;
  const has808 = !!secrets?.hasAccount || !!gps?.account;
  const displayAccount = secrets?.accountMasked || (gps?.account ? `${gps.account.slice(0, 1)}•••••${gps.account.slice(-1)}` : '');
  const [section, setSection] = React.useState<'gps' | 'supabase' | 'maps' | 'notify'>('gps');

  const sections = [
    { id: 'gps' as const, no: '01', title: '808 GPS 定位', hint: secretsLoading ? '讀取中…' : has808 ? `已設定 · ${displayAccount || '已遮罩'}` : '待設定', icon: <Satellite width={14} height={14} />, dot: has808 ? 'bg-emerald-500' : 'bg-amber-500' },
    { id: 'supabase' as const, no: '02', title: 'Supabase 後端', hint: env?.available ? '已連線' : '未連線', icon: <Database width={14} height={14} />, dot: env?.available ? 'bg-emerald-500' : 'bg-rose-500' },
    { id: 'maps' as const, no: '03', title: '地圖圖資服務', hint: '內建免 Key', icon: <MapPin width={14} height={14} />, dot: 'bg-emerald-500' },
    { id: 'notify' as const, no: '04', title: '推送與郵件', hint: '未接入', icon: <Bell width={14} height={14} />, dot: 'bg-amber-500' },
  ];

  const handleClearSecret = async (kind: 'password' | 'apiKey') => {
    if (!isSystemAdmin) {
      toast.error('僅系統開發者可操作密鑰');
      return;
    }
    if (!window.confirm(kind === 'password' ? '確定清除 808 GPS 密碼 (server 端刪除)?' : '確定清除 API Key (server 端刪除)?')) return;
    try {
      const res = await fetch('/api/system-admin/secrets', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(kind === 'password' ? { clearPassword: true } : { clearApiKey: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || '清除失敗');
      try { logAction('secrets-update', kind === 'password' ? '清除 808 GPS 密碼' : '清除 API Key'); } catch { /* ignore */ }
      toast.success('已清除 (server 端)');
      loadSecrets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '清除失敗');
    }
  };

  // 非 system_admin: 整塊拒絕 (不渲染任何密鑰行, 不發請求)
  if (!isSystemAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <SectionHeader
            icon={<ShieldCheck width={18} height={18} />}
            title="僅系統開發者可查看"
            subtitle="此頁資料為 server-only 密鑰, 你的帳號無權限讀取"
            accent="danger"
          />
          <p className="px-5 py-8 text-center text-[12px] text-slate-500 dark:text-slate-400">
            請使用 system_admin 帳號登入後再進入 /system-admin-setting。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 保密聲明 */}
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-[12px] leading-relaxed text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200">
        <Lock width={14} height={14} className="mt-0.5 shrink-0" />
        <p>
          本頁所有密鑰均為 <strong>Server-Only</strong>: 只存伺服器 (環境變數 / server 檔案)。
          列表預設只顯示「有/無 + 遮罩」; 按眼睛才向 server 即時解密一次 (no-store, 15 秒自動隱藏, 會記審計)。
          F12 → Application / Elements / JS bundle 皆無明文; 編輯框永遠空白 (空 = 不改)。
        </p>
      </div>

      {secretsDenied && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300">
          Server 拒絕了密鑰讀取 (僅系統開發者可查看)。請確認你是以 system_admin 登入。
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="01 · 808 GPS 定位" value={secretsLoading ? '讀取中' : displayAccount || (has808 ? '已設定' : '未設定')} hint={gps ? `${GPS_PROVIDER_LABELS[gps.provider] ?? gps.provider} · ${gps.refreshSeconds}s 更新` : ''} tone={has808 ? 'success' : 'warning'} icon={<Satellite width={12} height={12} />} />
        <StatTile label="02 · 裝置配對" value={gps ? `${gps.paired} / ${gps.total}` : '—'} hint={gps && gps.paired > 0 ? '已有裝置配對' : '尚未配對'} tone={gps && gps.paired > 0 ? 'success' : 'neutral'} icon={<CheckCircle2 width={12} height={12} />} />
        <StatTile label="03 · Supabase 後端" value={env?.available ? '已連線' : '不可用'} hint={env?.url || '未設定端點'} tone={env?.available ? 'success' : 'danger'} icon={<Database width={12} height={12} />} />
        <StatTile label="04 · Push / Email" value="未接入" hint="憑證尚未開放編輯" tone="warning" icon={<Bell width={12} height={12} />} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
        {/* 左側 vertical tab 選單 */}
        <nav className="w-full lg:w-60 shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700 lg:sticky lg:top-4">
          {sections.map((s) => {
            const activeItem = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-pressed={activeItem}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer',
                  activeItem
                    ? 'bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800/60'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                )}
              >
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset shrink-0',
                  activeItem
                    ? 'bg-blue-600 text-white ring-blue-600 dark:bg-blue-500 dark:ring-blue-500'
                    : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
                )}>
                  {s.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                    <span className="font-mono text-[10px] text-slate-400 mr-1">{s.no}</span>{s.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', s.dot)} />
                    <span className="truncate">{s.hint}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* 右側內容面板 — 只顯示當前分類 */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
      {section === 'gps' && (
      <Card>
        <SectionHeader
          icon={<Satellite width={18} height={18} />}
          title="01 · 808 GPS 車輛定位追蹤"
          subtitle="Server-Only 密鑰 — 預設遮罩, 眼睛即時解密 (15 秒自動隱藏)"
          accent="primary"
          actions={
            <div className="flex items-center gap-1.5">
              <Pill tone={has808 ? 'success' : 'warning'} size="sm">{secretsLoading ? '讀取中' : has808 ? `已設定 · ${displayAccount || '已遮罩'}` : '待設定'}</Pill>
              <Button variant="secondary" size="sm" onClick={() => setSecretModalOpen(true)} startIcon={<Pencil width={12} height={12} />}>編輯密鑰</Button>
            </div>
          }
        />
        <div className="border-t border-slate-100 dark:border-slate-700/80">
          <SettingRow label="Provider" hint="車輛定位使用的追蹤服務商">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', has808 ? 'bg-emerald-500' : 'bg-amber-500')} />
                {gps ? (GPS_PROVIDER_LABELS[gps.provider] ?? gps.provider) : '—'}
              </span>
              {gps && <SourcePill source={gps.providerSource} />}
            </span>
          </SettingRow>
          <SettingRow label="服務端點" hint="OneFleet 主機 — server 端設定, 前端只讀">
            <span className="inline-flex items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {secretsLoading ? '讀取中…' : (secrets?.endpoint || gps?.endpoint || '未設定')}
              </code>
              <Pill tone="success" size="sm">Server</Pill>
            </span>
          </SettingRow>
          <SettingRow label="登入帳號 (ac)" hint="Server-Only — 預設遮罩, 按眼睛可即時解密查看 (15 秒自動隱藏)">
            <span className="inline-flex items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {secretsLoading ? '讀取中…' : (revealed.account ?? displayAccount ?? '未設定')}
              </code>
              <Pill tone="success" size="sm">Server</Pill>
              {secrets?.hasAccount && (
                <EyeButton
                  active={!!revealed.account}
                  loading={!!revealing.account}
                  onClick={() => toggleReveal('account')}
                  label={revealed.account ? '隱藏 808 GPS 帳號' : '查看 808 GPS 帳號'}
                />
              )}
            </span>
          </SettingRow>
          <SettingRow label="登入密碼 (pw)" hint="Server-Only — 預設遮罩, 按眼睛可即時解密查看 (15 秒自動隱藏)">
            <span className="inline-flex items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {secretsLoading ? '讀取中…' : (revealed.password ?? (secrets?.hasPassword ? '•••••••• 已設定' : '未設定'))}
              </code>
              <Pill tone="success" size="sm">Server</Pill>
              {secrets?.hasPassword && (
                <EyeButton
                  active={!!revealed.password}
                  loading={!!revealing.password}
                  onClick={() => toggleReveal('password')}
                  label={revealed.password ? '隱藏 808 GPS 密碼' : '查看 808 GPS 密碼'}
                />
              )}
              {secrets?.hasPassword && (
                <button type="button" onClick={() => handleClearSecret('password')} className="text-[11px] text-slate-400 hover:text-rose-600 underline underline-offset-2 cursor-pointer">清除</button>
              )}
            </span>
          </SettingRow>
          <SettingRow label="API Key" hint="Server-Only — 預設遮罩, 按眼睛可即時解密查看 (15 秒自動隱藏)">
            <span className="inline-flex items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {secretsLoading ? '讀取中…' : (revealed.apiKey ?? (secrets?.hasApiKey ? '•••••• 已設定' : '未填 (選填)'))}
              </code>
              <Pill tone="success" size="sm">Server</Pill>
              {secrets?.hasApiKey && (
                <EyeButton
                  active={!!revealed.apiKey}
                  loading={!!revealing.apiKey}
                  onClick={() => toggleReveal('apiKey')}
                  label={revealed.apiKey ? '隱藏 API Key' : '查看 API Key'}
                />
              )}
              {secrets?.hasApiKey && (
                <button type="button" onClick={() => handleClearSecret('apiKey')} className="text-[11px] text-slate-400 hover:text-rose-600 underline underline-offset-2 cursor-pointer">清除</button>
              )}
            </span>
          </SettingRow>
          <SettingRow label="更新頻率" hint="位置更新的間隔秒數 (非機密, 可本機覆寫)">
            <span className="font-mono text-[12px] tabular-nums">{gps ? `${gps.refreshSeconds} 秒` : '—'}</span>
          </SettingRow>
          <SettingRow label="裝置配對" hint="已綁定 gpsDeviceId 的校巴 (校巴管理內填寫裝置 ID)">
            <span className="font-mono text-[11px]">{gps ? `${gps.paired} / ${gps.total} 已配對` : '—'}</span>
          </SettingRow>
        </div>
        <div className="px-5 pb-5">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            登入接口由 <span className="font-mono text-slate-600 dark:text-slate-300">/api/onefleet</span> 在 server 端用密鑰代登入並簽發 jsession —
            帳密永不經前端轉發。解密查看會記審計 (概覽 → 各用戶動作)。文件見
            <span className="font-mono text-slate-600 dark:text-slate-300"> 808 GPS / Web Interface Documentation.html</span>。
          </p>
        </div>
      </Card>
      )}

      {section === 'supabase' && (
      <Card>
        <SectionHeader
          icon={<Database width={18} height={18} />}
          title="02 · Supabase 資料庫與後端"
          subtitle="專案連線資訊與即時狀態 — Anon Key 為 client-safe, 僅顯示有/無"
          accent="violet"
          actions={
            <div className="flex items-center gap-1.5">
              <Pill tone={env?.available ? 'success' : 'danger'} size="sm">{env?.available ? '可用' : '不可用'}</Pill>
              <Button variant="secondary" size="sm" onClick={() => setEditGroup('supabase')} startIcon={<Pencil width={12} height={12} />}>編輯</Button>
            </div>
          }
        />
        <div className="border-t border-slate-100 dark:border-slate-700/80">
          <SettingRow label="Project URL" hint="Supabase 專案端點">
            <span className="inline-flex items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{env?.url || '未設定'}</code>
              {env && <SourcePill source={env.urlSource} />}
            </span>
          </SettingRow>
          <SettingRow label="Anon Key" hint="前端安全金鑰 (client-safe, 公開可用) — 僅顯示有/無">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', env?.anonLoaded ? 'bg-emerald-500' : 'bg-rose-500')} />
                {env?.anonLoaded ? '已載入 (不顯示明文)' : '缺失'}
              </span>
              {env && <SourcePill source={env.keySource} />}
            </span>
          </SettingRow>
        </div>
      </Card>
      )}

      {section === 'maps' && (
      <Card>
        <SectionHeader
          icon={<MapPin width={18} height={18} />}
          title="03 · 地圖圖資服務"
          subtitle="前台地圖底圖與路線渲染 — 目前內建免 Key 方案"
          accent="success"
        />
        <div className="border-t border-slate-100 dark:border-slate-700/80">
          <SettingRow label="底圖" hint="MapLibre GL — 免 Key 內建">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              內建 MapLibre
            </span>
          </SettingRow>
          <SettingRow label="路徑規劃" hint="路線頁的路徑預覽">
            <span className="text-[12px] text-slate-600 dark:text-slate-300">跟隨 808 GPS 回傳座標繪製, 無需額外 Key</span>
          </SettingRow>
        </div>
      </Card>
      )}

      {section === 'notify' && (
      <Card>
        <SectionHeader
          icon={<Bell width={18} height={18} />}
          title="04 · 推送通知與郵件"
          subtitle="對外通知渠道 — Push / Email / SMS"
          accent="warning"
        />
        <div className="border-t border-slate-100 dark:border-slate-700/80">
          <SettingRow label="Push 推播" hint="家長 / 保姆端推播">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              未接入 — 憑證尚未開放編輯
            </span>
          </SettingRow>
          <SettingRow label="Email 郵件" hint="帳單、收據與系統通知">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              <Mail width={11} height={11} /> 未接入 — 憑證尚未開放編輯
            </span>
          </SettingRow>
        </div>
        <div className="px-5 pb-5">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            機密一律走 server-only (本頁模式); 非機密 (Provider / 端點 / 更新頻率) 才允許本機覆寫或平台同步。
          </p>
        </div>
      </Card>
      )}
        </div>
      </div>

      {/* Supabase (非機密) 沿用舊 modal */}
      {editGroup && (
        <ConfigEditModal
          open={!!editGroup}
          group={editGroup}
          onClose={() => setEditGroup(null)}
          onSaved={reload}
        />
      )}

      {/* GPS 密鑰專用 modal — server-only, 永不預填明文 */}
      <SecretEditModal
        open={secretModalOpen}
        initialEndpoint={secrets?.endpoint || ''}
        authHeaders={authHeaders}
        onClose={() => setSecretModalOpen(false)}
        onSaved={() => { setSecretModalOpen(false); loadSecrets(); reloadLocal(); }}
      />
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5 leading-tight dark:text-slate-400">{hint}</p>}
      </div>
      <div className="text-right text-[12px] font-medium text-slate-800 dark:text-slate-100 shrink-0">{children}</div>
    </div>
  );
}

function SourcePill({ source }: { source: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    override: { label: '本機覆寫', cls: 'bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50' },
    cloud: { label: '平台設定', cls: 'bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50' },
    env: { label: '環境變數', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50' },
    default: { label: '預設值', cls: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
    none: { label: '未設定', cls: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50' },
  };
  const m = meta[source] ?? meta.none;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md ring-1 ring-inset font-medium tracking-wide uppercase px-1.5 py-0.5 text-[10px]', m.cls)}>
      {m.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  SecretEditModal — 只寫 server, 永不讀明文 (輸入框自帶 eye, 只切換本地可見性) */
/* ------------------------------------------------------------------ */

function SecretEditModal({ open, initialEndpoint, authHeaders, onClose, onSaved }: {
  open: boolean;
  initialEndpoint: string;
  authHeaders: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [account, setAccount] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAccount('');
      setPassword('');
      setApiKey('');
      setEndpoint(initialEndpoint || '');
      setShowPassword(false);
      setShowApiKey(false);
    }
  }, [open, initialEndpoint]);

  if (!open) return null;

  const handleSave = async () => {
    if (!account.trim() && !password && !apiKey && !endpoint.trim()) {
      toast.error('沒有任何變更 — 空欄位代表不改');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/system-admin/secrets', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ...(account.trim() ? { account: account.trim() } : {}),
          ...(password ? { password } : {}),
          ...(apiKey ? { apiKey } : {}),
          ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || '儲存失敗');
      try { logAction('secrets-update', '更新 808 GPS / API 密鑰 (server-only)'); } catch { /* ignore */ }
      toast.success('密鑰已寫入伺服器 (前端永不顯示明文)');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const passwordInputCls = 'w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 pr-9 text-[13px] text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700';

  return (
    <div role="presentation" onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="編輯 API 密鑰" className="relative w-full max-w-[480px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
            <ShieldCheck width={18} height={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">編輯 API 密鑰 (Server-Only)</h2>
            <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">空白 = 不改該欄 · 送出後前端只顯示遮罩</p>
          </div>
          <button type="button" aria-label="關閉" onClick={onClose} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer dark:hover:bg-slate-800">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          <div>
            <label htmlFor="sec-account" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1">808 GPS 帳號 (ac)</label>
            <input id="sec-account" type="text" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="留空 = 不改" autoComplete="off" spellCheck={false} className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700" />
          </div>
          <div>
            <label htmlFor="sec-password" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1">808 GPS 密碼 (pw) <span className="text-emerald-600">(機密 · 只存 server)</span></label>
            <div className="relative">
              <input id="sec-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="留空 = 不改 (眼睛只切換本次輸入可見性)" autoComplete="new-password" className={passwordInputCls} />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? '隱藏密碼輸入' : '顯示密碼輸入'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer dark:hover:bg-slate-800"
              >
                {showPassword ? <EyeOff width={13} height={13} /> : <Eye width={13} height={13} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="sec-apikey" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1">API Key (選填) <span className="text-emerald-600">(機密 · 只存 server)</span></label>
            <div className="relative">
              <input id="sec-apikey" type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="留空 = 不改 (眼睛只切換本次輸入可見性)" autoComplete="new-password" className={passwordInputCls} />
              <button
                type="button"
                onClick={() => setShowApiKey((s) => !s)}
                aria-label={showApiKey ? '隱藏 API Key 輸入' : '顯示 API Key 輸入'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer dark:hover:bg-slate-800"
              >
                {showApiKey ? <EyeOff width={13} height={13} /> : <Eye width={13} height={13} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="sec-endpoint" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1">服務端點</label>
            <input id="sec-endpoint" type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://console.onefleet.hk (留空 = 不改)" autoComplete="off" spellCheck={false} className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700" />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">寫入後僅存伺服器, 回傳只有「有/無 + 遮罩」。Network 回應與 localStorage 皆無明文。</p>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2 dark:border-slate-700/80">
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>寫入伺服器</Button>
        </div>
      </div>
    </div>
  );
}
