'use client';

/**
 * RosterPreviewTable — 站點 × 學生 roster (含即時出席狀態)
 *
 * 作為 TripDetailDrawer 內嵌區塊, 顯示每站點的學生清單, 並可從 admin 端
 * 直接補打卡 / 標記狀態 (Step 3, 不在前端跑時修改以免誤觸)。
 *
 * Step 3 之後可改為可拖拉式排序。
 */

import * as React from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Minus,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
} from 'lucide-react';

import { cn, boardingStatusLabel, dropoffStatusLabel } from '@/lib/utils';
import { fmtHhMm } from './scheduleUtils';
import { Pill, Button, IconButton } from '../[layout]/students/primitives';
import type { Attendance, Waypoint } from '@/lib/types';
import { STORAGE } from '@/lib/storage';
import type { Student } from '@/lib/types';

interface RosterPreviewTableProps {
  tripId: string;
  waypoints: Waypoint[];
  attendees: Student[];
  attendances: Attendance[];
  /** 唯讀模式 (預設) — true 表示不允許互動 */
  readOnly?: boolean;
  onChanged?: () => void;
  /** 對應站點期望的時間, 用於比較實際時間判斷 on_time / late */
  expectedTimes?: Record<string, string>;
}

type EditableStatus =
  | 'on_time'
  | 'late'
  | 'no_show'
  | 'absent';

const STATUS_TONE: Record<EditableStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  on_time: 'success',
  late: 'warning',
  no_show: 'danger',
  absent: 'danger',
};

const STATUS_OPTIONS: { value: EditableStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'on_time', label: '準時',  icon: <CheckCircle2 width={11} height={11} /> },
  { value: 'late',    label: '遲到',  icon: <Clock width={11} height={11} /> },
  { value: 'no_show', label: '未到',  icon: <XCircle width={11} height={11} /> },
  { value: 'absent',  label: '缺席',  icon: <Minus width={11} height={11} /> },
];

function statusText(boardingOrDropoff: 'boarding' | 'dropoff', s?: string | null): string {
  if (!s) return '未填';
  if (boardingOrDropoff === 'boarding') return boardingStatusLabel(s);
  return dropoffStatusLabel(s);
}

function getStatus(att: Attendance | undefined, mode: 'boarding' | 'dropoff'): EditableStatus | 'pending' {
  if (!att) return 'pending';
  if (mode === 'boarding') {
    const s = att.boardingStatus;
    if (s === 'on_time' || s === 'late' || s === 'no_show' || s === 'absent') return s;
    return 'pending';
  }
  const s = att.dropoffStatus;
  if (s === 'on_time' || s === 'late' || s === 'no_show' || s === 'early') return 'on_time';
  if (s === 'no_show' || s === 'absent') return 'no_show';
  return 'pending';
}

