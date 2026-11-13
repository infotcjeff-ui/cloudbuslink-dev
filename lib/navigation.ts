// 邏輯父路徑映射 - 不用 router.back()
//
// 設計原則: 返回「邏輯父路徑」而非瀏覽器歷史。
// 使用者從 /settings 的選單進入子頁 (學生/校巴/報表...),
// 按返回應回到 /settings 而不是被丟回首頁。
//
// 路由分五類:
//   1. 頂層 tab (返回鍵不顯示): /, /trips, /settings
//   2. /settings/<模組> (第一層) → /settings
//      /settings/students, /settings/buses, /settings/reports...
//   3. /settings/<模組>/<子頁> → /settings/<模組> (標準麵包屑)
//      /settings/students/new            → /settings/students
//      /settings/students/[id]/edit      → /settings/students
//   4. 家長 portal 子頁 → 該 portal 的設定頁
//      /parents/settings/binding         → /parents/settings
//   5. 其餘 (深層頁) → 對應列表頁
//      /trips/[id], /trips/[id]/edit, /trips/[id]/checkin, /trips/new

export function getParentPath(pathname: string): string {
  // ── /trips/[id]/checkin -> /trips/[id]
  if (/^\/trips\/[^/]+\/checkin$/.test(pathname)) {
    return pathname.replace('/checkin', '');
  }
  // ── /trips/[id]/edit -> /trips/[id]
  if (/^\/trips\/[^/]+\/edit$/.test(pathname)) {
    return pathname.replace('/edit', '');
  }
  // ── /trips/new -> /trips
  if (pathname === '/trips/new') {
    return '/trips';
  }
  // ── /bus/[id] -> / (校巴詳情由主頁進入)
  if (/^\/bus\/[^/]+$/.test(pathname)) {
    return '/';
  }
  // ── /trips/[id] -> /trips
  if (/^\/trips\/[^/]+$/.test(pathname)) {
    return '/trips';
  }

  // ── /system-admin-setting/* → /settings
  //    (後台 console 自帶返回鍵, 但 getParentPath 仍需正確映射,
  //     給其他呼叫端 (例如 (main) layout) 使用)
  if (/^\/system-admin-setting(?:\/|$)/.test(pathname)) {
    return '/settings';
  }

  // ── portal 子頁 → 各自的 portal 主頁
  //    (如 /nanny/trips -> /nanny, /parents/portal -> /parents/portal)
  //    注意: /parents/settings 與 /nanny/settings 是它們自己的首頁, 不在此,
  //    因為它們各自有獨立的 layout, 這些頁面不走 (main) 的返回邏輯。
  //    個人化保姆路徑 (/{slug}/route|trips|settings) 的父路徑見 lib/nanny-path.ts,
  //    但 getParentPath 也要能處理 (例如 (main) layout 的返回鍵在打卡頁用不到,
  //    這裡兜底即可)。
  //    (如 /wendy/trips -> /wendy/route, /wendy/settings/xxx -> /wendy/settings)
  {
    const m = /^\/([^/]+)\/(route|trips|settings)(\/.*)?$/.exec(pathname);
    if (m) {
      const reserved = new Set(['trips', 'settings', 'parents', 'bus', 'login', 'nannyloginportal', 'parentsloginportal', 'cbl-admin-setting', 'system-admin-setting', 'api', '_next', 'nanny']);
      if (!reserved.has(m[1])) {
        const slug = m[1];
        const sub = m[2];
        const rest = m[3] || '';
        if (sub === 'settings' && rest && rest !== '/') return `/${slug}/settings`;
        if (sub === 'trips' && rest && rest !== '/') return `/${slug}/trips`;
        return `/${slug}/route`;
      }
    }
  }
  if (/^\/nanny\//.test(pathname) && !/^\/nanny\/settings(?:\/|$)/.test(pathname)) return '/nanny';
  if (/^\/parents\//.test(pathname) && !/^\/parents\/settings(?:\/|$)/.test(pathname)) return '/parents/trips';

  // ── portal 設定頁底下的子頁 → 該設定頁
  //    (如 /parents/settings/binding -> /parents/settings)
  if (/^\/(parents|nanny)\/settings\/[^/]+$/.test(pathname)) {
    return pathname.replace(/\/[^/]+$/, '');
  }

  // ── /settings/<模組>/<id>/edit -> /settings/<模組>
  //    (如 /settings/students/abc/edit -> /settings/students)
  //    注意: 只處理 [id]/edit 這種「深層編輯」; 模組第一層子頁已在下面
  //    /^\/settings\/[^/]+$/ 規則中, 不會走到這裡。
  const settingsDeepEdit = /^\/settings\/([^/]+)\/[^/]+\/edit$/.exec(pathname);
  if (settingsDeepEdit) {
    return `/settings/${settingsDeepEdit[1]}`;
  }
  // ── /settings/students/new -> /settings/students
  if (pathname === '/settings/students/new') {
    return '/settings/students';
  }
  // ── /settings/<模組> (第一層) -> /settings
  //    (如 /settings/students, /settings/site, /settings/profile)
  if (/^\/settings\/[^/]+$/.test(pathname)) {
    return '/settings';
  }

  // 默認回首頁
  return '/';
}
