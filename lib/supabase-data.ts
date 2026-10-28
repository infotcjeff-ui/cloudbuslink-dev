// Supabase 資料服務 - 從 Supabase 讀取資料並同步到 LocalStorage
// 這樣可以確保 localhost 和 livesite 看到相同的資料
import { supabase } from './supabase';
import { STORAGE, isInitialized, markInitialized } from './storage';
import { camelize, snakify } from './supabase-case';
import { dispatchNannyRefresh } from './cbl-events';
import { resolveSystemConfig } from './system-config';
import type {
  User, Client, Company, Driver, Bus, Student, Parent, Nanny,
  Trip, Attendance, Announcement, SiteSettings, Route
} from './types';

const now = () => new Date().toISOString();

let syncInProgress = false;
let syncQueue: Promise<boolean> = Promise.resolve(true);

/**
 * 從 Supabase 同步所有資料到 LocalStorage
 * - 平行查詢所有表, camelize 後寫回 STORAGE
 * - 設有 syncInProgress 守衛防重入, 但若有多個 caller 會排隊等待
 * - merge 邏輯: 只在 Supabase 有資料時才覆蓋 localStorage (避免清空)
 */
export async function syncFromSupabase(): Promise<boolean> {
  // 排隊: 若有人在 sync, 等他跑完再排下一輪
  //   關鍵: 排隊的 caller 會等到 in-progress sync 真的完成 (而不是立即回 true)
  //   這樣 useScheduleTrips 進場時若遇到 bus 頁的 sync 還在跑, 仍會等到資料寫入 localStorage 才 refresh
  const run = async (): Promise<boolean> => {
    if (syncInProgress) {
      console.log('[Supabase] sync already in progress, waiting for completion...');
      // 等到目前 sync 結束 (syncInProgress 變回 false) — 用 polling
      const start = Date.now();
      while (syncInProgress && Date.now() - start < 10_000) {
        await new Promise((r) => setTimeout(r, 30));
      }
      console.log('[Supabase] wait for in-progress sync finished, result: already-completed');
      return true;
    }
    syncInProgress = true;
    console.log('[Supabase] Starting data sync (queued)...');
    try {
      return await doSync();
    } finally {
      syncInProgress = false;
    }
  };
  const next = syncQueue.then(run, run);
  syncQueue = next.catch(() => true);
  return next;
}

async function doSync(): Promise<boolean> {
  try {
    // 平行查詢所有資料
    const [
      clientsResult,
      companiesResult,
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
      // 新公司表可能尚未執行 migration 0007 → 失敗不阻斷 (見下方 companiesResult 處理)
      supabase.from('cbl_companies').select('*'),
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
    // cbl_companies 表不存在 (migration 0007 未跑) 時 data 為 null → 視為空陣列即可
    const companies = (companiesResult.data || []).map(camelize);
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

    // 合併模式: 如果 Supabase 沒有資料但 LocalStorage 有, 不要覆蓋
    // - 目的: 避免 Supabase 為空時把現有 LocalStorage 資料清空
    // - 邏輯: 只在 Supabase 有資料時才更新 LocalStorage
    if (clients.length > 0) STORAGE.clients.setAll(clients as Client[]);
    if (companies.length > 0) STORAGE.companies.setAll(companies as Company[]);
    if (typeof window !== 'undefined' && companies.length > 0) {
      try { window.dispatchEvent(new CustomEvent('cbl-companies-refresh')); } catch { /* ignore */ }
    }
    if (users.length > 0) STORAGE.users.setAll(users as User[]);
    if (drivers.length > 0) STORAGE.drivers.setAll(drivers as Driver[]);
    if (buses.length > 0) STORAGE.buses.setAll(buses as Bus[]);
    if (parents.length > 0) STORAGE.parents.setAll(parents as Parent[]);
    if (students.length > 0) STORAGE.students.setAll(students as Student[]);
    if (nannies.length > 0) STORAGE.nannies.setAll(nannies as Nanny[]);
    // trips / attendances 用 mergeAll 而非 setAll ——
    // 理由: 這兩張表是「本機先寫、雲端後推」的流程。
    //   setAll 會用 DB 的舊快照整批覆蓋 localStorage, 導致:
    //     - 管理員在後台新建的班次, 在 push 完成前重新整理就消失
    //     - 保姆剛打上的卡, 在同步完成前被舊資料蓋掉
    //   mergeAll 以 updatedAt 較新者為準, 只保留本機較新的變更。
    //   註: 兩者皆空時維持原狀 (不清空), 與其他表一致。
    if (trips.length > 0) STORAGE.trips.mergeAll(trips as Trip[]);
    if (attendances.length > 0) STORAGE.attendances.mergeAll(attendances as Attendance[]);
    // 公告用 merge 而不是 setAll — 示範公告 (ann-001) 只在 localStorage,
    // 用 setAll 覆蓋會讓它在第一次 sync 後消失。
    if (announcements.length > 0) STORAGE.announcements.mergeAll(announcements as Announcement[]);
    if (routes.length > 0) STORAGE.routes.setAll(routes as Route[]);

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

    // 同步完成後主動通知所有 open 的 page 重新從 STORAGE 讀取
    // 解決: 使用者在 sync 尚未完成時就 navigate 到 /bus/drivers,
    // 導致 page initial mount 讀到空 STORAGE, 必須手動按「重新整理」才能看到資料。
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('cbl-drivers-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-parents-refresh'));
        // 保姆事件有兩種拼法並存 → 用共用 helper 同時送兩種 (相容舊監聽端)
        dispatchNannyRefresh();
        window.dispatchEvent(new CustomEvent('cbl-trips-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-routes-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-attendances-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-clients-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
      } catch (e) {
        console.warn('[Supabase] Failed to dispatch refresh events:', e);
      }
    }

    return true;
  } catch (error) {
    console.error('[Supabase] Sync failed:', error);
    return false;
  }
}

// 初始化並同步資料
export async function initWithSupabase(): Promise<boolean> {
  if (isInitialized()) return true;
  return syncFromSupabase();
}

// 檢查 Supabase 是否可用
//
// 注意: 不能只讀 process.env —— /system-admin-setting 允許 runtime 覆寫
// (override → cloud → env), 這裡要問「實際生效的設定是否完整」。
export function isSupabaseAvailable(): boolean {
  const { supabase: cfg } = resolveSystemConfig();
  return !!(cfg.url && cfg.anonKey);
}
