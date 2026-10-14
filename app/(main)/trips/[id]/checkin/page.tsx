'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, Clock, AlertCircle, MapPin, ChevronLeft, ChevronRight,
  Camera, StickyNote, CheckCircle2, Loader2, Save, Phone
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import {
  cn, currentTimeStamp, fmtTime, isLate, waypointTypeLabel
} from '@/lib/utils';
import type {
  Trip, Waypoint, Attendance, BoardingStatus, DropoffStatus
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
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!params.id) return;
    const found = STORAGE.trips.getById(params.id as string);
    if (found) {
      setTrip(found);
      // 自動開始班次 (如果未開始)
      if (found.status === 'scheduled') {
        STORAGE.trips.update(found.id, {
          status: 'in_progress',
          actualStartTime: currentTimeStamp(),
        });
        setTrip({ ...found, status: 'in_progress', actualStartTime: currentTimeStamp() });
      }
      // 載入現有打卡記錄
      setAttendances(STORAGE.attendances.getByTrip(found.id));
    }
  }, [params.id]);

  // 每秒更新
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const currentWaypoint = trip?.waypoints[currentWaypointIdx];
  const mode: CheckinMode = currentWaypoint?.type === 'pickup' ? 'boarding' : 'dropoff';

  // 獲取或創建打卡記錄
  const getOrCreateAttendance = (studentId: string): Attendance | null => {
    if (!trip || !currentWaypoint) return null;
    const existing = attendances.find(
      a => a.tripId === trip.id && a.studentId === studentId && a.waypointId === currentWaypoint.id
    );
    return existing || null;
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
    }

    STORAGE.attendances.upsert(attendance);
    setAttendances(STORAGE.attendances.getByTrip(trip.id));
  };

  // 全部標記為上車 (快捷)
  const markAllBoarded = () => {
    if (!currentWaypoint) return;
    currentWaypoint.studentIds.forEach(sid => {
      const existing = getOrCreateAttendance(sid);
      // 已標記缺席的學生不要再被覆蓋成 on_time
      const alreadyAbsent =
        existing?.boardingStatus === 'no_show' || existing?.boardingStatus === 'absent';
      if ((!existing || !existing.boardingTime) && !alreadyAbsent) {
        setStudentStatus(sid, 'on_time');
      }
    });
  };

  // 完成當前站點
  const completeWaypoint = () => {
    if (!trip || !currentWaypoint) return;
    STORAGE.trips.update(trip.id, {
      waypoints: trip.waypoints.map((wp, i) =>
        i === currentWaypointIdx
          ? { ...wp, status: 'completed', actualTime: currentTimeStamp() }
          : wp
      ) as Waypoint[],
      completedStops: [...trip.completedStops, currentWaypoint.id],
    });
    const updated = STORAGE.trips.getById(trip.id);
    if (updated) setTrip(updated);

    // 自動跳到下一站
    if (currentWaypointIdx < trip.waypoints.length - 1) {
      setCurrentWaypointIdx(currentWaypointIdx + 1);
    } else {
      // 全部完成
      if (confirm('所有站點已完成, 是否結束班次?')) {
        STORAGE.trips.update(trip.id, {
          status: 'completed',
          actualEndTime: currentTimeStamp(),
        });
        router.push(`/trips/${trip.id}`);
      }
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

  if (!trip || !currentWaypoint) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        載入中...
      </div>
    );
  }

  // 只計真正有上/下車時間的學生 (no_show 的 boardingTime 為 null, 自然被排除)
  const boardedCount = currentWaypoint.studentIds.filter(sid => {
    const att = attendances.find(a => a.tripId === trip.id && a.studentId === sid && a.waypointId === currentWaypoint.id);
    return mode === 'boarding' ? !!att?.boardingTime : !!att?.dropoffTime;
  }).length;

  // 缺席人數, 讓底部按鈕文案不會顯示 0/2 而實際有 2 人缺席
  const absentCount = currentWaypoint.studentIds.filter(sid => {
    const att = attendances.find(a => a.tripId === trip.id && a.studentId === sid && a.waypointId === currentWaypoint.id);
    const s = mode === 'boarding' ? att?.boardingStatus : att?.dropoffStatus;
    return s === 'no_show' || s === 'absent';
  }).length;

  return (
    <div className="px-4 pt-4 pb-24">
      {/* 站點進度 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">站點進度</p>
          <p className="text-xs text-muted-foreground">
            {currentWaypointIdx + 1} / {trip.waypoints.length}
          </p>
        </div>
        <div className="flex gap-1">
          {trip.waypoints.map((wp, i) => (
            <div
              key={wp.id}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < currentWaypointIdx ? 'bg-success' :
                i === currentWaypointIdx ? 'bg-primary animate-pulse-soft' :
                'bg-muted'
              )}
            />
          ))}
        </div>
      </div>

      {/* 當前站點資訊 */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <Badge variant={mode === 'boarding' ? 'default' : 'warning'} className="mb-2">
                {waypointTypeLabel(currentWaypoint.type)}
              </Badge>
              <h2 className="text-lg font-bold">{currentWaypoint.location.name}</h2>
              {currentWaypoint.location.address && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {currentWaypoint.location.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 text-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>計劃: {fmtTime(currentWaypoint.scheduledTime)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="font-semibold">
                {boardedCount} / {currentWaypoint.studentIds.length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 快速操作 */}
      {mode === 'boarding' && boardedCount + absentCount < currentWaypoint.studentIds.length && (
        <Button
          onClick={markAllBoarded}
          variant="outline"
          className="w-full mb-3 h-10"
        >
          <Check className="w-4 h-4" />
          全部標記為已上車 ({currentWaypoint.studentIds.length - boardedCount - absentCount} 位)
        </Button>
      )}

      {/* 學生列表 */}
      <div className="space-y-2">
        {currentWaypoint.studentIds.map(sid => {
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
            <StudentCheckinCard
              key={sid}
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
              onAddNote={() => {
                setNoteDialog(sid);
                setNoteText(att?.notes || '');
              }}
            />
          );
        })}
      </div>

      {/* 底部操作按鈕 */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30">
        <div className="bg-background/80 backdrop-blur-lg rounded-2xl p-3 border shadow-lg">
          <div className="flex gap-2">
            <Button
              onClick={goPrevWaypoint}
              variant="outline"
              size="icon"
              disabled={currentWaypointIdx === 0}
              className="h-12 w-12 flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              onClick={completeWaypoint}
              className="flex-1 h-12 bg-success"
            >
              <Check className="w-4 h-4" />
              完成 {waypointTypeLabel(currentWaypoint.type)} ({boardedCount}/{currentWaypoint.studentIds.length}
              {absentCount > 0 ? ` · 缺席 ${absentCount}` : ''})
            </Button>
            <Button
              onClick={goNextWaypoint}
              variant="outline"
              size="icon"
              disabled={currentWaypointIdx === trip.waypoints.length - 1}
              className="h-12 w-12 flex-shrink-0"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* 備註對話框 */}
      {noteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setNoteDialog(null)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            className="w-full max-w-md bg-background rounded-t-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
            <h3 className="font-bold mb-3">添加備註</h3>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="例: 學生請假 / 交通意外改道 / 其他..."
              className="min-h-[100px]"
            />
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setNoteDialog(null)}
                className="flex-1 h-11"
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
                  setAttendances(STORAGE.attendances.getByTrip(trip.id));
                  setNoteDialog(null);
                }}
                className="flex-1 h-11"
              >
                保存
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StudentCheckinCard({
  studentName, classNumber, studentId, parentPhone,
  done, handled, status, time, mode, notes,
  onBoarded, onNoShow, onLate, onAddNote
}: any) {
  // statusLabel / 視覺樣式依結果分流:
  // - done=true  → 綠底綠勾 (準時/遲到的正常上落車)
  // - handled 但未打卡 → 紅底紅叉 (缺席 / 未下車), 讓一眼看出異常
  const absent = status === 'no_show' || status === 'absent';
  const statusLabel = status === 'late' ? '遲到'
    : status === 'no_show' ? (mode === 'boarding' ? '缺席' : '未下車')
    : status === 'absent' ? '缺席'
    : done ? (mode === 'boarding' ? '已上車' : '已下車')
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className={cn(
        'transition-colors',
        done && 'border-success/50 bg-success/5',
        !done && handled && 'border-destructive/50 bg-destructive/5'
      )}>
        <CardContent className="p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0',
              done ? 'bg-success text-success-foreground'
                : handled ? 'bg-destructive text-destructive-foreground'
                : 'bg-muted text-muted-foreground'
            )}>
              {done ? <Check className="w-4 h-4" />
                : handled ? <X className="w-4 h-4" />
                : studentName.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{studentName}</p>
                {done && time && (
                  <span className="text-[10px] text-muted-foreground">{fmtTime(time)}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{classNumber} · {studentId}</p>
            </div>
            {parentPhone && (
              <a
                href={`tel:${parentPhone}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-full bg-success/10 text-success"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* 缺席/未下車 提示條 */}
          {handled && !done && statusLabel && (
            <div className={cn(
              'text-xs rounded-lg px-2 py-1.5 flex items-center gap-1',
              'text-destructive bg-destructive/10'
            )}>
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>{statusLabel}</span>
            </div>
          )}

          {/* 準時/遲到 提示條 */}
          {done && statusLabel && status === 'late' && (
            <div className="mt-2 text-xs text-warning bg-warning/10 rounded-lg px-2 py-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3 flex-shrink-0" />
              <span>遲到</span>
            </div>
          )}

          {!handled && mode === 'boarding' && (
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                onClick={onBoarded}
                size="sm"
                className="h-9 bg-success text-xs"
              >
                <Check className="w-3.5 h-3.5" />
                已上車
              </Button>
              <Button
                onClick={onLate}
                size="sm"
                variant="outline"
                className="h-9 text-warning border-warning text-xs"
              >
                <Clock className="w-3.5 h-3.5" />
                遲到
              </Button>
              <Button
                onClick={onNoShow}
                size="sm"
                variant="outline"
                className="h-9 text-destructive border-destructive text-xs"
              >
                <X className="w-3.5 h-3.5" />
                缺席
              </Button>
            </div>
          )}

          {!handled && mode === 'dropoff' && (
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                onClick={onBoarded}
                size="sm"
                className="h-9 bg-success text-xs"
              >
                <Check className="w-3.5 h-3.5" />
                已下車
              </Button>
              <Button
                onClick={onNoShow}
                size="sm"
                variant="outline"
                className="h-9 text-destructive border-destructive text-xs"
              >
                <X className="w-3.5 h-3.5" />
                未下車
              </Button>
            </div>
          )}

          {notes && (
            <div className="mt-2 text-xs text-warning bg-warning/10 rounded-lg px-2 py-1.5 flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{notes}</span>
            </div>
          )}

          <button
            onClick={onAddNote}
            className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1"
          >
            <StickyNote className="w-3 h-3" />
            {notes ? '編輯備註' : '添加備註'}
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
