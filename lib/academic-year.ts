/**
 * lib/academic-year.ts — 學年 (academic year) 的核心邏輯
 *
 * 背景:
 *   全系統原本只靠 client_id 一層做資料隔離, 學年只是一個「前綴標籤」
 *   (stu-2627001 / 2627-001AM)。這讓 26-27 的舊學生和 27-28 的新學生
 *   混在同一張表、同一個清單裡。
 *
 *   本模組是「學年化 (academic-year scoping)」的單一入口:
 *   - 學年代碼的格式與轉換
 *   - 學年區間 (自然學年) 的推算
 *   - 判斷某個學年是現行 / 封存
 *   - 決定「寫入時蓋章用哪個學年」
 *
 * 學年代碼格式:
 *   內部一律用 4 位 code: '2627' = 2026/27 學年 (9 月開學, 8 月底完結)
 *   顯示用: '26-27' (lib/utils.ts formatAcademicYear)
 *
 * ⚠️ 本模組是純函式 (無副作用, 不碰 localStorage / Supabase) ——
 *    這樣任何地方都能安全 import, 包含 server component。
 */

/** 學年狀態 — 對應 cbl_academic_years.status */
export type AcademicYearStatus = 'upcoming' | 'active' | 'archived';

/**
 * 學年登錄 (一列 = 某 client 的某個學年)
 * 對應 cbl_academic_years 表
 */
