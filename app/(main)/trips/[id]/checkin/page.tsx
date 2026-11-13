'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, Clock, MapPin, ChevronLeft, ChevronRight,
  Phone, Pencil, Undo2, Users, CircleDot, ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MotionList } from '@/components/trips/motion-list';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import { getResumeWaypointIndex } from '@/lib/nanny-trips';
import { nannyHomePath } from '@/lib/nanny-path';
import {
  cn, currentTimeStamp, fmtTime, isLate, waypointTypeLabel,
} from '@/lib/utils';
import { DUR, EASE_OUT_QUART, fadeItem } from '@/lib/motion';
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
  const [editDialogSid, setEditDialogSid] = useState<string | null>(null);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [markAllConfirm, setMarkAllConfirm] = useState(false);
  const [unmarkAllConfirm, setUnmarkAllConfirm] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  void syncTick;

  useEffect(() => {
    if (!params.id) return;
    const tripId = params.id as string;
    let cancelled = false;

    const load = () => {
      if (cancelled) return;
      const found = STORAGE.trips.getById(tripId);
      if (!found) return;
      // 自動開始班次 (如果未開始) — 只做一次, 避免同步回來後重複覆寫
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
        // 已在打卡中途切站時不強行跳轉 (避免同步回來把使用者踢回別站)
        setCurrentWaypointIdx((prev) => {
          // 初次載入 (prev=0 且該站已完成) 才跳; 否則保留使用者當前站
          const resume = getResumeWaypointIndex(found);
          return prev === 0 ? resume : prev;
        });
      }
      // 載入現有打卡記錄
      setAttendances(STORAGE.attendances.getByTrip(found.id));
      // 學生檔可能隨雲端同步稍後才到 → 觸發重繪讓名單出現
      setSyncTick((t) => t + 1);
    };

    load();

    // 主動從雲端拉一次 (核心修復):
    // 班次有 studentIds 但學生檔還沒同步 → 名單空白但人數正確。
    // 保姆手機 localStorage 可能是舊快照, 要 syncFromSupabase() 把學生拉回來。
    const doSync = async () => {
      try {
        const { isSupabaseAvailable, syncFromSupabase } = await import('@/lib/supabase-data');
        if (!isSupabaseAvailable()) return;
        await syncFromSupabase();
        load();
      } catch (e) {
        console.warn('[Checkin] cloud sync failed:', e);
      }
    };
    void doSync();

    // 雲端同步完成 / 後台改資料 → 重讀班次 + 學生 + 打卡
    const onRefresh = () => load();
    const events = [
      'cbl-trips-refresh',
      'cbl-students-refresh',
      'cbl-parents-refresh',
      'cbl-attendances-refresh',
      'cbl-buses-refresh',
      'cbl-routes-refresh',
    ];
    events.forEach((ev) => window.addEventListener(ev, onRefresh));
    return () => {
      cancelled = true;
      events.forEach((ev) => window.removeEventListener(ev, onRefresh));
    };
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

  // 復原單一學生的本站結論 (誤觸時點卡片取消)
  const deleteAttendanceFromCloud = (studentId: string) => {
    if (!trip || !currentWaypoint) return;
    const tripId = trip.id;
    const waypointId = currentWaypoint.id;
    void (async () => {
      try {
        const { supabaseAttendances } = await import('@/lib/supabase-attendances');
        const res = await supabaseAttendances.deleteByTripWaypointStudent(tripId, waypointId, studentId);
        if (!res.success) console.warn('[Checkin] attendance delete failed:', res.error);
      } catch (e) {
        console.warn('[Checkin] attendance delete failed:', e);
      }
    })();
  };

  const clearStudentStatus = (studentId: string) => {
    if (!trip || !currentWaypoint) return;
    const all = STORAGE.attendances.getAll().filter(
      a => !(a.tripId === trip.id && a.studentId === studentId && a.waypointId === currentWaypoint.id)
    );
    STORAGE.attendances.setAll(all);
    deleteAttendanceFromCloud(studentId);
    refreshAttendances(trip.id);
  };

  // 全部標記 (快捷) — 上車站標記已上車, 下車站標記已下車 — 先彈確認, 確定才執行
  const markAllBoarded = () => {
    if (!trip || !currentWaypoint) return;
    currentWaypoint.studentIds.forEach(sid => {
      const existing = attendances.find(
        a => a.tripId === trip.id && a.studentId === sid && a.waypointId === currentWaypoint.id
      );
      if (mode === 'boarding') {
        // 已標記缺席的學生不要再被覆蓋成 on_time
        const alreadyAbsent =
          existing?.boardingStatus === 'no_show' || existing?.boardingStatus === 'absent';
        if ((!existing || !existing.boardingTime) && !alreadyAbsent) {
          setStudentStatus(sid, 'on_time');
        }
      } else {
        // 下車站: 已標記未下車的不覆蓋
        const alreadyNoShow = existing?.dropoffStatus === 'no_show';
        if ((!existing || !existing.dropoffTime) && !alreadyNoShow) {
          setStudentStatus(sid, 'on_time');
        }
      }
    });
    setMarkAllConfirm(false);
  };

  // 全部清除 (快捷) — 清除本站所有學生的點名結論, 回到未點名 — 先彈確認, 確定才執行
  const unmarkAllBoarded = () => {
    if (!trip || !currentWaypoint) return;
    const all = STORAGE.attendances.getAll().filter(
      a => !(a.tripId === trip.id && a.waypointId === currentWaypoint.id)
    );
    STORAGE.attendances.setAll(all);
    const tripId = trip.id;
    const waypointId = currentWaypoint.id;
    void (async () => {
      try {
        const { supabaseAttendances } = await import('@/lib/supabase-attendances');
        const res = await supabaseAttendances.deleteByTripWaypoint(tripId, waypointId);
        if (!res.success) console.warn('[Checkin] attendance bulk delete failed:', res.error);
      } catch (e) {
        console.warn('[Checkin] attendance bulk delete failed:', e);
      }
    })();
    refreshAttendances(trip.id);
    setUnmarkAllConfirm(false);
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
    // 完成班次 → 保姆回到「我的班次」(個人化首頁, 如 /wendy/route); 其他角色回到班次詳情
    if (user?.role === 'nanny') {
      router.push(nannyHomePath(user));
    } else {
      router.push(`/trips/${trip.id}`);
    }
  };

  const isWaypointDone = (idx: number) => {
    if (!trip) return false;
    const wp = trip.waypoints[idx];
    if (!wp) return false;
    if (wp.status === 'completed') return true;
    if ((trip.completedStops ?? []).includes(wp.id)) return true;
    return false;
  };

  const goPrevWaypoint = () => {
    if (currentWaypointIdx > 0) {
      setCurrentWaypointIdx(currentWaypointIdx - 1);
    }
  };

  const goNextWaypoint = () => {
    if (!trip || currentWaypointIdx >= trip.waypoints.length - 1) return;
    // 未完成班次時, 必須先按「完成上車/下車」才可去下一步;
    // 班次完成後可自由查看
    if (trip.status !== 'completed' && !isWaypointDone(currentWaypointIdx)) return;
    setCurrentWaypointIdx(currentWaypointIdx + 1);
  };

  // 站點進度條跳轉 — 同樣受「完成才可下一步」限制
  const gotoWaypoint = (idx: number) => {
    if (!trip) return;
    if (idx === currentWaypointIdx) return;
    if (trip.status === 'completed') {
      setCurrentWaypointIdx(idx);
      return;
    }
    // 往回看永遠可以; 往前只可去緊貼的下一站, 且當前站必須已完成
    if (idx < currentWaypointIdx) {
      setCurrentWaypointIdx(idx);
      return;
    }
    if (idx === currentWaypointIdx + 1 && isWaypointDone(currentWaypointIdx)) {
      setCurrentWaypointIdx(idx);
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
  const tripDone = trip.status === 'completed';
  const currentDone = isWaypointDone(currentWaypointIdx);
  // 未完成班次: 必須按「完成上車/下車」先可去下一步; 班次完成後自由查看
  const canGoNext = !isLast && (tripDone || currentDone);
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

        {/* 站點切換 — arrow 只有整班完成後查看時才出現, 進度條常顯 */}
        <div className="flex items-center gap-2 mt-3">
          {tripDone && (
          <button
            type="button"
            onClick={goPrevWaypoint}
            disabled={currentWaypointIdx === 0}
            aria-label="上一站"
            className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          )}
          <div className="flex-1 flex gap-1">
            {trip.waypoints.map((wp, i) => {
              const reachable = tripDone || i <= currentWaypointIdx || (i === currentWaypointIdx + 1 && currentDone);
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => gotoWaypoint(i)}
                  disabled={!reachable}
                  aria-label={`前往站點 ${i + 1}`}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    i < currentWaypointIdx ? 'bg-success' :
                    i === currentWaypointIdx ? 'bg-primary' : 'bg-muted',
                    !reachable && 'opacity-40'
                  )}
                />
              );
            })}
          </div>
          {tripDone && (
          <button
            type="button"
            onClick={goNextWaypoint}
            disabled={!canGoNext}
            aria-label="下一站"
            className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          )}
        </div>
      </motion.div>

      {/* 快速操作 — 左右並排: 全部標記已上車/下車 + 全部標記未上車/下車 — 先彈確認, 確定才執行 */}
      {!tripDone && (stats.pending > 0 || stats.boarded + stats.absent > 0) && (
        <div className="flex gap-2 mb-2">
          {stats.pending > 0 && (
            <Button
              onClick={() => setMarkAllConfirm(true)}
              className="flex-1 h-11 rounded-full text-[13px] font-medium bg-primary text-primary-foreground active:scale-[0.98] px-2"
            >
              <Check className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">
                {mode === 'boarding'
                  ? `全部標記為已上車 (${stats.pending} 位)`
                  : `全部標記為已下車 (${stats.pending} 位)`}
              </span>
            </Button>
          )}
          {(stats.boarded + stats.absent) > 0 && (
            <Button
              onClick={() => setUnmarkAllConfirm(true)}
              variant="outline"
              className="flex-1 h-11 rounded-full text-[13px] font-medium active:scale-[0.98] px-2"
            >
              <X className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">
                {mode === 'boarding'
                  ? `全部標記為未上車 (${stats.boarded + stats.absent} 位)`
                  : `全部標記為未下車 (${stats.boarded + stats.absent} 位)`}
              </span>
            </Button>
          )}
        </div>
      )}

      {/* 點名學生 title */}
      <div className="flex items-center gap-1.5 px-1 mt-1 mb-2">
        <ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold text-muted-foreground">
          點名學生 · {stats.boarded + stats.absent}/{stats.total} 已處理
        </h2>
        {stats.pending > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            (尚餘 {stats.pending} 位)
          </span>
        )}
      </div>

      {/* 缺學生檔提示 — 班次有 studentIds 但本機學生表還沒同步到時顯示 */}
      {(() => {
        const missing = currentWaypoint.studentIds.filter(
          (sid) => !STORAGE.students.getById(sid),
        );
        if (missing.length === 0) return null;
        return (
          <div className="mx-0 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1">
              {missing.length} 位學生資料同步中… (班次已綁定, 學生檔未到本機) 請稍候或點重試。
            </span>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const { isSupabaseAvailable, syncFromSupabase } = await import('@/lib/supabase-data');
                    if (!isSupabaseAvailable()) return;
                    await syncFromSupabase();
                    const found = STORAGE.trips.getById(trip.id);
                    if (found) setTrip({ ...found });
                    setAttendances(STORAGE.attendances.getByTrip(trip.id));
                    setSyncTick((t) => t + 1);
                  } catch { /* ignore */ }
                })();
              }}
              className="shrink-0 px-2 py-1 rounded-full bg-amber-500 text-white text-[11px] font-semibold active:scale-95"
            >
              重試
            </button>
          </div>
        );
      })()}

      {/* 學生列表 — 純 fade, 無位移 / 無 layout, 狀態切換不變形 */}
      <MotionList
        items={currentWaypoint.studentIds}
        getKey={(sid) => `${currentWaypoint.id}-${sid}`}
        className="space-y-2"
        layout={false}
        itemVariants={fadeItem}
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
              readOnly={tripDone}
              onEdit={() => setEditDialogSid(sid)}
              onUndo={() => clearStudentStatus(sid)}
              onBoard={() => setStudentStatus(sid, 'on_time')}
            />
          );
        }}
      />

      {/* 狀態編輯 — 點卡片右上角鉛筆掣以 popup 打開 */}
      <StudentStatusDialog
        open={editDialogSid !== null}
        onOpenChange={(open) => { if (!open) setEditDialogSid(null); }}
        studentName={editDialogSid ? STORAGE.students.getById(editDialogSid)?.name ?? '' : ''}
        studentMeta={
          editDialogSid
            ? (() => {
                const s = STORAGE.students.getById(editDialogSid);
                return s ? `${s.classNumber} · ${s.studentId}` : '';
              })()
            : ''
        }
        mode={mode}
        status={
          editDialogSid
            ? (() => {
                const att = attendances.find(
                  a => a.tripId === trip.id && a.studentId === editDialogSid && a.waypointId === currentWaypoint.id
                );
                return (mode === 'boarding' ? att?.boardingStatus : att?.dropoffStatus) ?? null;
              })()
            : null
        }
        handled={
          editDialogSid
            ? (() => {
                const att = attendances.find(
                  a => a.tripId === trip.id && a.studentId === editDialogSid && a.waypointId === currentWaypoint.id
                );
                const s = mode === 'boarding' ? att?.boardingStatus : att?.dropoffStatus;
                const d = mode === 'boarding' ? !!att?.boardingTime : !!att?.dropoffTime;
                return !!att && (d || s === 'no_show' || s === 'absent');
              })()
            : false
        }
        onSelect={(s) => {
          if (!editDialogSid) return;
          setStudentStatus(editDialogSid, s);
          setEditDialogSid(null);
        }}
        onUndo={() => {
          if (!editDialogSid) return;
          clearStudentStatus(editDialogSid);
          setEditDialogSid(null);
        }}
      />

      {/* 底部操作 — 與底部 menu 同款 (floating liquid-glass pill) */}
      <div className="fixed bottom-3 left-0 right-0 z-40 safe-bottom pointer-events-none">
        <div className="mx-auto max-w-[85vw] liquid-glass rounded-2xl shadow-lg p-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            {tripDone && (
            <Button
              onClick={goPrevWaypoint}
              variant="ghost"
              disabled={currentWaypointIdx === 0}
              aria-label="上一站"
              className="h-12 w-12 rounded-xl active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            )}
            <Button
              onClick={completeWaypoint}
              disabled={tripDone || (stats.boarded + stats.absent) === 0}
              title={(stats.boarded + stats.absent) === 0 ? '最少需要 1 位學生打卡後才可完成' : undefined}
              className="flex-1 h-12 rounded-xl bg-success text-success-foreground text-[15px] font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              {isLast
                ? `完成班次 (${stats.boarded + stats.absent}/${stats.total})`
                : `完成${waypointTypeLabel(currentWaypoint.type)} (${stats.boarded + stats.absent}/${stats.total})`}
            </Button>
            {tripDone && (
            <Button
              onClick={goNextWaypoint}
              variant="ghost"
              disabled={!canGoNext}
              aria-label="下一站"
              className="h-12 w-12 rounded-xl active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
            )}
          </div>
        </div>
      </div>

      {/* 全部標記 — 中置確認, 確定才執行 */}
      <ConfirmDialog
        open={markAllConfirm}
        onOpenChange={setMarkAllConfirm}
        title={mode === 'boarding' ? '全部標記為已上車?' : '全部標記為已下車?'}
        description={mode === 'boarding'
          ? `將本站尚餘 ${stats.pending} 位學生一次過標記為已上車 (已標記缺席的不受影響)。確定要繼續?`
          : `將本站尚餘 ${stats.pending} 位學生一次過標記為已下車 (已標記未下車的不受影響)。確定要繼續?`}
        confirmLabel={`確定 (${stats.pending} 位)`}
        onConfirm={markAllBoarded}
      />

      {/* 全部清除 — 中置確認, 確定才執行 */}
      <ConfirmDialog
        open={unmarkAllConfirm}
        onOpenChange={setUnmarkAllConfirm}
        title={mode === 'boarding' ? '全部標記為未上車?' : '全部標記為未下車?'}
        description={mode === 'boarding'
          ? `將本站已處理的 ${stats.boarded + stats.absent} 位學生一次過回到未點名。確定要繼續?`
          : `將本站已處理的 ${stats.boarded + stats.absent} 位學生一次過回到未點名。確定要繼續?`}
        confirmLabel={`確定 (${stats.boarded + stats.absent} 位)`}
        onConfirm={unmarkAllBoarded}
      />

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

    </div>
  );
}

