'use client';

/**
 * User Feature Permissions Modal — OneFleet-style console modal
 *
 * 規格來源: md/organizations-page-style-reference.md
 *   §14 Modal Chrome (Hand-Coded)
 *   §16 Form Field Primitives
 *   §21 Modal Footer
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/user/ 使用。
 *
 * 用途: 為單一 user 切換「功能開啟 / 關閉」, 對應 /cbl-admin-setting/user
 * 頁的 switch button 編輯行為。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Save,
  ShieldCheck,
  Bus,
  CheckCircle2,
  Wallet,
  GraduationCap,
  Users as UsersAllIcon,
  Wrench,
  Map as MapIcon,
  UserCog,
  Heart,
  BarChart3,
  Megaphone,
  Shield,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '../students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../students/design-tokens';
import {
  FEATURE_KEYS,
  FEATURE_META,
  ROLE_DEFAULT_FEATURES,
  type FeatureKey,
  type FeatureMeta,
  type UserFeatureFormState,
} from './types';
import type { UserRole } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Icon resolver — 把 FEATURE_META.iconKey 對應到 lucide 元件                    */
/* -------------------------------------------------------------------------- */

const ICON_BY_KEY: Record<
  FeatureMeta['iconKey'],
  React.ComponentType<{ width?: number; height?: number; className?: string }>
> = {
  bus: Bus as any,
  check: CheckCircle2 as any,
  cash: Wallet as any,
  cap: GraduationCap as any,
  family: UsersAllIcon as any,
  wrench: Wrench as any,
  route: MapIcon as any,
  driver: UserCog as any,
  heart: Heart as any,
  chart: BarChart3 as any,
  megaphone: Megaphone as any,
  shield: Shield as any,
};

/** 功能群組 (左列/中列/右列)— 用於在 modal 內 3 欄 grid 排版 */
const FEATURE_GROUPS: { title: string; keys: FeatureKey[] }[] = [
  {
    title: '前台操作',
    keys: ['view_trips', 'checkin', 'view_payments'],
  },
  {
    title: '資料管理',
    keys: [
      'manage_students',
      'manage_parents',
      'manage_buses',
      'manage_trips',
      'manage_drivers',
      'manage_nannies',
    ],
  },
  {
    title: '進階 / 系統',
    keys: ['export_reports', 'post_announcements', 'manage_users'],
  },
];

/* -------------------------------------------------------------------------- */
/*  ToggleSwitch — iOS-style switch (與 console 一致)                              */
/* -------------------------------------------------------------------------- */

function ToggleSwitch({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        checked
          ? 'bg-blue-600 dark:bg-blue-500'
          : 'bg-slate-200 dark:bg-slate-700',
      )}
    >
      <span className="sr-only">{title ?? (checked ? '停用' : '啟用')}</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-out my-[2px]',
          checked ? 'translate-x-[20px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  UserFeatureModal — 主表單                                                  */
/* -------------------------------------------------------------------------- */

export interface UserFeatureModalProps {
  open: boolean;
  initial: UserFeatureFormState;
  isSaving: boolean;
  onSave: (state: UserFeatureFormState) => void;
  onClose: () => void;
}

