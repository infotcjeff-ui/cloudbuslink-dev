'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Bus, Clock, MapPin, Users, Play, CheckCircle2, AlertCircle,
  Calendar, Phone, ArrowRight, ChevronRight, Edit2, X
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import { cn, fmtTime, currentTimeStamp, tripStatusLabel, tripTypeLabel, waypointTypeLabel } from '@/lib/utils';
import type { Trip, Waypoint } from '@/lib/types';

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!params.id) return;
    const found = STORAGE.trips.getById(params.id as string);
    if (found) setTrip(found);
  }, [params.id]);

  // 每秒更新一次, 顯示實時時間
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!trip) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        載入中...
      </div>
    );
  }

  const bus = STORAGE.buses.getById(trip.busId);
  const nanny = STORAGE.nannies.getById(trip.nannyId);
  const driver = bus?.driverId ? STORAGE.drivers.getById(bus.driverId) : null;
  const canOperate = user?.role === 'super_admin' || user?.role === 'client' || user?.id === `user-${trip.nannyId}`;

  const startTrip = () => {
    STORAGE.trips.update(trip.id, {
      status: 'in_progress',
      actualStartTime: currentTimeStamp(),
    });
    setTrip({ ...trip, status: 'in_progress', actualStartTime: currentTimeStamp() });
  };

  const completeTrip = () => {
    if (!confirm('確定完成此班次?')) return;
    STORAGE.trips.update(trip.id, {
      status: 'completed',
      actualEndTime: currentTimeStamp(),
    });
    setTrip({ ...trip, status: 'completed', actualEndTime: currentTimeStamp() });
  };

  const cancelTrip = () => {
    if (!confirm('確定取消此班次?')) return;
    STORAGE.trips.update(trip.id, { status: 'cancelled' });
    setTrip({ ...trip, status: 'cancelled' });
  };

  const status = tripStatusLabel(trip.status);
  const statusVariant = trip.status === 'in_progress' ? 'warning' :
                      trip.status === 'completed' ? 'success' :
                      trip.status === 'cancelled' ? 'destructive' : 'secondary';

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* 狀態卡片 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant as any}>{status}</Badge>
              <Badge variant="outline">{tripTypeLabel(trip.type)}</Badge>
            </div>
            {user?.role !== 'parent' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/trips/${trip.id}/edit`)}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>{trip.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>
                計劃: {fmtTime(trip.plannedStartTime)} - {fmtTime(trip.plannedEndTime)}
              </span>
            </div>
            {trip.actualStartTime && (
              <div className="flex items-center gap-2 text-success">
                <Play className="w-4 h-4" />
                <span>實際開始: {fmtTime(trip.actualStartTime)}</span>
              </div>
            )}
            {trip.actualEndTime && (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="w-4 h-4" />
                <span>實際結束: {fmtTime(trip.actualEndTime)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 司機 & 保姆 & 校巴 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">負責人員</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bus className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">校巴</p>
              <p className="text-sm font-semibold truncate">{bus?.plateNumber || '未指派'}</p>
            </div>
            <Badge variant="secondary">{bus?.capacity || 0}座</Badge>
          </div>
          {driver && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">{driver.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">司機</p>
                <p className="text-sm font-semibold">{driver.name}</p>
              </div>
              <a href={`tel:${driver.phone}`} className="p-2 rounded-full bg-success/10 text-success">
                <Phone className="w-4 h-4" />
              </a>
            </div>
          )}
          {nanny && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-warning">{nanny.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">保姆</p>
                <p className="text-sm font-semibold">{nanny.name}</p>
              </div>
              <a href={`tel:${nanny.phone}`} className="p-2 rounded-full bg-success/10 text-success">
                <Phone className="w-4 h-4" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 路線時間軸 */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">路線時間軸</h3>
          <div className="space-y-0">
            {trip.waypoints.map((wp, idx) => (
              <WaypointItem
                key={wp.id}
                wp={wp}
                index={idx}
                isLast={idx === trip.waypoints.length - 1}
                tick={tick}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 學生名單 */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            學生名單 ({trip.studentIds.length})
          </h3>
          <div className="space-y-2">
            {trip.studentIds.map(sid => {
              const student = STORAGE.students.getById(sid);
              if (!student) return null;
              return (
                <div
                  key={sid}
                  className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {student.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">{student.classNumber} · {student.studentId}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 操作按鈕 */}
      {canOperate && (
        <div className="space-y-2 pt-2">
          {trip.status === 'scheduled' && (
            <Button onClick={startTrip} className="w-full h-12">
              <Play className="w-4 h-4" />
              開始班次
            </Button>
          )}
          {(trip.status === 'in_progress' || trip.status === 'scheduled') && (
            <>
              <Button
                onClick={() => router.push(`/trips/${trip.id}/checkin`)}
                variant="default"
                className="w-full h-12 bg-success"
              >
                <CheckCircle2 className="w-4 h-4" />
                開始點名打卡
              </Button>
              <Button onClick={completeTrip} variant="outline" className="w-full h-12">
                <CheckCircle2 className="w-4 h-4" />
                完成班次
              </Button>
              <Button
                onClick={cancelTrip}
                variant="ghost"
                className="w-full h-10 text-destructive"
              >
                <X className="w-4 h-4" />
                取消班次
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WaypointItem({ wp, index, isLast, tick }: { wp: Waypoint; index: number; isLast: boolean; tick: number }) {
  const isPickup = wp.type === 'pickup';
  const color = isPickup ? 'text-primary' : 'text-warning';

  return (
    <div className="flex gap-3">
      {/* 時間軸 */}
      <div className="flex flex-col items-center pt-1">
        <div className={cn(
          'w-3 h-3 rounded-full border-2',
          wp.status === 'completed' ? 'bg-success border-success' :
          wp.status === 'arrived' ? 'bg-warning border-warning' :
          wp.status === 'skipped' ? 'bg-muted border-muted' :
          'border-muted-foreground bg-background'
        )} />
        {!isLast && <div className="w-0.5 flex-1 bg-border my-1 min-h-[20px]" />}
      </div>

      {/* 內容 */}
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">{wp.location.name}</p>
          <Badge variant={isPickup ? 'default' : 'warning'} className="text-[10px]">
            {waypointTypeLabel(wp.type)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>計劃: {fmtTime(wp.scheduledTime)}</span>
          {wp.actualTime && (
            <>
              <ArrowRight className="w-3 h-3" />
              <span className="text-success">實際: {fmtTime(wp.actualTime)}</span>
            </>
          )}
        </div>
        {wp.location.address && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{wp.location.address}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Users className="w-3 h-3" />
          <span>{wp.studentIds.length} 位學生</span>
        </div>
        {wp.notes && (
          <div className="mt-2 text-xs text-warning bg-warning/10 rounded-lg px-2 py-1.5 flex items-start gap-1">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{wp.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}
