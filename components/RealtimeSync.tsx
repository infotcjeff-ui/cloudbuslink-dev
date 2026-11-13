'use client';

import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { refreshCloud } from '@/lib/cloud-refresh';

/**
 * RealtimeSync — Supabase Realtime 全域訂閱 (無 UI)。
 *
 * 三個 layout (main / nanny-portal / nanny-personal) 都掛載了它:
 * 監聽 cbl_* 表的 postgres_changes, 收到雲端變更就觸發 refreshCloud()
 * 把最新資料合併回 localStorage 並 dispatch cbl-*-refresh 事件讓 UI 重畫。
 *
 * - 防抖 1.5s: 避免一次大量寫入觸發 N 次全量刷新打爆 API
 * - 無 Supabase 設定時靜默跳過 (本機模式不受影響)
 * - 嚴格模式 double-mount 安全: 清理函式會移除 channel
 */
export default function RealtimeSync() {
  const timerRef = useRef<number | null>(null);
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const scheduleRefresh = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void refreshCloud().catch(() => {});
      }, 1500);
    };

    const setup = async () => {
      try {
        const client = getSupabaseClient();
        if (!client || cancelled) return;
        const channel = client
          .channel('cbl-global-sync')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            () => scheduleRefresh(),
          );
        channelRef.current = channel as unknown as { unsubscribe: () => void };
        // subscribe() 回傳 channel 本身; 錯誤時不會 throw, 靜默即可
        try {
          await (channel as unknown as { subscribe: () => Promise<unknown> }).subscribe();
        } catch {
          /* realtime 不可用時靜默 — 輪詢 / 手動刷新仍可工作 */
        }
      } catch {
        /* 未設定 Supabase 時靜默跳過 */
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        channelRef.current?.unsubscribe();
      } catch {
        /* ignore */
      }
      channelRef.current = null;
      // 保險: 同名 channel 殘留時清掉
      try {
        getSupabaseClient()?.removeAllChannels?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
