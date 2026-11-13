/**
 * lib/admin-telemetry.ts — GPS 查看打點 (本機 localStorage)
 *
 * 給 `/bus/[id]`、`/` 主地圖呼叫:
 *   import('@/lib/admin-telemetry').then(m => m.logGpsView(user, bus))
 *
 * 與 `lib/admin-audit.ts` 共用同一個 storage key (`cbl_admin_audit_gps`),
 * 所以 System Admin 側用 `getGpsViews()` (舊模組) 也能讀到這裡寫的記錄。
 */

export interface GpsViewUser {
  id?: string | null;
  name?: string | null;
}

export interface GpsViewBus {
  deviceId?: string | null;
  plate?: string | null;
}

export interface GpsView {
  id: string;
  at: string;
  userId: string;
  userName: string;
  plate: string;
  deviceId: string;
}

const K_GPS = 'cbl_admin_audit_gps';
const MAX = 500;

function genId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 誰、何時、看了哪台車 — 失敗一律靜默, 不能影響主流程 */
export function logGpsView(
  user: GpsViewUser | null | undefined,
  bus: GpsViewBus | null | undefined,
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(K_GPS);
    const rows: GpsView[] = raw ? (JSON.parse(raw) as GpsView[]) : [];
    const list = Array.isArray(rows) ? rows : [];
    list.unshift({
      id: genId(),
      at: new Date().toISOString(),
      userId: user?.id ?? '',
      userName: user?.name ?? '未登入',
      plate: bus?.plate ?? '',
      deviceId: bus?.deviceId ?? '',
    });
    localStorage.setItem(K_GPS, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore — 遙測失敗不影響主流程 */
  }
}

export function getGpsViews(): GpsView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(K_GPS);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as GpsView[]) : [];
  } catch {
    return [];
  }
}

export function clearGpsViews(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(K_GPS, JSON.stringify([]));
  } catch {
    /* ignore */
  }
}
