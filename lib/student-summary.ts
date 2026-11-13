/**
 * Student Summary — 學生摘要報表核心模組
 *
 * 用途:
 *   /cbl-admin-setting/reports 的「匯出 Excel」與「查看 / 下載 PDF」共用同一套
 *   欄位定義與資料來源, 確保 Excel 與 PDF 的內容一模一樣。
 *
 * 欄位格式依據: excel/Student Summary.xlsx (工作表1, 第 1 行表頭 A–S)
 *
 *   A  26-27 ID          學年+序號 (例 2627st001)
 *   B  學生姓名
 *   C  Student Name      英文姓名 (無資料時退回中文姓名)
 *   D  (空)
 *   E  班別(Class)
 *   F  聯絡電話(Parent Phoone)   主要家長電話
 *   G  接送人聯絡電話            所有有接送權限家長的電話, 以 '/' 分隔
 *   H  上車地點                 中文
 *   I  Pick Up Location     英文 (無資料時退回中文)
 *   J  返路線                 上車站點在該班次的排序號
 *   K  Routing              (英文欄, 與 J 同值)
 *   L  上車時間              實際上車時間 → 計劃時間
 *   M  Pick up Time        (英文欄, 與 L 同值)
 *   N  落車地點              中文
 *   O  Drop Off Location   英文 (無資料時退回中文)
 *   P  放路線                 下車站點在該班次的排序號
 *   Q  Routing              (英文欄, 與 P 同值)
 *   R  下車時間              實際下車時間 → 計劃時間
 *   S  Drop off Time       (英文欄, 與 R 同值)
 *
 * ⚠️ 一行 = 一個學生在一個站點的上/落車紀錄。
 *    同一學生在同一班次有多個上下車站點 → 產生多行。
 */

import type { Trip, Student, Parent, Attendance } from './types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface StudentSummaryRow {
  /** 學年+序號 */
  id: string;
  /** 中文姓名 */
  name: string;
  /** 英文姓名 (無資料時 = 中文姓名) */
  nameEn: string;
  /** 班別 */
  classNumber: string;
  /** 主要家長電話 */
  parentPhone: string;
  /** 接送人聯絡電話 (多個以 '/' 分隔) */
  pickupPhones: string;
  /** 上車地點 (中文) */
  pickupLocation: string;
  /** 上車地點 (英文, 無資料時 = 中文) */
  pickupLocationEn: string;
  /** 上車路線序號 */
  pickupRoute: number | null;
  /** 上車時間 (HH:mm) */
  pickupTime: string;
  /** 落車地點 (中文) */
  dropoffLocation: string;
  /** 落車地點 (英文, 無資料時 = 中文) */
  dropoffLocationEn: string;
  /** 下車路線序號 */
  dropoffRoute: number | null;
  /** 下車時間 (HH:mm) */
  dropoffTime: string;
}

/** 一列在 Excel / PDF 中的標題 */
export const SUMMARY_HEADERS = [
  '26-27 ID',
  '學生姓名',
  'Student Name',
  '',
  '班別(Class)',
  '聯絡電話(Parent Phoone)',
  '接送人聯絡電話',
  '上車地點',
  'Pick Up Location',
  '返路線',
  'Routing',
  '上車時間',
  'Pick up Time',
  '落車地點',
  'Drop Off Location',
  '放路線',
  'Routing',
  '下車時間',
  'Drop off Time',
] as const;

