'use client';

/**
 * AdminShell — 共用的 PC 後台 Shell (header + 巢狀 sidebar + content 區)
 *
 * 為什麼抽出來:
 *   /cbl-admin-setting 與 /system-admin-setting 是兩個獨立的後台 console,
 *   但外殼 (header / 摺疊 sidebar / 巢狀選單 / dark mode / HK 時間 /
 *   motion 進場 / ToastProvider) 完全一樣。抽成共用元件後:
 *   - 改外殼只需改一個檔
 *   - 兩邊的 UI/UX 天然保持一致 (不會各改各的走樣)
 *
 * 與 app/(main)/layout.tsx 的關係:
 *   這個 Shell 會自帶完整 header + 自己的捲動容器, 所以 (main) layout
 *   必須在 /cbl-admin-setting/* 與 /system-admin-setting/* 路徑上
 *   隱藏自己的 header + bottom nav, 並且「直接渲染 children」
 *   (不要再包一層 AnimatePresence + overflow-y-auto, 否則會產生
 *    雙重捲動容器 + 雙重進場動畫 → ghost scrolling)。
 *
 * hover: 使用政策:
 *   本 Shell 只在 PC 後台情境使用, 允許 hover: 變體 (與 /cbl-admin-setting
 *   現況一致)。其他頁面 (手機版) 仍遵守 .cursor/rules/bus-app.mdc
 *   「只用 active:」的規定。
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown, ChevronLeft, ChevronRight,
  Search, Moon, Sun, Clock, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/hooks';
import { ToastProvider } from '@/components/ui/toast';

/* ------------------------------------------------------------------ */
/*  型別                                                              */
/* ------------------------------------------------------------------ */

/**
 * 左側選單項目 — 支援巢狀結構 (parent + 可選 children)
 *
 * 範例:
 *   - 班次 (/cbl-admin-setting/schedule) → 子頁: 校巴, 路線, 司機
 */
export type AdminTabItem = {
  id: string;
  label: string;
  path: string;        // 完整路徑 (用於高亮判斷)
  icon: any;
  children?: AdminTabItem[];  // 巢狀子選單
};

export type AdminShellProps = {
  children: React.ReactNode;
  /** header 左側的標題 */
  title: string;
  /** 左側選單項目 */
  tabs: AdminTabItem[];
  /** header 返回鍵的目標路徑 */
  backHref?: string;
  /** header 返回鍵的 aria-label / title */
  backLabel?: string;
  /** sidebar 底部版本文字 (不給則不顯示) */
  footerText?: string;
  /** 內容區的 key — 用來觸發 motion 進場動畫; 不給則用 active tab id */
  contentKey?: string;
  /** header 右側的額外內容 (例: 學年切換器) */
  headerExtra?: React.ReactNode;
};

/* ------------------------------------------------------------------ */
/*  主元件                                                            */
/* ------------------------------------------------------------------ */