export interface AcademicYear {
  id: string;
  clientId: string;
  /** 4 位學年代碼, 例 '2627' */
  academicYear: string;
  /** 顯示用標籤, 例 '2026/27 學年' (nullable) */
  label: string | null;
  status: AcademicYearStatus;
  isCurrent: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 學年區間 (自然學年) — 學年代碼對應的起訖日期 */
export interface AcademicYearRange {
  academicYear: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/** 預設學年代碼 (資料庫 DEFAULT 相同) */
export const DEFAULT_ACADEMIC_YEAR = '2627';

/**
 * 判斷字串是否為合法的 4 位學年代碼。
 * '2627' → true, '262' → false, 'abcd' → false, '' → false
 */
export function isValidAcademicYear(code: string | null | undefined): boolean {
  if (!code) return false;
  return /^[0-9]{4}$/.test(code);
}

/**
 * 取得學年的自然區間 (香港學制: 9 月 1 日 ~ 次年 8 月 31 日)。
 *
 * '2627' → { startDate: '2026-09-01', endDate: '2027-08-31' }
 *
 * ⚠️ 這是「推定值」, 只用於:
 *    - 班次日期落在哪個學年 (回填用)
 *    - 顯示
 * 真實的學年起訖應該由學校在 cbl_academic_years.start_date / end_date 設定,
 * 之後這裡會改成以登錄表為準 (M3)。
 */
export function getAcademicYearRange(code: string): AcademicYearRange {
  const safe = isValidAcademicYear(code) ? code : DEFAULT_ACADEMIC_YEAR;
  const startYear = 2000 + parseInt(safe.slice(0, 2), 10);
  const endYear = 2000 + parseInt(safe.slice(2, 4), 10);
  return {
    academicYear: safe,
    startDate: `${startYear}-09-01`,
    endDate: `${endYear}-08-31`,
  };
}

/**
 * 推算某個日期落在哪個學年。
 * '2027-03-15' → '2627'
 */
export function getAcademicYearForDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return DEFAULT_ACADEMIC_YEAR;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  // 9 月 ~ 12 月 → 該年開始的新學年; 1 月 ~ 8 月 → 上一個開始的學年
  const startYear = month >= 9 ? year : year - 1;
  const code = `${String(startYear % 100).padStart(2, '0')}${String((startYear + 1) % 100).padStart(2, '0')}`;
  return code;
}

/**
 * 判斷某日期是否落在指定學年的區間內。
 */
export function isDateInAcademicYear(dateStr: string, code: string): boolean {
  const range = getAcademicYearRange(code);
  return dateStr >= range.startDate && dateStr <= range.endDate;
}

/**
 * 產生下一個學年代碼: '2627' → '2728'
 */
export function nextAcademicYear(code: string): string {
  if (!isValidAcademicYear(code)) return DEFAULT_ACADEMIC_YEAR;
  const startYear = 2000 + parseInt(code.slice(0, 2), 10);
  return `${String((startYear + 1) % 100).padStart(2, '0')}${String((startYear + 2) % 100).padStart(2, '0')}`;
}

/**
 * 產生 cbl_academic_years 表的 id。
 * 格式: 'ay-<4位學年>-<clientId>'
 */
export function buildAcademicYearId(code: string, clientId: string): string {
  return `ay-${code}-${clientId}`;
}

/**
 * 取得學年的顯示標籤。
 * 若登錄表有填 label → 用它; 否則用 code 推算: '2627' → '2026/27 學年'
 */
export function getAcademicYearLabel(year: AcademicYear | null | undefined): string {
  if (!year) return '—';
  if (year.label) return year.label;
  if (isValidAcademicYear(year.academicYear)) {
    const startYear = 2000 + parseInt(year.academicYear.slice(0, 2), 10);
    return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')} 學年`;
  }
  return year.academicYear;
}

/**
 * 判斷某個學年是「現行中」還是「已封存 (唯讀)」。
 *
 * ⚠️ 唯讀判定有兩條路 (任一成立即為唯讀):
 *    1. 登錄表的 status = 'archived'
 *    2. 登錄表的 is_current = false (不是現行學年)
 *    → 因為只有一個學年是現行, 其他都應該只能看不能改。
 */
export function isReadOnlyYear(year: AcademicYear | null | undefined): boolean {
  if (!year) return false;
  return year.status === 'archived' || !year.isCurrent;
}

/**
 * 判斷某個學年是否「已結束」— 用於決定是否該觸發學年轉換流程。
 *
 * ⚠️ 學年轉換是 D3 的核心流程: 當 26-27 結束, 27-28 開始時,
 *    將 26-27 的學生「複製」成 27-28 的新列 (person_key 沿用),
 *    26-27 的列 status 改成 'graduated'。
 */
export function isAcademicYearClosed(year: AcademicYear | null | undefined): boolean {
  if (!year) return false;
  return year.status === 'archived';
}

/**
 * 產生「這個學年為什麼不能改」的提示語。
 *
 * ⚠️ 唯讀有兩種情況, 對使用者的意義不同:
 *   - archived → 學年已結束, 資料是歷史的
 *   - 非現行   → 學年還沒開始, 或已被換下
 * 兩者都是唯讀, 但提示語要講清楚「為什麼不能改」, 否則使用者會以為是 bug。
 */
export function getReadOnlyMessage(
  year: AcademicYear | null | undefined,
): { label: string; hint: string } {
  if (!year) {
    return {
      label: '唯讀',
      hint: '目前檢視的學年不可編輯 — 可以查看與匯出報表, 但不能新增/編輯/刪除資料。',
    };
  }
  if (year.status === 'archived') {
    return {
      label: '已封存 · 唯讀',
      hint: '這個學年已封存 — 可以查看與匯出報表, 但不能新增/編輯/刪除資料',
    };
  }
  return {
    label: '非現行學年 · 唯讀',
    hint: '這個學年不是現行學年 — 可以查看與匯出報表, 但不能新增/編輯/刪除資料。切回現行學年即可編輯。',
  };
}

/**
 * 把 ISO timestamp 轉成 date-only 字串 ('2026-09-01')。
 */
export function formatDateOnlyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 把 date-only 字串 ('2026-09-01') 轉成 ISO timestamp 字串。
 */
export function formatDateOnlyToIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

/**
 * 依學年篩選資料列。
 *
 * ⚠️ 這裡的語意是「**軟篩選**」而不是「硬篩選」:
 *    沒有 academicYear 值的列會被「保留」, 而不是被剔除。
 *
 *    為什麼:
 *      1. 本機 localStorage 的舊資料沒有這個欄位 (早於 migration 0017)
 *         → 硬篩選會讓使用者的資料「憑空消失」, 這是最糟的 UX。
 *      2. 雲端資料在 migration 尚未套用時也不會有這個欄位。
 *      3. 「保留」比「剔除」安全: 多顯示幾筆舊資料, 遠好過讓人以為資料被刪了。
 *
 *    等 migration 0017 全面套用、所有資料都有 academicYear 之後,
 *    這個行為就不會再被觀察到 (因為每一列都有值, 篩選就是精確的)。
 */
export function filterByAcademicYear<T extends { academicYear?: string | null }>(
  rows: T[],
  academicYear: string,
): T[] {
  if (!academicYear) return rows;
  return rows.filter((r) => {
    const y = r.academicYear;
    if (!y) return true; // 沒有學年值的舊資料 → 保留
    return y === academicYear;
  });
}

/**
 * 依學年篩選, 但把「有學年值且不屬於該學年」與「沒學年值」分開回傳。
 *
 * 用於需要顯示提示的情境 (例: 「另有 12 筆舊資料沒有學年歸屬」)。
 */
export function partitionByAcademicYear<T extends { academicYear?: string | null }>(
  rows: T[],
  academicYear: string,
): { matched: T[]; unassigned: T[] } {
  const matched: T[] = [];
  const unassigned: T[] = [];
  for (const r of rows) {
    const y = r.academicYear;
    if (!y) unassigned.push(r);
    else if (!academicYear || y === academicYear) matched.push(r);
  }
  return { matched, unassigned };
}

/**
 * 產生學生的跨學年識別碼 (person_key)。
 *
 * ⚠️ 這是「隨機唯一」而不是「由資料推導」, 原因:
 *    0018 的 SQL 回填用 md5(name|dob|phone) 推導既有資料的 person_key。
 *    若這裡也用推導式, JS 與 SQL 必須實作同一個 hash 才有相同的值 ——
 *    跨語言實作 md5 很容易出錯, 一旦不一致, 同一個人在兩邊會拿到不同的 key,
 *    跨學年串連就斷了。
 *    → 新建立的學生用隨機唯一值, 靠「複製流程沿用既有 personKey」維持連續性
 *      (M2 會明確帶入, 不重新產生)。
 *    → 既有資料由 SQL 回填一次, 之後不再重新產生。
 *
 * 格式: 'pk-' + clientId + '-' + 12 碼隨機 hex
 */
export function generatePersonKey(clientId: string): string {
  const rand = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
  return `pk-${clientId}-${rand}`;
}
