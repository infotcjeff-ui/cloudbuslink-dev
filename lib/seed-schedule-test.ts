'use client';

/**
 * lib/seed-schedule-test.ts — 班次頁「一鍵新增測試資料 / 一鍵移除測試資料」
 *
 * 範圍: 僅 /cbl-admin-setting/schedule 測試用, 全部只寫 localStorage (不推雲端)。
 *
 * 生成內容 (最小閉環 + 髒資料):
 *   - 校巴 ×2 (其中一輛小容量 5–8 座, 專門用來造超載)
 *   - 司機 ×2 / 保姆 ×2 (分別綁定校巴)
 *   - 學生 ×12 + 家長 ×12 (1 對 1)
 *   - 路線模板 ×1
 *   - 班次 ×10 (固定比例: 今日3 + 昨日2 + 明日2 + 舊日期3;
 *     狀態混合 scheduled / in_progress / completed / cancelled)
 *   - 打卡記錄 (completed 全員混合準時/遲到/缺席; in_progress 半數已上車)
 *   - 髒資料: 1 組學生撞時間 + 1 班超載 + 1 班未指派保姆
 *
 * 識別: 所有 id 統一 `seed-` 前綴 → 移除時只刪此前綴 (+ 相容舊 `test-`), 不碰真實資料。
 * ⚠️ 不能用 `test-` — lib/purge-test-data.ts 會在 schedule page mount 時
 *    把 `test-` 前綴當殘留清掉, 種子資料下次進頁就會消失。
 */

import { STORAGE } from './storage';
import { addDaysIso, todayIso } from '@/app/(main)/cbl-admin-setting/schedule/scheduleUtils';
import { SEED_PREFIX, isSeedId } from './seed-ids';
import type {
  Bus,
  Driver,
  Nanny,
  Student,
  Parent,
  Route,
  Trip,
  TripStatus,
  TripType,
  Attendance,
  Waypoint,
  User,
} from './types';

const PREFIX = SEED_PREFIX;
const LEGACY_PREFIX = 'test-';
const BATCH_KEY = 'cbl_seed_schedule_batch_no';

const SURNAMES = ['陳', '黃', '李', '張', '劉', '吳', '何', '郭', '梁', '許', '鄭', '謝', '韓', '唐', '馮', '董', '蕭', '程', '曹', '袁'];
const GIVEN = ['子晴', '俊豪', '思敏', '浩然', '芷瑤', '天佑', '欣怡', '柏豪', '雨桐', '梓軒', '嘉琪', '彥廷', '曉彤', '峻熙', '詩穎', '樂瑤', '承翰', '詠詩', '凱琳', '澤宇'];
const STOPS = [
  { name: '沙田圍站 A 出口', lat: 22.3801, lng: 114.1953 },
  { name: '大圍站 B 出口對出', lat: 22.3738, lng: 114.1799 },
  { name: '顯徑邨顯揚樓', lat: 22.3785, lng: 114.1842 },
  { name: '美林邨美楓樓', lat: 22.3742, lng: 114.1733 },
  { name: '隆亨邨善心樓', lat: 22.3812, lng: 114.1891 },
  { name: '新翠邨新學樓', lat: 22.3761, lng: 114.1827 },
  { name: '秦石邨石晶樓', lat: 22.3755, lng: 114.1871 },
  { name: '博康邨博文樓', lat: 22.3792, lng: 114.1925 },
  { name: '水泉澳邨月泉樓', lat: 22.3831, lng: 114.1998 },
  { name: '示範小學正門', lat: 22.3799, lng: 114.1878 },
];
const BUS_BRANDS = ['豐田 Coaster', '三菱 Rosa', '五十鈴 NPR', 'MAN A91', '現代 County'];
const ROUTE_NAMES = ['沙田晨運線', '大圍快線', '顯徑接駁線', '美林專線', '博康環線', '水泉澳快線'];
const SCHOOL_NAMES = ['示範小學正門', '培正小學側門', '沙田官立小學正門'];
const CUSTOM_LABELS = ['課外活動', '補習班', '興趣班', '校隊訓練', '戶外教學'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/** 下一批次號 (localStorage 計數, 保證每次肉眼可區分) */
function nextBatchNo(): number {
  try {
    const raw = localStorage.getItem(BATCH_KEY);
    const n = (raw ? parseInt(raw, 10) : 0) + 1;
    localStorage.setItem(BATCH_KEY, String(n));
    return n;
  } catch {
    return randInt(1, 999);
  }
}

/** 隨機香港車牌 (避開現有車牌) */
function uniquePlate(taken: Set<string>): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 50; i++) {
    const p = `${letters[randInt(0, 23)]}${letters[randInt(0, 23)]} ${randInt(1000, 9999)}`;
    if (!taken.has(p)) {
      taken.add(p);
      return p;
    }
  }
  const p = `TS ${randInt(1000, 9999)}`;
  taken.add(p);
  return p;
}

