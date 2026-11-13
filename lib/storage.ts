// localStorage ?????????- Demo?????
// ?????? Supabase ????????????????

import type {
  User, UserRole, Client, Company, Driver, Bus, Student, Parent, Nanny,
  Trip, Attendance, Announcement, SiteSettings, Route, IncidentReport,
  PaymentRecord, PaymentStatus,
} from './types';
import type { AcademicYear } from './academic-year';
import { DEFAULT_ACADEMIC_YEAR, isValidAcademicYear, getAcademicYearForDate, filterByAcademicYear as filterByAcademicYearImpl } from './academic-year';
import { mergeTripsWithTombstones, retryTripDeletes } from './trip-tombstones';

const STORAGE_KEYS = {
  AUTH: 'cbl_auth',
  USERS: 'cbl_users',
  CLIENTS: 'cbl_clients',
  COMPANIES: 'cbl_companies',
  DRIVERS: 'cbl_drivers',
  BUSES: 'cbl_buses',
  STUDENTS: 'cbl_students',
  PARENTS: 'cbl_parents',
  NANNIES: 'cbl_nannies',
  TRIPS: 'cbl_trips',
  ROUTES: 'cbl_routes',
  ATTENDANCES: 'cbl_attendances',
  ANNOUNCEMENTS: 'cbl_announcements',
  // 公告已讀 / 已看過記錄 (取代 localStorage)
  // value: { [userId_clientId]: string[] }  內容為 announcement.id
  ANNOUNCEMENT_READS: 'cbl_announcement_reads',
  // 每則公告的「每用戶已看過次數」, 用來實作 maxViewsPerUser 上限
  // value: { [userId_clientId]: { [announcementId]: number } }
  ANNOUNCEMENT_VIEWS: 'cbl_announcement_views',
  // ?????????? ? ????????? client ???????
  // ?? AnnouncementPopup?value: { [userId_clientId]: boolean }
  // true = ?????, ???????????? dialog?
  // ?????? /settings/announcements ?????
  ANNOUNCEMENT_POPUP_DISABLED: 'cbl_announcement_popup_disabled',
  // 使用者勾選「不再顯示此通告」而被隱藏的公告 id
  // value: { [userId_clientId]: string[] }  內容為 announcement.id
  //
  // 用途: 讓「限期內每次進入主頁都彈出」的公告, 可以由使用者逐則關閉。
  //   - 未勾選 → 下次進入主頁照樣彈出
  //   - 勾選   → 這則公告不再自動彈出 (但仍可在鈴鐺下拉中手動查看)
  ANNOUNCEMENT_DISMISSED: 'cbl_announcement_dismissed',
  SETTINGS: 'cbl_settings',
  // /system-admin-setting 的平台層設定 (可覆寫環境變數 + GPS provider)
  // value: SystemConfig — 非機密欄位會另外同步到 Supabase cbl_system_config
  //       機密欄位 (gps.apiKey) 只留本機, 永不上雲
  SYSTEM_CONFIG: 'cbl_system_config',
  INITIALIZED: 'cbl_initialized',
  RECENT_BUS_SEARCHES: 'cbl_recent_bus_searches',
  // /cbl-admin-setting/user 功能權限矩陣
  // value: { [userId]: { [featureKey]: boolean } }
  // 之後接 cbl_user_permissions (Supabase) 時, 把 storage 介面換成 supabase
  // .from('cbl_user_permissions').select/upsert, 其他程式碼不需動。
  USER_FEATURE_PERMISSIONS: 'cbl_user_feature_permissions',
  // 已同步到 Supabase 的公告 id 清單
    // value: string[]
  //
  // 用途: 讓 mergeAll 能分辨「這則公告是從沒進過 DB, 還是已經在 DB 被刪了」
  //   - 從沒進過 DB (本機先寫、尚未推上雲端) → 保留在 localStorage
  //   - 已經在 DB 但現在不見了 → 是在別的裝置被刪掉 → 也要跟著刪
  ANNOUNCEMENTS_SYNCED_IDS: 'cbl_announcements_synced_ids',
  // 每個實體「已成功推送到 Supabase」的 id 清單
  // value: { [entityKey: string]: string[] }
  //
  // 用途: 讓 mergeCloudRecords 能分辨「這筆是從沒推上雲端 (保留在 localStorage)」
  //   還是「推上過、但後來在別的裝置被刪 (跟著刪掉)」
  //   這是「本機先寫、雲端後推」流程能安全做全量 pull 的前提。
  SYNCED_ENTITY_IDS: 'cbl_synced_entity_ids',
  // 學年登錄 (對應 Supabase cbl_academic_years)
  // value: AcademicYear[] — 本機快取, 雲端為準
  ACADEMIC_YEARS: 'cbl_academic_years',
  // 異常回報留底 (對應 Supabase cbl_incident_reports)
  // value: IncidentReport[] — 本機快取, 雲端為準
  INCIDENTS: 'cbl_incidents',
  // 異常回報已讀記錄 (system_admin / super_admin 鈴鐺紅點用)
  // value: { [userId_clientId]: string[] } 內容為 incident.id
  INCIDENT_READS: 'cbl_incident_reads',
  // 付款記錄 (對應 Supabase cbl_payment_records)
  // value: PaymentRecord[] — 本機快取, 雲端為準
  PAYMENTS: 'cbl_payments',
} as const;

// ?????????
function get<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Error reading ${key}:`, e);
    return fallback;
  }
}

// ????????
function set<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing ${key}:`, e);
  }
}

// ??????? ID
export function genId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============= Auth =============
export const authStorage = {
  get(): User | null {
    return get<User | null>(STORAGE_KEYS.AUTH, null);
  },
  set(user: User) {
    set(STORAGE_KEYS.AUTH, user);
  },
  clear() {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
  },
};

// ============= Users =============
export const userStorage = {
  getAll(): User[] {
    return get<User[]>(STORAGE_KEYS.USERS, []);
  },
  setAll(users: User[]) {
    set(STORAGE_KEYS.USERS, users);
  },
  findByPhone(phone: string): User | undefined {
    return this.getAll().find(u => u.phone === phone);
  },
  /**
   * 依「登入帳號」查找 — 帳號可以是電話號碼, 也可以是自訂的帳戶名稱。
   *
   * 為什麼需要這個 (而不是只靠 findByPhone):
   *   保姆 / 家長現在有「帳戶名稱」欄位, 登入時輸入帳戶名稱也要能找到人。
   *   電話優先 (維持既有行為: 帳號名稱可以跟別人的電話撞名, 電話比較不會)。
   */
  findByAccount(account: string): User | undefined {
    const trimmed = (account || '').trim();
    if (!trimmed) return undefined;
    const all = this.getAll();
    // 1) 先比電話 (完全相同)
    const byPhone = all.find(u => u.phone === trimmed);
    if (byPhone) return byPhone;
    // 2) 再比帳戶名稱 (不分大小寫)
    const lower = trimmed.toLowerCase();
    return all.find(u => (u.accountName || '').trim().toLowerCase() === lower);
  },
  /** 帳戶名稱是否已被佔用 (同一 tenant 內唯一) */
  isAccountNameTaken(
    accountName: string,
    opts?: { clientId?: string; exceptUserId?: string },
  ): boolean {
    const lower = (accountName || '').trim().toLowerCase();
    if (!lower) return false;
    return this.getAll().some((u) => {
      if (opts?.exceptUserId && u.id === opts.exceptUserId) return false;
      if ((u.accountName || '').trim().toLowerCase() !== lower) return false;
      // 不同機構之間的同名帳號可以接受 (登入時會在所有帳號中找)
      if (opts?.clientId && u.clientId && u.clientId !== opts.clientId) return false;
      return true;
    });
  },
  add(user: User) {
    const all = this.getAll();
    all.push(user);
    this.setAll(all);
  },
  update(id: string, patch: Partial<User>) {
    const all = this.getAll();
    const idx = all.findIndex(u => u.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.USERS, this.getAll().filter(u => u.id !== id));
  },
};

// ============= Clients =============
export const clientStorage = {
  getAll(): Client[] {
    return get<Client[]>(STORAGE_KEYS.CLIENTS, []);
  },
  setAll(clients: Client[]) {
    set(STORAGE_KEYS.CLIENTS, clients);
  },
  getById(id: string): Client | undefined {
    return this.getAll().find(c => c.id === id);
  },
  add(client: Client) {
    const all = this.getAll();
    all.push(client);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Client>) {
    const all = this.getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.CLIENTS, this.getAll().filter(c => c.id !== id));
  },
};

// ============= Companies (機構/公司) =============
//
// 選項 B 的公司層 (cbl_companies):
// - 僅保姆 / 司機 / 校巴 / super_admin 相關 User 可選配 companyId (非必填)
// - 學生/家長/班次/路線/公告/接送記錄只掛學校 (clientId)，不掛公司
export const companyStorage = {
  getAll(): Company[] {
    return get<Company[]>(STORAGE_KEYS.COMPANIES, []);
  },
  setAll(companies: Company[]) {
    set(STORAGE_KEYS.COMPANIES, companies);
  },
  getById(id: string): Company | undefined {
    return this.getAll().find(c => c.id === id);
  },
  add(company: Company) {
    const all = this.getAll();
    all.push(company);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Company>) {
    const all = this.getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.COMPANIES, this.getAll().filter(c => c.id !== id));
  },
};

// ============= Drivers =============
export const driverStorage = {
  getAll(): Driver[] {
    return get<Driver[]>(STORAGE_KEYS.DRIVERS, []);
  },
  getByClient(clientId: string): Driver[] {
    return this.getAll().filter(d => d.clientId === clientId);
  },
  // 按所屬機構/公司過濾 (companyId 可空：只傳回有填該公司的)
  getByCompany(companyId: string): Driver[] {
    return this.getAll().filter(d => d.companyId === companyId);
  },
  setAll(drivers: Driver[]) {
    set(STORAGE_KEYS.DRIVERS, drivers);
  },
  getById(id: string): Driver | undefined {
    return this.getAll().find(d => d.id === id);
  },
  add(driver: Driver) {
    const all = this.getAll();
    all.push(driver);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Driver>) {
    const all = this.getAll();
    const idx = all.findIndex(d => d.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.DRIVERS, this.getAll().filter(d => d.id !== id));
  },
};

// ============= Buses =============
export const busStorage = {
  getAll(): Bus[] {
    return get<Bus[]>(STORAGE_KEYS.BUSES, []);
  },
  getByClient(clientId: string): Bus[] {
    return this.getAll().filter(b => b.clientId === clientId);
  },
  // 按所屬機構/公司過濾 (companyId 可空：只傳回有填該公司的)
  getByCompany(companyId: string): Bus[] {
    return this.getAll().filter(b => b.companyId === companyId);
  },
  setAll(buses: Bus[]) {
    set(STORAGE_KEYS.BUSES, buses);
  },
  getById(id: string): Bus | undefined {
    return this.getAll().find(b => b.id === id);
  },
  add(bus: Bus) {
    const all = this.getAll();
    all.push(bus);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Bus>) {
    const all = this.getAll();
    const idx = all.findIndex(b => b.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.BUSES, this.getAll().filter(b => b.id !== id));
  },
};

