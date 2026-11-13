'use client';

/**
 * 學年管理 (Academic Year Management) + 學年轉換精靈 (Rollover Wizard)
 *
 * 這是 M4 的主要 UI。放在 /cbl-admin-setting/academic-years。
 *
 * 兩大功能:
 *   1. 學年登錄管理 — 建立/啟用/封存/刪除學年 (寫入 cbl_academic_years)
 *   2. 學年轉換精靈 — 把某學年的在學學生複製到下一個學年
 *
 * ⚠️ 權限:
 *   - 超管 (super_admin / system_admin) 沒有自己的 clientId →
 *     要先選一間學校才能管理它的學年。
 *   - 一般 client 管理員只能管理自己學校的學年。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, Plus, Check, Trash2, Pencil,
  ArrowRight, Wand2, AlertTriangle, RefreshCw, Loader2,
  Users, Info, ChevronLeft, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import {
  getAcademicYearLabel,
  DEFAULT_ACADEMIC_YEAR,
  isValidAcademicYear,
  nextAcademicYear,
  buildAcademicYearId,
  getAcademicYearRange,
  type AcademicYear,
  type AcademicYearStatus,
} from '@/lib/academic-year';
import { previewRollover, executeRollover, type RolloverResult } from '@/lib/rollover-run';
import type { RolloverPlan } from '@/lib/rollover';
import { useAcademicYear } from '../AcademicYearProvider';

export const dynamic = 'force-dynamic';

/* -------------------------------------------------------------------------- */
/*  小元件                                                                    */
/* -------------------------------------------------------------------------- */

const STATUS_META: Record<
  AcademicYearStatus,
  { label: string; className: string; dot: string }
