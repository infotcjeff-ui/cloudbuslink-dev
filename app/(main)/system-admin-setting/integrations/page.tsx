'use client';

/**
 * /system-admin-setting/integrations — API 與第三方串接
 *
 * 由 /cbl-admin-setting/site-tool 搬移過來 (site-tool 只留「一般設定 + 學年管理」)。
 * 顯示方式沿用 site-tool 的 Tab 語言 (L1 Header + L2 Tab Bar + L3 內容),
 * 但只收錄「API 與第三方串接」一個 tab。
 *
 * 內容: 01 · 808 GPS / 02 · 裝置配對 / 03 · Supabase / 04 · Push-Email
 * (沿用 lib/system-config 三層解析, 見 ./IntegrationsPanel)
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { Plug, Satellite } from 'lucide-react';
import {
  Pill, FilterTabGroup,
  type FilterTabOption,
} from '@/components/admin/console-primitives';
import { IntegrationsPanel } from './IntegrationsPanel';

type IntegrationsTab = 'integrations';

const TAB_OPTIONS: FilterTabOption<IntegrationsTab>[] = [
  { value: 'integrations', label: 'API 密鑰', icon: <Plug width={11} height={11} /> },
];

export default function SystemAdminIntegrationsPage() {
  const [tab, setTab] = React.useState<IntegrationsTab>('integrations');

  return (
    <div className="flex flex-col gap-4">
      {/* L1. Header Row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <Satellite width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                API 密鑰
              </h2>
              <Pill tone="primary" size="sm">Server-Only · F12 不可見</Pill>
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              GPS · Supabase · Push · Email 接入狀態 — 密鑰只存伺服器，前端僅顯示遮罩。
            </p>
          </div>
        </div>
      </motion.div>

      {/* L2. Tab Bar (僅一個 tab, 與 site-tool 語言一致, 方便日後擴充) */}
      <div className="relative z-10 flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <FilterTabGroup
          value={tab}
          onChange={setTab}
          options={TAB_OPTIONS}
          layoutId="sys-integrations-tab-pill"
        />
        <div className="ml-auto hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          GPS · Supabase · Push · Email 接入狀態
        </div>
      </div>

      {/* L3. Tab Content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex flex-col flex-1 min-h-0"
      >
        <IntegrationsPanel />
      </motion.div>
    </div>
  );
}