/** 隨機 8 位香港電話 (避開現有) */
function uniquePhone(taken: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const p = `9${String(randInt(1000000, 9999999))}`;
    if (!taken.has(p)) {
      taken.add(p);
      return p;
    }
  }
  const p = `9${String(Date.now()).slice(-7)}`;
  taken.add(p);
  return p;
}

/** 不重複隨機人名 (批次內不重複) */
function uniqueName(used: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const n = `${pick(SURNAMES)}${pick(GIVEN)}`;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  const n = `${pick(SURNAMES)}${pick(GIVEN)}·${randInt(11, 99)}`;
  used.add(n);
  return n;
}

/** HH:mm 加減分鐘 (產隨機時段抖動用) */
function shiftMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + delta;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const jitter = () => randInt(-12, 12);

export interface SeedResult {
  trips: number;
  buses: number;
  drivers: number;
  nannies: number;
  students: number;
  parents: number;
  routes: number;
  attendances: number;
  /** 測試登入帳號 (只存在本機) — 供 toast 直接顯示帳號/密碼給測試者 */
  accounts: { accountName: string; phone: string; password: string; name: string }[];
}

/**
 * 一鍵新增測試資料 (只寫 localStorage)。
 * 每次呼叫: 車牌 / 電話 / 人名 / 路線名 / 站點組合 / 時段全部重新隨機,
 * 並帶批次號後綴, 保證與上一批肉眼可區分。
 * @returns 各實體新增筆數 (供 toast 回報)
 */
