'use client';

/**
 * SideMenu — Refined Glassmorphism side panel for the CloudBusLink header burger button.
 *
 * Replaces the previous bottom-sheet Drawer with a right-anchored 2026 panel.
 * Features:
 *  - Avatar + name + role + email header (uses user.photo if available)
 *  - Built-in fuzzy search across all visible links
 *  - Grouped sections (Primary / Admin / Settings) with i18n labels
 *  - Active-state indicator (left gradient bar + accent fill)
 *  - Language switcher (zh-HK / zh-CN / en) persisted to localStorage
 *  - Logout footer
 *  - Full a11y: role, aria-label, focus visible, ESC, click-outside
 *  - Reduced-motion & reduced-transparency fallbacks via CSS + Framer useReducedMotion
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Home,
  Bus,
  Settings,
  Megaphone,
  UserCog,
  Truck,
  ClipboardList,
  Search,
  LogOut,
  ChevronRight,
  Languages,
  IdCard,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { SidePanel } from '@/components/ui/side-panel';
import { useAuth, useSettings } from '@/lib/hooks';
import { cn, roleLabel } from '@/lib/utils';
import { ensureI18n, changeLocale, getCurrentLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

ensureI18n();

interface SideMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MenuEntry {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true the entry is gated behind role checks */
  adminOnly?: boolean;
  /** When true the entry is hidden entirely for portal users */
  mainOnly?: boolean;
}

interface MenuGroup {
  key: 'primary' | 'admin' | 'settings';
  labelKey: string;
  items: MenuEntry[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    key: 'primary',
    labelKey: 'primary.label',
    items: [
      { href: '/', labelKey: 'primary.home', icon: Home },
      { href: '/trips', labelKey: 'primary.trips', icon: Bus },
    ],
  },
  {
    key: 'admin',
    labelKey: 'admin.label',
    items: [
      { href: '/settings/students', labelKey: 'admin.students', icon: GraduationCap, adminOnly: true },
      { href: '/settings/parents', labelKey: 'admin.parents', icon: Users, adminOnly: true },
      { href: '/settings/buses', labelKey: 'admin.buses', icon: Truck, adminOnly: true },
      { href: '/settings/drivers', labelKey: 'admin.drivers', icon: UserCog, adminOnly: true },
      { href: '/settings/nannies', labelKey: 'admin.nannies', icon: ShieldCheck, adminOnly: true },
      { href: '/settings/reports', labelKey: 'admin.reports', icon: ClipboardList, adminOnly: true },
      { href: '/settings/announcements', labelKey: 'admin.announcements', icon: Megaphone, adminOnly: true },
    ],
  },
  {
    key: 'settings',
    labelKey: 'settings.label',
    items: [
      { href: '/settings', labelKey: 'primary.settings', icon: Settings, mainOnly: true },
      { href: '/settings/profile', labelKey: 'settings.profile', icon: IdCard, mainOnly: true },
      { href: '/settings/site', labelKey: 'settings.site', icon: Sparkles, mainOnly: true },
    ],
  },
];

const ROLE_RING: Record<string, string> = {
  super_admin: 'ring-violet-400/60',
  client: 'ring-sky-400/60',
  parent: 'ring-pink-400/60',
  nanny: 'ring-emerald-400/60',
};