// ============= Students =============
/**
 * 由 student_id 前綴推導學年 (stu-2627001 → '2627')。
 *
 * ⚠️ 這是「舊本機資料」的相容處理 ——
 *    localStorage 的資料早於 migration 0017, 沒有 academicYear 欄位。
 *    但 student_id 裡有學年前綴, 足以準確推導出來 (比 DB 的啟發式可靠)。
 */
function deriveYearFromStudentId(studentId: string | undefined): string | null {
  if (!studentId) return null;
  const m = studentId.match(/^stu-([0-9]{4})/);
  return m ? m[1] : null;
}

export const studentStorage = {
  getAll(): Student[] {
    const rows = get<Student[]>(STORAGE_KEYS.STUDENTS, []);
    // ⚠️ 舊資料補學年: 在讀取時補, 不寫回 localStorage
    //    (避免每次讀都產生一次 write, 拖慢整個 app 的啟動)
    let needsFix = false;
    const fixed = rows.map((s) => {
      if (s.academicYear) return s;
      const derived = deriveYearFromStudentId(s.studentId);
      if (!derived) return s;
      needsFix = true;
      return { ...s, academicYear: derived };
    });
    if (needsFix) {
      // 背景寫回 (不阻塞)
      setTimeout(() => {
        try { set(STORAGE_KEYS.STUDENTS, fixed); } catch { /* ignore */ }
      }, 0);
    }
    return fixed;
  },
  getByClient(clientId: string): Student[] {
    return this.getAll().filter(s => s.clientId === clientId);
  },
  setAll(students: Student[]) {
    set(STORAGE_KEYS.STUDENTS, students);
  },
  getById(id: string): Student | undefined {
    return this.getAll().find(s => s.id === id);
  },
  getByStudentId(studentId: string): Student | undefined {
    return this.getAll().find(s => s.studentId === studentId);
  },
  add(student: Student) {
    const all = this.getAll();
    all.push(student);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Student>) {
    const all = this.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.STUDENTS, this.getAll().filter(s => s.id !== id));
  },
  // ???????????????????
  generateStudentId(clientId: string, academicYear: string): string {
    const all = this.getByClient(clientId).filter(s =>
      s.studentId.startsWith(`stu-${academicYear}`)
    );
    const max = all.reduce((acc, s) => {
      const num = parseInt(s.studentId.split('-')[2] || '0', 10);
      return Math.max(acc, num);
    }, 0);
    return `stu-${academicYear}${String(max + 1).padStart(3, '0')}`;
  },
};

// ============= Parents =============
export const parentStorage = {
  getAll(): Parent[] {
    return get<Parent[]>(STORAGE_KEYS.PARENTS, []);
  },
  getByClient(clientId: string): Parent[] {
    return this.getAll().filter(p => p.clientId === clientId);
  },
  setAll(parents: Parent[]) {
    set(STORAGE_KEYS.PARENTS, parents);
  },
  getById(id: string): Parent | undefined {
    return this.getAll().find(p => p.id === id);
  },
  add(parent: Parent) {
    const all = this.getAll();
    all.push(parent);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Parent>) {
    const all = this.getAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.PARENTS, this.getAll().filter(p => p.id !== id));
  },
};

// ============= Nannies =============
export const nannyStorage = {
  getAll(): Nanny[] {
    return get<Nanny[]>(STORAGE_KEYS.NANNIES, []);
  },
  getByClient(clientId: string): Nanny[] {
    return this.getAll().filter(n => n.clientId === clientId);
  },
  // 按所屬機構/公司過濾 (companyId 可空：只傳回有填該公司的)
  getByCompany(companyId: string): Nanny[] {
    return this.getAll().filter(n => n.companyId === companyId);
  },
  setAll(nannies: Nanny[]) {
    set(STORAGE_KEYS.NANNIES, nannies);
  },
  getById(id: string): Nanny | undefined {
    return this.getAll().find(n => n.id === id);
  },
  add(nanny: Nanny) {
    const all = this.getAll();
    all.push(nanny);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Nanny>) {
    const all = this.getAll();
    const idx = all.findIndex(n => n.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.NANNIES, this.getAll().filter(n => n.id !== id));
  },
  /** 自動生成保姆編號 (格式: EMP-001, EMP-002...) 依 client 範圍遞增 */
  generateEmployeeId(clientId: string): string {
    const all = this.getByClient(clientId);
    const max = all.reduce((acc, n) => {
      const m = n.employeeId?.match(/EMP-(\d+)/i);
      if (!m) return acc;
      const num = parseInt(m[1], 10);
      return Number.isFinite(num) ? Math.max(acc, num) : acc;
    }, 0);
    return `EMP-${String(max + 1).padStart(3, '0')}`;
  },
};

// ============= Routes (????) =============
export const routeStorage = {
  getAll(): Route[] {
    const rows = get<Route[]>(STORAGE_KEYS.ROUTES, []);
    // ⚠️ 舊資料補學年: 由路線編號前綴推導 (2627-001AM → '2627')
    let needsFix = false;
    const fixed = rows.map((r) => {
      if (r.academicYear) return r;
      const m = r.code?.match(/^([0-9]{4})-/);
      if (!m) return r;
      needsFix = true;
      return { ...r, academicYear: m[1] };
    });
    if (needsFix) {
      setTimeout(() => {
        try { set(STORAGE_KEYS.ROUTES, fixed); } catch { /* ignore */ }
      }, 0);
    }
    return fixed;
  },
  getByClient(clientId: string): Route[] {
    return this.getAll().filter((r) => r.clientId === clientId);
  },
  setAll(routes: Route[]) {
    set(STORAGE_KEYS.ROUTES, routes);
  },
  getById(id: string): Route | undefined {
    return this.getAll().find((r) => r.id === id);
  },
  add(route: Route) {
    const all = this.getAll();
    all.push(route);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Route>) {
    const all = this.getAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.ROUTES, this.getAll().filter((r) => r.id !== id));
  },
};

// ============= Trips =============
export const tripStorage = {
  getAll(): Trip[] {
    const rows = get<Trip[]>(STORAGE_KEYS.TRIPS, []);
    // ⚠️ 舊資料補學年: 由班次日期推導 (2027-03-15 → '2627')
    //    ⚠️ 這是推定值 (學年邊界是學校自訂的), 但比留空好 ——
    //       留空會讓這筆班次在「依學年篩選」時行為不一致。
    let needsFix = false;
    const fixed = rows.map((t) => {
      if (t.academicYear) return t;
      if (!t.date) return t;
      needsFix = true;
      return { ...t, academicYear: getAcademicYearForDate(t.date) };
    });
    if (needsFix) {
      setTimeout(() => {
        try { set(STORAGE_KEYS.TRIPS, fixed); } catch { /* ignore */ }
      }, 0);
    }
    return fixed;
  },
  getByClient(clientId: string): Trip[] {
    return this.getAll().filter(t => t.clientId === clientId);
  },
  getByDate(clientId: string, date: string): Trip[] {
    return this.getAll().filter(t => t.clientId === clientId && t.date === date);
  },
  getByNanny(nannyId: string): Trip[] {
    return this.getAll().filter(t => t.nannyId === nannyId);
  },
  setAll(trips: Trip[]) {
    set(STORAGE_KEYS.TRIPS, trips);
  },
  /**
   * 合併 Supabase 資料到 localStorage — **以 updatedAt 較新者為準**。
   *
   * 為什麼不能用 setAll:
   *   班次是「本機先寫、雲端後推」的流程 (見 app/(main)/cbl-admin-setting/schedule/page.tsx)。
   *   如果管理員剛建立班次、雲端 push 還在進行中, 下一次 sync 會用 DB 的舊快照
   *   整批覆蓋 localStorage → 班次憑空消失。這是最典型的「自己吃掉自己」bug。
   *
   * 合併規則:
   *   1. DB 與 local 都有的 trip → 比較 updatedAt, 較新的勝出
   *      (DB 的 updated_at 由 trigger 維護, 本機的由 storage.update 寫入)
   *   2. 只有 local 有的 trip → 保留 (尚未 push 成功)
   *   3. 只有 DB 有的 trip → 使用 (其他裝置新建的)
   *   4. 帶墓碑 id 的 trip (本機已刪) → 兩邊一律丟掉, 不會復活 (見 lib/trip-tombstones.ts)
   */
  mergeAll(fromDb: Trip[]) {
    const { merged, staleInCloud } = mergeTripsWithTombstones(this.getAll(), fromDb);
    // 跨裝置刪除傳遞: 曾經推上過雲端、但這次雲端快照已無此 id → 在別處被刪, 跟著刪
    // (trips 之前完全無此機制 → A 裝置刪了, B 裝置(保姆手機)永遠留著, 即本次 bug)
    const dbIds = new Set(fromDb.map((t) => t.id));
    let synced: Set<string>;
    try {
      synced = new Set(getSyncedIds('trips'));
    } catch {
      synced = new Set<string>();
    }
    const filtered = merged.filter((t) => !(synced.has(t.id) && !dbIds.has(t.id)));
    this.setAll(filtered);

    // 記錄這次同步後雲端有的 id (供下次判斷「是否在別處被刪」)
    try {
      const map = get<Record<string, string[]>>(STORAGE_KEYS.SYNCED_ENTITY_IDS, {});
      map.trips = Array.from(dbIds);
      set(STORAGE_KEYS.SYNCED_ENTITY_IDS, map);
    } catch { /* ignore */ }

    // 雲端還在但本機已刪 → 上次雲端刪除失敗, 背景重試
    if (staleInCloud.length > 0) {
      console.warn(
        `[Supabase] ${staleInCloud.length} 筆班次在雲端仍存在, 重試刪除: ${staleInCloud.join(', ')}`,
      );
      void retryTripDeletes(staleInCloud);
    }
  },
  getById(id: string): Trip | undefined {
    return this.getAll().find(t => t.id === id);
  },
  add(trip: Trip) {
    const all = this.getAll();
    all.push(trip);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Trip>) {
    const all = this.getAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.TRIPS, this.getAll().filter(t => t.id !== id));
  },
  /* ---- Step 2 補的擴充 helpers ---- */
  getByClientRange(clientId: string, fromIso: string, toIso: string): Trip[] {
    return this.getAll().filter(
      (t) => t.clientId === clientId && t.date >= fromIso && t.date <= toIso,
    );
  },
  bulkUpdateStatus(ids: string[], status: Trip['status']): number {
    if (ids.length === 0) return 0;
    const all = this.getAll();
    let n = 0;
    all.forEach((t) => {
      if (ids.includes(t.id)) {
        Object.assign(t, { status, updatedAt: new Date().toISOString() });
        n += 1;
      }
    });
    this.setAll(all);
    return n;
  },
  /** 複製單一 trip 到新 id, status 重置為 scheduled */
  duplicate(templateId: string, overrides: Partial<Trip> = {}): Trip | null {
    const tpl = this.getById(templateId);
    if (!tpl) return null;
    const now = new Date().toISOString();
    const copy: Trip = {
      ...tpl,
      ...overrides,
      id: genId('trip'),
      // 複製出的新班次要重新蓋章 (快照也要重取 — 新班次對應當下的校巴綁定)
      academicYear: overrides.academicYear ?? resolveWriteAcademicYear(tpl.clientId),
      driverIdSnapshot:
        overrides.driverIdSnapshot ??
        (overrides.busId ? busStorage.getById(overrides.busId)?.driverId ?? null : tpl.driverIdSnapshot ?? null),
      busPlateNumberSnapshot:
        overrides.busPlateNumberSnapshot ??
        (overrides.busId ? busStorage.getById(overrides.busId)?.plateNumber ?? null : tpl.busPlateNumberSnapshot ?? null),
      status: 'scheduled',
      actualStartTime: null,
      actualEndTime: null,
      currentRouteIndex: 0,
      completedStops: [],
      waypoints: tpl.waypoints.map((w) => ({ ...w, id: genId('wp') })),
      createdAt: now,
      updatedAt: now,
    };
    this.add(copy);
    return copy;
  },
  removeMany(ids: string[]): number {
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    const before = this.getAll();
    const next = before.filter((t) => !idSet.has(t.id));
    // 透過函式變數 shadow 寫, 避免與未來某個 method 名 set 衝突
    const setItem = set;
    setItem(STORAGE_KEYS.TRIPS, next);
    return before.length - next.length;
  },
};

