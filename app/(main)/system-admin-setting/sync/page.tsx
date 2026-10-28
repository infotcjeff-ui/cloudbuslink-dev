'use client';

/**
 * /system-admin-setting/sync — 同步與快取
 *
 * 對應舊 /settings/system 的:
 *   - Section「資料同步 / 快取」
 *   - 「本地快取」筆數 (原本塞在 Supabase 連線 section 裡, 這裡獨立成表)
 *
 * 動作:
 *   - 手動同步 Supabase (syncFromSupabase)
 *   - 清空 localStorage 快取 (保留登入狀態)
 *   - 真·從雲端重新整理 (useCloudRefresh → refreshCloud)
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Trash2, HardDrive, Database, CloudUpload, AlertTriangle,
} from 'lucide-react';
import {
  Card, SectionHeader, StatTile, Pill, Button,
} from '@/components/admin/console-primitives';
import { StatusDot } from '../components/ConsoleBits';
import { useToast } from '@/components/ui/toast';
import { useCloudRefresh } from '@/app/(main)/cbl-admin-setting/hooks/useCloudRefresh';
import { syncFromSupabase, isSupabaseAvailable } from '@/lib/supabase-data';
import {
  readSystemStatus,
  LOCAL_TABLES,
  type LocalCounts,
} from '../lib/systemStatus';

export default function SystemAdminSyncPage() {
  const toast = useToast();
  const { handleRefresh, isRefreshing } = useCloudRefresh();

  const [counts, setCounts] = useState<LocalCounts>(() => readSystemStatus().counts);
  const [syncing, setSyncing] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(false);

  const reloadCounts = useCallback(() => {
    setCounts(readSystemStatus().counts);
  }, []);

  useEffect(() => {
    reloadCounts();
    setSupabaseReady(isSupabaseAvailable());
  }, [reloadCounts]);

  // 監聽任何 cbl-*-refresh → 重新計算本地筆數
  useEffect(() => {
    const events = [
      'cbl-clients-refresh', 'cbl-companies-refresh', 'cbl-users-refresh',
      'cbl-drivers-refresh', 'cbl-buses-refresh', 'cbl-students-refresh',
      'cbl-parents-refresh',
      // 保姆事件有兩種拼法並存 → 兩種都要監聽
      'cbl-nannys-refresh', 'cbl-nannies-refresh',
      'cbl-routes-refresh',
      'cbl-trips-refresh', 'cbl-attendances-refresh', 'cbl-announcements-refresh',
    ];
    events.forEach((ev) => window.addEventListener(ev, reloadCounts));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reloadCounts));
    };
  }, [reloadCounts]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const ok = await syncFromSupabase();
      reloadCounts();
      if (ok) {
        toast.success('同步完成 — 本地快取已更新');
      } else {
        toast.error('同步失敗, 詳見 console');
      }
    } catch (e) {
      toast.error(`同步出錯: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, [reloadCounts, toast]);

  const handleClearCache = useCallback(() => {
    if (!window.confirm('確定清空 localStorage 快取? 下次進頁會重新從 Supabase 同步。')) return;
    try {
      const keepAuth = localStorage.getItem('cbl_auth');
      localStorage.clear();
      if (keepAuth) localStorage.setItem('cbl_auth', keepAuth);
      reloadCounts();
      toast.success('快取已清空 (保留登入狀態), 重新整理頁面生效');
    } catch (e) {
      toast.error(`清空失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [reloadCounts, toast]);

  const totalRecords = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const emptyTables = LOCAL_TABLES.filter((t) => counts[t.key] === 0).length;

  return (
    <div className="space-y-6">
      {/* L1. Header Row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">同步與快取</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              從 Supabase 拉取最新資料, 或清理本地快取重新初始化。
            </p>
          </div>
          <Pill tone={supabaseReady ? 'success' : 'warning'} size="sm">
            {supabaseReady ? 'Supabase 可用' : 'Supabase 未設定'}
          </Pill>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="本地記錄"
            value={totalRecords}
            hint="所有表筆數合計"
            tone="primary"
            icon={<HardDrive width={12} height={12} />}
          />
          <StatTile
            label="資料表"
            value={LOCAL_TABLES.length}
            hint="受管理的實體數"
            tone="neutral"
            icon={<Database width={12} height={12} />}
          />
          <StatTile
            label="空表"
            value={emptyTables}
            hint={emptyTables > 0 ? '尚未同步到資料' : '全部已有資料'}
            tone={emptyTables > 0 ? 'warning' : 'success'}
            icon={<AlertTriangle width={12} height={12} />}
          />
          <StatTile
            label="連線"
            value={supabaseReady ? '可用' : '不可用'}
            hint={supabaseReady ? '可執行同步' : '只能操作本地快取'}
            tone={supabaseReady ? 'success' : 'danger'}
            icon={<CloudUpload width={12} height={12} />}
          />
        </div>
      </motion.div>

      {/* L2. 動作 Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
        className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700"
      >
        <Button
          variant="primary"
          size="sm"
          startIcon={<RefreshCw width={12} height={12} />}
          onClick={handleSync}
          isLoading={syncing}
          disabled={!supabaseReady}
          title={supabaseReady ? '從 Supabase 同步所有資料' : 'Supabase 未設定, 無法同步'}
        >
          手動同步 Supabase
        </Button>

        <Button
          variant="secondary"
          size="sm"
          startIcon={<CloudUpload width={12} height={12} />}
          onClick={handleRefresh}
          isLoading={isRefreshing}
          title="真・從雲端拉資料並合併回本地"
        >
          重新整理
        </Button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Button
          variant="danger"
          size="sm"
          startIcon={<Trash2 width={12} height={12} />}
          onClick={handleClearCache}
        >
          清空本地快取
        </Button>
      </motion.div>

      {/* L3. 本地快取 Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <Card>
          <SectionHeader
            icon={<HardDrive width={18} height={18} />}
            title="本地快取"
            subtitle="localStorage 中各表的筆數"
            accent="neutral"
            actions={<Pill tone="primary" size="sm">{totalRecords}</Pill>}
          />
          <div className="border-t border-slate-100 dark:border-slate-700/80">
            {LOCAL_TABLES.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between gap-4 px-5 py-2.5 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80"
              >
                <span className="text-[12px] text-slate-700 dark:text-slate-200">{t.label}</span>
                <span className="flex items-center gap-3">
                  <StatusDot
                    ok={counts[t.key] > 0}
                    label={counts[t.key] > 0 ? '有資料' : '空'}
                    tone={counts[t.key] > 0 ? 'success' : 'neutral'}
                  />
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {counts[t.key]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
