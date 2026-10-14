'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Calendar, Clock, Bus as BusIcon, Users, MapPin, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { cn, today, cnWeekday, tripStatusLabel, tripTypeLabel } from '@/lib/utils';
import type { Trip, Nanny } from '@/lib/types';

/**
 * /nanny/trips — 保姆的班次列表 (跨日期)。
 *
 * 與 /nanny (我的班次) 的分工:
 *   - /nanny       今日視角, 聚焦「現在該不該打卡」
 *   - /nanny/trips 歷史/未來視角, 可切日期回看自己負責過的班次
 *
 * 只顯示該保姆自己負責的班次 (nannyId 過濾), 不會看到同車隊其他人。
 */
export default function NannyTripsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [nanny, setNanny] = useState<Nanny | null>(null);
  const [date, setDate] = useState(today());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const foundNanny = STORAGE.nannies.getByClient(user.clientId || '')
      .find(n => n.phone === user.phone);
    setNanny(foundNanny || null);

    if (foundNanny) {
      setTrips(STORAGE.trips.getByNanny(foundNanny.id)
        .filter(t => t.date === date && t.clientId === (user.clientId || ''))
        .sort((a, b) => a.plannedStartTime.localeCompare(b.plannedStartTime)));
    } else {
      setTrips([]);
    }
    setLoading(false);
  }, [user, date]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!nanny) {
    return (
      <div className="px-4 pt-4 pb-24">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <BusIcon className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">找不到你的保姆資料</p>
          <p className="text-xs text-muted-foreground mt-1">請聯絡管理員更新你的帳戶</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 日期選擇器 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">選擇日期</h2>
        </div>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-1.5">{cnWeekday(date)}</p>
      </div>

      {/* 班次列表 */}
      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <BusIcon className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">這天沒有你的班次</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map((trip, idx) => {
            const bus = STORAGE.buses.getById(trip.busId);
            const status = tripStatusLabel(trip.status);
            const statusVariant = trip.status === 'in_progress' ? 'warning' :
                                trip.status === 'completed' ? 'success' :
                                trip.status === 'cancelled' ? 'destructive' : 'secondary';

            return (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card
                  className="active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => router.push(`/trips/${trip.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant as any}>{status}</Badge>
                        <Badge variant="outline">{tripTypeLabel(trip.type)}</Badge>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-semibold">
                          {trip.plannedStartTime} - {trip.plannedEndTime}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <BusIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{bus?.plateNumber || '未指派校巴'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{trip.studentIds.length} 位學生</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{trip.waypoints.length} 個站點</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}