// ============= Attendances =============
export const attendanceStorage = {
  getAll(): Attendance[] {
    return get<Attendance[]>(STORAGE_KEYS.ATTENDANCES, []);
  },
  getByTrip(tripId: string): Attendance[] {
    return this.getAll().filter(a => a.tripId === tripId);
  },
  setAll(attendances: Attendance[]) {
    set(STORAGE_KEYS.ATTENDANCES, attendances);
  },
  /**
   * 合併 Supabase 資料 — 以 updatedAt 較新者為準 (理由同 tripStorage.mergeAll)。
   *
   * 打卡記錄尤其需要這個保護: 保姆在現場打卡 (寫 localStorage) 與
   * 雲端同步之間存在時間差, 用 setAll 會把剛打上的卡覆蓋掉。
   *
   * ⚠️ 合併鍵是 (tripId, studentId, waypointId) 而非 id:
   *   DB 的 unique 約束在這組三元組上, 且 localStorage 與 DB 可能對同一筆打卡
   *   產生不同的 id (本地 upsert 找不到時會 genId 新的)。
   *   若用 id 合併, 同一筆打卡會在 localStorage 變成兩筆 (重複計數)。
   */
  mergeAll(fromDb: Attendance[]) {
    const local = this.getAll();
    const keyOf = (a: Attendance) => `${a.tripId}__${a.studentId}__${a.waypointId}`;
    const localByKey = new Map(local.map((a) => [keyOf(a), a]));
    const dbKeys = new Set(fromDb.map(keyOf));

    const merged: Attendance[] = fromDb.map((dbItem) => {
      const localItem = localByKey.get(keyOf(dbItem));
      if (!localItem) return dbItem;
      if (localItem.updatedAt && dbItem.updatedAt &&
          localItem.updatedAt > dbItem.updatedAt) {
        return localItem;
      }
      return dbItem;
    });

    const localOnly = local.filter((a) => !dbKeys.has(keyOf(a)));
    this.setAll([...merged, ...localOnly]);
  },
  getById(id: string): Attendance | undefined {
    return this.getAll().find(a => a.id === id);
  },
  add(attendance: Attendance) {
    const all = this.getAll();
    all.push(attendance);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Attendance>) {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  upsert(attendance: Attendance) {
    const all = this.getAll();
    const idx = all.findIndex(a =>
      a.tripId === attendance.tripId &&
      a.studentId === attendance.studentId &&
      a.waypointId === attendance.waypointId
    );
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...attendance, updatedAt: new Date().toISOString() };
    } else {
      all.push(attendance);
    }
    this.setAll(all);
  },
  /* ---- Step 3 補的擴充 helpers ---- */
  getByTripIds(tripIds: string[]): Attendance[] {
    if (tripIds.length === 0) return [];
    const set = new Set(tripIds);
    return this.getAll().filter((a) => set.has(a.tripId));
  },
  /** 給定學生與日期區間, 用於家長頁或報表 */
  getByStudentAndDateRange(studentId: string, fromIso: string, toIso: string): Attendance[] {
    return this.getAll().filter((a) => {
      if (a.studentId !== studentId) return false;
      // attendance 沒有 date 欄位, 我們用「對應 trip 的 date」判斷
      const t = tripStorage.getById(a.tripId);
      return !!t && t.date >= fromIso && t.date <= toIso;
    });
  },
  /** 一次性摘要一班 trip 的 stats */
  aggregateForTrip(tripId: string): { boarded: number; dropped: number; noShow: number; late: number } {
    const atts = this.getByTrip(tripId);
    let boarded = 0;
    let dropped = 0;
    let noShow = 0;
    let late = 0;
    atts.forEach((a) => {
      if (a.boardingTime) boarded++;
      if (a.dropoffTime) dropped++;
      if (a.boardingStatus === 'no_show' || a.boardingStatus === 'absent') noShow++;
      if (a.boardingStatus === 'late') late++;
    });
    return { boarded, dropped, noShow, late };
  },
};

