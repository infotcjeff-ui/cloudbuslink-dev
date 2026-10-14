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
  // ── /trips/[id] -> /trips
  if (/^\/trips\/[^/]+$/.test(pathname)) {
    return '/trips';
  }

  // ── portal 子頁 → 各自的 portal 主頁
  //    (如 /nanny/trips -> /nanny, /parents/portal -> /parents/portal)
  //    注意: /parents/settings 與 /nanny/settings 是它們自己的首頁, 不在此,
  //    因為它們各自有獨立的 layout, 這些頁面不走 (main) 的返回邏輯。
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
