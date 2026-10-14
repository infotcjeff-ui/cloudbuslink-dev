'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bus, MapPin, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import type { Trip, Nanny, Student, Bus as BusType } from '@/lib/types';

export default function NannyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [nanny, setNanny] = useState<Nanny | null>(null);
  const [todayTrips, setTodayTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    // 找出保姆記錄
    const nannies = STORAGE.nannies.getByClient(user.clientId || '');
    const foundNanny = nannies.find(n => n.phone === user.phone);
    setNanny(foundNanny || null);

    // 找出保姆負責的今日班次
    if (foundNanny) {
      const today = new Date().toISOString().split('T')[0];
      const allTrips = STORAGE.trips.getByClient(user.clientId || '');
      const myTrips = allTrips.filter(t => 
        t.date === today && 
        t.nannyId === foundNanny.id
      );
      setTodayTrips(myTrips);
    }
    setLoading(false);
  }, [user]);

  if (!user) return null;

  const getBus = (busId: string): BusType | null => {
    if (!user.clientId) return null;
    const buses = STORAGE.buses.getByClient(user.clientId);
    return buses.find(b => b.id === busId) || null;
  };

  const getStudentNames = (studentIds: string[]): string => {
    if (!user.clientId) return '';
    const students = STORAGE.students.getByClient(user.clientId);
    return studentIds
      .map(id => students.find(s => s.id === id)?.name)
      .filter(Boolean)
      .join('、') || '無';
  };

  const getTripTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      morning: '上午班',
      afternoon: '下午班',
      custom: '自訂班次',
    };
    return labels[type] || type;
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
        <p className="text-lg font-semibold">歡迎, {user.name}</p>
        <p className="text-sm opacity-90 mt-1">今日有 {todayTrips.length} 個班次</p>
      </div>

      {/* 保姆資訊卡片 */}
      {nanny && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg font-bold">
                {nanny.name.slice(0, 1)}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{nanny.name}</p>
                <p className="text-xs text-muted-foreground">員工編號: {nanny.employeeId}</p>
              </div>
              <Badge variant={nanny.status === 'active' ? 'success' : 'secondary'}>
                {nanny.status === 'active' ? '在職' : '離職'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 今日班次列表 */}
      <div>
        <h2 className="text-sm font-semibold mb-3">今日班次</h2>
        
        {todayTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bus className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">今日沒有班次</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayTrips.map(trip => {
              const bus = getBus(trip.busId);
              const badge = getStatusBadge(trip.status);

              return (
                <Card key={trip.id}>
                  <CardContent className="p-4 space-y-3">
                    {/* 班次標題 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{getTripTypeLabel(trip.type)}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">{trip.plannedStartTime}</span>
                      </div>
                    </div>

                    {/* 校巴資訊 */}
                    {bus && (
                      <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-2">
                        <Bus className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-medium">{bus.plateNumber}</span>
                        <span className="text-xs text-muted-foreground">{bus.model}</span>
                      </div>
                    )}

                    {/* 學生名單 */}
                    <div className="bg-blue-50 rounded-xl p-3">
                      <div className="flex items-center gap-1 text-blue-600 mb-2">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs font-medium">乘車學生 ({trip.studentIds.length}人)</span>
                      </div>
                      <p className="text-sm">{getStudentNames(trip.studentIds)}</p>
                    </div>

                    {/* 打卡按鈕 */}
                    {trip.status === 'scheduled' && (
                      <Button
                        onClick={() => router.push(`/trips/${trip.id}/checkin`)}
                        className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500"
                      >
                        開始打卡
                      </Button>
                    )}
                    {trip.status === 'in_progress' && (
                      <Button
                        onClick={() => router.push(`/trips/${trip.id}/checkin`)}
                        className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500"
                      >
                        繼續打卡
                      </Button>
                    )}
                    {trip.status === 'completed' && (
                      <div className="flex items-center justify-center gap-2 py-2 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">班次已完成</span>
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
