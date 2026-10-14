'use client';

/**
 * StudentsConsoleContent — OneFleet-style operator console
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §2 Page Anatomy (5-layer vertical stack)
 *   §8 Header Row (Title + Stat Tiles)
 *   §9 Action Toolbar
 *   §10 Tab Strip (FilterTabGroup with sliding pill)
 *   §11 Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   §12 Per-Row Layout
 *   §13 Empty / Loading / Error States
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/students/ 內使用。
 *
 * 重用上方 primitives.tsx (Pill / Button / IconButton / Card / SectionHeader /
 * StatTile / FilterTabGroup) 與 StudentFormModal, 不動全域任何檔案。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  GraduationCap,
  UserPlus,
  Pencil,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  Users as UsersAllIcon,
  AlertCircle,
  FolderOpen,
  CheckCircle2,
  Archive,
  PowerOff,
  Phone,
  Copy,
  Hash,
  Bus as BusIcon,
  Calendar,
  FileSpreadsheet,
  Star,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Pill, Dot } from './primitives';
import {
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from './primitives';
import { StudentFormModal } from './StudentFormModal';
import {
  EMPTY_STUDENT_FORM,
  type StudentFormState,
  type StudentTab,
} from './types';
import type { Student, Parent, Bus, ParentRelationship } from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
  ROW_STAGGER_BASE,
  ROW_STAGGER_CAP,
} from './design-tokens';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<StudentTab>[] = [
  {
    value: 'active',
    label: '在學',
    icon: <CheckCircle2 width={11} height={11} />,
  },
  {
    value: 'unassigned',
    label: '未綁定校巴',
    icon: <AlertCircle width={11} height={11} />,
  },
  {
    value: 'graduated',
    label: '非在學',
    icon: <Archive width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  StudentTab,
  { header: 'primary' | 'warning' | 'danger'; pill: 'primary' | 'warning' | 'danger'; iconColor: string }
> = {
  active: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  unassigned: {
    header: 'warning',
    pill: 'warning',
    iconColor: 'text-amber-600 dark:text-amber-300',
  },
  graduated: {
    header: 'danger',
    pill: 'danger',
    iconColor: 'text-rose-600 dark:text-rose-300',
  },
};

const PAGE_SIZE = 10;

/* -------------------------------------------------------------------------- */
/*  Status / class helpers                                                     */
/* -------------------------------------------------------------------------- */

