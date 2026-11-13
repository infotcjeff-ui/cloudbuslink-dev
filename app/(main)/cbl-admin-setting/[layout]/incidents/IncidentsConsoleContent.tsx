'use client';

/**
 * IncidentsConsoleContent — 保姆異常回報留底 (CBL Admin Setting 用)
 *
 * 資料來源: STORAGE.incidents (localStorage 快取, 雲端 cbl_incident_reports 為準)。
 * 保姆主頁 popup「確定送出」即寫一筆; 此頁可檢視 / 標已讀 / 標解決 / 刪除。
 */

import * as React from 'react';
import {
  Siren,
  Search,
  FolderOpen,
  CheckCircle2,
  Archive,
  Clock,
  Phone,
  MessageCircle,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  Pill,
  Dot,
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from '../students/primitives';
import { ANIMATION_EASE, TAB_FADE_DURATION } from '../students/design-tokens';
import type { IncidentReport, IncidentStatus } from '@/lib/types';
import { INCIDENT_KIND_LABELS } from '@/app/(nanny-portal)/nanny/IncidentReportModal';

type IncidentTab = 'all' | IncidentStatus;
type DateTab = 'today' | 'yesterday' | 'last7' | 'custom';

const TAB_OPTIONS: FilterTabOption<IncidentTab>[] = [
  { value: 'all', label: '全部', icon: <FolderOpen width={11} height={11} /> },
  { value: 'pending', label: '待處理', icon: <Clock width={11} height={11} /> },
  { value: 'acknowledged', label: '已讀', icon: <CheckCircle2 width={11} height={11} /> },
  { value: 'resolved', label: '已解決', icon: <Archive width={11} height={11} /> },
];

const STATUS_META: Record<IncidentStatus, { label: string; tone: 'danger' | 'warning' | 'success' }> = {
  pending: { label: '待處理', tone: 'danger' },
  acknowledged: { label: '已讀', tone: 'warning' },
  resolved: { label: '已解決', tone: 'success' },
};

const DATE_OPTIONS: FilterTabOption<DateTab>[] = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'last7', label: '近 7 天' },
  { value: 'custom', label: '自選' },
];

const PAGE_SIZE = 10;

/** 香港日期 YYYY-MM-DD (en-CA 在 tz 下直接輸出 YYYY-MM-DD) */
function hkDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
}

function shiftHkDate(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return hkDateStr(d);
}

