'use client';

/**
 * AnnouncementPopup — 全站只掛一份的公告彈窗。
 *
 * 為什麼需要這個元件
 * ─────────────────
 * - 公告數量可能是 0、1 或多則。`NotificationDropdown` 只負責「列表選擇」,
 *   真正顯示公告內容的 dialog 由本元件負責。dropdown 點選後透過
 *   `triggerAnnouncementPopupById(id)` 通知本元件打開。
 * - 因為 popup 是「全站唯一」, 掛在 root layout (`app/layout.tsx`) 一次就好,
 *   這樣無論用戶從哪個頁面點通知, 都能開到同一個 dialog (state 不丟失、
 *   不需要每頁各掛一份)。
 * - 為了避免在「dropdown 與 dialog 屬於不同 React tree / 沒有共享 context」
 *   的情況下硬接 props, 通訊方式採「window 自訂事件」 — 簡單、零耦合。
 *
 * 自動彈窗規則 (2026-10-26 依使用者需求重寫)
 * ────────────────────────────────────────────
 * 生效中的公告 (isActive && !isTemplate && 今天在 startDate~endDate 內),
 * 在「每一次進入主頁」時都會自動彈出。
 *
 * 「主頁」依角色而定:
 *   - super_admin / client → `/`
 *   - parent → `/parents` 或 `/parents/portal`
 *   - nanny   → `/nanny` 或 `/nanny/portal`
 *
 * 例外 (該則公告不再自動彈出):
 *   - 使用者勾選「不再顯示此通告」並關閉 → 記錄在
 *     `STORAGE.announcementDismiss`, 只影響「這則公告、這個用戶」。
 *   - 使用者手動關閉 / 按 ESC / 點遮罩 → 沒有勾選就只是這次不看,
 *     下次進入主頁照樣彈出。
 *
 * 關於「顯示次數上限」:
 *   displayCount / maxViewsPerUser 降級為「純統計數字」, 不再限制自動彈窗。
 *   (舊語意是看過一次就不彈, 與「限期內每次進入主頁都彈出」直接衝突。)
 *
 * 讀已寫邏輯
 * ───────
 * - 打開時把該公告 ID 寫入 `STORAGE.announcementReads`, 跟 dropdown 的紅點
 *   計算 (active 公告 - 已讀 = 未讀) 保持一致: 真正打開看過才算已讀。
 * - 同時把該公告的 currentCount +1, 並累加「該用戶看過幾次」, 作為統計。
 */

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Info, AlertTriangle, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';

import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { getAnnouncementAudience } from '@/lib/announcement-audience';
import { isPersonalizedNannyPath } from '@/lib/nanny-path';
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

/**
 * 每個角色的「主頁」路徑。
 *
 * 為什麼要分角色:
 * - 超管 / 客戶 → 系統主頁 `/`
 * - 家長 → 家長 portal 主頁 `/parents` (或 `/parents/portal`, 兩個路徑共用同一份內容)
 * - 保姆 → 保姆 portal 主頁 `/nanny` (或 `/nanny/portal`)
 *
 * 判斷「進入主頁」= pathname 變成上述任一路徑。
 */
const HOME_PATHS_BY_ROLE: Record<string, string[]> = {
  super_admin: ['/'],
  client: ['/'],
  parent: ['/parents', '/parents/portal'],
  nanny: ['/nanny', '/nanny/portal'],
};

/**
 * 判斷某個路徑是否為該角色的主頁。
 *
 * 為什麼不用 startsWith:
 * `/parents/trips` 也以 `/parents` 開頭, 但那不是主頁 — 进入班次頁不應該彈公告。
 * 保姆已改為個人化路徑 (/{slug}/route, slug = accountName, 如 /wendy/route),
 * 舊版 /nanny 保留相容 (登入後會 redirect 過去, 但直接進舊路徑也要能彈公告)。
 */
