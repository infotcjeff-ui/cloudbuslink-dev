'use client';

/**
 * AcademicYearProvider — 學年範圍的單一來源 (Single Source of Truth)
 *
 * 為什麼需要這一層:
 *   學年化之後, 每個後台頁面都要知道「現在在看哪一個學年」,
 *   而且這個值必須在「頁面之間」保持一致 (在學生頁切到 27-28,
 *   換到路線頁也該是 27-28, 而不是各自為政)。
 *
 *   放在 Context 而不是各自 useState 的理由:
 *     1. 跨頁一致 — 切換一次, 全後台跟著切
 *     2. 唯讀判定集中 — 「目前看的學年是封存的嗎?」只有一個答案來源
 *     3. 未來加「學年轉換精靈」時, 轉換完成後要通知所有頁面重載
 *        → 有 Context 才有地方 dispatch refresh 事件
 *
 * 資料流:
 *   cbl_academic_years (Supabase, 權威)
 *     → syncFromSupabase / refreshCloud 拉回本機
 *       → academicYearStorage (localStorage 快取)
 *         → 本 Provider 讀取 + 監聽 refresh 事件
 *           → useAcademicYear() (所有頁面消費)
 *
 * ⚠️ 這個 Provider 只能放在 client component 裡 (localStorage + event listener)。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { STORAGE, resolveClientId } from '@/lib/storage';
import {
  DEFAULT_ACADEMIC_YEAR,
  isReadOnlyYear,
  getReadOnlyMessage,
  type AcademicYear,
} from '@/lib/academic-year';

/* -------------------------------------------------------------------------- */
/*  Context 型別                                                               */
/* -------------------------------------------------------------------------- */

export interface AcademicYearContextValue {
  /** 目前正在檢視的學年代碼 (4 位, 例 '2627') */
  selectedYear: string;
  /** 目前檢視的學年登錄 (可能是 null — 沒有登錄資料時) */
  selectedYearRecord: AcademicYear | null;
  /** 該 client 的所有學年 (新到舊) */
  years: AcademicYear[];
  /** 目前檢視的學年是否唯讀 (封存或非現行) */
  isReadOnly: boolean;
  /** 唯讀的原因說明 (給 UI 的 tooltip / banner) */
  readOnlyMessage: { label: string; hint: string };
  /** 目標 client id */
  clientId: string;
  /** 切換學年 */
  setSelectedYear: (year: string) => void;
  /** 重新從雲端拉學年登錄 */
  refresh: () => Promise<void>;
  /** 是否還在載入中 (避免 UI 在閃爍) */
  loading: boolean;
}

const AcademicYearContext = createContext<AcademicYearContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

/** 記住每個 client 上次選的學年 (讓切換頁面後不會跳回預設) */
const SELECTED_YEAR_KEY = 'cbl_selected_academic_year';

function readSelectedYear(clientId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SELECTED_YEAR_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[clientId] || null;
  } catch {
    return null;
  }
}