// ============= Announcements =============
//
// 機構可見範圍 (scope)
// ----------------------
// 公告是「機構 (client)」層級的資料, 但 super_admin 本身沒有 clientId。
// 早期實作直接用 `a.clientId === clientId` 過濾, 導致:
//   - super_admin (clientId 為 null → '') 完全看不到任何公告
//   - 後台 console 用 `user.clientId || STORAGE.clients.getAll()[0]?.id`
//     這個 fallback, 與前台 popup 的純 `user.clientId || ''` 不一致,
//     造成「後台看得到、主頁看不到」的割裂。
//
// 現在統一用 getVisible(clientId, isSuperAdmin) 一個入口:
//   - super_admin → 看得見所有機構的公告 (跨機構管理需求)
//   - 其他角色   → 只看得見自己 clientId 的公告
export const announcementStorage = {
  getAll(): Announcement[] {
    const rows = get<Announcement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
    // ⚠️ 舊資料補學年: 用該 client 的現行學年 (公告沒有編號前綴可推)
    //    範本 (isTemplate) 也補 — 範本跨學年沿用, 但需要一個值。
    // ⚠️ 舊資料補受眾 (scope / targetParentIds):
    //    這兩個欄位是 2026-11 新增的, 舊公告一律視為「系統公告」
    //    (所有用戶都看得到) —— 這是最保守的預設 (不會讓公告消失)。
    let needsFix = false;
    const fixed = rows.map((a) => {
      const scopeOk = a.scope === 'system' || a.scope === 'payment';
      const parentsOk = Array.isArray(a.targetParentIds);
      // ⚠️ clientId 可能是 null — 從 Supabase 讀回來的系統公告 (client_id = NULL)
      //    經 camelize 後就是 null。統一正規化成 '' (代表「不限機構」)。
      const clientId = a.clientId || '';
      if (a.academicYear && scopeOk && parentsOk && clientId === a.clientId) {
        return a;
      }
      needsFix = true;
      return {
        ...a,
        clientId,
        academicYear: a.academicYear || resolveWriteAcademicYear(clientId),
        scope: scopeOk ? a.scope : ('system' as const),
        targetParentIds: parentsOk ? a.targetParentIds : [],
      };
    });
    if (needsFix) {
      setTimeout(() => {
        try { set(STORAGE_KEYS.ANNOUNCEMENTS, fixed); } catch { /* ignore */ }
      }, 0);
    }
    return fixed;
  },
  getByClient(clientId: string): Announcement[] {
    return this.getAll().filter(a => a.clientId === clientId);
  },
  /**
   * 依「可見範圍」取得公告 (管理層 — 後台 console / 設定頁用)。
   *
   * ⚠️ 語意 (2026-11 起):
   *   公告不再綁「發佈機構」→ 全域公告 (clientId 為空) 對所有管理員可見;
   *   舊的「機構專屬」公告 (clientId 有值) 仍然只對該機構可見。
   *   繳費公告 (scope='payment') → 只要「被選家長中有屬於本機構的人」就可见,
   *   (跨機構選人時, 每間受影響的機構管理員都看得到)。
   *
   * @param clientId 目前使用者的 clientId (super_admin 可能是 null/'')
   * @param isSuperAdmin true = 跨機構, 看得到全部公告
   */
  getVisible(clientId: string, isSuperAdmin = false): Announcement[] {
    if (isSuperAdmin) return this.getAll();
    const cid = clientId || '';
    const all = this.getAll();

    // 本機構的家長 id 集合 (一次讀取, 全程重用)
    // ⚠️ 不要在 filter 迴圈裡重複讀 localStorage — 家長幾百位時會慢到卡住。
    const myParentIds = new Set(
      parentStorage
        .getAll()
        .filter((p) => p.clientId === cid)
        .map((p) => p.id),
    );

    return all.filter((a) => {
      const scope = a.scope || 'system';

      // 繳費公告 → 受眾名單裡只要有一位屬於本機構的家長就算看得見
      // ⚠️ 這條規則必須「無條件」套用 (不能因為 a.clientId === cid 就提早 return true):
      //    跨機構選人時 a.clientId 只會是「第一位家長所屬的機構」,
      //    其餘受影響機構的 clientId 對不上 → 必須靠家長名單判斷。
      //    → 與 getActive() 的 client 管理員分支保持一致,
      //      不會出現「後台看得到、但鈴鐺不彈」或反過來的矛盾。
      if (scope === 'payment') {
        const ids = a.targetParentIds || [];
        if (ids.length === 0) return false;
        return ids.some((id) => myParentIds.has(id));
      }

      // 系統公告:
      //   - clientId 為空 → 全域 (所有管理員都看得到)
      //   - clientId 有值 → 舊資料, 仍綁該機構
      if (!a.clientId || a.clientId === cid) return true;
      return false;
    });
  },
  getTemplates(clientId: string, isSuperAdmin = false): Announcement[] {
    return this.getVisible(clientId, isSuperAdmin).filter(a => a.isTemplate);
  },
  /**
   * 判定某則公告是否應該出現在「某個用戶」面前。
   *
   * ⚠️ 受眾規則 (2026-11):
   *   - scope = 'system'  → 所有用戶都看得到 (跨機構、跨角色)
   *   - scope = 'payment' → 只有被選中的家長看得到 (管理員除外)
   */
  matchesAudience(
    a: Announcement,
    ctx: { role?: string; parentIds?: Set<string> },
  ): boolean {
    const role = ctx.role || '';
    const isAdmin =
      role === 'super_admin' || role === 'system_admin' || role === 'client';
    if (isAdmin) return true;

    const scope = a.scope || 'system';
    if (scope === 'system') return true;

    // scope === 'payment' → 只有名單內的家長
    const targets = a.targetParentIds || [];
    if (targets.length === 0) return false;
    const ids = ctx.parentIds;
    if (!ids || ids.size === 0) return false;
    return targets.some((t) => ids.has(t));
  },
  /**
   * 取得「生效中且在有效期內」且「這個用戶看得到」的公告。
   *
   * ⚠️ 受眾規則 (2026-11):
   *   - scope = 'system'  → 所有用戶都看得到 (跨機構、跨角色)
   *   - scope = 'payment' → 只有 targetParentIds 內的家長看得到
   *
   * ⚠️ 機構範圍 (clientId) 只在「系統公告 + 舊資料」時才會擋人:
   *   - 新建的系統公告 → clientId = '' → 全域 (任何人看得到)
   *   - 舊公告 (migration 前建立, 綁在某一間學校) → 仍只對該機構可見
   *   - 繳費公告 → 受眾由「指定家長」決定, 不受 clientId 限制
   *     (家長帳號的 clientId 常常是空的 → 被擋掉就永遠看不到)
   *
   * @param clientId 目前使用者的 clientId
   * @param isSuperAdmin 是否為跨機構管理員
   * @param audience 受眾 (role + 家長 id 集合); 不傳 = 不套用受眾過濾
   */
  getActive(
    clientId: string,
    isSuperAdmin = false,
    audience?: { role?: string; parentIds?: Set<string> },
  ): Announcement[] {
    const now = new Date().toISOString();
    const role = audience?.role || '';
    // 跨機構角色 → 不受機構範圍限制 (看得見所有機構的公告)
    const crossOrg =
      isSuperAdmin || role === 'super_admin' || role === 'system_admin';
    // 機構管理員 (client) → 受眾不過濾, 但仍限自己機構
    const isClientAdmin = role === 'client';

    // ⚠️ 機構管理員看繳費公告時要查「本機構的家長 id 集合」——
    //    先算一次 (lazily), 不要在 filter 迴圈裡重複讀 localStorage。
    let myParentIds: Set<string> | null = null;
    const getMyParentIds = (): Set<string> => {
      if (myParentIds) return myParentIds;
      myParentIds = new Set(
        parentStorage
          .getAll()
          .filter((p) => p.clientId === clientId)
          .map((p) => p.id),
      );
      return myParentIds;
    };

    return this.getAll().filter(a => {
      if (!a.isActive || a.isTemplate) return false;
      if (a.startDate > now || a.endDate < now) return false;
      // 受眾過濾 (系統公告 → 全部; 繳費公告 → 指定家長; 管理員 → 全部)
      if (audience && !this.matchesAudience(a, audience)) return false;
      if (crossOrg) return true;

      const scope = a.scope || 'system';
      if (scope === 'payment') {
        // 繳費公告: 受眾 = 指定家長 (matchesAudience 已判定)
        //   - 機構管理員 (client) → 只能看到「受眾名單中有本機構家長」的公告
        //     (跨機構選人時, 每間受影響的機構管理員都看得到 → 與 getVisible 一致)
        //   - 一般用戶 (家長) → 不限機構 (受眾名單才是唯一判準)
        // ⚠️ 這個判斷要「無條件」套用, 不能因為 a.clientId === cid 就提早 return true:
        //    跨機構選人時 a.clientId 只記第一位家長的機構,
        //    其餘受影響機構的 clientId 對不上 → 必須靠家長名單判斷。
        if (isClientAdmin) {
          const ids = a.targetParentIds || [];
          const mine = getMyParentIds();
          if (!ids.some((id) => mine.has(id))) return false;
        }
        return true;
      }

      // 系統公告:
      //   - clientId 為空 → 全域 (所有用戶都看到)
      //   - clientId 有值 → 舊資料, 仍綁該機構
      if (a.clientId && a.clientId !== clientId) return false;
      return true;
    });
  },
  setAll(announcements: Announcement[]) {
    set(STORAGE_KEYS.ANNOUNCEMENTS, announcements);
  },
  /**
   * 合併 (merge) 而不是覆蓋 (replace)。
   *
   * 為什麼需要 merge:
   * - 公告支援「本機先寫、雲端後推」(後台頁先寫 localStorage 再同步 DB)
   * - 若 syncToStorage() 用 setAll() 覆蓋, 尚未推上雲端的那則會在下一次
   *   同步時消失
   *
   * 合併規則:
   * - DB 是 source of truth → DB 有的項目以 DB 內容為準
   * - 但 currentCount 取 localStorage / DB 的較大值
   *   (避免「本機已 +1、DB 還沒同步到」的短暫 race 造成次數被倒退)
   * - DB 沒有、localStorage 有的項目:
   *   - 從沒同步過 (不在 syncedIds) → 保留 (本機先寫、尚未推上雲端)
   *   - 已經同步過但 DB 不見了 → 是在別的裝置被刪掉 → 跟著刪
   */
  mergeAll(fromDb: Announcement[]) {
    const local = this.getAll();
    const localById = new Map(local.map(a => [a.id, a]));
    const dbIds = new Set(fromDb.map(a => a.id));

    // 曾經同步到 DB 的 id (用來判斷「是被刪了」還是「從沒進過 DB」)
    const syncedIds = new Set(
      get<string[]>(STORAGE_KEYS.ANNOUNCEMENTS_SYNCED_IDS, [])
    );

    const merged = fromDb.map((dbItem) => {
      const localItem = localById.get(dbItem.id);
      if (!localItem) return dbItem;
      return {
        ...dbItem,
        currentCount: Math.max(dbItem.currentCount || 0, localItem.currentCount || 0),
      };
    });

    const localOnly = local.filter(
      (a) => !dbIds.has(a.id) && !syncedIds.has(a.id)
    );

    // 記錄這次同步後 DB 有的 id
    set(STORAGE_KEYS.ANNOUNCEMENTS_SYNCED_IDS, Array.from(dbIds));

    this.setAll([...merged, ...localOnly]);
  },
  getById(id: string): Announcement | undefined {
    return this.getAll().find(a => a.id === id);
  },
  add(announcement: Announcement) {
    const all = this.getAll();
    all.push(announcement);
    this.setAll(all);
  },
  update(id: string, patch: Partial<Announcement>) {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.ANNOUNCEMENTS, this.getAll().filter(a => a.id !== id));
  },
  /**
   * 把 currentCount +1 (該公告被「看開」一次)。
   * displayCount 是「總顯示次數」上限, 由呼叫端 (popup) 在看開時呼叫。
   * @returns 遞增後的 currentCount
   */
  incrementCount(id: string): number {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx < 0) return 0;
    const next = (all[idx].currentCount || 0) + 1;
    all[idx] = { ...all[idx], currentCount: next };
    this.setAll(all);
    return next;
  },
  /**
   * 取得「可以顯示給使用者」的公告清單。
   *
   * 同時套用三層限制:
   *   1. 範圍  — super_admin 看全部, 其他角色只看自己 clientId
   *   2. 有效期 — isActive && !isTemplate && 在 startDate~endDate 內
   *   3. 次數  — currentCount < displayCount (總次數) 且
   *              該用戶看過的次數 < maxViewsPerUser (每用戶上限)
   *
   * @param userId      目前用戶 id (用來查「看過幾次」)
   * @param clientId    目前用戶 clientId
   * @param isSuperAdmin 是否為超管 (看全部公告)
   */
  getEligible(
    userId: string,
    clientId: string,
    isSuperAdmin = false,
    audience?: { role?: string; parentIds?: Set<string> },
  ): Announcement[] {
    const now = new Date().toISOString();
    return this.getActive(clientId, isSuperAdmin, audience).filter(a => {
      // 全域總顯示次數上限
      if ((a.currentCount || 0) >= (a.displayCount || 1)) return false;
      // 每用戶顯示上限
      const max = a.maxViewsPerUser || 1;
      const viewed = announcementViewStorage.getViewCount(userId, clientId, a.id);
      if (viewed >= max) return false;
      return true;
    });
  },
  /**
   * 取得「自動彈窗」要顯示的公告清單 (2026-10-26 新語意)。
   *
   * 需求: 生效中的公告, 在限期內「每一次進入主頁」都要彈出,
   *       除非使用者勾選「不再顯示此通告」。
   *
   * 與 getEligible() 的差別:
   *   - getEligible() 套用 displayCount / maxViewsPerUser 上限
   *     → 只看過一次就再也不彈 (舊語意)
   *   - getAutoPopupList() 「不」套用次數上限
   *     → 次數設定降級為單純的統計數字, 不再影響彈出行為
   *
   * 套用的限制:
   *   1. 範圍   — super_admin 看全部, 其他角色只看自己 clientId
   *   2. 有效期 — isActive && !isTemplate && 在 startDate~endDate 內
   *   3. 隱藏   — 使用者未勾選「不再顯示此通告」
   *
   * @param userId      目前用戶 id
   * @param clientId    目前用戶 clientId
   * @param isSuperAdmin 是否為超管 (看全部公告)
   */
  getAutoPopupList(
    userId: string,
    clientId: string,
    isSuperAdmin = false,
    audience?: { role?: string; parentIds?: Set<string> },
  ): Announcement[] {
    const dismissed = announcementDismissStorage.getDismissed(userId, clientId);
    return this.getActive(clientId, isSuperAdmin, audience).filter(
      (a) => !dismissed.has(a.id),
    );
  },
};

