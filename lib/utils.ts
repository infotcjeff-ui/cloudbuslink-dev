import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 格式化時間 HH:mm:ss -> HH:mm
export function fmtTime(t: string | null): string {
  if (!t) return '--:--';
  return t.slice(0, 5);
}

// 格式化日期
export function fmtDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 取得今天日期 (YYYY-MM-DD)
export function today(): string {
  return fmtDate(new Date());
}

// 取得當前時間 (HH:mm)
export function currentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 取得當前時間戳 (HH:mm:ss)
export function currentTimeStamp(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// 中文星期
export function cnWeekday(d: string | Date = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const w = ['日', '一', '二', '三', '四', '五', '六'];
  return `星期${w[date.getDay()]}`;
}

// HH:mm(:ss) -> 分鐘數; 無法解析時回傳 null
function toMinutes(t: string | null | undefined): number | null {
  const [h, m] = (t || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// 判斷時間是否遲到 (超過計劃時間 5 分鐘)
//
// 站點的 scheduledTime 允許是空字串 (建立班次時未填時間), 此時不做遲到判定,
// 一律視為準時。若直接 split(':'), 空字串會得到 NaN, 比較結果恆為 false,
// 讓「遲到」功能在未填時間的站點上靜默失效。
export function isLate(planned: string, actual: string): boolean {
  const p = toMinutes(planned);
  const a = toMinutes(actual);
  if (p === null || a === null) return false;
  return a > p + 5;
}

// 角色中文標籤
export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: '系統管理員',
    client: '客戶',
    parent: '家長',
    nanny: '保姆',
  };
  return map[role] || role;
}

// 狀態中文標籤
export function tripStatusLabel(s: string): string {
  const map: Record<string, string> = {
    scheduled: '待開始',
    in_progress: '進行中',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[s] || s;
}

export function boardingStatusLabel(s: string): string {
  const map: Record<string, string> = {
    on_time: '準時',
    late: '遲到',
    no_show: '未上車',
    absent: '缺席',
  };
  return map[s] || s;
}

export function dropoffStatusLabel(s: string): string {
  const map: Record<string, string> = {
    on_time: '準時',
    late: '遲到',
    early: '提早',
    no_show: '未下車',
  };
  return map[s] || s;
}

export function tripTypeLabel(s: string): string {
  const map: Record<string, string> = {
    morning: '上午班',
    afternoon: '下午班',
    custom: '自訂',
  };
  return map[s] || s;
}

export function waypointTypeLabel(s: string): string {
  const map: Record<string, string> = {
    pickup: '上車',
    dropoff: '下車',
  };
  return map[s] || s;
}

// 電話驗證 (香港 8 位)
export function isValidPhone(phone: string): boolean {
  return /^[0-9]{8}$/.test(phone);
}

// 計算兩個時間差 (分鐘)
export function diffMinutes(t1: string, t2: string): number {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

// 學年顯示: '2627' -> '26-27'。
// 規則: 拆成兩個等長半段, 各取末兩位, 中間加 '-'。
//   - '2627'      -> '26-27'
//   - '2526'      -> '25-26'
//   - 'abcd'      -> 'abcd'  (防呆: 非 4 位數字就原樣回傳, 避免誤算)
export function formatAcademicYear(academicYear: string): string {
  if (!academicYear || academicYear.length !== 4) return academicYear;
  const first = academicYear.slice(0, 2);
  const second = academicYear.slice(2, 4);
  if (!/^\d{2}$/.test(first) || !/^\d{2}$/.test(second)) return academicYear;
  return `${first}-${second}`;
}

// 把 '26-27' 顯示格式轉回內部儲存用的 4 位 code: '26-27' -> '2627'。
// 給 <Select> onChange 反向用: UI 顯示給使用者看, 但實際存取 / studentId 用 code。
// 規則相反: 移除中間的 '-'。
//   - '26-27'  -> '2627'
//   - '2627'   -> '2627'  (已是 code, 原樣回傳)
//   - 'abcd'   -> 'abcd'  (防呆)
export function parseAcademicYearCode(label: string): string {
  if (!label) return label;
  return label.replace(/-/g, '');
}
