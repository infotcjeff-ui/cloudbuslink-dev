/**
 * lib/admin-audit.ts — System Admin 概覽的審計資料層 (本機 localStorage)
 *
 * 概覽要顯示:
 *   1. 網站 error (window.onerror / unhandledrejection 收集)
 *   2. 各 user 做了什麼動作 (login / logout / gps-view / user CRUD / sync ...)
 *   3. 登入時長 (login → logout 的 session)
 *   4. 校巴 GPS 查看情況 (誰、何時、看了哪台車)
 *
 * 全部只存本機 (cbl_admin_audit_*), 不上雲 — 這是 L4 維運視角,
 * 不需要跨裝置一致, 也不想為審計另開 RLS 表。
 */

export interface AuditAction {
  id: string;
  at: string; // ISO
  userId: string;
  userName: string;
  role: string;
  kind: string; // login | logout | gps-view | user-create | user-update | user-delete | user-restore | user-perm-delete | sync | secrets-update | page-view
  detail: string;
}

export interface AuditError {
  id: string;
  at: string;
  message: string;
  source: string;
  stack?: string;
  path: string;
}

export interface AuditSession {
  id: string;
  userId: string;
  userName: string;
  role: string;
  loginAt: string;
  logoutAt: string | null;
  /** 秒 (logout 時結算, 未登出則即時計算) */
  seconds: number;
}

export interface GpsView {
  id: string;
  at: string;
  userId: string;
  userName: string;
  plate: string;
  deviceId: string;
}

const K_ACTIONS = 'cbl_admin_audit_actions';
const K_ERRORS = 'cbl_admin_audit_errors';
const K_SESSIONS = 'cbl_admin_audit_sessions';
const K_GPS = 'cbl_admin_audit_gps';
const MAX = 500;

function genId(): string {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, rows: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(rows.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

function currentUser(): { id: string; name: string; role: string } {
  try {
    const raw = localStorage.getItem('cbl_auth');
    if (!raw) return { id: '', name: '未登入', role: '' };
    const u = JSON.parse(raw) as { id?: string; name?: string; role?: string };
    return { id: u.id || '', name: u.name || '未知', role: u.role || '' };
  } catch {
    return { id: '', name: '未知', role: '' };
  }
}

/* ---------------- actions ---------------- */

export function logAction(kind: string, detail: string): void {
  if (typeof window === 'undefined') return;
  const u = currentUser();
  const rows = read<AuditAction>(K_ACTIONS);
  rows.unshift({
    id: genId(),
    at: new Date().toISOString(),
    userId: u.id,
    userName: u.name,
    role: u.role,
    kind,
    detail,
  });
  write(K_ACTIONS, rows);
}

export function getActions(): AuditAction[] {
  return read<AuditAction>(K_ACTIONS);
}

export function clearActions(): void {
  write(K_ACTIONS, []);
}

/* ---------------- errors ---------------- */

export function logError(message: string, source = '', stack?: string): void {
  if (typeof window === 'undefined') return;
  const rows = read<AuditError>(K_ERRORS);
  rows.unshift({
    id: genId(),
    at: new Date().toISOString(),
    message: message.slice(0, 500),
    source,
    stack: stack?.slice(0, 1000),
    path: window.location.pathname,
  });
  write(K_ERRORS, rows);
}

export function getErrors(): AuditError[] {
  return read<AuditError>(K_ERRORS);
}

export function clearErrors(): void {
  write(K_ERRORS, []);
}

/** 在概覽頁 mount 一次 — 全站 error 收集 (只註冊一次) */
let errorHooked = false;
export function hookWindowErrors(): void {
  if (typeof window === 'undefined' || errorHooked) return;
  errorHooked = true;
  window.addEventListener('error', (e) => {
    logError(e.message || 'window.onerror', e.filename || '', e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    logError(`unhandledrejection: ${msg}`, '', e.reason instanceof Error ? e.reason.stack : undefined);
  });
}

/* ---------------- sessions (登入時長) ---------------- */

export function startSession(userId: string, userName: string, role: string): void {
  if (typeof window === 'undefined') return;
  const rows = read<AuditSession>(K_SESSIONS);
  rows.unshift({
    id: genId(),
    userId,
    userName,
    role,
    loginAt: new Date().toISOString(),
    logoutAt: null,
    seconds: 0,
  });
  write(K_SESSIONS, rows.slice(0, MAX));
}

export function endSession(userId: string): void {
  if (typeof window === 'undefined') return;
  const rows = read<AuditSession>(K_SESSIONS);
  const idx = rows.findIndex((s) => s.userId === userId && !s.logoutAt);
  if (idx >= 0) {
    const s = rows[idx];
    const out = new Date().toISOString();
    rows[idx] = {
      ...s,
      logoutAt: out,
      seconds: Math.max(0, Math.round((new Date(out).getTime() - new Date(s.loginAt).getTime()) / 1000)),
    };
    write(K_SESSIONS, rows);
  }
}

export function getSessions(): AuditSession[] {
  const rows = read<AuditSession>(K_SESSIONS);
  const now = Date.now();
  return rows.map((s) =>
    s.logoutAt
      ? s
      : { ...s, seconds: Math.max(0, Math.round((now - new Date(s.loginAt).getTime()) / 1000)) },
  );
}

export function clearSessions(): void {
  write(K_SESSIONS, []);
}

/* ---------------- gps views ---------------- */

export function logGpsView(plate: string, deviceId: string): void {
  if (typeof window === 'undefined') return;
  const u = currentUser();
  const rows = read<GpsView>(K_GPS);
  rows.unshift({
    id: genId(),
    at: new Date().toISOString(),
    userId: u.id,
    userName: u.name,
    plate,
    deviceId,
  });
  write(K_GPS, rows);
}

export function getGpsViews(): GpsView[] {
  return read<GpsView>(K_GPS);
}

export function clearGpsViews(): void {
  write(K_GPS, []);
}

/** 垃圾桶 (帳號軟刪除暫存, 清空 = 真刪 supabase) */
export interface TrashedUser {
  user: import('./types').User;
  trashedAt: string;
  trashedBy: string;
}

const K_TRASH = 'cbl_users_trash';

export function getTrashedUsers(): TrashedUser[] {
  return read<TrashedUser>(K_TRASH);
}

export function trashUser(user: import('./types').User, by: string): void {
  const rows = read<TrashedUser>(K_TRASH);
  if (rows.some((t) => t.user.id === user.id)) return;
  rows.unshift({ user, trashedAt: new Date().toISOString(), trashedBy: by });
  write(K_TRASH, rows);
}

export function restoreTrashedUser(id: string): TrashedUser | null {
  const rows = read<TrashedUser>(K_TRASH);
  const hit = rows.find((t) => t.user.id === id) || null;
  write(
    K_TRASH,
    rows.filter((t) => t.user.id !== id),
  );
  return hit;
}

export function removeTrashedUser(id: string): void {
  write(
    K_TRASH,
    read<TrashedUser>(K_TRASH).filter((t) => t.user.id !== id),
  );
}