/** 該筆紀錄的歸屬日期 — 班次日期優先, 舊資料冇班次就用建立時間 */
function recordDateOf(r: IncidentReport): string {
  const t = (r.tripDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (!r.createdAt) return '';
  return hkDateStr(new Date(r.createdAt));
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function IncidentsConsoleContent({ incidents: initial }: { incidents: IncidentReport[] }) {
  const toast = useToast();
  const [rows, setRows] = React.useState<IncidentReport[]>(initial);
  const [tab, setTab] = React.useState<IncidentTab>('all');
  const [dateTab, setDateTab] = React.useState<DateTab>('today');
  const [customFrom, setCustomFrom] = React.useState<string>(() => hkDateStr());
  const [customTo, setCustomTo] = React.useState<string>(() => hkDateStr());
  // 自選範圍要按「確定」先生效 — draft (輸入中) vs applied (已確認)
  const [appliedFrom, setAppliedFrom] = React.useState<string>(() => hkDateStr());
  const [appliedTo, setAppliedTo] = React.useState<string>(() => hkDateStr());
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => setRows(initial), [initial]);

  React.useEffect(() => {
    const load = async () => {
      try {
        const { STORAGE } = await import('@/lib/storage');
        setRows([...STORAGE.incidents.getAll()]);
      } catch { /* ignore */ }
    };
    const handler = () => void load();
    window.addEventListener('cbl-incidents-refresh', handler);
    return () => window.removeEventListener('cbl-incidents-refresh', handler);
  }, []);

  React.useEffect(() => {
    const id = window.setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const filtered = React.useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const todayStr = hkDateStr();
    const yesterdayStr = shiftHkDate(todayStr, -1);
    const weekAgoStr = shiftHkDate(todayStr, -6);
    return rows.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      const d = recordDateOf(r);
      if (dateTab === 'today' && d !== todayStr) return false;
      if (dateTab === 'yesterday' && d !== yesterdayStr) return false;
      if (dateTab === 'last7' && (d < weekAgoStr || d > todayStr)) return false;
      if (dateTab === 'custom') {
        const from = appliedFrom <= appliedTo ? appliedFrom : appliedTo;
        const to = appliedFrom <= appliedTo ? appliedTo : appliedFrom;
        if (d < from || d > to) return false;
      }
      if (!q) return true;
      return (
        (r.reporterName || '').toLowerCase().includes(q) ||
        (r.kindLabel || INCIDENT_KIND_LABELS[r.kind] || '').toLowerCase().includes(q) ||
        (r.adminName || '').toLowerCase().includes(q) ||
        (r.tripLabel || '').toLowerCase().includes(q)
      );
    });
  }, [rows, tab, dateTab, appliedFrom, appliedTo, debounced]);

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const ackCount = rows.filter((r) => r.status === 'acknowledged').length;
  const resolvedCount = rows.filter((r) => r.status === 'resolved').length;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const persist = async (id: string, patch: Partial<IncidentReport>, silent?: boolean) => {
    try {
      const { STORAGE } = await import('@/lib/storage');
      STORAGE.incidents.update(id, patch);
      setRows([...STORAGE.incidents.getAll()]);
      window.dispatchEvent(new CustomEvent('cbl-incidents-refresh'));
      const { supabaseIncidents } = await import('@/lib/supabase-incidents');
      const res = await supabaseIncidents.update(id, patch as never);
      if (!res.success && !silent) toast.error(`同步失敗：${res.error ?? '未知錯誤'}`);
      return res.success;
    } catch (e) {
      if (!silent) toast.error(`儲存失敗：${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };

  const handleStatus = async (id: string, status: IncidentStatus) => {
    const ok = await persist(id, { status });
    if (ok) toast.success(status === 'resolved' ? '已標為解決' : '已標為已讀');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此異常回報？')) return;
    try {
      const { STORAGE } = await import('@/lib/storage');
      STORAGE.incidents.remove(id);
      setRows([...STORAGE.incidents.getAll()]);
      window.dispatchEvent(new CustomEvent('cbl-incidents-refresh'));
      const { supabaseIncidents } = await import('@/lib/supabase-incidents');
      await supabaseIncidents.remove(id).catch(() => undefined);
      toast.success('已刪除');
    } catch (e) {
      toast.error(`刪除失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      const { supabaseIncidents } = await import('@/lib/supabase-incidents');
      await supabaseIncidents.syncToStorage().catch(() => undefined);
      const { STORAGE } = await import('@/lib/storage');
      setRows([...STORAGE.incidents.getAll()]);
      toast.success('已更新');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500 text-white shrink-0">
            <Siren width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">異常回報</h1>
              <Pill tone="danger" size="sm">{rows.length} 筆</Pill>
              {pendingCount > 0 && (
                <Pill tone="warning" size="sm">{pendingCount} 待處理</Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">保姆主頁 popup 送出即廣播給全體管理員, 可直撥 / WhatsApp 聯絡回報人</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[420px]">
          <StatTile label="待處理" value={pendingCount} hint="需跟進" icon={<Clock width={12} height={12} />} tone="danger" />
          <StatTile label="已讀" value={ackCount} hint="處理中" icon={<CheckCircle2 width={12} height={12} />} tone="warning" />
          <StatTile label="已解決" value={resolvedCount} hint="完成" icon={<Archive width={12} height={12} />} tone="success" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button variant="ghost" size="sm" startIcon={<RefreshCw width={12} height={12} className={cn(syncing && 'animate-spin')} />} onClick={handleRefresh}>
          重新整理
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <FilterTabGroup value={tab} onChange={(t) => { setTab(t); setPage(1); }} options={TAB_OPTIONS} layoutId="incidents-tab-pill" />
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <FilterTabGroup value={dateTab} onChange={(t) => { setDateTab(t); setPage(1); }} options={DATE_OPTIONS} layoutId="incidents-date-pill" />
        {dateTab === 'custom' && (
          <span className="flex items-center gap-1.5">
            <input
              type="date"
              aria-label="開始日期"
              value={customFrom}
              max={customTo}
              onChange={(e) => { if (e.target.value) setCustomFrom(e.target.value); }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
            <span className="text-[11px] text-slate-400">至</span>
            <input
              type="date"
              aria-label="結束日期"
              value={customTo}
              min={customFrom}
              onChange={(e) => { if (e.target.value) setCustomTo(e.target.value); }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
            <Button
              size="sm"
              onClick={() => { setAppliedFrom(customFrom); setAppliedTo(customTo); setPage(1); }}
              disabled={!customFrom || !customTo}
            >
              確定
            </Button>
          </span>
        )}
        <div className="relative ml-auto min-w-[200px]">
          <Search width={11} height={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋保姆、異常、班次…"
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="清除搜尋" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">×</button>
          )}
        </div>
      </div>

      <Card className="flex flex-col flex-1 min-h-0">
        <SectionHeader icon={<Siren width={18} height={18} />} title="回報紀錄" subtitle={`${filtered.length} 筆 · 最新在前`} accent="danger" actions={<Pill tone="danger" size="sm">{filtered.length}</Pill>} />
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 px-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <FolderOpen width={20} height={20} />
              </div>
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">暫無異常回報</p>
              <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">保姆在主頁按「異常回報 → 確定送出」後會顯示在這裡。</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
                  <th className="px-5 py-2 text-left">時間 / 異常</th>
                  <th className="px-3 py-2 text-left">相關班次</th>
                  <th className="px-3 py-2 text-left">回報人</th>
                  <th className="px-3 py-2 text-left">通知範圍</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                  <th className="px-5 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const st = STATUS_META[r.status] ?? STATUS_META.pending;
                  const kindLabel = r.kindLabel || INCIDENT_KIND_LABELS[r.kind] || r.kind;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 dark:border-slate-700/80 dark:hover:bg-slate-800/50">
                      <td className="px-5 py-2.5">
                        <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">{kindLabel}</p>
                        <p className="text-[10px] text-slate-500 tabular-nums dark:text-slate-400">{fmtTime(r.createdAt)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.tripLabel ? (
                          <>
                            <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200">{r.tripLabel}</p>
                            <p className="text-[10px] text-slate-500 tabular-nums dark:text-slate-400">{(r.tripDate || '').slice(0, 10)}</p>
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">未選擇班次</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200">{r.reporterName || '—'}</p>
                        <p className="text-[10px] text-slate-500 tabular-nums dark:text-slate-400">{r.reporterPhone || ''}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200">{r.adminName || '全體管理員'}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">system admin · super admin</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill tone={st.tone} size="sm"><Dot tone={st.tone} />{st.label}</Pill>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {/^[0-9]{8}$/.test((r.reporterPhone || '').trim()) && (
                            <>
                              <a href={`tel:${(r.reporterPhone || '').trim()}`} title={`致電 ${r.reporterPhone}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400">
                                <Phone width={13} height={13} />
                              </a>
                              <a href={`https://wa.me/852${(r.reporterPhone || '').trim()}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                                <MessageCircle width={13} height={13} />
                              </a>
                            </>
                          )}
                          {r.status === 'pending' && (
                            <Button variant="ghost" size="sm" onClick={() => void handleStatus(r.id, 'acknowledged')}>標已讀</Button>
                          )}
                          {r.status !== 'resolved' && (
                            <Button variant="ghost" size="sm" onClick={() => void handleStatus(r.id, 'resolved')}>解決</Button>
                          )}
                          <IconButton onClick={() => void handleDelete(r.id)} title="刪除">
                            <Trash2 width={13} height={13} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {pageCount > 1 && (
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
            <span>第 {safePage} / {pageCount} 頁 · 共 {filtered.length} 筆</span>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>‹ 上一頁</Button>
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>下一頁 ›</Button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

export default IncidentsConsoleContent;