export function SideMenu({ open, onOpenChange }: SideMenuProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const { t } = useTranslation('sideMenu');
  // Stable: don't call useReducedMotion() here — it returns null on first
  // render, which would change motion props reference and re-trigger the
  // entrance animation every time the menu reopens. Reduced-motion is
  // enforced globally via globals.css.
  const reduceMotion = false;

  const [query, setQuery] = React.useState('');
  const [currentLocale, setCurrentLocale] = React.useState<SupportedLocale>('zh-HK');

  // Read the active locale once on mount.
  //
  // This used to depend on `open`, so closing the menu re-ran the effect and
  // called setCurrentLocale(...) — a state update DURING the exit animation.
  // That re-render rebuilt SidePanel's variants and snapped the panel back to
  // its opened state for one frame (the "flash" after slide-out).
  // The locale only changes via handleLocaleChange(), which sets it directly.
  React.useEffect(() => {
    setCurrentLocale(getCurrentLocale());
  }, []);

  const isPortalUser = user?.role === 'parent' || user?.role === 'nanny';
  const primaryColor = settings?.primaryColor || '#3b82f6';
  const ringClass = ROLE_RING[user?.role ?? ''] ?? 'ring-primary/60';

  // Filter entries by role then by query.
  const filteredGroups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return MENU_GROUPS.map((group) => {
      let items = group.items.filter((it) => {
        if (it.adminOnly && isPortalUser) return false;
        if (it.mainOnly && isPortalUser) return false;
        // Settings group only visible to non-portal users
        if (group.key === 'settings' && isPortalUser) return false;
        return true;
      });
      if (q) {
        items = items.filter((it) => {
          const label = t(it.labelKey).toLowerCase();
          return label.includes(q) || it.href.toLowerCase().includes(q);
        });
      }
      return { ...group, items };
    }).filter((g) => g.items.length > 0);
  }, [query, t, isPortalUser]);

  const totalMatches = filteredGroups.reduce((acc, g) => acc + g.items.length, 0);
  const showEmpty = query.trim().length > 0 && totalMatches === 0;

  // 選中最長匹配的 href 作為 active 項目。
  //
  // 為什麼需要: 設定頁底下的模組 (/settings/students, /settings/buses...)
  // 是 /settings 的子路徑。若各自獨立判斷, /settings 與 /settings/students
  // 會同時命中, 導致兩個項目一起高亮。取最長匹配後, 只有最精確的那一項會亮。
  const activeHref = React.useMemo(() => {
    const all = filteredGroups.flatMap((g) => g.items);
    const matches = all.filter(
      (it) =>
        pathname === it.href ||
        (it.href !== '/' && pathname.startsWith(it.href + '/'))
    );
    if (matches.length === 0) return null;
    // 最長者最具體; 同長度時保持宣告順序
    return matches.reduce((best, it) =>
      it.href.length > best.href.length ? it : best
    ).href;
  }, [filteredGroups, pathname]);

  const handleLink = () => onOpenChange(false);
  const handleLogout = () => {
    onOpenChange(false);
    logout();
  };

  const handleLocaleChange = (loc: SupportedLocale) => {
    changeLocale(loc);
    setCurrentLocale(loc);
    // Trigger a re-render of translated labels
    setQuery((q) => q); // no-op, just to nudge memo
  };

  // Stable variant objects: a new object identity on every render would make
    // Framer re-run the entrance stagger mid-close (items fading in again).
    const itemVariants = React.useMemo(
      () =>
        reduceMotion
          ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
          : {
              initial: { opacity: 0, x: 18 },
              animate: { opacity: 1, x: 0 },
            },
      [reduceMotion]
    );
    const itemTransition = React.useMemo(
      () =>
        reduceMotion
          ? { duration: 0.1 }
          : { type: 'spring' as const, stiffness: 380, damping: 28, mass: 0.8 },
      [reduceMotion]
    );

  // All hooks above this line run unconditionally, so the early return is safe.
  // (It used to sit above filteredGroups/itemVariants, which crashed on logout
  //  when the hook count changed between renders.)
  if (!user) return null;

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      size="compact"
      title={t('title')}
      description={t('title')}
    >
      <div className="flex flex-col h-full">
        {/* Header: avatar + name + email */}
        <div className="px-5 pt-6 pb-4 border-b border-white/40 dark:border-white/10">
          <div className="flex items-center gap-3 pr-12">
            <div
              className={cn(
                'h-12 w-12 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-white/40 overflow-hidden',
                'flex items-center justify-center text-white font-semibold text-base',
                'dark:ring-offset-black/40',
                ringClass
              )}
              style={!user.photo ? { backgroundColor: primaryColor } : undefined}
            >
              {user.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                user.name?.charAt(0) ?? '?'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {roleLabel(user.role)}
                {user.email ? ` · ${user.email}` : ''}
              </p>
            </div>
          </div>

          {/* Search input */}
          <div className="mt-4 relative">
            <label htmlFor="sideMenu-search" className="sr-only">
              {t('aria.search')}
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            />
            <input
              id="sideMenu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              className={cn(
                'w-full h-10 rounded-xl border border-white/50 bg-white/55 pl-9 pr-9 text-sm',
                'placeholder:text-muted-foreground text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/60 focus:bg-white/80',
                'dark:border-white/10 dark:bg-white/5 dark:focus:bg-white/10',
                'supports-[backdrop-filter]:backdrop-blur-md'
              )}
            />
            {query && (
              <button
                type="button"
                aria-label={t('aria.search')}
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Menu body (scrollable) */}
        <nav
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 py-4"
          aria-label={t('title')}
        >
          {showEmpty ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('searchEmpty', { query })}
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {filteredGroups.map((group, gi) => (
                <li key={group.key}>
                  <h3 className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {t(group.labelKey)}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item, ii) => {
                      const Icon = item.icon;
                      const active = activeHref === item.href;
                      return (
                        <motion.li
                          key={item.href}
                          initial={itemVariants.initial}
                          animate={itemVariants.animate}
                          transition={{ ...itemTransition, delay: reduceMotion ? 0 : (gi * 0.04 + ii * 0.025) }}
                        >
                          <Link
                            href={item.href}
                            onClick={handleLink}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                              'transition-colors duration-150',
                              'outline-none focus-visible:ring-2 focus-visible:ring-primary',
                              active
                                ? 'text-primary'
                                : 'text-foreground/80 hover:bg-white/50 hover:text-foreground dark:hover:bg-white/5'
                            )}
                          >
                            {/* Active state — vertical accent bar (2026 glassmorphism) */}
                            <span
                              aria-hidden
                              className={cn(
                                'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full transition-opacity',
                                active
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-30'
                              )}
                              style={{ backgroundColor: primaryColor }}
                            />
                            {/* Active state — subtle fill */}
                            {active && (
                              <span
                                aria-hidden
                                className="absolute inset-0 rounded-xl"
                                style={{ backgroundColor: `${primaryColor}1A` /* 10% alpha */ }}
                              />
                            )}
                            <Icon
                              className={cn(
                                'relative h-5 w-5 shrink-0',
                                active ? 'text-primary' : 'text-foreground/70 group-hover:text-foreground'
                              )}
                            />
                            <span className="relative truncate">{t(item.labelKey)}</span>
                            {active && (
                              <ChevronRight
                                aria-hidden
                                className="relative ml-auto h-4 w-4 text-primary"
                              />
                            )}
                          </Link>
                        </motion.li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* Footer: language switcher + logout */}
        <div className="border-t border-white/40 dark:border-white/10 px-3 py-3 space-y-2">
          {/* Language switcher */}
          <div className="rounded-xl bg-white/45 dark:bg-white/5 border border-white/50 dark:border-white/10 p-1 supports-[backdrop-filter]:backdrop-blur-md">
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Languages aria-hidden className="h-3.5 w-3.5" />
              <span>{t('aria.language')}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {SUPPORTED_LOCALES.map((loc) => {
                const active = currentLocale === loc;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => handleLocaleChange(loc)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active
                        ? 'bg-white text-primary shadow-sm dark:bg-white/10'
                        : 'text-foreground/70 hover:bg-white/60 dark:hover:bg-white/5'
                    )}
                  >
                    {loc === 'zh-HK' ? '繁體' : loc === 'zh-CN' ? '简体' : 'EN'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
              'text-destructive hover:bg-destructive/10 active:scale-[0.99]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
              'transition-colors'
            )}
          >
            <LogOut aria-hidden className="h-5 w-5" />
            <span>{t('footer.logout')}</span>
            <ChevronRight aria-hidden className="ml-auto h-4 w-4 opacity-60" />
          </button>
        </div>
      </div>
    </SidePanel>
  );
}

export default SideMenu;
