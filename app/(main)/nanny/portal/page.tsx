'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, MapPin, Clock, User, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth, useNannyTrips } from '@/lib/hooks';
import { STORAGE, resolveDataScope } from '@/lib/storage';
import { today } from '@/lib/utils';
import { getNannyBuses } from '@/lib/nanny-trips';
import type { Bus as BusType, Student, Waypoint } from '@/lib/types';

// 保姆 Portal - 顯示負責校巴、今日班次、打卡入口
export default function NannyPortalPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [assignedBuses, setAssignedBuses] = useState<BusType[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // 今日班次 + 保姆資料 (共用邏輯, 見 lib/nanny-trips.ts)
  const { nanny: nannyInfo, trips, loading } = useNannyTrips(today());

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'nanny') {
      // 不是保姆 → 跳回自己的 portal
      if (user.role === 'parent') {
        router.replace('/parents/portal');
      } else {
        router.replace('/');
      }
      return;
    }
  }, [user, router]);

  // 負責校巴 (綁定資料變更時同步)
  useEffect(() => {
    if (!nannyInfo) {
      setAssignedBuses([]);
      return;
    }
    setAssignedBuses(getNannyBuses(nannyInfo));
  }, [nannyInfo]);

  // 載入相關學生 (只取今日班次上的學生)
  useEffect(() => {
    if (!user || trips.length === 0) {
      setStudents([]);
      return;
    }
    const scope = resolveDataScope(user);
    const allStudents = scope.isSuperAdmin
      ? STORAGE.students.getAll()
      : STORAGE.students.getByClient(scope.clientId);
    const ids = new Set<string>();
    trips.forEach(t => t.studentIds.forEach(sid => ids.add(sid)));
    setStudents(allStudents.filter(s => ids.has(s.id)));
  }, [user, trips]);

  if (!user || user.role !== 'nanny') return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 歡迎區塊 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <User className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold">{user.name}</h2>
              <p className="text-xs text-muted-foreground">
                保姆 · {nannyInfo?.employeeId || '未編配'} · {user.phone}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 負責校巴 */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Bus className="w-4 h-4" />
          負責校巴 ({assignedBuses.length})
        </h3>
        {assignedBuses.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">尚未編配校巴</p>
              <p className="text-xs text-muted-foreground mt-1">
                請聯絡學校管理員編配校巴
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {assignedBuses.map(b => (
              <Card key={b.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Bus className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{b.plateNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.model} · 座位 {b.capacity}
                      </p>
                    </div>
                    <Badge variant={b.status === 'active' ? 'success' : 'secondary'}>
                      {b.status === 'active' ? '運行' :
                       b.status === 'maintenance' ? '維護' : '停用'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 今日班次 */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          今日班次 ({trips.length})
        </h3>
        {trips.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                <Bus className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">今日沒有班次</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {trips.map(t => {
              const tripBus = assignedBuses.find(b => b.id === t.busId);
              return (
                <Card
                  key={t.id}
                  className="active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => router.push(`/trips/${t.id}`)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={t.type === 'morning' ? 'default' : 'secondary'}>
                          {t.type === 'morning' ? '早班' : t.type === 'afternoon' ? '午班' : '其他'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {t.plannedStartTime} - {t.plannedEndTime}
                        </span>
                      </div>
                      <Badge variant={
                        t.status === 'completed' ? 'success' :
                        t.status === 'in_progress' ? 'default' :
                        t.status === 'cancelled' ? 'destructive' : 'outline'
                      }>
                        {t.status === 'scheduled' ? '未開始' :
                         t.status === 'in_progress' ? '進行中' :
                         t.status === 'completed' ? '完成' : '已取消'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Bus className="w-3.5 h-3.5" />
                      <span>{tripBus?.plateNumber || '未指派'}</span>
                      <span className="mx-1">·</span>
                      <Users className="w-3.5 h-3.5" />
                      <span>{t.studentIds.length} 名學生</span>
                    </div>

                    {/* 站點進度 */}
                    {t.waypoints.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground mb-1">站點進度</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {t.waypoints.map((wp: Waypoint) => (
                            <div
                              key={wp.id}
                              className="flex items-center gap-1 text-[10px]"
                              title={wp.location.name}
                            >
                              {wp.status === 'completed' ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              ) : wp.status === 'arrived' ? (
                                <Clock className="w-3 h-3 text-amber-500" />
                              ) : wp.status === 'skipped' ? (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              ) : (
                                <div className="w-3 h-3 rounded-full border border-muted-foreground" />
                              )}
                              <span className={wp.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'}>
                                {wp.location.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 學生名單 */}
      {students.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            學生名單 ({students.length})
          </h3>
          <Card>
            <CardContent className="p-3">
              <div className="space-y-1.5">
                {students.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center text-[10px] font-semibold text-emerald-500">
                        {s.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">{s.classNumber}</p>
                      </div>
                    </div>
                    {s.pickupLocation && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{s.pickupLocation.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
