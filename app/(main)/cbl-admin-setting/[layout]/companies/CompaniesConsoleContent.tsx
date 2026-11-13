'use client';

/**
 * CompaniesConsoleContent — 機構/公司 (cbl_companies) 管理 console
 *
 * 「機構」= cbl_companies 的一筆 = 公司/營運單位 (選配層)。
 * 與「機構管理」tab (cbl_clients = 學校) 的分工:
 * - 學校 (clientId) = 資料隔離根, 學生/家長/校巴/班次/公告都掛這裡
 * - 機構 (companyId) = 公司層, 僅保姆 / 司機 / 校巴 / 登入帳號可選配 (非必填)
 *
 * 設計沿用 /cbl-admin-setting/[layout]/clients 的 OneFleet 語言:
 *   L1. Header Row (Title + Stat Tiles)
 *   L2. Action Toolbar
 *   L3. Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   L4. Modals
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/companies/ 內使用。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  PowerOff,
  Mail,
  Phone,
  FileSpreadsheet,
  AlertTriangle,
  Users as UsersIcon,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { CopyChip } from '@/components/ui/copy-button';
import { STORAGE } from '@/lib/storage';
import { supabaseCompanies } from '@/lib/supabase-companies';
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
import { ANIMATION_EASE, PAGE_FADE_DURATION } from '../students/design-tokens';
import { CompanyFormModal } from './CompanyFormModal';
import {
  EMPTY_COMPANY_FORM,
  COMPANY_TAB_ACCENT,
  COMPANY_TAB_LABELS,
  companyToFormState,
  type CompanyFormState,
  type CompanyTab,
} from './types';
import type { Company } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20;

const TAB_OPTIONS: FilterTabOption<CompanyTab>[] = [
  { value: 'all', label: '全部', icon: <Building2 width={11} height={11} /> },
  { value: 'active', label: '啟用中', icon: <CheckCircle2 width={11} height={11} /> },
  { value: 'inactive', label: '已停用', icon: <PowerOff width={11} height={11} /> },
];

/* -------------------------------------------------------------------------- */
/*  Date format helper                                                         */
/* -------------------------------------------------------------------------- */

function formatSystemAdminDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 刪除機構                                                */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  companyName,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  companyName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="company-confirm-delete-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: ANIMATION_EASE }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-confirm-delete-title"
            className="relative w-full max-w-[460px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14, ease: ANIMATION_EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 shrink-0 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                <Trash2 width={18} height={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="company-confirm-delete-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  確認刪除機構
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  已綁定的資料不會被刪除, 只會變成「無機構」。
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除機構{' '}
                <span className="font-semibold">{companyName}</span>？
              </p>

              <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5 dark:border-rose-800/60 dark:bg-rose-950/30">
                <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 inline-flex items-center gap-1.5">
                  <AlertTriangle width={11} height={11} />
                  影響範圍
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-rose-700/90 dark:text-rose-300/80 list-disc pl-4">
                  <li>已綁定此機構的保姆、司機、校巴會變成「無機構」</li>
                  <li>已綁定此機構的登入帳號會變成「無機構」（不會被刪除）</li>
                </ul>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                如果只是暫時不用這個機構，建議改用「停用」——資料會完整保留。
              </p>
            </div>

            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-end gap-2 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={onConfirm}
              >
                確認刪除
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main content                                                               */
/* -------------------------------------------------------------------------- */

export interface CompaniesConsoleContentProps {
  companies: Company[];
  /** 各機構底下的登入帳號數 — 給表格「帳號」欄位顯示 */
  userCountByCompany?: Record<string, number>;
}

