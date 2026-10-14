// CloudBusLink 系統類型定義

export type UserRole = 'super_admin' | 'client' | 'parent' | 'nanny';

export interface User {
  id: string;
  phone: string;
  password: string;
  role: UserRole;
  name: string;
  email?: string;
  clientId?: string;
  photo?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  primaryColor: string;
  academicYear: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Driver {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  licenseNumber: string;
  photo: string | null;
  status: 'available' | 'on_trip' | 'off_duty';
  createdAt: string;
}

export interface Bus {
  id: string;
  clientId: string;
  plateNumber: string;
  model: string;
  capacity: number;
  driverId: string | null;
  gpsDeviceId: string | null;
  status: 'active' | 'maintenance' | 'inactive';
  // 模擬 GPS 位置
  currentLocation?: {
    latitude: number;
    longitude: number;
    speed: number;  // km/h, 模擬用隨機 0-60
    lastUpdated: string;
  };
  createdAt: string;
}

export interface Location {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'pickup' | 'dropoff' | 'transit';
}

export type StudentGender = 'male' | 'female' | 'other';

export interface Student {
  id: string;
  clientId: string;
  studentId: string; // 學年+序號 stu-2627001
  name: string;
  classNumber: string;
  phone: string | null;
  photo: string | null;
  gender: StudentGender;
  /** ISO date string yyyy-mm-dd */
  dateOfBirth: string | null;
  /** 緊急聯絡人姓名 (可不在 parentIds 中, 例如非監護人的親友) */
  emergencyContactName: string | null;
  /** 緊急聯絡人電話 */
  emergencyContactPhone: string | null;
  /** 緊急聯絡人與學生的關係 (選填) */
  emergencyContactRelationship: ParentRelationship | null;
  status: 'active' | 'graduated' | 'suspended';
  parentIds: string[];
  /**
   * 該學生主要聯繫人的 parent id
   * - 必須是 parentIds 之一 (或 null 表示未指定)
   * - 系統通知預設發給主要聯繫人
   */
  primaryParentId: string | null;
  busId: string | null;
  pickupLocation: Location | null;
  dropoffLocation: Location | null;
  createdAt: string;
}

export type ParentRelationship =
  | 'father'
  | 'mother'
  | 'grandfather_paternal'
  | 'grandmother_paternal'
  | 'grandfather_maternal'
  | 'grandmother_maternal'
  | 'guardian_other';

export interface Parent {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  /** 選填 — 備用行動電話 (與 phone 不同) */
  alternatePhone: string | null;
  /** 選填 — 住家電話 */
  homePhone: string | null;
  /** 選填 — 公司電話 */
  officePhone: string | null;
  /** 選填 — 通訊地址 */
  address: string | null;
  relationship: ParentRelationship;
  isPickupAuth: boolean;
  /**
   * @deprecated 主要聯繫人已改為「學生視角」, 由 Student.primaryParentId 儲存。
   *   此欄位保留以供向後相容 (既有 storage 資料), UI 不再允許修改。
   */
  isPrimaryContact?: boolean;
  /** 家長登入密碼 (用於請假/看 GPS) — 與電話共同作為登入憑證 */
  password: string;
  notificationEnabled: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Nanny {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  employeeId: string;
  photo: string | null;
  assignedBusIds: string[];
  status: 'active' | 'inactive';
  createdAt: string;
}

export type TripType = 'morning' | 'afternoon' | 'custom';
export type TripStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Waypoint {
  id: string;
  location: Location;
  type: 'pickup' | 'dropoff';
  scheduledTime: string;
  actualTime: string | null;
  status: 'pending' | 'arrived' | 'completed' | 'skipped';
  studentIds: string[];
  notes: string | null;
}

export interface Trip {
  id: string;
  clientId: string;
  busId: string;
  nannyId: string;
  date: string;
  type: TripType;
  status: TripStatus;
  plannedStartTime: string;
  plannedEndTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  waypoints: Waypoint[];
  studentIds: string[];
  currentRouteIndex: number;
  completedStops: string[];
  createdAt: string;
  updatedAt: string;
}

export type BoardingStatus = 'on_time' | 'late' | 'no_show' | 'absent';
export type DropoffStatus = 'on_time' | 'late' | 'early' | 'no_show';

export interface Attendance {
  id: string;
  tripId: string;
  studentId: string;
  waypointId: string;
  boardingTime: string | null;
  boardingStatus: BoardingStatus;
  boardingPhoto: string | null;
  boardedBy: string;
  dropoffTime: string | null;
  dropoffStatus: DropoffStatus | null;
  dropoffPhoto: string | null;
  dropoffBy: string | null;
  notes: string | null;
  isConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  clientId: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  displayCount: number;
  currentCount: number;
  maxViewsPerUser: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isTemplate: boolean;
  templateName: string | null;
  createdAt: string;
}

export interface SiteSettings {
  clientId: string;
  logo: string | null;
  title: string;
  primaryColor: string;
  phone: string;
  email: string;
  address: string;
  studentIdPrefix: string;
  academicYear: string;
  academicYearStart: number;
  pushNotifications: boolean;
  emailNotifications: boolean;
  updatedAt: string;
}

/* ==========================================================================
 *  Route 校巴路線 — 校巴管理 / 路線 (cbl-admin-setting/bus/trips)
 *  對應設計:
 *    - 第一部分 Master Info: 路線編號/名稱/時段/車輛/司機/跟車保姆
 *    - 第二部分 Route Stops Timeline: 站點時間軸 (可拖曳排序)
 *    - 額外: 一鍵反轉路線 / 地圖路徑預覽
 * ========================================================================== */

/** 行車時段類型 */
export type RouteShiftType = 'morning' | 'afternoon' | 'extracurricular';

/** 站點類型 (UI 顯示用, 對應時段會自動切換) */
export type RouteStopKind = 'origin' | 'middle' | 'terminal';

/** 站點 (RouteStop) — 對應使用者需求的 7 個欄位 */
export interface RouteStop {
  id: string;
  /** 站點順序 (1, 2, 3...) — UI 上自動生成 + 可拖曳調整 */
  seq: number;
  /** 站點類型: 起點 / 分站 / 終點 */
  kind: RouteStopKind;
  /** 大概到站時間 HH:mm (24h) */
  eta: string;
  /** 站點名稱 (例如: 圍方 (The Wai) 大圍站 B 出口對出) */
  name: string;
  /** 地理定位 (GPS 座標) — 暫時可空白 */
  latitude: number | null;
  longitude: number | null;
  /** 乘客 (學生) ids — UI 上由第一步選的車輛已綁定學生中挑選 */
  studentIds: string[];
  /** 司機/家長備註 */
  notes: string;
}

/** Route — 一條校巴路線 (e.g. 沙田及馬鞍山早上線) */
export interface Route {
  id: string;
  clientId: string;
  /** 路線編號 (使用者輸入, e.g. A1-AM, B3-PM) */
  code: string;
  /** 路線名稱 (e.g. 沙田及馬鞍山早上線) */
  name: string;
  /** 行車時段類型 */
  shiftType: RouteShiftType;
  /** 指派車輛 */
  busId: string;
  /** 指派司機 */
  driverId: string;
  /** 跟車保姆 */
  nannyId: string;
  /** 站點時間軸 (已排序, seq 由小到大) */
  stops: RouteStop[];
  /** 建立時間 (ISO) */
  createdAt: string;
  /** 最後更新時間 (ISO) */
  updatedAt: string;
}
