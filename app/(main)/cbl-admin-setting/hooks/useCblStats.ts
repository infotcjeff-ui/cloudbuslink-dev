'use client';

import { useMemo } from 'react';
import { STORAGE } from '@/lib/storage';

export type CblStats = {
  students: number;
  parents: number;
  buses: number;
  drivers: number;
  nannies: number;
  activeTrips: number;
  announcements: number;
  studentsAssigned: number;
  studentsUnassigned: number;
  studentsNewToday: number;
  busesActive: number;
  busesMaintenance: number;
  busesInactive: number;
  driversAvailable: number;
  driversOnTrip: number;
  driversOffDuty: number;
  nanniesAssigned: number;
  nanniesUnassigned: number;
  totalTrips: number;
  totalAttendance: number;
  attendanceRate: number;
  announcementTemplates: number;
  /** 今日 (開班中 + 已完成 + scheduled) ÷ 今日總班次, 0..100, 取整 */
  scheduleProgressRate: number;
  /** 今日狀態為 completed 的班次數 */
  tripsCompletedToday: number;
};

const EMPTY_STATS: CblStats = {
  students: 0,
  parents: 0,
  buses: 0,
  drivers: 0,
  nannies: 0,
  activeTrips: 0,
  announcements: 0,
  studentsAssigned: 0,
  studentsUnassigned: 0,
  studentsNewToday: 0,
  busesActive: 0,
  busesMaintenance: 0,
  busesInactive: 0,
  driversAvailable: 0,
  driversOnTrip: 0,
  driversOffDuty: 0,
  nanniesAssigned: 0,
  nanniesUnassigned: 0,
  totalTrips: 0,
  totalAttendance: 0,
  attendanceRate: 0,
  announcementTemplates: 0,
  scheduleProgressRate: 0,
  tripsCompletedToday: 0,
};

/**
 * 從 STORAGE 讀取 CBL Admin 平台概覽所需的真實數據。
 * 跨頁面共用 (overview / students / parents / buses / drivers / nannies / reports / announcements)。
 *
 * 注意: STORAGE 讀取是同步的 (localStorage), 所以這裡直接用 useMemo
 * 同步計算 — 不要用 useState(EMPTY) + useEffect(setStats) 的模式,
 * 那會讓第一次 render 先吐全 0, 下一幀才變真數 (stat tiles 閃一次)。
 */
export function useCblStats(clientId: string | undefined): CblStats {
  const stats = useMemo(() => {
    if (!clientId) return EMPTY_STATS;

    const students = STORAGE.students.getByClient(clientId);
    const parents = STORAGE.parents.getByClient(clientId);
    const buses = STORAGE.buses.getByClient(clientId);
    const drivers = STORAGE.drivers.getByClient(clientId);
    const nannies = STORAGE.nannies.getByClient(clientId);
    const trips = STORAGE.trips?.getByClient?.(clientId) ?? [];
    const allAnnouncements = STORAGE.announcements.getByClient(clientId);
    const activeAnnouncements = allAnnouncements.filter((a: any) => !a.isTemplate && a.isActive);
    const announcementTemplates = allAnnouncements.filter((a: any) => a.isTemplate);

    const todayStr = new Date().toISOString().split('T')[0];
    const studentsAssigned = students.filter((s: any) => s.busId).length;
    const studentsNewToday = students.filter((s: any) => s.createdAt?.startsWith(todayStr)).length;

    // 出席率計算
    const totalAttendances = trips.reduce((sum: number, t: any) => {
      return sum + (STORAGE.attendances?.getByTrip?.(t.id)?.length || 0);
    }, 0);
    const onTimeCount = trips.reduce((sum: number, t: any) => {
      const atts = STORAGE.attendances?.getByTrip?.(t.id) || [];
      return sum + atts.filter((a: any) => a.boardingStatus === 'on_time').length;
    }, 0);
    const attendanceRate = totalAttendances > 0 ? Math.round((onTimeCount / totalAttendances) * 100) : 0;

    const todayTripsList = trips.filter((t: any) => t.date === todayStr);
    const todayTripsTotal = todayTripsList.length;
    const todayTripsDone =
      todayTripsTotal === 0
        ? 0
        : todayTripsList.filter((t: any) => t.status !== 'cancelled').length;
    const tripsCompletedToday = todayTripsList.filter(
      (t: any) => t.status === 'completed',
    ).length;
    const scheduleProgressRate =
      todayTripsTotal === 0 ? 0 : Math.round((todayTripsDone / todayTripsTotal) * 100);

    return {
      students: students.length,
      parents: parents.length,
      buses: buses.length,
      drivers: drivers.length,
      nannies: nannies.length,
      activeTrips: trips.filter((t: any) => t.status === 'in_progress').length,
      announcements: activeAnnouncements.length,
      studentsAssigned,
      studentsUnassigned: students.length - studentsAssigned,
      studentsNewToday,
      busesActive: buses.filter((b: any) => b.status === 'active').length,
      busesMaintenance: buses.filter((b: any) => b.status === 'maintenance').length,
      busesInactive: buses.filter((b: any) => b.status === 'inactive').length,
      driversAvailable: drivers.filter((d: any) => d.status === 'available').length,
      driversOnTrip: drivers.filter((d: any) => d.status === 'on_trip').length,
      driversOffDuty: drivers.filter((d: any) => d.status === 'off_duty').length,
      nanniesAssigned: nannies.filter((n: any) => n.assignedBusId || n.busId).length,
      nanniesUnassigned: nannies.filter((n: any) => !n.assignedBusId && !n.busId).length,
      totalTrips: trips.length,
      totalAttendance: totalAttendances,
      attendanceRate,
      announcementTemplates: announcementTemplates.length,
      scheduleProgressRate,
      tripsCompletedToday,
    } as CblStats;
  }, [clientId]);

  return stats;
}