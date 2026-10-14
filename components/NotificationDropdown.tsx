'use client';

/**
 * NotificationDropdown — Bell-icon anchored dropdown listing all active
 * announcements for the current client.
 *
 * Why a dropdown instead of opening the popup directly?
 *  - 公告 (announcements) can be 多於一個 (system broadcasts, schedule changes,
 *    urgent notices...). A single-tap popup forces the user to scroll through
 *    every one (with "下一則" cycling). A dropdown lets the user pick which
 *    one they want to read first, matching common iOS notification tray UX.
 *  - 0 公告時不彈任何視窗, 保持安靜。
 *  - 1 公告時 dropdown 仍出現, 但只有一項可選 — 一致的 UI 行為, 不特例。
 *
 * Position: anchored under the bell button (right side of header). Uses
 * `position: fixed` + measured coords from the anchor ref so it survives
 * parent transforms / overflow:hidden. Style: solid white background
 * (no liquid-glass) for max readability against any header tone.
 * Dismissed on:
 *  - Clicking outside (mousedown on document)
 *  - Pressing Escape
 *  - Selecting an item (parent calls onSelect → we close + open popup)
 *  - Trigger re-click (toggles)
 *  - 3 秒內無動作自動淡出 (用戶在 panel 內互動會重置計時)
 *
 * 紅色未讀徽章邏輯:
 *  - 計算方式: 該 client 的「active 公告數」扣除「用戶已讀 ID 集合」
 *  - 用戶第一次點開下拉時, 把所有當前 active 公告標記為已讀
 *    (視為「查看過」 — 不必真的每個都打開才算讀)
 *  - 之後有新公告 (storage 內出現新 ID) 會重新冒出紅點
 *  - 用戶切換 client 不影響其他 client 的已讀狀態 (key 內含 clientId)
 *
 * a11y:
 *  - Bell button is a real <button type="button"> with aria-label + aria-expanded
 *  - List is role="menu" with role="menuitem" children
 *  - ESC closes + returns focus to bell button
 */

import * as React from 'react';
import { Bell, Info, AlertTriangle, AlertCircle, Inbox } from 'lucide-react';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import type { Announcement } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NotificationDropdownProps {
  /**
   * Optional: render this bell icon as the trigger (so click target + counter
   * live together). If omitted the component is "controlled" — parent provides
   * its own trigger and toggles via `open` + `onOpenChange`.
   */
  className?: string;
}

function getTypeIcon(type: Announcement['type']) {
  if (type === 'urgent') return AlertCircle;
  if (type === 'warning') return AlertTriangle;
  return Info;
}

