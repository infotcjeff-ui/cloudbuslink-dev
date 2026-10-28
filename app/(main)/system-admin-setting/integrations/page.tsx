'use client';

/**
 * /system-admin-setting/integrations — 整合 (GPS / 地圖 / 推送 / 郵件)
 *
 * 對應舊 /settings/system 的:
 *   - Section「GPS / 地圖」
 *   - Section「推送 / 郵件」
 *
 * 這頁的 GPS API Key / Value 可編輯:
 *   - Provider / API Key / Endpoint / 更新頻率 → ConfigEditModal
 *   - API Key 是機密 → 只存本機 localStorage, 永不同步到雲端
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Satellite, Bell, Mail, Radio, MapPin, Plug, Pencil, Info,
} from 'lucide-react';
import { Card, SectionHeader, StatTile, Pill, Button } from '@/components/admin/console-primitives';
import { StatusDot, SettingRow, MaskedValue, ConfigSourcePill } from '../components/ConsoleBits';
import { ConfigEditModal } from '../components/ConfigEditModal';
import { readSystemStatus, type GpsStatus } from '../lib/systemStatus';
import {
  subscribeSystemConfig,
  clearOverrideField,
  GPS_PROVIDER_LABELS,
} from '@/lib/system-config';
import { useToast } from '@/components/ui/toast';

export default function SystemAdminIntegrationsPage() {
  const toast = useToast();
  const [gps, setGps] = useState<GpsStatus>(() => readSystemStatus().gps);
  const [editOpen, setEditOpen] = useState(false);

  const reload = useCallback(() => {
    setGps(readSystemStatus().gps);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => subscribeSystemConfig(reload), [reload]);

  const pairRate = gps.total > 0 ? Math.round((gps.paired / gps.total) * 100) : 0;
  const isSimulated = gps.provider === 'simulated';
  const hasGpsKey = !!gps.apiKey;

  const handleResetApiKey = () => {
    clearOverrideField('gps.apiKey');
    reload();
    toast.success('GPS API Key 已還原預設');
  };

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
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">第三方整合</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              GPS 追蹤、推送通知與電子郵件的接入狀態。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {gps.apiKeySource === 'override' && (
              <Pill tone="warning" size="sm">含本機機密</Pill>
            )}
            <Pill tone={isSimulated ? 'warning' : 'success'} size="sm">
              {isSimulated ? '模擬模式' : '已接入 Provider'}
            </Pill>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="GPS Provider"
            value={GPS_PROVIDER_LABELS[gps.provider] ?? gps.provider}
            hint={`更新頻率 ${gps.refreshSeconds}s`}
            tone={isSimulated ? 'neutral' : 'success'}
            icon={<Satellite width={12} height={12} />}
          />
          <StatTile
            label="裝置配對"
            value={`${gps.paired} / ${gps.total}`}
            hint={`配對率 ${pairRate}%`}
            tone={gps.paired > 0 ? 'success' : 'neutral'}
            icon={<Radio width={12} height={12} />}
          />
          <StatTile
            label="Push 通知"
            value="未接入"
            hint="無推播服務商設定"
            tone="warning"
            icon={<Bell width={12} height={12} />}
          />
          <StatTile
            label="Email 郵件"
            value="未接入"
            hint="無 SMTP / 郵件服務設定"
            tone="warning"
            icon={<Mail width={12} height={12} />}
          />
        </div>
      </motion.div>

      {/* L2. GPS / 地圖 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
      >
        <Card>
          <SectionHeader
            icon={<Satellite width={18} height={18} />}
            title="GPS / 地圖"
            subtitle="車輛定位追蹤的 provider 設定"
            accent="primary"
            actions={
              <div className="flex items-center gap-1.5">
                <Pill tone={isSimulated ? 'neutral' : 'success'} size="sm">
                  {isSimulated ? '模擬模式' : GPS_PROVIDER_LABELS[gps.provider]}
                </Pill>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                  startIcon={<Pencil width={12} height={12} />}
                  title="編輯 GPS Provider / API Key / Endpoint"
                >
                  編輯
                </Button>
              </div>
            }
          />
          <div className="border-t border-slate-100 dark:border-slate-700/80">
            <SettingRow
              label="Provider"
              hint="車輛定位使用的追蹤服務商"
              onEdit={() => setEditOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <StatusDot
                  ok={!isSimulated}
                  label={GPS_PROVIDER_LABELS[gps.provider] ?? gps.provider}
                  tone={isSimulated ? 'warning' : 'success'}
                />
                <ConfigSourcePill source={gps.providerSource} />
              </span>
            </SettingRow>

            <SettingRow
              label="API Key"
              hint="接入真實 provider 時在此設定 (機密 · 只存本機)"
              onEdit={() => setEditOpen(true)}
              onReset={gps.apiKeySource === 'override' ? handleResetApiKey : undefined}
            >
              <MaskedValue
                value={gps.apiKey}
                emptyHint="未設定"
                source={gps.apiKeySource}
                onEdit={() => setEditOpen(true)}
              />
            </SettingRow>

            <SettingRow
              label="自訂 Endpoint"
              hint="僅在 Provider = 自訂時生效"
              onEdit={() => setEditOpen(true)}
            >
              {gps.endpoint ? (
                <MaskedValue value={gps.endpoint} onEdit={() => setEditOpen(true)} />
              ) : (
                <span className="text-slate-400 dark:text-slate-500">未設定</span>
              )}
            </SettingRow>

            <SettingRow
              label="更新頻率"
              hint="位置更新的間隔秒數"
              onEdit={() => setEditOpen(true)}
            >
              <span className="font-mono text-[12px] tabular-nums">
                {gps.refreshSeconds} 秒
              </span>
            </SettingRow>

            <SettingRow label="裝置配對" hint="已綁定 gpsDeviceId 的校巴">
              <span className="font-mono text-[11px]">
                {gps.paired} / {gps.total} 已配對
              </span>
            </SettingRow>

            <SettingRow label="地圖服務" hint="MapLibre 底圖 (maplibre-gl)">
              <span className="inline-flex items-center gap-1.5">
                <MapPin width={11} height={11} className="text-slate-400" />
                內建 MapLibre
              </span>
            </SettingRow>
          </div>
        </Card>
      </motion.div>

      {/* L3. 推送 / 郵件 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <Card>
          <SectionHeader
            icon={<Plug width={18} height={18} />}
            title="推送 / 郵件"
            subtitle="對外通知渠道的接入狀態"
            accent="warning"
          />
          <div className="border-t border-slate-100 dark:border-slate-700/80">
            <SettingRow label="Push" hint="家長 / 保姆端推播">
              <StatusDot ok={false} label="未接入" tone="warning" />
            </SettingRow>
            <SettingRow label="Email" hint="帳單、收據與系統通知">
              <StatusDot ok={false} label="未接入" tone="warning" />
            </SettingRow>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
              <Info width={12} height={12} className="shrink-0 mt-0.5" />
              <span>
                Push / Email 的憑證屬於機密, 目前尚未開放編輯。
                開放後將與 GPS API Key 相同 — 只存本機瀏覽器, 永不同步到雲端。
              </span>
            </p>
          </div>
        </Card>
      </motion.div>

      <ConfigEditModal
        open={editOpen}
        group="gps"
        onClose={() => setEditOpen(false)}
        onSaved={reload}
      />
    </div>
  );
}
