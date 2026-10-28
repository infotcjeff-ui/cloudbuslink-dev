'use client';

/**
 * /cbl-admin-setting — CBL Admin Setting console 的外殼
 *
 * 這裡只負責「選單定義 + 外殼」, 內頁由 nested route 決定:
 *   /cbl-admin-setting                  → 概覽
 *   /cbl-admin-setting/schedule         → 班次
 *   /cbl-admin-setting/bus              → 校巴
 *   /cbl-admin-setting/bus/trips        → 路線
 *   /cbl-admin-setting/bus/drivers      → 司機
 *   /cbl-admin-setting/parents          → 家長
 *   /cbl-admin-setting/students         → 學生
 *   /cbl-admin-setting/nannys           → 保姆
 *   /cbl-admin-setting/reports          → 報表
 *   /cbl-admin-setting/user             → 用戶
 *   /cbl-admin-setting/announcements    → 公告
 *   /cbl-admin-setting/site-tool        → 網站設定
 *
 * 外殼 (header / 巢狀 sidebar / dark mode / HK 時間) 已抽到
 * components/admin/AdminShell.tsx, 與 /system-admin-setting 共用。
 */

import {
  LayoutDashboard, Users, Bus, UserCheck, Baby,
  BarChart3, Megaphone, Wrench, UserCog,
  FileSpreadsheet, Receipt, ShieldCheck, CalendarClock
} from 'lucide-react';
import { AdminShell, type AdminTabItem } from '@/components/admin/AdminShell';

// 左側選單設定 — 支援巢狀結構 (parent + 可選 children)
// 範例:
//   - 班次 (/cbl-admin-setting/schedule) → 子頁: 校巴, 路線, 司機
//   - 家長 (/cbl-admin-setting/parents) → 子頁: 付款記錄 (「子女」已移除)
//
// 注意: 用戶 (/cbl-admin-setting/user) 是「透過 switch button 把某些功能權限
// 給予其他可登入 user」的管理頁 — 不是登入者本身的權限設定。
const TABS: AdminTabItem[] = [
  { id: 'overview', label: '概覽', path: '/cbl-admin-setting', icon: LayoutDashboard },

  // 班次群組 (子頁: 校巴, 路線, 司機)
  // 班次 parent 自身指向 /cbl-admin-setting/schedule (班次總覽 landing)
  // 校巴 / 路線 / 司機 都是同一個領域下的細分, 點 sidebar 校巴 / 路線 / 司機
  // 會直接打開對應的子頁 (校巴 → /bus landing, 路線 → /bus/trips, 司機 → /bus/drivers)
  {
    id: 'schedule', label: '班次', path: '/cbl-admin-setting/schedule', icon: CalendarClock,
    children: [
      { id: 'schedule-bus',     label: '校巴', path: '/cbl-admin-setting/bus',         icon: Bus },
      { id: 'schedule-trips',   label: '路線', path: '/cbl-admin-setting/bus/trips',   icon: FileSpreadsheet },
      { id: 'schedule-drivers', label: '司機', path: '/cbl-admin-setting/bus/drivers', icon: UserCog },
    ],
  },

  // 家長群組 (含子頁: 付款記錄)
  // 「子女」子頁已移除 — 子女資料於 /cbl-admin-setting/students 統一管理, 並在
  // /cbl-admin-setting/parents 列表的「檢視」popup 內即可看到家長的子女。
  {
    id: 'parents', label: '家長', path: '/cbl-admin-setting/parents', icon: Users,
    children: [
      { id: 'parents-payment',   label: '付款記錄',     path: '/cbl-admin-setting/parents/payment',   icon: Receipt },
    ],
  },

  // 學生 (獨立管理頁, 與 /childrens 共用資料但可編寫完整學生資料含班級/監護人)
  { id: 'students', label: '學生', path: '/cbl-admin-setting/students', icon: Baby },

  // 保姆 (注意路徑為 nannys, 不是 nannies)
  { id: 'nannys', label: '保姆', path: '/cbl-admin-setting/nannys', icon: UserCheck },

  { id: 'reports',       label: '報表',     path: '/cbl-admin-setting/reports',      icon: BarChart3 },
  { id: 'user',          label: '用戶',     path: '/cbl-admin-setting/user',         icon: ShieldCheck },
  { id: 'announcements', label: '公告',     path: '/cbl-admin-setting/announcements', icon: Megaphone },
  { id: 'site-tool',     label: '網站設定', path: '/cbl-admin-setting/site-tool',    icon: Wrench },
];

export default function CblAdminSettingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell
      title="CBL Admin Setting"
      tabs={TABS}
      backHref="/settings"
      backLabel="返回設定"
      footerText="CloudBusLink v1.0.0"
    >
      {children}
    </AdminShell>
  );
}
