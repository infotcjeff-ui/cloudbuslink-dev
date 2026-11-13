'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Loader2,
  Download,
  Receipt,
  CheckCircle2,
  XCircle,
  Send,
  Inbox,
  Wallet,
  Users,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/hooks';
import { STORAGE, resolveDataScope } from '@/lib/storage';
import { fmtDate, boardingStatusLabel, dropoffStatusLabel, today } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
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
} from '@/components/ui/empty';
import type {
  Trip,
  Bus,
  Student,
  Driver,
  Nanny,
  Attendance,
  Parent,
  PaymentRecord,
  PaymentStatus,
} from '@/lib/types';

/** 付款狀態 → 中文標籤 */
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: '未付',
  paid: '已付',
  cancelled: '已取消',
  overdue: '逾期',
};

/** 付款狀態 → badge variant */
const PAYMENT_STATUS_VARIANT: Record<
  PaymentStatus,
  'default' | 'secondary' | 'success' | 'warning' | 'destructive'
> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'secondary',
  overdue: 'destructive',
};

/** 付款方式 → 中文標籤 */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '現金',
  fps: '轉數快',
  bank_transfer: '銀行轉帳',
  cheque: '支票',
  other: '其他',
};

export default function ReportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [busFilter, setBusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  // 報表明細表的多選 ids
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 付款記錄表的多選 ids
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  // 付款記錄的篩選
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [paymentPeriodFilter, setPaymentPeriodFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    const scope = resolveDataScope(user);
    const all = scope.isSuperAdmin
      ? STORAGE.trips.getAll()
      : STORAGE.trips.getByClient(scope.clientId);
    const filtered = all.filter(t => {
      if (t.date < dateFrom || t.date > dateTo) return false;
      if (busFilter && t.busId !== busFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date));
    setTrips(filtered);
  }, [user, dateFrom, dateTo, busFilter, statusFilter]);

  // 付款記錄 — 依資料可見範圍載入 + 監聽 refresh 事件
  const loadPayments = () => {
    if (!user) return;
    const scope = resolveDataScope(user);
    setPayments(
      scope.isSuperAdmin
        ? STORAGE.payments.getVisible('', true)
        : STORAGE.payments.getVisible(scope.clientId, false),
    );
  };

  useEffect(() => {
    loadPayments();
    if (!user) return;
    const onRefresh = () => loadPayments();
    window.addEventListener('cbl-payments-refresh', onRefresh);
    return () => window.removeEventListener('cbl-payments-refresh', onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const scope = resolveDataScope(user);
  const buses = scope.isSuperAdmin
    ? STORAGE.buses.getAll()
    : STORAGE.buses.getByClient(scope.clientId);

  // ---------------------------------------------------------------------
  // 付款記錄的篩選
  // ---------------------------------------------------------------------
  const periods = useMemo(
    () => Array.from(new Set(payments.map((p) => p.period))).sort().reverse(),
    [payments],
  );

  const filteredPayments = useMemo(
    () =>
      payments.filter((p) => {
        if (paymentStatusFilter && p.status !== paymentStatusFilter) return false;
        if (paymentPeriodFilter && p.period !== paymentPeriodFilter) return false;
        return true;
      }),
    [payments, paymentStatusFilter, paymentPeriodFilter],
  );

  // ---------------------------------------------------------------------
  // 報表頁的 Data Table 欄位 (班次預覽)
  // ---------------------------------------------------------------------
  const tripColumns = useMemo<ColumnDef<DataTableFeatures, Trip>[]>(
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
          const bus = STORAGE.buses.getById(row.original.busId);
          return <span className="text-xs font-semibold">{bus?.plateNumber || '—'}</span>;
        },
      },
      {
        id: 'driver',
        header: '司機',
        accessorFn: (row) => row.driverIdSnapshot ?? '',
        cell: ({ row }) => {
          const snapshot = row.original.driverIdSnapshot;
          const driver = snapshot ? STORAGE.drivers.getById(snapshot) : null;
          return <span className="text-xs">{driver?.name || '—'}</span>;
        },
      },
      {
        id: 'nanny',
        header: '保姆',
        accessorFn: (row) => row.nannyId,
        cell: ({ row }) => {
          const nanny = STORAGE.nannies.getById(row.original.nannyId);
          return <span className="text-xs">{nanny?.name || '—'}</span>;
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
        cell: ({ row }) => {
          const s = row.original.status;
          const variant =
            s === 'completed' ? 'success' :
            s === 'in_progress' ? 'warning' :
            s === 'cancelled' ? 'destructive' : 'secondary';
          const label =
            s === 'completed' ? '完成' :
            s === 'in_progress' ? '進行中' :
            s === 'cancelled' ? '取消' : '待開始';
          return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
        },
      },
    ],
    [],
  );

  // ---------------------------------------------------------------------
  // 付款記錄的 Data Table 欄位
  // ---------------------------------------------------------------------
  const paymentColumns = useMemo<ColumnDef<DataTableFeatures, PaymentRecord>[]>(
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
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Badge variant={PAYMENT_STATUS_VARIANT[s]} className="text-[10px]">
              {PAYMENT_STATUS_LABEL[s]}
            </Badge>
          );
        },
      },
      {
        id: 'notified',
        header: '已通知',
        accessorFn: (row) => row.paymentNotifiedAt ?? '',
        cell: ({ row }) =>
          row.original.paymentNotifiedAt ? (
            <Badge variant="success" className="text-[10px]">
              <Send className="h-2.5 w-2.5 mr-1" />
              已發送
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  // ---------------------------------------------------------------------
  // 多選批次動作
  // ---------------------------------------------------------------------
  const handleBulkMarkPaid = async () => {
    if (selectedPaymentIds.length === 0) return;
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
        toast.warning(`已在本機標記 ${ids.length} 筆已付, 但雲端同步失敗：${res.error}`);
      }
    } catch (e) {
      console.warn('[Reports] mark paid sync error:', e);
      toast.warning(`已在本機標記 ${ids.length} 筆已付, 但雲端同步失敗`);
    }
    loadPayments();
    setSelectedPaymentIds([]);
    toast.success(`已標記 ${ids.length} 筆為已付`);
  };

  const handleBulkCancel = async () => {
    if (selectedPaymentIds.length === 0) return;
    const ids = [...selectedPaymentIds];
    STORAGE.payments.bulkUpdateStatus(ids, 'cancelled');
    try {
      const { supabasePayments } = await import('@/lib/supabase-payments');
      const res = await supabasePayments.bulkUpdate(ids, {
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
      if (!res.success) {
        toast.warning(`已在本機取消 ${ids.length} 筆, 但雲端同步失敗：${res.error}`);
      }
    } catch (e) {
      console.warn('[Reports] cancel sync error:', e);
      toast.warning(`已在本機取消 ${ids.length} 筆, 但雲端同步失敗`);
    }
    loadPayments();
    setSelectedPaymentIds([]);
    toast.success(`已取消 ${ids.length} 筆付款記錄`);
  };

  const handleSendPaymentNotice = async () => {
    if (selectedPaymentIds.length === 0) return;
    const ids = [...selectedPaymentIds];
    STORAGE.payments.bulkMarkNotified(ids);
    try {
      const { supabasePayments } = await import('@/lib/supabase-payments');
      const res = await supabasePayments.bulkUpdate(ids, {
        paymentNotifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (!res.success) {
        toast.warning(`已在本機記錄 ${ids.length} 筆通知, 但雲端同步失敗：${res.error}`);
      }
    } catch (e) {
      console.warn('[Reports] send payment sync error:', e);
      toast.warning(`已在本機記錄 ${ids.length} 筆通知, 但雲端同步失敗`);
    }
    loadPayments();
    setSelectedPaymentIds([]);
    toast.success(`已向 ${ids.length} 位家長發送繳費通知`);
  };

  // ---------------------------------------------------------------------
  // 匯出 Excel
  // ---------------------------------------------------------------------
  const exportToExcel = () => {
    if (trips.length === 0) return;
    setExporting(true);

    try {
      // 行程報表 - 詳細數據
      const rows: any[] = [];
      const settings = scope.clientId
        ? STORAGE.settings.getByClient(scope.clientId)
        : STORAGE.settings.default('');

      trips.forEach(trip => {
        const bus = STORAGE.buses.getById(trip.busId);
        const driver = bus?.driverId ? STORAGE.drivers.getById(bus.driverId) : null;
        const nanny = STORAGE.nannies.getById(trip.nannyId);
        const attendances = STORAGE.attendances.getByTrip(trip.id);

        trip.waypoints.forEach((wp, wpIdx) => {
          wp.studentIds.forEach(sid => {
            const student = STORAGE.students.getById(sid);
            if (!student) return;
            const att = attendances.find(
              a => a.studentId === sid && a.waypointId === wp.id
            );
            const parent: Parent | undefined = student.parentIds[0]
              ? STORAGE.parents.getById(student.parentIds[0])
              : undefined;

            rows.push({
              '日期': trip.date,
              '學年': settings.academicYear,
              '班次類型': trip.type === 'morning' ? '上午班' : trip.type === 'afternoon' ? '下午班' : '自訂',
              '校巴車牌': bus?.plateNumber || '',
              '司機': driver?.name || '',
              '保姆': nanny?.name || '',
              '站點順序': wpIdx + 1,
              '站點名稱': wp.location.name,
              '站點類型': wp.type === 'pickup' ? '上車' : '下車',
              '計劃時間': wp.scheduledTime,
              '實際時間': wp.actualTime || '',
              '學生編號': student.studentId,
              '學生姓名': student.name,
              '班別': student.classNumber,
              '上車時間': att?.boardingTime || '',
              '上車狀態': att?.boardingStatus ? boardingStatusLabel(att.boardingStatus) : '',
              '上車備註': att?.notes || '',
              '下車時間': att?.dropoffTime || '',
              '下車狀態': att?.dropoffStatus ? dropoffStatusLabel(att.dropoffStatus) : '',
              '家長姓名': parent?.name || '',
              '家長電話': parent?.phone || '',
            });
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '行程報表');

      // 統計摘要
      const summary: any[] = [];
      const studentStats = new Map<string, any>();

      trips.forEach(trip => {
        const attendances = STORAGE.attendances.getByTrip(trip.id);
        // 只統計上車站點的紀錄。
        // 下車站點也會產生 attendance 記錄 (dropoff 側), 且其 boardingStatus
        // 預設為 'on_time' —— 若一併計入, 會令「已上車」灌水、出席率虛高。
        const pickupWpIds = new Set(
          trip.waypoints.filter(w => w.type === 'pickup').map(w => w.id)
        );

        trip.studentIds.forEach(sid => {
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
          stat['總班次']++;
          const tripAtts = attendances.filter(
            a => a.studentId === sid && pickupWpIds.has(a.waypointId)
          );
          tripAtts.forEach(att => {
            if (att.boardingStatus === 'on_time') stat['已上車']++;
            if (att.boardingStatus === 'late') stat['遲到']++;
            if (att.boardingStatus === 'no_show') stat['未上車']++;
            if (att.boardingStatus === 'absent') stat['缺席']++;
          });
        });
      });

      studentStats.forEach(stat => {
        const total = stat['總班次'];
        const present = stat['已上車'] + stat['遲到'];
        stat['出席率'] = total > 0 ? `${Math.round((present / total) * 100)}%` : '0%';
      });

      const ws2 = XLSX.utils.json_to_sheet(Array.from(studentStats.values()));
      XLSX.utils.book_append_sheet(wb, ws2, '學生出席統計');

      // 付款記錄 — 有資料才加一個 sheet (避免空白 sheet 混淆)
      if (filteredPayments.length > 0) {
        const paymentRows = filteredPayments.map(p => ({
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

      XLSX.writeFile(wb, `CloudBusLink_行程報表_${dateFrom}_${dateTo}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  // 付款記錄統計
  const paymentStats = useMemo(() => {
    const total = filteredPayments.length;
    const paid = filteredPayments.filter((p) => p.status === 'paid').length;
    const pending = filteredPayments.filter((p) => p.status === 'pending').length;
    const overdue = filteredPayments.filter((p) => p.status === 'overdue').length;
    const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const paidAmount = filteredPayments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);
    return { total, paid, pending, overdue, totalAmount, paidAmount };
  }, [filteredPayments]);

  const hasPaymentSelection = selectedPaymentIds.length > 0;

  // 所有 hooks 行完先 early return, 否則違反 rules-of-hooks (build 會 fail)
  if (!user) return null;

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* 篩選 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>開始日期</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>結束日期</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>校巴</Label>
            <Select value={busFilter} onChange={(e) => setBusFilter(e.target.value)}>
              <option value="">全部校巴</option>
              {buses.map(b => (
                <option key={b.id} value={b.id}>{b.plateNumber}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>狀態</Label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">全部狀態</option>
              <option value="scheduled">待開始</option>
              <option value="in_progress">進行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 統計卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">班次總數</p>
            <p className="text-2xl font-bold text-primary">{trips.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">已完成</p>
            <p className="text-2xl font-bold text-success">
              {trips.filter(t => t.status === 'completed').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">學生總數</p>
            <p className="text-2xl font-bold text-warning">
              {new Set(trips.flatMap(t => t.studentIds)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 匯出按鈕 */}
      <Button
        onClick={exportToExcel}
        disabled={trips.length === 0 || exporting}
        className="w-full h-12"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-4 h-4" />
        )}
        匯出 Excel 報表 ({trips.length} 班次)
      </Button>

      {/* ==================== 班次預覽 (Data Table) ==================== */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Receipt className="w-4 h-4" />
          班次預覽
        </h3>
        <DataTable
          columns={tripColumns}
          data={trips}
          selectedRowIds={selectedIds}
          onSelectedRowIdsChange={setSelectedIds}
          empty={
            <Empty className="border-0 bg-transparent py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>所選範圍內沒有班次記錄</EmptyTitle>
                <EmptyDescription>
                  試試調整日期範圍或篩選條件, 再查看一次。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </div>

      {/* ==================== 付款記錄 (Data Table + 多選動作) ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Wallet className="w-4 h-4" />
            付款記錄
          </h3>
          <div className="flex items-center gap-2">
            <Select
              value={paymentPeriodFilter}
              onChange={(e) => setPaymentPeriodFilter(e.target.value)}
            >
              <option value="">全部期數</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
            >
              <option value="">全部狀態</option>
              <option value="pending">未付</option>
              <option value="paid">已付</option>
              <option value="overdue">逾期</option>
              <option value="cancelled">已取消</option>
            </Select>
          </div>
        </div>

        {/* 付款統計 */}
        <div className="grid grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">總筆數</p>
              <p className="text-lg font-bold text-primary">{paymentStats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">已付</p>
              <p className="text-lg font-bold text-success">{paymentStats.paid}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">未付</p>
              <p className="text-lg font-bold text-warning">{paymentStats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">總金額</p>
              <p className="text-lg font-bold tabular-nums">
                ${paymentStats.totalAmount.toLocaleString('zh-HK')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 多選批次動作列 */}
        {hasPaymentSelection && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-primary mr-auto">
                已選 {selectedPaymentIds.length} 筆
              </span>
              <Button size="sm" variant="success" onClick={handleBulkMarkPaid}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                標記已付
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkCancel}>
                <XCircle className="w-3.5 h-3.5" />
                取消
              </Button>
              <Button size="sm" onClick={handleSendPaymentNotice}>
                <Send className="w-3.5 h-3.5" />
                發送繳費通知
              </Button>
            </CardContent>
          </Card>
        )}

        <DataTable
          columns={paymentColumns}
          data={filteredPayments}
          selectedRowIds={selectedPaymentIds}
          onSelectedRowIdsChange={setSelectedPaymentIds}
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
                    : '試試調整期數或狀態篩選條件, 再查看一次。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </div>

      <p className="text-[10px] text-muted-foreground text-center pt-2">
        報表包含: 行程詳細記錄 + 學生出席統計 + 付款記錄
      </p>
    </div>
  );
}
