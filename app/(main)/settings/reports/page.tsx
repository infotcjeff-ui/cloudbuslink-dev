'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Calendar, Filter, Loader2, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { fmtDate, boardingStatusLabel, dropoffStatusLabel, today } from '@/lib/utils';
import type { Trip, Bus, Student, Driver, Nanny, Attendance, Parent } from '@/lib/types';

export default function ReportsPage() {
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [busFilter, setBusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const all = STORAGE.trips.getByClient(user.clientId || '');
    const filtered = all.filter(t => {
      if (t.date < dateFrom || t.date > dateTo) return false;
      if (busFilter && t.busId !== busFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date));
    setTrips(filtered);
  }, [user, dateFrom, dateTo, busFilter, statusFilter]);

  if (!user) return null;

  const buses = STORAGE.buses.getByClient(user.clientId || '');

  // 匯出 Excel
  const exportToExcel = () => {
    if (trips.length === 0) return;
    setExporting(true);

    try {
      // 行程報表 - 詳細數據
      const rows: any[] = [];
      const settings = STORAGE.settings.getByClient(user.clientId || '');

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

      XLSX.writeFile(wb, `CloudBusLink_行程報表_${dateFrom}_${dateTo}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

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

      {/* 班次列表預覽 */}
      {trips.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">班次預覽</h3>
            </div>
            <div className="divide-y">
              {trips.map(t => {
                const bus = STORAGE.buses.getById(t.busId);
                return (
                  <div key={t.id} className="p-3 flex items-center gap-3">
                    <div className="w-12 text-center">
                      <p className="text-xs text-muted-foreground">{t.date.slice(5)}</p>
                      <p className="text-sm font-bold">{t.plannedStartTime}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{bus?.plateNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.studentIds.length} 學生 · {t.waypoints.length} 站點
                      </p>
                    </div>
                    <Badge variant={
                      t.status === 'completed' ? 'success' :
                      t.status === 'in_progress' ? 'warning' :
                      t.status === 'cancelled' ? 'destructive' : 'secondary'
                    }>
                      {t.status === 'completed' ? '完成' :
                       t.status === 'in_progress' ? '進行中' :
                       t.status === 'cancelled' ? '取消' : '待開始'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {trips.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <FileSpreadsheet className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">所選範圍內沒有班次記錄</p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center pt-2">
        報表包含: 行程詳細記錄 + 學生出席統計
      </p>
    </div>
  );
}