function StudentCheckinRow({
  studentName, classNumber, studentId, parentPhone,
  done, handled, status, time, mode, readOnly,
  onEdit, onUndo, onBoard,
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
  readOnly?: boolean;
  onEdit: () => void;
  onUndo: () => void;
  onBoard: () => void;
}) {
  // statusLabel / 視覺樣式依結果分流:
  // - done=true  → 綠底綠勾 (準時/遲到的正常上落車)
  // - handled 但未打卡 → 紅底紅叉 (缺席 / 未下車), 讓一眼看出異常
  const statusLabel = status === 'late' ? '遲到'
    : status === 'no_show' ? (mode === 'boarding' ? '缺席' : '未下車')
    : status === 'absent' ? '缺席'
    : done ? (mode === 'boarding' ? '已上車' : '已下車')
    : null;
  const boardLabel = mode === 'boarding' ? '已上車' : '已下車';
  const clickable = !readOnly;
  const handleCardClick = !clickable ? undefined : handled ? onUndo : onBoard;
  const handleCardKeyDown = !clickable
    ? undefined
    : (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (handled ? onUndo : onBoard)(); }
      };

  return (
    <div
      onClick={handleCardClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={handleCardKeyDown}
      title={handled ? statusLabel ?? undefined : `點一下標記為${boardLabel}`}
      aria-label={handled ? `${studentName} ${statusLabel}` : `${studentName} 未點名 · 點一下標記為${boardLabel}`}
      className={cn(
        'w-full text-left rounded-2xl p-3 bg-card border border-border/50 shadow-sm transition-colors duration-200',
        done && 'border-success/40 bg-success/[0.04]',
        !done && handled && 'border-destructive/40 bg-destructive/[0.04]',
        clickable && 'cursor-pointer active:scale-[0.99]',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-colors duration-200',
          done ? 'bg-success text-success-foreground'
            : handled ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary/10 text-primary'
        )}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={done ? 'done' : handled ? 'handled' : 'pending'}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              {done ? <Check className="w-4 h-4" strokeWidth={3} />
                : handled ? <X className="w-4 h-4" strokeWidth={3} />
                : studentName.slice(0, 1)}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-semibold truncate">{studentName}</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={done ? `done-${status}` : handled ? `handled-${status}` : 'pending'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-center gap-1.5 min-w-0 flex-shrink-0"
              >
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
                {!handled && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    未點名
                  </span>
                )}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="text-xs text-muted-foreground truncate">{classNumber} · {studentId}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {parentPhone && (
            <a
              href={`tel:${parentPhone}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`聯絡電話 · 致電家長 ${studentName}`}
              title="聯絡電話"
              className="flex flex-row items-center gap-1 px-2 py-1.5 rounded-full bg-success/10 text-success active:scale-95 transition-transform whitespace-nowrap"
            >
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-[10px] leading-none font-medium">聯絡電話</span>
            </a>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label={`更改狀態 · 編輯 ${studentName} 的點名狀態`}
            title="更改狀態"
            className="flex flex-row items-center gap-1 px-2 py-1.5 rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[10px] leading-none font-medium">更改狀態</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentStatusDialog({
  open, onOpenChange, studentName, studentMeta, mode, status, handled, onSelect, onUndo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  studentMeta: string;
  mode: CheckinMode;
  status: BoardingStatus | DropoffStatus | null;
  handled: boolean;
  onSelect: (s: BoardingStatus | DropoffStatus) => void;
  onUndo: () => void;
}) {
  const actionLabel = mode === 'boarding' ? '已上車' : '已下車';
  const absentLabel = mode === 'boarding' ? '缺席' : '未下車';
  const isSelected = (key: string) => {
    if (key === 'boarded') return handled && status !== 'late' && status !== 'no_show' && status !== 'absent';
    if (key === 'late') return status === 'late';
    if (key === 'absent') return status === 'no_show' || status === 'absent';
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader>
          <DialogTitle>{studentName || '點名'}</DialogTitle>
          {studentMeta && <DialogDescription>{studentMeta}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          <Button
            onClick={() => onSelect('on_time')}
            className={cn(
              'w-full h-12 rounded-xl text-[15px] font-semibold active:scale-[0.98]',
              isSelected('boarded')
                ? 'bg-success text-success-foreground'
                : 'bg-success/10 text-success hover:bg-success/15'
            )}
          >
            <Check className="w-5 h-5" strokeWidth={3} />
            {actionLabel}
          </Button>
          {mode === 'boarding' && (
            <Button
              onClick={() => onSelect('late')}
              variant="outline"
              className={cn(
                'w-full h-12 rounded-xl text-[15px] font-semibold border-warning/40 active:scale-[0.98]',
                isSelected('late') ? 'bg-warning text-warning-foreground border-transparent' : 'text-warning'
              )}
            >
              <Clock className="w-5 h-5" />
              遲到
            </Button>
          )}
          <Button
            onClick={() => onSelect('no_show')}
            variant="outline"
            className={cn(
              'w-full h-12 rounded-xl text-[15px] font-semibold border-destructive/40 active:scale-[0.98]',
              isSelected('absent') ? 'bg-destructive text-destructive-foreground border-transparent' : 'text-destructive'
            )}
          >
            <X className="w-5 h-5" />
            {absentLabel}
          </Button>
          {handled && (
            <Button
              onClick={onUndo}
              variant="ghost"
              className="w-full h-10 rounded-xl text-xs text-muted-foreground"
            >
              <Undo2 className="w-3.5 h-3.5" />
              清除本次點名 (復原)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