// ============= Incident Reports (異常回報留底) =============
//
// 保姆主頁 popup「確定送出」即寫一筆; CBL Admin Setting 讀同一個 storage 顯示。
// 廣播制: 不再指定單一管理員, 所有 system_admin + super_admin 都會收到通知。
// 跨裝置同步走 Supabase cbl_incident_reports (雲端為準 + 本機先寫保留)。
export const incidentStorage = {
  getAll(): IncidentReport[] {
    return get<IncidentReport[]>(STORAGE_KEYS.INCIDENTS, []);
  },
  /** 管理層列表 — 跨機構看全部, 其他角色只看自己 clientId */
  getVisible(clientId: string, isSuperAdmin = false): IncidentReport[] {
    const all = this.getAll();
    if (isSuperAdmin) return [...all].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const cid = clientId || '';
    return all
      .filter((r) => (r.clientId || '') === cid)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },
  /**
   * 管理員鈴鐺用 — 待處理 (pending) 的廣播列表。
   * system_admin / super_admin 看全部, 其他角色只看自己 clientId。
   */
  getPendingForAdmins(clientId: string, isAdmin = false): IncidentReport[] {
    const visible = this.getVisible(clientId, isAdmin);
    return visible.filter((r) => r.status === 'pending');
  },
  setAll(rows: IncidentReport[]) {
    set(STORAGE_KEYS.INCIDENTS, rows);
  },
  getById(id: string): IncidentReport | undefined {
    return this.getAll().find((r) => r.id === id);
  },
  add(row: IncidentReport) {
    const all = this.getAll();
    all.push(row);
    this.setAll(all);
  },
  update(id: string, patch: Partial<IncidentReport>) {
    const all = this.getAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.INCIDENTS, this.getAll().filter((r) => r.id !== id));
  },
};

// ============= Payment Records (付款記錄) =============
//
// 報表頁 (settings/reports) 的資料來源。
// 跨裝置同步走 Supabase cbl_payment_records (雲端為準 + 本機先寫保留)。
export const paymentStorage = {
  getAll(): PaymentRecord[] {
    return get<PaymentRecord[]>(STORAGE_KEYS.PAYMENTS, []);
  },
  /** 管理層列表 — 跨機構看全部, 其他角色只看自己 clientId */
  getVisible(clientId: string, isSuperAdmin = false): PaymentRecord[] {
    const all = this.getAll();
    if (isSuperAdmin) return [...all].sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
    const cid = clientId || '';
    return all
      .filter((r) => (r.clientId || '') === cid)
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
  },
  setAll(rows: PaymentRecord[]) {
    set(STORAGE_KEYS.PAYMENTS, rows);
  },
  getById(id: string): PaymentRecord | undefined {
    return this.getAll().find((r) => r.id === id);
  },
  add(row: PaymentRecord) {
    const all = this.getAll();
    all.push(row);
    this.setAll(all);
  },
  update(id: string, patch: Partial<PaymentRecord>) {
    const all = this.getAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
      this.setAll(all);
    }
  },
  remove(id: string) {
    set(STORAGE_KEYS.PAYMENTS, this.getAll().filter((r) => r.id !== id));
  },
  /**
   * 批次更新付款狀態 — 報表頁的「多選 → 標記已付 / 取消」用。
   *
   * 回傳實際更新了幾筆 (供 toast 回報)。
   */
  bulkUpdateStatus(ids: string[], status: PaymentStatus): number {
    if (ids.length === 0) return 0;
    const all = this.getAll();
    let n = 0;
    all.forEach((r) => {
      if (ids.includes(r.id)) {
        Object.assign(r, { status, updatedAt: new Date().toISOString() });
        n += 1;
      }
    });
    this.setAll(all);
    return n;
  },
  /**
   * 批次標記「已發送繳費通知」— 報表頁的「發送繳費通知」動作用。
   */
  bulkMarkNotified(ids: string[]): number {
    if (ids.length === 0) return 0;
    const all = this.getAll();
    const now = new Date().toISOString();
    let n = 0;
    all.forEach((r) => {
      if (ids.includes(r.id)) {
        Object.assign(r, { paymentNotifiedAt: now, updatedAt: now });
        n += 1;
      }
    });
    this.setAll(all);
    return n;
  },
};

// ============= Announcement Read Tracking =============
// ??????????????? ???????????????????????
// ??????user ??????client (e.g. ????????????? ????????????????????
const readMap = () => get<Record<string, string[]>>(STORAGE_KEYS.ANNOUNCEMENT_READS, {});
const writeMap = (m: Record<string, string[]>) =>
  set(STORAGE_KEYS.ANNOUNCEMENT_READS, m);

const readKey = (userId: string, clientId: string) =>
  `${userId}::${clientId || ''}`;

export const readAnnouncementStorage = {
  /** ????????????????????????? ID ???? */
  getRead(userId: string, clientId: string): Set<string> {
    const m = readMap();
    return new Set(m[readKey(userId, clientId)] || []);
  },
  /** ?????????ID ??????? (????) */
  markRead(userId: string, clientId: string, ids: string[]): void {
    if (!userId || ids.length === 0) return;
    const k = readKey(userId, clientId);
    const m = readMap();
    const cur = new Set(m[k] || []);
    ids.forEach(id => cur.add(id));
    m[k] = Array.from(cur);
    writeMap(m);
  },
  /** ???????? / ??? */
  clearAll(): void {
    writeMap({});
  },
};

// ============= Incident Read Tracking (異常回報鈴鐺紅點用) =============
//
// 與 announcementReads 同語意: 「看過下拉列表」= 已讀 (per-user, 不影響全域 status)。
// key 格式沿用 readKey `${userId}::${clientId || ''}` — system_admin / super_admin
// 的 clientId 為空字串也照常運作。內容為 incident.id。
const incidentReadMap = () => get<Record<string, string[]>>(STORAGE_KEYS.INCIDENT_READS, {});
const writeIncidentReadMap = (m: Record<string, string[]>) =>
  set(STORAGE_KEYS.INCIDENT_READS, m);

export const readIncidentStorage = {
  /** 取得該用戶已讀的 incident id 集合 */
  getRead(userId: string, clientId: string): Set<string> {
    const m = incidentReadMap();
    return new Set(m[readKey(userId, clientId)] || []);
  },
  /** 標記已讀 (idempotent) */
  markRead(userId: string, clientId: string, ids: string[]): void {
    if (!userId || ids.length === 0) return;
    const k = readKey(userId, clientId);
    const m = incidentReadMap();
    const cur = new Set(m[k] || []);
    ids.forEach(id => cur.add(id));
    m[k] = Array.from(cur);
    writeIncidentReadMap(m);
  },
  /** 清空全部 */
  clearAll(): void {
    writeIncidentReadMap({});
  },
};

// ============= Announcement View Counting =============
//
// 用途: 實作 Announcements 的兩個顯示上限設定
//   - displayCount   : 「總顯示次數」— 該公告最多被「看開」幾次 (全域)
//   - maxViewsPerUser: 「每用戶顯示上限」— 同一個 user 最多看幾次
//
// 為什麼要另外存一份「每用戶看過幾次」而不是只用 readIds:
//   - readIds 是「看過 / 未看過」的集合 (boolean 語意), 不能表達「看過 3 次」
//   - maxViewsPerUser 需要計數, 所以另外開一個 map 存次數
//
// 設計: 與 announcementReads 共用同一個 composite key 格式
//   `${userId}::${clientId || ''}` — 切換 client 時彼此不干擾。
const viewMap = () =>
  get<Record<string, Record<string, number>>>(
    STORAGE_KEYS.ANNOUNCEMENT_VIEWS,
    {},
  );
const writeViewMap = (m: Record<string, Record<string, number>>) =>
  set(STORAGE_KEYS.ANNOUNCEMENT_VIEWS, m);

export const announcementViewStorage = {
  /** 取得某用戶對某則公告的「已看過次數」 */
  getViewCount(userId: string, clientId: string, announcementId: string): number {
    if (!userId || !announcementId) return 0;
    const m = viewMap();
    const perUser = m[readKey(userId, clientId)] || {};
    return perUser[announcementId] || 0;
  },

  /**
   * 記錄一次「看過」。
   * @returns 記錄後的累計次數
   */
  markViewed(
    userId: string,
    clientId: string,
    announcementId: string,
  ): number {
    if (!userId || !announcementId) return 0;
    const m = viewMap();
    const k = readKey(userId, clientId);
    const perUser = { ...(m[k] || {}) };
    const next = (perUser[announcementId] || 0) + 1;
    perUser[announcementId] = next;
    m[k] = perUser;
    writeViewMap(m);
    return next;
  },

  /** 清空全部計數 (重設公告的顯示次數統計) */
  clearAll(): void {
    writeViewMap({});
  },
};

// ============= Announcement Popup Disabled Preference =============
//
// 【已廢棄 / DEPRECATED】(2026-10-26)
//
// 原本是「全站彈窗」總開關 (一鍵關閉所有公告彈窗)。使用者需求改為
// 「每則公告各自的『不再顯示此通告』」後, 這個總開關已從 UI 移除,
// 由 `announcementDismissStorage` 取代 (逐則隱藏)。
//
// 保留這個 storage 是為了:
//   1. 相容性 — 舊的 localStorage key 資料不會孤兒化
//   2. 方便日後要恢復「全站停用」功能時直接沿用
//
// 新邏輯請一律使用 `STORAGE.announcementDismiss`。
const popupDisabledMap = () =>
  get<Record<string, boolean>>(STORAGE_KEYS.ANNOUNCEMENT_POPUP_DISABLED, {});

export const announcementPopupPrefStorage = {
  /** ??????? popup??????? false (???) */
  isDisabled(userId: string, clientId: string): boolean {
    if (!userId) return false;
    const m = popupDisabledMap();
    return m[`${userId}::${clientId || ''}`] === true;
  },
  /** ?????? (true = ?, false = ?) */
  setDisabled(userId: string, clientId: string, disabled: boolean): void {
    if (!userId) return;
    const m = popupDisabledMap();
    const k = `${userId}::${clientId || ''}`;
    if (disabled) {
      m[k] = true;
    } else {
      delete m[k];
    }
    set(STORAGE_KEYS.ANNOUNCEMENT_POPUP_DISABLED, m);
  },
  /** ?????? (????/???) */
  clearAll(): void {
    set(STORAGE_KEYS.ANNOUNCEMENT_POPUP_DISABLED, {});
  },
};

// ============= Announcement Dismissed (per-announcement suppression) =============
//
// 用途: 記錄「哪則公告被該使用者勾選『不再顯示此通告』」。
//
// 與 announcementReads 的差別 (兩者都存 announcement.id, 但語意不同):
//   - announcementReads : 「看過了」→ 用於鈴鐺紅點 (未讀數) 與瀏覽歷史
//   - announcementDismissed: 「不想再看到」→ 用於自動彈窗的 suppression
//
// 為什麼要獨立存一份:
//   - 「看過」不等於「不想再看到」。使用者可能只是看了一眼就離開,
//     下次進入主頁還是應該彈出 (這是需求: 限期內每次進入主頁都彈出)。
//   - 只有明確勾選「不再顯示此通告」才寫進來。
//
// 設計: 沿用 readKey 的 composite key `${userId}::${clientId || ''}`
//   — 切換 client 時彼此不干擾; super_admin 的 clientId 為空字串也照常運作。
const dismissMap = () =>
  get<Record<string, string[]>>(STORAGE_KEYS.ANNOUNCEMENT_DISMISSED, {});
