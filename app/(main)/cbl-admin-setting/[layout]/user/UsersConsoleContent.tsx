'use client';

/**
 * UsersConsoleContent — OneFleet-style operator console
 *
 * 設計語言: 與 /cbl-admin-setting/[layout]/students/StudentsConsoleContent 對齊
 *   - L1 Header Row (Title + Stat Tiles)
 *   - L2 Action Toolbar
 *   - L3 Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   - L4 Per-Row Layout
 *   - L5 Empty / Loading / Error States
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/user/ 內使用。
 *
 * 重用 /cbl-admin-setting/[layout]/students/primitives.tsx 中的 Pill / Dot / Button /
 * IconButton / Card / SectionHeader / StatTile / FilterTabGroup, 不重複造輪。
 *
 * UserFeatureModal 同樣放在本子目錄, 不依賴全域 components/ui/*。
 *
 * 注意: 此頁是「透過 switch button 把某些功能模組的權限給予其他可登入 user」
 * 的管理頁 — 不是登入者本身的權限設定。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldCheck,
  Pencil,
  Search,
  Users as UsersAllIcon,
  CheckCircle2,
  Archive,
  PowerOff,
  ShieldAlert,
  FolderOpen,
  Power,
  Phone,
  Hash,
  XCircle,
  Sparkles,
  Copy,
  UserCheck,
  UserPlus,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  Pill,
  Dot,
  Button,
  IconButton,
  Card,
  SectionHeader,
  StatTile,
  FilterTabGroup,
  type FilterTabOption,
} from '../students/primitives';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
} from '../students/design-tokens';
import { UserFeatureModal } from './UserFeatureModal';
import { UserAccountFormModal } from './UserAccountFormModal';
import { ClientFormModal } from '../clients/ClientFormModal';
import {
  EMPTY_CLIENT_FORM,
  type ClientFormState,
} from '../clients/types';
import {
  USER_TAB_ACCENT,
  USER_TAB_LABELS,
  emptyFeatureForm,
  FEATURE_KEYS,
  FEATURE_META,
  ROLE_DEFAULT_FEATURES,
  ROLE_LABELS,
  ROLE_TONES,
  EMPTY_ACCOUNT_FORM,
  type UserAccountFormState,
  type UserFeatureFormState,
  type UserTab,
} from './types';
import type { User, UserRole, Client, Company } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<UserTab>[] = [
  { value: 'all',         label: '全部',           icon: <UsersAllIcon width={11} height={11} /> },
  { value: 'system_admin', label: '系統開發者',    icon: <ShieldAlert width={11} height={11} /> },
  { value: 'super_admin', label: '系統管理員',     icon: <ShieldCheck width={11} height={11} /> },
  { value: 'client',      label: '客戶管理員',     icon: <UserCheck width={11} height={11} /> },
  { value: 'nanny',       label: '保姆',           icon: <CheckCircle2 width={11} height={11} /> },
  { value: 'parent',      label: '家長',           icon: <PowerOff width={11} height={11} /> },
];

const PAGE_SIZE = 10;

/** 列表排序權重 — 系統開發者永遠置頂 */
const ROLE_SORT_ORDER: Record<UserRole, number> = {
  system_admin: 0,
  super_admin: 1,
  client: 2,
  nanny: 3,
  parent: 4,
};

/* -------------------------------------------------------------------------- */
/*  ToggleSwitch — iOS-style switch (與 announcements 一致)                       */
/* -------------------------------------------------------------------------- */

function ToggleSwitch({
  checked,
  onChange,
  title,
  size = 'md',
}: {
  checked: boolean;
  onChange: () => void;
  title?: string;
  size?: 'sm' | 'md';
}) {
  const dims =
    size === 'sm'
      ? 'h-[18px] w-[32px]'
      : 'h-[22px] w-[40px]';
  const thumb =
    size === 'sm'
      ? 'h-[14px] w-[14px]'
      : 'h-[18px] w-[18px]';
  const translateOn = size === 'sm' ? 'translate-x-[16px]' : 'translate-x-[20px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        dims,
        checked
          ? 'bg-blue-600 dark:bg-blue-500'
          : 'bg-slate-200 dark:bg-slate-700',
      )}
    >
      <span className="sr-only">{title ?? (checked ? '停用' : '啟用')}</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-out my-[2px]',
          thumb,
          checked ? translateOn : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status helpers                                                              */