function getTypeColor(type: Announcement['type']) {
  if (type === 'urgent') return 'text-destructive';
  if (type === 'warning') return 'text-warning';
  return 'text-primary';
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diffMs < min) return '剛剛';
  if (diffMs < hr) return `${Math.floor(diffMs / min)} 分鐘前`;
  if (diffMs < day) return `${Math.floor(diffMs / hr)} 小時前`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} 天前`;
  return d.toLocaleDateString('zh-TW');
}

export function NotificationDropdown({ className }: NotificationDropdownProps) {
  const { user } = useAuth();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const [open, setOpen] = React.useState(false);
  // 淡出動畫期間為 true。淡出動畫結束才真正 setOpen(false) 卸載節點。
  const [closing, setClosing] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; right: number }>({
    top: 0,
    right: 16,
  });
  const [items, setItems] = React.useState<Announcement[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  // 已讀公告 ID 集合 (來自 localStorage)。只算這個跟 active 公告的差集就是紅點數。
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set());

  // 自動關閉 timer (3 秒)
  const AUTO_CLOSE_MS = 3000;
  const autoCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 統一的「開始淡出」流程: 所有需要關閉下拉的地方都走這條,
  // 避免有的路徑直接 setOpen(false) 跳過淡出動畫。
  const startClose = React.useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setClosing(true);
  }, []);

  // 重置 3 秒自動關閉計時器 (用戶在 panel 內有互動時呼叫)
  const resetAutoClose = React.useCallback(() => {
    if (!open) return;
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      startClose();
    }, AUTO_CLOSE_MS);
  }, [open, startClose]);

  // Load active announcements + read-state for current user.
  // Re-load on mount and on auth change so login/logout reflects correct counts.
  const load = React.useCallback(() => {
    if (!user) {
      setItems([]);
      setReadIds(new Set());
      return;
    }
    const clientId = user.clientId || '';
    const all = STORAGE.announcements.getActive(clientId);
    // 只顯示「還沒達到顯示次數上限」的公告
    const eligible = all.filter(a => a.currentCount < a.displayCount);
    // Newest first is more useful than createdAt order, but storage order is fine
    // for now — sort by startDate DESC so the most recent broadcasts are on top.
    const sorted = [...eligible].sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
    setItems(sorted);

    const read = STORAGE.announcementReads.getRead(user.id, clientId);
    setReadIds(read);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  // 監聽公告資料更新事件 (來自 cbl-admin-setting/announcements 頁面)
  React.useEffect(() => {
    const onRefresh = () => {
      load();
    };
    window.addEventListener('cbl-announcements-refresh', onRefresh);
    return () => window.removeEventListener('cbl-announcements-refresh', onRefresh);
  }, [load]);

  // 未讀數 = active 公告數 − 已讀數
  // (實務上 readIds 是 items 的子集, 所以兩者都在時直接用 items 過濾即可)
  const unreadCount = React.useMemo(() => {
    if (!user) return 0;
    let n = 0;
    for (const a of items) {
      if (!readIds.has(a.id)) n += 1;
    }
    return n;
  }, [items, readIds, user]);

  // 開啟下拉時把所有當前 active 公告標記為已讀。
  // 設計: 「看過下拉列表」 = 「已查看」 — 不必真的打開每個 dialog。
  // 只在「正展開」時做一次 (closing 階段不再標記, 避免重複 set state)。
  const markedReadRef = React.useRef(false);
  React.useEffect(() => {
    if (!open || closing) {
      // 下拉不在「正展開」狀態 → 重置旗標, 下次再打開時可重新觸發
      markedReadRef.current = false;
      return;
    }
    if (markedReadRef.current) return;
    if (!user) return;
    if (items.length === 0) return;

    // 計算這次新加入已讀的 ID (避免 set state 沒變化時白白 re-render)
    const fresh = items.filter(a => !readIds.has(a.id)).map(a => a.id);
    if (fresh.length === 0) {
      // 全部都已是已讀, 旗標設好即可
      markedReadRef.current = true;
      return;
    }
    const clientId = user.clientId || '';
    STORAGE.announcementReads.markRead(user.id, clientId, fresh);
    // 同步本地 state, 立刻讓徽章消失 (不等下次 load)
    setReadIds(prev => {
      const next = new Set(prev);
      fresh.forEach(id => next.add(id));
      return next;
    });
    markedReadRef.current = true;
  }, [open, closing, items, readIds, user]);

  // Compute anchored position from the trigger's bounding rect.
  const measure = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,    // 8px gap below the bell
      right: window.innerWidth - r.right, // align right edge of panel with right edge of bell
    });
  }, []);

  // Open: measure + load + listen for scroll/resize so position stays accurate.
  // 同時啟動 3 秒自動關閉計時器 (由 resetAutoClose 管理)。
  React.useEffect(() => {
    if (!open) return;
    measure();
    load();
    resetAutoClose();

    const onScrollOrResize = () => measure();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, measure, load, resetAutoClose]);

  // Click-outside to close (走 startClose, 觸發淡出動畫).
  React.useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      startClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, startClose]);

  // Escape to close + return focus to trigger.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        startClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, startClose]);

  const triggerAnnouncement = React.useCallback(async (index: number) => {
    setSelectedIndex(index);
    // 直接走 startClose, 讓 dropdown 淡出; 動畫結束後再打開 dialog
    // (避免 dropdown 與 dialog 同時存在的視覺重疊)
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setClosing(true);
    // 動畫時間 (180ms) 後再開 dialog — 確保視覺上 dropdown 完全消失才進場
    setTimeout(async () => {
      const mod = await import('@/components/AnnouncementPopup');
      mod.triggerAnnouncementPopup(index);
    }, 180);
  }, []);

  // 下拉內要列出的「active 公告總數」(給 header 文字用, 例如 "3 則")
  // 注意: 紅點用 `unreadCount` (扣除已讀); 這裡是下拉內共有幾則
  const totalActive = items.length;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            // Currently shown (or mid-leave): user wants to dismiss → start fade-out.
            startClose();
          } else {
            // Re-open: cancel any in-flight close, then show fresh.
            setClosing(false);
            setOpen(true);
          }
        }}
        aria-label="通知"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'relative w-9 h-9 rounded-full flex items-center justify-center',
          'active:bg-muted active:scale-95 transition-transform',
          className
        )}
      >
        <Bell className="w-5 h-5 text-foreground/80" />
        {/*
          紅色未讀徽章:
          - unreadCount === 0 直接不渲染
          - 下拉「正展開」期間 (open && !closing) 隱藏 — 用戶正在看, 不需重複提示
          - 關閉動畫期間 (closing) 視為已關閉, 重新顯示
        */}
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} 則未讀通知`}
            aria-hidden={open && !closing}
            className={cn(
              'absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full',
              'flex items-center justify-center',
              'text-[10px] font-semibold leading-none text-white',
              'bg-destructive shadow-sm',
              // 下拉打開中 → 隱藏徽章; 短 fade 過渡避免版面突跳
              (open && !closing) && 'opacity-0 scale-50',
              'transition-all duration-150'
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {(open || closing) && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="通知列表"
          onMouseEnter={resetAutoClose}
          onMouseMove={resetAutoClose}
          onFocus={resetAutoClose}
          onTouchStart={resetAutoClose}
          onAnimationEnd={(e) => {
            // 只在淡出動畫 (leave) 完成後卸載節點, 避免閃一下
            if (closing && e.animationName === 'notif-dropdown-fade-out') {
              setOpen(false);
              setClosing(false);
            }
          }}
          className={cn(
            'fixed z-50 w-[calc(100vw-1.5rem)] max-w-sm',
            // 純白底色, 不使用 liquid-glass 毛玻璃效果
            'bg-white border border-border rounded-2xl shadow-lg overflow-hidden',
            closing ? 'notif-dropdown-leave' : 'notif-dropdown-enter'
          )}
          style={{ top: pos.top, right: pos.right }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-11 border-b border-border/40">
            <span className="text-sm font-semibold">通知</span>
            <span className="text-xs text-muted-foreground">
              {totalActive > 0 ? `${totalActive} 則` : '無新通知'}
            </span>
          </div>

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
            {totalActive === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Inbox className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">目前沒有通知</p>
                <p className="text-xs text-muted-foreground mt-1">
                  新公告發布時會顯示在這裡
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {items.map((item, idx) => {
                  const Icon = getTypeIcon(item.type);
                  const color = getTypeColor(item.type);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => triggerAnnouncement(idx)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left',
                          'active:bg-muted/70 transition-colors'
                        )}
                      >
                        <div
                          className={cn(
                            'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                            item.type === 'urgent' && 'bg-destructive/10',
                            item.type === 'warning' && 'bg-warning/10',
                            item.type === 'info' && 'bg-primary/10'
                          )}
                        >
                          <Icon className={cn('w-4 h-4', color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold truncate">
                              {item.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground flex-shrink-0">
                              {formatRelative(item.startDate)}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/70 line-clamp-2 mt-0.5">
                            {item.content}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default NotificationDropdown;