const writeDismissMap = (m: Record<string, string[]>) =>
  set(STORAGE_KEYS.ANNOUNCEMENT_DISMISSED, m);

export const announcementDismissStorage = {
  /** 取得該使用者已隱藏的公告 id 集合 */
  getDismissed(userId: string, clientId: string): Set<string> {
    if (!userId) return new Set();
    const m = dismissMap();
    return new Set(m[readKey(userId, clientId)] || []);
  },
  /** 某則公告是否已被該使用者隱藏 */
  isDismissed(userId: string, clientId: string, announcementId: string): boolean {
    if (!userId || !announcementId) return false;
    const m = dismissMap();
    return (m[readKey(userId, clientId)] || []).includes(announcementId);
  },
  /** 標記「不再顯示此通告」(idempotent) */
  dismiss(userId: string, clientId: string, announcementId: string): void {
    if (!userId || !announcementId) return;
    const m = dismissMap();
    const k = readKey(userId, clientId);
    const cur = new Set(m[k] || []);
    cur.add(announcementId);
    m[k] = Array.from(cur);
    writeDismissMap(m);
  },
  /** 取消隱藏 (讓這則公告重新開始自動彈出) */
  restore(userId: string, clientId: string, announcementId: string): void {
    if (!userId || !announcementId) return;
    const m = dismissMap();
    const k = readKey(userId, clientId);
    const cur = new Set(m[k] || []);
    cur.delete(announcementId);
    m[k] = Array.from(cur);
    writeDismissMap(m);
  },
  /** 清空全部隱藏記錄 (重設「不再顯示此通告」偏好) */
  clearAll(): void {
    writeDismissMap({});
  },
};

/* ============= Selected Client (super_admin 記憶上次看的公司) =============
 * P1-3: 避免每次都用 clients[0] 導致切換公司後跳回去。
 * 存 localStorage + 可被 URL ?client= 覆寫 (見 schedule/page.tsx)。
 */
const SELECTED_CLIENT_KEY = 'cbl_selected_client';
export const selectedClientStorage = {
  get(): string {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(SELECTED_CLIENT_KEY) || '';
    } catch {
      return '';
    }
  },
  set(clientId: string) {
    if (typeof window === 'undefined') return;
    try {
      if (clientId) localStorage.setItem(SELECTED_CLIENT_KEY, clientId);
    } catch (e) {
      console.error('Error writing selected client:', e);
    }
  },
  clear() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(SELECTED_CLIENT_KEY);
    } catch {
      /* ignore */
    }
  },
};

// ============= Academic Years (學年登錄) =============
/**
 * 學年登錄的本機快取 (對應 Supabase cbl_academic_years)。
 *
 * ⚠️ 這是「快取」, 雲端 (cbl_academic_years) 才是權威來源。
 *    這裡存在的理由:
 *      1. 讓「寫入蓋章」不必每次都打網路 (同步路徑上是 async 的,
 *         但「建立班次」這種同步流程需要立刻拿到學年值)
 *      2. 離線時仍能運作 (降級到 settings.academicYear)
 */
export const academicYearStorage = {
  getAll(): AcademicYear[] {
    return get<AcademicYear[]>(STORAGE_KEYS.ACADEMIC_YEARS, []);
  },
  setAll(years: AcademicYear[]) {
    set(STORAGE_KEYS.ACADEMIC_YEARS, years);
  },
  /** 取得某 client 的所有學年 (新到舊) */
  getByClient(clientId: string): AcademicYear[] {
    return this.getAll()
      .filter((y) => y.clientId === clientId)
      .sort((a, b) => b.academicYear.localeCompare(a.academicYear));
  },
  /** 取得某 client 的現行學年 */
  getCurrent(clientId: string): AcademicYear | null {
    if (!clientId) return null;
    return this.getByClient(clientId).find((y) => y.isCurrent) || null;
  },
  /** 取得某 client 的某個特定學年 */
  getByYear(clientId: string, academicYear: string): AcademicYear | null {
    return this.getByClient(clientId).find((y) => y.academicYear === academicYear) || null;
  },
  /**
   * 合併雲端資料 (本機優先 — 本機可能還沒推上去的新學年)。
   * 雲端為準的部分: isCurrent / status (這兩個決定寫入蓋章, 不能本機說了算)。
   */
  mergeAll(cloud: AcademicYear[]): void {
    const local = this.getAll();
    const cloudById = new Map(cloud.map((y) => [y.id, y]));
    const merged: AcademicYear[] = [];

    for (const y of local) {
      const c = cloudById.get(y.id);
      if (!c) {
        // 雲端沒有 → 本機的先留著 (可能還沒推上去)
        merged.push(y);
        continue;
      }
      // 雲端為準
      merged.push(c);
      cloudById.delete(y.id);
    }
    // 雲端多出來的 → 直接加
    for (const c of cloudById.values()) merged.push(c);

    this.setAll(merged);
  },
};

// ============= Settings =============
export const settingsStorage = {
  getByClient(clientId: string): SiteSettings {
    const all = get<Record<string, SiteSettings>>(STORAGE_KEYS.SETTINGS, {});
    return all[clientId] || this.default(clientId);
  },
  set(settings: SiteSettings) {
    const all = get<Record<string, SiteSettings>>(STORAGE_KEYS.SETTINGS, {});
    all[settings.clientId] = settings;
    set(STORAGE_KEYS.SETTINGS, all);
  },
  default(clientId: string): SiteSettings {
    return {
      clientId,
      logo: null,
      title: 'CloudBusLink',
      primaryColor: '#3b82f6',
      phone: '',
      email: '',
      address: '',
      studentIdPrefix: 'stu-',
      academicYear: '2627',
      academicYearStart: 9,
      pushNotifications: true,
      emailNotifications: false,
      updatedAt: new Date().toISOString(),
    };
  },
};

// ============= Recent Bus Searches (SideMenu typeahead) =============
// Per-user, most-recent-first, capped. Used by the burger side menu quick-jump
// search. Survives reloads via localStorage.
export const recentBusSearchesStorage = {
  get(userId: string): string[] {
    if (!userId) return [];
    const all = get<Record<string, string[]>>(STORAGE_KEYS.RECENT_BUS_SEARCHES, {});
    return all[userId] || [];
  },
  set(userId: string, busIds: string[]) {
    if (!userId) return;
    const all = get<Record<string, string[]>>(STORAGE_KEYS.RECENT_BUS_SEARCHES, {});
    all[userId] = busIds;
    set(STORAGE_KEYS.RECENT_BUS_SEARCHES, all);
  },
  /** Move the busId to the top of the recent list, dedupe, cap at maxItems. */
  push(userId: string, busId: string, maxItems = 5) {
    if (!userId || !busId) return;
    const current = this.get(userId).filter((id) => id !== busId);
    current.unshift(busId);
    this.set(userId, current.slice(0, maxItems));
  },
  remove(userId: string, busId: string) {
    if (!userId) return;
    this.set(userId, this.get(userId).filter((id) => id !== busId));
  },
  clear(userId: string) {
    if (!userId) return;
    this.set(userId, []);
  },
};

// ============= User Feature Permissions (/cbl-admin-setting/user) =============
// 對應 UI: 功能權限分配頁的 switch button
// value: { [userId]: { [featureKey]: boolean } }
//
// 之後接 Supabase 時, 把這個 storage 換成 supabase .from('cbl_user_permissions')
// 的 select / upsert, 上層 API 保持不變。
type FeatureFlagMap = Record<string, Record<string, boolean>>;
export const userFeaturePermissionStorage = {
  getAll(): FeatureFlagMap {
    return get<FeatureFlagMap>(STORAGE_KEYS.USER_FEATURE_PERMISSIONS, {});
  },
  setAll(map: FeatureFlagMap) {
    set(STORAGE_KEYS.USER_FEATURE_PERMISSIONS, map);
  },
  get(userId: string): Record<string, boolean> | undefined {
    if (!userId) return undefined;
    return this.getAll()[userId];
  },
  set(userId: string, features: Record<string, boolean>) {
    if (!userId) return;
    const all = this.getAll();
    all[userId] = { ...features };
    this.setAll(all);
  },
  remove(userId: string) {
    if (!userId) return;
    const all = this.getAll();
    delete all[userId];
    this.setAll(all);
  },
};

// ============= Init =============
export function isInitialized(): boolean {
  return get<boolean>(STORAGE_KEYS.INITIALIZED, false);
}

export function markInitialized() {
  set(STORAGE_KEYS.INITIALIZED, true);
}

/* ==========================================================================
 *  雲端合併引擎 (本機先寫、雲端後推 的安全 pull)
 * ==========================================================================
 *
 *  為什麼需要這一段:
 *   學生 / 家長 / 保姆 / 路線 這些實體是「本機先寫、雲端後推」的流程 ——
 *   管理員在後台改完資料, 先寫 localStorage 讓 UI 即時反應, 背景再 push 到 DB。
 *   所以「重新整理」如果無脑用 DB 資料覆蓋 localStorage, 會把「已改但還沒 push 完」
 *   的資料洗掉 (就是 tripStorage.mergeAll 註解裡講的那個「自己吃掉自己」bug)。
 *
 *  解法: 記錄「每一筆 id 有沒有成功推上過雲端」(SYNCED_ENTITY_IDS)。
 *   合併時:
 *     - DB 有 + 本機有        → 以 DB 為準 (DB 是 source of truth, 別裝置改的)
 *     - 只有 DB 有            → 採用 (別的裝置新建的)
 *     - 只有本機有 + 推過雲端 → 丟掉 (在別的裝置被刪了)
 *     - 只有本機有 + 沒推過    → 保留 (還沒 push 成功, 別洗掉)
 *
 *  這跟 announcementStorage.mergeAll 用的是同一套思路, 只是抽成通用的。
 */

/**
 * 解析「建立資料時要用的 clientId (所屬學校)」。
 *
 * 為什麼需要這個:
 *   跨機構角色 (super_admin / system_admin) 登入後 cbl_auth.clientId 是空的,
 *   但 cbl_students / cbl_parents / cbl_nannies / cbl_routes 的 client_id
 *   在 DB 有 NOT NULL + FK 約束 (指向 cbl_clients.id)。
 *   → 用空字串建立會直接 FK violation, 推不上去;
 *   → 而且就算推得上去, 該筆資料也沒有學校歸屬, 學校後台看不到。
 *
 *   所以跨機構角色建立資料時, 必須指定一個「目標學校」:
 *     1. 登入帳號自己的 clientId (一般角色)
 *     2. 已知現有資料的 clientId (例如先看已有校巴/學生屬於哪間學校)
 *     3. 最後 fallback 到第一間學校
 *
 *   ⚠️ 這是「跨機構角色在第一間學校下建立資料」的簡化做法。
 *      理想做法是讓 UI 提供「所屬學校」下拉, 但那是較大的 UX 改動。
 */
