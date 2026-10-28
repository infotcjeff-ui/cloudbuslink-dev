'use client';

/**
 * ConfigEditModal — 平台層設定的編輯彈窗 (schema-driven)
 *
 * 給 /system-admin-setting 的「連線」與「整合」頁共用。
 * 一個 modal 處理兩種 config group:
 *   - 'supabase' → Project URL / Anon Key
 *   - 'gps'      → Provider / API Key / Endpoint / 更新頻率
 *
 * 設計:
 *   - OneFleet modal chrome (與 cbl-admin-setting 一致: MODAL_FADE / MODAL_SLIDE / EASE)
 *   - schema-driven 欄位 (text / password / number / select)
 *   - secret 欄位預設遮蔽, 需點眼睛才顯示
 *   - Supabase 專用「測試連線」按鈕
 *   - 「儲存本機 + 同步到平台」兩段式: 機密只存本機, 非機密才上雲
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Save, Eye, EyeOff, Plug, RotateCcw, CheckCircle2, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/admin/console-primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '@/app/(main)/cbl-admin-setting/[layout]/students/design-tokens';
import {
  resolveSystemConfig,
  setOverride,
  getOverride,
  clearOverrideField,
  testSupabaseConnection,
  GPS_PROVIDER_LABELS,
  type OverrideFieldPath,
} from '@/lib/system-config';
import { supabaseSystemConfig } from '@/lib/supabase-system-config';
import { resetSupabaseClient } from '@/lib/supabase';
import type { GpsProvider, SystemConfigOverride } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Schema                                                                     */
/* -------------------------------------------------------------------------- */

type FieldType = 'text' | 'password' | 'number' | 'select';

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** secret 欄位 — 只存本機, 永不上雲 */
  secret?: boolean;
  /** 對應到 override 的清除路徑 (還原預設用) */
  resetPath?: OverrideFieldPath;
  validate?: (value: string) => string | null;
}

export type ConfigGroup = 'supabase' | 'gps';

