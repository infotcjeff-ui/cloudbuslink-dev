/**
 * i18next initialization for CloudBusLink SideMenu + future global usage.
 *
 * Strategy:
 *  - Lightweight client-side bundle only (no SSR message wiring needed for menu).
 *  - Default to zh-HK (project's primary language) and lazy-detect from <html lang>.
 *  - Persistence: localStorage `cbl.locale` overrides browser setting.
 *  - We expose ready-to-use `useTranslation()` hook via react-i18next.
 */
'use client';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhHK from './locales/zh-HK.json';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

export type SupportedLocale = 'zh-HK' | 'zh-CN' | 'en';
const STORAGE_KEY = 'cbl.locale';
const SUPPORTED: SupportedLocale[] = ['zh-HK', 'zh-CN', 'en'];

function detectInitialLocale(): SupportedLocale {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED as string[]).includes(saved)) return saved as SupportedLocale;
  }
  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement.lang;
    if (htmlLang.startsWith('zh')) {
      // 繁中優先 (zh-HK / zh-TW), 其他中文 fallback 到 zh-CN
      if (htmlLang === 'zh-HK' || htmlLang === 'zh-TW') return 'zh-HK';
      return 'zh-CN';
    }
    if (htmlLang.startsWith('en')) return 'en';
  }
  return 'zh-HK';
}

let initialized = false;

export function ensureI18n() {
  if (initialized) return i18next;
  initialized = true;
  i18next
    .use(initReactI18next)
    .init({
      lng: detectInitialLocale(),
      fallbackLng: 'zh-HK',
      supportedLngs: SUPPORTED,
      ns: ['sideMenu'],
      defaultNS: 'sideMenu',
      resources: {
        'zh-HK': { sideMenu: zhHK.sideMenu },
        'zh-CN': { sideMenu: zhCN.sideMenu },
        en: { sideMenu: en.sideMenu },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  return i18next;
}

export function changeLocale(loc: SupportedLocale) {
  if (!SUPPORTED.includes(loc)) return;
  i18next.changeLanguage(loc);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, loc);
    document.documentElement.lang = loc;
  }
}

export function getCurrentLocale(): SupportedLocale {
  return (i18next.language as SupportedLocale) || 'zh-HK';
}

export const SUPPORTED_LOCALES = SUPPORTED;
