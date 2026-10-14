// localStorage ?????????- Demo?????
// ?????? Supabase ????????????????

import type {
  User, Client, Driver, Bus, Student, Parent, Nanny,
  Trip, Attendance, Announcement, SiteSettings, Route
} from './types';

const STORAGE_KEYS = {
  AUTH: 'cbl_auth',
  USERS: 'cbl_users',
  CLIENTS: 'cbl_clients',
  DRIVERS: 'cbl_drivers',
  BUSES: 'cbl_buses',
  STUDENTS: 'cbl_students',
  PARENTS: 'cbl_parents',
  NANNIES: 'cbl_nannies',
  TRIPS: 'cbl_trips',
  ROUTES: 'cbl_routes',
  ATTENDANCES: 'cbl_attendances',
  ANNOUNCEMENTS: 'cbl_announcements',
  // ?????????????????? ID ??????????????? notification bell ??????????
  // ???: { [userId_clientId]: string[] }  ?????announcement.id
  ANNOUNCEMENT_READS: 'cbl_announcement_reads',
  // ?????????? ? ????????? client ???????
  // ?? AnnouncementPopup?value: { [userId_clientId]: boolean }
  // true = ?????, ???????????? dialog?
  // ?????? /settings/announcements ?????
  ANNOUNCEMENT_POPUP_DISABLED: 'cbl_announcement_popup_disabled',
  SETTINGS: 'cbl_settings',
  INITIALIZED: 'cbl_initialized',
  RECENT_BUS_SEARCHES: 'cbl_recent_bus_searches',
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

// ============= Drivers =============
export const driverStorage = {
  getAll(): Driver[] {
    return get<Driver[]>(STORAGE_KEYS.DRIVERS, []);
  },
  getByClient(clientId: string): Driver[] {
    return this.getAll().filter(d => d.clientId === clientId);
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
};

// ============= Announcements =============
export const announcementStorage = {
  getAll(): Announcement[] {
    return get<Announcement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
  },
  getByClient(clientId: string): Announcement[] {
    return this.getAll().filter(a => a.clientId === clientId);
  },
  getTemplates(clientId: string): Announcement[] {
    return this.getByClient(clientId).filter(a => a.isTemplate);
  },
  getActive(clientId: string): Announcement[] {
    const now = new Date().toISOString();
    return this.getByClient(clientId).filter(a =>
      a.isActive && !a.isTemplate &&
      a.startDate <= now && a.endDate >= now
    );
  },
  setAll(announcements: Announcement[]) {
    set(STORAGE_KEYS.ANNOUNCEMENTS, announcements);
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

// ============= Announcement Popup Disabled Preference =============
// ?? user ????????? AnnouncementPopup?
//
// ??:
// - per-user + per-client, ? readKey ?? composite key ??
// - ???? key ?????????(false), ???????popup ????
// - ?? set / get / clearAll
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

// ============= ??????=============
export function isInitialized(): boolean {
  return get<boolean>(STORAGE_KEYS.INITIALIZED, false);
}

export function markInitialized() {
  set(STORAGE_KEYS.INITIALIZED, true);
}

export const STORAGE = {
  KEYS: STORAGE_KEYS,
  auth: authStorage,
  users: userStorage,
  clients: clientStorage,
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
  announcementPopupPref: announcementPopupPrefStorage,
  settings: settingsStorage,
  recentBusSearches: recentBusSearchesStorage,
  isInitialized,
  markInitialized,
  genId,
};
