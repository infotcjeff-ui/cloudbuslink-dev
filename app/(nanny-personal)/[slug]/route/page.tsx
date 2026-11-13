'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useNannyTrips } from '@/lib/hooks';
import { STORAGE, resolveDataScope } from '@/lib/storage';
import { today } from '@/lib/utils';
import { resolveTripRoute } from '@/lib/trip-route';
import { Card, CardContent } from '@/components/ui/card';
import type { Trip, Student } from '@/lib/types';
import { Bus, Clock, CheckCircle, MapPin, Users } from 'lucide-react';

export default function NannyPage() {
  const { user } = useAuth();
  const router = useRouter();

  // 香港時間 (UTC+8) — 學校喺香港, 手機時區未必係, 一律用香港時間顯示。
  // SSR 階段唔計, 避免 hydration mismatch (與 AdminShell 相同做法)。
  const [hkTime, setHkTime] = useState<string>('');
  useEffect(() => {
    const fmt = () => {
      setHkTime(new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Hong_Kong',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }));
    };
    fmt();
    const id = setInterval(fmt, 30_000);
    return () => clearInterval(id);
  }, []);

  // 今日班次 + 保姆資料
  //
  // useNannyTrips 會:
  //   - 用本地時區的「今日」(原本用 UTC, 凌晨會對不上日期)
  //   - 依「trip.nannyId 精確匹配 → 校巴綁定 fallback」判定班次歸屬
  //     (與管理員排程頁完全一致)
  //   - 監聽 cbl-*-refresh 事件 → 雲端同步完成後自動重畫
  const { trips: todayTrips, loading } = useNannyTrips(today());
  const [tab, setTab] = useState<'todo' | 'done'>('todo');

  const pendingTrips = todayTrips.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const doneTrips = todayTrips.filter(t => t.status === 'completed' || t.status === 'cancelled');
  const listTrips = tab === 'todo' ? pendingTrips : doneTrips;

  if (!user) return null;

  const getBus = (busId: string) => {
    const scope = resolveDataScope(user);
    const buses = scope.isSuperAdmin
      ? STORAGE.buses.getAll()
      : STORAGE.buses.getByClient(scope.clientId);
    return buses.find(b => b.id === busId) || null;
  };

  // 路線模板 — 解析規則與管理員排程頁完全一致 (見 lib/trip-route.ts):
  //   1. trip.routeId 精確匹配
  //   2. 同一台校巴 + 同一行車時段 (處理冇 routeId 的舊班次)
  //
  // ⚠️ 之前呢度只睇 trip.routeId, 而好多班次係經「校巴綁定」建立,
  //    routeId 為空 → 保姆見到「自訂路線」, 但管理員見到「黃大仙早上線」,
  //    兩邊講法唔一致。共用 resolveTripRoute 之後就統一咗。
  const getRoute = (trip: Trip) => {
    const scope = resolveDataScope(user);
    const routes = scope.isSuperAdmin
      ? STORAGE.routes.getAll()
      : STORAGE.routes.getByClient(scope.clientId);
    return resolveTripRoute(trip, routes);
  };

  // 路線地點 (站點名稱串接) — 顯示在班次卡片, 令保姆一眼知道要去邊度
  const getRouteStops = (trip: Trip): string[] => {
    const wps = trip.waypoints ?? [];
    if (wps.length === 0) return [];
    const names = wps.map(w => w.location.name).filter(Boolean);
    // 去重 (同一地點可能同時是上車點與下車點)
    return names.filter((n, i) => names.indexOf(n) === i);
  };

  // 乘車學生 — 只顯示頭像圓圈 + 人數, 唔再列全名 (卡片更易讀)
  //
  // ⚠️ 取值必須與後台一致, 否則「後台有綁、保姆見到 0 人」:
  //   1. 有些班次 trip.studentIds 為空, 學生只寫在 waypoints[].studentIds
  //      (手動改站點 / 模板帶入後改車都可能咁) → 要取兩者聯集, 唔可以只睇 trip.studentIds。
  //   2. 保姆帳號的 clientId 可能同學生唔同 (跨校帳號 / 舊資料) →
  //      先用 scope 找, 搵唔到就退回全域 getById, 唔好直接回 []。
  const getTripStudentIds = (trip: Trip): string[] => {
    const ids = new Set<string>(trip.studentIds ?? []);
    (trip.waypoints ?? []).forEach((w) =>
      (w.studentIds ?? []).forEach((id) => ids.add(id)),
    );
    return [...ids];
  };
  const getTripStudents = (studentIds: string[]): Student[] => {
    const scope = resolveDataScope(user);
    const scoped = scope.isSuperAdmin
      ? STORAGE.students.getAll()
      : scope.clientId
        ? STORAGE.students.getByClient(scope.clientId)
        : STORAGE.students.getAll();
    const scopedById = new Map(scoped.map((s) => [s.id, s] as const));
    return studentIds
      .map((id) => scopedById.get(id) ?? STORAGE.students.getById(id))
      .filter((s): s is Student => !!s);
  };

  const getTripTypeLabel = (trip: Trip): string => {
    // 自訂班次優先用管理員輸入嘅自訂名稱
    if (trip.type === 'custom' && trip.customTypeLabel) return trip.customTypeLabel;
    const labels: Record<string, string> = {
      morning: '上午班',
      afternoon: '下午班',
      custom: '自訂班次',
    };
    return labels[trip.type] || trip.type;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      scheduled: { label: '等待出發', className: 'bg-blue-100 text-blue-700' },
      in_progress: { label: '行駛中', className: 'bg-amber-100 text-amber-700' },
      completed: { label: '已完成', className: 'bg-green-100 text-green-700' },
      cancelled: { label: '已取消', className: 'bg-gray-100 text-gray-600' },
    };
    return badges[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 歡迎訊息 */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate">歡迎, {user.name}</p>
            <p className="text-sm opacity-90 mt-1">今日有 {todayTrips.length} 個班次</p>
          </div>
          <div className="flex flex-col items-end flex-shrink-0">
            <div className="flex items-center gap-1.5 text-3xl font-bold tabular-nums leading-none">
              <Clock className="w-6 h-6 opacity-90" />
              {hkTime || '--:--'}
            </div>
            <span className="text-xs opacity-80 mt-1.5">香港時間</span>
          </div>
        </div>
      </div>

      {/* 今日班次列表 */}
      <div>
        <h2 className="text-sm font-semibold mb-3">今日班次</h2>

        {/* 待打卡 / 已打卡 Tab */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setTab('todo')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${tab === 'todo' ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}
          >
            待打卡 ({pendingTrips.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('done')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${tab === 'done' ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}
          >
            已打卡 ({doneTrips.length})
          </button>
        </div>

        {listTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bus className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{tab === 'todo' ? '沒有待打卡班次' : '還沒有已打卡班次'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listTrips.map(trip => {
              const bus = getBus(trip.busId);
              const badge = getStatusBadge(trip.status);
              const route = getRoute(trip);
              const routeStops = getRouteStops(trip);
              const students = getTripStudents(getTripStudentIds(trip));
              const isDone = trip.status === 'completed' || trip.status === 'cancelled';

              return (
                <Card
                  key={trip.id}
                  className="active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => router.push(
                    isDone ? `/trips/${trip.id}` : `/trips/${trip.id}/checkin`
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* 路線名稱 + 班次標題 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {/* 第一行：狀態 + 路線名稱 */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${badge.className}`}>
                            {badge.label}
                          </span>
                          <p className="text-lg font-bold text-emerald-700 truncate">
                            {route?.name || '沒有套用路線模板'}
                          </p>
                        </div>
                        {/* 第二行：班次 */}
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-sm font-semibold">{getTripTypeLabel(trip)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">{trip.plannedStartTime}</span>
                      </div>
                    </div>

                    {/* 校巴 + 路線地點 + 乘車學生 — 合在同一個 section */}
                    <div className="rounded-xl bg-muted/40 divide-y divide-border/50 overflow-hidden">
                      {/* 校巴資訊 */}
                      {bus && (
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <Bus className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-sm font-medium">{bus.plateNumber}</span>
                          <span className="text-xs text-muted-foreground truncate">{bus.model}</span>
                        </div>
                      )}

                      {/* 路線地點 (站點串接) */}
                      {routeStops.length > 0 && (
                        <div className="px-3 py-2.5">
                          <div className="flex items-center gap-1 text-emerald-700 mb-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">路線地點 ({routeStops.length} 個)</span>
                          </div>
                          <p className="text-xs text-emerald-900/80 leading-relaxed">
                            {routeStops.join(' → ')}
                          </p>
                        </div>
                      )}

                      {/* 乘車學生 — 只顯示頭像圓圈 + 人數 */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="flex -space-x-2 flex-shrink-0">
                          {students.slice(0, 5).map(s => (
                            <div
                              key={s.id}
                              title={s.name}
                              className="w-7 h-7 rounded-full ring-2 ring-background bg-emerald-500/15 text-emerald-600 text-[10px] font-bold flex items-center justify-center overflow-hidden"
                            >
                              {s.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.photo} alt={s.name} className="h-full w-full object-cover" />
                              ) : (
                                s.name.slice(0, 1)
                              )}
                            </div>
                          ))}
                          {students.length > 5 && (
                            <div className="w-7 h-7 rounded-full ring-2 ring-background bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center">
                              +{students.length - 5}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground min-w-0">
                          <Users className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs">
                            乘車學生 ({students.length}人)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 班次已完成 — 只作狀態提示 (成張卡已可點擊) */}
                    {trip.status === 'completed' && (
                      <div className="flex items-center justify-center gap-2 py-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs font-medium">班次已完成</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
