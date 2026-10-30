'use client';

/**
 * ParentsConsoleContent — OneFleet-style operator console
 *
 * 設計語言: 與 /cbl-admin-setting/[layout]/students/StudentsConsoleContent 對齊
 *   - L1 Header Row (Title + Stat Tiles)
 *   - L2 Action Toolbar
 *   - L3 Table Card (SectionHeader + Filter Bar + Table + Footer)
 *   - L4 Per-Row Layout
 *   - L5 Empty / Loading / Error States
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/parents/ 內使用。
 *
 * 重用上方 primitives.tsx (Pill / Button / IconButton / Card / SectionHeader /
 * StatTile / FilterTabGroup) 與 ParentFormModal (新增家長)、ParentDetailPopup (檢視)。
 *
 * 設計細節:
 * - 每個電話只能有一個家長帳號 (即 STORAGE.users.findByPhone 唯一) — 透過 ParentFormModal
 *   內建校驗保證, 在此處再次校驗以免 race condition。
 * - 「在學生頁新增的家長」會自動出現在此列表 — 因為兩者共用 STORAGE.parents;
 *   透過 window 'cbl-students-refresh' / 'cbl-parents-refresh' event 互相通知。
 * - 「新增家長後亦會變成該家長的登入 account」 — 由 ParentFormModal 內部
 *   呼叫 STORAGE.users.add (或 update) 處理, 此處只需 reload。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users as UsersAllIcon,
  UserPlus,
  Pencil,
  Trash2,
  Eye,
  Search,
  Baby,
  AlertCircle,
  FolderOpen,
  CheckCircle2,
  PowerOff,
  Phone,
  Copy,
  KeyRound,
  Calendar,
  FileSpreadsheet,
  Star,
  Mail,
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
} from './primitives';
import {
  ParentFormModal,
  EMPTY_PARENT_FORM,
  RELATIONSHIP_OPTIONS,
  type ParentFormState,
} from '../students/ParentFormModal';
import { ParentDetailPopup } from './ParentDetailPopup';
import type { Parent, Student, Bus, User, ParentRelationship } from '@/lib/types';
import {
  ANIMATION_EASE,
  PAGE_FADE_DURATION,
  TAB_FADE_DURATION,
} from './design-tokens';
import { useToast } from '@/components/ui/toast';
import { resolveClientId } from '@/lib/storage';
import type { ParentTab } from './types';

/* -------------------------------------------------------------------------- */
/*  Constants — tab / tone mapping                                              */
/* -------------------------------------------------------------------------- */

const TAB_OPTIONS: FilterTabOption<ParentTab>[] = [
  {
    value: 'active',
    label: '啟用',
    icon: <CheckCircle2 width={11} height={11} />,
  },
  {
    value: 'inactive',
    label: '停用',
    icon: <PowerOff width={11} height={11} />,
  },
];

const TAB_ACCENT: Record<
  ParentTab,
  { header: 'primary' | 'warning'; pill: 'primary' | 'warning' }
> = {
  active: {
    header: 'primary',
    pill: 'primary',
  },
  inactive: {
    header: 'warning',
    pill: 'warning',
  },
};

const RELATIONSHIP_LABEL: Record<ParentRelationship, string> = {
  father: '父親',
  mother: '母親',
  grandfather_paternal: '祖父',
  grandmother_paternal: '祖母',
  grandfather_maternal: '外祖父',
  grandmother_maternal: '外祖母',
  guardian_other: '其他監護人',
};

const PAGE_SIZE = 10;

/* -------------------------------------------------------------------------- */
/*  Status / relationship helpers                                               */
/* -------------------------------------------------------------------------- */