/* -------------------------------------------------------------------------- */

function statusBadge(status: User['status']) {
  if (status === 'active') {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        啟用
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" size="sm">
      <Dot tone="neutral" />
      停用
    </Pill>
  );
}

function roleBadge(role: UserRole) {
  return (
    <Pill tone={ROLE_TONES[role]} size="sm">
      {ROLE_LABELS[role]}
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** 為某 user 解析「目前功能 map」: 優先用 storage 內已存, 否則套角色預設 */
function resolveFeatures(
  userId: string,
  role: UserRole,
  stored: Record<string, Record<string, boolean>>,
): Record<string, boolean> {
  const found = stored[userId];
  if (found) {
    // 完整化 (補上 storage 沒存的 key, 預設 false)
    const next: Record<string, boolean> = {};
    for (const k of FEATURE_KEYS) next[k] = !!found[k];
    return next;
  }
  // 套角色預設
  const seed = ROLE_DEFAULT_FEATURES[role] ?? [];
  const next: Record<string, boolean> = {};
  for (const k of FEATURE_KEYS) next[k] = seed.includes(k);
  return next;
}

function formatSystemAdminDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/* -------------------------------------------------------------------------- */
/*  Main content                                                                */
/* -------------------------------------------------------------------------- */

export interface UsersConsoleContentProps {
  users: User[];
  /** Initial loading flag — true if we haven't loaded yet on mount. */
  initiallyLoading?: boolean;
  /** 學校列表 (cbl_clients = 學校表) — 新增帳號時供「所屬學校」下拉選單使用 */
  clients?: Client[];
  /** 機構/公司列表 (cbl_companies) — 新增帳號時供「所屬機構」下拉選單使用 */
  companies?: Company[];
  /** 目前登入者 id — 用於標示「這是我自己」並防止自我停用 */
  currentUserId?: string;
  /** 目前登入者角色 — 只有 system_admin 能建立 system_admin 帳號 (防提權) */
  currentUserRole?: UserRole;
}

export function UsersConsoleContent({
  users,
  initiallyLoading = false,
  clients = [],
  companies: companiesProp,
  currentUserId,
  currentUserRole,
}: UsersConsoleContentProps) {
  const toast = useToast();
  // companies：優先用 props，否則從 STORAGE 讀（避免外層忘記傳就空白）
  const [companiesFallback, setCompaniesFallback] = React.useState<Company[]>([]);
  React.useEffect(() => {
    if (companiesProp) return;
    let cancelled = false;
    (async () => {
      try {
        const { STORAGE } = await import('@/lib/storage');
        if (!cancelled) setCompaniesFallback(STORAGE.companies.getAll());
      } catch {
        if (!cancelled) setCompaniesFallback([]);
      }
    })();
    return () => { cancelled = true; };
  }, [companiesProp]);
  const companies = companiesProp ?? companiesFallback;
  const [tab, setTab] = React.useState<UserTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);

  /** 從 storage 載入的權限矩陣 — 每次 save 後立即同步 */
  const [permMatrix, setPermMatrix] = React.useState<
    Record<string, Record<string, boolean>>
  >({});

  /** Edit modal state */
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    initial: UserFeatureFormState;
  }>({ open: false, initial: emptyFeatureForm('', 'nanny') });
  const [isSaving, setIsSaving] = React.useState(false);

  /** 新增 / 編輯「登入帳號」modal state */
  const [accountModal, setAccountModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    editingId?: string;
    initial: UserAccountFormState;
  }>({
    open: false,
    mode: 'add',
    initial: EMPTY_ACCOUNT_FORM,
  });
  const [isSavingAccount, setIsSavingAccount] = React.useState(false);

  /**
   * 「＋ 在此新增學校…」— 從「新增登入帳號」modal 內觸發
   *
   * 學校建立成功後會把新學校的 id 回填到帳號表單的「所屬學校」,
   * 使用者不需要關掉 modal 再重新選一次。
   */
  const [clientModal, setClientModal] = React.useState<{
    open: boolean;
    initial: ClientFormState;
  }>({ open: false, initial: EMPTY_CLIENT_FORM });
  const [isSavingClient, setIsSavingClient] = React.useState(false);
  /** 新機構建立成功後要回填的 clientId */
  const [pendingClientId, setPendingClientId] = React.useState<string | null>(null);

  /* -------- 初始載入 storage 內的權限矩陣 -------- */
  const loadPerms = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const { STORAGE } = await import('@/lib/storage');
      setPermMatrix(STORAGE.userFeaturePermissions.getAll());
    } catch {
      setPermMatrix({});
    }
  }, []);

  React.useEffect(() => {
    loadPerms();
  }, [loadPerms]);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Simulated initial load -------- */
  React.useEffect(() => {
    if (!initiallyLoading) return;
    setIsLoading(true);
    const id = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [initiallyLoading]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = users.filter((u) => {
      if (tab !== 'all' && u.role !== tab) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      );
    });
    // 系統開發者置頂,其餘按角色權重,其次按姓名
    return [...list].sort((a, b) => {
      const wa = ROLE_SORT_ORDER[a.role] ?? 99;
      const wb = ROLE_SORT_ORDER[b.role] ?? 99;
      if (wa !== wb) return wa - wb;
      return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    });
  }, [users, tab, debouncedSearch]);

  /* -------- Stats -------- */
  const total = users.length;
  const activeCount = users.filter((u) => u.status === 'active').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive').length;
  // 已自訂權限的 user 數 (storage 內有紀錄)
  const customizedCount = Object.keys(permMatrix).length;
  // 已授權的功能總開關數 (用於「已授權功能」stat tile)
  const enabledFlagsCount = React.useMemo(() => {
    let n = 0;
    for (const u of users) {
      const flags = resolveFeatures(u.id, u.role, permMatrix);
      for (const k of FEATURE_KEYS) if (flags[k]) n += 1;
    }
    return n;
  }, [users, permMatrix]);

  /* -------- Pagination -------- */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

  /* -------- Handlers -------- */

  const openEdit = React.useCallback(
    (u: User) => {
      const features = resolveFeatures(u.id, u.role, permMatrix);
      setFormModal({
        open: true,
        initial: {
          userId: u.id,
          role: u.role,
          features,
        },
      });
    },
    [permMatrix],
  );

  const handleSave = React.useCallback(
    async (state: UserFeatureFormState) => {
      setIsSaving(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        STORAGE.userFeaturePermissions.set(state.userId, { ...state.features });
        // 同步本地 state (避免 reload)
        setPermMatrix((prev) => ({
          ...prev,
          [state.userId]: { ...state.features },
        }));
        const u = users.find((x) => x.id === state.userId);
        toast.success(`「${u?.name ?? '用戶'}」的功能權限已更新`);
        setFormModal((p) => ({ ...p, open: false }));
      } catch (err) {
        console.error('[UsersConsole] handleSave error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`儲存失敗：${msg}`);
      } finally {
        setIsSaving(false);
      }
    },
    [users, toast],
  );

  /* -------- 帳號 (新增 / 編輯) handlers -------- */

  /** 從帳號表單開啟「新增學校」modal (疊在帳號 modal 之上) */
  const openCreateClient = React.useCallback(() => {
    setClientModal({ open: true, initial: EMPTY_CLIENT_FORM });
  }, []);

  /**
   * 建立學校 — 寫入 Supabase + localStorage, 然後把新學校回填到帳號表單
   *
   * 為什麼自己寫而不是直接呼叫 ClientsConsoleContent 的 handleSave:
   * - 兩個頁面的 client list 來源不同 (這裡是 props.clients, 那邊是 storage)
   * - 這裡需要的是「建立後回填 clientId」而不是「更新列表」
   */
  const handleSaveClient = React.useCallback(
    async (state: ClientFormState) => {
      setIsSavingClient(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const { supabaseClients } = await import('@/lib/supabase-clients');

        const now = new Date().toISOString();
        const newClient: Client = {
          id: STORAGE.genId('client'),
          name: state.name,
          email: state.email,
          phone: state.phone,
          address: state.address,
          logo: state.logo || null,
          primaryColor: state.primaryColor,
          academicYear: state.academicYear,
          status: state.status,
          createdAt: now,
          updatedAt: now,
        };

        const result = await supabaseClients.add(newClient);
        if (!result.success) {
          console.error('[UsersConsole] supabaseClients.add failed:', result.error);
          toast.error(`新增學校失敗：${result.error ?? '未知錯誤'}`);
          return;
        }

        STORAGE.clients.add(newClient);
        window.dispatchEvent(new CustomEvent('cbl-clients-refresh'));

        // 回填到帳號表單的「所屬學校」
        setPendingClientId(newClient.id);
        setAccountModal((p) => ({
          ...p,
          initial: { ...p.initial, clientId: newClient.id },
        }));

        setClientModal((p) => ({ ...p, open: false }));
        toast.success(`學校 ${state.name} 新增成功！`);
      } catch (err) {
        console.error('[UsersConsole] handleSaveClient error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`新增學校失敗: ${msg}`);
      } finally {
        setIsSavingClient(false);
      }
    },
    [toast],
  );

  /** 開啟「新增帳號」modal — 預設角色為 client, 機構預設帶入目前登入者的 clientId */
  const openAddAccount = React.useCallback(() => {
    const defaultClientId =
      users.find((u) => u.id === currentUserId)?.clientId ??
      clients[0]?.id ??
      null;
    setAccountModal({
      open: true,
      mode: 'add',
      editingId: undefined,
      initial: {
        ...EMPTY_ACCOUNT_FORM,
        clientId: defaultClientId,
      },
    });
  }, [users, currentUserId, clients]);

  /** 開啟「編輯帳號」modal — 帶入既有資料 (密碼留空 = 不更改) */
  const openEditAccount = React.useCallback((u: User) => {
    setAccountModal({
      open: true,
      mode: 'edit',
      editingId: u.id,
      initial: {
        name: u.name,
        phone: u.phone,
        // 密碼不預填 (避免在畫面上裸露); 留空代表不修改
        password: '',
        email: u.email ?? '',
        role: u.role,
        clientId: u.clientId ?? null,
        companyId: u.companyId ?? null,
        status: u.status,
      },
    });
  }, []);

  /**
   * 儲存帳號 (新增 or 編輯)
   *
   * 寫入順序: localStorage 先寫 (讓 UI 即時反映), 再寫 Supabase (確保下次
   * syncFromSupabase() 不會把新帳號覆蓋掉)。Supabase 失敗會 rollback
   * localStorage 並提示錯誤。
   */
  const handleSaveAccount = React.useCallback(
    async (state: UserAccountFormState) => {
      setIsSavingAccount(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const { supabaseUsers } = await import('@/lib/supabase-users');

        const isEdit = accountModal.mode === 'edit';
        const editingId = accountModal.editingId;

        // 編輯模式: 密碼留空代表不更改
        const password =
          state.password.trim().length > 0 ? state.password : undefined;

        // 防止自己把自己停用 (會把自己鎖在系統外)
        if (isEdit && editingId === currentUserId && state.status === 'inactive') {
          toast.error('不能停用自己的帳號');
          return;
        }

        // 防提權: 只有 system_admin 能建立/指派 system_admin 角色
        if (state.role === 'system_admin' && currentUserRole !== 'system_admin') {
          toast.error('只有系統開發者才能建立 system_admin 帳號');
          return;
        }
        // 防自降: system_admin 不能把自己改成別的角色 (避免鎖死最高權限)
        if (isEdit && editingId === currentUserId && currentUserRole === 'system_admin' && state.role !== 'system_admin') {
          toast.error('不能變更自己的 system_admin 角色');
          return;
        }

        if (isEdit && editingId) {
          const existing = STORAGE.users.getAll().find((u) => u.id === editingId);
          if (!existing) {
            toast.error('找不到此帳號, 請重新整理後再試');
            return;
          }

          const emailValue = state.email.trim();

          // localStorage patch — User.email 是 string | undefined (留空 = 不設定)
          const localPatch: Partial<User> = {
            name: state.name,
            phone: state.phone,
            email: emailValue || undefined,
            role: state.role,
            clientId: state.clientId ?? undefined,
            companyId: state.companyId ?? null,
            status: state.status,
            ...(password ? { password } : {}),
          };

          // Supabase patch — email / client_id / company_id 欄位可為 null (DB 允許)
          const sbPatch = {
            name: state.name,
            phone: state.phone,
            email: emailValue || null,
            role: state.role,
            clientId: state.clientId ?? null,
            companyId: state.companyId ?? null,
            status: state.status,
            ...(password ? { password } : {}),
          };

          // 1) 先寫 localStorage
          STORAGE.users.update(editingId, localPatch);

          // 2) 再寫 Supabase
          const res = await supabaseUsers.update(editingId, sbPatch);
          if (!res.success) {
            // rollback localStorage
            STORAGE.users.update(editingId, existing);
            toast.error(`儲存失敗：${res.error ?? '未知錯誤'}`);
            return;
          }

          toast.success(`「${state.name}」的帳號資料已更新`);
        } else {
          const newId = STORAGE.genId('user');
          const emailValue = state.email.trim();

          // localStorage 版本 (email / clientId 為 string | undefined)
          const localPayload: User = {
            id: newId,
            phone: state.phone,
            password: state.password,
            role: state.role,
            name: state.name,
            email: emailValue || undefined,
            clientId: state.clientId ?? undefined,
            companyId: state.companyId ?? null,
            status: state.status,
            createdAt: new Date().toISOString(),
          };

          // Supabase 版本 (email / client_id / company_id 可為 null)
          const sbPayload = {
            ...localPayload,
            email: emailValue || null,
            clientId: state.clientId ?? null,
            companyId: state.companyId ?? null,
            photo: null,
          };

          // 1) 先寫 localStorage
          STORAGE.users.add(localPayload);

          // 2) 再寫 Supabase
          const res = await supabaseUsers.add(sbPayload);
          if (!res.success) {
            // rollback localStorage
            STORAGE.users.remove(newId);
            toast.error(`儲存失敗：${res.error ?? '未知錯誤'}`);
            return;
          }

          // 3) 新帳號套用角色預設功能開關
          const { STORAGE: S2 } = await import('@/lib/storage');
          const seed = ROLE_DEFAULT_FEATURES[state.role] ?? [];
          const features: Record<string, boolean> = {};
          for (const k of FEATURE_KEYS) features[k] = seed.includes(k);
          S2.userFeaturePermissions.set(newId, features);
          setPermMatrix((prev) => ({ ...prev, [newId]: features }));

          toast.success(`帳號「${state.name}」已建立`);
        }

        setAccountModal((p) => ({ ...p, open: false }));
        window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
      } catch (err) {
        console.error('[UsersConsole] handleSaveAccount error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`儲存失敗：${msg}`);
      } finally {
        setIsSavingAccount(false);
      }
    },
    [accountModal.mode, accountModal.editingId, currentUserId, currentUserRole, toast],
  );

  /* -------- Render -------- */

  const accent = USER_TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
            <ShieldCheck width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                用戶 · 功能權限
              </h1>
              <Pill tone="primary" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 個
              </Pill>
              {customizedCount > 0 && (
                <Pill tone="violet" size="sm">
                  <Sparkles width={9} height={9} />
                  {customizedCount} 自訂
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              透過 switch button, 把某些功能模組的權限「給予」其他可登入的用戶。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 lg:w-[560px]">
          <StatTile
            label="啟用中"
            value={activeCount}
            hint={`${total} 個帳號總數`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="success"
          />
          <StatTile
            label="停用"
            value={inactiveCount}
            hint="無法登入"
            icon={<Archive width={12} height={12} />}
            tone="warning"
          />
          <StatTile
            label="已自訂"
            value={customizedCount}
            hint="覆寫角色預設"
            icon={<Sparkles width={12} height={12} />}
            tone="violet"
          />
          <StatTile
            label="授權開關"
            value={enabledFlagsCount}
            hint="所有 user 加總"
            icon={<ShieldAlert width={12} height={12} />}
            tone="primary"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="primary"
          size="sm"
          startIcon={<UserPlus width={12} height={12} />}
          onClick={openAddAccount}
        >
          新增帳號
        </Button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Pill tone="primary" size="sm">
          {filtered.length} 筆符合
        </Pill>

        <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline">
            編輯 user 開關以調整其可登入後看到的後台模組
          </span>
        </div>
      </div>

      {/* L3. Table Card */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<ShieldCheck width={18} height={18} />}
          title={`${USER_TAB_LABELS[tab]}用戶`}
          subtitle={`${filtered.length} 筆 · ${USER_TAB_LABELS[tab]} · 可切換 tab 篩選角色`}
          accent={accent.header}
          actions={
            <Pill tone={accent.pill} size="sm">
              {filtered.length}
            </Pill>
          }
        />

        {/* L3b. Filter Bar (tabs + refresh + search) */}
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
          <FilterTabGroup
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            options={TAB_OPTIONS}
            layoutId="users-tab-pill"
          />

          <div className="relative ml-auto min-w-[220px]">
            <Search
              width={11}
              height={11}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名、Email、手機…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="清除搜尋"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* L3c. Table scroll region */}
        <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto dark:border-slate-700/80">
          <AnimatePresence mode="wait" initial={false}>
            {isLoading ? (
              <SkeletonRows key="loading" />
            ) : filtered.length === 0 ? (
              <EmptyState
                key={`empty-${tab}-${debouncedSearch}`}
                tab={tab}
                search={debouncedSearch}
              />
            ) : (
              <DataTable
                key={`rows-${tab}`}
                rows={pageItems}
                permMatrix={permMatrix}
                onEdit={openEdit}
                onEditAccount={openEditAccount}
                currentUserId={currentUserId}
              />
            )}
          </AnimatePresence>
        </div>

        {/* L3d. Pagination footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500 gap-3 flex-wrap dark:bg-slate-900/40 dark:border-slate-700/80 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              顯示
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {showingFrom}
              </span>
              -
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {showingTo}
              </span>
              共
              <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                {filtered.length}
              </span>
              筆
              <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
              <Dot tone="primary" />
              第 {safePage} / {pageCount} 頁
            </span>
            {pageCount > 1 && (
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  ‹ 上一頁
                </Button>
                <span className="px-2 text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{safePage}</span>
                  <span className="text-slate-400 dark:text-slate-500"> / {pageCount}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage >= pageCount}
                >
                  下一頁 ›
                </Button>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* L4. Modal */}
      <UserFeatureModal
        open={formModal.open}
        initial={formModal.initial}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => setFormModal((p) => ({ ...p, open: false }))}
      />

      <UserAccountFormModal
        open={accountModal.open}
        mode={accountModal.mode}
        initial={accountModal.initial}
        existingPhones={users.map((u) => u.phone)}
        clients={clients}
        companies={companies}
        onCreateClient={openCreateClient}
        preselectClientId={pendingClientId}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        isSaving={isSavingAccount}
        onSave={handleSaveAccount}
        onClose={() => setAccountModal((p) => ({ ...p, open: false }))}
      />

      {/* 「＋ 在此新增學校…」— 疊在帳號 modal 之上 (z-[60]) */}
      <ClientFormModal
        open={clientModal.open}
        mode="add"
        initial={clientModal.initial}
        isSaving={isSavingClient}
        onSave={handleSaveClient}
        onClose={() => setClientModal((p) => ({ ...p, open: false }))}
        zIndexClass="z-[60]"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkeletonRows — Loading state (規範 §13)                                       */
/* -------------------------------------------------------------------------- */

function SkeletonRows() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse dark:bg-slate-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
            <div className="h-5 w-12 bg-slate-100 rounded animate-pulse dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EmptyState (規範 §13)                                                        */
/* -------------------------------------------------------------------------- */

function EmptyState({ tab, search }: { tab: UserTab; search: string }) {
  return (
    <motion.div
      key={`empty-${tab}-${search}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}
    >
      <div className="flex flex-col items-center gap-2 py-12 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <FolderOpen width={20} height={20} />
        </div>
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
          {search
            ? '沒有符合條件的用戶'
            : tab === 'all'
            ? '目前尚未建立任何用戶帳號'
            : `目前沒有「${USER_TAB_LABELS[tab]}」角色的用戶`}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : '用戶可在「保姆」「家長」「司機」等模組新增時自動建立, 也可在登入頁註冊。'}
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DataTable (規範 §17 + §12)                                                   */
/* -------------------------------------------------------------------------- */

function DataTable({
  rows,
  permMatrix,
  onEdit,
  onEditAccount,
  currentUserId,
}: {
  rows: User[];
  permMatrix: Record<string, Record<string, boolean>>;
  onEdit: (u: User) => void;
  onEditAccount: (u: User) => void;
  currentUserId?: string;
}) {
  return (
    <table
      className="w-full">
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            用戶
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            角色
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            電話 (登入帳號)
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            已授權功能
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            狀態
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => {
          const features = resolveFeatures(u.id, u.role, permMatrix);
          const enabledKeys = FEATURE_KEYS.filter((k) => features[k]);
          const isMe = u.id === currentUserId;

          return (
            <tr
              key={u.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
            >
              {/* 用戶 (avatar + name + email) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[12px] font-semibold ring-2 ring-white shadow-sm dark:ring-slate-900">
                    {u.name?.slice(0, 1) ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[200px] dark:text-slate-100"
                      title={u.name}
                    >
                      {u.name || '(未命名)'}
                      {isMe && (
                        <span className="ml-1.5 align-middle inline-flex items-center px-1 py-px rounded text-[9.5px] font-semibold bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                          我
                        </span>
                      )}
                    </p>
                    <p
                      className="text-[10px] text-slate-500 truncate max-w-[200px] dark:text-slate-400"
                      title={u.email}
                    >
                      {u.email || '—'}
                    </p>
                  </div>
                </div>
              </td>

              {/* 角色 */}
              <td className="px-3 py-2.5">{roleBadge(u.role)}</td>

              {/* 電話 (登入帳號) — 可複製 */}
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(u.phone).catch(() => {});
                    }
                  }}
                  title="複製登入帳號"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:text-slate-200"
                >
                  <Phone width={9} height={9} />
                  {u.phone}
                  <Copy width={9} height={9} />
                </button>
              </td>

              {/* 已授權功能 chip 摘要 */}
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {enabledKeys.length === 0 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                      <XCircle width={9} height={9} />
                      無授權
                    </span>
                  ) : (
                    <>
                      {enabledKeys.slice(0, 3).map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50"
                          title={FEATURE_META[k].label}
                        >
                          <CheckCircle2 width={9} height={9} />
                          {FEATURE_META[k].label}
                        </span>
                      ))}
                      {enabledKeys.length > 3 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                          +{enabledKeys.length - 3}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </td>

              {/* 狀態 */}
              <td className="px-3 py-2.5">
                {statusBadge(u.status)}
              </td>

              {/* 操作 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton
                    onClick={() => onEditAccount(u)}
                    title="編輯帳號 (姓名 / 角色 / 密碼)"
                  >
                    <UserCog width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onEdit(u)}
                    title="編輯功能權限"
                  >
                    <Pencil width={13} height={13} />
                  </IconButton>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}