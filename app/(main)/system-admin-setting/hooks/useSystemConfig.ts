'use client';

/**
 * useSystemConfig — /system-admin-setting 共用的設定 hook
 *
 *  responsibilities:
 *    1. 讀「本機快取 + override + env」解析出目前生效的設定
 *    2. 背景從 Supabase 拉平台層設定 (cbl_system_config) 並更新快取
 *       ⚠️ 拉平台設定本身需要一個可用的 Supabase client,
 *          所以用「當下已解析出的設定」連線 — 這是刻意的:
 *          第一次只能靠 env/override 連上去, 拉到平台設定後才會套用新的。
 *    3. 訂閱設定變更事件 → 即時重讀 (不用 reload)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  resolveSystemConfig,
  getCloudCache,
  setCloudCache,
  subscribeSystemConfig,
} from '@/lib/system-config';
import { supabaseSystemConfig } from '@/lib/supabase-system-config';
import { isSupabaseAvailable } from '@/lib/supabase-data';
import type { ResolvedSystemConfig, SystemConfigCloud } from '@/lib/types';

export interface UseSystemConfigResult {
  /** 實際生效的設定 */
  config: ResolvedSystemConfig;
  /** 平台層設定 (雲端) */
  cloud: SystemConfigCloud | null;
  /** 正在從雲端拉取 */
  loading: boolean;
  /** 手動重新拉取 */
  refresh: () => Promise<void>;
}

export function useSystemConfig(): UseSystemConfigResult {
  const [config, setConfig] = useState<ResolvedSystemConfig>(() =>
    resolveSystemConfig(),
  );
  const [cloud, setCloud] = useState<SystemConfigCloud | null>(() =>
    getCloudCache(),
  );
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setConfig(resolveSystemConfig());
    setCloud(getCloudCache());
  }, []);

  const refresh = useCallback(async () => {
    if (!isSupabaseAvailable()) return;
    setLoading(true);
    try {
      const { data, error } = await supabaseSystemConfig.get();
      if (error) {
        console.warn('[useSystemConfig] cloud fetch failed:', error);
        return;
      }
      if (data) {
        setCloudCache(data);
        setCloud(data);
        // 雲端設定進來後要重新解析 (cloud 層會被套用)
        setConfig(resolveSystemConfig(data));
      }
    } catch (e) {
      console.warn('[useSystemConfig] cloud fetch threw:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初次 mount → 拉平台設定
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 設定變更 → 重讀
  useEffect(() => subscribeSystemConfig(reload), [reload]);

  return { config, cloud, loading, refresh };
}