function isHomePath(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  if (role === 'nanny') {
    if (pathname === '/nanny' || pathname === '/nanny/portal') return true;
    return isPersonalizedNannyPath(pathname) && /\/route\/?$/.test(pathname);
  }
  const paths = HOME_PATHS_BY_ROLE[role];
  if (!paths) return false;
  return paths.includes(pathname);
}

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

/** ISO date → yyyy/mm/dd (顯示用, 不含時間) */
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export default function AnnouncementPopup() {
  const { user } = useAuth();
  const pathname = usePathname();

  // 當前用戶的 active 公告 (新到舊)
  const [items, setItems] = React.useState<Announcement[]>([]);
  // dialog 開啟狀態 + 當前選中 index (相對於 items)
  const [open, setOpen] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  // 「不再顯示此通告」checkbox 的勾選狀態 (每次開啟 dialog 都重設為未勾選)
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  // super_admin 沒有自己的 clientId, 但依需求要看得見所有機構的公告。
  const isSuperAdmin = user?.role === 'super_admin';
  const clientId = user?.clientId || '';

  // 受眾上下文 (系統公告 → 全部看得到; 繳費公告 → 只有被選家長看得到)
  const audience = React.useMemo(
    () => getAnnouncementAudience(user, isSuperAdmin),
    [user, isSuperAdmin],
  );

  // dialog 是否正在開啟 (ref — 避免 stale closure, 也讓 load() 能即時判斷)
  const openRef = React.useRef(false);
  React.useEffect(() => { openRef.current = open; }, [open]);

  // 本次開啟期間已計過次數的公告 id
  // 避免 load() 造成 current 物件換新 (同一 id) 時重複 +1
  const countedIdsRef = React.useRef<Set<string>>(new Set());

  /**
   * 從 Supabase 拉最新公告到 localStorage。
   *
   * 為什麼 popup 必須自己拉一次:
   * - 公告是「會變動」的資料 (管理員在另一台裝置新增/停用)
   * - useInitData() 只在「第一次」載入時同步 (initWithSupabase 在
   *   isInitialized() 之後會直接 return) → 之後新增的公告永遠看不到
   * - 後台頁 (/cbl-admin-setting/announcements) 有自己拉一次, 但主頁沒有
   *
   * 這就是「公告已啟用但主頁沒有 popup 彈出」的主要成因之一:
   * 公告只存在 DB, localStorage 沒有 → 清單回傳空 → 不彈。
   */
  const syncFromDb = React.useCallback(async () => {
    try {
      const { supabaseAnnouncements } = await import('@/lib/supabase-announcements');
      await supabaseAnnouncements.syncToStorage();
    } catch (e) {
      console.warn('[AnnouncementPopup] db sync failed:', e);
    }
  }, []);

  /**
   * 載入當前用戶「可以看到的」公告。user 變動時 (登入 / 切換 client) 重載。
   *
   * 清單本身用 getActive() (範圍 + 有效期), 讓「上一則 / 下一則」可以瀏覽
   * 所有生效中的公告。
   */
  const load = React.useCallback(() => {
    if (!user) {
      setItems([]);
      return;
    }
    const active = STORAGE.announcements.getActive(clientId, isSuperAdmin, audience);
    // 新到舊 (startDate DESC)
    const sorted = [...active].sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
    // dialog 開啟中不更新清單 — 否則 currentCount 剛好達上限時,
    // 使用者正在看的公告會突然從清單消失、dialog 直接關閉。
    if (!openRef.current) {
      setItems(sorted);
    }
  }, [user, clientId, isSuperAdmin, audience]);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * 自動彈窗 — 每次「進入主頁」時觸發。
   *
   * 條件 (全部符合才彈):
   *   1. 有 user
   *   2. pathname 是該角色的主頁
   *   3. 至少有一則「生效中 + 未被隱藏」的公告
   *
   * 與舊版的差別:
   *   - 舊版: 「本次登入只彈一次」+ 「排除已讀」+ 「套用次數上限」
   *   - 新版: 「每次進入主頁都彈」+ 「只排除使用者手動隱藏的」
   *
   * 為什麼要等 syncFromDb()?
   * - 公告存在 DB, localStorage 只是快取
   * - 使用者進站時 localStorage 可能還是舊的 (甚至空的) →
   *   清單回傳空 → 公告「已啟用」卻不彈
   * - 先拉 DB 再判斷, 才能確保看到管理員剛發佈的公告
   */
  React.useEffect(() => {
    if (!user) return;
    if (!isHomePath(user.role, pathname)) return;

    let cancelled = false;

    const tryAutoShow = () => {
      if (cancelled) return;
      // dialog 已經開著 → 不要重新觸發 (避免把使用者正在看的公告重設回第 1 則)
      if (openRef.current) return;
      // getAutoPopupList: 生效中 + 有效期內 + 使用者未勾選「不再顯示此通告」
      // (不套用 displayCount / maxViewsPerUser — 次數只是統計)
      const list = STORAGE.announcements.getAutoPopupList(
        user.id,
        clientId,
        isSuperAdmin,
        audience,
      );
      if (list.length === 0) return;

      setItems(list);
      setCurrentIndex(0);
      setDontShowAgain(false);
      setOpen(true);
    };

    // 先嘗試用 localStorage 現有資料 (快, 避免每次進站都等網路)
    const listNow = STORAGE.announcements.getAutoPopupList(
      user.id,
      clientId,
      isSuperAdmin,
      audience,
    );
    if (listNow.length > 0) {
      tryAutoShow();
      // localStorage 已有資料 → 不必再等 DB (但背景同步, 讓下次更準)
      void syncFromDb();
      return;
    }

    // localStorage 沒有 → 一定要等 DB 拉回來再判斷
    void syncFromDb().then(() => {
      tryAutoShow();
    });

    return () => {
      cancelled = true;
    };
  }, [user, clientId, isSuperAdmin, pathname, syncFromDb, audience]);

  // 監聽 dropdown 發出的開啟事件。
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      // 自訂事件 detail; 容錯處理非預期 payload。
      const detail = (e as CustomEvent<{ index?: number; id?: string }>).detail || {};
      // 重新載入一次, 確保拿到的是最新公告 (避免新增公告後 dropdown 與 popup 不一致)。
      load();

      // 優先用 announcement id 定位 (dropdown 的清單是 getActive,
      // popup 的清單可能不同 → index 會對不上)。
      if (detail.id) {
        const active = STORAGE.announcements.getActive(clientId, isSuperAdmin, audience);
        const sorted = [...active].sort((a, b) =>
          b.startDate.localeCompare(a.startDate)
        );
        const idx = sorted.findIndex((a) => a.id === detail.id);
        if (idx >= 0) {
          setItems(sorted);
          setCurrentIndex(idx);
          setDontShowAgain(false);
          setOpen(true);
          return;
        }
      }

      // 沒有 id → 用 index (舊的呼叫方式)
      const idx = typeof detail.index === 'number' ? detail.index : 0;
      setCurrentIndex(Math.max(0, idx));
      setDontShowAgain(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [load, clientId, isSuperAdmin, audience]);

  // 監聽公告資料更新事件 (來自 cbl-admin-setting/announcements 頁面)
  React.useEffect(() => {
    const onRefresh = () => {
      load();
    };
    window.addEventListener('cbl-announcements-refresh', onRefresh);
    return () => window.removeEventListener('cbl-announcements-refresh', onRefresh);
  }, [load]);

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

  // 打開 → 標記已讀 + 累加顯示次數 (統計用途)
  React.useEffect(() => {
    if (!open || !current || !user) return;
    // 同一則公告在「本次開啟期間」只計一次
    // (load() 造成 current 物件換新時不會重複 +1)
    if (countedIdsRef.current.has(current.id)) return;
    countedIdsRef.current.add(current.id);

    STORAGE.announcementReads.markRead(user.id, clientId, [current.id]);
    // 累加「該用戶看過幾次」→ 統計
    STORAGE.announcementViews.markViewed(user.id, clientId, current.id);
    // 累加「總顯示次數」→ 統計
    STORAGE.announcements.incrementCount(current.id);

    // 同步回 Supabase — 否則下次 syncToStorage() 會用 DB 的舊值覆蓋 localStorage,
    // 造成統計數字在重新整理後被重設。
    void (async () => {
      try {
        const { supabaseAnnouncements } = await import('@/lib/supabase-announcements');
        const res = await supabaseAnnouncements.incrementCount(current.id);
        if (!res.success) {
          console.warn('[AnnouncementPopup] count sync failed:', res.error);
        }
      } catch (err) {
        console.warn('[AnnouncementPopup] count sync error:', err);
      }
    })();

    // 通知其他元件 (鈴鐺下拉 / 後台列表) 重新讀取
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
    }
  }, [open, current, user, clientId]);

  /**
   * 關閉 dialog。
   *
   * 這裡是「不再顯示此通告」唯一的生效點:
   * - checkbox 勾選 → 把「當前這則公告」寫入使用者的隱藏清單,
   *   下次進入主頁就不再自動彈出這一則 (其他公告照樣彈)。
   * - checkbox 沒勾 → 什麼都不存, 下次進入主頁照樣彈出。
   *
   * 注意: 只作用於「當前顯示的那一則」, 不是整批。
   */
  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next) {
      // 關閉時: 若勾選了「不再顯示此通告」, 記錄當前這則公告
      if (dontShowAgain && current && user) {
        STORAGE.announcementDismiss.dismiss(user.id, clientId, current.id);
        // 讓「已隱藏通告」清單 (設定頁) 即時更新
        window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
      }
      // 清掉「本次開啟已計數」記錄, 下次開啟可重新計數
      countedIdsRef.current.clear();
      // 重設 checkbox — 下次開 dialog 預設為未勾選
      setDontShowAgain(false);
    }
    setOpen(next);
    if (!next) {
      load();
    }
  }, [dontShowAgain, current, user, clientId, load]);

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
  const showDialog = open && !!current;

  return (
    <Dialog open={showDialog} onOpenChange={handleOpenChange}>
      {/* 專屬淡入淡出動畫 (方案 B: 只影響公告彈窗)
          - .ann-popup-content / .ann-popup-overlay 用「屬性選擇器」而非
            Tailwind 的 data-[state=open]: variant, 因為後者對手寫 CSS class
            不會產生規則 (動畫會完全失效)。細節見 globals.css。 */}
      <DialogContent
        className="sm:max-w-md ann-popup-content"
        overlayClassName="ann-popup-overlay"
      >
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
                      {formatDate(current.startDate)}
                      {current.endDate && current.endDate !== current.startDate
                        ? ` ~ ${formatDate(current.endDate)}`
                        : ''}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90 max-h-[60vh] overflow-y-auto -mx-1 px-1">
                {current.content}
              </div>

              <DialogFooter className="flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:space-x-0">
                {/* 左側: 「不再顯示此通告」checkbox
                    只影響「當前這一則公告」, 不影響其他公告, 也不影響鈴鐺下拉。
                    勾選後按「知道了」/ 關閉 / ESC 即生效。 */}
                <label
                  htmlFor="announcement-dont-show-again"
                  className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <input
                    id="announcement-dont-show-again"
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="w-4 h-4 rounded border-input accent-primary cursor-pointer"
                  />
                  <span>不再顯示此通告</span>
                </label>
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
                    onClick={() => handleOpenChange(false)}
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

/**
 * 從外部打開「特定一則」公告 (用 id 定位)。
 *
 * 為什麼需要 id 版本:
 * - dropdown 的清單是 getActive() (所有生效中公告)
 * - popup 的清單可能是 getAutoPopupList() (自動彈窗時排除已隱藏的)
 * - 兩者內容可能不同 → 用 index 會開到錯的公告。用 id 定位最安全。
 */
export function triggerAnnouncementPopupById(announcementId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPEN_EVENT, { detail: { id: announcementId } })
  );
}