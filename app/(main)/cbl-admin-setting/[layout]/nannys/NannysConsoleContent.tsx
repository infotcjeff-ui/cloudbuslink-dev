'use client';

/**
 * NannysConsoleContent — OneFleet-style operator console
 *
 * 設計語言: 與 /cbl-admin-setting/[layout]/students/StudentsConsoleContent 對齊
 *   - L1 Header Row (Title + Stat Tiles)
 *   - L2 Action Toolbar
 *   - L3 Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   - L4 Per-Row Layout
 *   - L5 Empty / Loading / Error States
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/nannys/ 內使用。
 *
 * 重用 /cbl-admin-setting/[layout]/students/primitives.tsx 中的 Pill / Dot / Button /
 * IconButton / Card / SectionHeader / StatTile / FilterTabGroup, 不重複造輪。
 *
 * NannyFormModal 同樣放在本子目錄, 不依賴全域 components/ui/*。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Heart,
  UserPlus,
  Pencil,
  Trash2,
  Eye,
  Search,
  Users as UsersAllIcon,
  AlertCircle,
  FolderOpen,
  CheckCircle2,
  Phone,
  Hash,
  Bus as BusIcon,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/components/ui/toast';
import { CopyChip } from '@/components/ui/copy-button';
import { STORAGE } from '@/lib/storage';
import { useAuthClientId } from '@/lib/use-client-id';
import { dispatchNannyRefresh } from '@/lib/cbl-events';
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
import { NannyFormModal } from './NannyFormModal';
import {
  EMPTY_NANNY_FORM,
  type NannyFormState,
  type NannyTab,
} from './types';
import type { Nanny, Bus, User } from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
} from './design-tokens';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<NannyTab>[] = [
  {
    value: 'all',
    label: '全部',
    icon: <CheckCircle2 width={11} height={11} />,
  },
  {
    value: 'unassigned',
    label: '未分配校巴',
    icon: <AlertCircle width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  NannyTab,
  { header: 'primary' | 'warning' | 'danger'; pill: 'primary' | 'warning' | 'danger' }
> = {
  all: {
    header: 'primary',
    pill: 'primary',
  },
  unassigned: {
    header: 'warning',
    pill: 'warning',
  },
};

const PAGE_SIZE = 10;

/* -------------------------------------------------------------------------- */
/*  指派狀態 helper (保姆沒有啟用/停用概念, 只看有沒有指派校巴)                       */
/* -------------------------------------------------------------------------- */

