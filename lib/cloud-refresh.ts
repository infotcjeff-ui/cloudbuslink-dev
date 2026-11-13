// ============================================================================
//  雲端重新整理引擎 (真・重新整理)
//
//  為什麼需要這個檔案:
//   原本各頁面的「重新整理」按鈕只做 `window.dispatchEvent(new CustomEvent('cbl-xxx-refresh'))` ——
//   那只是「重新讀一次 localStorage」, 根本沒有向 Supabase 拉資料。
//   結果: 另一台裝置 / 另一位管理員在雲端改了資料, 這邊按「重新整理」完全沒反應。
//
//  這個檔案提供一個共用的 refreshCloud() :
//   1. 真的打 Supabase select 每一張表
//   2. 把結果合併回 localStorage (用 mergeCloudRecords, 保護「本機先寫、雲端後推」的資料)
//   3. dispatch 對應的 cbl-*-refresh 事件 → 各 console 的 UI 立即重畫
//
//  設計重點:
//   - 單一 Promise 快取: 同一時間只允許一個 refresh 在跑, 後來者共用同一個結果
//     (避免使用者狂按 → 打爆 Supabase API)
//   - 逐表容錯: 某一張表失敗 (例如 migration 沒跑、欄位不存在) 不影響其他表
//   - merge 而非覆蓋: 沒推上雲端的本機資料不會被洗掉 (見 lib/storage.ts mergeCloudRecords)
// ============================================================================

import { STORAGE, mergeCloudRecords } from './storage';
import { camelize } from './supabase-case';
import { isSupabaseAvailable } from './supabase-data';
import {
  mergeRoutesWithTombstones,
  retryRouteDeletes,
} from './route-tombstones';
import {
  mergeTripsWithTombstones,
  retryTripDeletes,
} from './trip-tombstones';
import type {
  Client,
  Company,
  User,
  Driver,
  Bus,
  Student,
  Parent,
  Nanny,
  Route,
  Trip,
  Attendance,
  Announcement,
  IncidentReport,
} from './types';
import type { AcademicYear } from './academic-year';

/** 單次 refresh 的結果摘要 */
export interface CloudRefreshResult {
  /** 整體是否成功 (全部表都沒出錯才算 true) */
  success: boolean;
  /** 每張表的合併統計 */
  tables: Record<string, { added: number; updated: number; removed: number; keptLocal: number }>;
  /** 失敗的表 + 原因 */
  errors: Record<string, string>;
  /** 這次有沒有真的改到資料 */
  changed: boolean;
}

/** 重新整理時要通知的 event 名稱 (對應各 console 的監聽) */
const REFRESH_EVENTS = [
  'cbl-clients-refresh',
  'cbl-companies-refresh',
  'cbl-users-refresh',
  'cbl-drivers-refresh',
  'cbl-buses-refresh',
  'cbl-students-refresh',
  'cbl-parents-refresh',
  // 保姆事件有兩種拼法並存 → 兩種都要送, 否則只有一半的監聽端收到
  'cbl-nannys-refresh',
  'cbl-nannies-refresh',
  'cbl-routes-refresh',
  'cbl-trips-refresh',
  'cbl-attendances-refresh',
  'cbl-announcements-refresh',
  'cbl-incidents-refresh',
] as const;

/**
 * 在跑的 refresh (單例)。
 * - 同時只允許一個 refresh 在跑
 * - 後來者直接 await 同一個 Promise → 不會重複打 API
 */
let inFlight: Promise<CloudRefreshResult> | null = null;

/**
 * 把結果寫進 localStorage 的 helper。
 *
 * 註: localRows 必須由呼叫端明確傳入 (不能靠 STORAGE[entityKey] 動態索引) ——
 *     因為 STORAGE 的子物件名稱 (clients / drivers / …) 剛好等於 entityKey,
 *     但這樣寫會讓型別退化成 any, 而且 entityKey 是 'attendances' 這種
 *     對應 getAll 的 key, 萬一將來改名就會靜默壞掉。
 */
function mergeInto<T extends { id: string }>(
  entityKey: string,
  localRows: T[],
  dbRows: T[],
  setAll: (rows: T[]) => void,
  opts?: {
    compare?: (local: T, db: T) => boolean;
    keyOf?: (row: T) => string;
  },
) {
  return mergeCloudRecords(entityKey, localRows, dbRows, setAll, opts);
}

