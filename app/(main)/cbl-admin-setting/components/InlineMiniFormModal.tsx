'use client';

/**
 * InlineMiniFormModal — 通用小型「在表單內新增」彈窗
 *
 * 設計範圍:
 *   - 給 /cbl-admin-setting/ 內所有表單 (TripRouteFormModal, StudentFormModal,
 *     TripFormModal, NannyFormModal 等) 共用, 讓使用者可在表單中即時新增:
 *       - 校巴 (Bus)
 *       - 司機 (Driver)
 *       - 保姆 (Nanny)
 *   - 寫入 STORAGE 後回傳新建的 entity, 由父層自動勾選到對應 select
 *   - 沿用 OneFleet Modal chrome 風格 (與 students 一致)
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Save,
  Plus,
  Bus as BusIcon,
  UserCog,
  UserCheck,
  Hash,
  Phone,
  IdCard,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Button, Pill } from '../[layout]/students/primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from '../[layout]/students/design-tokens';
import type { Bus, Driver, Nanny } from '@/lib/types';

type Mode = 'bus' | 'driver' | 'nanny';

interface CommonProps {
  open: boolean;
  isSaving: boolean;
  onClose: () => void;
}

interface BusProps extends CommonProps {
  mode: 'bus';
  onCreated: (b: Bus) => void;
}
interface DriverProps extends CommonProps {
  mode: 'driver';
  onCreated: (d: Driver) => void;
}
interface NannyProps extends CommonProps {
  mode: 'nanny';
  onCreated: (n: Nanny) => void;
}

type Props = BusProps | DriverProps | NannyProps;

const MODE_META: Record<
  Mode,
  { title: string; subtitle: string; Icon: LucideIcon }
> = {
  bus:    { title: '新增校巴', subtitle: '在表單內即時建立一輛校巴', Icon: BusIcon },
  driver: { title: '新增司機', subtitle: '在表單內即時建立一位司機', Icon: UserCog },
  nanny:  { title: '新增保姆', subtitle: '即時建立保姆資料 + 登入帳號 (密碼預設為電話)', Icon: UserCheck },
};

function LabeledInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  type = 'text',
  maxLength,
  inputMode,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'tel' | 'number';
  maxLength?: number;
  inputMode?: 'text' | 'tel' | 'numeric';
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
      >
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete="off"
          className={cn(
            'w-full h-9 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200',
            icon ? 'pl-8 pr-2.5' : 'px-2.5',
          )}
        />
      </div>
    </div>
  );
}

function InlineFieldError({ message }: { message: string | null }) {
  return (
    <div className="min-h-[14px] mt-0.5">
      {message && (
        <p className="text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {message}
        </p>
      )}
    </div>
  );
}

export function InlineMiniFormModal(props: Props) {
  const { open, mode, isSaving, onClose } = props;
  const toast = useToast();
  const meta = MODE_META[mode];
  const Icon = meta.Icon;

  const [plateNumber, setPlateNumber] = React.useState('');
  const [model, setModel] = React.useState('');
  const [capacity, setCapacity] = React.useState('28');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [license, setLicense] = React.useState('');
  const [employeeIdPreview, setEmployeeIdPreview] = React.useState('');
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (open) {
      setPlateNumber('');
      setModel('');
      setCapacity('28');
      setName('');
      setPhone('');
      setLicense('');
      setTouched({});
      // 保姆模式: 預先產生員工編號 preview (EMP-001 格式, 與保姆管理頁一致)
      if (mode === 'nanny') {
        import('@/lib/storage').then(({ STORAGE }) => {
          try {
            const raw = localStorage.getItem('cbl_auth');
            const cid = raw ? JSON.parse(raw)?.clientId || '' : '';
            setEmployeeIdPreview(cid ? STORAGE.nannies.generateEmployeeId(cid) : '');
          } catch {
            setEmployeeIdPreview('');
          }
        });
      } else {
        setEmployeeIdPreview('');
      }
    }
  }, [open, mode]);

  const errors: Record<string, string | null> = React.useMemo(() => {
    const out: Record<string, string | null> = {};
    if (mode === 'bus') {
      out.plateNumber = !plateNumber.trim() ? '請輸入車牌' : null;
      out.model = null; // 選填, busLabel 會顯示「未填型號」
      out.capacity =
        !capacity || isNaN(Number(capacity)) || Number(capacity) < 1
          ? '座位數需 > 0'
          : null;
    } else if (mode === 'driver') {
      out.name = !name.trim() ? '請輸入姓名' : null;
      out.phone = !/^[0-9]{8}$/.test(phone) ? '電話需為 8 位數字' : null;
      out.license = !license.trim() ? '請輸入駕照號碼' : null;
    } else {
      out.name = !name.trim() ? '請輸入姓名' : null;
      out.phone = !/^[0-9]{8}$/.test(phone) ? '電話需為 8 位數字' : null;
      // 員工編號由系統自動生成, 不需使用者填寫
      out.employeeId = null;
    }
    return out;
  }, [mode, plateNumber, model, capacity, name, phone, license]);

  const canSubmit =
    !isSaving && Object.values(errors).every((e) => e === null);

  const markTouched = (field: string) =>
    setTouched((p) => ({ ...p, [field]: true }));

  const handleSubmit = async () => {
    // 全部標記為 touched 觸發錯誤顯示
    const all: Record<string, boolean> = {};
    Object.keys(errors).forEach((k) => (all[k] = true));
    setTouched(all);
    if (!canSubmit) {
      // 找出第一個錯誤欄位, 給 toast 一個明確訊息
      const errorMap: Record<string, string> = {
        plateNumber: '請輸入車牌',
        model: '請輸入車輛型號',
        capacity: '座位數必須大於 0',
        name: '請輸入姓名',
        phone: '請輸入有效的電話號碼 (8 位數字)',
        license: '請輸入駕照號碼',
        employeeId: '請輸入員工編號',
      };
      const firstError = Object.entries(errors).find(([, v]) => v)?.[0] ?? '';
      toast.error(errorMap[firstError] || '請檢查並修正表單欄位');
      return;
    }
    try {
      const { STORAGE } = await import('@/lib/storage');
      const clientId = (() => {
        try {
          const raw = localStorage.getItem('cbl_auth');
          return raw ? JSON.parse(raw)?.clientId || '' : '';
        } catch {
          return '';
        }
      })();
      if (mode === 'bus') {
        const bus: Bus = {
          id: STORAGE.genId('bus'),
          clientId,
          plateNumber: plateNumber.trim().toUpperCase(),
          model: model.trim(),
          capacity: Number(capacity),
          driverId: null,
          gpsDeviceId: null,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        STORAGE.buses.add(bus);
        window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
        toast.success(`校巴「${bus.plateNumber}」已新增`);
        (props as BusProps).onCreated(bus);
      } else if (mode === 'driver') {
        const driver: Driver = {
          id: STORAGE.genId('driver'),
          clientId,
          name: name.trim(),
          phone: phone.trim(),
          licenseNumber: license.trim(),
          photo: null,
          status: 'available',
          createdAt: new Date().toISOString(),
        };
        STORAGE.drivers.add(driver);
        window.dispatchEvent(new CustomEvent('cbl-drivers-refresh'));
        toast.success(`司機「${driver.name}」已新增`);
        (props as DriverProps).onCreated(driver);
      } else {
        // 保姆模式: 完整資料 = 保姆紀錄 + 登入帳號 (與保姆管理頁 handleSave 一致)
        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();
        // 員工編號 race-safe: 寫入當下重新生成一次, 避免 preview 與實際重號
        const finalEmployeeId = STORAGE.nannies.generateEmployeeId(clientId);
        // 1) 登入帳號 (cbl_users, role=nanny, 密碼預設為電話)
        const existingUser = STORAGE.users.findByPhone(trimmedPhone);
        if (existingUser) {
          STORAGE.users.update(existingUser.id, { name: trimmedName });
        } else {
          STORAGE.users.add({
            id: STORAGE.genId('user'),
            phone: trimmedPhone,
            password: trimmedPhone,
            role: 'nanny',
            name: trimmedName,
            clientId,
            status: 'active',
            createdAt: new Date().toISOString(),
          });
        }
        window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
        // 2) 背景推登入帳號到雲端 (不阻擋 UI, 與保姆管理頁邏輯一致)
        try {
          const { supabaseUsers } = await import('@/lib/supabase-users');
          const account = STORAGE.users.findByPhone(trimmedPhone);
          if (account) {
            const existing = await supabaseUsers.findByPhone(trimmedPhone);
            if (existing.data) {
              await supabaseUsers.update(existing.data.id, { name: trimmedName });
            } else {
              await supabaseUsers.add({
                id: account.id,
                phone: account.phone,
                password: account.password,
                role: 'nanny',
                name: account.name,
                clientId: account.clientId,
                status: account.status,
                createdAt: account.createdAt,
              });
            }
          }
        } catch (e) {
          console.warn('[InlineMiniFormModal] nanny user cloud push failed:', e);
        }
        // 3) 保姆紀錄
        const nanny: Nanny = {
          id: STORAGE.genId('nanny'),
          clientId,
          name: trimmedName,
          phone: trimmedPhone,
          employeeId: finalEmployeeId,
          photo: null,
          assignedBusIds: [],
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        STORAGE.nannies.add(nanny);
        // 保姆事件有兩種拼法並存 → 同時送兩種 (相容所有監聽端)
        window.dispatchEvent(new CustomEvent('cbl-nannies-refresh'));
        window.dispatchEvent(new CustomEvent('cbl-nannys-refresh'));
        // 4) 背景推保姆到雲端 (cbl_nannies, 不阻擋 UI)
        try {
          const { supabaseNannies } = await import('@/lib/supabase-entities');
          const res = await supabaseNannies.add(nanny);
          if (!res.success) {
            console.warn('[InlineMiniFormModal] nanny cloud push failed:', res.error);
          }
        } catch (e) {
          console.warn('[InlineMiniFormModal] nanny cloud push failed:', e);
        }
        toast.success(`保姆「${nanny.name}」已新增！登入帳號已建立 (密碼預設為電話)`);
        (props as NannyProps).onCreated(nanny);
      }
      onClose();
    } catch (e) {
      console.error('[InlineMiniFormModal] handleSubmit error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`新增失敗：${msg}`);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="inline-mini-form-backdrop"
          role="presentation"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[440px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inline-mini-form-title"
            aria-busy={isSaving || undefined}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                <Icon width={18} height={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="inline-mini-form-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  {meta.title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  {meta.subtitle}
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
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {mode === 'bus' && (
                <>
                  <div>
                    <LabeledInput
                      id="inline-bus-plate"
                      label="車牌"
                      value={plateNumber}
                      onChange={(v) => setPlateNumber(v.toUpperCase())}
                      onBlur={() => markTouched('plateNumber')}
                      placeholder="AB-1234"
                      required
                      icon={<Hash width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.plateNumber ? errors.plateNumber : null} />
                  </div>
                  <div>
                    <LabeledInput
                      id="inline-bus-model"
                      label="型號"
                      value={model}
                      onChange={setModel}
                      onBlur={() => markTouched('model')}
                      placeholder="Toyota Coaster"
                      required
                    />
                    <InlineFieldError message={touched.model ? errors.model : null} />
                  </div>
                  <div className="md:col-span-2">
                    <LabeledInput
                      id="inline-bus-capacity"
                      label="座位上限"
                      value={capacity}
                      onChange={(v) => setCapacity(v.replace(/\D/g, '').slice(0, 3))}
                      onBlur={() => markTouched('capacity')}
                      placeholder="28"
                      type="tel"
                      inputMode="numeric"
                      required
                      maxLength={3}
                      icon={<BusIcon width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.capacity ? errors.capacity : null} />
                  </div>
                </>
              )}

              {mode === 'driver' && (
                <>
                  <div>
                    <LabeledInput
                      id="inline-driver-name"
                      label="姓名"
                      value={name}
                      onChange={setName}
                      onBlur={() => markTouched('name')}
                      placeholder="陳大明"
                      required
                      icon={<IdCard width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.name ? errors.name : null} />
                  </div>
                  <div>
                    <LabeledInput
                      id="inline-driver-phone"
                      label="電話"
                      value={phone}
                      onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 8))}
                      onBlur={() => markTouched('phone')}
                      placeholder="91234567"
                      type="tel"
                      inputMode="tel"
                      maxLength={8}
                      required
                      icon={<Phone width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.phone ? errors.phone : null} />
                  </div>
                  <div className="md:col-span-2">
                    <LabeledInput
                      id="inline-driver-license"
                      label="駕照號碼"
                      value={license}
                      onChange={setLicense}
                      onBlur={() => markTouched('license')}
                      placeholder="D1234567"
                      required
                      icon={<IdCard width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.license ? errors.license : null} />
                  </div>
                </>
              )}

              {mode === 'nanny' && (
                <>
                  <div className="md:col-span-2">
                    <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-1 inline-flex items-center gap-1.5 dark:text-slate-400">
                      員工編號
                      <span className="text-[10px] text-slate-400 normal-case font-medium tracking-normal">
                        (自動生成, 不可修改)
                      </span>
                    </label>
                    <div className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 text-[12px] font-mono text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <Hash width={11} height={11} className="text-slate-400" />
                      {employeeIdPreview || '—'}
                    </div>
                  </div>
                  <div>
                    <LabeledInput
                      id="inline-nanny-name"
                      label="姓名"
                      value={name}
                      onChange={setName}
                      onBlur={() => markTouched('name')}
                      placeholder="李小美"
                      required
                      icon={<IdCard width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.name ? errors.name : null} />
                  </div>
                  <div>
                    <LabeledInput
                      id="inline-nanny-phone"
                      label="電話 (登入帳號)"
                      value={phone}
                      onChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 8))}
                      onBlur={() => markTouched('phone')}
                      placeholder="91234567"
                      type="tel"
                      inputMode="tel"
                      maxLength={8}
                      required
                      icon={<Phone width={12} height={12} />}
                    />
                    <InlineFieldError message={touched.phone ? errors.phone : null} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-800/90 leading-relaxed dark:border-blue-800/40 dark:bg-blue-950/30 dark:text-blue-200/90">
                      登入帳號會自動建立：帳號 = 電話，密碼預設 = 電話，保姆首次登入後可至「個人資料」修改。狀態預設為啟用，可登入打卡。
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400">
                <Pill tone="info" size="sm">
                  <Plus width={9} height={9} />
                  即時新增
                </Pill>
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
                  onClick={handleSubmit}
                  isLoading={isSaving}
                  disabled={!canSubmit}
                  startIcon={!isSaving ? <Save width={12} height={12} /> : undefined}
                >
                  新增
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
