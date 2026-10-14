'use client';

import { useEffect, useState } from 'react';
import { IdCard, Phone, Bus, MapPin, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import { fmtTime, today, tripStatusLabel } from '@/lib/utils';
import type { Student, Trip } from '@/lib/types';

/**
 * /parents/settings/binding — 家長設定頁底下的「已綁定子女」頁。
 *
 * 沿革: 原為 /settings/binding → /parents/binding → 最後移入設定頁底下,
 *       成為家長設定頁的子項目。
 * 差異: 原本的今日班次卡片可點擊跳 /trips/[id], 但家長無權進入班次頁,
 *       因此這裡改成唯讀展示, 不做導覽。
 */
export default function ParentsBindingPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [todayTrips, setTodayTrips] = useState<Trip[]>([]);

  useEffect(() => {
    if (!user) return;
    const all = STORAGE.students.getByClient(user.clientId || '');
    const mine = all.filter(s => s.parentIds.includes(user.id.replace('user-', '')) ||
                                   s.parentIds.includes(user.id));
    setStudents(mine);

    // 獲取今日班次
    const myStudentIds = new Set(mine.map(s => s.id));
    const trips = STORAGE.trips.getByDate(user.clientId || '', today())
      .filter(t => t.studentIds.some(sid => myStudentIds.has(sid)));
    setTodayTrips(trips);
  }, [user]);

  if (!user) return null;

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      <p className="text-sm text-muted-foreground">
        您共有 <span className="font-bold text-primary">{students.length}</span> 位子女已綁定
      </p>

      {students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <IdCard className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">尚未綁定任何子女</p>
          <p className="text-xs text-muted-foreground mt-1">請聯絡學校管理員</p>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map(s => {
            const bus = s.busId ? STORAGE.buses.getById(s.busId) : null;
            const driver = bus?.driverId ? STORAGE.drivers.getById(bus.driverId) : null;
            const myTrips = todayTrips.filter(t => t.studentIds.includes(s.id));

            return (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                      {s.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.classNumber} · {s.studentId}</p>
                    </div>
                  </div>

                  {bus && (
                    <div className="space-y-2 mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        <Bus className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium">{bus.plateNumber}</span>
                        <span className="text-xs text-muted-foreground">· {bus.model}</span>
                      </div>
                      {driver && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          司機 {driver.name} · {driver.phone}
                        </div>
                      )}
                      {s.pickupLocation && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 mt-0.5" />
                          <span>上車: {s.pickupLocation.name}</span>
                        </div>
                      )}
                      {s.dropoffLocation && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 mt-0.5" />
                          <span>下車: {s.dropoffLocation.name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {myTrips.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">今日班次</p>
                      {myTrips.map(t => {
                        const status = tripStatusLabel(t.status);
                        const variant = t.status === 'in_progress' ? 'warning' :
                                      t.status === 'completed' ? 'success' :
                                      t.status === 'cancelled' ? 'destructive' : 'secondary';
                        // 唯讀: 家長無權進入 /trips/[id], 不可做成可點擊的按鈕
                        return (
                          <div
                            key={t.id}
                            className="w-full flex items-center gap-2 p-2 bg-muted/40 rounded-lg"
                          >
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-semibold">{fmtTime(t.plannedStartTime)}</span>
                            <span className="text-xs text-muted-foreground">
                              - {fmtTime(t.plannedEndTime)}
                            </span>
                            <div className="flex-1" />
                            <Badge variant={variant as any} className="text-[10px]">{status}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}