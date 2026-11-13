/**
 * 保姆個人化路徑 (personalized nanny portal paths)
 *
 *   舊: /nanny (welcome) /nanny/trips /nanny/settings
 *   新: /{slug}/route (welcome) /{slug}/trips /{slug}/settings
 *       slug = user.accountName (小寫, URL-safe) → 例如 wendy 登入就是 /wendy/route
 *
 * 選 accountName 的原因:
 *   - 登入已支援「帳戶名稱 / 手機號碼」二選一 (見 lib/auth-lookup.ts)
 *   - accountName 規則本身就是 URL-safe: 3-32 位英數字 / _ . -
 *   - name (如 "Wendy Chan") 含空格 / 中文, 不適合直接做 path
 *   - phone 雖然可用, 但會外洩電話號碼
 */

const RESERVED_FIRST_SEGMENTS = new Set([
  'trips',
  'settings',
  'parents',
  'bus',
  'login',
  'nannyloginportal',
  'parentsloginportal',
  'cbl-admin-setting',
  'system-admin-setting',
  'api',
  '_next',
  'nanny',
]);

/** 由 user 算出 slug; 拿不到時回 null (呼叫端自行 fallback 去 /nanny) */
export function getNannySlug(user: { accountName?: string | null; phone?: string | null; name?: string | null } | null | undefined): string | null {
  if (!user) return null;
  const account = (user.accountName || '').trim().toLowerCase();
  if (account && /^[a-z0-9_.-]{3,32}$/.test(account)) return account;
  // 名字優先於電話: Wendy 登入就要是 /wendy/route, 而不是 /9xxxxxxx/route
  // 只接受純 ASCII 名字 (含空格轉 -), 中文名退回用電話避免 URL 編碼
  const name = (user.name || '').trim().toLowerCase();
  if (name && /^[a-z0-9]+(?:[ _.-][a-z0-9]+)*$/.test(name)) {
    const slug = name.replace(/[\s_.]+/g, '-');
    if (/^[a-z0-9.-]{2,32}$/.test(slug)) return slug;
  }
  const phone = (user.phone || '').trim();
  if (phone) return phone;
  return null;
}

/** 保姆 welcome 主頁: /{slug}/route */
export function nannyHomePath(userOrSlug: { accountName?: string | null; phone?: string | null; name?: string | null } | string | null | undefined): string {
  const slug = typeof userOrSlug === 'string' ? userOrSlug : getNannySlug(userOrSlug);
  return slug ? `/${slug}/route` : '/nanny';
}

/** 保姆班次列表: /{slug}/trips */
export function nannyTripsPath(userOrSlug: { accountName?: string | null; phone?: string | null; name?: string | null } | string | null | undefined): string {
  const slug = typeof userOrSlug === 'string' ? userOrSlug : getNannySlug(userOrSlug);
  return slug ? `/${slug}/trips` : '/nanny/trips';
}

/** 保姆設定頁: /{slug}/settings */
export function nannySettingsPath(userOrSlug: { accountName?: string | null; phone?: string | null; name?: string | null } | string | null | undefined): string {
  const slug = typeof userOrSlug === 'string' ? userOrSlug : getNannySlug(userOrSlug);
  return slug ? `/${slug}/settings` : '/nanny/settings';
}

/** 是否為新版個人化保姆路徑: /{slug}/route | /{slug}/trips | /{slug}/settings(+子頁) */
export function isPersonalizedNannyPath(pathname: string): boolean {
  const m = /^\/([^/]+)\/(route|trips|settings)(\/.*)?$/.exec(pathname);
  if (!m) return false;
  if (RESERVED_FIRST_SEGMENTS.has(m[1])) return false;
  return true;
}

/** 是否為舊版保姆路徑: /nanny, /nanny/portal, /nanny/... */
export function isLegacyNannyPath(pathname: string): boolean {
  return pathname === '/nanny' || pathname.startsWith('/nanny/');
}

/** 個人化路徑的邏輯父路徑 (給返回鍵用) */
export function getPersonalizedNannyParentPath(pathname: string): string {
  const m = /^\/([^/]+)\/(route|trips|settings)(\/.*)?$/.exec(pathname);
  if (!m) return '/';
  const slug = m[1];
  const sub = m[2];
  const rest = m[3] || '';
  // settings 子頁 → 回 settings 首頁
  if (sub === 'settings' && rest && rest !== '/') return `/${slug}/settings`;
  // trips / route 的子頁 (暫無) → 回各自首頁
  if (sub === 'trips' && rest && rest !== '/') return `/${slug}/trips`;
  // 頂層 → 回 welcome
  return `/${slug}/route`;
}