export function UserFeatureModal({
  open,
  initial,
  isSaving,
  onSave,
  onClose,
}: UserFeatureModalProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<UserFeatureFormState>(initial);

  // open / initial 變動時重置 (避免上次的 user 狀態殘留)
  React.useEffect(() => {
    if (open) {
      setForm({
        userId: initial.userId,
        role: initial.role,
        features: { ...initial.features },
      });
    }
  }, [open, initial]);

  const enabledCount = React.useMemo(
    () => FEATURE_KEYS.filter((k) => form.features[k]).length,
    [form.features],
  );
  const totalCount = FEATURE_KEYS.length;

  const toggle = (key: FeatureKey) =>
    setForm((p) => ({ ...p, features: { ...p.features, [key]: !p.features[key] } }));

  const setGroup = (keys: FeatureKey[], on: boolean) =>
    setForm((p) => {
      const next = { ...p.features };
      for (const k of keys) next[k] = on;
      return { ...p, features: next };
    });

  /** 還原為角色預設 */
  const resetToRoleDefault = () => {
    const seed = ROLE_DEFAULT_FEATURES[form.role] ?? [];
    const next: UserFeatureFormState['features'] = {};
    for (const k of FEATURE_KEYS) next[k] = seed.includes(k);
    setForm((p) => ({ ...p, features: next }));
    toast.info(`已還原為「${roleLabel(form.role)}」角色預設`);
  };

  const handleSaveClick = () => {
    onSave(form);
  };

  const title = '編輯功能權限';
  const subtitle = `調整此用戶可登入後看到的後台模組 · 已啟用 ${enabledCount}/${totalCount}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="user-feature-backdrop"
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[760px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-feature-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-white dark:bg-slate-900 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                <ShieldCheck width={18} height={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="user-feature-form-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {subtitle}
                </p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X width={14} height={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-5 dark:scrollbar-thin">
              {/* 角色 + 還原預設 */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50/40 dark:border-slate-700/80 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 ring-1 ring-inset ring-blue-200 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                    <ShieldCheck width={14} height={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                      用戶角色 (僅顯示)
                    </p>
                    <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                      {roleLabel(form.role)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  startIcon={<RotateCcw width={11} height={11} />}
                  onClick={resetToRoleDefault}
                  type="button"
                  title="還原為角色預設"
                >
                  還原預設
                </Button>
              </div>

              {/* 功能開關 grid — 3 群組 */}
              <div className="space-y-4">
                {FEATURE_GROUPS.map((group) => {
                  const groupEnabled = group.keys.filter(
                    (k) => form.features[k],
                  ).length;
                  return (
                    <div
                      key={group.title}
                      className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700/80 dark:bg-slate-900"
                    >
                      {/* group header */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/40 dark:border-slate-700/80 dark:bg-slate-800/40">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-700 dark:text-slate-200">
                            {group.title}
                          </span>
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums">
                            ({groupEnabled}/{group.keys.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setGroup(group.keys, true)}
                            className="inline-flex items-center justify-center h-6 px-2 rounded text-[10.5px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 ring-1 ring-inset ring-blue-200 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-blue-300 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 dark:ring-blue-800/50"
                          >
                            全開
                          </button>
                          <button
                            type="button"
                            onClick={() => setGroup(group.keys, false)}
                            className="inline-flex items-center justify-center h-6 px-2 rounded text-[10.5px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 ring-1 ring-inset ring-slate-200 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:ring-slate-700"
                          >
                            全關
                          </button>
                        </div>
                      </div>

                      {/* features list */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-y divide-slate-100 sm:divide-y-0 sm:divide-x sm:divide-x-reverse dark:divide-slate-700/80">
                        {group.keys.map((k, idx) => {
                          const meta = FEATURE_META[k];
                          const Icon = ICON_BY_KEY[meta.iconKey];
                          const on = !!form.features[k];
                          const isLastInCol =
                            idx === group.keys.length - 1;
                          return (
                            <div
                              key={k}
                              className={cn(
                                'flex items-center justify-between gap-3 px-4 py-3',
                                // 桌面 3 欄時, 在 sm 以上以 grid 排; 行動裝置用 divide-y
                                idx > 0 &&
                                  'border-t border-slate-100 dark:border-slate-700/80 sm:border-t-0',
                              )}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div
                                  className={cn(
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                                    on
                                      ? 'bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50'
                                      : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700',
                                  )}
                                >
                                  <Icon width={14} height={14} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[12.5px] font-medium text-slate-900 dark:text-slate-100 truncate">
                                    {meta.label}
                                  </p>
                                  <p
                                    className="text-[10.5px] text-slate-500 dark:text-slate-400 line-clamp-2"
                                    title={meta.desc}
                                  >
                                    {meta.desc}
                                  </p>
                                </div>
                              </div>
                              <ToggleSwitch
                                checked={on}
                                onChange={() => toggle(k)}
                                title={`${on ? '停用' : '啟用'} ${meta.label}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tip */}
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-violet-50/60 border border-violet-200/70 text-[11.5px] text-violet-700 dark:bg-violet-950/20 dark:border-violet-800/40 dark:text-violet-300">
                <Sparkles
                  width={12}
                  height={12}
                  className="shrink-0 mt-px text-violet-600 dark:text-violet-400"
                />
                <span>
                  未自訂過的 user 會套用「角色預設」; 儲存一次後, 即覆寫預設,
                  直到下次點「還原預設」或手動修改。
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50 font-medium tabular-nums">
                  {enabledCount}/{totalCount}
                </span>
                已授權功能
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveClick}
                  isLoading={isSaving}
                  startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                >
                  儲存變更
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function roleLabel(role: UserRole): string {
  switch (role) {
    case 'system_admin': return '系統開發者';
    case 'super_admin': return '系統管理員';
    case 'client':      return '客戶管理員';
    case 'parent':      return '家長';
    case 'nanny':       return '保姆';
    default:            return '使用者';
  }
}