> = {
  active: {
    label: '進行中',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  upcoming: {
    label: '即將開始',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  archived: {
    label: '已封存 · 唯讀',
    className:
      'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
    dot: 'bg-slate-400',
  },
};

function StatusBadge({ status }: { status: AcademicYearStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        m.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

function Panel({
  title,
  description,
  icon,
  children,
  actions,
  accent = 'primary',
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  accent?: 'primary' | 'violet' | 'warning';
}) {
  const accentCls =
    accent === 'violet'
      ? 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50'
      : accent === 'warning'
      ? 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50'
      : 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50';
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden dark:bg-slate-900 dark:border-slate-700">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${accentCls}`}>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900 leading-tight dark:text-slate-100">{title}</h3>
            {description && (
              <p className="text-[11px] text-slate-500 mt-0.5 leading-tight dark:text-slate-400">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
      <div className="border-t border-slate-100 dark:border-slate-700/80 px-5 py-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  主頁面                                                                    */
/* -------------------------------------------------------------------------- */

export default function AcademicYearsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh: refreshContext, setSelectedYear } = useAcademicYear();

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'system_admin';

  /** 目標 client id — 超管要自己選學校 */
  const [targetClientId, setTargetClientId] = useState<string>('');
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);

  /** 學年清單 */
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(false);

  /** 訊息 */
  const [message, setMessage] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  /** 新增學年表單 (popup) */
  const [createOpen, setCreateOpen] = useState(false);
  const [newYearCode, setNewYearCode] = useState('');
  const [newYearLabel, setNewYearLabel] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  /** 編輯學年 (popup) — 整列操作收斂為單一 Edit 按鈕 */
  const [editTarget, setEditTarget] = useState<AcademicYear | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editStatus, setEditStatus] = useState<AcademicYearStatus>('upcoming');
  const [editIsCurrent, setEditIsCurrent] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editConfirmDelete, setEditConfirmDelete] = useState(false);

  /** 轉換精靈 */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [plan, setPlan] = useState<RolloverPlan | null>(null);
  const [result, setResult] = useState<RolloverResult | null>(null);
  const [running, setRunning] = useState(false);

  // ---- 解析目標 client ----
  useEffect(() => {
    if (!user) return;
    if (user.clientId) {
      setTargetClientId(user.clientId);
      return;
    }
    // 超管: 讀全部機構
    const opts = STORAGE.clients.getAll().map((c) => ({ id: c.id, name: c.name }));
    setClientOptions(opts);
    if (opts.length > 0) setTargetClientId(opts[0].id);
  }, [user]);

  // ---- 載入學年清單 ----
  const loadYears = useCallback(async () => {
    if (!targetClientId) {
      setYears([]);
      return;
    }
    setLoading(true);
    try {
      const { supabaseAcademicYears } = await import('@/lib/supabase-academic-years');
      const res = await supabaseAcademicYears.getByClient(targetClientId);
      if (res.data && res.data.length > 0) {
        STORAGE.academicYears.mergeAll(res.data);
        setYears(STORAGE.academicYears.getByClient(targetClientId));
      } else {
        setYears(STORAGE.academicYears.getByClient(targetClientId));
      }
    } catch (e) {
      console.warn('[AcademicYears] load failed:', e);
      setYears(STORAGE.academicYears.getByClient(targetClientId));
    } finally {
      setLoading(false);
    }
  }, [targetClientId]);

  useEffect(() => {
    loadYears();
  }, [loadYears]);

  /** 切換 client 後刷新整個 context */
  const reloadAll = useCallback(async () => {
    await loadYears();
    await refreshContext();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbl-academic-years-refresh'));
    }
  }, [loadYears, refreshContext]);

  /* ------------------------------------------------------------------ */
  /*  建立學年                                                            */
  /* ------------------------------------------------------------------ */

  const openCreateModal = useCallback(() => {
    // 預設帶下一個學年 (例: 已有 2627 → 建議 2728), 期間自動按香港學制推算
    const codes = years.map((y) => y.academicYear).filter(isValidAcademicYear).sort();
    const last = codes.length > 0 ? codes[codes.length - 1] : null;
    const suggest = last ? nextAcademicYear(last) : nextAcademicYear(DEFAULT_ACADEMIC_YEAR);
    const range = getAcademicYearRange(suggest);
    setNewYearCode(suggest);
    setNewYearLabel('');
    setNewStartDate(range.startDate);
    setNewEndDate(range.endDate);
    setCreateOpen(true);
  }, [years]);

  const handleCreateYear = useCallback(async () => {
    const code = newYearCode.trim();
    if (!isValidAcademicYear(code)) {
      setMessage({ kind: 'error', text: '學年代碼格式不正確 — 必須是 4 位數字 (例: 2728)。' });
      return;
    }
    if (!targetClientId) {
      setMessage({ kind: 'error', text: '請先選擇學校。' });
      return;
    }
    if (years.some((y) => y.academicYear === code)) {
      setMessage({ kind: 'error', text: `學年 ${code} 已經存在。` });
      return;
    }

    setCreating(true);
    try {
      const { supabaseAcademicYears } = await import('@/lib/supabase-academic-years');
      const range = getAcademicYearRange(code);
      const now = new Date().toISOString();
      const record: AcademicYear = {
        id: buildAcademicYearId(code, targetClientId),
        clientId: targetClientId,
        academicYear: code,
        label: newYearLabel.trim() || getAcademicYearLabel({ academicYear: code } as AcademicYear),
        // 新學年預設為 'upcoming' (還沒開始)
        status: 'upcoming',
        isCurrent: false,
        startDate: newStartDate.trim() || range.startDate,
        endDate: newEndDate.trim() || range.endDate,
        createdAt: now,
        updatedAt: now,
      };

      const res = await supabaseAcademicYears.add(record);
      if (!res.success) {
        setMessage({ kind: 'error', text: `建立學年失敗: ${res.error}` });
        return;
      }

      // 寫入本機快取
      STORAGE.academicYears.mergeAll([record]);
      setNewYearCode('');
      setNewYearLabel('');
      setNewStartDate('');
      setNewEndDate('');
      setCreateOpen(false);
      await reloadAll();
      setMessage({ kind: 'success', text: `已建立學年 ${code}。` });
    } catch (e) {
      setMessage({
        kind: 'error',
        text: `建立學年時發生例外: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setCreating(false);
    }
  }, [newYearCode, newYearLabel, newStartDate, newEndDate, targetClientId, years, reloadAll]);

  /* ------------------------------------------------------------------ */
  /*  編輯學年 (popup 儲存)                                               */
  /* ------------------------------------------------------------------ */

  const openEditYear = useCallback((year: AcademicYear) => {
    const range = getAcademicYearRange(year.academicYear);
    setEditTarget(year);
    setEditLabel(year.label ?? '');
    setEditStart(year.startDate || range.startDate);
    setEditEnd(year.endDate || range.endDate);
    setEditStatus(year.status);
    setEditIsCurrent(year.isCurrent);
    setEditConfirmDelete(false);
    setMessage(null);
  }, []);

  const closeEditYear = useCallback(() => {
    if (editSaving) return;
    setEditTarget(null);
    setEditConfirmDelete(false);
  }, [editSaving]);

  const handleSaveEdit = useCallback(async () => {
    if (!editTarget) return;
    if (editStatus === 'archived' && editIsCurrent) {
      setMessage({ kind: 'error', text: '不能把現行學年設為已封存 — 請先取消「設為現行」。' });
      return;
    }
    setEditSaving(true);
    try {
      const { supabaseAcademicYears } = await import('@/lib/supabase-academic-years');

      // 若勾選「設為現行」且原本不是現行 → 先把舊現行降級為 archived
      if (editIsCurrent && !editTarget.isCurrent) {
        const current = years.find((y) => y.isCurrent);
        if (current && current.id !== editTarget.id) {
          const res = await supabaseAcademicYears.update(current.id, {
            isCurrent: false,
            status: 'archived',
          });
          if (!res.success) {
            setMessage({ kind: 'error', text: `封存舊學年失敗: ${res.error}` });
            return;
          }
        }
      }

      const patch = {
        label: editLabel.trim() || null,
        startDate: editStart.trim() || null,
        endDate: editEnd.trim() || null,
        status: editIsCurrent ? ('active' as AcademicYearStatus) : editStatus,
        isCurrent: editIsCurrent,
      };
      const res = await supabaseAcademicYears.update(editTarget.id, patch);
      if (!res.success) {
        setMessage({ kind: 'error', text: `更新學年失敗: ${res.error}` });
        return;
      }

      await reloadAll();
      if (editIsCurrent) setSelectedYear(editTarget.academicYear);
      setMessage({ kind: 'success', text: `已更新 ${getAcademicYearLabel({ ...editTarget, label: patch.label } as AcademicYear)}。` });
      setEditTarget(null);
      setEditConfirmDelete(false);
    } catch (e) {
      setMessage({
        kind: 'error',
        text: `更新學年時發生例外: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editLabel, editStart, editEnd, editStatus, editIsCurrent, years, reloadAll, setSelectedYear]);

  const handleDeleteFromEdit = useCallback(async () => {
    if (!editTarget) return;
    if (editTarget.isCurrent || editIsCurrent) {
      setMessage({ kind: 'error', text: '不能刪除現行學年。' });
      return;
    }
    setEditSaving(true);
    try {
      const { supabaseAcademicYears } = await import('@/lib/supabase-academic-years');
      const res = await supabaseAcademicYears.remove(editTarget.id);
      if (!res.success) {
        setMessage({ kind: 'error', text: `刪除學年失敗: ${res.error}` });
        return;
      }
      STORAGE.academicYears.setAll(
        STORAGE.academicYears.getAll().filter((y) => y.id !== editTarget.id),
      );
      await reloadAll();
      setMessage({ kind: 'success', text: `已刪除學年 ${getAcademicYearLabel(editTarget)}。` });
      setEditTarget(null);
      setEditConfirmDelete(false);
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editIsCurrent, reloadAll]);

  /* ------------------------------------------------------------------ */
  /*  轉換精靈                                                            */
  /* ------------------------------------------------------------------ */

  const handlePreview = useCallback(() => {
    if (!targetClientId || !fromYear || !toYear) {
      setMessage({ kind: 'error', text: '請選擇來源學年與目標學年。' });
      return;
    }
    if (fromYear === toYear) {
      setMessage({ kind: 'error', text: '來源學年與目標學年相同。' });
      return;
    }
    const p = previewRollover(targetClientId, fromYear, toYear);
    setPlan(p);
    setResult(null);
  }, [targetClientId, fromYear, toYear]);

  const handleRunRollover = useCallback(async () => {
    if (!targetClientId || !fromYear || !toYear) return;
    if (
      !confirm(
        `確定要進行學年轉換嗎?\n\n` +
          `• 來源學年: ${fromYear}\n` +
          `• 目標學年: ${toYear}\n` +
          `• 會把 ${plan?.students.length ?? 0} 位在學學生複製到目標學年\n` +
          `• 來源學年的 ${plan?.students.length ?? 0} 位學生會標記為「已畢業」\n\n` +
          `此操作會新增資料 (原始資料不會被刪除), 但請確認無誤後再繼續。`,
      )
    ) {
      return;
    }

    setRunning(true);
    try {
      const res = await executeRollover({
        clientId: targetClientId,
        fromYear,
        toYear,
        targetYearExists: years.some((y) => y.academicYear === toYear),
      });
      setResult(res);
      setPlan(null);
      await reloadAll();
    } catch (e) {
      setResult({
        success: false,
        cloned: 0,
        graduated: 0,
        cloudFailed: [],
        errors: [e instanceof Error ? e.message : String(e)],
        warnings: [],
        skipped: [],
      });
    } finally {
      setRunning(false);
    }
  }, [targetClientId, fromYear, toYear, plan, years, reloadAll]);

  /* ------------------------------------------------------------------ */

  if (!user) return null;

  const currentYear = years.find((y) => y.isCurrent);

  return (
    <div className="space-y-4">
      {/* 標題 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">學年管理</h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            管理各學年的資料範圍 — 每學年各自一份學生、路線、班次與公告資料, 隨時可切換檢視歷史學年。
          </p>
        </div>
        <button
          type="button"
          onClick={reloadAll}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          重新載入
        </button>
      </div>

      {/* 超管: 選擇學校 */}
      {isSuperAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
          <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block dark:text-slate-400">
            選擇要管理的學校
          </label>
          <select
            value={targetClientId}
            onChange={(e) => {
              setTargetClientId(e.target.value);
              setPlan(null);
              setResult(null);
            }}
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40 sm:max-w-md dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            {clientOptions.length === 0 && <option value="">（沒有可選的學校）</option>}
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 訊息 */}
      {message && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-xl border px-4 py-3 text-xs',
            message.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : message.kind === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
              : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
          role="status"
        >
          {message.kind === 'error' ? (
            <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <Info className="mt-px h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 學年清單 */}
      <Panel
        title="學年登錄"
        description={`共 ${years.length} 個學年${currentYear ? ` · 現行學年為 ${getAcademicYearLabel(currentYear)}` : ' · 尚未設定現行學年'}`}
        icon={<CalendarDays className="h-3.5 w-3.5" />}
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            新增學年
          </button>
        }
      >
        {years.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">尚未建立任何學年</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              請在下方建立第一個學年 (通常是 26-27 或當前學年), 才能開始使用學年隔離。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 font-semibold">學年</th>
                  <th className="px-3 py-2 font-semibold">期間</th>
                  <th className="px-3 py-2 font-semibold">狀態</th>
                  <th className="px-3 py-2 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => {
                  const range = getAcademicYearRange(y.academicYear);
                  return (
                    <tr
                      key={y.id}
                      className="border-b border-slate-200/60 dark:border-slate-700/60 last:border-b-0"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {getAcademicYearLabel(y)}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {y.academicYear}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {y.startDate || range.startDate} ~ {y.endDate || range.endDate}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={y.status} />
                          {y.isCurrent && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                              <Check className="h-2.5 w-2.5" />
                              現行
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditYear(y)}
                            title="編輯學年"
                            className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </Panel>

      {/* 新增學年 Popup — z-[70] 高於 AdminShell header (z-30) 與 ConfigEditModal (z-80 內層另行處理);
          在 site-tool 內嵌使用時也不會被 tab / header 蓋住 */}
      {createOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          role="presentation"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <div
            className="relative w-full max-w-[440px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-year-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                <CalendarDays className="h-[18px] w-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="create-year-title" className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                  新增學年
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  建立後預設為「即將開始」, 可隨時設為現行
                </p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={() => !creating && setCreateOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X width={14} height={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3.5">
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div>
                  <label htmlFor="new-year-code" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    學年代碼<span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <input
                    id="new-year-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={newYearCode}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      setNewYearCode(v);
                      if (isValidAcademicYear(v)) {
                        const r = getAcademicYearRange(v);
                        setNewStartDate(r.startDate);
                        setNewEndDate(r.endDate);
                      }
                    }}
                    placeholder="2728"
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 font-mono text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="new-year-label" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    顯示名稱 (選填)
                  </label>
                  <input
                    id="new-year-label"
                    type="text"
                    value={newYearLabel}
                    onChange={(e) => setNewYearLabel(e.target.value)}
                    placeholder="2027/28 學年"
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-year-start" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    開始日期
                  </label>
                  <input
                    id="new-year-start"
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="new-year-end" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    結束日期
                  </label>
                  <input
                    id="new-year-end"
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                提示: 26-27 → 2728, 27-28 → 2829。修改代碼會自動按香港學制 (9/1 ~ 8/31) 推算期間, 也可手動改日期。
              </p>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => !creating && setCreateOpen(false)}
                disabled={creating}
                className="h-9 px-3.5 text-[13px] inline-flex items-center justify-center gap-1.5 rounded-md border font-medium cursor-pointer transition-colors bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateYear}
                disabled={creating || !newYearCode.trim()}
                className="h-9 px-3.5 text-[13px] inline-flex items-center justify-center gap-1.5 rounded-md border font-medium cursor-pointer transition-colors bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                建立學年
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯學年 Popup — 單一 Edit 入口, 顯示名稱 / 期間 / 狀態 / 現行 / 刪除一次改完 */}
      {editTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          role="presentation"
          onClick={closeEditYear}
        >
          <div
            className="relative w-full max-w-[440px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-year-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                <Pencil className="h-[16px] w-[16px]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="edit-year-title" className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                  編輯學年 · {editTarget.academicYear}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {getAcademicYearLabel(editTarget)}
                </p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={closeEditYear}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X width={14} height={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3.5">
              <div>
                <label htmlFor="edit-year-label" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                  顯示名稱
                </label>
                <input
                  id="edit-year-label"
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder={getAcademicYearLabel({ academicYear: editTarget.academicYear } as AcademicYear)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-year-start" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    開始日期
                  </label>
                  <input
                    id="edit-year-start"
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="edit-year-end" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    結束日期
                  </label>
                  <input
                    id="edit-year-end"
                    type="date"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* 狀態選擇 — 取代原本三顆分散按鈕 */}
              <div>
                <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                  狀態
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'active', label: '進行中', hint: '可讀寫' },
                    { value: 'upcoming', label: '即將開始', hint: '唯讀' },
                    { value: 'archived', label: '已封存', hint: '唯讀' },
                  ] as { value: AcademicYearStatus; label: string; hint: string }[]).map((o) => {
                    const selected = !editIsCurrent && editStatus === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={editIsCurrent}
                        onClick={() => setEditStatus(o.value)}
                        aria-pressed={selected}
                        className={selected
                          ? 'rounded-lg border border-blue-500 bg-blue-50 px-2 py-2 text-center transition-colors dark:bg-blue-950/40 dark:border-blue-500'
                          : 'rounded-lg border border-slate-200 bg-white px-2 py-2 text-center transition-colors hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-50'}
                      >
                        <span className={selected ? 'block text-[12px] font-semibold text-blue-700 dark:text-blue-300' : 'block text-[12px] font-semibold text-slate-700 dark:text-slate-200'}>{o.label}</span>
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400">{o.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 設為現行 */}
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 cursor-pointer dark:bg-slate-800/40 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={editIsCurrent}
                  onChange={(e) => setEditIsCurrent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-slate-800 dark:text-slate-100">設為現行學年</span>
                  <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    勾選後儲存會自動把舊現行學年封存, 此學年變為進行中。現行學年不可刪除 / 封存。
                  </span>
                </span>
              </label>

              {/* 刪除區 — 收進 popup 二次確認, 取代原生 confirm */}
              {!editTarget.isCurrent && !editIsCurrent ? (
                <div className="rounded-lg border border-rose-200/70 bg-rose-50/50 px-3 py-2.5 dark:bg-rose-950/20 dark:border-rose-800/50">
                  {!editConfirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setEditConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      刪除此學年登錄…
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[12px] leading-snug text-rose-700 dark:text-rose-300">
                        確定刪除 {getAcademicYearLabel(editTarget)}? 只會刪除學年登錄, 不會刪除學生 / 班次 / 路線資料, 但切換器將無法再選到此學年。
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDeleteFromEdit}
                          disabled={editSaving}
                          className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          確認刪除
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditConfirmDelete(false)}
                          disabled={editSaving}
                          className="text-[12px] text-slate-500 hover:text-slate-700 dark:text-slate-400"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">現行學年不可刪除 — 請先把另一個學年設為現行。</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 dark:border-slate-700/80">
              <button
                type="button"
                onClick={closeEditYear}
                disabled={editSaving}
                className="h-9 px-3.5 text-[13px] inline-flex items-center justify-center gap-1.5 rounded-md border font-medium cursor-pointer transition-colors bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="h-9 px-3.5 text-[13px] inline-flex items-center justify-center gap-1.5 rounded-md border font-medium cursor-pointer transition-colors bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 學年轉換精靈 */}
      <Panel
        title="學年轉換"
        description="把某學年的在學學生複製到下一個學年 — 每學年各自一份資料, 歷史學年依然完整保留"
        icon={<Wand2 className="h-3.5 w-3.5" />}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400">來源學年</label>
            <select
              value={fromYear}
              onChange={(e) => {
                setFromYear(e.target.value);
                setPlan(null);
                // 目標預設帶下一個學年
                if (e.target.value) {
                  const n = nextAcademicYear(e.target.value);
                  setToYear(n);
                }
              }}
              className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
            >
              <option value="">請選擇</option>
              {years.map((y) => (
                <option key={y.id} value={y.academicYear}>
                  {getAcademicYearLabel(y)}
                </option>
              ))}
            </select>
          </div>

          <ArrowRight className="mb-2 h-4 w-4 text-slate-500 dark:text-slate-400" />

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400">目標學年</label>
            <select
              value={toYear}
              onChange={(e) => {
                setToYear(e.target.value);
                setPlan(null);
              }}
              className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
            >
              <option value="">請選擇</option>
              {years.map((y) => (
                <option key={y.id} value={y.academicYear}>
                  {getAcademicYearLabel(y)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handlePreview}
            disabled={!fromYear || !toYear || fromYear === toYear}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <Users className="h-3.5 w-3.5" />
            預覽轉換
          </button>

          {plan && (
            <button
              type="button"
              onClick={handleRunRollover}
              disabled={running || plan.students.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              執行轉換 ({plan.students.length} 人)
            </button>
          )}
        </div>

        {/* 預覽結果 */}
        {plan && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">轉換預覽</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>
                  • 將複製 <span className="font-semibold text-slate-900 dark:text-slate-100">{plan.students.length}</span> 位在學學生到 {getAcademicYearLabel({ academicYear: plan.toYear } as AcademicYear)}
                </li>
                <li>• 每位學生會產生新的學生編號 (stu-{plan.toYear}xxx), 但沿用同一個 person_key 以串連跨學年資料</li>
                <li>• 來源學年的學生會標記為「已畢業」(資料保留, 只是不再算在學)</li>
                <li>• 校巴 / 司機 / 保姆 / 家長是跨學年共用主檔, 不會複製</li>
                {plan.skipped.length > 0 && (
                  <li>• 會跳過 {plan.skipped.length} 位學生 (非在學或已轉換過)</li>
                )}
              </ul>
            </div>

            {plan.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                <span>{w}</span>
              </div>
            ))}

            {plan.skipped.length > 0 && (
              <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 px-4 py-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-900 dark:text-slate-100">
                  跳過的學生 ({plan.skipped.length})
                </summary>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {plan.skipped.map((s, i) => (
                    <li key={i}>
                      • {s.student.name} ({s.student.studentId}) — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* 執行結果 */}
        {result && (
          <div
            className={cn(
              'mt-4 rounded-xl border px-4 py-3',
              result.success
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40',
            )}
          >
            <p
              className={cn(
                'text-xs font-semibold',
                result.success
                  ? 'text-emerald-800 dark:text-emerald-200'
                  : 'text-rose-800 dark:text-rose-200',
              )}
            >
              {result.success ? '學年轉換完成' : '學年轉換部分失敗'}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <li>• 複製學生: {result.cloned} 位</li>
              <li>• 標記畢業: {result.graduated} 位</li>
              {result.errors.map((e, i) => (
                <li key={i} className="text-rose-700 dark:text-rose-300">
                  • {e}
                </li>
              ))}
              {result.warnings.map((w, i) => (
                <li key={i} className="text-amber-700 dark:text-amber-300">
                  • {w}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
            >
              <ChevronLeft className="h-3 w-3" />
              關閉
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}
