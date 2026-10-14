'use client';

/**
 * AnnouncementPopup — 全站只掛一份的公告彈窗。
 *
 * 為什麼需要這個元件
 * ─────────────────
 * - 公告數量可能是 0、1 或多則。`NotificationDropdown` 只負責「列表選擇」,
 *   真正顯示公告內容的 dialog 由本元件負責。dropdown 點選後透過
 *   `triggerAnnouncementPopup(index)` 通知本元件打開。
 * - 因為 popup 是「全站唯一」, 掛在 root layout (`app/layout.tsx`) 一次就好,
 *   這樣無論用戶從哪個頁面點通知, 都能開到同一個 dialog (state 不丟失、
 *   不需要每頁各掛一份)。
 * - 為了避免在「dropdown 與 dialog 屬於不同 React tree / 沒有共享 context」
 *   的情況下硬接 props, 通訊方式採「window 自訂事件」 — 簡單、零耦合。
 *
 * 為什麼這裡要 `"use client"`
 * ──────────────────────────
 * - 父層 `app/layout.tsx` 是 RSC, 但 RSC 可以直接渲染 client component;
 *   React 會自動把它包成 client boundary。原先 layout 報
 *   "Unsupported Server Component type: {...}" 是因為 `AnnouncementPopup.tsx`
 *   是空檔, default export 解析成 `undefined` / 空物件, JSX 的 type 就壞了。
 *   補上真正的 client component 後, 此錯誤就消失。
 *
 * 通訊協定
 * ───────
 * - 觸發: `window.dispatchEvent(new CustomEvent('bus:announcement:open', { detail: { index } }))`
 * - 由 `triggerAnnouncementPopup(index)` 發送, dropdown 內已用。
 *
 * 讀已寫邏輯
 * ───────
 * - 打開時把該公告 ID 寫入 `STORAGE.announcementReads`, 跟 dropdown 的紅點
 *   計算 (active 公告 - 已讀 = 未讀) 保持一致: 真正打開看過才算已讀。
 */

import * as React from 'react';
import { Info, AlertTriangle, AlertCircle, ChevronRight, ChevronLeft, BellOff, Bell } from 'lucide-react';

import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import type { Announcement } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const OPEN_EVENT = 'bus:announcement:open';

function getTypeIcon(type: Announcement['type']) {
  switch (type) {
    case 'urgent':
      return AlertCircle;
    case 'warning':
      return AlertTriangle;
    case 'info':
    default:
      return Info;
  }
}

function getTypeColor(type: Announcement['type']) {
  switch (type) {
    case 'urgent':
      return 'text-red-500 bg-red-500/10';
    case 'warning':
      return 'text-amber-500 bg-amber-500/10';
    case 'info':
    default:
      return 'text-sky-500 bg-sky-500/10';
  }
}

