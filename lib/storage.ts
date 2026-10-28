// localStorage ?????????- Demo?????
// ?????? Supabase ????????????????

import type {
  User, Client, Company, Driver, Bus, Student, Parent, Nanny,
  Trip, Attendance, Announcement, SiteSettings, Route
} from './types';

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
  //   - 從沒進過 DB (例如示範公告 ann-001) → 保留在 localStorage
  //   - 已經在 DB 但現在不見了 → 是在別的裝置被刪掉 → 也要跟著刪
  ANNOUNCEMENTS_SYNCED_IDS: 'cbl_announcements_synced_ids',
  // 每個實體「已成功推送到 Supabase」的 id 清單
  // value: { [entityKey: string]: string[] }
  //
  // 用途: 讓 mergeCloudRecords 能分辨「這筆是從沒推上雲端 (保留在 localStorage)」
  //   還是「推上過、但後來在別的裝置被刪 (跟著刪掉)」
  //   這是「本機先寫、雲端後推」流程能安全做全量 pull 的前提。
  SYNCED_ENTITY_IDS: 'cbl_synced_entity_ids',
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
export const studentStorage = {
  getAll(): Student[] {
    return get<Student[]>(STORAGE_KEYS.STUDENTS, []);
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
    return get<Route[]>(STORAGE_KEYS.ROUTES, []);
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
    return get<Trip[]>(STORAGE_KEYS.TRIPS, []);
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
   *   2. 只有 local 有的 trip → 保留 (可能尚未 push 成功, 或是在別的裝置被刪)
   *      註: 跨裝置刪除目前不同步回來 — 寧可暫時多留一筆, 也不要讓管理員的班次消失
   *   3. 只有 DB 有的 trip → 使用 (其他裝置新建的)
   */
  mergeAll(fromDb: Trip[]) {
    const local = this.getAll();
    const localById = new Map(local.map((t) => [t.id, t]));
    const dbIds = new Set(fromDb.map((t) => t.id));

    const merged: Trip[] = fromDb.map((dbItem) => {
      const localItem = localById.get(dbItem.id);
      if (!localItem) return dbItem;
      // 本機較新 → 保留本機 (尚未成功 push 的變更)
      if (localItem.updatedAt && dbItem.updatedAt &&
          localItem.updatedAt > dbItem.updatedAt) {
        return localItem;
      }
      return dbItem;
    });

    // 只存在於本機的 (尚未 push / 雲端已刪)
    const localOnly = local.filter((t) => !dbIds.has(t.id));

    this.setAll([...merged, ...localOnly]);
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
    return get<Announcement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
  },
  getByClient(clientId: string): Announcement[] {
    return this.getAll().filter(a => a.clientId === clientId);
  },
  /**
   * 依「可見範圍」取得公告。
   * @param clientId 目前使用者的 clientId (super_admin 可能是 null/'')
   * @param isSuperAdmin true = 跨機構, 看得到全部公告
   */
  getVisible(clientId: string, isSuperAdmin = false): Announcement[] {
    if (isSuperAdmin) return this.getAll();
    return this.getByClient(clientId);
  },
  getTemplates(clientId: string, isSuperAdmin = false): Announcement[] {
    return this.getVisible(clientId, isSuperAdmin).filter(a => a.isTemplate);
  },
  /**
   * 取得「生效中且在有效期內」的公告。
   * 範例外: isTemplate 的公告不算 (範本只是草稿, 不發佈)。
   */
  getActive(clientId: string, isSuperAdmin = false): Announcement[] {
    const now = new Date().toISOString();
    return this.getVisible(clientId, isSuperAdmin).filter(a =>
      a.isActive && !a.isTemplate &&
      a.startDate <= now && a.endDate >= now
    );
  },
  setAll(announcements: Announcement[]) {
    set(STORAGE_KEYS.ANNOUNCEMENTS, announcements);
  },
  /**
   * 合併 (merge) 而不是覆蓋 (replace)。
   *
   * 為什麼需要 merge:
   * - 示範公告 (ann-001) 只存在 localStorage (mock-data 種子資料), 不在 DB
   * - 若 syncToStorage() 用 setAll() 覆蓋, 進一次後台頁面就會把示範公告清掉
   *
   * 合併規則:
   * - DB 是 source of truth → DB 有的項目以 DB 內容為準
   * - 但 currentCount 取 localStorage / DB 的較大值
   *   (避免「本機已 +1、DB 還沒同步到」的短暫 race 造成次數被倒退)
   * - DB 沒有、localStorage 有的項目:
   *   - 從沒同步過 (不在 syncedIds) → 保留 (示範公告這種情況)
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
  ): Announcement[] {
    const now = new Date().toISOString();
    return this.getActive(clientId, isSuperAdmin).filter(a => {
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
  ): Announcement[] {
    const dismissed = announcementDismissStorage.getDismissed(userId, clientId);
    return this.getActive(clientId, isSuperAdmin).filter(
      (a) => !dismissed.has(a.id),
    );
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
  announcementReads: readAnnouncementStorage,
  announcementViews: announcementViewStorage,
  announcementPopupPref: announcementPopupPrefStorage,
  announcementDismiss: announcementDismissStorage,
  settings: settingsStorage,
  recentBusSearches: recentBusSearchesStorage,
  userFeaturePermissions: userFeaturePermissionStorage,
  isInitialized,
  markInitialized,
  genId,
};
