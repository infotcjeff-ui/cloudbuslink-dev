'use client';

/**
 * ReportsConsoleContent — OneFleet-style operator console
 *
 * 設計語言: 與 /cbl-admin-setting/[layout]/students/StudentsConsoleContent 對齊
 *   - L1 Header Row (Title + Stat Tiles)
 *   - L2 Action Toolbar (Search + Date range + Export)
 *   - L3 Table Card (SectionHeader + Filter Bar + DataTable + Footer)
 *   - L4 批次動作列 (多選 paid / cancel / send payment)
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/reports/ 內使用。
 * 重用同目錄 primitives.tsx (Pill / Button / Card / SectionHeader /
 * StatTile / FilterTabGroup)，與 students / parents 同一視覺語言。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Receipt,
  Wallet,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Send,
  Inbox,
  Calendar,
  Bus as BusIcon,
  Eye,
  Trash2,
  FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { filterByAcademicYear } from '@/lib/academic-year';
import { useAcademicYear } from '../../AcademicYearProvider';
import { useToast } from '@/components/ui/toast';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import { fmtDate, today } from '@/lib/utils';
import {
  buildSummaryRows,
  rowToCells,
  summaryFileName,
  SUMMARY_HEADERS,
  SUMMARY_COL_WIDTHS,
  type StudentSummaryRow,
} from '@/lib/student-summary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DataTable,
  createSelectColumn,
  type DataTableFeatures,
} from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  Pill,
  Dot,
  Button,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from './primitives';
import {
  ANIMATION_EASE,
  TAB_FADE_DURATION,
} from './design-tokens';
import type { ReportTab } from './types';
import type {
  Trip,
  Bus,
  PaymentRecord,
  PaymentStatus,
} from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                   */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<ReportTab>[] = [
  {
    value: 'trips',
    label: '行程明細',
    icon: <Receipt width={11} height={11} />,
  },
  {
    value: 'payments',
    label: '付款記錄',
    icon: <Wallet width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  ReportTab,
  { header: 'primary' | 'warning' | 'danger'; pill: 'primary' | 'warning'; iconColor: string }
> = {
  trips: {
    header: 'primary',
    pill: 'primary',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  payments: {
    header: 'warning',
    pill: 'warning',
    iconColor: 'text-amber-600 dark:text-amber-300',
  },
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: '未付',
  paid: '已付',
  cancelled: '已取消',
  overdue: '逾期',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '現金',
  fps: '轉數快',
  bank_transfer: '銀行轉帳',
  cheque: '支票',
  other: '其他',
};

function paymentPill(status: PaymentStatus) {
  if (status === 'paid') {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        已付
      </Pill>
    );
  }
  if (status === 'pending') {
    return (
      <Pill tone="warning" size="sm">
        <Dot tone="warning" />
        未付
      </Pill>
    );
  }
  if (status === 'overdue') {
    return (
      <Pill tone="danger" size="sm">
        <Dot tone="danger" />
        逾期
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" size="sm">
      <Dot tone="neutral" />
      已取消
    </Pill>
  );
}

function tripStatusPill(status: Trip['status']) {
  if (status === 'completed') {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        完成
      </Pill>
    );
  }
  if (status === 'in_progress') {
    return (
      <Pill tone="warning" size="sm">
        <Dot tone="warning" />
        進行中
      </Pill>
    );
  }
  if (status === 'cancelled') {
    return (
      <Pill tone="neutral" size="sm">
        <Dot tone="neutral" />
        取消
      </Pill>
    );
  }
  return (
    <Pill tone="primary" size="sm">
      <Dot tone="primary" />
      待開始
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main content                                                                */
/* -------------------------------------------------------------------------- */

export interface ReportsConsoleContentProps {
  clientId: string;
  isSuperAdmin: boolean;
}

export function ReportsConsoleContent({
  clientId,
  isSuperAdmin,
}: ReportsConsoleContentProps) {
  const toast = useToast();
  const { selectedYear, isReadOnly: yearReadOnly, readOnlyMessage } = useAcademicYear();
  const [tab, setTab] = React.useState<ReportTab>('trips');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState(today());
  const [dateTo, setDateTo] = React.useState(today());
  const [busFilter, setBusFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = React.useState('');
  const [paymentPeriodFilter, setPaymentPeriodFilter] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);

  const [trips, setTrips] = React.useState<Trip[]>([]);
  const [payments, setPayments] = React.useState<PaymentRecord[]>([]);
  const [buses, setBuses] = React.useState<Bus[]>([]);

  /* -------- 查看 popup (班次學生摘要) -------- */
  const [viewTrip, setViewTrip] = React.useState<Trip | null>(null);
  const [viewRows, setViewRows] = React.useState<StudentSummaryRow[]>([]);
  const [viewPdfLoading, setViewPdfLoading] = React.useState(false);

  /* -------- 刪除班次 -------- */
  const [deleteTarget, setDeleteTarget] = React.useState<Trip | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  /* -------- 權限: 只有系統開發者 / 系統管理員可刪除 -------- */
  const { user } = useAuth();
  const canDeleteTrip =
    user?.role === 'system_admin' || user?.role === 'super_admin';

  // DataTable 多選 ids
  const [selectedTripIds, setSelectedTripIds] = React.useState<string[]>([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = React.useState<string[]>([]);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Data layer -------- */
  const load = React.useCallback(() => {
    const cid = clientId || '';
    if (isSuperAdmin) {
      setTrips(STORAGE.trips.getAll());
      setBuses(STORAGE.buses.getAll());
      setPayments(STORAGE.payments.getVisible('', true));
    } else {
      setTrips(cid ? STORAGE.trips.getByClient(cid) : []);
      setBuses(cid ? STORAGE.buses.getByClient(cid) : []);
      setPayments(STORAGE.payments.getVisible(cid, false));
    }
    setIsLoading(false);
  }, [clientId, isSuperAdmin]);

  React.useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('cbl-trips-refresh', handler);
    window.addEventListener('cbl-payments-refresh', handler);
    window.addEventListener('cbl-buses-refresh', handler);
    // 進頁時從雲端拉一次付款記錄 (localStorage 只是快取)
    let cancelled = false;
    const pull = async () => {
      try {
        const { supabasePayments } = await import('@/lib/supabase-payments');
        const res = await supabasePayments.syncToStorage();
        if (!res.success && !cancelled) {
          console.warn('[ReportsConsole] payments sync failed:', res.error);
        } else if (!cancelled) {
          load();
        }
      } catch (e) {
        console.warn('[ReportsConsole] payments sync error:', e);
      }
    };
    void pull();
    return () => {
      cancelled = true;
      window.removeEventListener('cbl-trips-refresh', handler);
      window.removeEventListener('cbl-payments-refresh', handler);
      window.removeEventListener('cbl-buses-refresh', handler);
    };
  }, [load]);

  /* -------- Filter: trips (學年 + 日期 + 校巴 + 狀態 + 搜尋) -------- */
  const filteredTrips = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const byYear = filterByAcademicYear(trips, selectedYear);
    return byYear
      .filter((t) => {
        if (t.date < dateFrom || t.date > dateTo) return false;
        if (busFilter && t.busId !== busFilter) return false;
        if (statusFilter && t.status !== statusFilter) return false;
        if (!q) return true;
        const bus = buses.find((b) => b.id === t.busId);
        return (
          t.date.toLowerCase().includes(q) ||
          (bus?.plateNumber ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [trips, selectedYear, dateFrom, dateTo, busFilter, statusFilter, debouncedSearch, buses]);

  /* -------- Filter: payments (狀態 + 期數 + 搜尋) -------- */
  const periods = React.useMemo(
    () => Array.from(new Set(payments.map((p) => p.period))).sort().reverse(),
    [payments],
  );

  const filteredPayments = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return payments.filter((p) => {
      if (paymentStatusFilter && p.status !== paymentStatusFilter) return false;
      if (paymentPeriodFilter && p.period !== paymentPeriodFilter) return false;
      if (!q) return true;
      return (
        p.studentName.toLowerCase().includes(q) ||
        p.parentName.toLowerCase().includes(q) ||
        p.parentPhone.toLowerCase().includes(q) ||
        p.period.toLowerCase().includes(q)
      );
    });
  }, [payments, paymentStatusFilter, paymentPeriodFilter, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const completedTrips = React.useMemo(
    () => filteredTrips.filter((t) => t.status === 'completed').length,
    [filteredTrips],
  );
  const paymentStats = React.useMemo(() => {
    const total = filteredPayments.length;
    const paid = filteredPayments.filter((p) => p.status === 'paid').length;
    const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const paidAmount = filteredPayments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = totalAmount - paidAmount;
    return { total, paid, totalAmount, paidAmount, pendingAmount };
  }, [filteredPayments]);

  const accent = TAB_ACCENT[tab];
  const hasPaymentSelection = selectedPaymentIds.length > 0;

  /* ---------------------------------------------------------------------- */
  /*  查看 popup — 該班次的學生摘要 (可下載 PDF)                               */
  /* ---------------------------------------------------------------------- */
  /* 註: 必須宣告喺 tripColumns 之前 — tripColumns 的 useMemo 依賴 openViewTrip,
      若喺後面先宣告會觸發 TDZ (Block-scoped variable used before its declaration)。 */

  const collectSummarySource = React.useCallback(
    (targetTrips: Trip[]) => {
      const allStudents = isSuperAdmin
        ? STORAGE.students.getAll()
        : STORAGE.students.getByClient(clientId);
      const allParents = isSuperAdmin
        ? STORAGE.parents.getAll()
        : STORAGE.parents.getByClient(clientId);

      const attendancesByTrip = new Map<
        string,
        ReturnType<typeof STORAGE.attendances.getByTrip>
      >();
      targetTrips.forEach((t) => {
        attendancesByTrip.set(t.id, STORAGE.attendances.getByTrip(t.id));
      });

      return { students: allStudents, parents: allParents, attendancesByTrip };
    },
    [clientId, isSuperAdmin],
  );

  const buildRowsForTrips = React.useCallback(
    (targetTrips: Trip[]): StudentSummaryRow[] =>
      buildSummaryRows(targetTrips, collectSummarySource(targetTrips)),
    [collectSummarySource],
  );

  const openViewTrip = React.useCallback(
    (trip: Trip) => {
      const rows = buildRowsForTrips([trip]);
      setViewRows(rows);
      setViewTrip(trip);
    },
    [buildRowsForTrips],
  );

  /* -------- DataTable columns -------- */
  const tripColumns = React.useMemo<ColumnDef<DataTableFeatures, Trip>[]>(
    () => [
      createSelectColumn<Trip>(),
      {
        id: 'date',
        header: '日期',
        accessorFn: (row) => row.date,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.date}</span>
        ),
      },
      {
        id: 'time',
        header: '開始',
        accessorFn: (row) => row.plannedStartTime,
        cell: ({ row }) => (
          <span className="text-xs font-medium tabular-nums">
            {row.original.plannedStartTime}
          </span>
        ),
      },
      {
        id: 'bus',
        header: '校巴',
        accessorFn: (row) => row.busId,
        cell: ({ row }) => {
          const bus = buses.find((b) => b.id === row.original.busId);
          return <span className="text-xs font-semibold">{bus?.plateNumber || '—'}</span>;
        },
      },
      {
        id: 'students',
        header: '學生',
        accessorFn: (row) => row.studentIds.length,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.studentIds.length}</span>
        ),
      },
      {
        id: 'stops',
        header: '站點',
        accessorFn: (row) => row.waypoints.length,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.waypoints.length}</span>
        ),
      },
      {
        id: 'status',
        header: '狀態',
        accessorFn: (row) => row.status,
        cell: ({ row }) => tripStatusPill(row.original.status),
      },
      {
        id: 'actions',
        header: '操作',
        accessorFn: () => null,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              startIcon={<Eye width={12} height={12} />}
              onClick={() => openViewTrip(row.original)}
              title="查看該班次的學生摘要"
            >
              查看
            </Button>
            {canDeleteTrip && (
              <Button
                variant="ghost"
                size="sm"
                startIcon={<Trash2 width={12} height={12} />}
                onClick={() => setDeleteTarget(row.original)}
                disabled={yearReadOnly}
                title={
                  yearReadOnly
                    ? '封存學年為唯讀, 不能刪除'
                    : '刪除該班次'
                }
                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                刪除
              </Button>
            )}
          </div>
        ),
      },
    ],
    [buses, openViewTrip, canDeleteTrip, yearReadOnly],
  );

  const paymentColumns = React.useMemo<ColumnDef<DataTableFeatures, PaymentRecord>[]>(
    () => [
      createSelectColumn<PaymentRecord>(),
      {
        id: 'period',
        header: '期數',
        accessorFn: (row) => row.period,
        cell: ({ row }) => (
          <span className="text-xs font-medium tabular-nums">
            {row.original.period || '—'}
          </span>
        ),
      },
      {
        id: 'student',
        header: '學生',
        accessorFn: (row) => row.studentName,
        cell: ({ row }) => (
          <span className="text-xs font-semibold">{row.original.studentName}</span>
        ),
      },
      {
        id: 'parent',
        header: '家長',
        accessorFn: (row) => row.parentName,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-xs truncate">{row.original.parentName}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {row.original.parentPhone}
            </p>
          </div>
        ),
      },
      {
        id: 'amount',
        header: '金額',
        accessorFn: (row) => row.amount,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="text-xs font-bold tabular-nums">
              ${row.original.amount.toLocaleString('zh-HK')}
            </span>
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: '到期日',
        accessorFn: (row) => row.dueDate,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.dueDate}</span>
        ),
      },
      {
        id: 'status',
        header: '狀態',
        accessorFn: (row) => row.status,
        cell: ({ row }) => paymentPill(row.original.status),
      },
      {
        id: 'notified',
        header: '已通知',
        accessorFn: (row) => row.paymentNotifiedAt ?? '',
        cell: ({ row }) =>
          row.original.paymentNotifiedAt ? (
            <Pill tone="success" size="sm">
              <Send width={9} height={9} />
              已發送
            </Pill>
          ) : (
            <span className="text-[10px] text-slate-400">—</span>
          ),
      },
    ],
    [],
  );

  /* -------- 付款批次動作 -------- */
  const reloadPayments = React.useCallback(() => {
    const cid = clientId || '';
    setPayments(
      isSuperAdmin
        ? STORAGE.payments.getVisible('', true)
        : STORAGE.payments.getVisible(cid, false),
    );
  }, [clientId, isSuperAdmin]);

  const guardReadOnly = React.useCallback(() => {
    if (yearReadOnly) {
      toast.warning(readOnlyMessage.hint);
      return true;
    }
    return false;
  }, [yearReadOnly, readOnlyMessage, toast]);

  const handleBulkMarkPaid = React.useCallback(async () => {
    if (selectedPaymentIds.length === 0) return;
    if (guardReadOnly()) return;
    const ids = [...selectedPaymentIds];
    STORAGE.payments.bulkUpdateStatus(ids, 'paid');
    try {
      const { supabasePayments } = await import('@/lib/supabase-payments');
      const res = await supabasePayments.bulkUpdate(ids, {
        status: 'paid',
        paidDate: today(),
        updatedAt: new Date().toISOString(),
      });
      if (!res.success) {
        toast.warning(`已在本機標記 ${ids.length} 筆已付，但雲端同步失敗：${res.error}`);
      }
    } catch (e) {
      console.warn('[Reports] mark paid sync error:', e);
      toast.warning(`已在本機標記 ${ids.length} 筆已付，但雲端同步失敗`);
    }
    reloadPayments();
    setSelectedPaymentIds([]);
    toast.success(`已標記 ${ids.length} 筆為已付`);
  }, [selectedPaymentIds, guardReadOnly, reloadPayments, toast]);

  const handleBulkCancel = React.useCallback(async () => {
    if (selectedPaymentIds.length === 0) return;
    if (guardReadOnly()) return;
    const ids = [...selectedPaymentIds];
    STORAGE.payments.bulkUpdateStatus(ids, 'cancelled');
    try {
      const { supabasePayments } = await import('@/lib/supabase-payments');
      const res = await supabasePayments.bulkUpdate(ids, {
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
      if (!res.success) {
        toast.warning(`已在本機取消 ${ids.length} 筆，但雲端同步失敗：${res.error}`);
      }
    } catch (e) {
      console.warn('[Reports] cancel sync error:', e);
      toast.warning(`已在本機取消 ${ids.length} 筆，但雲端同步失敗`);
    }
    reloadPayments();
    setSelectedPaymentIds([]);
    toast.success(`已取消 ${ids.length} 筆付款記錄`);
  }, [selectedPaymentIds, guardReadOnly, reloadPayments, toast]);

  const handleSendPaymentNotice = React.useCallback(async () => {
    if (selectedPaymentIds.length === 0) return;
    if (guardReadOnly()) return;
    const ids = [...selectedPaymentIds];
    STORAGE.payments.bulkMarkNotified(ids);
    try {
      const { supabasePayments } = await import('@/lib/supabase-payments');
      const res = await supabasePayments.bulkUpdate(ids, {
        paymentNotifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (!res.success) {
        toast.warning(`已在本機記錄 ${ids.length} 筆通知，但雲端同步失敗：${res.error}`);
      }
    } catch (e) {
      console.warn('[Reports] send payment sync error:', e);
      toast.warning(`已在本機記錄 ${ids.length} 筆通知，但雲端同步失敗`);
    }
    reloadPayments();
    setSelectedPaymentIds([]);
    toast.success(`已向 ${ids.length} 位家長發送繳費通知`);
  }, [selectedPaymentIds, guardReadOnly, reloadPayments, toast]);

  /* -------- 匯出 Excel (單日所有班次整合成一份 Student Summary) -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filteredTrips.length === 0 && filteredPayments.length === 0) return;
    setExporting(true);
    try {
      const settings = clientId
        ? STORAGE.settings.getByClient(clientId)
        : STORAGE.settings.default('');

      const wb = XLSX.utils.book_new();

      /* --- Sheet 1: 學生摘要 (依 Student Summary.xlsx 欄位格式) --- */
      const summaryRows = buildRowsForTrips(filteredTrips);
      if (summaryRows.length > 0) {
        // 第一列 = 模板表頭 (A–S), 內容列 = 學生摘要
        const aoa: (string | number)[][] = [
          Array.from(SUMMARY_HEADERS),
          ...summaryRows.map((r) => rowToCells(r)),
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = SUMMARY_COL_WIDTHS.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, '學生摘要');
      }

      /* --- Sheet 2: 學生出席統計 --- */
      const studentStats = new Map<string, Record<string, string | number>>();
      filteredTrips.forEach((trip) => {
        const attendances = STORAGE.attendances.getByTrip(trip.id);
        const pickupWpIds = new Set(
          trip.waypoints.filter((w) => w.type === 'pickup').map((w) => w.id),
        );
        trip.studentIds.forEach((sid) => {
          const student = STORAGE.students.getById(sid);
          if (!student) return;
          if (!studentStats.has(sid)) {
            studentStats.set(sid, {
              '學生編號': student.studentId,
              '學生姓名': student.name,
              '班別': student.classNumber,
              '總班次': 0,
              '已上車': 0,
              '遲到': 0,
              '未上車': 0,
              '缺席': 0,
              '出席率': '',
            });
          }
          const stat = studentStats.get(sid)!;
          (stat['總班次'] as number) += 1;
          attendances
            .filter((a) => a.studentId === sid && pickupWpIds.has(a.waypointId))
            .forEach((att) => {
              if (att.boardingStatus === 'on_time') (stat['已上車'] as number) += 1;
              if (att.boardingStatus === 'late') (stat['遲到'] as number) += 1;
              if (att.boardingStatus === 'no_show') (stat['未上車'] as number) += 1;
              if (att.boardingStatus === 'absent') (stat['缺席'] as number) += 1;
            });
        });
      });
      studentStats.forEach((stat) => {
        const total = stat['總班次'] as number;
        const present = (stat['已上車'] as number) + (stat['遲到'] as number);
        stat['出席率'] = total > 0 ? `${Math.round((present / total) * 100)}%` : '0%';
      });
      if (studentStats.size > 0) {
        const ws2 = XLSX.utils.json_to_sheet(Array.from(studentStats.values()));
        XLSX.utils.book_append_sheet(wb, ws2, '學生出席統計');
      }

      /* --- Sheet 3: 付款記錄 --- */
      if (filteredPayments.length > 0) {
        const paymentRows = filteredPayments.map((p) => ({
          '期數': p.period,
          '學生姓名': p.studentName,
          '家長姓名': p.parentName,
          '家長電話': p.parentPhone,
          '金額': p.amount,
          '狀態': PAYMENT_STATUS_LABEL[p.status],
          '到期日': p.dueDate,
          '付款日期': p.paidDate || '',
          '付款方式': p.method ? PAYMENT_METHOD_LABEL[p.method] : '',
          '已發送通知': p.paymentNotifiedAt ? '是' : '否',
        }));
        const ws3 = XLSX.utils.json_to_sheet(paymentRows);
        XLSX.utils.book_append_sheet(wb, ws3, '付款記錄');
      }

      // 檔名: 單日 + 學年 (一天所有班次整合成一份)
      XLSX.writeFile(
        wb,
        summaryFileName(dateFrom, settings.academicYear || selectedYear),
      );
      toast.success(`Excel 報表已匯出（${filteredTrips.length} 班次整合）`);
    } finally {
      setExporting(false);
    }
  }, [
    filteredTrips,
    filteredPayments,
    dateFrom,
    clientId,
    selectedYear,
    buildRowsForTrips,
    toast,
  ]);

  /* ---------------------------------------------------------------------- */
  /*  查看 popup — 該班次的學生摘要 (可下載 PDF)                               */
  /*  (openViewTrip 已宣告喺上方 tripColumns 之前, 避免 TDZ)                  */
  /* ---------------------------------------------------------------------- */

  const closeViewTrip = React.useCallback(() => {
    setViewTrip(null);
    setViewRows([]);
  }, []);

  const handleDownloadPdf = React.useCallback(async () => {
    if (!viewTrip) return;
    setViewPdfLoading(true);
    try {
      const { downloadSummaryPdf } = await import('@/lib/student-summary-pdf');
      const settings = clientId
        ? STORAGE.settings.getByClient(clientId)
        : STORAGE.settings.default('');
      const bus = STORAGE.buses.getById(viewTrip.busId);
      const typeLabel =
        viewTrip.type === 'morning'
          ? '上午班'
          : viewTrip.type === 'afternoon'
            ? '下午班'
            : viewTrip.customTypeLabel || '自訂';

      await downloadSummaryPdf(viewRows, {
        fileName: `StudentSummary_${viewTrip.date}_${viewTrip.plannedStartTime.replace(':', '')}`,
        subtitle: [
          `日期 ${viewTrip.date}`,
          `班次 ${typeLabel}`,
          `車牌 ${bus?.plateNumber || '—'}`,
          `學年 ${settings.academicYear || selectedYear || '—'}`,
          `學生 ${viewRows.length} 人`,
        ].join('  |  '),
      });
      toast.success('PDF 已下載');
    } catch (e) {
      console.warn('[Reports] PDF export failed:', e);
      toast.error('PDF 下載失敗，請稍後再試');
    } finally {
      setViewPdfLoading(false);
    }
  }, [viewTrip, viewRows, clientId, selectedYear, toast]);

  /* ---------------------------------------------------------------------- */
  /*  刪除班次 (僅系統開發者 / 系統管理員)                                    */
  /* ---------------------------------------------------------------------- */

  const handleDeleteTrip = React.useCallback(async () => {
    if (!deleteTarget) return;
    if (!canDeleteTrip) {
      toast.error('只有系統開發者或系統管理員可以刪除班次');
      return;
    }
    if (guardReadOnly()) return;

    setDeleting(true);
    const tripId = deleteTarget.id;
    try {
      // 本機: 刪除班次 + 該班次的出席記錄
      STORAGE.trips.remove(tripId);
      const remaining = STORAGE.attendances
        .getAll()
        .filter((a) => a.tripId !== tripId);
      STORAGE.attendances.setAll(remaining);

      // 雲端: 級聯刪除 attendances → trips
      try {
        const { supabaseAttendances } = await import('@/lib/supabase-attendances');
        const { supabaseTrips } = await import('@/lib/supabase-trips');
        const attRes = await supabaseAttendances.deleteByTrip(tripId);
        if (!attRes.success) {
          console.warn('[Reports] delete attendances failed:', attRes.error);
        }
        const tripRes = await supabaseTrips.delete(tripId);
        if (!tripRes.success) {
          console.warn('[Reports] delete trip failed:', tripRes.error);
          toast.warning('班次已在本機刪除，但雲端同步失敗');
        }
      } catch (e) {
        console.warn('[Reports] delete cloud sync error:', e);
        toast.warning('班次已在本機刪除，但雲端同步失敗');
      }

      // 從列表移除並關閉確認框
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
      setSelectedTripIds((prev) => prev.filter((id) => id !== tripId));
      setDeleteTarget(null);
      toast.success('班次已刪除');
    } catch (e) {
      console.warn('[Reports] delete trip error:', e);
      toast.error('刪除班次失敗，請稍後再試');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, canDeleteTrip, guardReadOnly, toast]);

  /* -------- Render -------- */
  const listCount = tab === 'trips' ? filteredTrips.length : filteredPayments.length;

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <BarChart3 width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                報表
              </h1>
              <Pill tone="primary" size="sm">
                <Receipt width={9} height={9} />
                {filteredTrips.length} 班次
              </Pill>
              <Pill tone="warning" size="sm">
                <Dot tone="warning" />
                {paymentStats.total - paymentStats.paid} 筆待繳
              </Pill>
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              行程明細、學生出席統計與繳費記錄 — 支援多選批次處理。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:w-[640px]">
          <StatTile
            label="總班次"
            value={filteredTrips.length}
            hint={`已完成 ${completedTrips}`}
            icon={<Receipt width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="學生人次"
            value={new Set(filteredTrips.flatMap((t) => t.studentIds)).size}
            hint="所選範圍"
            icon={<Calendar width={12} height={12} />}
            tone="neutral"
          />
          <StatTile
            label="應收總額"
            value={`$${paymentStats.totalAmount.toLocaleString('zh-HK')}`}
            hint={`${paymentStats.total} 筆`}
            icon={<Wallet width={12} height={12} />}
            tone="warning"
          />
          <StatTile
            label="已收金額"
            value={`$${paymentStats.paidAmount.toLocaleString('zh-HK')}`}
            hint={`${paymentStats.paid} 筆已付`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="success"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
          <Calendar width={12} height={12} />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          />
        </span>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <select
          value={busFilter}
          onChange={(e) => setBusFilter(e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          title="篩選校巴"
        >
          <option value="">全部校巴</option>
          {buses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.plateNumber}
            </option>
          ))}
        </select>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Button
          variant="secondary"
          size="sm"
          startIcon={<FileSpreadsheet width={12} height={12} />}
          onClick={handleExportExcel}
          isLoading={exporting}
          disabled={filteredTrips.length === 0 && filteredPayments.length === 0}
          title="匯出為 Excel（學生摘要 + 學生出席統計 + 付款記錄三個 sheet；學生摘要為所選日期內所有班次整合）"
        >
          匯出 Excel ({filteredTrips.length + filteredPayments.length})
        </Button>

        {tab === 'payments' && hasPaymentSelection && (
          <>
            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
            <Pill tone="primary" size="sm">
              已選 {selectedPaymentIds.length} 筆
            </Pill>
            <Button
              variant="success"
              size="sm"
              startIcon={<CheckCircle2 width={12} height={12} />}
              onClick={handleBulkMarkPaid}
              disabled={yearReadOnly}
            >
              標記已付
            </Button>
            <Button
              variant="danger"
              size="sm"
              startIcon={<XCircle width={12} height={12} />}
              onClick={handleBulkCancel}
              disabled={yearReadOnly}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              startIcon={<Send width={12} height={12} />}
              onClick={handleSendPaymentNotice}
              disabled={yearReadOnly}
            >
              發送繳費通知
            </Button>
          </>
        )}
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        <SectionHeader
          icon={
            tab === 'trips' ? (
              <Receipt width={18} height={18} />
            ) : (
              <Wallet width={18} height={18} />
            )
          }
          title={tab === 'trips' ? '行程明細' : '付款記錄'}
          subtitle={`${listCount} 筆 · ${TAB_OPTIONS.find((o) => o.value === tab)?.label ?? ''} · ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {listCount}
            </Pill>
          }
        />

        {/* L3b. Filter Bar */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSearch('');
              setSelectedTripIds([]);
              setSelectedPaymentIds([]);
            }}
            options={TAB_OPTIONS}
            layoutId="reports-tab-pill"
          />

          {tab === 'trips' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            >
              <option value="">全部狀態</option>
              <option value="scheduled">待開始</option>
              <option value="in_progress">進行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          )}

          {tab === 'payments' && (
            <>
              <select
                value={paymentPeriodFilter}
                onChange={(e) => setPaymentPeriodFilter(e.target.value)}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              >
                <option value="">全部期數</option>
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              >
                <option value="">全部狀態</option>
                <option value="pending">未付</option>
                <option value="paid">已付</option>
                <option value="overdue">逾期</option>
                <option value="cancelled">已取消</option>
              </select>
            </>
          )}

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
              placeholder={tab === 'trips' ? '搜尋日期、車牌…' : '搜尋學生、家長、電話、期數…'}
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

        {/* L3c. Table scroll region */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {isLoading ? (
              <SkeletonRows key="loading" />
            ) : tab === 'trips' ? (
              <motion.div
                key={`trips-${debouncedSearch}-${statusFilter}-${busFilter}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
                className="p-5"
              >
                <DataTable
                  columns={tripColumns}
                  data={filteredTrips}
                  selectedRowIds={selectedTripIds}
                  onSelectedRowIdsChange={setSelectedTripIds}
                  showColumnToggle={false}
                  empty={
                    <Empty className="border-0 bg-transparent py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Inbox className="w-6 h-6" />
                        </EmptyMedia>
                        <EmptyTitle>所選範圍內沒有班次記錄</EmptyTitle>
                        <EmptyDescription>
                          試試調整日期範圍或篩選條件，再查看一次。
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key={`payments-${debouncedSearch}-${paymentStatusFilter}-${paymentPeriodFilter}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
                className="p-5"
              >
                <DataTable
                  columns={paymentColumns}
                  data={filteredPayments}
                  selectedRowIds={selectedPaymentIds}
                  onSelectedRowIdsChange={setSelectedPaymentIds}
                  showColumnToggle={false}
                  empty={
                    <Empty className="border-0 bg-transparent py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Wallet className="w-6 h-6" />
                        </EmptyMedia>
                        <EmptyTitle>沒有付款記錄</EmptyTitle>
                        <EmptyDescription>
                          {payments.length === 0
                            ? '目前系統內未有付款記錄 — 繳費記錄會在這裡列出。'
                            : '試試調整期數或狀態篩選條件，再查看一次。'}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                          <BusIcon width={11} height={11} />
                          可多選列，批次「標記已付 / 取消 / 發送繳費通知」
                        </div>
                      </EmptyContent>
                    </Empty>
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* L3d. Pagination footer */}
        {!isLoading && listCount > 0 && (
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500 gap-3 flex-wrap dark:bg-slate-900/40 dark:border-slate-700/80 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              共
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {listCount}
              </span>
              筆
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              <Dot tone="primary" />
              {tab === 'trips'
                ? `${completedTrips} 已完成`
                : `${paymentStats.paid} 已付 · 待繳 $${paymentStats.pendingAmount.toLocaleString('zh-HK')}`}
            </span>
            <span className="text-[10px] text-slate-400">
              報表包含：學生摘要 + 學生出席統計 + 付款記錄
            </span>
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/*  查看 popup — 該班次的學生摘要 (表格 + 下載 PDF)                   */}
      {/* ---------------------------------------------------------------- */}
      <Dialog
        open={!!viewTrip}
        onOpenChange={(open) => {
          if (!open) closeViewTrip();
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] !grid !grid-rows-[auto_minmax(0,1fr)_auto] rounded-2xl p-0 max-h-[88vh] overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="text-base">學生摘要</DialogTitle>
            <DialogDescription className="text-xs">
              {viewTrip
                ? [
                    `日期 ${viewTrip.date}`,
                    `班次 ${
                      viewTrip.type === 'morning'
                        ? '上午班'
                        : viewTrip.type === 'afternoon'
                          ? '下午班'
                          : viewTrip.customTypeLabel || '自訂'
                    }`,
                    `車牌 ${
                      STORAGE.buses.getById(viewTrip.busId)?.plateNumber || '—'
                    }`,
                    `${viewRows.length} 位學生`,
                  ].join(' · ')
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-auto px-6 pb-2">
            {viewRows.length > 0 ? (
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {SUMMARY_HEADERS.map((h, i) => (
                      <th
                        key={`${h}-${i}`}
                        className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap dark:text-slate-300"
                      >
                        {h || '—'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewRows.map((r, idx) => (
                    <tr
                      key={`${r.id}-${idx}`}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      {rowToCells(r).map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-2 py-1.5 text-slate-700 whitespace-nowrap dark:text-slate-200"
                        >
                          {cell === '' ? '—' : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-8 text-center text-[12px] text-slate-400">
                此班次沒有學生摘要資料
              </p>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700">
            <Button
              variant="secondary"
              onClick={closeViewTrip}
              className="flex-1"
            >
              關閉
            </Button>
            <Button
              variant="primary"
              onClick={handleDownloadPdf}
              isLoading={viewPdfLoading}
              disabled={viewRows.length === 0}
              startIcon={<FileDown width={12} height={12} />}
              className="flex-1"
            >
              下載 PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      {/*  刪除班次 — 二次確認                                            */}
      {/* ---------------------------------------------------------------- */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="刪除此班次？"
        description={
          deleteTarget
            ? `將永久刪除 ${deleteTarget.date} 的班次（${
                deleteTarget.type === 'morning'
                  ? '上午班'
                  : deleteTarget.type === 'afternoon'
                    ? '下午班'
                    : deleteTarget.customTypeLabel || '自訂'
              }），以及該班次的全部出席記錄。此操作無法復原。`
            : ''
        }
        confirmLabel="確認刪除"
        tone="destructive"
        onConfirm={handleDeleteTrip}
        confirming={deleting}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkeletonRows — Loading state                                                 */
/* -------------------------------------------------------------------------- */

function SkeletonRows() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
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