export default function AnnouncementPopup() {
  const { user } = useAuth();

  // 當前用戶的 active 公告 (新到舊)
  const [items, setItems] = React.useState<Announcement[]>([]);
  // dialog 開啟狀態 + 當前選中 index (相對於 items)
  const [open, setOpen] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  // 用戶是否已主動關閉全站彈窗 (來自 /settings/announcements 的開關)
  // 預設 false = 允許彈; 設 true 後即便點鈴鐺也不再打開 dialog
  const [popupDisabled, setPopupDisabled] = React.useState<boolean>(false);

  // 載入當前用戶的 active 公告。user 變動時 (登入 / 切換 client) 重載。
  const load = React.useCallback(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const clientId = user.clientId || '';
    const all = STORAGE.announcements.getActive(clientId);
    // 只顯示「還沒達到顯示次數上限」的公告
    const eligible = all.filter(a => a.currentCount < a.displayCount);
    const sorted = [...eligible].sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
    setItems(sorted);
    // 同步讀取用戶的 popup 開關偏好
    setPopupDisabled(STORAGE.announcementPopupPref.isDisabled(user.id, clientId));
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  // 監聽 dropdown 發出的開啟事件。
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      // 自訂事件 detail; 容錯處理非預期 payload。
      const detail = (e as CustomEvent<{ index?: number }>).detail || {};
      const idx = typeof detail.index === 'number' ? detail.index : 0;
      // 重新載入一次, 確保拿到的是最新公告 (避免新增公告後 dropdown 與 popup 不一致)。
      load();
      // 注意: load() 是非同步 setState, 此處直接以最新的 items 為準做
      // index clamp, 因為 setState 後的 items 在下一輪 render 才生效 —
      // 這裡用 functional updater 也救不了, 改用「若 idx 越界就 fallback 到 0」。
      setCurrentIndex(Math.max(0, idx));

      // 用戶已主動關閉全站彈窗 → 直接吞掉這個開啟事件, 什麼都不做。
      // 不打 setOpen(true) 也不顯示空 dialog, 完全靜默。
      // (我們重新 load() 拿到的 popupDisabled 雖然是 setState 後的值,
      //  但因為 setState 不會同步生效, 這裡直接讀一次 storage 拿「最新值」判斷)
      if (user) {
        const clientId = user.clientId || '';
        if (STORAGE.announcementPopupPref.isDisabled(user.id, clientId)) {
          setOpen(false);
          return;
        }
      }
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [load, user]);

  // 監聽公告資料更新事件 (來自 cbl-admin-setting/announcements 頁面)
  React.useEffect(() => {
    const onRefresh = () => {
      load();
    };
    window.addEventListener('cbl-announcements-refresh', onRefresh);
    return () => window.removeEventListener('cbl-announcements-refresh', onRefresh);
  }, [load]);

  // 切換 popup 開關的 handler。
  // - 設為 disabled 時: 立即關掉當前 dialog (若有打開)
  // - 設為啟用時: 不主動打開, 等用戶下次點鈴鐺
  const togglePopupDisabled = React.useCallback((disabled: boolean) => {
    if (!user) return;
    const clientId = user.clientId || '';
    STORAGE.announcementPopupPref.setDisabled(user.id, clientId, disabled);
    setPopupDisabled(disabled);
    if (disabled) {
      // 關掉當前可能已打開的 dialog
      setOpen(false);
    }
  }, [user]);

  // 當打開時, 確認 currentIndex 還在範圍內 (公告可能在使用期間被刪 / 過期)。
  React.useEffect(() => {
    if (!open) return;
    if (items.length === 0) {
      // 沒有任何公告 → 關掉, 避免顯示空 dialog
      setOpen(false);
      return;
    }
    if (currentIndex < 0 || currentIndex >= items.length) {
      setCurrentIndex(0);
    }
  }, [open, items, currentIndex]);

  const current = items[currentIndex];

  // 打開 → 標記已讀
  React.useEffect(() => {
    if (!open || !current || !user) return;
    const clientId = user.clientId || '';
    STORAGE.announcementReads.markRead(user.id, clientId, [current.id]);
  }, [open, current, user]);

  const goNext = React.useCallback(() => {
    if (items.length === 0) return;
    setCurrentIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  const goPrev = React.useCallback(() => {
    if (items.length === 0) return;
    setCurrentIndex((i) => (i - 1 + items.length) % items.length);
  }, [items.length]);

  // 沒有當前公告時不渲染 dialog 內容 (Radix 需要 open 才有 portal, 但這裡
  // 直接不開以避免空 dialog 閃一下)。
  // 用戶已主動關閉全站彈窗 → 永遠不開, 即便被外部觸發也吞掉。
  const showDialog = open && !!current && !popupDisabled;

  // 將 toggle handler 暴露給 dialog 內的「不再顯示全站彈窗」按鈕使用

  return (
    <Dialog open={showDialog} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        {current && (() => {
          const Icon = getTypeIcon(current.type);
          const colorCls = getTypeColor(current.type);
          return (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                      colorCls
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-base leading-snug">
                      {current.title || '公告'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1">
                      {current.startDate}
                      {current.endDate && current.endDate !== current.startDate
                        ? ` ~ ${current.endDate}`
                        : ''}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90 max-h-[60vh] overflow-y-auto -mx-1 px-1">
                {current.content}
              </div>

              <DialogFooter className="flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
                {/* 左側: 「不再顯示全站彈窗」— 一鍵關掉 AnnouncementPopup
                    為什麼放在 footer 左側: 與「知道了」分開, 避免誤觸;
                    用戶可能只是當下不想看, 但「不再顯示」是更強的設定行為 */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => togglePopupDisabled(true)}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="不再顯示全站公告彈窗"
                  title="關閉後, 點鈴鐺也不會再彈出公告, 可到「設定 > 公告」重新開啟"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>不再顯示全站彈窗</span>
                </Button>
                <div className="flex items-center gap-2 sm:ml-auto">
                  {items.length > 1 && (
                    <span className="text-xs text-muted-foreground mr-1">
                      {currentIndex + 1} / {items.length}
                    </span>
                  )}
                  {items.length > 1 && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={goPrev}
                        className="h-9 px-3"
                        aria-label="上一則"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={goNext}
                        className="h-9 px-3"
                        aria-label="下一則"
                      >
                        下一則
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOpen(false)}
                    className="h-9 px-4"
                  >
                    知道了
                  </Button>
                </div>
              </DialogFooter>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 從外部 (例如 NotificationDropdown) 打開公告彈窗。
 *
 * 為什麼用 window event 而不是 context / ref:
 * - popup 與 dropdown 在不同 React 子樹, 也沒有共享 provider;
 *   event bus 是最少耦合、零額外依賴的方案。
 * - 這層薄薄的「轉發」也讓 `mod.triggerAnnouncementPopup(index)` 的
 *   既有呼叫點完全不用改。
 */
export function triggerAnnouncementPopup(index: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, { detail: { index } })
  );
}
