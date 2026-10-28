// ============================================================================
//  CBL 跨頁面 refresh 事件常數
//
//  背景 (bug fix):
//   專案內「保姆」的 refresh 事件有兩種拼法並存:
//     - cbl-nannys-refresh   (nannys 頁 / 校巴頁 / cloud-refresh / system-admin sync)
//     - cbl-nannies-refresh  (supabase-data / 路線頁 / schedule hook / inline mini form)
//   結果: dispatch 的一端跟 listen 的一端對不上 → 事件根本收不到 →
//         UI 拿不到新資料 (例如路線頁選校巴後, 跟車保姆欄位是舊快照 → 空白)。
//
//  解法: 統一定義在這裡。
//    - 所有「發送」都用 dispatchNannyRefresh() → 同時送兩種拼法 (相容舊程式碼)
//    - 所有「監聽」都用 onNannyRefresh()   → 同時監聽兩種拼法
//
//  其它實體 (buses / drivers / students …) 的事件名沒有這種分歧, 維持原樣。
// ============================================================================

/** 保姆 refresh 事件 (兩種拼法都要相容) */
export const NANNY_REFRESH_EVENTS = [
  'cbl-nannys-refresh',
  'cbl-nannies-refresh',
] as const;

/** 其它實體的 refresh 事件 (單一拼法, 不需相容) */
export const REFRESH_EVENTS = {
  clients: 'cbl-clients-refresh',
  companies: 'cbl-companies-refresh',
  users: 'cbl-users-refresh',
  drivers: 'cbl-drivers-refresh',
  buses: 'cbl-buses-refresh',
  students: 'cbl-students-refresh',
  parents: 'cbl-parents-refresh',
  nannys: 'cbl-nannys-refresh',
  nannies: 'cbl-nannies-refresh',
  routes: 'cbl-routes-refresh',
  trips: 'cbl-trips-refresh',
  attendances: 'cbl-attendances-refresh',
  announcements: 'cbl-announcements-refresh',
} as const;

/**
 * 發送「保姆資料已更新」事件 (兩種拼法都送)。
 *
 * 呼叫端: 任何寫了 Nanny.assignedBusIds / 保姆欄位的地方
 *   (校巴頁綁保姆、保姆管理頁儲存、inline mini form 新增保姆 …)
 */
export function dispatchNannyRefresh(): void {
  if (typeof window === 'undefined') return;
  NANNY_REFRESH_EVENTS.forEach((ev) => {
    try {
      window.dispatchEvent(new CustomEvent(ev));
    } catch {
      /* ignore */
    }
  });
}

/**
 * 監聽「保姆資料已更新」事件 (兩種拼法都監聽)。
 *
 * 回傳取消訂閱函式。
 */
export function onNannyRefresh(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  NANNY_REFRESH_EVENTS.forEach((ev) => {
    window.addEventListener(ev, handler);
  });
  return () => {
    NANNY_REFRESH_EVENTS.forEach((ev) => {
      window.removeEventListener(ev, handler);
    });
  };
}
