'use client';

/**
 * AnnouncementsConsoleContent — OneFleet-style operator console
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §8 Header Row (Title + Stat Tiles)
 *   §9 Action Toolbar
 *   §10 Tab Strip (FilterTabGroup)
 *   §11 Table Card
 *   §12 Per-Row Layout
 *   §13 Empty / Loading / Error States
 *   §14 Modal (Confirm Delete)
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/announcements/ 內使用。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  FileSpreadsheet,
  FolderOpen,
  CheckCircle2,
  Archive,
  Power,
  Bell,
  BellOff,
  Sparkles,
  ArrowRight,
  Calendar,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill, Dot } from '../students/primitives';
import {
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from '../students/primitives';
import { AnnouncementFormModal } from './AnnouncementFormModal';
import {
  EMPTY_ANNOUNCEMENT_FORM,
  type AnnouncementFormState,
  type AnnouncementTab,
} from './types';
import type { Announcement } from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
  ROW_STAGGER_BASE,
  ROW_STAGGER_CAP,
} from '../students/design-tokens';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<AnnouncementTab>[] = [
  {
    value: 'active',
    label: '生效中',
    icon: <CheckCircle2 width={11} height={11} />,
  },
  {
    value: 'inactive',
    label: '已停用',
    icon: <Archive width={11} height={11} />,
  },
  {
    value: 'templates',
    label: '範本',
    icon: <FileSpreadsheet width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  AnnouncementTab,
  {
    header: 'primary' | 'warning' | 'success' | 'danger' | 'violet' | 'warning';
    pill: 'primary' | 'warning' | 'success' | 'danger' | 'violet' | 'warning';
  }
> = {
  active: {
    header: 'success',
    pill: 'success',
  },
  inactive: {
    header: 'warning',
    pill: 'warning',
  },
  templates: {
    header: 'violet',
    pill: 'violet',
  },
};

const PAGE_SIZE = 10;

const TYPE_COLORS: Record<
  Announcement['type'],
  { pill: 'info' | 'warning' | 'danger'; label: string }
> = {
  info: { pill: 'info', label: '資訊' },
  warning: { pill: 'warning', label: '警告' },
  urgent: { pill: 'danger', label: '緊急' },
};

/* -------------------------------------------------------------------------- */
/*  Toggle — iOS-style switch for enabling/disabling announcement              */
/* -------------------------------------------------------------------------- */

function ToggleSwitch({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        checked
          ? 'bg-blue-600 dark:bg-blue-500'
          : 'bg-slate-200 dark:bg-slate-700',
      )}
    >
      <span className="sr-only">{title ?? (checked ? '停用' : '啟用')}</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-out my-[2px]',
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  InlineToggle — toggle column cell                                          */
/* -------------------------------------------------------------------------- */