export function seedScheduleTestData(clientId: string, academicYear: string): SeedResult {
  const now = new Date().toISOString();
  const today = todayIso();
  const batch = nextBatchNo();
  const tag = `B${batch}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

  const takenPlates = new Set(STORAGE.buses.getAll().map((b) => b.plateNumber));
  const takenPhones = new Set([
    ...STORAGE.drivers.getAll().map((d) => d.phone),
    ...STORAGE.nannies.getAll().map((n) => n.phone),
    ...STORAGE.parents.getAll().map((p) => p.phone),
  ]);
  const usedNames = new Set<string>();

  /* ---------- 校巴 / 司機 / 保姆 (全部隨機) ---------- */
  const driverA: Driver = {
    id: `${PREFIX}drv-a-${tag}`, clientId, name: uniqueName(usedNames), phone: uniquePhone(takenPhones),
    licenseNumber: `SEED-A-${tag}`, photo: null, status: 'available', createdAt: now,
  };
  const driverB: Driver = {
    id: `${PREFIX}drv-b-${tag}`, clientId, name: uniqueName(usedNames), phone: uniquePhone(takenPhones),
    licenseNumber: `SEED-B-${tag}`, photo: null, status: 'available', createdAt: now,
  };
  const busA: Bus = {
    id: `${PREFIX}bus-a-${tag}`, clientId, plateNumber: uniquePlate(takenPlates),
    model: `${pick(BUS_BRANDS)} (測${batch})`,
    capacity: randInt(20, 29), driverId: driverA.id, gpsDeviceId: null, status: 'active', createdAt: now,
  };
  // 小容量車 — 專門造超載髒資料
  const busB: Bus = {
    id: `${PREFIX}bus-b-${tag}`, clientId, plateNumber: uniquePlate(takenPlates),
    model: `${pick(BUS_BRANDS)} (測${batch})`,
    capacity: randInt(5, 8), driverId: driverB.id, gpsDeviceId: null, status: 'active', createdAt: now,
  };
  // 測試保姆的登入帳戶名稱 (URL-safe, 在同一 tenant 內唯一)
  // → 讓測試者可以用「帳戶名稱」或「電話」兩種方式登入保姆入口
  const nannyAccountA = `seed-nanny-a-${tag.toLowerCase()}`;
  const nannyAccountB = `seed-nanny-b-${tag.toLowerCase()}`;
  const nannyA: Nanny = {
    id: `${PREFIX}nny-a-${tag}`, clientId, name: uniqueName(usedNames), phone: uniquePhone(takenPhones),
    employeeId: `SEED-EMP-A${tag}`, accountName: nannyAccountA, photo: null, assignedBusIds: [busA.id],
    status: 'active', createdAt: now,
  };
  const nannyB: Nanny = {
    id: `${PREFIX}nny-b-${tag}`, clientId, name: uniqueName(usedNames), phone: uniquePhone(takenPhones),
    employeeId: `SEED-EMP-B${tag}`, accountName: nannyAccountB, photo: null, assignedBusIds: [busB.id],
    status: 'active', createdAt: now,
  };
  STORAGE.drivers.add(driverA);
  STORAGE.drivers.add(driverB);
  STORAGE.buses.add(busA);
  STORAGE.buses.add(busB);
  STORAGE.nannies.add(nannyA);
  STORAGE.nannies.add(nannyB);

  /* ---------- 登入帳號 (只寫 localStorage, 永不推雲端) ----------
   *
   * 為什麼需要這一段:
   *   測試者要用「測試帳戶」登入保姆入口 → 必須在 cbl_users 有對應帳號。
   *   但正常新增保姆的流程會把帳號 push 到 Supabase (cbl_users) →
   *   測試帳號會污染後台、也會被雲端同步洗掉。
   *   → 這裡只寫 localStorage, 且 id 用 seed- 前綴 → 移除時一併刪掉。
   *
   * 密碼: 與「新增保姆」預設一致 (電話號碼), 見 lib/auth-lookup.ts 的
   *        rebuildUserFromNanny (自癒層也用電話當預設密碼)。
   */
  const seedUsers: User[] = [
    {
      id: `${PREFIX}usr-a-${tag}`, phone: nannyA.phone, accountName: nannyAccountA,
      password: nannyA.phone, role: 'nanny', name: nannyA.name,
      clientId, status: 'active', createdAt: now,
    },
    {
      id: `${PREFIX}usr-b-${tag}`, phone: nannyB.phone, accountName: nannyAccountB,
      password: nannyB.phone, role: 'nanny', name: nannyB.name,
      clientId, status: 'active', createdAt: now,
    },
  ];
  seedUsers.forEach((u) => {
    // 電話已被真實帳號佔用 → 不覆蓋 (避免把真實帳號的密碼改掉)
    if (STORAGE.users.findByPhone(u.phone)) return;
    STORAGE.users.add(u);
  });

  /* ---------- 學生 + 家長 (1 對 1, 人名/電話/站點全部隨機) ---------- */
  const school = pick(SCHOOL_NAMES);
  const students: Student[] = [];
  for (let i = 0; i < 12; i++) {
    const sid = `${PREFIX}stu-${tag}-${i}`;
    const pid = `${PREFIX}par-${tag}-${i}`;
    const name = uniqueName(usedNames);
    const stop = pick(STOPS.slice(0, -1));
    const parentName = uniqueName(usedNames);
    const parent: Parent = {
      id: pid, clientId, name: parentName, phone: uniquePhone(takenPhones),
      alternatePhone: null, homePhone: null, officePhone: null, address: null,
      relationship: i % 2 === 0 ? 'father' : 'mother', isPickupAuth: true,
      password: 'test1234', notificationEnabled: false, status: 'active', createdAt: now,
    };
    STORAGE.parents.add(parent);
    const student: Student = {
      id: sid, clientId,
      studentId: `stu-${academicYear}S${tag}${String(i).padStart(2, '0')}`,
      academicYear, name, classNumber: `${randInt(1, 6)}${pick(['A', 'B', 'C', 'D'])}`,
      phone: null, photo: null, gender: Math.random() < 0.5 ? 'male' : 'female',
      dateOfBirth: null, status: 'active', parentIds: [pid], primaryParentId: pid,
      busId: i < 8 ? busA.id : busB.id,
      pickupLocation: { name: stop.name, address: stop.name, latitude: stop.lat, longitude: stop.lng, type: 'pickup' },
      dropoffLocation: { name: school, address: school, latitude: 22.3799, longitude: 114.1878, type: 'dropoff' },
      emergencyContactName: null, emergencyContactPhone: null, emergencyContactRelationship: null,
      createdAt: now,
    };
    STORAGE.students.add(student);
    students.push(student);
  }

  /* ---------- 路線模板 ×1 (隨機名 + 隨機站點) ---------- */
  const routeId = `${PREFIX}rte-${tag}`;
  const routeStudents = sample(students, randInt(6, 8)).map((s) => s.id);
  const routeStops = sample(STOPS.slice(0, -1), 3);
  const routeShift = pick(['morning', 'afternoon'] as const);
  const routeBus = pick([busA, busB]);
  const routeDriver = routeBus.id === busA.id ? driverA : driverB;
  const routeNanny = routeBus.id === busA.id ? nannyA : nannyB;
  const route: Route = {
    id: routeId, clientId, code: `${academicYear}-SEED${tag}`, academicYear,
    name: `${pick(ROUTE_NAMES)}(測${batch})`, shiftType: routeShift,
    busId: routeBus.id, driverId: routeDriver.id, nannyId: routeNanny.id,
    stops: [
      { id: `${PREFIX}rs-1-${tag}`, seq: 1, kind: 'origin', eta: shiftMinutes('07:20', jitter()), name: routeStops[0].name, latitude: routeStops[0].lat, longitude: routeStops[0].lng, studentIds: routeStudents.slice(0, Math.ceil(routeStudents.length / 2)), notes: '' },
      { id: `${PREFIX}rs-2-${tag}`, seq: 2, kind: 'middle', eta: shiftMinutes('07:35', jitter()), name: routeStops[1].name, latitude: routeStops[1].lat, longitude: routeStops[1].lng, studentIds: routeStudents.slice(Math.ceil(routeStudents.length / 2)), notes: '' },
      { id: `${PREFIX}rs-3-${tag}`, seq: 3, kind: 'terminal', eta: shiftMinutes('08:00', jitter()), name: school, latitude: 22.3799, longitude: 114.1878, studentIds: routeStudents, notes: '' },
    ],
    createdAt: now, updatedAt: now,
  };
  STORAGE.routes.add(route);

  /* ---------- 班次 ×10 (固定比例 + 狀態混合, 時段/人數隨機) ---------- */
  interface TripSpec {
    dateOff: number; // 相對今日的天數
    type: TripType;
    status: TripStatus;
    bus: Bus;
    nanny: Nanny | null; // null = 未指派保姆 (髒資料)
    start: string;
    end: string;
    label?: string;
  }
  const customLabel = () => pick(CUSTOM_LABELS);
  const specs: TripSpec[] = [
    { dateOff: 0, type: 'morning', status: 'scheduled', bus: busA, nanny: nannyA, start: '07:30', end: '08:30' },
    { dateOff: 0, type: 'afternoon', status: 'in_progress', bus: busB, nanny: nannyB, start: '12:30', end: '13:30' },
    { dateOff: 0, type: 'custom', status: 'completed', bus: busA, nanny: nannyA, start: '16:00', end: '17:00', label: customLabel() },
    // 昨日: 同一學生 + 時段重疊 → 學生衝突 (不同車, 避免連帶校巴衝突)
    { dateOff: -1, type: 'morning', status: 'completed', bus: busA, nanny: nannyA, start: '07:30', end: '08:30' },
    { dateOff: -1, type: 'afternoon', status: 'scheduled', bus: busB, nanny: null, start: '08:00', end: '09:00' },
    { dateOff: 1, type: 'morning', status: 'scheduled', bus: busA, nanny: nannyA, start: '07:30', end: '08:30' },
    { dateOff: 1, type: 'afternoon', status: 'scheduled', bus: busB, nanny: nannyB, start: '12:30', end: '13:30' },
    { dateOff: -4, type: 'custom', status: 'completed', bus: busB, nanny: nannyB, start: '15:00', end: '16:00', label: customLabel() },
    { dateOff: -5, type: 'morning', status: 'cancelled', bus: busA, nanny: nannyA, start: '07:30', end: '08:30' },
    // 超載: 小容量 busB 硬塞超過容量的學生
    { dateOff: -7, type: 'afternoon', status: 'scheduled', bus: busB, nanny: nannyB, start: '12:30', end: '13:30' },
  ];

  const conflictStudent = pick(students); // 撞時間的主角 (每批隨機)
  let attendanceCount = 0;

  specs.forEach((spec, idx) => {
    const date = addDaysIso(today, spec.dateOff);
    const start = shiftMinutes(spec.start, jitter());
    const end = shiftMinutes(spec.end, jitter());
    // 超載班: 人數 = 小車容量 + 2~4; 其餘隨機 4–6 個
    let tripStudents = sample(students, randInt(4, 6));
    if (idx === 3 || idx === 4) {
      // 撞時間組: 強制共用主角學生
      if (!tripStudents.some((s) => s.id === conflictStudent.id)) {
        tripStudents[0] = conflictStudent;
      }
    }
    if (idx === 9) tripStudents = sample(students, Math.min(students.length, busB.capacity + randInt(2, 4)));

    const pickupStops = sample(STOPS.slice(0, -1), 2);
    const mkWp = (
      suffix: string, wpType: 'pickup' | 'dropoff', loc: { name: string; lat: number; lng: number },
      time: string, studentIds: string[],
    ): Waypoint => ({
      id: `${PREFIX}wp-${tag}-${idx}-${suffix}`,
      location: { name: loc.name, address: loc.name, latitude: loc.lat, longitude: loc.lng, type: wpType },
      type: wpType, scheduledTime: time, actualTime: spec.status === 'completed' ? time : null,
      status: spec.status === 'completed' ? 'completed' : 'pending',
      studentIds, notes: null,
    });
    const wp1 = mkWp('1', 'pickup', pickupStops[0], start, tripStudents.map((s) => s.id));
    const wp2 = mkWp('2', 'pickup', pickupStops[1], shiftMinutes(start, randInt(10, 20)), tripStudents.map((s) => s.id));
    const dropStop = { name: school, lat: 22.3799, lng: 114.1878 };
    const wp3 = mkWp('3', 'dropoff', dropStop, end, tripStudents.map((s) => s.id));

    const trip: Trip = {
      id: `${PREFIX}trip-${tag}-${idx}`,
      clientId, busId: spec.bus.id, nannyId: spec.nanny ? spec.nanny.id : '',
      date, academicYear,
      driverIdSnapshot: spec.bus.driverId,
      busPlateNumberSnapshot: spec.bus.plateNumber,
      type: spec.type,
      customTypeLabel: spec.type === 'custom' ? (spec.label ?? customLabel()) : null,
      status: spec.status,
      plannedStartTime: start, plannedEndTime: end,
      actualStartTime: spec.status === 'completed' || spec.status === 'in_progress' ? start : null,
      actualEndTime: spec.status === 'completed' ? end : null,
      waypoints: [wp1, wp2, wp3],
      studentIds: tripStudents.map((s) => s.id),
      currentRouteIndex: 0, completedStops: spec.status === 'completed' ? [wp1.id, wp2.id, wp3.id] : [],
      routeId: spec.type === 'morning' ? routeId : null,
      createdAt: now, updatedAt: now,
    };
    STORAGE.trips.add(trip);

    /* ---------- 打卡 ---------- */
    const mkAtt = (
      wpId: string, wpTime: string, studentId: string,
      mode: 'full' | 'partial',
    ): Attendance | null => {
      const r = Math.random();
      if (mode === 'partial' && r < 0.5) return null; // 進行中: 一半未打卡
      let boardingStatus: Attendance['boardingStatus'] = 'on_time';
      if (mode === 'full') {
        boardingStatus = r < 0.75 ? 'on_time' : r < 0.88 ? 'late' : 'no_show';
      }
      const done = boardingStatus !== 'no_show';
      const t = `${date}T${wpTime}:00.000+08:00`;
      return {
        id: `${PREFIX}att-${tag}-${idx}-${studentId.slice(-4)}-${wpId.slice(-1)}`,
        tripId: trip.id, studentId, waypointId: wpId,
        boardingTime: done ? t : null, boardingStatus,
        boardingPhoto: null, boardedBy: 'admin',
        dropoffTime: mode === 'full' && done ? `${date}T${end}:00.000+08:00` : null,
        dropoffStatus: mode === 'full' && done ? 'on_time' : null,
        dropoffPhoto: null, dropoffBy: null, notes: null,
        isConfirmed: false, createdAt: now, updatedAt: now,
      };
    };

    if (spec.status === 'completed') {
      [wp1, wp2].forEach((wp) => {
        tripStudents.forEach((s) => {
          const a = mkAtt(wp.id, wp.scheduledTime, s.id, 'full');
          if (a) { STORAGE.attendances.add(a); attendanceCount++; }
        });
      });
    } else if (spec.status === 'in_progress') {
      tripStudents.forEach((s) => {
        const a = mkAtt(wp1.id, wp1.scheduledTime, s.id, 'partial');
        if (a) { STORAGE.attendances.add(a); attendanceCount++; }
      });
    }
    // scheduled / cancelled: 不建打卡
  });

  return {
    trips: specs.length, buses: 2, drivers: 2, nannies: 2,
    students: students.length, parents: 12, routes: 1, attendances: attendanceCount,
    accounts: [
      { accountName: nannyAccountA, phone: nannyA.phone, password: nannyA.phone, name: nannyA.name },
      { accountName: nannyAccountB, phone: nannyB.phone, password: nannyB.phone, name: nannyB.name },
    ],
  };
}

const startsSeed = (id: string) => isSeedId(id);

/** 一鍵移除測試資料 — 只刪種子前綴 (含舊 test-), 回傳實際刪除筆數 */
export function removeScheduleTestData(): { removed: number; trips: number } {
  const startsTest = startsSeed;
  let removed = 0;
  let trips = 0;
  try {
    const testBusIds = new Set(
      STORAGE.buses.getAll().filter((b) => startsTest(b.id)).map((b) => b.id),
    );
    STORAGE.trips.getAll().filter((t) => startsTest(t.id)).forEach((t) => {
      try { STORAGE.trips.remove(t.id); removed++; trips++; } catch { /* ignore */ }
    });
    STORAGE.attendances.getAll().filter((a) => startsTest(a.id) || startsTest(a.tripId)).forEach((a) => {
      try {
        const all = STORAGE.attendances.getAll().filter((x) => x.id !== a.id);
        STORAGE.attendances.setAll(all);
        removed++;
      } catch { /* ignore */ }
    });
    STORAGE.routes.getAll().filter((r) => startsTest(r.id)).forEach((r) => {
      try { STORAGE.routes.remove(r.id); removed++; } catch { /* ignore */ }
    });
    STORAGE.students.getAll().filter((s) => startsTest(s.id)).forEach((s) => {
      try { STORAGE.students.remove(s.id); removed++; } catch { /* ignore */ }
    });
    STORAGE.parents.getAll().filter((p) => startsTest(p.id)).forEach((p) => {
      try { STORAGE.parents.remove(p.id); removed++; } catch { /* ignore */ }
    });
    STORAGE.buses.getAll().filter((b) => startsTest(b.id)).forEach((b) => {
      try { STORAGE.buses.remove(b.id); removed++; } catch { /* ignore */ }
    });
    STORAGE.drivers.getAll().filter((d) => startsTest(d.id)).forEach((d) => {
      try { STORAGE.drivers.remove(d.id); removed++; } catch { /* ignore */ }
    });
    STORAGE.nannies.getAll().filter((n) => startsTest(n.id)).forEach((n) => {
      try { STORAGE.nannies.remove(n.id); removed++; } catch { /* ignore */ }
    });
    // 測試登入帳號 (seed- 前綴) — 不刪的話帳號會留在本機, 登入後看到空班次
    STORAGE.users.getAll().filter((u) => startsTest(u.id)).forEach((u) => {
      try {
        STORAGE.users.remove(u.id);
        STORAGE.userFeaturePermissions.remove(u.id);
        removed++;
      } catch { /* ignore */ }
    });
    // 若目前登入的就是測試帳號 → 清掉 session, 避免殘留登入狀態
    try {
      const auth = STORAGE.auth.get();
      if (auth && startsTest(auth.id)) {
        STORAGE.auth.clear();
      }
    } catch { /* ignore */ }
    // 真實保姆若綁了測試校巴 → 解綁 (避免殘留壞引用)
    if (testBusIds.size > 0) {
      STORAGE.nannies.getAll().forEach((n) => {
        if (Array.isArray(n.assignedBusIds) && n.assignedBusIds.some((bid) => testBusIds.has(bid))) {
          try { STORAGE.nannies.update(n.id, { assignedBusIds: n.assignedBusIds.filter((bid) => !testBusIds.has(bid)) }); } catch { /* ignore */ }
        }
      });
    }
    try { localStorage.removeItem(BATCH_KEY); } catch { /* ignore */ }
  } catch { /* ignore */ }
  return { removed, trips };
}

/** 目前殘留的測試班次數 (供按鈕顯示 badge) */
export function countScheduleTestTrips(): number {
  try {
    return STORAGE.trips.getAll().filter((t) => startsSeed(t.id)).length;
  } catch {
    return 0;
  }
}
