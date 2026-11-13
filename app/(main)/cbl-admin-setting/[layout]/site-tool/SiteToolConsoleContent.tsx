'use client';

/**
 * SiteToolConsoleContent — 網站設定主控台 (OneFleet 風格)
 *
 * 取代舊的「摘要 + 前往完整頁面」寫法, 與 /cbl-admin-setting 其他 console 對齊:
 *   - L1 Header Row (Title + Stat Tiles)
 *   - L2 Tab Bar (FilterTabGroup: 一般設定 / 學年管理)
 *   - L3 Table Card (SectionHeader + 內容)
 *
 * 兩個 tab:
 *   - general  → 公司資料 / Logo / 主題色 / 聯絡資訊 (寫入 cbl_settings, 即時生效)
 *   - academic → 直接嵌入學年管理 (與 /cbl-admin-setting/academic-years 同一元件)
 *
 * 「API 與第三方串接」已搬到 /system-admin-setting/integrations 集中管理。
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Wrench, Settings2, CalendarRange,
  Building2, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import {
  Pill, Dot, Button, Card, SectionHeader, StatTile, FilterTabGroup,
  type FilterTabOption,
} from '../students/primitives';
import AcademicYearsPage from '../../academic-years/page';

type SiteToolTab = 'general' | 'academic';

const TAB_OPTIONS: FilterTabOption<SiteToolTab>[] = [
  { value: 'general', label: '一般設定', icon: <Settings2 width={11} height={11} /> },
  { value: 'academic', label: '學年管理', icon: <CalendarRange width={11} height={11} /> },
];

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#6366f1',
];

export function SiteToolConsoleContent() {
  const [tab, setTab] = React.useState<SiteToolTab>('general');

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <SiteToolHeader />

      {/* L2. Tab Bar — relative z-10, 明確低於 AdminShell header (z-30),
          捲動 / popup 時 tab 永遠不會蓋住 header。 */}
      <div className="relative z-10 flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <FilterTabGroup
          value={tab}
          onChange={setTab}
          options={TAB_OPTIONS}
          layoutId="sitetool-tab-pill"
        />
        <div className="ml-auto hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {tab === 'general' && '公司資料 · Logo · 主題色 · 聯絡資訊'}
          {tab === 'academic' && '學年登錄 · 現行學年 · 學年轉換精靈'}
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
        {tab === 'general' && <GeneralPanel />}
        {tab === 'academic' && (
          <div className="flex flex-col flex-1 min-h-0">
            <AcademicYearsPage />
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  L1 Header                                                                  */
/* -------------------------------------------------------------------------- */

function SiteToolHeader() {
  const { user } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const title = settings?.title || 'CloudBusLink';
  const primaryColor = settings?.primaryColor || '#3b82f6';
  const contactDone = [settings?.phone, settings?.email, settings?.address].filter(Boolean).length;

  return (
    <motion.div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
          <Wrench width={20} height={20} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
              網站設定
            </h1>
            <Pill tone="primary" size="sm">
              <Building2 width={9} height={9} />
              {title}
            </Pill>
          </div>
          <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
            設定公司資料、Logo、主題色及聯絡資訊。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:w-[400px]">
        <StatTile
          label="公司資料"
          value={contactDone >= 2 ? '完整' : '待補'}
          hint={`${contactDone}/3 聯絡欄位`}
          icon={<Building2 width={12} height={12} />}
          tone={contactDone >= 2 ? 'success' : 'warning'}
        />
        <StatTile
          label="主題色"
          value={primaryColor}
          hint={title}
          icon={<span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: primaryColor }} />}
          tone="primary"
        />
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab 1: 一般設定                                                            */
/* -------------------------------------------------------------------------- */

function GeneralPanel() {
  const toast = useToast();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings(user?.clientId);
  const safeSettings = settings ?? STORAGE.settings.default(user?.clientId ?? '');

  const [title, setTitle] = React.useState(safeSettings.title);
  const [logo, setLogo] = React.useState(safeSettings.logo ?? '');
  const [primaryColor, setPrimaryColor] = React.useState(safeSettings.primaryColor);
  const [phone, setPhone] = React.useState(safeSettings.phone);
  const [email, setEmail] = React.useState(safeSettings.email);
  const [address, setAddress] = React.useState(safeSettings.address);
  const [studentIdPrefix, setStudentIdPrefix] = React.useState(safeSettings.studentIdPrefix ?? 'stu-');
  const [saving, setSaving] = React.useState(false);

  // settings 載入後同步一次 (避免 hydration race 蓋掉使用者輸入: 只在初次有值時同步)
  const syncedRef = React.useRef(false);
  React.useEffect(() => {
    if (syncedRef.current || !settings) return;
    syncedRef.current = true;
    setTitle(settings.title);
    setLogo(settings.logo ?? '');
    setPrimaryColor(settings.primaryColor);
    setPhone(settings.phone);
    setEmail(settings.email);
    setAddress(settings.address);
    setStudentIdPrefix(settings.studentIdPrefix ?? 'stu-');
  }, [settings]);

  const dirty = React.useMemo(() => {
    if (!settings) return true;
    return (
      title !== settings.title ||
      logo !== (settings.logo ?? '') ||
      primaryColor !== settings.primaryColor ||
      phone !== settings.phone ||
      email !== settings.email ||
      address !== settings.address ||
      studentIdPrefix !== (settings.studentIdPrefix ?? 'stu-')
    );
  }, [title, logo, primaryColor, phone, email, address, studentIdPrefix, settings]);

  const handleSave = () => {
    if (!user?.clientId) {
      toast.error('無法取得客戶端資訊，請重新登入');
      return;
    }
    if (!title.trim()) {
      toast.error('請填寫公司 / 機構名稱');
      return;
    }
    setSaving(true);
    try {
      updateSettings({
        title: title.trim(), phone, email, address,
        primaryColor, logo: logo.trim() || null, studentIdPrefix,
      });
      toast.success('網站設定已儲存');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`儲存失敗：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col flex-1 min-h-0">
      <SectionHeader
        icon={<Settings2 width={18} height={18} />}
        title="一般設定"
        subtitle="公司資料 · Logo · 主題色 · 聯絡資訊 — 儲存後即時生效"
        accent="primary"
        actions={
          <div className="flex items-center gap-1.5">
            {dirty ? <Pill tone="warning" size="sm"><Dot tone="warning" />未儲存</Pill> : <Pill tone="success" size="sm"><Dot tone="success" />已同步</Pill>}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              disabled={!dirty || saving}
              startIcon={<Save width={12} height={12} />}
            >
              儲存
            </Button>
          </div>
        }
      />

      <div className="border-t border-slate-100 dark:border-slate-700/80 px-5 py-5 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* 左: 表單 */}
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledInput id="site-title" label="公司 / 機構名稱" value={title} onChange={setTitle} placeholder="CloudBusLink" required />
            <LabeledInput id="site-prefix" label="學生編號前綴" value={studentIdPrefix} onChange={setStudentIdPrefix} placeholder="stu-" hint="新增學生時自動套用" />
          </div>

          <div>
            <label htmlFor="site-logo" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
              Logo (URL)
            </label>
            <div className="flex gap-2">
              <input
                id="site-logo"
                type="text"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://..."
                autoComplete="off"
                spellCheck={false}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
              />
              {logo.trim() && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logo.trim()} alt="logo" className="h-9 w-9 rounded-md object-contain border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">留空將使用默認 Logo 佔位符</p>
          </div>

          <div>
            <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
              主題色
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPrimaryColor(c)}
                  title={c}
                  aria-label={`主題色 ${c}`}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 transition-all cursor-pointer',
                    primaryColor === c ? 'border-slate-900 scale-110 dark:border-white' : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#3b82f6"
              spellCheck={false}
              className="mt-2 w-40 h-9 px-2.5 rounded-md border border-slate-200 bg-white font-mono text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LabeledInput id="site-phone" label="聯絡電話" value={phone} onChange={setPhone} placeholder="23456789" />
            <LabeledInput id="site-email" label="Email" value={email} onChange={setEmail} placeholder="info@school.edu.hk" />
          </div>

          <div>
            <label htmlFor="site-address" className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
              地址
            </label>
            <textarea
              id="site-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="香港九龍..."
              rows={2}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
          </div>
        </div>

        {/* 右: 即時預覽 */}
        <aside className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-2 dark:text-slate-400">即時預覽</p>
            <div className="flex items-center gap-2.5 rounded-lg bg-white border border-slate-200 px-3 py-2.5 dark:bg-slate-900 dark:border-slate-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white shrink-0" style={{ backgroundColor: primaryColor }}>
                {logo.trim() ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logo.trim()} alt="" className="h-6 w-6 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <Building2 width={16} height={16} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-900 truncate dark:text-slate-100">{title || '未命名'}</p>
                <p className="text-[10px] text-slate-500 truncate dark:text-slate-400">{email || phone || '聯絡資訊待補'}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-block h-4 w-4 rounded-full ring-1 ring-inset ring-slate-900/10" style={{ backgroundColor: primaryColor }} />
              <code className="text-[11px] font-mono text-slate-600 dark:text-slate-300">{primaryColor}</code>
            </div>
          </div>
          <div className="rounded-lg border border-blue-200/70 bg-blue-50/60 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-slate-300">
            儲存後即時寫入本站設定 (<span className="font-mono">cbl_settings</span>)，側邊欄 Logo、標題與主題色會立即更新。
          </div>
        </aside>
      </div>
    </Card>
  );
}

function LabeledInput({ id, label, value, onChange, placeholder, required, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; hint?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
      />
      {hint && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}