function statusBadge(status: Parent['status']) {
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

/* -------------------------------------------------------------------------- */
/*  ConfirmDeleteModal — 確認刪除對話框                                            */
/* -------------------------------------------------------------------------- */

function ConfirmDeleteModal({
  open,
  parentName,
  isDeleting,
  onConfirm,
  onClose,
}: {
  open: boolean;
  parentName: string;
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
                  確認刪除家長
                </h2>
                <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                  此操作無法撤銷, 將一併解除此家長與所有學生的關聯。
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-slate-700 dark:text-slate-300">
                確定要刪除 <span className="font-semibold">{parentName}</span>？
              </p>
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-start gap-1">
                <AlertCircle width={11} height={11} className="shrink-0 mt-px" />
                <span>
                  對應的登入帳號也會一併刪除, 此家長的所有子女關聯會被解除, 但學生資料本身不會被刪除。
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

export interface ParentsConsoleContentProps {
  parents: Parent[];
  students: Student[];
  buses: Bus[];
  /** 全部 user 帳號 (供檢視 popup 顯示家長登入密碼 / 狀態) */
  users: User[];
  /** Initial loading flag — true if we haven't loaded yet on mount. */
  initiallyLoading?: boolean;
}

export function ParentsConsoleContent({
  parents,
  students,
  buses,
  users,
  initiallyLoading = false,
}: ParentsConsoleContentProps) {
  const { success, error: toastError, warning } = useToast();
  const [tab, setTab] = React.useState<ParentTab>('active');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(initiallyLoading);

  // Form modal state — 同時支援 新增 / 編輯 兩種模式
  const [formModal, setFormModal] = React.useState<{
    open: boolean;
    mode: 'add' | 'edit';
    editingId?: string;
    initial: ParentFormState;
  }>({ open: false, mode: 'add', initial: EMPTY_PARENT_FORM, editingId: undefined });
  const [isSaving, setIsSaving] = React.useState(false);

  // Detail popup state — 檢視家長
  const [viewingParent, setViewingParent] = React.useState<Parent | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<Parent | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // 在彈窗剛關閉的下一 frame 把焦點轉回來 (accessibility)
  const lastClosedRef = React.useRef<'form' | 'detail' | 'delete' | null>(null);
  React.useEffect(() => {
    if (lastClosedRef.current) {
      lastClosedRef.current = null;
    }
  });

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

  /* -------- 計算每位家長的子女數 + 主要聯繫人次數 (高效索引) -------- */
  const childrenByParent = React.useMemo(() => {
    const m = new Map<string, Student[]>();
    students.forEach((s) => {
      s.parentIds.forEach((pid) => {
        if (!m.has(pid)) m.set(pid, []);
        m.get(pid)!.push(s);
      });
    });
    return m;
  }, [students]);

  /* -------- 索引 users by phone (供檢視 popup 與校驗) -------- */
  const usersByPhone = React.useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.phone, u));
    return m;
  }, [users]);

  /* -------- Filter -------- */
  const filtered = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return parents.filter((p) => {
      if (tab === 'active' && p.status !== 'active') return false;
      if (tab === 'inactive' && p.status === 'active') return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.accountName ?? '').toLowerCase().includes(q)
      );
    });
  }, [parents, tab, debouncedSearch]);

  /* -------- Stats (KPIs) -------- */
  const total = parents.length;
  const activeCount = parents.filter((p) => p.status === 'active').length;
  const inactiveCount = parents.filter((p) => p.status !== 'active').length;
  // 已有登入帳號的家長數
  const withLoginCount = parents.filter((p) => usersByPhone.has(p.phone)).length;

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
  // 取得當前登入者的 clientId (供 form 內新增家長帶入正確的 clientId)
  const authClientId = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem('cbl_auth');
      if (!raw) return '';
      const u = JSON.parse(raw);
      // 跨機構角色沒有自己的 clientId → 兜底到已知學校的 clientId
      // (DB 的 client_id 有 NOT NULL + FK 約束, 空字串推不上去)
      return resolveClientId(u?.clientId || null);
    } catch {
      return resolveClientId(null);
    }
  }, []);

  const openAdd = React.useCallback(() => {
    setFormModal({ open: true, mode: 'add', initial: EMPTY_PARENT_FORM, editingId: undefined });
  }, []);

  /**
   * 從 Parent 物件建構 ParentFormState (供編輯模式預填表單)。
   * 注意: 密碼欄位刻意留空 — 「留空 = 保留現有密碼」的語意由 ParentFormModal 校驗邏輯
   * 支援, 儲存時 (handleSave edit 分支) 會跳過密碼更新。
   */
  const buildInitialFromParent = React.useCallback((p: Parent, allStudents: Student[]): ParentFormState => {
    return {
      name: p.name,
      relationship: p.relationship,
      phone: p.phone,
      accountName: p.accountName ?? '',
      password: '', // 留空 = 保留現有密碼
      homePhone: p.homePhone ?? '',
      officePhone: p.officePhone ?? '',
      address: p.address ?? '',
      studentIds: allStudents.filter((s) => s.parentIds.includes(p.id)).map((s) => s.id),
    };
  }, []);

  const openEdit = React.useCallback(
    (p: Parent) => {
      setFormModal({
        open: true,
        mode: 'edit',
        editingId: p.id,
        initial: buildInitialFromParent(p, students),
      });
    },
    [buildInitialFromParent, students],
  );

  /**
   * 家長表單儲存 — 同時處理 新增 / 編輯 兩種模式。
   *
   * Add 模式:
   *   - 寫入 STORAGE.parents + STORAGE.users (role='parent')
   *   - 若電話已被其他 user 佔用 (race condition), 併入現有帳號
   *
   * Edit 模式 (formModal.mode === 'edit' && formModal.editingId):
   *   - 更新 STORAGE.parents 基本資料 (姓名 / 關係 / 備用電話 / 地址)
   *   - 不會改電話 (UI 鎖住, 電話是登入帳號)
   *   - 若有填新密碼 → 同步更新對應 user 帳號; 留空 = 保留現有密碼
   *   - 若連結的 user 帳號尚未建立 (理論上 add mode 已建, 但容忍此情況) → 建立之
   *   - 若 user 被刪除但 parent 還在 (data drift) → 同上
   */
  const handleSave = React.useCallback(
    async (state: ParentFormState) => {
      setIsSaving(true);
      try {
        const { STORAGE } = await import('@/lib/storage');
        const { supabaseUsers } = await import('@/lib/supabase-users');
        const phone = state.phone.trim();
        const name = state.name.trim();
        const accountName = (state.accountName || '').trim();
        const password = state.password; // 編輯模式下可能為空字串
        const editingId = formModal.editingId;
        const isEdit = formModal.mode === 'edit' && !!editingId;

        /**
         * 建立 / 更新登入帳號 (cbl_users) — 本機 + 雲端雙寫。
         *
         * ⚠️ 這一段是「電話有輸入但顯示無帳號」的根因所在 (跟保姆頁一樣):
         *   只寫 localStorage、不推 Supabase → 下次 syncToStorage() 會把帳號洗掉。
         */
        const upsertLoginAccount = async (opts: {
          userId: string;
          phone: string;
          name: string;
          accountName: string;
          password: string;
          clientId: string;
          status: 'active' | 'inactive';
        }): Promise<void> => {
          const existingLocal = STORAGE.users.findByPhone(opts.phone);
          const localUser = existingLocal ?? {
            id: opts.userId,
            phone: opts.phone,
            accountName: opts.accountName || undefined,
            password: opts.password,
            role: 'parent' as const,
            name: opts.name,
            clientId: opts.clientId,
            status: opts.status,
            createdAt: new Date().toISOString(),
          };
          if (existingLocal) {
            STORAGE.users.update(existingLocal.id, {
              name: opts.name,
              password: opts.password,
              accountName: opts.accountName || undefined,
            });
          } else {
            STORAGE.users.add(localUser);
          }

          const sbExisting = await supabaseUsers.findByPhone(opts.phone);
          if (sbExisting.data) {
            const res = await supabaseUsers.update(sbExisting.data.id, {
              name: opts.name,
              password: opts.password,
              accountName: opts.accountName || null,
            });
            if (!res.success) {
              console.warn('[ParentsConsole] Supabase user update failed:', res.error);
              warning?.(`家長資料已更新，但登入帳號雲端同步失敗：${res.error}`);
            }
          } else {
            const res = await supabaseUsers.add({
              id: localUser.id,
              phone: localUser.phone,
              accountName: opts.accountName || null,
              password: localUser.password,
              role: 'parent',
              name: opts.name,
              clientId: opts.clientId,
              status: opts.status,
              createdAt: localUser.createdAt,
            });
            if (!res.success) {
              console.warn('[ParentsConsole] Supabase user add failed:', res.error);
              warning?.(`家長已新增，但登入帳號雲端同步失敗：${res.error}`);
            }
          }
        };

        if (isEdit) {
          // 編輯模式 — 透過 editingId 精準定位 (避免 phone race)
          const target = STORAGE.parents.getById(editingId!);
          if (!target) {
            toastError?.('找不到此家長, 已被刪除或資料不同步');
            return;
          }

          // 更新 parent 基本資料 (電話不變, 略過)
          const parentUpdates = {
            name,
            relationship: state.relationship,
            accountName: accountName || undefined,
            homePhone: state.homePhone.trim() || null,
            officePhone: state.officePhone.trim() || null,
            address: state.address.trim() || null,
          };
          STORAGE.parents.update(target.id, parentUpdates);

          // 推回雲端 (背景)
          {
            const { supabaseParents } = await import('@/lib/supabase-entities');
            const sbRes = await supabaseParents.update(target.id, parentUpdates);
            if (!sbRes.success) {
              console.warn('[ParentsConsole] Supabase update failed:', sbRes.error);
              warning?.(`家長資料已更新，但雲端同步失敗：${sbRes.error}`);
            }
          }

          // 同步對應 user 帳號 (用 target.phone 找 — 電話不會被編輯)
          // 密碼: 有填新密碼 → 更新; 留空 = 保留現有
          await upsertLoginAccount({
            userId: STORAGE.genId('user'),
            phone: target.phone,
            name,
            accountName,
            password: password || target.password || target.phone,
            clientId: target.clientId,
            status: target.status === 'inactive' ? 'inactive' : 'active',
          });

          // 同步此家長的學生關聯: 對比 state.studentIds vs 目前 parentIds, 增/刪
          const currentStudentIds = (STORAGE.students.getAll().filter((s) => s.parentIds.includes(editingId!)))
            .map((s) => s.id);
          const toAdd = state.studentIds.filter((id) => !currentStudentIds.includes(id));
          const toRemove = currentStudentIds.filter((id) => !state.studentIds.includes(id));
          toAdd.forEach((sid) => {
            const student = STORAGE.students.getById(sid);
            if (student) {
              STORAGE.students.update(sid, { parentIds: [...student.parentIds, editingId!] });
            }
          });
          toRemove.forEach((sid) => {
            const student = STORAGE.students.getById(sid);
            if (student) {
              STORAGE.students.update(sid, {
                parentIds: student.parentIds.filter((pid) => pid !== editingId!),
                primaryParentId: student.primaryParentId === editingId! ? null : student.primaryParentId,
              });
            }
          });

          setFormModal({ open: false, mode: 'add', initial: EMPTY_PARENT_FORM, editingId: undefined });
          success?.(password ? '家長資料與登入密碼已更新' : '家長資料已更新');
          window.dispatchEvent(new CustomEvent('cbl-parents-refresh'));
          window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
        } else {
          // 新增模式
          // 再次校驗電話是否被佔用 (保護 race condition, 雖然 modal 已擋)
          const existingUser = STORAGE.users.findByPhone(phone);
          if (existingUser) {
            // 電話已被使用: 視情況更新 (若姓名變了也同步, 密碼強制更新)
            STORAGE.users.update(existingUser.id, { password, name, accountName: accountName || undefined });
            toastError?.(`電話 ${phone} 已被使用, 已將此筆家長資料併入現有帳號`);
          }

          // 登入帳號 (本機 + 雲端) — 這是「無帳號」bug 的正確修法
          await upsertLoginAccount({
            userId: existingUser?.id ?? STORAGE.genId('user'),
            phone,
            name,
            accountName,
            password,
            clientId: authClientId,
            status: 'active',
          });

          // 建立 / 更新 parent
          const existingParent = STORAGE.parents.getAll().find(
            (p) => p.phone === phone && p.clientId === authClientId,
          );
          let savedParentId: string;
          const parentUpdates = {
            name,
            relationship: state.relationship,
            accountName: accountName || undefined,
            homePhone: state.homePhone.trim() || null,
            officePhone: state.officePhone.trim() || null,
            address: state.address.trim() || null,
          };
          if (existingParent) {
            STORAGE.parents.update(existingParent.id, parentUpdates);
            savedParentId = existingParent.id;

            // 推回雲端 (背景)
            const { supabaseParents } = await import('@/lib/supabase-entities');
            const sbRes = await supabaseParents.update(existingParent.id, parentUpdates);
            if (!sbRes.success) {
              console.warn('[ParentsConsole] Supabase update failed:', sbRes.error);
              warning?.(`家長資料已更新，但雲端同步失敗：${sbRes.error}`);
            }
          } else {
            const newParentId = STORAGE.genId('parent');
            const newParent = {
              id: newParentId,
              clientId: authClientId,
              name,
              phone,
              accountName: accountName || undefined,
              alternatePhone: null,
              homePhone: state.homePhone.trim() || null,
              officePhone: state.officePhone.trim() || null,
              address: state.address.trim() || null,
              relationship: state.relationship,
              isPickupAuth: true,
              password,
              notificationEnabled: true,
              status: 'active' as const,
              createdAt: new Date().toISOString(),
            };
            STORAGE.parents.add(newParent);
            savedParentId = newParentId;

            // 推回雲端 (背景)
            const { supabaseParents } = await import('@/lib/supabase-entities');
            const sbRes = await supabaseParents.add(newParent);
            if (!sbRes.success) {
              console.warn('[ParentsConsole] Supabase add failed:', sbRes.error);
              warning?.(`家長已新增，但雲端同步失敗：${sbRes.error}`);
            }
          }

          // 同步學生 parentIds (新增模式下用 savedParentId)
          if (state.studentIds.length > 0) {
            state.studentIds.forEach((sid) => {
              const student = STORAGE.students.getById(sid);
              if (student && !student.parentIds.includes(savedParentId)) {
                STORAGE.students.update(sid, { parentIds: [...student.parentIds, savedParentId] });
              }
            });
          }

          setFormModal({ open: false, mode: 'add', initial: EMPTY_PARENT_FORM, editingId: undefined });
          success?.(existingUser ? '家長資料已合併' : '家長新增成功, 登入帳號已建立');
          window.dispatchEvent(new CustomEvent('cbl-parents-refresh'));
          // 通知其它頁面 (e.g. /students) 重新讀 storage, 確保新增的家長立刻可被選用
          window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
        }
      } catch (e) {
        toastError?.(
          formModal.mode === 'edit' ? '儲存變更失敗, 請重試' : '新增失敗, 請重試',
        );
        console.error('[Parents] handleSave error', e);
      } finally {
        setIsSaving(false);
      }
    },
    [authClientId, formModal.mode, formModal.editingId, success, toastError, warning],
  );

  /**
   * 刪除家長 — 同時清掉對應 user 登入帳號, 並把所有「有綁此家長的學生」的 parentIds
   * 與 primaryParentId 清掉 (避免 dangling reference)。
   */
  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { STORAGE } = await import('@/lib/storage');
      const phone = deleteTarget.phone;
      const parentId = deleteTarget.id;

      // 1) 解除所有學生的 parentIds / primaryParentId
      students.forEach((s) => {
        if (s.parentIds.includes(parentId)) {
          const newParentIds = s.parentIds.filter((id) => id !== parentId);
          const newPrimary =
            s.primaryParentId === parentId ? null : s.primaryParentId;
          STORAGE.students.update(s.id, {
            parentIds: newParentIds,
            primaryParentId: newPrimary,
          });
        }
      });

      // 2) 刪除對應 user 登入帳號 (若存在)
      //    ⚠️ 也要刪雲端 — 否則下次 syncToStorage() 會把這筆帳號「復活」回來。
      const linkedUser = STORAGE.users.findByPhone(phone);
      if (linkedUser && linkedUser.role === 'parent') {
        STORAGE.users.remove(linkedUser.id);
        try {
          const { supabaseUsers } = await import('@/lib/supabase-users');
          const sbRes = await supabaseUsers.remove(linkedUser.id);
          if (!sbRes.success) {
            console.warn('[ParentsConsole] Supabase user delete failed:', sbRes.error);
            warning?.(`家長已從本機刪除，但登入帳號雲端刪除失敗：${sbRes.error}`);
          }
        } catch (e) {
          console.warn('[ParentsConsole] Supabase user delete error:', e);
        }
      }

      // 3) 刪除 parent 本身
      STORAGE.parents.remove(parentId);

      // 3.5) 推回雲端 (刪除)
      {
        const { supabaseParents } = await import('@/lib/supabase-entities');
        const sbRes = await supabaseParents.remove(parentId);
        if (!sbRes.success) {
          console.warn('[ParentsConsole] Supabase delete failed:', sbRes.error);
          warning?.(`家長已從本機刪除，但雲端同步失敗：${sbRes.error}`);
        }
      }

      setDeleteTarget(null);
      success?.('家長已刪除, 子女關聯與登入帳號已一併清除');
      window.dispatchEvent(new CustomEvent('cbl-parents-refresh'));
      window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
    } catch (e) {
      toastError?.('刪除失敗, 請重試');
      console.error('[Parents] handleDelete error', e);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, students, success, toastError, warning]);

  /* -------- 匯出 Excel -------- */
  const handleExportExcel = React.useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((p) => {
      const kids = childrenByParent.get(p.id) ?? [];
      const kidNames = kids.map((s) => s.name).join('、');
      const linkedUser = usersByPhone.get(p.phone);
      return {
        '姓名': p.name,
        '關係': RELATIONSHIP_LABEL[p.relationship],
        '行動電話 (登入帳號)': p.phone,
        '備用電話': p.alternatePhone ?? '',
        '住家電話': p.homePhone ?? '',
        '公司電話': p.officePhone ?? '',
        '通訊地址': p.address ?? '',
        '狀態': p.status === 'active' ? '啟用' : '停用',
        '登入帳號': linkedUser ? '已建立' : '未建立',
        '子女人數': kids.length,
        '子女名單': kidNames,
        '建立日期': formatSystemAdminDate(p.createdAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    // 設定欄寬
    ws['!cols'] = [
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
      { wch: 18 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '家長名單');
    const stamp = new Date().toISOString().slice(0, 10);
    const tabLabel = TAB_OPTIONS.find((o) => o.value === tab)?.label ?? '';
    XLSX.writeFile(wb, `parents-${tabLabel}-${stamp}.xlsx`);
  }, [filtered, childrenByParent, usersByPhone, tab]);

  /* -------- Render -------- */

  const accent = TAB_ACCENT[tab];

  return (
    <div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
      {/* L1. Header Row — 規範 §8 */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white shrink-0">
            <UsersAllIcon width={20} height={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight dark:text-slate-100">
                家長
              </h1>
              <Pill tone="violet" size="sm">
                <UsersAllIcon width={9} height={9} />
                {total} 個
              </Pill>
              {withLoginCount < total && (
                <Pill tone="warning" size="sm">
                  <AlertCircle width={9} height={9} />
                  {total - withLoginCount} 無登入帳號
                </Pill>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 dark:text-slate-400">
              管理家長帳號、子女綁定與登入憑證。每個電話對應一個家長帳號。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
          <StatTile
            label="啟用"
            value={activeCount}
            hint={`${total} 個家長總數`}
            icon={<CheckCircle2 width={12} height={12} />}
            tone="primary"
          />
          <StatTile
            label="已建立登入帳號"
            value={withLoginCount}
            hint="可用家長入口登入"
            icon={<KeyRound width={12} height={12} />}
            tone="success"
          />
          <StatTile
            label="停用"
            value={inactiveCount}
            hint="已停用 / 不顯示"
            icon={<PowerOff width={12} height={12} />}
            tone="warning"
          />
        </div>
      </motion.div>

      {/* L2. Action Toolbar — 規範 §9 */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Button
          variant="warning"
          size="sm"
          startIcon={<PowerOff width={12} height={12} />}
          onClick={() => {
            setTab('inactive');
          }}
        >
          檢視停用
        </Button>
        {inactiveCount > 0 && (
          <Pill tone="warning" size="sm">
            {inactiveCount}
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
            新增家長
          </Button>
        </div>
      </div>

      {/* L3. Table Card — 規範 §11 */}
      <Card className="flex flex-col flex-1 min-h-0">
        {/* L3a. SectionHeader */}
        <SectionHeader
          icon={<UsersAllIcon width={18} height={18} />}
          title={
            tab === 'active' ? '啟用家長' : '停用家長'
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
            layoutId="parents-tab-pill"
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
              placeholder="搜尋姓名或電話…"
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
                childrenByParent={childrenByParent}
                usersByPhone={usersByPhone}
                onView={setViewingParent}
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
              <Dot tone="violet" />
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
      <ParentFormModal
        open={formModal.open}
        mode={formModal.mode}
        initial={formModal.initial}
        existingParents={parents}
        students={students}
        editingId={formModal.editingId}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => {
          setFormModal({ open: false, mode: 'add', initial: EMPTY_PARENT_FORM, editingId: undefined });
          lastClosedRef.current = 'form';
        }}
      />

      <ParentDetailPopup
        open={!!viewingParent}
        parent={viewingParent}
        students={students}
        buses={buses}
        parentUser={viewingParent ? usersByPhone.get(viewingParent.phone) ?? null : null}
        onClose={() => {
          setViewingParent(null);
          lastClosedRef.current = 'detail';
        }}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        parentName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onClose={() => {
          setDeleteTarget(null);
          lastClosedRef.current = 'delete';
        }}
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
  tab: ParentTab;
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
            ? '沒有符合條件的家長'
            : tab === 'inactive'
            ? '目前沒有停用家長'
            : '尚未新增任何家長'}
        </p>
        <p className="text-[11px] text-slate-500 text-center max-w-sm dark:text-slate-400">
          {search
            ? '嘗試不同的搜尋字串, 或切換分頁。'
            : tab === 'inactive'
            ? '停用家長會在「啟用 / 停用」分頁的右上角按鈕「停用」後出現。'
            : '點擊右上角的「新增家長」按鈕以建立第一筆資料, 或在「學生」頁面新增學生時一併新增家長。'}
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
  childrenByParent,
  usersByPhone,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Parent[];
  childrenByParent: Map<string, Student[]>;
  usersByPhone: Map<string, User>;
  onView: (p: Parent) => void;
  onEdit: (p: Parent) => void;
  onDelete: (p: Parent) => void;
}) {
  return (
    <table
      className="w-full">
      <thead>
        <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold dark:bg-slate-800/60 dark:border-slate-700/80 dark:text-slate-400">
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left dark:bg-slate-800/95">
            家長
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            帳戶名稱
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            電話 (登入帳號)
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            子女
          </th>
          <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left dark:bg-slate-800/95">
            建立日期
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
        {rows.map((p) => {
          const kids = childrenByParent.get(p.id) ?? [];
          const linkedUser = usersByPhone.get(p.phone);
          return (
            <tr
              key={p.id}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors group dark:border-slate-700/80 dark:hover:bg-slate-800/50"
            >
              {/* 家長 (avatar + name + relationship) — 規範 §12 */}
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 flex items-center justify-center text-[12px] font-semibold dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                    {p.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[12px] font-medium text-slate-900 truncate max-w-[180px] dark:text-slate-100"
                      title={p.name}
                    >
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      {RELATIONSHIP_LABEL[p.relationship]}
                    </p>
                  </div>
                </div>
              </td>

              {/* 帳戶名稱 (與電話都可登入) */}
              <td className="px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200">
                {p.accountName ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
                    {p.accountName}
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 text-[11px]">—</span>
                )}
              </td>

              {/* 電話 (登入帳號) (copyable chip + 登入狀態 icon) */}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(p.phone).catch(() => {});
                      }
                    }}
                    title="複製電話"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:text-slate-200"
                  >
                    <Phone width={9} height={9} />
                    {p.phone}
                    <Copy width={9} height={9} />
                  </button>
                  {linkedUser ? (
                    <Pill tone="success" size="sm">
                      <KeyRound width={9} height={9} />
                      可登入
                    </Pill>
                  ) : (
                    <Pill tone="warning" size="sm">
                      <AlertCircle width={9} height={9} />
                      無帳號
                    </Pill>
                  )}
                </div>
              </td>

              {/* 子女 (以 Baby icon 顯示數量, hover/查看可看到細節) */}
              <td className="px-3 py-2.5">
                {kids.length === 0 ? (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50">
                      <Baby width={9} height={9} />
                      {kids.length} 個
                    </span>
                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {kids
                        .slice(0, 2)
                        .map((k) => k.name)
                        .join('、')}
                      {kids.length > 2 && ` 等`}
                    </span>
                    {kids.some((k) => k.primaryParentId === p.id) && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50"
                        title="此家長為至少一位子女的主要聯繫人"
                      >
                        <Star width={8} height={8} fill="currentColor" strokeWidth={0} />
                        主要
                      </span>
                    )}
                  </div>
                )}
              </td>

              {/* 建立日期 */}
              <td className="px-3 py-2.5 text-[12px] text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1">
                  <Calendar width={11} height={11} className="text-slate-400" />
                  <span className="tabular-nums">{formatSystemAdminDate(p.createdAt)}</span>
                </span>
              </td>

              {/* 狀態 */}
              <td className="px-3 py-2.5">{statusBadge(p.status)}</td>

              {/* 操作 (icon cluster) */}
              <td className="px-5 py-2.5">
                <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <IconButton onClick={() => onView(p)} title="查看家長 (含子女資料)">
                    <Eye width={13} height={13} />
                  </IconButton>
                  <IconButton onClick={() => onEdit(p)} title="編輯家長資料">
                    <Pencil width={13} height={13} />
                  </IconButton>
                  <IconButton
                    onClick={() => onDelete(p)}
                    title="刪除家長 (含登入帳號)"
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