const SCHEMAS: Record<ConfigGroup, { title: string; subtitle: string; icon: LucideIcon; fields: FieldDef[] }> = {
  supabase: {
    title: 'Supabase 連線設定',
    subtitle: 'Project URL 與 Anon Key (client-safe)',
    icon: Plug,
    fields: [
      {
        name: 'url',
        label: 'Project URL',
        type: 'text',
        required: true,
        placeholder: 'https://xxxxxxxx.supabase.co',
        resetPath: 'supabase.url',
        hint: '你的 Supabase 專案端點',
        validate: (v) => {
          if (!v.trim()) return '請填寫 Project URL';
          if (!/^https?:\/\/.+\.supabase\.co/i.test(v.trim()) && !/^https?:\/\//i.test(v.trim())) {
            return 'URL 需以 https:// 開頭';
          }
          return null;
        },
      },
      {
        name: 'anonKey',
        label: 'Anon Key',
        type: 'password',
        required: true,
        placeholder: 'eyJhbGciOi...',
        resetPath: 'supabase.anonKey',
        hint: '前端安全金鑰 — 公開金鑰, 可安全存放於瀏覽器',
      },
    ],
  },
  gps: {
    title: 'GPS / 地圖設定',
    subtitle: '車輛定位追蹤的 provider 設定',
    icon: Plug,
    fields: [
      {
        name: 'provider',
        label: 'Provider',
        type: 'select',
        resetPath: 'gps.provider',
        options: (Object.keys(GPS_PROVIDER_LABELS) as GpsProvider[]).map((p) => ({
          value: p,
          label: GPS_PROVIDER_LABELS[p],
        })),
      },
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        secret: true,
        placeholder: 'pk.xxxxx 或 provider key',
        resetPath: 'gps.apiKey',
        hint: '機密 — 只存本機瀏覽器, 永不同步到雲端',
      },
      {
        name: 'endpoint',
        label: '自訂 Endpoint',
        type: 'text',
        placeholder: 'https://api.example.com/gps',
        resetPath: 'gps.endpoint',
        hint: '僅在 Provider = 自訂時有意義',
      },
      {
        name: 'refreshSeconds',
        label: '更新頻率 (秒)',
        type: 'number',
        placeholder: '2',
        resetPath: 'gps.refreshSeconds',
        validate: (v) => {
          if (!v.trim()) return null;
          const n = Number(v);
          if (Number.isNaN(n) || n < 1) return '需為 ≥ 1 的數字';
          return null;
        },
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

export interface ConfigEditModalProps {
  open: boolean;
  group: ConfigGroup;
  onClose: () => void;
  /** 儲存成功後回呼 (讓父層重讀狀態) */
  onSaved?: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ConfigEditModal({
  open, group, onClose, onSaved,
}: ConfigEditModalProps) {
  const toast = useToast();
  const schema = SCHEMAS[group];

  const [values, setValues] = React.useState<Record<string, string>>({});
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    ok: boolean; message: string;
  } | null>(null);

  // 開啟時載入「目前生效的值」當作草稿
  React.useEffect(() => {
    if (!open) return;
    const resolved = resolveSystemConfig();
    const next: Record<string, string> = {};
    if (group === 'supabase') {
      next.url = resolved.supabase.url;
      next.anonKey = resolved.supabase.anonKey;
    } else {
      next.provider = resolved.gps.provider;
      next.apiKey = resolved.gps.apiKey;
      next.endpoint = resolved.gps.endpoint;
      next.refreshSeconds = String(resolved.gps.refreshSeconds);
    }
    setValues(next);
    setTouched({});
    setRevealed({});
    setTestResult(null);
  }, [open, group]);

  const errors = React.useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const f of schema.fields) {
      const v = values[f.name] ?? '';
      if (f.required && !v.trim()) {
        out[f.name] = `${f.label} 為必填`;
        continue;
      }
      out[f.name] = f.validate ? f.validate(v) : null;
    }
    return out;
  }, [schema.fields, values]);

  const canSubmit =
    !saving && Object.values(errors).every((e) => e === null);

  const setValue = (name: string, v: string) => {
    setValues((p) => ({ ...p, [name]: v }));
    setTestResult(null);
  };

  const markTouched = (name: string) =>
    setTouched((p) => ({ ...p, [name]: true }));

  /* ---------------------------------------------------------------- */
  /*  測試連線 (僅 Supabase group)                                     */
  /* ---------------------------------------------------------------- */
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSupabaseConnection(
        values.url ?? '',
        values.anonKey ?? '',
      );
      setTestResult({ ok: res.ok, message: res.message });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } finally {
      setTesting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  儲存                                                            */
  /* ---------------------------------------------------------------- */
  const handleSave = async () => {
    const allTouched: Record<string, boolean> = {};
    Object.keys(errors).forEach((k) => (allTouched[k] = true));
    setTouched(allTouched);

    if (!canSubmit) {
      const firstBad = Object.entries(errors).find(([, v]) => v)?.[0];
      toast.error(errors[firstBad ?? ''] ?? '請檢查並修正表單欄位');
      return;
    }

    setSaving(true);
    try {
      // 1) 組出 override (含機密)
      const current = getOverride();
      const next: SystemConfigOverride = {
        supabase: {
          url: current?.supabase.url ?? null,
          anonKey: current?.supabase.anonKey ?? null,
        },
        gps: {
          provider: current?.gps.provider ?? null,
          endpoint: current?.gps.endpoint ?? null,
          refreshSeconds: current?.gps.refreshSeconds ?? null,
          apiKey: current?.gps.apiKey ?? null,
        },
        updatedAt: new Date().toISOString(),
        updatedBy: 'system_admin',
      };

      if (group === 'supabase') {
        next.supabase.url = (values.url ?? '').trim();
        next.supabase.anonKey = (values.anonKey ?? '').trim();
      } else {
        next.gps.provider = (values.provider as GpsProvider) ?? 'simulated';
        next.gps.apiKey = (values.apiKey ?? '').trim() || null;
        next.gps.endpoint = (values.endpoint ?? '').trim() || null;
        const rs = Number(values.refreshSeconds);
        next.gps.refreshSeconds =
          values.refreshSeconds && !Number.isNaN(rs) ? rs : null;
      }

      // 2) 寫本機 override (含機密)
      setOverride(next);

      // 3) 非機密部分同步到雲端 (sanitizeForCloud 會剝掉 apiKey)
      let cloudOk = true;
      try {
        const res = await supabaseSystemConfig.set(next);
        cloudOk = res.success;
        if (!res.success) {
          console.warn('[ConfigEditModal] cloud sync failed:', res.error);
        }
      } catch (e) {
        cloudOk = false;
        console.warn('[ConfigEditModal] cloud sync threw:', e);
      }

      // 4) 讓 Supabase client 換成新的設定
      resetSupabaseClient();

      toast.success(
        cloudOk
          ? '設定已儲存 (本機 + 平台)'
          : '設定已儲存至本機 (平台同步失敗, 不影響本機生效)',
      );
      onSaved?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`儲存失敗: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  還原預設 (清除該 group 的 override)                              */
  /* ---------------------------------------------------------------- */
  const handleReset = async () => {
    if (!window.confirm('確定將此區設定還原預設 (清除本機覆寫)?')) return;
    setSaving(true);
    try {
      for (const f of schema.fields) {
        if (f.resetPath) clearOverrideField(f.resetPath);
      }
      resetSupabaseClient();
      toast.success('已還原預設');
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const Icon = schema.icon;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="config-edit-backdrop"
          role="presentation"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[480px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-edit-title"
            aria-busy={saving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                <Icon width={18} height={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="config-edit-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {schema.title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {schema.subtitle}
                </p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:hover:text-slate-400 dark:hover:text-slate-200"
              >
                <X width={14} height={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3.5 overflow-y-auto max-h-[60vh]">
              {schema.fields.map((f) => {
                const err = errors[f.name];
                const showErr = touched[f.name] && err;
                return (
                  <div key={f.name}>
                    <label
                      htmlFor={`cfg-${f.name}`}
                      className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
                    >
                      {f.label}
                      {f.required && <span className="text-rose-500 ml-0.5">*</span>}
                      {f.secret && (
                        <span className="ml-1.5 normal-case tracking-normal text-amber-600 dark:text-amber-400">
                          (機密 · 只存本機)
                        </span>
                      )}
                    </label>

                    {f.type === 'select' ? (
                      <select
                        id={`cfg-${f.name}`}
                        value={values[f.name] ?? ''}
                        onChange={(e) => setValue(f.name, e.target.value)}
                        onBlur={() => markTouched(f.name)}
                        className={cn(
                          'w-full h-9 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 cursor-pointer dark:bg-slate-900 dark:text-slate-200',
                          err
                            ? 'border-rose-400 dark:border-rose-500'
                            : 'border-slate-200 dark:border-slate-700',
                        )}
                      >
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          id={`cfg-${f.name}`}
                          type={
                            f.type === 'number'
                              ? 'number'
                              : f.type === 'password' && !revealed[f.name]
                                ? 'password'
                                : 'text'
                          }
                          value={values[f.name] ?? ''}
                          onChange={(e) => setValue(f.name, e.target.value)}
                          onBlur={() => markTouched(f.name)}
                          placeholder={f.placeholder}
                          autoComplete="off"
                          className={cn(
                            'w-full h-9 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500',
                            err
                              ? 'border-rose-400 dark:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700',
                            f.type === 'password' ? 'pr-8' : '',
                          )}
                        />
                        {f.type === 'password' && (
                          <button
                            type="button"
                            aria-label={revealed[f.name] ? '隱藏' : '顯示'}
                            onClick={() =>
                              setRevealed((p) => ({ ...p, [f.name]: !p[f.name] }))
                            }
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            {revealed[f.name]
                              ? <EyeOff width={12} height={12} />
                              : <Eye width={12} height={12} />}
                          </button>
                        )}
                      </div>
                    )}

                    {f.hint && !showErr && (
                      <p className="text-[10.5px] text-slate-500 mt-1 leading-tight dark:text-slate-400">
                        {f.hint}
                      </p>
                    )}
                    {showErr && (
                      <p className="text-[10.5px] text-rose-600 dark:text-rose-400 mt-1 leading-tight">
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* 測試結果 */}
              {testResult && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2 text-[11.5px]',
                    testResult.ok
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
                  )}
                >
                  {testResult.ok
                    ? <CheckCircle2 width={13} height={13} className="shrink-0 mt-px" />
                    : <XCircle width={13} height={13} className="shrink-0 mt-px" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2 flex-wrap dark:border-slate-700/80">
              {group === 'supabase' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTest}
                  isLoading={testing}
                  startIcon={<Plug width={12} height={12} />}
                >
                  測試連線
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                startIcon={<RotateCcw width={12} height={12} />}
                title="清除此區的本機覆寫, 回到環境變數 / 預設值"
              >
                還原預設
              </Button>

              <div className="flex-1" />

              <Button variant="secondary" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={saving}
                disabled={!canSubmit}
                startIcon={<Save width={12} height={12} />}
              >
                儲存
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
