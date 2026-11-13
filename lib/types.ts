// CloudBusLink 系統類型定義

export type UserRole = 'system_admin' | 'super_admin' | 'client' | 'parent' | 'nanny';

export interface User {
  id: string;
  phone: string;
  /**
   * 帳戶名稱 — 與 phone 皆可作為登入帳號。
   *
   * 為什麼需要: 有些使用者 (例如保姆 / 家長) 未必想用電話號碼登入,
   * 而且電話號碼會外洩給家長 / 校方。給一個自訂的帳戶名稱 (例如 `siu-ming`)
   * 讓對方可以用自己記得的名字登入。
   *
   * 規則:
   *   - 登入時 `phone` 或 `accountName` 都可以 (兩者擇一)
   *   - `accountName` 在同一個 tenant 內唯一 (建立時會擋重複)
   *   - 選填 — 沒填就只能用電話登入 (維持既有行為)
   */
  accountName?: string;
  /**
   * 聯絡電話 (WhatsApp) — 對應 DB `contact_phone`。
   * 保姆「異常回報」時可直接致電 / WhatsApp 此號碼。新增帳號時必填。
   * 與 `phone` (登入帳號) 分開: super_admin 的登入帳號可以非數字,
   * 但聯絡電話必須是可撥打的 8 位香港號碼。
   */
  contactPhone?: string;
  password: string;
  role: UserRole;
  name: string;
  email?: string;
  // 所屬學校 (cbl_clients = 學校表) — 學生/家長/保姆/client 帳號必填，super_admin / system_admin 可空
  clientId?: string;
  // 所屬機構/公司 (cbl_companies) — 非必填，僅保姆 / 司機 / 校巴相關帳號 / super_admin 使用
  companyId?: string | null;
  photo?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Client {
  // = 學校 (cbl_clients) — 選項 B: cbl_clients 即學校表 (原「機構」更名)。
  // 學生/家長/校巴/司機/保姆/班次/路線/公告全部必填 school (clientId)。
  // 公司層另見 Company (cbl_companies)，僅保姆/司機/校巴/User 可選配 companyId。
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
  // 所屬學校 (cbl_clients = 學校) — 必填，所有 9 類皆必填 school
  clientId: string;
  // 所屬機構/公司 (cbl_companies) — 非必填
  companyId?: string | null;
  name: string;
  phone: string;
  licenseNumber: string;
  photo: string | null;
  status: 'available' | 'on_trip' | 'off_duty';
  createdAt: string;
}

export interface Bus {
  id: string;
  // 所屬學校 (cbl_clients = 學校) — 必填
  clientId: string;
  // 所屬機構/公司 (cbl_companies) — 非必填
  companyId?: string | null;
  plateNumber: string;
  model: string;
  capacity: number;
  driverId: string | null;
  gpsDeviceId: string | null;
  status: 'active' | 'maintenance' | 'inactive';
  // 808 GPS 即時位置 (以 808 為準, 不再模擬)
  currentLocation?: {
    latitude: number;
    longitude: number;
    speed: number;  // km/h, 808 sp / 10
    lastUpdated: string;
    /** 808 解析地址 (ps) */
    address?: string | null;
    /** 808 上傳時間原文 (gt) */
    gpsTime?: string | null;
    /** 808 在線狀態 (ol === 1) */
    online?: boolean;
    /** 808 行車方向 hx (0-360, 0=正北順時針)，主頁 pin 箭頭優先用佢 */
    heading?: number | null;
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

/** 學校類型 — 小學 / 中學 (對應 CHSC 資料集) */
export type StudentSchoolType = 'primary' | 'secondary';

export interface Student {
  id: string;
  clientId: string;
  studentId: string; // 學年+序號 stu-2627001
  /**
   * 就讀學年 (4 位 code, 例 '2627' = 2026/27)。
   *
   * ⚠️ 學生是「分學年」的 entity —— 同一學生每學年被複製成新列
   *    (因為 unique(client_id, student_id) 且 student_id 含學年前綴)。
   *    跨學年的同一個人靠 personKey 串連。
   */
  academicYear: string;
  /**
   * 跨學年延續識別碼 —— 同一學生每學年被複製成新列時沿用同一值。
   * 為 null 表示未指定 (舊資料 / 未回填)。
   */
  personKey?: string | null;
  name: string;
  classNumber: string;
  phone: string | null;
  photo: string | null;
  gender: StudentGender;
  /** ISO date string yyyy-mm-dd */
  dateOfBirth: string | null;
  /**
   * 就讀學校類型 — 'primary' (小學) / 'secondary' (中學)
   * 來源: CHSC 小學概覽 / 中學概覽 (見 lib/schools.ts)
   *
   * ⚠️ 選填 (optional): 舊資料沒有學校資訊, 不強制回填。
   *    新增學生時應用層會要求必填。
   */
  schoolType?: StudentSchoolType | null;
  /** 就讀學校所在區域 (18 區之一, 例: '沙田區') */
  schoolDistrict?: string | null;
  /** 就讀學校名稱 (例: '聖公會聖馬太小學') */
  schoolName?: string | null;
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
  /**
   * 帳戶名稱 — 與 phone 皆可作為登入帳號 (選填)。
   * 見 User.accountName 的說明。
   */
  accountName?: string;
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
  // 所屬學校 (cbl_clients = 學校) — 必填
  clientId: string;
  // 所屬機構/公司 (cbl_companies) — 非必填
  companyId?: string | null;
  name: string;
  phone: string;
  /**
   * 帳戶名稱 — 與 phone 皆可作為登入帳號 (選填)。
   * 見 User.accountName 的說明。
   */
  accountName?: string;
  employeeId: string;
  photo: string | null;
  assignedBusIds: string[];
  status: 'active' | 'inactive';
  createdAt: string;
}

/* ==========================================================================
 * Company 機構/公司 (cbl_companies) — 選項 B 的公司層
 *
 * - 僅保姆 / 司機 / 校巴 / super_admin 相關 User 可選配 companyId (非必填)
 * - 學生/家長/班次/路線/公告/接送記錄只掛學校 (clientId)，不掛公司
 * ========================================================================== */
export interface Company {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
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
  /**
   * 班次所屬學年 (4 位 code, 例 '2627')。
   * 由建立當下的「作用中學年」蓋章, 不從 date 反推 (date 反推只作為回填時的推導)。
   */
  academicYear: string;
  /**
   * 建班當下的司機 id 快照 —— 不隨校巴日後改綁而變。
   * ⚠️ 這是「歷史保真」的關鍵: 27-28 換了司機, 回頭看 26-27 的班次
   *    仍要顯示當時的司機, 而不是現在綁在車上的那位。
   */
  driverIdSnapshot?: string | null;
  /**
   * 建班當下的車牌快照 —— 校巴換車牌或退役後, 歷史班次仍顯示當時的車牌。
   */
  busPlateNumberSnapshot?: string | null;
  type: TripType;
  /**
   * 自訂班次類型名稱 — 僅 type='custom' 時有意義。
   * 由班次表單「班次類型 = 自訂」時的文字輸入寫入, 供預覽 / 清單 / 詳情顯示。
   * nullable: 舊班次 / 非自訂班次為 null (顯示時退回「自訂」)。
   */
  customTypeLabel?: string | null;
  status: TripStatus;
  plannedStartTime: string;
  plannedEndTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  waypoints: Waypoint[];
  studentIds: string[];
  currentRouteIndex: number;
  completedStops: string[];
  /**
   * 本班次套用的「路線模板」id (cbl_routes.id)。
   *
   * 為什麼需要:
   *   Route (路線) 是模板 — 有站點順序、ETA、起終點、對應學生;
   *   Trip (班次) 是「某一天的實例」— 站點會被複製一份進 waypoints 供當日微調。
   *   兩者若沒有這條引用, /cbl-admin-setting/bus/trips 維護的路線對班次完全沒有影響,
   *   站點就會變成兩套各自為政的資料 (這是本專案長期的架構缺口)。
   *
   * nullable: 舊班次 / 手動建立的班次可以沒有對應路線。
   */
  routeId?: string | null;
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

/**
 * 公告受眾類型
 * ─────────────────
 * - 'system'  系統公告 — 所有用戶都會看到 (跨機構、跨角色)
 * - 'payment' 繳費公告 — 只有被選中的家長會看到
 */
export type AnnouncementScope = 'system' | 'payment';

/* ==========================================================================
 *  PaymentRecord 付款記錄 — 報表頁 (settings/reports) 的資料來源
 *
 *  為什麼需要這個 entity:
 *   - 報表頁要支援「多選 → 標記已付 / 取消 / 發送繳費通知」,
 *     這些動作需要一個「可逐筆標記狀態 + 記錄金額」的資料模型。
 *   - 之前付款記錄只是 /cbl-admin-setting/parents/payment 的 coming-soon 佔位,
 *     沒有任何實體 → 報表頁沒東西可操作。
 *
 *  設計:
 *   - 每筆 = 一個學生一期的繳費帳單 (月費 / 學費)。
 *   - status: pending (未付) / paid (已付) / cancelled (已取消) / overdue (逾期)
 *   - 一筆帳單對應一個 studentId + 一個 parentId (主要聯繫人)。
 * ========================================================================== */

/** 付款狀態 */
export type PaymentStatus = 'pending' | 'paid' | 'cancelled' | 'overdue';

/** 付款方式 */
export type PaymentMethod = 'cash' | 'fps' | 'bank_transfer' | 'cheque' | 'other';

export interface PaymentRecord {
  id: string;
  /** 所屬學校 (cbl_clients.id) */
  clientId: string;
  /** 帳單學期/月份 (例: '2026-11' 或 '2026-2027-S1') */
  period: string;
  /** 學生 id (cbl_students.id) */
  studentId: string;
  /** 學生姓名快照 */
  studentName: string;
  /** 家長 id (cbl_parents.id) — 收款對象 */
  parentId: string;
  /** 家長姓名快照 */
  parentName: string;
  /** 家長電話快照 */
  parentPhone: string;
  /** 應繳金額 (港幣) */
  amount: number;
  /** 狀態 */
  status: PaymentStatus;
  /** 付款方式 (status = 'paid' 時有意義) */
  method: PaymentMethod | null;
  /** 實收日期 (YYYY-MM-DD), status = 'paid' 時有意義 */
  paidDate: string | null;
  /** 到期日 (YYYY-MM-DD) */
  dueDate: string;
  /** 備註 */
  notes: string | null;
  /** 是否已發送繳費通知 (send payment 動作的記錄) */
  paymentNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  clientId: string;
  /**
   * 公告所屬學年 (4 位 code, 例 '2627')。
   * ⚠️ 範本 (isTemplate = true) 不受此限 —— 範本跨學年沿用,
   *    只有真正發佈的公告才綁學年。
   */
  academicYear: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  /**
   * 受眾類型 (預設 'system')。
   * - 'system'  → 所有用戶都看得到
   * - 'payment' → 只有 targetParentIds 內的家長看得到
   */
  scope: AnnouncementScope;
  /**
   * 繳費公告的指定家長 (cbl_parents.id 清單)。
   * scope = 'system' 時一律為空陣列。
   */
  targetParentIds: string[];
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

/* ==========================================================================
 *  System Config — /system-admin-setting 的平台層設定 (L4 system_admin)
 *
 *  三層優先序 (高 → 低):
 *    1. override — 裝置層覆寫 (localStorage), 可含機密
 *    2. cloud    — 平台層設定 (Supabase cbl_system_config 表), 跨裝置一致
 *    3. env      — 建置時環境變數 (NEXT_PUBLIC_SUPABASE_*)
 *
 *  安全邊界:
 *    - Supabase anon key 本來就會 inline 在前端 bundle → 視為非機密, 可上雲
 *    - gps.apiKey 是第三方 secret → 永不上雲, 只存 localStorage
 *
 *  Storage key: cbl_system_config (override) / cbl_system_config_cloud (快取)
 * ========================================================================== */

/** GPS / 追蹤 provider — 實際串接以 808 GPS (OneFleet) 為主 */
export type GpsProvider = 'onefleet808' | 'mapbox' | 'google' | 'custom';

/** 設定值的來源 (用於 UI 顯示 badge) */
export type ConfigSource = 'override' | 'cloud' | 'env' | 'default' | 'none';

/** 平台層設定 — 可上雲的部分 (不含任何 secret) */
export interface SystemConfigCloud {
  supabase: {
    /** 專案端點, 例: https://xxxx.supabase.co */
    url: string | null;
    /** 前端安全金鑰 (client-safe, 本來就會 inline 在 bundle) */
    anonKey: string | null;
  };
  gps: {
    provider: GpsProvider | null;
    /** 808 GPS (OneFleet) 登入帳號 — 非機密, 可隨平台設定同步 */
    account: string | null;
    /** 自訂 endpoint (僅 provider='custom' 時有意義；808 固定為服務端點) */
    endpoint: string | null;
    /** 更新頻率 (秒) */
    refreshSeconds: number | null;
  };
  updatedAt: string;
  updatedBy: string;
}

/** 裝置層覆寫 — 只存 localStorage, 可含機密 */
export interface SystemConfigOverride extends SystemConfigCloud {
  gps: SystemConfigCloud['gps'] & {
    /** 808 GPS 登入密碼 — 機密, 永不上雲 (等同 apiKey 安全等級) */
    password: string | null;
    /** provider API Key (如有) — 機密, 永不上雲 */
    apiKey: string | null;
  };
}

/** 解析後的有效設定 (UI 直接吃這個) */
export interface ResolvedSystemConfig {
  supabase: {
    url: string;
    anonKey: string;
    urlSource: ConfigSource;
    keySource: ConfigSource;
  };
  gps: {
    provider: GpsProvider;
    /** 808 GPS (OneFleet) 登入帳號 */
    account: string;
    /** 808 GPS (OneFleet) 登入密碼 — 機密, 只存本機 */
    password: string;
    apiKey: string;
    endpoint: string;
    refreshSeconds: number;
    providerSource: ConfigSource;
    accountSource: ConfigSource;
    passwordSource: ConfigSource;
    apiKeySource: ConfigSource;
  };
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
  /**
   * 路線所屬學年 (4 位 code, 例 '2627')。
   * 路線是分學年的 entity —— 每學年各有一套路線。
   */
  academicYear: string;
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
  /** 服務日期 (YYYY-MM-DD, 選填) */
  serviceDate?: string | null;
  /** 服務時間 (HH:mm, 選填) */
  serviceTime?: string | null;
  /** 站點時間軸 (已排序, seq 由小到大) */
  stops: RouteStop[];
  /** 建立時間 (ISO) */
  createdAt: string;
  /** 最後更新時間 (ISO) */
  updatedAt: string;
}

/* ==========================================================================
 *  IncidentReport 異常回報 — 保姆主頁「異常回報」popup 送出後留底
 *  對應 DB: cbl_incident_reports (migration 0022)
 * ========================================================================== */

/** 異常類型 — 與保姆 popup 的 INCIDENT_TYPES id 對應 */
export type IncidentKind =
  | 'traffic'
  | 'no_show'
  | 'breakdown'
  | 'accident'
  | 'weather'
  | 'road_closed'
  | 'sick'
  | 'other';

/** 處理狀態 */
export type IncidentStatus = 'pending' | 'acknowledged' | 'resolved';

export interface IncidentReport {
  id: string;
  clientId: string;
  /** 回報保姆 (cbl_nannies.id, 盡量填; 找不到就空字串) */
  nannyId: string;
  /** 回報人姓名 (快照, 免 join) */
  reporterName: string;
  /** 回報人電話 (快照) */
  reporterPhone: string;
  /** 通知邊位管理員 (cbl_users.id) */
  adminId: string;
  /** 管理員姓名快照 */
  adminName: string;
  /** 管理員聯絡電話快照 */
  adminPhone: string;
  /** 異常類型 */
  kind: IncidentKind;
  /** 異常中文標籤快照 (例: 塞車中) */
  kindLabel: string;
  /** 相關班次 (當天班次 id, 可空 = 未選擇) */
  tripId: string;
  /** 班次快照 (例: 11-04 上午班 · NA1234), 免 join */
  tripLabel: string;
  /** 班次日期 YYYY-MM-DD (快照, 方便篩選) */
  tripDate: string;
  /** 處理狀態 */
  status: IncidentStatus;
  /** 建立時間 (ISO) */
  createdAt: string;
  /** 最後更新時間 (ISO) */
  updatedAt: string;
}
