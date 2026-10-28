'use client';

// 共用的「重新整理」hook — 真・從雲端拉資料
//
//  為什麼需要這個 hook:
//    各個 console 的「重新整理」按鈕原本都只是 `dispatchEvent('cbl-xxx-refresh')`,
//    那只是「重讀一次 localStorage」, 沒有向 Supabase 拉任何東西。
//    → 雲端 (或另一台裝置) 改了資料, 按重新整理完全沒反應。
//
//  這個 hook 做的事:
//    1. 真的打 Supabase select (lib/cloud-refresh.ts)
//    2. 把結果安全地合併回 localStorage (保護「本機先寫、雲端後推」的資料)
//    3. dispatch cbl-*-refresh 事件 → 各 console 的 UI 立即重畫
//    4. 用 toast 回報結果 (新增/更新幾筆, 或失敗原因)
//
//  用法:
//    const { handleRefresh, isRefreshing } = useCloudRefresh({ only: ['buses'] });

import { useCallback, useMemo, useState } from 'react';
import { refreshCloud, describeRefresh } from '@/lib/cloud-refresh';
import { useToast } from '@/components/ui/toast';

export interface UseCloudRefreshOptions {
  /**
   * 只刷新指定的實體 (例如 ['buses', 'drivers'])
   * - 不給 → 全部刷新 (所有 console 共用同一份資料時最省事)
   */
  only?: string[];
  /**
   * 成功後要額外 dispatch 的事件
   * (cloud-refresh 已經 dispatch 全部事件, 這裡是給需要額外通知的情況)
   */
  extraEvents?: string[];
  /** 關閉 toast 回報 (預設 false) */
  silent?: boolean;
}

export interface UseCloudRefreshResult {
  handleRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

export function useCloudRefresh(options?: UseCloudRefreshOptions): UseCloudRefreshResult {
  const toast = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { only, extraEvents, silent } = options ?? {};

  // 把陣列轉成字串當作依賴 — 呼叫端通常寫 inline array
  // (例如 only: ['buses', 'drivers']), 每次 render 都是新參考,
  // 若直接放進 useCallback 的 deps 會讓 handleRefresh 每次 render 都重建。
  const onlyKey = only ? only.join(',') : '';
  const extraKey = extraEvents ? extraEvents.join(',') : '';

  const stableOnly = useMemo(
    () => (onlyKey ? onlyKey.split(',') : undefined),
    [onlyKey],
  );
  const stableExtra = useMemo(
    () => (extraKey ? extraKey.split(',') : undefined),
    [extraKey],
  );

  const handleRefresh = useCallback(async () => {
    // 防止重複點擊 (refreshCloud 本身也會共用同一個 in-flight Promise)
    setIsRefreshing(true);
    try {
      const result = await refreshCloud(stableOnly ? { only: stableOnly } : undefined);

      if (stableExtra && typeof window !== 'undefined') {
        stableExtra.forEach((ev) => {
          try {
            window.dispatchEvent(new CustomEvent(ev));
          } catch {
            /* ignore */
          }
        });
      }

      if (!silent) {
        if (!result.success && Object.keys(result.errors).length > 0) {
          toast.error(describeRefresh(result));
        } else if (result.changed) {
          toast.success(describeRefresh(result));
        } else {
          toast.success('資料已是最新');
        }
      }
    } catch (err) {
      console.error('[useCloudRefresh] refresh failed:', err);
      if (!silent) {
        toast.error(
          `重新整理失敗：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [stableOnly, stableExtra, silent, toast]);

  return { handleRefresh, isRefreshing };
}