export function CompaniesConsoleContent({
  companies: initialCompanies,
  userCountByCompany = {},
}: CompaniesConsoleContentProps) {
  const toast = useToast();
  const [tab, setTab] = React.useState<CompanyTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [companies, setCompanies] = React.useState<Company[]>(initialCompanies);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: CompanyFormState;
    editingId: string | undefined;
  }>({ open: false, mode: 'add', initial: EMPTY_COMPANY_FORM, editingId: undefined });
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  /* -------- Sync prop → internal state -------- */
  React.useEffect(() => {
    setCompanies(initialCompanies);
  }, [initialCompanies]);

  /* -------- Load from LocalStorage on mount + listen for refresh -------- */
  React.useEffect(() => {
    const load = () => {
      const list = STORAGE.companies.getAll();
      if (list.length > 0) setCompanies(list);
    };

    load();
    window.addEventListener('cbl-companies-refresh', load);

    // Race condition 防護: sync 可能在本 effect 掛上之前就完成 → 輪詢 fallback
    const startTime = Date.now();
    const poll = window.setInterval(() => {
      load();
      if (STORAGE.isInitialized() || Date.now() - startTime > 5000) {
        window.clearInterval(poll);
      }
    }, 150);

    return () => {
      window.removeEventListener('cbl-companies-refresh', load);
      window.clearInterval(poll);
    };
  }, []);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return companies.filter((c) => {
      if (tab !== 'all' && c.status !== tab) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q)
      );
    });
  }, [companies, tab, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const total = companies.length;
  const activeCount = companies.filter((c) => c.status === 'active').length;
  const inactiveCount = companies.filter((c) => c.status === 'inactive').length;
  const totalAccounts = Object.values(userCountByCompany).reduce((a, b) => a + b, 0);

  /* -------- Pagination -------- */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

  /* -------- Handlers -------- */
  const openAdd = React.useCallback(() => {
    setFormModal({
      open: true,
      mode: 'add',
      initial: EMPTY_COMPANY_FORM,
      editingId: undefined,
    });
  }, []);

  const openEdit = React.useCallback((c: Company) => {
    setFormModal({
      open: true,
      mode: 'edit',
      initial: companyToFormState(c),
      editingId: c.id,
    });
  }, []);

  const handleSave = React.useCallback(
    async (state: CompanyFormState) => {
      setIsSaving(true);
      try {
        const now = new Date().toISOString();

        if (formModal.mode === 'add') {
          const newCompany: Company = {
            id: STORAGE.genId('company'),
            name: state.name,
            email: state.email,
            phone: state.phone,
            address: state.address,
            logo: state.logo || null,
            status: state.status,
            createdAt: now,
            updatedAt: now,
          };

          // 1. 先寫 Supabase
          const addResult = await supabaseCompanies.add(newCompany);
          if (!addResult.success) {
            console.error('[CompaniesConsole] supabaseCompanies.add failed:', addResult.error);
            toast.error(`新增機構失敗：${addResult.error ?? '未知錯誤'}`);
            return;
          }

          // 2. 再寫 LocalStorage (即時顯示)
          STORAGE.companies.add(newCompany);
          setCompanies((prev) => [...prev, newCompany]);

          toast.success(`機構 ${state.name} 新增成功！`);
        } else if (formModal.editingId) {
          const updates = {
            name: state.name,
            email: state.email,
            phone: state.phone,
            address: state.address,
            logo: state.logo || null,
            status: state.status,
            updatedAt: now,
          };

          // 1. 先更新 Supabase
          const updateResult = await supabaseCompanies.update(
            formModal.editingId,
            updates,
          );
          if (!updateResult.success) {
            console.error(
              '[CompaniesConsole] supabaseCompanies.update failed:',
              updateResult.error,
            );
            toast.error(`更新機構失敗：${updateResult.error ?? '未知錯誤'}`);
            return;
          }

          // 2. 再更新 LocalStorage + 內部狀態
          STORAGE.companies.update(formModal.editingId, updates);
          setCompanies((prev) =>
            prev.map((c) =>
              c.id === formModal.editingId ? { ...c, ...updates } : c,
            ),
          );

          toast.success(`機構 ${state.name} 更新成功！`);
        }

        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-companies-refresh'));
      } catch (err) {
        console.error('[CompaniesConsole] handleSave error:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        toast.error(`儲存失敗: ${errMsg}`);
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId, toast],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const removeResult = await supabaseCompanies.remove(deleteTarget.id);
      if (!removeResult.success) {
        console.error(
          '[CompaniesConsole] supabaseCompanies.remove failed:',
          removeResult.error,
        );
        toast.error(`刪除機構失敗：${removeResult.error ?? '未知錯誤'}`);
        return;
      }

      // Supabase 刪成功後才移除 localStorage
      STORAGE.companies.remove(deleteTarget.id);
      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id));

      toast.success(`機構 ${deleteTarget.name} 已刪除`);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-companies-refresh'));
    } catch (err) {
      console.error('[CompaniesConsole] handleDelete error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`刪除失敗: ${errMsg}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, toast]);

  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((c) => ({
      '機構名稱': c.name,
      'Email': c.email,
      '電話': c.phone,
      '地址': c.address,
      '狀態': c.status === 'active' ? '啟用' : '停用',
      '登入帳號數': userCountByCompany[c.id] ?? 0,
      '建立日期': formatSystemAdminDate(c.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 28 },
      { wch: 8 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '機構名單');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `companies-${stamp}.xlsx`);
  }, [filtered, userCountByCompany]);

  /* -------- Render -------- */
  const accent = COMPANY_TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <Building2 width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                所屬機構
              </h1>
              <Pill tone="primary" size="sm">
                <Building2 width={9} height={9} />
                {total} 個
              </Pill>
              {inactiveCount > 0 && (
                <Pill tone="neutral" size="sm">
                  <Dot tone="neutral" />
                  {inactiveCount} 已停用
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理公司 / 營運機構 — 保姆、司機、校巴與登入帳號可選配所屬機構。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
          <StatTile
            label="機構總數"
            value={total}
            hint="全部公司"
            icon={<Building2 width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="啟用中"
            value={activeCount}
            hint="可被選配"
            icon={<CheckCircle2 width={12} height={12} />}
            tone="success"
          />
          <StatTile
            label="登入帳號"
            value={totalAccounts}
            hint="綁定機構的帳號"
            icon={<UsersIcon width={12} height={12} />}
            tone="violet"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="secondary"
          size="sm"
          startIcon={<FileSpreadsheet width={12} height={12} />}
          onClick={handleExportExcel}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? '沒有可匯出的資料' : '匯出為 Excel'}
        >
          匯出 Excel ({filtered.length})
        </Button>

        <div className="ml-auto">
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus width={12} height={12} />}
            onClick={openAdd}
          >
            新增機構
          </Button>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<Building2 width={18} height={18} />}
          title={`${COMPANY_TAB_LABELS[tab]}機構`}
          subtitle={`${filtered.length} 筆 · 公司層 (選配), 與學校 (資料隔離根) 分開管理`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {filtered.length}
            </Pill>
          }
        />

        {/* L3b. Filter Bar */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="companies-tab-pill"
          />

          <div className="relative ml-auto min-w-[220px]">
            <Search
              width={11}
              height={11}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋機構名稱 / Email / 電話…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="清除搜尋"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* L3c. Table scroll region */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {filtered.length === 0 ? (
              <EmptyState
                key={`empty-${tab}-${debouncedSearch}`}
                tab={tab}
                search={debouncedSearch}
              />
            ) : (
              <DataTable
                key={`rows-${tab}`}
                rows={pageItems}
                userCountByCompany={userCountByCompany}
                onEdit={openEdit}
                onDelete={(c) => setDeleteTarget(c)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* L3d. Pagination footer */}
        {filtered.length > 0 && (
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500 gap-3 flex-wrap dark:bg-slate-900/40 dark:border-slate-700/80 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              顯示
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {showingFrom}
              </span>
              -
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {showingTo}
              </span>
              共
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {filtered.length}
              </span>
              筆
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              <Dot tone="primary" />
              第 {safePage} / {pageCount} 頁
            </span>
            {pageCount > 1 && (
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  ‹ 上一頁
                </Button>
                <span className="px-2 text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{safePage}</span>
                  <span className="text-slate-400 dark:text-slate-500"> / {pageCount}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage >= pageCount}
                >
                  下一頁 ›
                </Button>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* L4. Modals */}
      <CompanyFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        companyName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EmptyState                                                                  */
/* -------------------------------------------------------------------------- */

function EmptyState({ tab, search }: { tab: CompanyTab; search: string }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Building2 width={22} height={22} />
      </div>
      <p className="mt-3 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
        {search
          ? '找不到符合的機構'
          : tab === 'active'
          ? '目前沒有啟用中的機構'
          : tab === 'inactive'
          ? '目前沒有已停用的機構'
          : '還沒有任何機構'}
      </p>
      <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
        {search
          ? '嘗試不同的搜尋字串, 或切換分頁。'
          : '點擊右上角的「新增機構」按鈕以建立第一筆資料。'}
      </p>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                   */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  userCountByCompany,
  onEdit,
  onDelete,
}: {
  rows: Company[];
  userCountByCompany: Record<string, number>;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
}) {
  return (
    <table
      className="w-full">
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            機構
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            聯絡資訊
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            地址
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            帳號
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            狀態
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr
            key={c.id}
            className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
          >
            {/* 機構 (icon + name + id) */}
            <td className="px-5 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-md ring-1 ring-inset flex items-center justify-center overflow-hidden',
                    c.status === 'active'
                      ? 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50'
                      : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
                  )}
                >
                  {c.logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.logo}
                      alt=""
                      className="h-5 w-5 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Building2 width={14} height={14} />
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className="text-[12px] font-medium text-slate-900 truncate max-w-[160px] dark:text-slate-100"
                    title={c.name}
                  >
                    {c.name}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500 truncate dark:text-slate-400">
                    {c.id}
                  </p>
                </div>
              </div>
            </td>

            {/* 聯絡資訊 (email + phone) */}
            <td className="px-3 py-2.5">
              <div className="space-y-0.5">
                {c.email ? (
                  <p className="text-[11px] text-slate-600 truncate max-w-[180px] dark:text-slate-300">
                    {c.email}
                  </p>
                ) : null}
                {c.phone ? (
                  <CopyChip
                    value={c.phone}
                    title="複製電話"
                    label="電話"
                    icon={<Phone width={9} height={9} />}
                  />
                ) : null}
                {!c.email && !c.phone && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    未設定
                  </span>
                )}
              </div>
            </td>

            {/* 地址 */}
            <td className="px-3 py-2.5">
              <span className="text-[11px] text-slate-600 truncate block max-w-[180px] dark:text-slate-300">
                {c.address || '—'}
              </span>
            </td>

            {/* 帳號數 */}
            <td className="px-3 py-2.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                <UsersIcon width={9} height={9} />
                {userCountByCompany[c.id] ?? 0}
              </span>
            </td>

            {/* 狀態 */}
            <td className="px-3 py-2.5">
              {c.status === 'active' ? (
                <Pill tone="success" size="sm">
                  <Dot tone="success" />
                  啟用
                </Pill>
              ) : (
                <Pill tone="neutral" size="sm">
                  <Dot tone="neutral" />
                  停用
                </Pill>
              )}
            </td>

            {/* 操作 */}
            <td className="px-5 py-2.5">
              <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                <IconButton onClick={() => onEdit(c)} title="編輯機構">
                  <Pencil width={13} height={13} />
                </IconButton>
                <IconButton
                  onClick={() => onDelete(c)}
                  title="刪除機構"
                  variant="danger"
                >
                  <Trash2 width={13} height={13} />
                </IconButton>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
