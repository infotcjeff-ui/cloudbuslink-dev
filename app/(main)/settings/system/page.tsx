import { redirect } from 'next/navigation';

/**
 * /settings/system — 舊的 System Panel 入口 (已搬遷)
 *
 * 內容已搬到 /system-admin-setting (L4 開發者專用 console, 與
 * /cbl-admin-setting 共用同一套 UI/UX)。
 *
 * 這裡只保留一個 redirect, 避免使用者收藏的舊連結直接 404。
 * 舊路徑不保留任何內容 — 一律導回 /settings (由該頁的
 * 「System Admin Setting · DEV ONLY」按鈕再進 /system-admin-setting)。
 */
export default function LegacySystemPanelRedirect() {
  redirect('/settings');
}
