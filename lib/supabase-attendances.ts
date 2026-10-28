// Supabase attendance CRUD wrappers

import { camelize, snakify } from './supabase-case';

export interface AttendanceRow {
  id: string;
  tripId: string;
  studentId: string;
  waypointId: string;
  boardingTime: string | null;
  boardingStatus: 'on_time' | 'late' | 'no_show' | 'absent';
  boardingPhoto: string | null;
  boardedBy: string;
  dropoffTime: string | null;
  dropoffStatus: 'on_time' | 'late' | 'early' | 'no_show' | null;
  dropoffPhoto: string | null;
  dropoffBy: string | null;
  notes: string | null;
  isConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export const supabaseAttendances = {
  async getAll(): Promise<{ data: AttendanceRow[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_attendances').select('*');
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) };
  },

  async getByTrip(tripId: string): Promise<{ data: AttendanceRow[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_attendances')
      .select('*')
      .eq('trip_id', tripId);
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map(camelize) };
  },

  async upsert(row: AttendanceRow): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase
      .from('cbl_attendances')
      .upsert(snakify(row));
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async deleteByTrip(tripId: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    const { error } = await supabase
      .from('cbl_attendances')
      .delete()
      .eq('trip_id', tripId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },
};