function assignBadge(assignedCount: number) {
  if (assignedCount > 0) {
    return (
      <Pill tone="success" size="sm">
        <Dot tone="success" />
        已指派
      </Pill>
    );
  }
  return (
    <Pill tone="warning" size="sm">
      <Dot tone="warning" />
      未指派
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 確認刪除對話框 (規範 §14)                                  */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  nannyName,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  nannyName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-delete-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14, ease: ANIMATION_EASE }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            className="relative w-full max-w-[420px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, ease: ANIMATION_EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 shrink-0 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                <Trash2 width={18} height={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="confirm-delete-title"
                  className="text-[14px] font-semibold text-slate-900 dark:text-slate-100"
                >
                  確認刪除保姆
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷, 將一併解除此保姆的校巴指派。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除 <span className="font-semibold">{nannyName}</span>？
              </p>
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-start gap-1">
                <AlertCircle width={11} height={11} className="shrink-0 mt-px" />
                <span>
                  對應的登入帳號也會一併刪除, 此保姆的所有校巴指派會被解除, 但校巴資料本身不會被刪除。
                </span>
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-end gap-2 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent text-[12px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={onConfirm}
              >
                確認刪除
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main content                                                                */
/* -------------------------------------------------------------------------- */

export interface NannysConsoleContentProps {
  nannies: Nanny[];
  buses: Bus[];
  /** 全部 user 帳號 (供檢視 popup 顯示保姆登入密碼) */
  users: User[];
  /** Initial loading flag — true if we haven't loaded yet on mount. */
  initiallyLoading?: boolean;
}

export function NannysConsoleContent({
  nannies,
  buses,
  users,
  initiallyLoading = false,
}: NannysConsoleContentProps) {
  const toast = useToast();
  const [tab, setTab] = React.useState<NannyTab>('all');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);

  // Form modal state
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    initial: NannyFormState;
    editingId: string | undefined;
    editingEmployeeId: string | undefined;
  }>({
    open: false,
    mode: 'add',
    initial: EMPTY_NANNY_FORM,
    editingId: undefined,
    editingEmployeeId: undefined,
  });
  const [isSaving, setIsSaving] = React.useState(false);

  // Detail popup (inline expand using DetailModal — 同 parents 用輕量範式)
  const [viewingNanny, setViewingNanny] = React.useState<Nanny | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Nanny | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  /* -------- Debounced search (300ms) -------- */
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  /* -------- Simulated initial load (one-shot, only first mount) -------- */
  React.useEffect(() => {
    if (!initiallyLoading) return;
    setIsLoading(true);
    const id = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(id);
  }, [initiallyLoading]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return nannies.filter((n) => {
      if (tab === 'unassigned' && n.assignedBusIds.length > 0) return false;
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.phone.includes(q) ||
        (n.accountName ?? '').toLowerCase().includes(q) ||
        (n.employeeId ?? '').toLowerCase().includes(q)
      );
    });
  }, [nannies, tab, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const total = nannies.length;
  const unassignedCount = nannies.filter(
    (n) => n.assignedBusIds.length === 0,
  ).length;

  /* -------- 計算每位保姆的校巴 (高效索引) -------- */
  const busesById = React.useMemo(() => {
    const m = new Map<string, Bus>();
    buses.forEach((b) => m.set(b.id, b));
    return m;
  }, [buses]);

  /* -------- 索引 users by phone (供檢視 popup 與校驗) -------- */
  const usersByPhone = React.useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.phone, u));
    return m;
  }, [users]);

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
  // 當前登入者的 clientId (供 form 內員工編號 preview 使用)
  // 超管沒有 clientId → 用第一筆可見保姆 / 校巴 / 第一間學校兜底
  // (cbl_nannies.client_id 有 FK 必填, 不能寫 '')
  //
  // ⚠️ 用 useAuthClientId (而不是 useMemo + []) 的原因:
  //   useMemo 只在 mount 算一次, 而 localStorage 的 cbl_clients 要等雲端同步
  //   回來才有值 → mount 時 resolveClientId() 找不到學校 → 回傳 ''
  //   → 建立的資料 client_id='' → 撞 FK → 推不上去。
  const authClientId = useAuthClientId();

  // Add mode 預覽的員工編號 (與 storage 同步)
  const [previewEmployeeId, setPreviewEmployeeId] = React.useState<string>(
    'EMP-001',
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const { STORAGE } = await import('@/lib/storage');
        const next = STORAGE.nannies.generateEmployeeId(authClientId);
        if (!cancelled) setPreviewEmployeeId(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authClientId]);

  const openAdd = React.useCallback(() => {
    setFormModal({
      open: true,
      mode: 'add',
      initial: EMPTY_NANNY_FORM,
      editingId: undefined,
      editingEmployeeId: undefined,
    });
  }, []);

  const openEdit = React.useCallback((n: Nanny) => {
    setFormModal({
      open: true,
      mode: 'edit',
      initial: {
        name: n.name,
        phone: n.phone,
        accountName: n.accountName ?? '',
        // 編輯模式: 密碼留空 = 保留現有密碼, 不回填明文
        password: '',
        photo: n.photo ?? null,
        employeeId: n.employeeId,
        employeeIdLocked: true,
        assignedBusIds: [...n.assignedBusIds],
        description: (n as any).description ?? '',
      },
      editingId: n.id,
      editingEmployeeId: n.employeeId,
    });
  }, []);

  const handleSave = React.useCallback(
    async (state: NannyFormState) => {
      setIsSaving(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const { supabaseUsers } = await import('@/lib/supabase-users');
        const phone = state.phone.trim();
        const name = state.name.trim();
        const accountName = state.accountName.trim();
        const editingId = formModal.editingId;
        const isEdit = formModal.mode === 'edit' && !!editingId;

        // 員工編號:
        //   add mode → 使用 STORAGE.nannies.generateEmployeeId 取得 (避免 race)
        //   edit mode → 沿用原 employeeId (使用者不能改)
        const employeeId = isEdit
          ? formModal.editingEmployeeId || ''
          : STORAGE.nannies.generateEmployeeId(authClientId);

        /**
         * 建立 / 更新登入帳號 (cbl_users)。
         *
         * ⚠️ 這一段是「電話有輸入但顯示無帳號」的根因所在:
         *   舊版只在 localStorage 建 user, 沒有 push 到 Supabase。
         *   而 useSyncUsers() → supabaseUsers.syncToStorage() → STORAGE.users.setAll(db)
         *   會用雲端資料「整批覆蓋」localStorage → 剛建立的帳號憑空消失
         *   → 表格的 usersByPhone.get(n.phone) 找不到 → 顯示「無帳號」。
         *
         *   現在: 本機寫完 → 立刻 push 到 cbl_users → 同步成功才視為完成。
         *   帳戶名稱一併寫入, 讓「帳戶名稱」也能當登入帳號。
         *   密碼: 新增模式必填 (表單已校驗); 編輯模式有填才更新, 留空保留現有。
         */
        const upsertLoginAccount = async (opts: {
          userId: string;
          phone: string;
          name: string;
          accountName: string;
          /** 明文密碼; 空字串 = 不更新密碼 (僅編輯模式) */
          password: string;
          clientId: string;
        }): Promise<void> => {
          const existingUser = STORAGE.users.findByPhone(opts.phone);
          const trimmedPwd = opts.password.trim();
          const localUser = existingUser ?? {
            id: opts.userId,
            phone: opts.phone,
            accountName: opts.accountName || undefined,
            password: trimmedPwd,
            role: 'nanny' as const,
            name: opts.name,
            clientId: opts.clientId,
            status: 'active' as const,
            createdAt: new Date().toISOString(),
          };
          // 本機先寫 (含帳戶名稱; 有填密碼才更新密碼)
          if (existingUser) {
            STORAGE.users.update(existingUser.id, {
              name: opts.name,
              accountName: opts.accountName || undefined,
              ...(trimmedPwd ? { password: trimmedPwd } : {}),
            });
          } else {
            STORAGE.users.add(localUser);
          }

          // 再推雲端
          const sbExisting = await supabaseUsers.findByPhone(opts.phone);
          if (sbExisting.data) {
            const res = await supabaseUsers.update(sbExisting.data.id, {
              name: opts.name,
              accountName: opts.accountName || null,
              role: 'nanny',
              clientId: opts.clientId,
              ...(trimmedPwd ? { password: trimmedPwd } : {}),
            });
            if (!res.success) {
              console.warn('[NannysConsole] Supabase user update failed:', res.error);
              toast.warning(`保姆資料已更新，但登入帳號雲端同步失敗：${res.error}`);
            }
          } else {
            const res = await supabaseUsers.add({
              id: localUser.id,
              phone: localUser.phone,
              accountName: opts.accountName || null,
              password: localUser.password,
              role: 'nanny',
              name: opts.name,
              clientId: opts.clientId,
              status: 'active',
              createdAt: localUser.createdAt,
            });
            if (!res.success) {
              console.warn('[NannysConsole] Supabase user add failed:', res.error);
              toast.warning(`保姆已新增但登入帳號雲端同步失敗：${res.error}`);
            }
          }
        };

        if (isEdit) {
          const target = STORAGE.nannies.getById(editingId!);
          if (!target) return;

          const updates = {
            name,
            // 電話不允許修改 (是登入帳號) — 沿用既有電話
            accountName: accountName || undefined,
            photo: state.photo,
            assignedBusIds: state.assignedBusIds,
            // Nanny 介面本身沒有 description 欄位 — 透過 cast 強行寫入 (供將來擴充 / 顯示用)
            ...({ description: state.description } as any),
          } as any;

          STORAGE.nannies.update(target.id, updates);

          // 同步對應 user 帳號 (用 target.phone 找) — 同時推回雲端
          // 密碼留空 = 保留現有, 有填才更新
          await upsertLoginAccount({
            userId: STORAGE.genId('user'),
            phone: target.phone,
            name,
            accountName,
            password: state.password,
            clientId: target.clientId,
          });

          // 推回雲端 (背景)
          const { supabaseNannies } = await import('@/lib/supabase-entities');
          const sbRes = await supabaseNannies.update(target.id, updates);
          if (!sbRes.success) {
            console.warn('[NannysConsole] Supabase update failed:', sbRes.error);
            toast.warning(`保姆資料已更新但雲端同步失敗：${sbRes.error}`);
          }
        } else {
          // Add mode
          //
          // ⚠️ 電話同時是「登入帳號」→ 必須唯一。
          //    原本無條件 STORAGE.nannies.add() → 同一支電話被重複新增時,
          //    雲端 cbl_nannies 會出現兩筆同電話, 而登入時先查到舊那筆
          //    → 顯示舊名字 / 舊密碼。
          //    → 先按電話找既有保姆: 有就更新 (併入), 沒有才新增。
          const existingNanny = STORAGE.nannies.getAll().find((n) => n.phone === phone);
          if (existingNanny) {
            const updates = {
              name,
              accountName: accountName || undefined,
              employeeId,
              photo: state.photo,
              assignedBusIds: state.assignedBusIds,
              ...({ description: state.description } as any),
            } as any;
            STORAGE.nannies.update(existingNanny.id, updates);
            await upsertLoginAccount({
              userId: existingNanny.id,
              phone,
              name,
              accountName,
              password: state.password,
              clientId: authClientId,
            });
            const { supabaseNannies } = await import('@/lib/supabase-entities');
            const sbRes = await supabaseNannies.update(existingNanny.id, updates);
            if (!sbRes.success) {
              console.warn('[NannysConsole] Supabase update failed:', sbRes.error);
              toast.warning(`保姆資料已更新但雲端同步失敗：${sbRes.error}`);
            }
            toast.warning(`電話 ${phone} 已被使用, 已將此筆保姆資料併入現有帳號`);
            setFormModal((p) => ({ ...p, open: false }));
            window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
            window.dispatchEvent(new CustomEvent('cbl-nannies-refresh'));
            return;
          }

          const newNannyId = STORAGE.genId('nanny');
          const newNanny = {
            id: newNannyId,
            clientId: authClientId,
            name,
            phone,
            accountName: accountName || undefined,
            employeeId,
            photo: state.photo,
            assignedBusIds: state.assignedBusIds,
            status: 'active' as const,
            createdAt: new Date().toISOString(),
          };
          STORAGE.nannies.add(newNanny);

          // 建立登入帳號 (本機 + 雲端) — 這是「無帳號」bug 的正確修法
          await upsertLoginAccount({
            userId: STORAGE.genId('user'),
            phone,
            name,
            accountName,
            password: state.password,
            clientId: authClientId,
          });

          // 推回雲端 (背景)
          const { supabaseNannies } = await import('@/lib/supabase-entities');
          const sbRes = await supabaseNannies.add(newNanny);
          if (!sbRes.success) {
            console.warn('[NannysConsole] Supabase add failed:', sbRes.error);
            toast.warning(`保姆已新增，但雲端同步失敗：${sbRes.error}`);
          }
        }

        // 帳號清單有變動 → 通知所有監聽端重載 (表格的「可登入 / 無帳號」標記)
        window.dispatchEvent(new CustomEvent('cbl-users-refresh'));

        setFormModal((p) => ({
          ...p,
          open: false,
        }));
        if (isEdit) {
          toast.success(
            state.password.trim()
              ? `保姆「${name}」資料已更新 (含新密碼)`
              : `保姆「${name}」資料已更新`,
          );
        } else {
          toast.success(
            accountName
              ? `保姆「${name}」新增成功！登入帳號已建立 (帳戶名稱: ${accountName})`
              : `保姆「${name}」新增成功！登入帳號已建立`,
          );
        }
        // 保姆事件有兩種拼法並存 → 用共用 helper 同時送兩種 (相容所有監聽端)
        dispatchNannyRefresh();
      } catch (err) {
        console.error('[NannysConsole] handleSave error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`儲存失敗：${msg}`);
      } finally {
        setIsSaving(false);
      }
    },
    [formModal.mode, formModal.editingId, formModal.editingEmployeeId, authClientId, toast],
  );

  /**
   * 刪除保姆 — 同時清掉對應 user 登入帳號, 並把「任何把此保姆記在
   * 任意 assignedBusIds 列表」的校巴紀錄清掉 (避免 dangling reference)。
   */
  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { STORAGE } = await import('@/lib/storage');
      const phone = deleteTarget.phone;
      const nannyId = deleteTarget.id;

      // 1) 解除所有校巴的 assignedBusIds (或駕駛員/管理員存放的 nannies 引用) 中的此保姆
      buses.forEach((b) => {
        const refs: Array<{ key: string; value: string[] }> = [];
        // 相容多個可能的欄位名稱 (向後相容現存資料)
        const arr1 = (b as any).assignedBusIds as string[] | undefined;
        if (Array.isArray(arr1)) refs.push({ key: 'assignedBusIds', value: arr1 });
        // 若 Bus 介面將來新增 nannyId 屬性, 也一併清掉
        const nid = (b as any).nannyId as string | null | undefined;
        if (nid === nannyId) {
          STORAGE.buses.update(b.id, { nannyId: null } as any);
        }
        refs.forEach(({ key, value }) => {
          if (value.includes(nannyId)) {
            const next = value.filter((id) => id !== nannyId);
            STORAGE.buses.update(b.id, { [key]: next } as any);
          }
        });
      });

      // 2) 刪除對應 user 登入帳號 (若存在)
      //    ⚠️ 也要刪雲端 — 否則下次 syncToStorage() 會把這筆帳號「復活」回來,
      //    保姆已不存在但帳號還能登入。
      const linkedUser = STORAGE.users.findByPhone(phone);
      if (linkedUser && linkedUser.role === 'nanny') {
        STORAGE.users.remove(linkedUser.id);
        try {
          const { supabaseUsers } = await import('@/lib/supabase-users');
          const sbRes = await supabaseUsers.remove(linkedUser.id);
          if (!sbRes.success) {
            console.warn('[NannysConsole] Supabase user delete failed:', sbRes.error);
            toast.warning(`保姆已從本機刪除，但登入帳號雲端刪除失敗：${sbRes.error}`);
          }
        } catch (e) {
          console.warn('[NannysConsole] Supabase user delete error:', e);
        }
      }

      // 3) 刪除 nanny 本身
      const nannyName = deleteTarget.name;
      STORAGE.nannies.remove(nannyId);

      // 3.5) 推回雲端 (刪除)
      const { supabaseNannies } = await import('@/lib/supabase-entities');
      const sbRes = await supabaseNannies.remove(nannyId);
      if (!sbRes.success) {
        console.warn('[NannysConsole] Supabase delete failed:', sbRes.error);
        toast.warning(`保姆已從本機刪除，但雲端同步失敗：${sbRes.error}`);
      }

      setDeleteTarget(null);
      toast.success(`保姆「${nannyName}」已刪除, 校巴綁定與登入帳號已一併清除`);
      dispatchNannyRefresh();
      window.dispatchEvent(new CustomEvent('cbl-buses-refresh'));
    } catch (err) {
      console.error('[NannysConsole] handleDelete error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`刪除失敗：${msg}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, buses, toast]);

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((n) => {
      const busPlates = n.assignedBusIds
        .map((id) => busesById.get(id)?.plateNumber)
        .filter(Boolean)
        .join('、');
      const linkedUser = usersByPhone.get(n.phone);
      return {
        '員工編號': n.employeeId,
        '姓名': n.name,
        '電話 (登入帳號)': n.phone,
        '指派校巴': busPlates || '未指派',
        '登入帳號': linkedUser ? '已建立' : '未建立',
        '備註': (n as any).description ?? '',
        '建立日期': formatSystemAdminDate(n.createdAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 18 }, { wch: 10 }, { wch: 24 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '保姆名單');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `nannies-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, busesById, usersByPhone, tab]);

  /* -------- Render -------- */
  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row — 規範 §8 */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white shrink-0">
            <Heart width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                保姆
              </h1>
              <Pill tone="danger" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 個
              </Pill>
              {unassignedCount > 0 && (
                <Pill tone="warning" size="sm">
                  <Dot tone="warning" />
                  {unassignedCount} 未分配校巴
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理保姆資料、員工編號與校巴指派。每個電話對應一個保姆登入帳號。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:w-[320px]">
          <StatTile
            label="全部"
            value={total}
            hint="保姆總數"
            icon={<CheckCircle2 width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="未分配校巴"
            value={unassignedCount}
            hint="需要指派"
            icon={<AlertCircle width={12} height={12} />}
            tone="warning"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar — 規範 §9 */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="warning"
          size="sm"
          startIcon={<AlertCircle width={12} height={12} />}
          onClick={() => {
            setTab('unassigned');
          }}
        >
          檢視未分配
        </Button>
        {unassignedCount > 0 && (
          <Pill tone="warning" size="sm">
            {unassignedCount}
          </Pill>
        )}

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <Button
          variant="secondary"
          size="sm"
          startIcon={<FileSpreadsheet width={12} height={12} />}
          onClick={handleExportExcel}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? '沒有可匯出的資料' : '匯出為 Excel'}
        >
          匯出 Excel ({filtered.length})
        </Button>

        <div className="ml-auto">
          <Button
            variant="primary"
            size="sm"
            startIcon={<UserPlus width={12} height={12} />}
            onClick={openAdd}
          >
            新增保姆
          </Button>
        </div>
      </div>

      {/* L3. Table Card — 規範 §11 */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<Heart width={18} height={18} />}
          title={
            tab === 'all'
              ? '全部保姆'
              : '未分配校巴'
          }
          subtitle={`${filtered.length} 筆 · ${TAB_OPTIONS.find((o) => o.value === tab)?.label ?? ''}`}
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
            layoutId="nannys-tab-pill"
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
              placeholder="搜尋姓名、電話、帳戶名稱或員工編號…"
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

        {/* L3c. Table scroll region — AnimatePresence 三態 (規範 §13) */}
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
                busesById={busesById}
                usersByPhone={usersByPhone}
                onView={setViewingNanny}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
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

      {/* L4. Modals */}
      <NannyFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        context={{ nannies, buses }}
        employeeId={formModal.editingEmployeeId}
        previewEmployeeId={previewEmployeeId}
        clientId={authClientId}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() =>
          setFormModal((p) => ({ ...p, open: false }))
        }
      />

      <NannyDetailPopup
        open={!!viewingNanny}
        nanny={viewingNanny}
        busesById={busesById}
        nannyUser={
          viewingNanny ? usersByPhone.get(viewingNanny.phone) ?? null : null
        }
        onClose={() => setViewingNanny(null)}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        nannyName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NannyDetailPopup — 保姆詳情彈窗 (沿用「父母頁」輕量樣式)                          */
/* -------------------------------------------------------------------------- */

function NannyDetailPopup({
  open,
  nanny,
  busesById,
  nannyUser,
  onClose,
}: {
  open: boolean;
  nanny: Nanny | null;
  busesById: Map<string, Bus>;
  nannyUser: User | null;
  onClose: () => void;
}) {
  if (!nanny) return null;
  const assignedBuses = nanny.assignedBusIds
    .map((id) => busesById.get(id))
    .filter((b): b is Bus => !!b);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nanny-detail-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-[560px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 dark:border-slate-700/80">
              {nanny.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nanny.photo}
                  alt={nanny.name}
                  className="h-9 w-9 rounded-lg object-cover ring-1 ring-inset ring-slate-200 shrink-0 dark:ring-slate-700"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 shrink-0 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                  <Heart width={18} height={18} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                  {nanny.name}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                  員工編號 <span className="font-mono">{nanny.employeeId}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label="關閉"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 dark:bg-slate-800/60 dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
                    電話 (登入帳號)
                  </p>
                  <p className="text-[14px] font-semibold font-mono text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {nanny.phone}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 dark:bg-slate-800/60 dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
                    帳戶名稱
                  </p>
                  <p className="text-[14px] font-semibold font-mono text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {nanny.accountName || '—'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 dark:bg-slate-800/60 dark:border-slate-700 col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
                    登入密碼
                  </p>
                  <p className="text-[14px] font-semibold font-mono text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {nannyUser?.password ?? nanny.phone}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-1.5 dark:text-slate-400">
                  指派校巴 ({assignedBuses.length})
                </p>
                {assignedBuses.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-[11.5px] text-slate-500 dark:border-slate-700 dark:text-slate-400 inline-flex items-center gap-1.5">
                    <AlertCircle width={11} height={11} className="text-amber-500" />
                    目前未指派任何校巴
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedBuses.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium font-mono bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800/50"
                      >
                        <BusIcon width={10} height={10} />
                        {b.plateNumber}
                        {b.model ? ` · ${b.model}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(nanny as any).description ? (
                <div>
                  <p className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 mb-1.5 dark:text-slate-400">
                    備註
                  </p>
                  <p className="text-[12.5px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50/40 px-3 py-2 dark:bg-slate-800/40 dark:border-slate-700">
                    {(nanny as any).description}
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 dark:bg-slate-800/60 dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
                    建立日期
                  </p>
                  <p className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {formatSystemAdminDate(nanny.createdAt)}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 dark:bg-slate-800/60 dark:border-slate-700">
                  <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
                    登入帳號
                  </p>
                  <p className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {nannyUser ? '已建立' : '未建立'}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-end rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <Button variant="secondary" size="sm" onClick={onClose}>
                關閉
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
            <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse dark:bg-slate-800" />
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

function EmptyState({
  tab,
  search,
}: {
  tab: NannyTab;
  search: string;
}) {
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
            ? '沒有符合條件的保姆'
            : tab === 'unassigned'
            ? '全部保姆皆已指派校巴'
            : '尚未新增任何保姆'}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : tab === 'unassigned'
            ? '新增或編輯保姆時, 可以多選指派校巴。'
            : '點擊右上角的「新增保姆」按鈕以建立第一筆資料。'}
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
  busesById,
  usersByPhone,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Nanny[];
  busesById: Map<string, Bus>;
  usersByPhone: Map<string, User>;
  onView: (n: Nanny) => void;
  onEdit: (n: Nanny) => void;
  onDelete: (n: Nanny) => void;
}) {
  return (
    <table
      className="w-full">
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            保姆
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            員工編號
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            帳戶名稱
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            電話 (登入帳號)
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            校巴
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            建立日期
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            指派
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right dark:bg-slate-800/95">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => {
          const assignedBuses = n.assignedBusIds
            .map((id) => busesById.get(id))
            .filter((b): b is Bus => !!b);
          const linkedUser = usersByPhone.get(n.phone);
          return (
            <tr
              key={n.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
            >
              {/* 保姆 (avatar + name) — 規範 §12 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  {n.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.photo}
                      alt={n.name}
                      className="flex-shrink-0 w-8 h-8 rounded-md object-cover ring-1 ring-inset ring-slate-200 dark:ring-slate-700"
                    />
                  ) : (
                    <div className="flex-shrink-0 w-8 h-8 rounded-md bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 flex items-center justify-center text-[12px] font-semibold dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50">
                      {n.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[180px] dark:text-slate-100"
                      title={n.name}
                    >
                      {n.name}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      角色：保姆
                    </p>
                  </div>
                </div>
              </td>

              {/* 員工編號 (copyable chip) */}
              <td className="px-3 py-2.5">
                <CopyChip
                  value={n.employeeId}
                  title="複製員工編號"
                  label="員工編號"
                  icon={<Hash width={9} height={9} />}
                />
              </td>

              {/* 帳戶名稱 (與電話都可登入) */}
              <td className="px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200">
                {n.accountName ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                    {n.accountName}
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 text-[11px]">—</span>
                )}
              </td>

              {/* 電話 (登入帳號) */}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CopyChip
                    value={n.phone}
                    title="複製電話"
                    label="電話"
                    icon={<Phone width={9} height={9} />}
                  />
                  {linkedUser ? (
                    <Pill tone="success" size="sm">
                      可登入
                    </Pill>
                  ) : (
                    <Pill tone="warning" size="sm">
                      無帳號
                    </Pill>
                  )}
                </div>
              </td>

              {/* 校巴 */}
              <td className="px-3 py-2.5">
                {assignedBuses.length === 0 ? (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
                    <AlertCircle width={10} height={10} />
                    未指派
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {assignedBuses.slice(0, 2).map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50 font-mono"
                      >
                        <BusIcon width={9} height={9} />
                        {b.plateNumber}
                      </span>
                    ))}
                    {assignedBuses.length > 2 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                        +{assignedBuses.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </td>

              {/* 建立日期 */}
              <td className="px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1">
                  <Calendar width={11} height={11} className="text-slate-400" />
                  <span className="tabular-nums">
                    {formatSystemAdminDate(n.createdAt)}
                  </span>
                </span>
              </td>

              {/* 指派狀態 */}
              <td className="px-3 py-2.5">{assignBadge(n.assignedBusIds.length)}</td>

              {/* 操作 (icon cluster, opacity 70 → 100 on row hover) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => onView(n)} title="查看保姆詳情">
                    <Eye width={13} height={13} />
                  </IconButton>
                  <IconButton onClick={() => onEdit(n)} title="編輯保姆資料">
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(n)}
                    title="刪除保姆 (含登入帳號)"
                    variant="danger"
                  >
                    <Trash2 width={13} height={13} />
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

/* -------------------------------------------------------------------------- */
/*  System admin date format — YYYY/MM/DD                                         */
/* -------------------------------------------------------------------------- */

function formatSystemAdminDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