function InlineToggle({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <ToggleSwitch
        checked={checked}
        onChange={onToggle}
        title={label ?? (checked ? '點擊停用' : '點擊啟用')}
      />
      {checked ? (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
          啟用
        </span>
      ) : (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          停用
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 確認刪除對話框                                         */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  title,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-delete-backdrop"
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
            aria-labelledby="confirm-delete-title"
            className="relative w-full max-w-[420px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
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
                  id="confirm-delete-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  確認刪除公告
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除公告{' '}
                <span className="font-semibold">「{title}」</span>？
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
/*  Main content                                                                */
/* -------------------------------------------------------------------------- */

export interface AnnouncementsConsoleContentProps {
  announcements: Announcement[];
  clientId: string;
  /** Initial loading flag */
  initiallyLoading?: boolean;
}

export function AnnouncementsConsoleContent({
  announcements,
  clientId,
  initiallyLoading = false,
}: AnnouncementsConsoleContentProps) {
  const [tab, setTab] = React.useState<AnnouncementTab>('active');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: AnnouncementFormState;
    editingId: string | undefined;
    sourceTemplateId: string | null;
  }>({
    open: false,
    mode: 'add',
    initial: EMPTY_ANNOUNCEMENT_FORM,
    editingId: undefined,
    sourceTemplateId: null,
  });
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Announcement | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  /* -------- Debounced search -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Simulated initial load -------- */
  React.useEffect(() => {
    if (!initiallyLoading) return;
    setIsLoading(true);
    const id = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [initiallyLoading]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return announcements.filter((a) => {
      if (tab === 'active' && !a.isActive) return false;
      if (tab === 'inactive' && a.isActive) return false;
      if (tab === 'templates' && !a.isTemplate) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.templateName && a.templateName.toLowerCase().includes(q))
      );
    });
  }, [announcements, tab, debouncedSearch]);

  /* -------- Stats -------- */
  const total = announcements.filter((a) => !a.isTemplate).length;
  const activeCount = announcements.filter((a) => a.isActive && !a.isTemplate).length;
  const inactiveCount = announcements.filter((a) => !a.isActive && !a.isTemplate).length;
  const templateCount = announcements.filter((a) => a.isTemplate).length;

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
      initial: { ...EMPTY_ANNOUNCEMENT_FORM },
      editingId: undefined,
      sourceTemplateId: null,
    });
  }, []);

  const openEdit = React.useCallback((a: Announcement) => {
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        title: a.title,
        content: a.content,
        type: a.type,
        displayCount: a.displayCount,
        maxViewsPerUser: a.maxViewsPerUser,
        startDate: a.startDate.split('T')[0],
        endDate: a.endDate.split('T')[0],
        isTemplate: a.isTemplate,
        templateName: a.templateName ?? '',
      },
      editingId: a.id,
      sourceTemplateId: null,
    });
  }, []);

  // 從範本建立新公告
  const openFromTemplate = React.useCallback((a: Announcement) => {
    setFormModal({
      open: true,
      mode: 'add',
      initial: {
        title: a.title,
        content: a.content,
        type: a.type,
        displayCount: a.displayCount,
        maxViewsPerUser: a.maxViewsPerUser,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        isTemplate: false,
        templateName: '',
      },
      editingId: undefined,
      sourceTemplateId: a.id,
    });
  }, []);

  const handleSave = React.useCallback(
    async (state: AnnouncementFormState) => {
      setIsSaving(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const data = {
          title: state.title.trim(),
          content: state.content.trim(),
          type: state.type,
          displayCount: state.displayCount,
          maxViewsPerUser: state.maxViewsPerUser,
          startDate: new Date(state.startDate).toISOString(),
          endDate: new Date(state.endDate).toISOString(),
          isActive: true,
          isTemplate: state.isTemplate,
          templateName: state.isTemplate ? state.templateName.trim() : null,
        };

        if (formModal.mode === 'edit' && formModal.editingId) {
          STORAGE.announcements.update(formModal.editingId, data);
        } else {
          STORAGE.announcements.add({
            id: STORAGE.genId('ann'),
            clientId,
            currentCount: 0,
            ...data,
            createdAt: new Date().toISOString(),
          });
        }
        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId, clientId],
  );

  // Toggle enable/disable announcement
  const handleToggleActive = React.useCallback(
    async (announcement: Announcement) => {
      const { STORAGE } = await import('@/lib/storage');
      STORAGE.announcements.update(announcement.id, {
        isActive: !announcement.isActive,
      });
      window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
    },
    [],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { STORAGE } = await import('@/lib/storage');
      STORAGE.announcements.remove(deleteTarget.id);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
    window.setTimeout(() => setIsRefreshing(false), 400);
  }, []);

  /* -------- Render -------- */

  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <Megaphone width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                公告
              </h1>
              <Pill tone="primary" size="sm">
                <Bell width={9} height={9} />
                {total} 個
              </Pill>
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理機構公告、範本與全站通知設定。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[420px]">
          <StatTile
            label="生效中"
            value={activeCount}
            hint={`${total} 個公告總數`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="success"
          />
          <StatTile
            label="已停用"
            value={inactiveCount}
            hint="可重新啟用"
            icon={<Archive width={12} height={12} />}
            tone="warning"
          />
          <StatTile
            label="範本"
            value={templateCount}
            hint="快速建立公告"
            icon={<FileSpreadsheet width={12} height={12} />}
            tone="violet"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="secondary"
          size="sm"
          startIcon={<RefreshCw width={12} height={12} />}
          onClick={handleRefresh}
          isLoading={isRefreshing}
        >
          重新整理
        </Button>

        <div className="ml-auto">
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus width={12} height={12} />}
            onClick={openAdd}
          >
            新增公告
          </Button>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* SectionHeader */}
        <SectionHeader
          icon={<Megaphone width={18} height={18} />}
          title={
            tab === 'active'
              ? '生效中公告'
              : tab === 'inactive'
              ? '已停用公告'
              : '公告範本'
          }
          subtitle={`${filtered.length} 筆 · ${TAB_OPTIONS.find((o) => o.value === tab)?.label ?? ''}`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {filtered.length}
            </Pill>
          }
        />

        {/* Filter Bar */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="announcements-tab-pill"
          />

          <IconButton
            onClick={handleRefresh}
            title="重新整理列表"
            variant="subtle"
          >
            <RefreshCw
              width={13}
              height={13}
              className={cn(isRefreshing && 'animate-spin text-blue-600')}
            />
          </IconButton>

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
              placeholder="搜尋標題、內容、範本名稱…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="清除搜尋"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Table scroll region */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {isLoading ? (
              <SkeletonRows key="loading" />
            ) : filtered.length === 0 ? (
              <EmptyState key={`empty-${tab}-${debouncedSearch}`} tab={tab} />
            ) : (
              <DataTable
                key={`rows-${tab}`}
                rows={pageItems}
                tab={tab}
                onToggle={handleToggleActive}
                onEdit={openEdit}
                onDelete={(a) => setDeleteTarget(a)}
                onUseTemplate={openFromTemplate}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {!isLoading && filtered.length > 0 && (
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

      {/* Modals */}
      <AnnouncementFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        editingTitle={
          formModal.editingId
            ? announcements.find((a) => a.id === formModal.editingId)?.title
            : undefined
        }
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={deleteTarget?.title ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkeletonRows                                                               */
/* -------------------------------------------------------------------------- */

function SkeletonRows() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse dark:bg-slate-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-48 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
              <div className="h-2.5 w-72 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            <div className="h-5 w-12 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EmptyState                                                                 */
/* -------------------------------------------------------------------------- */

function EmptyState({ tab }: { tab: AnnouncementTab }) {
  return (
    <motion.div
      key={`empty-${tab}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="flex flex-col items-center gap-2 py-12 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <FolderOpen width={20} height={20} />
        </div>
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
          {tab === 'active'
            ? '目前沒有生效中的公告'
            : tab === 'inactive'
            ? '目前沒有已停用的公告'
            : '尚未建立任何公告範本'}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {tab === 'active'
            ? '點擊右上角的「新增公告」按鈕以建立新公告。'
            : tab === 'inactive'
            ? '停用的公告會出現在這裡。'
            : '建立範本可以快速重複使用相同的公告內容。'}
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                  */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  tab,
  onToggle,
  onEdit,
  onDelete,
  onUseTemplate,
}: {
  rows: Announcement[];
  tab: AnnouncementTab;
  onToggle: (a: Announcement) => void;
  onEdit: (a: Announcement) => void;
  onDelete: (a: Announcement) => void;
  onUseTemplate: (a: Announcement) => void;
}) {
  return (
    <motion.table
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            公告
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            類型
          </th>
          {tab !== 'templates' && (
            <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
              狀態
            </th>
          )}
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            {tab === 'templates' ? '建立日期' : '有效期'}
          </th>
          {tab !== 'templates' && (
            <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
              顯示
            </th>
          )}
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a, idx) => {
          const typeColor = TYPE_COLORS[a.type];
          const isTemplateTab = tab === 'templates';

          return (
            <motion.tr
              key={a.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.22,
                ease: ANIMATION_EASE,
                delay: Math.min(idx * ROW_STAGGER_BASE, ROW_STAGGER_CAP),
              }}
            >
              {/* 公告 (title + content preview) */}
              <td className="px-5 py-2.5">
                <div className="min-w-0">
                  {isTemplateTab && a.templateName && (
                    <p className="text-[10px] font-medium text-violet-600 dark:text-violet-400 mb-0.5">
                      {a.templateName}
                    </p>
                  )}
                  <p
                    className="text-[12px] font-medium text-slate-900 truncate max-w-[240px] dark:text-slate-100"
                    title={a.title}
                  >
                    {a.title}
                  </p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 max-w-[280px]">
                    {a.content}
                  </p>
                </div>
              </td>

              {/* 類型 */}
              <td className="px-3 py-2.5">
                <Pill tone={typeColor.pill} size="sm">
                  {typeColor.label}
                </Pill>
              </td>

              {/* 狀態 (非範本 tab) */}
              {tab !== 'templates' && (
                <td className="px-3 py-2.5">
                  <InlineToggle
                    checked={a.isActive}
                    onToggle={() => onToggle(a)}
                  />
                </td>
              )}

              {/* 日期 */}
              <td className="px-3 py-2.5">
                <span className="text-[11.5px] text-slate-600 dark:text-slate-300">
                  {isTemplateTab
                    ? formatDate(a.createdAt)
                    : `${formatDate(a.startDate)} ~ ${formatDate(a.endDate)}`}
                </span>
              </td>

              {/* 顯示次數 (非範本 tab) */}
              {tab !== 'templates' && (
                <td className="px-3 py-2.5">
                  <span className="text-[11.5px] text-slate-600 dark:text-slate-300 tabular-nums">
                    {a.currentCount} / {a.displayCount}
                  </span>
                </td>
              )}

              {/* 操作 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  {isTemplateTab ? (
                    <>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => onUseTemplate(a)}
                        startIcon={<Sparkles width={11} height={11} />}
                        className="text-[11px] h-7 px-2"
                      >
                        使用
                      </Button>
                      <IconButton
                        onClick={() => onEdit(a)}
                        title="編輯範本"
                      >
                        <Pencil width={13} height={13} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton onClick={() => onEdit(a)} title="編輯公告">
                        <Pencil width={13} height={13} />
                      </IconButton>
                      <IconButton
                        onClick={() => onDelete(a)}
                        title="刪除公告"
                        variant="danger"
                      >
                        <Power width={13} height={13} />
                      </IconButton>
                    </>
                  )}
                </div>
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </motion.table>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
