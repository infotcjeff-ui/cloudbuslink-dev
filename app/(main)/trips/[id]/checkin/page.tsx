'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Check, X, Clock, AlertCircle, MapPin, ChevronLeft, ChevronRight,
  StickyNote, Phone, Undo2, Users, Flag, CircleDot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MotionList } from '@/components/trips/motion-list';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import { getResumeWaypointIndex } from '@/lib/nanny-trips';
import {
  cn, currentTimeStamp, fmtTime, isLate, waypointTypeLabel,
} from '@/lib/utils';
import { DUR, EASE_OUT_QUART } from '@/lib/motion';
import type {
  Trip, Waypoint, Attendance, BoardingStatus, DropoffStatus,
} from '@/lib/types';

type CheckinMode = 'boarding' | 'dropoff';

export default function CheckinPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [currentWaypointIdx, setCurrentWaypointIdx] = useState(0);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [noteDialog, setNoteDialog] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [finishConfirm, setFinishConfirm] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    const found = STORAGE.trips.getById(params.id as string);
    if (found) {
      // 自動開始班次 (如果未開始)
      if (found.status === 'scheduled') {
        STORAGE.trips.update(found.id, {
          status: 'in_progress',
          actualStartTime: currentTimeStamp(),
        });
        const started = { ...found, status: 'in_progress' as const, actualStartTime: currentTimeStamp() };
        setTrip(started);
        // 恢復步驟: 直接跳到第一個未完成的站點 (已完成上車 → 直接到下一站)
        setCurrentWaypointIdx(getResumeWaypointIndex(started));
      } else {
        setTrip(found);
        // 恢復步驟: 直接跳到第一個未完成的站點 (已完成上車 → 直接到下一站)
        setCurrentWaypointIdx(getResumeWaypointIndex(found));
      }
      // 載入現有打卡記錄
      setAttendances(STORAGE.attendances.getByTrip(found.id));
    }
  }, [params.id]);

  const currentWaypoint = trip?.waypoints[currentWaypointIdx];
  const mode: CheckinMode = currentWaypoint?.type === 'pickup' ? 'boarding' : 'dropoff';

  const refreshAttendances = (tripId: string) => {
    setAttendances(STORAGE.attendances.getByTrip(tripId));
    window.dispatchEvent(new CustomEvent('cbl-attendance-refresh'));
  };

  // 打卡寫入雲端 (背景, 不阻擋 UI — bug 3: 只寫 localStorage 會被下次 sync 蓋掉)
  const pushAttendanceToCloud = (attendance: Attendance) => {
    void (async () => {
      try {
        const { supabaseAttendances } = await import('@/lib/supabase-attendances');
        const res = await supabaseAttendances.upsert(attendance as unknown as Parameters<typeof supabaseAttendances.upsert>[0]);
        if (!res.success) console.warn('[Checkin] attendance push failed:', res.error);
      } catch (e) {
        console.warn('[Checkin] attendance push failed:', e);
      }
    })();
  };

  // 站點完成 / 班次完成也要推雲端 (否則 waypoint status 只存本機, listing 進度永遠 0)
  const pushTripToCloud = (tripId: string) => {
    void (async () => {
      try {
        const updated = STORAGE.trips.getById(tripId);
        if (!updated) return;
        const { supabaseTrips } = await import('@/lib/supabase-trips');
        const res = await supabaseTrips.update(tripId, {
          waypoints: updated.waypoints,
          completedStops: updated.completedStops,
          status: updated.status,
          actualStartTime: updated.actualStartTime,
          actualEndTime: updated.actualEndTime,
        } as unknown as Parameters<typeof supabaseTrips.update>[1]);
        if (!res.success) console.warn('[Checkin] trip push failed:', res.error);
      } catch (e) {
        console.warn('[Checkin] trip push failed:', e);
      }
    })();
  };

  // 標記學生狀態
  const setStudentStatus = (studentId: string, status: BoardingStatus | DropoffStatus) => {
    if (!trip || !currentWaypoint || !user) return;

    const existing = attendances.find(
      a => a.tripId === trip.id && a.studentId === studentId && a.waypointId === currentWaypoint.id
    );

    const now = currentTimeStamp();
    const isLate_ = mode === 'boarding' ? isLate(currentWaypoint.scheduledTime, now) : false;

    let attendance: Attendance;

    if (mode === 'boarding') {
      const boardingStatus: BoardingStatus =
        status === 'on_time' ? (isLate_ ? 'late' : 'on_time') :
        status as BoardingStatus;

      // no_show / absent 代表學生沒有上車, 不應該記錄打卡時間。
      // 若照樣寫入 boardingTime, UI 的完成判定 (!!att.boardingTime) 會把
      // 缺席的學生顯示成綠色勾並計入 boardedCount, 家長與報表都會誤以為正常。
      const didBoard = boardingStatus !== 'no_show' && boardingStatus !== 'absent';

      attendance = {
        id: existing?.id || STORAGE.genId('att'),
        tripId: trip.id,
        studentId,
        waypointId: currentWaypoint.id,
        boardingTime: didBoard ? now : null,
        boardingStatus,
        // 沿用既有照片, 不要清空 (upsert 是完整覆蓋, 寫死 null 會掉資料)
        boardingPhoto: existing?.boardingPhoto ?? null,
        boardedBy: user.id,
        dropoffTime: null,
        dropoffStatus: null,
        dropoffPhoto: null,
        dropoffBy: null,
        notes: existing?.notes || null,
        isConfirmed: existing?.isConfirmed ?? false,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (didBoard) navigator.vibrate?.(10);
    } else {
      // 下車: 沿用上車階段已寫入的欄位, 只補 dropoff 側。
      // 下車站點對應的 attendance 與上車站點不同 (waypointId 不同),
      // 因此這裡通常是新建, existing 為 null。
      const didDrop = status !== 'no_show';

      attendance = {
        id: existing?.id || STORAGE.genId('att'),
        tripId: trip.id,
        studentId,
        waypointId: currentWaypoint.id,
        boardingTime: existing?.boardingTime || null,
        boardingStatus: existing?.boardingStatus || 'on_time',
        boardingPhoto: existing?.boardingPhoto ?? null,
        boardedBy: existing?.boardedBy || user.id,
        dropoffTime: didDrop ? now : null,
        dropoffStatus: status as DropoffStatus,
        dropoffPhoto: existing?.dropoffPhoto ?? null,
        dropoffBy: user.id,
        notes: existing?.notes || null,
        isConfirmed: existing?.isConfirmed ?? false,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (didDrop) navigator.vibrate?.(10);
    }

    STORAGE.attendances.upsert(attendance);
    pushAttendanceToCloud(attendance);
    refreshAttendances(trip.id);
  };

  // 復原單一學生的本站結論 (誤觸時點一下復原)
  const clearStudentStatus = (studentId: string) => {
    if (!trip || !currentWaypoint) return;
    const all = STORAGE.attendances.getAll().filter(
      a => !(a.tripId === trip.id && a.studentId === studentId && a.waypointId === currentWaypoint.id)
    );
    STORAGE.attendances.setAll(all);
    refreshAttendances(trip.id);
  };

  // 全部標記為上車 (快捷)
  const markAllBoarded = () => {
    if (!trip || !currentWaypoint) return;
    currentWaypoint.studentIds.forEach(sid => {
      const existing = attendances.find(
        a => a.tripId === trip.id && a.studentId === sid && a.waypointId === currentWaypoint.id
      );
      // 已標記缺席的學生不要再被覆蓋成 on_time
      const alreadyAbsent =
        existing?.boardingStatus === 'no_show' || existing?.boardingStatus === 'absent';
      if ((!existing || !existing.boardingTime) && !alreadyAbsent) {
        setStudentStatus(sid, 'on_time');
      }
    });
  };

  // 完成當前站點 (非尾站直接完成並跳轉; 尾站先彈中置確認)
  const completeWaypoint = () => {
    if (!trip || !currentWaypoint) return;
    if (currentWaypointIdx < trip.waypoints.length - 1) {
      STORAGE.trips.update(trip.id, {
        waypoints: trip.waypoints.map((wp, i) =>
          i === currentWaypointIdx
            ? { ...wp, status: 'completed', actualTime: currentTimeStamp() }
            : wp
        ) as Waypoint[],
        completedStops: [...trip.completedStops, currentWaypoint.id],
      });
      pushTripToCloud(trip.id);
      const updated = STORAGE.trips.getById(trip.id);
      if (updated) setTrip(updated);
      setCurrentWaypointIdx(currentWaypointIdx + 1);
    } else {
      setFinishConfirm(true);
    }
  };

  const confirmFinishTrip = () => {
    if (!trip || !currentWaypoint) return;
    STORAGE.trips.update(trip.id, {
      waypoints: trip.waypoints.map((wp, i) =>
        i === currentWaypointIdx
          ? { ...wp, status: 'completed', actualTime: currentTimeStamp() }
          : wp
      ) as Waypoint[],
      completedStops: [...trip.completedStops, currentWaypoint.id],
      status: 'completed',
      actualEndTime: currentTimeStamp(),
    });
    pushTripToCloud(trip.id);
    setFinishConfirm(false);
    // 完成班次 → 保姆回到「我的班次」; 其他角色回到班次詳情
    if (user?.role === 'nanny') {
      router.push('/nanny');
    } else {
      router.push(`/trips/${trip.id}`);
    }
  };

  const goPrevWaypoint = () => {
    if (currentWaypointIdx > 0) {
      setCurrentWaypointIdx(currentWaypointIdx - 1);
    }
  };

  const goNextWaypoint = () => {
    if (trip && currentWaypointIdx < trip.waypoints.length - 1) {
      setCurrentWaypointIdx(currentWaypointIdx + 1);
    }
  };

  const stats = useMemo(() => {
    if (!trip || !currentWaypoint) return { boarded: 0, absent: 0, total: 0, pending: 0 };
    let boarded = 0;
    let absent = 0;
    currentWaypoint.studentIds.forEach(sid => {
      const att = attendances.find(
        a => a.tripId === trip.id && a.studentId === sid && a.waypointId === currentWaypoint.id
      );
      const done = mode === 'boarding' ? !!att?.boardingTime : !!att?.dropoffTime;
      const s = mode === 'boarding' ? att?.boardingStatus : att?.dropoffStatus;
      if (done) boarded++;
      else if (s === 'no_show' || s === 'absent') absent++;
    });
    const total = currentWaypoint.studentIds.length;
    return { boarded, absent, total, pending: total - boarded - absent };
  }, [attendances, trip, currentWaypoint, mode]);

  if (!trip || !currentWaypoint) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        載入中...
      </div>
    );
  }

  const isLast = currentWaypointIdx === trip.waypoints.length - 1;
  const typePill = currentWaypoint.type === 'pickup'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-blue-100 text-blue-700';

  // 站點類型 → 視覺主題色 (上車 = 琥珀, 下車 = 藍)
  const theme = currentWaypoint.type === 'pickup'
    ? { ring: 'ring-amber-500/20', bar: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700' }
    : { ring: 'ring-blue-500/20', bar: 'bg-blue-500', soft: 'bg-blue-50 text-blue-700' };

  return (
    <div className="px-3 pt-3 pb-28">
      {/* 站點進度 — 與班次列表 TripCard 同一語言 */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE_OUT_QUART }}
        className={cn('rounded-2xl p-3 bg-card border border-border/50 shadow-sm mb-2 ring-1', theme.ring)}
      >
        {/* 站點編號 + 類型 + 人數 */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', typePill)}>
              {waypointTypeLabel(currentWaypoint.type)}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              站點 {currentWaypointIdx + 1}/{trip.waypoints.length}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Users className="w-3 h-3" />
            <span className="tabular-nums font-semibold text-foreground">
              {stats.boarded + stats.absent}/{stats.total}
            </span>
            {stats.absent > 0 && (
              <span className="text-[10px] text-destructive">· 缺席 {stats.absent}</span>
            )}
          </div>
        </div>

        {/* 站點名稱 */}
        <div className="flex items-start gap-2">
          <CircleDot className={cn('w-5 h-5 mt-0.5 flex-shrink-0', currentWaypoint.type === 'pickup' ? 'text-amber-500' : 'text-blue-500')} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight leading-tight">
              {currentWaypoint.location.name}
            </h1>
            {currentWaypoint.location.address && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{currentWaypoint.location.address}</span>
              </p>
            )}
          </div>
        </div>

        {/* 計劃 / 實際時間 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 pl-7">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span className="tabular-nums">計劃 {fmtTime(currentWaypoint.scheduledTime)}</span>
          {currentWaypoint.actualTime && (
            <span className="tabular-nums text-success">· 實際 {fmtTime(currentWaypoint.actualTime)}</span>
          )}
        </div>

        {/* 站點切換 — 與 DatePillRow 同一手感 */}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={goPrevWaypoint}
            disabled={currentWaypointIdx === 0}
            aria-label="上一站"
            className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex gap-1">
            {trip.waypoints.map((wp, i) => (
              <button
                key={wp.id}
                type="button"
                onClick={() => setCurrentWaypointIdx(i)}
                aria-label={`前往站點 ${i + 1}`}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i < currentWaypointIdx ? 'bg-success' :
                  i === currentWaypointIdx ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={goNextWaypoint}
            disabled={isLast}
            aria-label="下一站"
            className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* 快速操作 */}
      {mode === 'boarding' && stats.pending > 0 && (
        <Button
          onClick={markAllBoarded}
          variant="outline"
          className="w-full mb-2 h-11 rounded-full text-sm active:scale-[0.98]"
        >
          <Check className="w-4 h-4" />
          全部標記為已上車 ({stats.pending} 位)
        </Button>
      )}

      {/* 學生列表 — MotionList stagger, 與班次列表同一進場 */}
      <MotionList
        items={currentWaypoint.studentIds}
        getKey={(sid) => `${currentWaypoint.id}-${sid}`}
        className="space-y-2"
        renderItem={(sid) => {
          const student = STORAGE.students.getById(sid);
          if (!student) return null;
          const att = attendances.find(
            a => a.tripId === trip.id && a.studentId === sid && a.waypointId === currentWaypoint.id
          );
          const status = mode === 'boarding' ? att?.boardingStatus : att?.dropoffStatus;
          const time = mode === 'boarding' ? att?.boardingTime : att?.dropoffTime;
          // handled: 這位學生在本站已經有結論 (打卡成功 或 已標記缺席)。
          // done: 真正有上/下車時間。
          // 兩者分開, 否則缺席的學生會被畫成綠色勾, 家長與報表都誤以為正常。
          const done = mode === 'boarding' ? !!att?.boardingTime : !!att?.dropoffTime;
          const handled = !!att && (done || status === 'no_show' || status === 'absent');

          return (
            <StudentCheckinRow
              studentName={student.name}
              classNumber={student.classNumber}
              studentId={student.studentId}
              parentPhone={student.parentIds[0] ? STORAGE.parents.getById(student.parentIds[0])?.phone : null}
              done={done}
              handled={handled}
              status={status}
              time={time}
              mode={mode}
              notes={att?.notes || null}
              onBoarded={() => setStudentStatus(sid, 'on_time')}
              onNoShow={() => setStudentStatus(sid, 'no_show')}
              onLate={() => setStudentStatus(sid, 'late')}
              onUndo={() => clearStudentStatus(sid)}
              onAddNote={() => {
                setNoteDialog(sid);
                setNoteText(att?.notes || '');
              }}
            />
          );
        }}
      />

      {/* 底部操作 — 與底部 menu 同款 (floating liquid-glass pill) */}
      <div className="fixed bottom-3 left-0 right-0 z-40 safe-bottom pointer-events-none">
        <div className="mx-auto max-w-[85vw] liquid-glass rounded-2xl shadow-lg p-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <Button
              onClick={goPrevWaypoint}
              variant="ghost"
              disabled={currentWaypointIdx === 0}
              aria-label="上一站"
              className="h-12 w-12 rounded-xl active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              onClick={completeWaypoint}
              className="flex-1 h-12 rounded-xl bg-success text-success-foreground text-[15px] font-semibold active:scale-[0.98]"
            >
              <Flag className="w-4 h-4" />
              {isLast
                ? `完成班次 (${stats.boarded + stats.absent}/${stats.total})`
                : `完成${waypointTypeLabel(currentWaypoint.type)} (${stats.boarded + stats.absent}/${stats.total})`}
            </Button>
            <Button
              onClick={goNextWaypoint}
              variant="ghost"
              disabled={isLast}
              aria-label="下一站"
              className="h-12 w-12 rounded-xl active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* 尾站完成 — 中置確認 (取代原生 confirm) */}
      <ConfirmDialog
        open={finishConfirm}
        onOpenChange={setFinishConfirm}
        title="所有站點已完成"
        description={`是否結束本次班次? 已處理 ${stats.boarded + stats.absent}/${stats.total} 位學生。`}
        confirmLabel="確定結束"
        tone="success"
        onConfirm={confirmFinishTrip}
      />

      {/* 備註 — 用現有 Drawer (手機規範), 取代手寫 bottom-sheet */}
      <Drawer open={noteDialog !== null} onOpenChange={(open) => { if (!open) setNoteDialog(null); }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>添加備註</DrawerTitle>
            <DrawerDescription>例: 學生請假 / 交通意外改道 / 其他...</DrawerDescription>
          </DrawerHeader>
          <div className="px-5">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="輸入備註..."
              className="min-h-[100px]"
            />
          </div>
          <DrawerFooter>
            <Button
              variant="outline"
              onClick={() => setNoteDialog(null)}
              className="flex-1 h-11 rounded-xl active:scale-95"
            >
              取消
            </Button>
            <Button
              onClick={() => {
                if (!trip || !currentWaypoint || !noteDialog) return;
                const existing = attendances.find(
                  a => a.tripId === trip.id && a.studentId === noteDialog && a.waypointId === currentWaypoint.id
                );
                const updated: Attendance = existing || {
                  id: STORAGE.genId('att'),
                  tripId: trip.id,
                  studentId: noteDialog,
                  waypointId: currentWaypoint.id,
                  boardingTime: null,
                  boardingStatus: 'on_time',
                  boardingPhoto: null,
                  boardedBy: user?.id || '',
                  dropoffTime: null,
                  dropoffStatus: null,
                  dropoffPhoto: null,
                  dropoffBy: null,
                  notes: null,
                  isConfirmed: false,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                STORAGE.attendances.upsert({
                  ...updated,
                  notes: noteText || null,
                });
                refreshAttendances(trip.id);
                setNoteDialog(null);
              }}
              className="flex-1 h-11 rounded-xl active:scale-95"
            >
              保存
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function StudentCheckinRow({
  studentName, classNumber, studentId, parentPhone,
  done, handled, status, time, mode, notes,
  onBoarded, onNoShow, onLate, onUndo, onAddNote,
}: {
  studentName: string;
  classNumber: string;
  studentId: string;
  parentPhone: string | null | undefined;
  done: boolean;
  handled: boolean;
  status: BoardingStatus | DropoffStatus | null | undefined;
  time: string | null | undefined;
  mode: CheckinMode;
  notes: string | null;
  onBoarded: () => void;
  onNoShow: () => void;
  onLate: () => void;
  onUndo: () => void;
  onAddNote: () => void;
}) {
  // statusLabel / 視覺樣式依結果分流:
  // - done=true  → 綠底綠勾 (準時/遲到的正常上落車)
  // - handled 但未打卡 → 紅底紅叉 (缺席 / 未下車), 讓一眼看出異常
  const statusLabel = status === 'late' ? '遲到'
    : status === 'no_show' ? (mode === 'boarding' ? '缺席' : '未下車')
    : status === 'absent' ? '缺席'
    : done ? (mode === 'boarding' ? '已上車' : '已下車')
    : null;

  const actionLabel = mode === 'boarding' ? '已上車' : '已下車';
  const absentLabel = mode === 'boarding' ? '缺席' : '未下車';

  return (
    <div
      className={cn(
        'w-full text-left rounded-2xl p-3 bg-card border border-border/50 shadow-sm transition-colors',
        done && 'border-success/40 bg-success/[0.04]',
        !done && handled && 'border-destructive/40 bg-destructive/[0.04]',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0',
          done ? 'bg-success text-success-foreground'
            : handled ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary/10 text-primary'
        )}>
          {done ? <Check className="w-4 h-4" strokeWidth={3} />
            : handled ? <X className="w-4 h-4" strokeWidth={3} />
            : studentName.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-semibold truncate">{studentName}</p>
            {done && time && (
              <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                {fmtTime(time)}
              </span>
            )}
            {handled && !done && statusLabel && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex-shrink-0">
                {statusLabel}
              </span>
            )}
            {done && status === 'late' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning flex-shrink-0">
                遲到
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{classNumber} · {studentId}</p>
        </div>
        {parentPhone && (
          <a
            href={`tel:${parentPhone}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`致電家長 ${studentName}`}
            className="p-2 rounded-full bg-success/10 text-success active:scale-95 transition-transform flex-shrink-0"
          >
            <Phone className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {!handled && (
        <div className={cn('grid gap-1.5 mt-2.5', mode === 'boarding' ? 'grid-cols-3' : 'grid-cols-2')}>
          <Button
            onClick={onBoarded}
            size="sm"
            className="h-11 rounded-xl bg-success text-success-foreground text-[13px] active:scale-95"
          >
            <Check className="w-4 h-4" strokeWidth={3} />
            {actionLabel}
          </Button>
          {mode === 'boarding' && (
            <Button
              onClick={onLate}
              size="sm"
              variant="outline"
              className="h-11 rounded-xl text-warning border-warning/40 text-[13px] active:scale-95"
            >
              <Clock className="w-4 h-4" />
              遲到
            </Button>
          )}
          <Button
            onClick={onNoShow}
            size="sm"
            variant="outline"
            className="h-11 rounded-xl text-destructive border-destructive/40 text-[13px] active:scale-95"
          >
            <X className="w-4 h-4" />
            {absentLabel}
          </Button>
        </div>
      )}

      {handled && (
        <button
          type="button"
          onClick={onUndo}
          className="mt-2 w-full h-8 rounded-full bg-muted/60 text-xs text-muted-foreground flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
        >
          <Undo2 className="w-3 h-3" />
          {statusLabel} · 點一下復原
        </button>
      )}

      {notes && (
        <div className="mt-2 text-xs text-warning bg-warning/10 rounded-lg px-2 py-1.5 flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{notes}</span>
        </div>
      )}

      <button
        onClick={onAddNote}
        className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1 active:opacity-60"
      >
        <StickyNote className="w-3 h-3" />
        {notes ? '編輯備註' : '添加備註'}
      </button>
    </div>
  );
}