function writeSelectedYear(clientId: string, year: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SELECTED_YEAR_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[clientId] = year;
    localStorage.setItem(SELECTED_YEAR_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * 讀出「某個 client 上次選的學年」(沒有記錄則回 null)。
 *
 * ⚠️ 為什麼要 export?
 *   /settings/announcements 這個頁面**不在** <AcademicYearProvider> 內
 *   (Provider 只包住 /cbl-admin-setting), 但它建立公告時也需要知道
 *   「管理員目前正在檢視哪一個學年」—— 否則從這裡建立的公告會被蓋上
 *   預設學年 '2627', 然後在後台 (看 27-28) 的學年篩選裡「消失」。
 *   → 這裡提供一個不依賴 React context 的讀取入口, 兩邊共用同一份來源。
 */
export function getPersistedSelectedYear(clientId: string): string | null {
  if (!clientId) return null;
  return readSelectedYear(clientId);
}

export function AcademicYearProvider({
  children,
  clientId: clientIdProp,
}: {
  children: React.ReactNode;
  clientId?: string;
}) {
  const [clientId, setClientId] = useState(clientIdProp || '');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYearState] = useState<string>(DEFAULT_ACADEMIC_YEAR);
  const [loading, setLoading] = useState(true);

  // 解析目標 client (跨機構角色沒有自己的 clientId → 需要 fallback)
  useEffect(() => {
    if (clientIdProp) {
      setClientId(clientIdProp);
      return;
    }
    setClientId(resolveClientId());
  }, [clientIdProp]);

  /** 從本機快取讀出該 client 的學年清單 + 選定學年 */
  const loadFromCache = useCallback(() => {
    if (!clientId) {
      setYears([]);
      setSelectedYearState(DEFAULT_ACADEMIC_YEAR);
      return;
    }
    const list = STORAGE.academicYears.getByClient(clientId);
    setYears(list);

    // 選定學年: 記憶值 → 現行學年 → 第一筆 → 站台設定
    const remembered = readSelectedYear(clientId);
    const current = list.find((y) => y.isCurrent);
    const isValid = (code: string | null | undefined): code is string =>
      !!code && list.some((y) => y.academicYear === code);

    let next = DEFAULT_ACADEMIC_YEAR;
    if (isValid(remembered)) {
      next = remembered;
    } else if (current) {
      next = current.academicYear;
    } else if (list.length > 0) {
      next = list[0].academicYear;
    } else {
      // 還沒有學年登錄 → 用站台設定 (相容舊資料)
      const settings = STORAGE.settings.getByClient(clientId);
      next = settings.academicYear || DEFAULT_ACADEMIC_YEAR;
    }
    setSelectedYearState(next);
  }, [clientId]);

  /** 從雲端重新拉學年登錄 */
  const refresh = useCallback(async () => {
    try {
      const { supabaseAcademicYears } = await import('@/lib/supabase-academic-years');
      const res = await supabaseAcademicYears.getAll();
      if (res.data && res.data.length > 0) {
        STORAGE.academicYears.mergeAll(res.data);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cbl-academic-years-refresh'));
        }
      }
    } catch (e) {
      console.warn('[AcademicYear] refresh failed:', e);
    } finally {
      loadFromCache();
    }
  }, [loadFromCache]);

  // 初始載入
  useEffect(() => {
    loadFromCache();
    setLoading(false);
    // ⚠️ 背景從雲端拉一次 ——
    //    全域 sync (lib/supabase-data.ts) 會把 cbl_academic_years 寫進本機快取,
    //    但那個 sync 不一定已經跑過 (例如首次開啟頁面、或 sync 失敗)。
    //    → 這裡主動拉一次, 確保切換器拿得到學年清單。
    void refresh();
  }, [loadFromCache, refresh]);

  // 監聽學年登錄的變更 (從雲端同步回來 / 學年轉換完成)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => loadFromCache();
    window.addEventListener('cbl-academic-years-refresh', handler);
    return () => window.removeEventListener('cbl-academic-years-refresh', handler);
  }, [loadFromCache]);

  const setSelectedYear = useCallback(
    (year: string) => {
      setSelectedYearState(year);
      if (clientId) writeSelectedYear(clientId, year);
    },
    [clientId],
  );

  const selectedYearRecord = useMemo(
    () => years.find((y) => y.academicYear === selectedYear) || null,
    [years, selectedYear],
  );

  const isReadOnly = useMemo(
    () => isReadOnlyYear(selectedYearRecord),
    [selectedYearRecord],
  );

  const readOnlyMessage = useMemo(
    () => getReadOnlyMessage(selectedYearRecord),
    [selectedYearRecord],
  );

  const value = useMemo<AcademicYearContextValue>(
    () => ({
      selectedYear,
      selectedYearRecord,
      years,
      isReadOnly,
      readOnlyMessage,
      clientId,
      setSelectedYear,
      refresh,
      loading,
    }),
    [
      selectedYear,
      selectedYearRecord,
      years,
      isReadOnly,
      readOnlyMessage,
      clientId,
      setSelectedYear,
      refresh,
      loading,
    ],
  );

  return (
    <AcademicYearContext.Provider value={value}>
      {children}
    </AcademicYearContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 取得學年範圍。
 *
 * ⚠️ 必須在 <AcademicYearProvider> 內使用。
 *    沒有 Provider 時會拋錯 — 這是刻意的: 靜默 fallback 會讓頁面在
 *    「有 Provider」與「沒 Provider」時行為不同, 這種 bug 很難查。
 */
export function useAcademicYear(): AcademicYearContextValue {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) {
    throw new Error(
      'useAcademicYear 必須在 <AcademicYearProvider> 內使用 (見 app/(main)/cbl-admin-setting/layout.tsx)',
    );
  }
  return ctx;
}

export default AcademicYearProvider;