export function AdminShell({
  children,
  title,
  tabs,
  backHref = '/settings',
  backLabel = '返回',
  footerText = 'CloudBusLink v1.0.0',
  contentKey,
  headerExtra,
}: AdminShellProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [hkTime, setHkTime] = useState('');
  // 紀錄哪些群組 (parent with children) 是展開的; 若當前 pathname 在群組內, 自動展開
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 套用 dark class 到 <html>, 這樣 (main)/layout.tsx 中的 liquid-glass header
  // 跟所有用 CSS variable (bg-background / text-foreground) 的元素都會跟著切換。
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [darkMode]);

  // 香港時間 (UTC+8) — 防止 SSR/CSR hydration mismatch, 先在 client mount 後才更新
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      const formatted = now.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Hong_Kong',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setHkTime(formatted);
    };
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);

  // 判斷當前 active item
  // - 直接比對: pathname === tab.path (top-level)
  // - 巢狀比對: pathname 以 parent.path + '/' 開頭, 找對應 child
  // - 找不到時 fallback 到第一個 (概覽)
  //
  // 注意: 當 pathname 命中「有 children 的 parent」(例如 /cbl-admin-setting/bus),
  // 要回傳 { item: t, parentId: t.id }, 這樣 useEffect 才會自動展開群組,
  // 使用者才能在 landing 頁直接看到「路線」「司機」子選單。
  const findActive = (): { item: AdminTabItem; parentId?: string } => {
    for (const t of tabs) {
      if (t.path === pathname) {
        // 命中 parent 自身: 如果它有 children, 標記成自己的 parent
        // (activeParentId 設成自己, 表示「自己就是 active parent, 群組應展開」)
        if (t.children?.length) {
          return { item: t, parentId: t.id };
        }
        return { item: t };
      }
      if (t.children) {
        const child = t.children.find((c) => c.path === pathname);
        if (child) return { item: child, parentId: t.id };
      }
    }
    return { item: tabs[0] };
  };
  const { item: activeItem, parentId: activeParentId } = findActive();

  // 自動展開 active parent group (例如在 /bus/trips 或 /bus 自動展開 校巴)
  // 注意: 切換到另一個 group 或 top-level 頁時, 要清掉舊的展開狀態,
  // 否則使用者從 /bus/trips 切到 /students 時 校巴 仍會保持展開。
  useEffect(() => {
    if (activeParentId) {
      setExpandedGroups(new Set([activeParentId]));
    } else {
      setExpandedGroups(new Set());
    }
  }, [activeParentId]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={cn('min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col transition-all duration-300', darkMode && 'dark')}>
      {/* Header
        z-30 (高於內容區 tab / sticky th 的 z-0~z-10, 低於 overlay 的 z-[55] 與 dialog 的 z-[60+]):
        popup 打開時, 遮罩可正確蓋住 header + tab;
        捲動時 tab / 表頭不會蓋住 header。
        ⚠️ 不要降回 z-0 — FilterTabGroup 按鈕內部有 z-index, z-0 header 會被 tab 蓋住。 */}
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </Link>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 學年切換器 (學年化後, 後台的所有資料都依學年隔離)
              ⚠️ 這是 optional slot — /system-admin-setting 是平台層,
                  沒有「學年」的概念, 所以由呼叫端決定要不要傳。
                  AdminShell 是共用元件, 所以用 ReactNode 而不是在裡面
                  直接 import /cbl-admin-setting 的元件 (會造成跨層相依)。 */}
          {headerExtra}

          {/* Search */}
          <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋..."
              className="bg-transparent border-none outline-none text-sm text-slate-600 dark:text-slate-200 w-40"
            />
            <span className="text-xs text-slate-400 border border-slate-300 dark:border-slate-600 px-1 rounded">/</span>
          </div>

          {/* 香港時間 */}
          <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 px-2" suppressHydrationWarning>
            <Clock className="w-4 h-4" />
            <span className="font-mono tabular-nums">{hkTime}</span>
          </div>

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={darkMode ? '切換到亮色' : '切換到暗色'}
          >
            {darkMode ? <Sun className="w-5 h-5 text-slate-300" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>

          {/* User Avatar */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name.charAt(0)}
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 hidden lg:block">{user.name}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            'bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex-shrink-0 transition-all duration-300 flex flex-col',
            sidebarCollapsed ? 'w-16' : 'w-56 lg:w-64'
          )}
        >
          {/* Sidebar Toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors self-end"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Navigation — 每個 item 都是 <Link>，有自己的 path; 巢狀群組可展開 */}
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            <div className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeItem.id === tab.id;
                const hasChildren = !!tab.children?.length;
                const isExpanded = expandedGroups.has(tab.id);
                // parent 自身算 active 若 activeItem 屬於這個 group
                const groupActive = isActive || activeParentId === tab.id;

                return (
                  <div key={tab.id}>
                    {/* Parent row: 有 children 時點擊切換展開; 沒 children 時整個都是 link */}
                    {hasChildren ? (
                      <div
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors text-left',
                          groupActive
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        )}
                      >
                        <Link
                          href={tab.path}
                          className="flex items-center gap-3 flex-1 min-w-0"
                          title={tab.label}
                        >
                          <Icon className={cn('w-5 h-5 flex-shrink-0', groupActive ? 'text-blue-600 dark:text-blue-400' : '')} />
                          {!sidebarCollapsed && (
                            <span className="text-sm font-medium flex-1 truncate">{tab.label}</span>
                          )}
                        </Link>
                        {!sidebarCollapsed && (
                          <button
                            type="button"
                            onClick={() => toggleGroup(tab.id)}
                            className="p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700"
                            aria-label={isExpanded ? '收合' : '展開'}
                          >
                            <ChevronDown
                              className={cn(
                                'w-4 h-4 transition-transform',
                                isExpanded ? 'rotate-180' : ''
                              )}
                            />
                          </button>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={tab.path}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        )}
                      >
                        <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-blue-600 dark:text-blue-400' : '')} />
                        {!sidebarCollapsed && (
                          <span className="text-sm font-medium flex-1">{tab.label}</span>
                        )}
                      </Link>
                    )}

                    {/* Children (巢狀子選單) — 展開時顯示, 並加上左邊界縮排 */}
                    {hasChildren && isExpanded && !sidebarCollapsed && (
                      <div className="mt-1 ml-3 pl-3 border-l border-slate-200 dark:border-slate-700 space-y-1">
                        {tab.children!.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive = activeItem.id === child.id;
                          return (
                            <Link
                              key={child.id}
                              href={child.path}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                                childActive
                                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                              )}
                            >
                              <ChildIcon className={cn('w-4 h-4 flex-shrink-0', childActive ? 'text-blue-600 dark:text-blue-400' : '')} />
                              <span className="text-sm flex-1">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          {/* Sidebar Footer */}
          {!sidebarCollapsed && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 text-center">{footerText}</p>
            </div>
          )}
        </aside>

        {/* Content Area */}
        {/* 注意: overflow-hidden → isolation:isolate
            overflow:hidden 會建立 clip-path, 讓 fixed overlay 無法延伸全屏
            isolation:isolate 只建立 stacking context (不改變 clip), overlay 即可覆蓋全屏 */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 isolate">
          <motion.div
            key={contentKey ?? activeItem.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ToastProvider>
              {children}
            </ToastProvider>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export default AdminShell;