function statusBadge(status: Student['status']) {
  if (status === 'active') {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        在學
      </Pill>
    );
  }
  if (status === 'suspended') {
    return (
      <Pill tone="warning" size="sm">
        <Dot tone="warning" />
        停學
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" size="sm">
      <Dot tone="neutral" />
      畢業
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/*  InlineActions — 確認刪除對話框 (規範 §14 modal, 自刻)                       */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  studentName,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  studentName: string;
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
                  確認刪除學生
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷, 將一併移除綁定關係。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除 <span className="font-semibold">{studentName}</span>？
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

export interface StudentsConsoleContentProps {
  students: Student[];
  parents: Parent[];
  buses: Bus[];
  /** Initial loading flag — true if we haven't loaded yet on mount. */
  initiallyLoading?: boolean;
}

export function StudentsConsoleContent({
  students,
  parents,
  buses,
  initiallyLoading = false,
}: StudentsConsoleContentProps) {
  const [tab, setTab] = React.useState<StudentTab>('active');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: StudentFormState;
    editingId: string | undefined;
    editingStudentId: string | undefined;
  }>({ open: false, mode: 'add', initial: EMPTY_STUDENT_FORM, editingId: undefined, editingStudentId: undefined });
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Edit / view stub (placeholder for full detail page; row uses generic delete + form for now)
  const [, setViewing] = React.useState<Student | null>(null);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Simulated initial load (one-shot, only first mount) -------- */
  React.useEffect(() => {
    if (!initiallyLoading) return;
    setIsLoading(true);
    const id = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [initiallyLoading]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return students.filter((s) => {
      if (tab === 'active' && s.status !== 'active') return false;
      if (tab === 'graduated' && s.status === 'active') return false;
      if (tab === 'unassigned' && s.busId) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.classNumber.toLowerCase().includes(q)
      );
    });
  }, [students, tab, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const total = students.length;
  const activeCount = students.filter((s) => s.status === 'active').length;
  const unassignedCount = students.filter((s) => !s.busId && s.status === 'active').length;
  const graduatedCount = students.filter((s) => s.status !== 'active').length;

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
  // 取得當前登入者的 clientId (供 form 內即時新增家長 + preview studentId 使用)
  const authClientId = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem('cbl_auth');
      if (!raw) return '';
      const u = JSON.parse(raw);
      return u?.clientId || '';
    } catch {
      return '';
    }
  }, []);

  // 取得學年字串 (供 studentId preview)
  const academicYear = React.useMemo(() => {
    if (typeof window === 'undefined') return '2627';
    try {
      const raw = localStorage.getItem('cbl_settings');
      if (!raw) return '2627';
      const all = JSON.parse(raw) as Record<string, { academicYear?: string }>;
      // 取第一筆的學年 (或預設)
      const first = Object.values(all)[0];
      return first?.academicYear || '2627';
    } catch {
      return '2627';
    }
  }, []);

  // 計算「add mode 預覽的 studentId」 (與 storage 同步, 不會衝突)
  // 動態 import 因為這在 SSR 環境不能同步 require。
  const [previewStudentId, setPreviewStudentId] = React.useState<string>(
    `stu-${academicYear}001`,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const { STORAGE } = await import('@/lib/storage');
        const next = STORAGE.students.generateStudentId(authClientId, academicYear);
        if (!cancelled) setPreviewStudentId(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authClientId, academicYear]);

  const openAdd = React.useCallback(() => {
    setFormModal({
      open: true,
      mode: 'add',
      initial: EMPTY_STUDENT_FORM,
      editingId: undefined,
      editingStudentId: undefined,
    });
  }, []);

  const openEdit = React.useCallback((s: Student) => {
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        name: s.name,
        classNumber: s.classNumber,
        phone: s.phone ?? '',
        gender: s.gender ?? 'male',
        dateOfBirth: s.dateOfBirth ?? '',
        emergencyContactName: s.emergencyContactName ?? '',
        emergencyContactPhone: s.emergencyContactPhone ?? '',
        emergencyContactRelationship: s.emergencyContactRelationship ?? '',
        busId: s.busId ?? '',
        parentIds: [...s.parentIds],
        primaryParentId: s.primaryParentId ?? '',
      },
      editingId: s.id,
      editingStudentId: s.studentId,
    });
  }, []);

  const handleSave = React.useCallback(
    async (state: StudentFormState) => {
      setIsSaving(true);
      try {
        if (formModal.mode === 'add') {
          const { STORAGE } = await import('@/lib/storage');
          const settings = STORAGE.settings.getByClient('');
          const ay = settings.academicYear || academicYear;
          const studentId = STORAGE.students.generateStudentId(authClientId, ay);
          STORAGE.students.add({
            id: STORAGE.genId('student'),
            clientId: authClientId,
            studentId,
            name: state.name.trim(),
            classNumber: state.classNumber.trim(),
            phone: state.phone.trim() || null,
            photo: null,
            gender: state.gender,
            dateOfBirth: state.dateOfBirth || null,
            emergencyContactName: state.emergencyContactName.trim() || null,
            emergencyContactPhone: state.emergencyContactPhone.trim() || null,
            emergencyContactRelationship:
              (state.emergencyContactRelationship as ParentRelationship | '') || null,
            status: 'active',
            parentIds: state.parentIds,
            primaryParentId: state.primaryParentId || null,
            busId: state.busId || null,
            pickupLocation: null,
            dropoffLocation: null,
            createdAt: new Date().toISOString(),
          });
        } else if (formModal.editingId) {
          const { STORAGE } = await import('@/lib/storage');
          STORAGE.students.update(formModal.editingId, {
            name: state.name.trim(),
            classNumber: state.classNumber.trim(),
            phone: state.phone.trim() || null,
            gender: state.gender,
            dateOfBirth: state.dateOfBirth || null,
            emergencyContactName: state.emergencyContactName.trim() || null,
            emergencyContactPhone: state.emergencyContactPhone.trim() || null,
            emergencyContactRelationship:
              (state.emergencyContactRelationship as ParentRelationship | '') || null,
            busId: state.busId || null,
            parentIds: state.parentIds,
            primaryParentId: state.primaryParentId || null,
          });
        }
        setFormModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId, authClientId, academicYear],
  );

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { STORAGE } = await import('@/lib/storage');
      STORAGE.students.remove(deleteTarget.id);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  const handleRefresh = React.useCallback(() => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
    window.setTimeout(() => setIsRefreshing(false), 400);
  }, []);

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((s) => {
      const bus = s.busId ? buses.find((b) => b.id === s.busId) : null;
      const ps = s.parentIds
        .map((id) => parents.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join('、');
      return {
        '學號': s.studentId,
        '姓名': s.name,
        '班別': s.classNumber,
        '電話': s.phone ?? '',
        '狀態': s.status === 'active' ? '在學' : s.status === 'suspended' ? '停學' : '畢業',
        '家長': ps,
        '綁定校巴': bus?.plateNumber ?? '未指派',
        '建立日期': formatSystemAdminDate(s.createdAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    // 設定欄寬
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
      { wch: 18 }, { wch: 14 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '學生名單');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `students-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, parents, buses, tab]);

  /* -------- Render -------- */

  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row — 規範 §8 */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <GraduationCap width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                學生
              </h1>
              <Pill tone="primary" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 個
              </Pill>
              {unassignedCount > 0 && (
                <Pill tone="warning" size="sm">
                  <Dot tone="warning" />
                  {unassignedCount} 未綁定校巴
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理學生資料、班別、家長關聯與校巴綁定。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
          <StatTile
            label="在學"
            value={activeCount}
            hint={`${total} 個學生總數`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="未綁定校巴"
            value={unassignedCount}
            hint="需要分配"
            icon={<AlertCircle width={12} height={12} />}
            tone="warning"
          />
          <StatTile
            label="非在學"
            value={graduatedCount}
            hint="停學 / 畢業"
            icon={<Archive width={12} height={12} />}
            tone="danger"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar — 規範 §9 */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="warning"
          size="sm"
          startIcon={<BusIcon width={12} height={12} />}
          onClick={() => {
            setTab('unassigned');
          }}
        >
          檢視未綁定
        </Button>
        {unassignedCount > 0 && (
          <Pill tone="warning" size="sm">
            {unassignedCount}
          </Pill>
        )}

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Button
          variant="secondary"
          size="sm"
          startIcon={<RefreshCw width={12} height={12} />}
          onClick={handleRefresh}
          isLoading={isRefreshing}
        >
          重新整理
        </Button>

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
            startIcon={<UserPlus width={12} height={12} />}
            onClick={openAdd}
          >
            新增學生
          </Button>
        </div>
      </div>

      {/* L3. Table Card — 規範 §11 */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<GraduationCap width={18} height={18} />}
          title={
            tab === 'active'
              ? '在學學生'
              : tab === 'unassigned'
              ? '未綁定校巴'
              : '非在學學生'
          }
          subtitle={`${filtered.length} 筆 · ${TAB_OPTIONS.find((o) => o.value === tab)?.label ?? ''}`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {filtered.length}
            </Pill>
          }
        />

        {/* L3b. Filter Bar (tabs + refresh + search) */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="students-tab-pill"
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
              placeholder="搜尋姓名、學號、班別…"
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

        {/* L3c. Table scroll region — AnimatePresence 三態 (規範 §13) */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {isLoading ? (
              <SkeletonRows key="loading" />
            ) : filtered.length === 0 ? (
              <EmptyState
                key={`empty-${tab}-${debouncedSearch}`}
                tab={tab}
                search={debouncedSearch}
              />
            ) : (
              <DataTable
                key={`rows-${tab}`}
                rows={pageItems}
                parents={parents}
                buses={buses}
                onView={(s) => setViewing(s)}
                onEdit={openEdit}
                onDelete={(s) => setDeleteTarget(s)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* L3d. Pagination footer */}
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

      {/* L4. Modals */}
      <StudentFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        context={{ students, parents, buses }}
        studentId={formModal.editingStudentId}
        previewStudentId={previewStudentId}
        clientId={authClientId}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        studentName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkeletonRows — Loading state (規範 §13)                                       */
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
              <div className="h-3 w-40 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
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
/*  EmptyState (規範 §13)                                                        */
/* -------------------------------------------------------------------------- */

function EmptyState({
  tab,
  search,
}: {
  tab: StudentTab;
  search: string;
}) {
  return (
    <motion.div
      key={`empty-${tab}-${search}`}
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
          {search
            ? '沒有符合條件的學生'
            : tab === 'graduated'
            ? '目前沒有非在學學生'
            : tab === 'unassigned'
            ? '全部學生皆已綁定校巴'
            : '尚未新增任何學生'}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : '點擊右上角的「新增學生」按鈕以建立第一筆資料。'}
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DataTable (規範 §17 + §12)                                                   */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  parents,
  buses,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Student[];
  parents: Parent[];
  buses: Bus[];
  onView: (s: Student) => void;
  onEdit: (s: Student) => void;
  onDelete: (s: Student) => void;
}) {
  const parentsById = React.useMemo(() => {
    const m = new Map<string, Parent>();
    parents.forEach((p) => m.set(p.id, p));
    return m;
  }, [parents]);

  const busesById = React.useMemo(() => {
    const m = new Map<string, Bus>();
    buses.forEach((b) => m.set(b.id, b));
    return m;
  }, [buses]);

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
            學生
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            學號
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            家長
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            校巴
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            建立日期
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
        {rows.map((s, idx) => {
          const bus = s.busId ? busesById.get(s.busId) : null;
          const rowParents = s.parentIds
            .map((id) => parentsById.get(id))
            .filter((p): p is Parent => !!p);
          return (
            <motion.tr
              key={s.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.22,
                ease: ANIMATION_EASE,
                delay: Math.min(idx * ROW_STAGGER_BASE, ROW_STAGGER_CAP),
              }}
            >
              {/* 學生 (avatar + name + class) — 規範 §12 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 flex items-center justify-center text-[12px] font-semibold dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                    {s.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[180px] dark:text-slate-100"
                      title={s.name}
                    >
                      {s.name}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono dark:text-slate-400">
                      班別：{s.classNumber || '—'}
                    </p>
                  </div>
                </div>
              </td>

              {/* 學號 (copyable chip) */}
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(s.studentId).catch(() => {});
                    }
                  }}
                  title="複製學號"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:text-slate-200"
                >
                  <Hash width={9} height={9} />
                  {s.studentId}
                  <Copy width={9} height={9} />
                </button>
              </td>

              {/* 家長 (pill stack — 主要聯繫人加 ★ 標記) */}
              <td className="px-3 py-2.5">
                {rowParents.length === 0 ? (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {rowParents.slice(0, 2).map((p) => {
                      const isPrimary = s.primaryParentId === p.id;
                      return (
                        <span
                          key={p.id}
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ring-1 ring-inset',
                            isPrimary
                              ? 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-700/50 font-semibold'
                              : 'bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50',
                          )}
                          title={isPrimary ? '主要聯繫人' : p.name}
                        >
                          {isPrimary && <Star width={9} height={9} fill="currentColor" strokeWidth={0} />}
                          {p.name}
                        </span>
                      );
                    })}
                    {rowParents.length > 2 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                        +{rowParents.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </td>

              {/* 校巴 */}
              <td className="px-3 py-2.5">
                {bus ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                    <BusIcon width={9} height={9} />
                    {bus.plateNumber}
                  </span>
                ) : (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400">未指派</span>
                )}
              </td>

              {/* 建立日期 */}
              <td className="px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1">
                  <Calendar width={11} height={11} className="text-slate-400" />
                  <span className="tabular-nums">{formatSystemAdminDate(s.createdAt)}</span>
                </span>
              </td>

              {/* 狀態 */}
              <td className="px-3 py-2.5">{statusBadge(s.status)}</td>

              {/* 操作 (icon cluster, opacity 70 → 100 on row hover) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => onView(s)} title="檢視詳情">
                    <Eye width={13} height={13} />
                  </IconButton>
                  <IconButton onClick={() => onEdit(s)} title="編輯學生">
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(s)}
                    title="刪除學生"
                    variant="danger"
                  >
                    <PowerOff width={13} height={13} />
                  </IconButton>
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
/*  System admin date format — YYYY/MM/DD (per spec §22)                                      */
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