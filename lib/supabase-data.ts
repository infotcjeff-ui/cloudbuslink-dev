// Supabase 資料服務 - 從 Supabase 讀取資料並同步到 LocalStorage
// 這樣可以確保 localhost 和 livesite 看到相同的資料
import { supabase } from './supabase';
import { STORAGE, isInitialized, markInitialized } from './storage';
import type { 
  User, Client, Driver, Bus, Student, Parent, Nanny, 
  Trip, Attendance, Announcement, SiteSettings, Route 
} from './types';

const now = () => new Date().toISOString();

let syncInProgress = false;

// 從 Supabase 同步所有資料到 LocalStorage
export async function syncFromSupabase(): Promise<boolean> {
  if (syncInProgress) return false;
  syncInProgress = true;
  
  try {
    console.log('[Supabase] Starting data sync...');
    
    // 平行查詢所有資料
    const [
      clientsResult,
      usersResult,
      driversResult,
      busesResult,
      parentsResult,
      studentsResult,
      nanniesResult,
      tripsResult,
      attendancesResult,
      announcementsResult,
      routesResult,
    ] = await Promise.all([
      supabase.from('cbl_clients').select('*'),
      supabase.from('cbl_users').select('*'),
      supabase.from('cbl_drivers').select('*'),
      supabase.from('cbl_buses').select('*'),
      supabase.from('cbl_parents').select('*'),
      supabase.from('cbl_students').select('*'),
      supabase.from('cbl_nannies').select('*'),
      supabase.from('cbl_trips').select('*'),
      supabase.from('cbl_attendances').select('*'),
      supabase.from('cbl_announcements').select('*'),
      supabase.from('cbl_routes').select('*'),
    ]);

    // 檢查錯誤
    const errors: string[] = [];
    if (clientsResult.error) errors.push(`clients: ${clientsResult.error.message}`);
    if (usersResult.error) errors.push(`users: ${usersResult.error.message}`);
    if (driversResult.error) errors.push(`drivers: ${driversResult.error.message}`);
    if (busesResult.error) errors.push(`buses: ${busesResult.error.message}`);
    if (parentsResult.error) errors.push(`parents: ${parentsResult.error.message}`);
    if (studentsResult.error) errors.push(`students: ${studentsResult.error.message}`);
    if (nanniesResult.error) errors.push(`nannies: ${nanniesResult.error.message}`);
    if (tripsResult.error) errors.push(`trips: ${tripsResult.error.message}`);
    if (attendancesResult.error) errors.push(`attendances: ${attendancesResult.error.message}`);
    if (announcementsResult.error) errors.push(`announcements: ${announcementsResult.error.message}`);
    if (routesResult.error) errors.push(`routes: ${routesResult.error.message}`);

    if (errors.length > 0) {
      console.error('[Supabase] Sync errors:', errors);
      // 不阻斷，仍使用已取得的資料
    }

    // 轉換 snake_case 為 camelCase 並存入 LocalStorage
    const clients = (clientsResult.data || []).map(camelize);
    const users = (usersResult.data || []).map(camelize);
    const drivers = (driversResult.data || []).map(camelize);
    const buses = (busesResult.data || []).map(camelize);
    const parents = (parentsResult.data || []).map(camelize);
    const students = (studentsResult.data || []).map(camelize);
    const nannies = (nanniesResult.data || []).map(camelize);
    const trips = (tripsResult.data || []).map(camelize);
    const attendances = (attendancesResult.data || []).map(camelize);
    const announcements = (announcementsResult.data || []).map(camelize);
    const routes = (routesResult.data || []).map(camelize);

    // 存入 LocalStorage
    STORAGE.clients.setAll(clients as Client[]);
    STORAGE.users.setAll(users as User[]);
    STORAGE.drivers.setAll(drivers as Driver[]);
    STORAGE.buses.setAll(buses as Bus[]);
    STORAGE.parents.setAll(parents as Parent[]);
    STORAGE.students.setAll(students as Student[]);
    STORAGE.nannies.setAll(nannies as Nanny[]);
    STORAGE.trips.setAll(trips as Trip[]);
    STORAGE.attendances.setAll(attendances as Attendance[]);
    STORAGE.announcements.setAll(announcements as Announcement[]);
    STORAGE.routes.setAll(routes as Route[]);

    // 設定默認 settings (如果還沒有)
    if (clients.length > 0) {
      const client = clients[0] as Client;
      const existingSettings = STORAGE.settings.getByClient(client.id);
      if (!existingSettings.title || existingSettings.title === 'CloudBusLink') {
        STORAGE.settings.set({
          clientId: client.id,
          logo: client.logo as string | null,
          title: `${client.name} - CloudBusLink`,
          primaryColor: client.primaryColor,
          phone: client.phone,
          email: client.email,
          address: client.address,
          studentIdPrefix: 'stu-',
          academicYear: client.academicYear,
          academicYearStart: 9,
          pushNotifications: true,
          emailNotifications: false,
          updatedAt: now(),
        });
      }
    }

    markInitialized();
    console.log('[Supabase] Data sync completed successfully');
    return true;
  } catch (error) {
    console.error('[Supabase] Sync failed:', error);
    return false;
  } finally {
    syncInProgress = false;
  }
}

// 將 snake_case 轉換為 camelCase
function camelize(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelize);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = obj[key];
    
    // 遞歸處理巢狀物件
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[camelKey] = camelize(value);
    } else if (Array.isArray(value)) {
      result[camelKey] = value.map((item: any) => 
        typeof item === 'object' ? camelize(item) : item
      );
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

// 初始化並同步資料
export async function initWithSupabase(): Promise<boolean> {
  if (isInitialized()) return true;
  return syncFromSupabase();
}

// 檢查 Supabase 是否可用
export function isSupabaseAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
