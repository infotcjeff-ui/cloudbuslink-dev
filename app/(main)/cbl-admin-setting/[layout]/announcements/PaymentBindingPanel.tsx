'use client';

/**
 * PaymentBindingPanel — 繳費公告的「付款記錄綁定」面板 (開發中)
 *
 * 為什麼繳費公告沒有「公告類型 / 內容 / 開始日期 / 結束日期 /
 * 總顯示次數 / 每用戶顯示上限」?
 * ───────────────────────────────────────────────────────────────
 * 因為這些欄位在繳費公告裡**不是由管理員手動填**, 而是「綁定付款記錄」後
 * 自動帶出:
 *   - 內容   → 帳單摘要 (月份 / 服務 / 金額)
 *   - 類型   → 依「已逾期 / 即將到期 / 已繳」自動決定
 *   - 有效期 → 依帳單週期 (月結) 決定
 *   - 次數上限 → 依未繳戶數 / 每戶提醒次數決定
 *
 * 資料來源: /cbl-admin-setting/parents/payment (付款記錄)
 *
 * ⚠️ 付款記錄功能**尚未開發** → 這個面板先以「開發中」狀態呈現,
 *    說明清楚哪些欄位會在功能完成後自動帶入, 避免管理員以為是 bug。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/announcements/ 內使用。
 */

import {
  Receipt,
  Wrench,
  Clock,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Users as UsersIcon,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** 付款記錄尚未開發時, 會由綁定資料帶入的欄位 */
const BINDING_FIELDS = [
  {
    icon: Receipt,
    label: '內容',
    desc: '帳單摘要 (月份、服務項目、應繳金額)',
  },
  {
    icon: AlertTriangle,
    label: '公告類型',
    desc: '依「已逾期 / 即將到期 / 已繳」自動判定',
  },
  {
    icon: CalendarClock,
    label: '開始 / 結束日期',
    desc: '依帳單週期 (月結) 決定有效期',
  },
  {
    icon: BadgeCheck,
    label: '顯示次數上限',
    desc: '依未繳戶數與每戶提醒次數決定',
  },
];

export function PaymentBindingPanel({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('md:col-span-2', className)}>
      {/* 開發中橫幅 */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
          <Wrench width={15} height={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
              綁定付款記錄
            </p>
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-200/70 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
              <Clock width={9} height={9} />
              開發中
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
            繳費公告的內容、類型、有效期與提醒次數將自動由
            <span className="font-semibold">付款記錄</span>
            帶出, 不需人手填寫。
          </p>
          <a
            href="/cbl-admin-setting/parents/payment"
            className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-900 underline underline-offset-2 hover:no-underline dark:text-amber-200"
          >
            <UsersIcon width={10} height={10} />
            查看付款記錄 (家長 / 付款記錄)
            <ArrowUpRight width={10} height={10} />
          </a>
        </div>
      </div>

      {/* 會自動帶入的欄位清單 */}
      <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-800/40">
        <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
          付款記錄完成後, 以下欄位會自動帶入
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {BINDING_FIELDS.map((f) => (
            <li
              key={f.label}
              className="flex items-start gap-2 rounded-md bg-white/70 px-2.5 py-1.5 dark:bg-slate-900/60"
            >
              <f.icon
                width={11}
                height={11}
                className="mt-[3px] shrink-0 text-slate-400"
              />
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium text-slate-700 dark:text-slate-200">
                  {f.label}
                </p>
                <p className="text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">
                  {f.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PaymentBindingPanel;
