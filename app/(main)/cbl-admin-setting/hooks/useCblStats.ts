'use client';

import { useEffect, useState } from 'react';
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
};

/**
 * 從 STORAGE 讀取 CBL Admin 平台概覽所需的真實數據。
 * 跨頁面共用 (overview / students / parents / buses / drivers / nannies / reports / announcements)。
 */
export function useCblStats(clientId: string | undefined): CblStats {
  const [stats, setStats] = useState<CblStats>(EMPTY_STATS);

  useEffect(() => {
    if (!clientId) return;

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

    setStats({
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
    });
  }, [clientId]);

  return stats;
}