export function RosterPreviewTable({
  tripId,
  waypoints,
  attendees,
  attendances,
  readOnly = true,
  onChanged,
  expectedTimes,
}: RosterPreviewTableProps) {
  const [openWpId, setOpenWpId] = React.useState<string | null>(
    waypoints[0]?.id ?? null,
  );
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const updateStatus = async (
    studentId: string,
    waypointId: string,
    mode: 'boarding' | 'dropoff',
    status: EditableStatus,
  ) => {
    if (readOnly) return;
    setSavingId(`${studentId}__${waypointId}`);
    try {
      const existing = attendances.find(
        (a) => a.studentId === studentId && a.waypointId === waypointId,
      );
      const wp = waypoints.find((w) => w.id === waypointId)!;
      const now = new Date().toISOString();
      const next: Attendance = {
        id: existing?.id || STORAGE.genId('att'),
        tripId,
        studentId,
        waypointId,
        boardingTime: mode === 'boarding'
          ? status === 'no_show' || status === 'absent' ? null : now
          : existing?.boardingTime ?? null,
        boardingStatus: mode === 'boarding'
          ? status
          : (existing?.boardingStatus ?? 'on_time'),
        boardingPhoto: existing?.boardingPhoto ?? null,
        boardedBy: existing?.boardedBy ?? 'admin',
        dropoffTime: mode === 'dropoff'
          ? status === 'no_show' ? null : now
          : existing?.dropoffTime ?? null,
        dropoffStatus: mode === 'dropoff'
          ? status === 'on_time' ? 'on_time' : status === 'late' ? 'late' : status === 'no_show' ? 'no_show' : 'absent'
          : existing?.dropoffStatus ?? null,
        dropoffPhoto: existing?.dropoffPhoto ?? null,
        dropoffBy: mode === 'dropoff' ? 'admin' : existing?.dropoffBy ?? null,
        notes: existing?.notes ?? null,
        isConfirmed: existing?.isConfirmed ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        waypointType: wp.type, // optional, may be undefined; not all storage code expects it
      } as Attendance;
      // waypointType 是 optional 額外 hint, 不會破壞既有 attendanceStorage
      delete (next as any).waypointType;
      STORAGE.attendances.upsert(next);
      onChanged?.();
      window.dispatchEvent(new CustomEvent('cbl-attendance-refresh'));
    } finally {
      window.setTimeout(() => setSavingId(null), 350);
    }
  };

  if (waypoints.length === 0) {
    return (
      <p className="text-[12px] text-slate-500 py-2">此班次尚未安排站點。</p>
    );
  }

  return (
    <ol className="space-y-1.5">
      {waypoints.map((wp) => {
        const isOpen = openWpId === wp.id;
        const atts = attendances.filter((a) => a.waypointId === wp.id);
        const boardedOrDropped = atts.filter((a) =>
          wp.type === 'pickup' ? a.boardingTime : a.dropoffTime,
        ).length;
        return (
          <li
            key={wp.id}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenWpId(isOpen ? null : wp.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              {isOpen ? (
                <ChevronDown width={12} height={12} className="text-slate-500" />
              ) : (
                <ChevronRight width={12} height={12} className="text-slate-500" />
              )}
              <Pill tone={wp.type === 'pickup' ? 'primary' : 'violet'} size="sm">
                {wp.type === 'pickup' ? '上車' : '下車'}
              </Pill>
              <span className="text-[12px] font-medium truncate flex-1">{wp.location.name}</span>
              <span className="text-[10px] text-slate-500">
                {wp.scheduledTime ? fmtHhMm(wp.scheduledTime) : '—'} · {boardedOrDropped}/{wp.studentIds.length}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-2">
                {wp.studentIds.length === 0 ? (
                  <p className="text-[11px] text-slate-400 py-1">此站沒有學生</p>
                ) : (
                  <ul className="space-y-1">
                    {wp.studentIds.map((sid) => {
                      const stu = attendees.find((s) => s.id === sid);
                      const att = atts.find((a) => a.studentId === sid);
                      // wp.type 只有 'pickup' | 'dropoff', 我們內部用 boarding/dropoff 區分
                      const mode: 'boarding' | 'dropoff' =
                        wp.type === 'pickup' ? 'boarding' : 'dropoff';
                      const status = getStatus(att, mode);
                      const expected = expectedTimes?.[wp.id] ?? wp.scheduledTime;
                      const isSaving = savingId === `${sid}__${wp.id}`;
                      return (
                        <li
                          key={sid}
                          className="flex items-center gap-2 text-[11.5px] py-1 border-b border-slate-100/70 dark:border-slate-700/40 last:border-b-0"
                        >
                          <span className="flex-1 truncate">
                            {stu?.name ?? sid.slice(-6)}
                            {stu && (
                              <span className="text-[10px] text-slate-400 ml-1">{stu.classNumber}</span>
                            )}
                          </span>
                          {(() => {
                            const actual = att?.boardingTime ?? att?.dropoffTime;
                            return actual ? (
                              <span className="text-[10px] text-slate-500 tabular-nums">
                                {fmtHhMm(actual)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">未到</span>
                            );
                          })()}
                          {/* status pill (read) */}
                          {status === 'pending' ? (
                            <Pill tone="neutral" size="sm">— 待打卡</Pill>
                          ) : status === 'on_time' ? (
                            <Pill tone="success" size="sm">準時</Pill>
                          ) : status === 'late' ? (
                            <Pill tone="warning" size="sm">遲到</Pill>
                          ) : (
                            <Pill tone="danger" size="sm">{statusText(mode, status)}</Pill>
                          )}
                          {/* interactive only when editable */}
                          {!readOnly && (
                            <div className="flex items-center gap-1">
                              {STATUS_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => updateStatus(sid, wp.id, mode, opt.value)}
                                  className={cn(
                                    'h-7 w-7 inline-flex items-center justify-center rounded-md border text-[10px] transition-colors',
                                    status === opt.value
                                      ? toneFill(opt.value)
                                      : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
                                  )}
                                  title={opt.label}
                                  aria-label={opt.label}
                                >
                                  {isSaving ? <Loader2 width={10} height={10} className="animate-spin" /> : opt.icon}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function toneFill(s: EditableStatus): string {
  switch (s) {
    case 'on_time': return 'bg-emerald-500 border-emerald-500 text-white';
    case 'late':    return 'bg-amber-500 border-amber-500 text-white';
    case 'no_show': return 'bg-rose-500 border-rose-500 text-white';
    case 'absent':  return 'bg-rose-700 border-rose-700 text-white';
  }
}