export function resolveClientId(preferred?: string | null): string {
  if (preferred) return preferred;

  // 1) 登入帳號自己的 clientId
  const auth = get<{ clientId?: string | null } | null>(STORAGE_KEYS.AUTH, null);
  if (auth?.clientId) return auth.clientId;

  // 2) 已知現有資料的 clientId
  const fromStudents = studentStorage.getAll()[0]?.clientId;
  if (fromStudents) return fromStudents;
  const fromBuses = busStorage.getAll()[0]?.clientId;
  if (fromBuses) return fromBuses;
  const fromNannies = nannyStorage.getAll()[0]?.clientId;
  if (fromNannies) return fromNannies;
  const fromParents = parentStorage.getAll()[0]?.clientId;
  if (fromParents) return fromParents;

  // 3) 第一間學校
  const firstClient = clientStorage.getAll()[0]?.id;
  if (firstClient) return firstClient;

  return '';
}

/**
 * 取得「目前使用者可見的資料範圍」。
 *
 * 為什麼需要這個 helper (這是「/trips 看不到自己新增的班次」的根因):
 *
 *   超管 (super_admin / system_admin) 的 `user.clientId` 是 **null**。
 *   而各頁面原本都寫成 `STORAGE.trips.getByDate(user.clientId || '', date)`,
 *   於是 clientId 變成空字串 '' → 過濾條件 `t.clientId === ''` 永遠不成立
 *   → **整頁班次清單是空的**。
 *
 *   後台 (/cbl-admin-setting/*) 早就知道要對超管 special-case (用 getAll() 看全部),
 *   但 (main) 群組的前台頁面 (/、/trips、/settings/*) 沒有跟上 →
 *   同一個帳號在後台看得到班次、在 /trips 卻看到「當日沒有班次」。
 *
 * 統一規則 (與後台一致):
 *   - 跨機構角色 (super_admin / system_admin) → 看全部 (clientId = '')
 *   - 其他角色 → 只看自己學校 (user.clientId)
 *   - user.clientId 為空且非跨機構角色 → fallback 到記憶/第一間學校
 *     (避免「資料存在但看不到」這種靜默失敗)
 */
export interface DataScope {
  /** 用於 getByClient 的 clientId; 跨機構角色為 '' (代表看全部) */
  clientId: string;
  /** 是否為跨機構角色 (看全部資料) */
  isSuperAdmin: boolean;
}

/** 跨機構角色 — 沒有自己的 clientId, 可看所有學校的資料 */
export function isCrossTenantRole(role: UserRole | string | null | undefined): boolean {
  return role === 'super_admin' || role === 'system_admin';
}

/**
 * 解析目前使用者的資料可見範圍。
 *
 * @param user 目前登入者 (null = 未登入)
 * @param opts.preferredClientId 額外的優先 clientId (例如 URL ?client= 或記憶值)
 */
export function resolveDataScope(
  user: User | null | undefined,
  opts?: { preferredClientId?: string | null },
): DataScope {
  const superAdmin = isCrossTenantRole(user?.role);

  // 跨機構角色 → 看全部 (clientId = '' 代表不過濾)
  if (superAdmin) {
    return { clientId: '', isSuperAdmin: true };
  }

  // 一般角色 → 自己的學校
  const own = (user?.clientId || '').trim();
  if (own) {
    return { clientId: own, isSuperAdmin: false };
  }

  // 沒有 clientId 的普通角色 → 依「記憶值 → 第一間學校」兜底
  // (否則 getByClient('') 會靜默回傳空陣列, 使用者完全看不到資料)
  const preferred = (opts?.preferredClientId || '').trim();
  if (preferred && clientStorage.getById(preferred)) {
    return { clientId: preferred, isSuperAdmin: false };
  }
  const remembered = selectedClientStorage.get();
  if (remembered && clientStorage.getById(remembered)) {
    return { clientId: remembered, isSuperAdmin: false };
  }
  const first = clientStorage.getAll()[0]?.id || '';
  return { clientId: first, isSuperAdmin: false };
}

/* ==========================================================================
 *  學年解析 — 寫入蓋章的唯一入口
 *
 *  為什麼需要這一層:
 *    「27-28 的新資料要蓋哪個學年?」這個問題有四個可能的答案來源,
 *    而且在不同情境下應該優先用不同的來源。集中起來才不會各寫各的。
 *
 *  優先順序:
 *    1. 明確指定 (explicit) — 使用者在 UI 上選了學年
 *    2. 該 client 的現行學年 (cbl_academic_years.is_current) ← 正常情況
 *    3. 該 client 的站台設定 (settings.academicYear) ← 舊資料相容
 *    4. 預設值 '2627' ← 最後兜底
 *
 *  ⚠️ 為什麼不從日期反推:
 *    學年邊界是「學校自己訂的」, 不是日曆年。不同學校的開學日可能差幾週。
 *    從 date 反推會讓「2026-09-01 的班次」在某些情況下落到錯的學年。
 *    → date 反推只用於「回填既有資料」(見 0018), 不用於「新寫入」。
 * ========================================================================== */

/**
 * 解析「寫入時要蓋哪個學年」。
 *
 * @param clientId 目標機構 id
 * @param explicit 使用者明確指定的學年 (UI 上的學年下拉) — 優先採用
 * @returns 4 位學年代碼 (例 '2627')
 */
export function resolveWriteAcademicYear(
  clientId: string,
  explicit?: string | null,
): string {
  // 1. 明確指定 (且格式合法)
  if (explicit && isValidAcademicYear(explicit)) return explicit;

  // 2. 現行學年 (學年登錄表 — 權威來源)
  if (clientId) {
    const current = academicYearStorage.getCurrent(clientId);
    if (current && isValidAcademicYear(current.academicYear)) {
      return current.academicYear;
    }
  }

  // 3. 站台設定 (舊資料相容 — 0016 尚未套用時的唯一線索)
  if (clientId) {
    const settings = settingsStorage.getByClient(clientId);
    if (settings.academicYear && isValidAcademicYear(settings.academicYear)) {
      return settings.academicYear;
    }
  }

  // 4. 兜底
  return DEFAULT_ACADEMIC_YEAR;
}

/**
 * 取得某 client 目前「正在檢視」的學年 (用於篩選)。
 *
 * ⚠️ 目前還沒有學年切換器 UI (M3 才會有), 所以先讀現行學年。
 *    介面刻意設計成「之後加一個 selectedYear 狀態就能改」,
 *    呼叫端不需要大改。
 */
export function resolveViewAcademicYear(clientId: string): string {
  return resolveWriteAcademicYear(clientId);
}

/**
 * 依學年篩選資料列。
 *
 * ⚠️ 只篩「有 academicYear 欄位」的 entity。
 *    舊的本機資料可能沒有這個欄位 (localStorage 早於 migration) →
 *    這些列在篩選時要「保留下來」而不是被無聲移除,
 *    否則使用者會以為資料不見了。
 *
 * ⚠️ 實作已移到 lib/academic-year.ts (filterByAcademicYear) ——
 *    這裡保留轉呼叫, 讓既有 import 不用改。
 */
export function filterByAcademicYear<T extends { academicYear?: string | null }>(
  rows: T[],
  academicYear: string,
): T[] {
  return filterByAcademicYearImpl(rows, academicYear);
}

/**
 * 依「資料可見範圍」取得資料列。
 *
 * ⚠️ 傳入的 getAll / getByClient 必須是 arrow function 或已綁定的 method ——
 *    STORAGE.*.getByClient 內部有用到 `this.getAll()`, 直接傳 method reference
 *    會失去 this 綁定而炸掉。
 */
export function scopedRows<T extends { clientId: string }>(
  scope: DataScope,
  getAll: () => T[],
  getByClient: (clientId: string) => T[],
): T[] {
  if (scope.isSuperAdmin) return getAll();
  return scope.clientId ? getByClient(scope.clientId) : [];
}

/**
 * 依「資料可見範圍」取得某日的班次。
 *
 * 這是 /trips 班次列表的正確取法:
 *   - 跨機構角色 (超管) → 跨所有學校 (與後台排程頁一致)
 *   - 一般角色 → 只有自己學校的班次
 */
export function scopedTripsByDate(scope: DataScope, date: string): Trip[] {
  return scopedRows<Trip>(
    scope,
    () => tripStorage.getAll(),
    (cid) => tripStorage.getByClient(cid),
  ).filter((t) => t.date === date);
}

/** 讀取某實體「已成功推送到 Supabase」的 id 清單 */
export function getSyncedIds(entityKey: string): string[] {
  const map = get<Record<string, string[]>>(STORAGE_KEYS.SYNCED_ENTITY_IDS, {});
  return map[entityKey] ?? [];
}

/**
 * 記錄某實體「已成功推送到 Supabase」的 id。
 * 必須在 push 成功 (不是只在本機寫入) 之後才呼叫。
 */
export function markSynced(entityKey: string, id: string) {
  const map = get<Record<string, string[]>>(STORAGE_KEYS.SYNCED_ENTITY_IDS, {});
  const list = map[entityKey] ?? [];
  if (list.includes(id)) return;
  list.push(id);
  map[entityKey] = list;
  set(STORAGE_KEYS.SYNCED_ENTITY_IDS, map);
}

/** 移除某實體的同步記錄 (刪除資料時用) */
export function unmarkSynced(entityKey: string, id: string) {
  const map = get<Record<string, string[]>>(STORAGE_KEYS.SYNCED_ENTITY_IDS, {});
  const list = map[entityKey] ?? [];
  const next = list.filter((x) => x !== id);
  if (next.length === list.length) return;
  map[entityKey] = next;
  set(STORAGE_KEYS.SYNCED_ENTITY_IDS, map);
}

/**
 * 比較兩筆資料的內容是否相同 (忽略 key 順序)。
 *
 * 為什麼不能用 JSON.stringify 直接比:
 *   - DB 欄位順序 (snake_case 轉 camelCase 後) 與本機物件的 key 順序不同
 *   - → JSON.stringify 結果不同, 但內容其實一樣 → 每次 pull 都誤判為「有更新」
 *   - → 表格每次重新整理都會 re-render 閃一下
 */
