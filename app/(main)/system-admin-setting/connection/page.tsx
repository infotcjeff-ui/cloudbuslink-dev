'use client';

/**
 * /system-admin-setting/connection — 連線 (Supabase + 環境變數)
 *
 * 對應舊 /settings/system 的:
 *   - Section「Supabase 連線」
 *   - Section「環境變數檢查」
 *
 * 這頁的 API Key / Value 可編輯:
 *   - Project URL / Anon Key → ConfigEditModal 開啟
 *   - 儲存後寫入 override (本機) + 同步非機密到平台 (Supabase cbl_system_config)
 *   - 每列顯示「來源」badge (本機覆寫 / 平台設定 / 環境變數 / 未設定)
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database, KeyRound, Link2, ShieldCheck, Pencil, RotateCcw, Info,
} from 'lucide-react';
import { Card, SectionHeader, StatTile, Pill, Button } from '@/components/admin/console-primitives';
import {
  StatusDot, SettingRow, MaskedValue, KeyValueGrid, ConfigSourcePill,
} from '../components/ConsoleBits';
import { ConfigEditModal } from '../components/ConfigEditModal';
import { readSystemStatus } from '../lib/systemStatus';
import {
  subscribeSystemConfig,
  clearOverrideField,
} from '@/lib/system-config';
import { useSystemConfig } from '../hooks/useSystemConfig';
import { useToast } from '@/components/ui/toast';

export default function SystemAdminConnectionPage() {
  const toast = useToast();
  const [status, setStatus] = useState(() => readSystemStatus());
  const [editOpen, setEditOpen] = useState(false);

  // 背景拉平台層設定 (跨裝置共用) — 拉到後會更新本機快取並觸發 refresh
  const { refresh: refreshCloud } = useSystemConfig();

  const reload = useCallback(() => {
    setStatus(readSystemStatus());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 設定變更 (含其他分頁 / 其他瀏覽器分頁改的) → 即時重讀
  useEffect(() => subscribeSystemConfig(reload), [reload]);

  // 平台設定更新後 → 狀態也要跟著重讀
  useEffect(() => {
    refreshCloud().then(reload);
  }, [refreshCloud, reload]);

  const { env, initialized } = status;

  const handleResetUrl = () => {
    clearOverrideField('supabase.url');
    reload();
    toast.success('Project URL 已還原預設');
  };

  const handleResetKey = () => {
    clearOverrideField('supabase.anonKey');
    reload();
    toast.success('Anon Key 已還原預設');
  };

  return (
    <div className="space-y-6">
      {/* L1. Header Row — Title + Stat Tiles */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">連線與環境變數</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              檢查 Supabase 連線狀態與前端環境變數是否正確載入。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {env.hasOverride && (
              <Pill tone="warning" size="sm">含本機覆寫</Pill>
            )}
            <Pill tone={env.available ? 'success' : 'danger'} size="sm">
              {env.available ? '已連線' : '未連線'}
            </Pill>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Project URL"
            value={env.url ? '已設定' : '缺失'}
            hint="NEXT_PUBLIC_SUPABASE_URL"
            tone={env.url ? 'success' : 'danger'}
            icon={<Link2 width={12} height={12} />}
          />
          <StatTile
            label="Anon Key"
            value={env.anonLoaded ? '已載入' : '缺失'}
            hint="NEXT_PUBLIC_SUPABASE_ANON_KEY"
            tone={env.anonLoaded ? 'success' : 'danger'}
            icon={<KeyRound width={12} height={12} />}
          />
          <StatTile
            label="連線可用"
            value={env.available ? '可用' : '不可用'}
            hint={env.available ? '走 Supabase' : '退回 localStorage'}
            tone={env.available ? 'success' : 'warning'}
            icon={<Database width={12} height={12} />}
          />
          <StatTile
            label="初始化狀態"
            value={initialized ? '已同步' : '未同步'}
            hint="STORAGE.isInitialized()"
            tone={initialized ? 'success' : 'warning'}
            icon={<ShieldCheck width={12} height={12} />}
          />
        </div>
      </motion.div>

      {/* L2. Supabase 連線詳情 (可編輯) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
      >
        <Card>
          <SectionHeader
            icon={<Database width={18} height={18} />}
            title="Supabase 連線"
            subtitle="專案連線資訊與即時狀態"
            accent="primary"
            actions={
              <div className="flex items-center gap-1.5">
                <Pill tone={env.available ? 'success' : 'danger'} size="sm">
                  {env.available ? '可用' : '不可用'}
                </Pill>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                  startIcon={<Pencil width={12} height={12} />}
                  title="編輯 Project URL / Anon Key"
                >
                  編輯
                </Button>
              </div>
            }
          />
          <div className="border-t border-slate-100 dark:border-slate-700/80">
            <SettingRow
              label="Project URL"
              hint="Supabase 專案端點"
              onEdit={() => setEditOpen(true)}
              onReset={env.urlSource === 'override' ? handleResetUrl : undefined}
            >
              <MaskedValue
                value={env.url}
                emptyHint="未設定 (NEXT_PUBLIC_SUPABASE_URL)"
                source={env.urlSource}
                onEdit={() => setEditOpen(true)}
              />
            </SettingRow>            <SettingRow
              label="Anon Key"
              hint="前端安全金鑰 (client-safe) — 點編輯可檢視完整內容"
              onEdit={() => setEditOpen(true)}
              onReset={env.keySource === 'override' ? handleResetKey : undefined}
            >
              <span className="inline-flex items-center gap-2">
                <StatusDot
                  ok={env.anonLoaded}
                  label={env.anonLoaded ? '已載入' : '缺失'}
                />
                <ConfigSourcePill source={env.keySource} />
              </span>
            </SettingRow>
            <SettingRow label="連線可用" hint="URL 與 Anon Key 都存在才可用">
              <StatusDot
                ok={env.available}
                label={env.available ? '可用' : '不可用 (走 localStorage)'}
              />
            </SettingRow>
            <SettingRow label="初始化狀態" hint="是否曾完成一次完整同步">
              <StatusDot
                ok={initialized}
                label={initialized ? '已同步過' : '尚未同步'}
                tone={initialized ? 'auto' : 'warning'}
              />
            </SettingRow>
          </div>
        </Card>
      </motion.div>

      {/* L3. 環境變數檢查 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <Card>
          <SectionHeader
            icon={<KeyRound width={18} height={18} />}
            title="環境變數檢查"
            subtitle="所有前端可見的環境變數"
            accent="violet"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditOpen(true)}
                startIcon={<Pencil width={12} height={12} />}
                title="編輯 Project URL / Anon Key"
              >
                編輯
              </Button>
            }
          />
          <KeyValueGrid
            items={[
              {
                label: 'NEXT_PUBLIC_SUPABASE_URL',
                ok: !!env.url,
                note: env.url
                  ? `目前生效: ${env.url}`
                  : '未設定 — 請在此編輯或於 .env.local 補上',
                source: env.urlSource,
                onEdit: () => setEditOpen(true),
              },
              {
                label: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                ok: env.anonLoaded,
                note: env.anonLoaded
                  ? '已載入 (client-safe)'
                  : '未設定 — 請在此編輯或於 .env.local 補上',
                source: env.keySource,
                onEdit: () => setEditOpen(true),
              },
            ]}
          />
          <div className="px-5 pb-5 space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              service_role key 只能放 server 端 (.env.local, 不加 NEXT_PUBLIC_ 前綴),
              永不顯示於此、也不可經由瀏覽器編輯。
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
              <Info width={12} height={12} className="shrink-0 mt-0.5" />
              <span>
                設定優先序: <span className="font-mono text-slate-600 dark:text-slate-300">本機覆寫</span>
                {' → '}
                <span className="font-mono text-slate-600 dark:text-slate-300">平台設定</span>
                {' → '}
                <span className="font-mono text-slate-600 dark:text-slate-300">環境變數</span>。
                本機覆寫只影響當前瀏覽器, 平台設定則對所有裝置生效。
              </span>
            </p>
          </div>
        </Card>
      </motion.div>

      <ConfigEditModal
        open={editOpen}
        group="supabase"
        onClose={() => setEditOpen(false)}
        onSaved={reload}
      />
    </div>
  );
}