/**
 * 真的從 Supabase 拉資料 + 合併回 localStorage + 通知 UI。
 *
 * @param options.only 只刷新指定的實體 (例如 ['buses']) — 不給就全部刷新
 */
export async function refreshCloud(options?: {
  only?: string[];
}): Promise<CloudRefreshResult> {
  // 已有 refresh 在跑 → 共用結果 (避免打爆 API)
  if (inFlight) return inFlight;

  const run = async (): Promise<CloudRefreshResult> => {
    const result: CloudRefreshResult = {
      success: true,
      tables: {},
      errors: {},
      changed: false,
    };

    if (!isSupabaseAvailable()) {
      result.success = false;
      result.errors.supabase = 'Supabase 未設定 (缺少 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)';
      return result;
    }

    const { supabase } = await import('./supabase');
    const only = options?.only ? new Set(options.only) : null;
    const should = (key: string) => !only || only.has(key);

    /**
     * 拉一張表並合併。
     * 失敗只記錄, 不中斷其他表 (例如 migration 沒跑 → 該表不存在)。
     */
    const pull = async <T extends { id: string }>(
      key: string,
      table: string,
      getLocal: () => T[],
      setAll: (rows: T[]) => void,
      opts?: {
        compare?: (local: T, db: T) => boolean;
        keyOf?: (row: T) => string;
      },
    ) => {
      if (!should(key)) return;
      try {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
          result.errors[table] = error.message;
          result.success = false;
          return;
        }
        const rows = (data || []).map(camelize) as T[];
        // DB 完全沒有資料 → 不覆蓋本機 (避免把資料清空)
        if (rows.length === 0) return;
        const stats = mergeInto(key, getLocal(), rows, setAll, opts);
        result.tables[key] = {
          added: stats.added,
          updated: stats.updated,
          removed: stats.removed,
          keptLocal: stats.keptLocal,
        };
        if (stats.added > 0 || stats.updated > 0 || stats.removed > 0) {
          result.changed = true;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors[table] = msg;
        result.success = false;
      }
    };

    // ---- 租戶 / 帳號層 ----
    await pull<Client>('clients', 'cbl_clients', () => STORAGE.clients.getAll(), (r) => STORAGE.clients.setAll(r));
    await pull<Company>('companies', 'cbl_companies', () => STORAGE.companies.getAll(), (r) => STORAGE.companies.setAll(r));
    // ⚠️ 帳號不能整批覆蓋 ——
    //   帳號是「本機先寫、雲端後推」的流程: 管理員新增家長 / 保姆時先寫
    //   localStorage, 背景再 push 到 cbl_users。push 還沒完成時整批覆蓋
    //   會把剛建立的帳號洗掉 → 登入回「帳戶不存在」。
    //   → pull() 走 mergeCloudRecords() → 保留尚未 push 成功的本機帳號。
    await pull<User>('users', 'cbl_users', () => STORAGE.users.getAll(), (r) => STORAGE.users.setAll(r));

    // ---- 營運層 ----
    await pull<Driver>('drivers', 'cbl_drivers', () => STORAGE.drivers.getAll(), (r) => STORAGE.drivers.setAll(r));
    await pull<Bus>('buses', 'cbl_buses', () => STORAGE.buses.getAll(), (r) => STORAGE.buses.setAll(r));
    // ⚠️ 學生的「就讀學校」三欄 (school_type / school_district / school_name)
    //   來自 migration 0015。若該 migration 還沒套到 live DB,
    //   雲端回傳的 row 不會有這三欄 (PostgREST 省略不存在於 schema 的欄位),
    //   mergeCloudRecords 是「DB 為準」→ 會把本機已填好的學校資料洗成 null。
    //   → 先檢查 DB row 有沒有 school_name 欄位; 沒有就保留本機這三欄。
    await pull<Student>('students', 'cbl_students', () => STORAGE.students.getAll(), (r) => STORAGE.students.setAll(r), {
      // 雲端 row 沒有 school_name 這個 key → 代表 DB 還沒套 0015 migration
      //   → 保留本機的學校欄位 (不要用 null 蓋掉)
      // ⚠️ 同理: 學年欄位 (academicYear / personKey) 來自 migration 0017,
      //    DB 還沒套時 PostgREST 會省略這些 key → 也要保留本機的值,
      //    否則「DB 為準」會把本機的學年洗成 undefined (資料看起來像不屬於任何學年)。
      compare: (local, db) => {
        const missingSchool =
          !('schoolName' in db) &&
          Boolean(local.schoolName || local.schoolDistrict || local.schoolType);
        const missingYear =
          !('academicYear' in db) &&
          Boolean(local.academicYear || local.personKey);
        return missingSchool || missingYear;
      },
    });
    await pull<Parent>('parents', 'cbl_parents', () => STORAGE.parents.getAll(), (r) => STORAGE.parents.setAll(r));
    await pull<Nanny>('nannies', 'cbl_nannies', () => STORAGE.nannies.getAll(), (r) => STORAGE.nannies.setAll(r));
    // ⚠️ 學年登錄 (migration 0016) — 雲端為準 (isCurrent / status 決定寫入蓋章),
    //    但本機可能還沒推上去的新學年要保留 → 用 academicYearStorage.mergeAll。
    if (should('academicYears')) {
      try {
        const { data, error } = await supabase.from('cbl_academic_years').select('*');
        if (error) {
          result.errors.cbl_academic_years = error.message;
          result.success = false;
        } else {
          const rows = (data || []).map(camelize) as AcademicYear[];
          if (rows.length > 0) {
            STORAGE.academicYears.mergeAll(rows);
            result.tables.academicYears = { added: rows.length, updated: 0, removed: 0, keptLocal: 0 };
            result.changed = true;
          }
        }
      } catch (e) {
        result.errors.cbl_academic_years = e instanceof Error ? e.message : String(e);
        result.success = false;
      }
    }
    // ⚠️ routes 不能用一般的 merge (會把「本機已刪、雲端還在」的路線拉回來)
    //   → 用墓碑過濾: 帶墓碑 id 的路線一律剔除, 並重試雲端刪除。
    if (should('routes')) {
      try {
        const { data, error } = await supabase.from('cbl_routes').select('*');
        if (error) {
          result.errors.cbl_routes = error.message;
          result.success = false;
        } else {
          const rows = (data || []).map(camelize) as Route[];
          const before = STORAGE.routes.getAll();
          const { merged, staleInCloud } = mergeRoutesWithTombstones(before, rows);
          const removed = before.length - merged.filter((r) => rows.some((d) => d.id === r.id)).length;
          STORAGE.routes.setAll(merged);
          result.tables.routes = {
            added: merged.length - before.length,
            updated: 0,
            removed: Math.max(0, removed),
            keptLocal: merged.length,
          };
          if (staleInCloud.length > 0) {
            console.warn(
              `[CloudRefresh] ${staleInCloud.length} 筆路線在雲端仍存在, 重試刪除: ${staleInCloud.join(', ')}`,
            );
            void retryRouteDeletes(staleInCloud);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.cbl_routes = msg;
        result.success = false;
      }
    }

    // ---- 動態層 (有 updatedAt → 本機較新時保留本機) ----
    const byUpdatedAt = <T extends { id: string; updatedAt?: string | null }>(
      local: T,
      db: T,
    ) => {
      if (!local.updatedAt || !db.updatedAt) return false;
      return local.updatedAt > db.updatedAt;
    };

    // ⚠️ trips 不能用一般的 merge (會把「本機已刪、雲端還在」或
    //   「別處已刪、本機還在」的班次拉回來 → 保姆端刪後仍顯示, 即本次 bug)
    //   → 用墓碑過濾 + 已同步 id 比對: 帶墓碑 id 一律剔除;
    //     曾推上雲端但雲端已無此 id → 在別處被刪, 跟著刪。
    if (should('trips')) {
      try {
        const { data, error } = await supabase.from('cbl_trips').select('*');
        if (error) {
          result.errors.cbl_trips = error.message;
          result.success = false;
        } else {
          const rows = (data || []).map(camelize) as Trip[];
          if (rows.length > 0) {
            const before = STORAGE.trips.getAll().length;
            // mergeAll 內已含: 墓碑剔除 + 跨裝置刪除傳遞 + synced 記錄 + 雲端重試
            STORAGE.trips.mergeAll(rows);
            const after = STORAGE.trips.getAll().length;
            result.tables.trips = {
              added: Math.max(0, after - before),
              updated: 0,
              removed: Math.max(0, before - after),
              keptLocal: after,
            };
            if (before !== after) result.changed = true;
          } else {
            // 雲端完全沒有班次 → 仍要套用墓碑 (避免已刪的復活)
            const { merged } = mergeTripsWithTombstones(
              STORAGE.trips.getAll(),
              [],
            );
            STORAGE.trips.setAll(merged);
            const pending: string[] = [];
            try {
              const { getPendingTripDeleteIds } = await import('./trip-tombstones');
              pending.push(...getPendingTripDeleteIds());
            } catch { /* ignore */ }
            if (pending.length > 0) void retryTripDeletes(pending);
          }
        }
      } catch (e) {
        result.errors.cbl_trips = e instanceof Error ? e.message : String(e);
        result.success = false;
      }
    }
    await pull<Attendance>('attendances', 'cbl_attendances', () => STORAGE.attendances.getAll(), (r) => STORAGE.attendances.setAll(r), {
      compare: byUpdatedAt,
      // 打卡記錄的 id 在本機與 DB 可能不同 (本機 upsert 會 genId),
      // 但業務鍵是 (tripId, studentId, waypointId) → 用它合併才不會重複計數
      keyOf: (a) => `${a.tripId}__${a.studentId}__${a.waypointId}`,
    });

    // 異常回報 — 表未建 (migration 0022 未跑) 時靜默跳過, 不阻斷
    await pull<IncidentReport>('incidents', 'cbl_incident_reports', () => STORAGE.incidents.getAll(), (r) => STORAGE.incidents.setAll(r), {
      compare: byUpdatedAt,
    });

    // 公告用專屬的 mergeAll (要保留「本機先寫、尚未推上雲端」的公告)
    if (should('announcements')) {
      try {
        const { data, error } = await supabase.from('cbl_announcements').select('*');
        if (error) {
          result.errors.cbl_announcements = error.message;
          result.success = false;
        } else {
          const rows = (data || []).map(camelize) as Announcement[];
          if (rows.length > 0) {
            const before = STORAGE.announcements.getAll();
            STORAGE.announcements.mergeAll(rows);
            const after = STORAGE.announcements.getAll();
            if (before.length !== after.length) result.changed = true;
            result.tables.announcements = {
              added: Math.max(0, after.length - before.length),
              updated: 0,
              removed: Math.max(0, before.length - after.length),
              keptLocal: 0,
            };
          }
        }
      } catch (e) {
        result.errors.cbl_announcements = e instanceof Error ? e.message : String(e);
        result.success = false;
      }
    }

    // ---- 通知所有 console 重畫 ----
    if (typeof window !== 'undefined') {
      REFRESH_EVENTS.forEach((ev) => {
        try {
          window.dispatchEvent(new CustomEvent(ev));
        } catch {
          /* ignore */
        }
      });
    }

    return result;
  };

  inFlight = run()
    .catch((e) => {
      const result: CloudRefreshResult = {
        success: false,
        tables: {},
        errors: { unknown: e instanceof Error ? e.message : String(e) },
        changed: false,
      };
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * 產生一段人話摘要, 給 toast 用。
 * 沒變 → 「已是最新」; 有變 → 「新增 X 筆 / 更新 Y 筆」。
 */
export function describeRefresh(result: CloudRefreshResult): string {
  if (!result.success && Object.keys(result.errors).length > 0) {
    const first = Object.values(result.errors)[0];
    return `重新整理失敗：${first}`;
  }
  let added = 0;
  let updated = 0;
  Object.values(result.tables).forEach((t) => {
    added += t.added;
    updated += t.updated;
  });
  if (!result.changed) return '資料已是最新';
  const parts: string[] = [];
  if (added > 0) parts.push(`新增 ${added} 筆`);
  if (updated > 0) parts.push(`更新 ${updated} 筆`);
  return parts.length > 0 ? parts.join(' / ') : '資料已是最新';
}
