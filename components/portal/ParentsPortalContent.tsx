'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bus, MapPin, Users } from 'lucide-react';
import type { Student, Parent, Bus as BusType } from '@/lib/types';

/**
 * 家長 Portal 主內容 — 同時服務 /parents 與 /parents/portal 兩條路徑。
 * /parents/portal 是 (main) layout 角色保護的 redirect 目標,
 * 兩邊共用同一份實作避免邏輯分歧。
 */
export default function ParentsPortalContent() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [parent, setParent] = useState<Parent | null>(null);

  useEffect(() => {
    if (!user) return;
    // 找出這個家長的記錄
    const parents = STORAGE.parents.getByClient(user.clientId || '');
    const foundParent = parents.find(p => p.phone === user.phone);
    setParent(foundParent || null);

    // 找出所有綁定學生的資訊
    if (foundParent) {
      const allStudents = STORAGE.students.getByClient(user.clientId || '');
      const myStudents = allStudents.filter(s => s.parentIds.includes(foundParent.id));
      setStudents(myStudents);
    }
  }, [user]);

  if (!user) return null;

  const getBus = (busId: string | null): BusType | null => {
    if (!busId || !user.clientId) return null;
    const buses = STORAGE.buses.getByClient(user.clientId);
    return buses.find(b => b.id === busId) || null;
  };

  const getTripStatus = (student: Student) => {
    if (!user.clientId) return null;
    const today = new Date().toISOString().split('T')[0];
    const trips = STORAGE.trips.getByClient(user.clientId);
    const todayTrip = trips.find(t => t.date === today && t.studentIds.includes(student.id));
    if (!todayTrip) return { type: 'no-trip', label: '今日無班次', color: 'bg-gray-100 text-gray-600' };
    const statusMap: Record<string, { label: string; color: string }> = {
      scheduled: { label: '等待出發', color: 'bg-blue-100 text-blue-700' },
      in_progress: { label: '行駛中', color: 'bg-amber-100 text-amber-700' },
      completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
      cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-600' },
    };
    const status = statusMap[todayTrip.status] || { label: todayTrip.status, color: 'bg-gray-100 text-gray-700' };
    return { ...status, trip: todayTrip };
  };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 歡迎訊息 */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-4 text-white">
        <p className="text-lg font-semibold">歡迎, {user.name}</p>
        <p className="text-sm opacity-90 mt-1">以下是你子女的乘車資訊</p>
      </div>

      {/* 子女列表 */}
      {students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">暫無綁定學生</p>
          <p className="text-xs text-muted-foreground mt-1">請聯絡校巴管理員綁定</p>
        </div>
      ) : (
        students.map(student => {
          const bus = getBus(student.busId);
          const tripInfo = getTripStatus(student);

          return (
            <Card key={student.id}>
              <CardContent className="p-4 space-y-3">
                {/* 學生資訊 */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-lg font-bold">
                    {student.name.slice(0, 1)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{student.name}</p>
                      <Badge variant="secondary" className="text-xs">{student.classNumber}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">學號: {student.studentId}</p>
                  </div>
                  {tripInfo && (
                    <span className={`text-xs px-2 py-1 rounded-full ${tripInfo.color}`}>
                      {tripInfo.label}
                    </span>
                  )}
                </div>

                {/* 校巴資訊 */}
                {bus && (
                  <div className="bg-muted/50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Bus className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{bus.plateNumber}</span>
                      <span className="text-xs text-muted-foreground">{bus.model}</span>
                    </div>
                  </div>
                )}

                {/* 上車/落車地點 */}
                <div className="grid grid-cols-2 gap-2">
                  {student.pickupLocation && (
                    <div className="bg-blue-50 rounded-xl p-3">
                      <div className="flex items-center gap-1 text-blue-600 mb-1">
                        <MapPin className="w-3 h-3" />
                        <span className="text-xs font-medium">上車地點</span>
                      </div>
                      <p className="text-sm font-medium">{student.pickupLocation.name}</p>
                      <p className="text-xs text-muted-foreground">{student.pickupLocation.address}</p>
                    </div>
                  )}
                  {student.dropoffLocation && (
                    <div className="bg-green-50 rounded-xl p-3">
                      <div className="flex items-center gap-1 text-green-600 mb-1">
                        <MapPin className="w-3 h-3" />
                        <span className="text-xs font-medium">落車地點</span>
                      </div>
                      <p className="text-sm font-medium">{student.dropoffLocation.name}</p>
                      <p className="text-xs text-muted-foreground">{student.dropoffLocation.address}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}