function isSameRow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => isSameRow(v, b[i]));
  }
  const ka = Object.keys(a as Record<string, unknown>).sort();
  const kb = Object.keys(b as Record<string, unknown>).sort();
  if (ka.length !== kb.length) return false;
  if (ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) =>
    isSameRow(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

/**
 * 把 DB 資料合併進本機 (通用版)。
 *
 * @param entityKey   實體識別字串 (例如 'students') — 用來記錄同步過的 id
 * @param localRows   本機現有資料
 * @param dbRows      從 DB 拉回來的資料
 * @param setAll      寫回本機的函式
 * @param opts.compare  選用: (local, db) => local  — 回傳 true 表示本機較新應保留
 *                       (用於有 updatedAt 的資料, 例如 trips / attendances)
 */
export function mergeCloudRecords<T extends { id: string }>(
  entityKey: string,
  localRows: T[],
  dbRows: T[],
  setAll: (rows: T[]) => void,
  opts?: {
    /** 回傳 true = 本機這筆較新, 保留本機 (否則以 DB 為準) */
    compare?: (local: T, db: T) => boolean;
    /** 自訂合併鍵 (預設用 id)。用於 id 可能不一致但業務鍵相同的資料 */
    keyOf?: (row: T) => string;
  },
): { merged: T[]; added: number; updated: number; removed: number; keptLocal: number } {
  const keyOf = opts?.keyOf ?? ((r: T) => r.id);
  const localByKey = new Map(localRows.map((r) => [keyOf(r), r]));
  const dbKeys = new Set(dbRows.map(keyOf));
  const syncedIds = new Set(getSyncedIds(entityKey));

  let added = 0;
  let updated = 0;
  let keptLocal = 0;

  const merged: T[] = dbRows.map((dbRow) => {
    const k = keyOf(dbRow);
    const localRow = localByKey.get(k);
    if (!localRow) {
      added++;
      return dbRow;
    }
    // 本機較新 (且本機有 updatedAt 語意) → 保留本機
    if (opts?.compare?.(localRow, dbRow)) {
      keptLocal++;
      return localRow;
    }
    // DB 為準 — 但要判斷內容是否真的不同, 否則每次 pull 都會產生新 array
    // → 觸發整個 table re-render (表格閃一下)
    if (!isSameRow(localRow, dbRow)) updated++;
    return dbRow;
  });

  // 只存在於本機的
  let removed = 0;
  const localOnly = localRows.filter((r) => {
    const k = keyOf(r);
    if (dbKeys.has(k)) return false;
    // 推過雲端 → 在別的裝置被刪了 → 跟著刪
    if (syncedIds.has(k)) {
      removed++;
      return false;
    }
    // 沒推過 → 保留 (還在等待 push)
    keptLocal++;
    return true;
  });

  const result = [...merged, ...localOnly];

  // 記錄這次 sync 後 DB 有的 id
  const nextSynced = new Set(dbKeys);
  const map = get<Record<string, string[]>>(STORAGE_KEYS.SYNCED_ENTITY_IDS, {});
  map[entityKey] = Array.from(nextSynced);
  set(STORAGE_KEYS.SYNCED_ENTITY_IDS, map);

  setAll(result);

  return { merged: result, added, updated, removed, keptLocal };
}

/* ==========================================================================
    待推送的本機變更 (pending patches)
   ==========================================================================
   為什麼需要:
     學生 / 家長 / 保姆是「本機先寫、雲端後推」的流程。
     管理員綁定子女時先寫 localStorage, 背景才 push 到 DB。

     問題: 綁定剛寫完、push 還在跑, 此時若有一次 syncFromSupabase() 拉回
     雲端的「舊快照」(還沒包含這次綁定), 合併時會以雲端為準 → 綁定被洗掉。
     (這跟 tripStorage.mergeAll 註解裡說的「自己吃掉自己」是同一類 bug,
      只是這次受害的是 student.parentIds。)

   解法:
     綁定後把「待推送的欄位值」記在這裡 (PENDING_PATCHES),
     合併時把這些 pending 值覆蓋在雲端資料上 → 綁定不會被洗掉。
     push 成功後呼叫 clearPendingPatch() 移除 → 之後雲端就是唯一真相。

   value: { [entityKey]: { [id]: { [field]: unknown } } }
   ========================================================================== */

const PENDING_PATCH_KEY = 'cbl_pending_patches';

type PendingMap = Record<string, Record<string, Record<string, unknown>>>;

function readPending(): PendingMap {
  return get<PendingMap>(PENDING_PATCH_KEY, {});
}

function writePending(m: PendingMap): void {
  set(PENDING_PATCH_KEY, m);
}

/**
 * 記錄「這筆資料的這些欄位有本機變更還沒推上雲端」。
 *
 * @param entityKey 實體識別 (例如 'students')
 * @param id        該筆資料的 id
 * @param patch     變更的欄位值 (camelCase, 例如 { parentIds: [...] })
 */
export function markPendingPatch(
  entityKey: string,
  id: string,
  patch: Record<string, unknown>,
): void {
  if (!entityKey || !id || !patch || Object.keys(patch).length === 0) return;
  const map = readPending();
  if (!map[entityKey]) map[entityKey] = {};
  map[entityKey][id] = { ...(map[entityKey][id] || {}), ...patch };
  writePending(map);
}

/** push 成功後清除該筆的待推送紀錄 */
export function clearPendingPatch(entityKey: string, id: string): void {
  const map = readPending();
  if (!map[entityKey] || !map[entityKey][id]) return;
  delete map[entityKey][id];
  if (Object.keys(map[entityKey]).length === 0) delete map[entityKey];
  writePending(map);
}

/**
 * 讀出所有「待推送的本機變更」。
 *
 * 用途: 欄位降級 (schema 尚未更新) 導致 push 失敗時, 這些欄位會留在 pending。
 *   等 schema 更新 (migration 套好) 後, 可以把 pending 重新推上雲端,
 *   避免使用者填的資料一直卡在本機。
 */
export function getPendingPatches(entityKey: string): Record<string, Record<string, unknown>> {
  return readPending()[entityKey] ?? {};
}

/**
 * 把「待推送的本機變更」套回雲端資料上。
 *
 * @param entityKey 實體識別 (例如 'students')
 * @param dbRows    從雲端拉回來的資料
 * @returns 套用 pending 之後的資料
 */
export function applyPendingPatches<T extends { id: string }>(
  entityKey: string,
  dbRows: T[],
): T[] {
  const pending = readPending()[entityKey];
  if (!pending || Object.keys(pending).length === 0) return dbRows;
  return dbRows.map((row) => {
    const p = pending[row.id];
    if (!p) return row;
    return { ...row, ...p } as T;
  });
}

/* ==========================================================================
    登入帳號的「雲端 → 本機」合併 (cbl_users 專用)
   ==========================================================================
   為什麼需要獨立一個函式:
     帳號是「本機先寫、雲端後推」的流程 ——
     管理員新增家長 / 保姆時先寫 localStorage (讓 UI 即時反應),
     背景再 push 到 cbl_users。如果 push 還沒完成、或 push 失敗
     (FK / RLS / 網路), 雲端就沒有這筆帳號。

     若這裡用 setAll() 整批覆蓋 →
     剛建立的帳號會憑空消失 → 家長頁顯示「無帳號」,
     家長端登入回「帳戶不存在」。

   合併規則 (和 mergeCloudRecords 一致的思路):
     - 雲端有的 id                       → 以雲端為準 (source of truth)
     - 只有本機有的 id + 推過雲端        → 丟掉 (在別的裝置被刪了)
     - 只有本機有的 id + 沒推過雲端      → 保留 (還沒 push 成功, 別洗掉)
     - 電話與雲端重複的本機帳號           → 丟棄 (避免兩筆同電話的帳號,
                                       導致 findByPhone 命中錯誤的那筆)

   ⚠️ 「推過雲端」的判斷依賴 SYNCED_ENTITY_IDS (markSynced / unmarkSynced)。
      所以 cbl_users 的 add / update 成功後必須呼叫 markSynced('users', id),
      否則「在別的裝置被刪掉」的帳號會永遠留在本機。
   ========================================================================== */
export function mergeCloudUsers(cloudUsers: User[]): {
  merged: User[];
  keptLocal: number;
} {
  const localUsers = userStorage.getAll();
  const cloudIds = new Set(cloudUsers.map((u) => u.id));
  const cloudPhones = new Set(cloudUsers.map((u) => u.phone));
  const syncedIds = new Set(getSyncedIds('users'));

  let keptLocal = 0;
  let removed = 0;

  const localOnly: User[] = [];
  for (const u of localUsers) {
    // 雲端已有這筆 (同 id) → 雲端為準, 本機這筆不需要保留
    if (cloudIds.has(u.id)) continue;

    // 電話與雲端重複 → 讓位給雲端那筆 (以雲端為準)
    if (cloudPhones.has(u.phone)) {
      removed++;
      continue;
    }

    // 推過雲端但雲端不見了 → 在別的裝置被刪了 → 跟著刪
    if (syncedIds.has(u.id)) {
      removed++;
      continue;
    }

    // 沒推過雲端 → 保留 (還在等待 push)
    keptLocal++;
    localOnly.push(u);
  }

  if (removed > 0) {
    console.log(`[Storage] 移除 ${removed} 筆已被雲端取代或刪除的本機帳號`);
  }
  if (keptLocal > 0) {
    console.log(
      `[Storage] 保留 ${keptLocal} 筆尚未推上雲端的本機帳號: ${localOnly
        .map((u) => u.phone)
        .join(', ')}`,
    );
  }

  // 記錄這次 sync 後雲端有的 id (供下次判斷「是否推過雲端」)
  const map = get<Record<string, string[]>>(STORAGE_KEYS.SYNCED_ENTITY_IDS, {});
  map.users = Array.from(cloudIds);
  set(STORAGE_KEYS.SYNCED_ENTITY_IDS, map);

  return { merged: [...cloudUsers, ...localOnly], keptLocal };
}

export const STORAGE = {
  KEYS: STORAGE_KEYS,
  auth: authStorage,
  users: userStorage,
  clients: clientStorage,
  // 別名：學校 = cbl_clients (選項 B，cbl_clients 即學校表)
  schools: clientStorage,
  companies: companyStorage,
  selectedClient: selectedClientStorage,
  drivers: driverStorage,
  buses: busStorage,
  students: studentStorage,
  parents: parentStorage,
  nannies: nannyStorage,
  trips: tripStorage,
  routes: routeStorage,
  attendances: attendanceStorage,
  announcements: announcementStorage,
  incidents: incidentStorage,
  payments: paymentStorage,
  announcementReads: readAnnouncementStorage,
  incidentReads: readIncidentStorage,
  announcementViews: announcementViewStorage,
  announcementPopupPref: announcementPopupPrefStorage,
  announcementDismiss: announcementDismissStorage,
  settings: settingsStorage,
  academicYears: academicYearStorage,
  recentBusSearches: recentBusSearchesStorage,
  userFeaturePermissions: userFeaturePermissionStorage,
  isInitialized,
  markInitialized,
  genId,
};