/** Excel / PDF 用的欄寬 (A–S) */
export const SUMMARY_COL_WIDTHS = [
  14, 12, 18, 3, 10, 16, 20, 22, 26, 8, 8, 10, 10, 22, 26, 8, 8, 10, 10,
] as const;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** HH:mm:ss / HH:mm → HH:mm; 無值回傳 '' */
function normalizeTime(value: string | null | undefined): string {
  if (!value) return '';
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return value;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * 該學生的接送人電話 (多個以 '/' 分隔)。
 *
 * 規則:
 *   - 只取 isPickupAuth = true 的家長 (對應「接送人」語意)
 *   - 若沒有任何 isPickupAuth 的家長 → 退回全部家長的電話
 *   - 去重 (同一個號碼只出現一次)
 */
export function collectPickupPhones(student: Student, parents: Parent[]): string {
  const own = student.parentIds
    .map((id) => parents.find((p) => p.id === id))
    .filter((p): p is Parent => !!p);

  const authorized = own.filter((p) => p.isPickupAuth);
  const pool = authorized.length > 0 ? authorized : own;

  const phones: string[] = [];
  pool.forEach((p) => {
    if (p.phone && !phones.includes(p.phone)) phones.push(p.phone);
  });
  return phones.join('/');
}

/** 主要家長電話 (primaryParentId → 第一位家長 → 第一個有電話的家長) */
export function collectPrimaryPhone(student: Student, parents: Parent[]): string {
  const own = student.parentIds
    .map((id) => parents.find((p) => p.id === id))
    .filter((p): p is Parent => !!p);

  const primary =
    (student.primaryParentId && own.find((p) => p.id === student.primaryParentId)) ||
    own[0] ||
    own.find((p) => !!p.phone);
  return primary?.phone || '';
}

/* -------------------------------------------------------------------------- */
/*  Row builder                                                                 */
/* -------------------------------------------------------------------------- */

export interface SummarySourceData {
  students: Student[];
  parents: Parent[];
  /** tripId → 該班次的出席記錄 */
  attendancesByTrip: Map<string, Attendance[]>;
}

/**
 * 依班次產生學生摘要列。
 *
 * 規則:
 *   - 走訪 trip.waypoints, 每個上車站點取其 studentIds
 *   - 每個學生 → 一行, 上車欄位有值
 *   - 下車欄位由「同一學生在該班次的 dropoff 站點」補上
 *   - 若該學生沒有 dropoff 站點 → 下車欄位留空
 */
export function buildSummaryRows(
  trips: Trip[],
  data: SummarySourceData,
): StudentSummaryRow[] {
  const { students, parents, attendancesByTrip } = data;
  const rows: StudentSummaryRow[] = [];

  trips.forEach((trip) => {
    const attendances = attendancesByTrip.get(trip.id) || [];
    const pickupWps = trip.waypoints.filter((w) => w.type === 'pickup');
    const dropoffWps = trip.waypoints.filter((w) => w.type === 'dropoff');

    pickupWps.forEach((wp, pickupIdx) => {
      wp.studentIds.forEach((studentId) => {
        const student = students.find((s) => s.id === studentId);
        if (!student) return;

        // 找出該學生的下車站點 (第一個包含該學生的 dropoff)
        const dropoffWp = dropoffWps.find((w) => w.studentIds.includes(studentId));
        const dropoffIdx = dropoffWp ? trip.waypoints.indexOf(dropoffWp) : -1;

        // 上車時間: 實際上車 → 計劃時間
        const pickupAtt = attendances.find(
          (a) => a.studentId === studentId && a.waypointId === wp.id,
        );
        const pickupTime =
          normalizeTime(pickupAtt?.boardingTime) ||
          normalizeTime(wp.actualTime) ||
          normalizeTime(wp.scheduledTime);

        // 下車時間: 實際下車 → 計劃時間
        const dropoffAtt = dropoffWp
          ? attendances.find(
              (a) => a.studentId === studentId && a.waypointId === dropoffWp.id,
            )
          : undefined;
        const dropoffTime = dropoffWp
          ? normalizeTime(dropoffAtt?.dropoffTime) ||
            normalizeTime(dropoffWp.actualTime) ||
            normalizeTime(dropoffWp.scheduledTime)
          : '';

        const pickupLocation = wp.location?.name || '';
        const pickupLocationEn = wp.location?.nameEn || pickupLocation;
        const dropoffLocation = dropoffWp?.location?.name || '';
        const dropoffLocationEn = dropoffWp?.location?.nameEn || dropoffLocation;

        rows.push({
          id: student.studentId,
          name: student.name,
          nameEn: student.nameEn || student.name,
          classNumber: student.classNumber || '',
          parentPhone: collectPrimaryPhone(student, parents),
          pickupPhones: collectPickupPhones(student, parents),
          pickupLocation,
          pickupLocationEn,
          pickupRoute: pickupIdx + 1,
          pickupTime,
          dropoffLocation,
          dropoffLocationEn,
          dropoffRoute: dropoffIdx >= 0 ? dropoffIdx + 1 : null,
          dropoffTime,
        });
      });
    });
  });

  return rows;
}

/** 把 summary row 轉成 Excel A–S 的 19 欄陣列 */
export function rowToCells(row: StudentSummaryRow): (string | number)[] {
  return [
    row.id,
    row.name,
    row.nameEn,
    '',
    row.classNumber,
    row.parentPhone,
    row.pickupPhones,
    row.pickupLocation,
    row.pickupLocationEn,
    row.pickupRoute ?? '',
    row.pickupRoute ?? '',
    row.pickupTime,
    row.pickupTime,
    row.dropoffLocation,
    row.dropoffLocationEn,
    row.dropoffRoute ?? '',
    row.dropoffRoute ?? '',
    row.dropoffTime,
    row.dropoffTime,
  ];
}

/** 檔名: CloudBusLink_學生摘要_2026-11-13_2627.xlsx */
export function summaryFileName(date: string, academicYear: string): string {
  return `CloudBusLink_學生摘要_${date}_${academicYear || ''}.xlsx`;
}
