'use client';

/**
 * /system-admin-setting/accounts — 帳號管理 (system_admin 專用)
 *
 * 功能:
 *   - 查看 / 新增 / 編輯 / 停用 / 刪除 (入垃圾桶) / 還原
 *   - 垃圾桶「永久刪除」= 真的從 Supabase cbl_users 硬刪除
 *     (localStorage + 雲端同時刪, 不可復原) + 審計留痕。
 *
 * 寫入順序 (與 /cbl-admin-setting/user 一致):
 *   localStorage 先寫 (UI 即時) → Supabase 再寫 (失敗則 rollback 並提示)。
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert, ShieldCheck, UserPlus, UserCheck, Users, Pencil,
  Trash2, RotateCcw, Flame, Search, Power, Building2, Baby,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/hooks';
import { useToast } from '@/components/ui/toast';
import { Card, SectionHeader, StatTile, Pill, Button } from '@/components/admin/console-primitives';
import { StatusDot } from '../components/ConsoleBits';
import { STORAGE } from '@/lib/storage';
import type { User, UserRole } from '@/lib/types';
import {
  getTrashedUsers, trashUser, restoreTrashedUser, removeTrashedUser,
  logAction, type TrashedUser,
} from '@/lib/admin-audit';

const ROLE_LABEL: Record<UserRole, string> = {
  system_admin: '系統開發者',
  super_admin: '系統管理員',
  client: '客戶管理員',
  parent: '家長',
  nanny: '保姆',
};

const ROLE_TONE: Record<UserRole, 'danger' | 'violet' | 'primary' | 'warning' | 'success'> = {
  system_admin: 'danger',
  super_admin: 'violet',
  client: 'primary',
  parent: 'warning',
  nanny: 'success',
};

const ROLE_META: { id: UserRole; desc: string; icon: ReactNode }[] = [
  { id: 'system_admin', desc: '平台開發者', icon: <ShieldAlert width={14} height={14} /> },
  { id: 'super_admin', desc: '系統管理員', icon: <ShieldCheck width={14} height={14} /> },
  { id: 'client', desc: '客戶管理員', icon: <Building2 width={14} height={14} /> },
  { id: 'parent', desc: '家長', icon: <Users width={14} height={14} /> },
  { id: 'nanny', desc: '保姆', icon: <Baby width={14} height={14} /> },
];

type RoleTab = 'all' | UserRole | 'trash';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SystemAdminAccountsPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [trash, setTrash] = useState<TrashedUser[]>([]);
  const [roleTab, setRoleTab] = useState<RoleTab>('all');
  const isTrash = roleTab === 'trash';
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; editingId?: string }>({
    open: false, mode: 'add',
  });
  const [saving, setSaving] = useState(false);
  const [permDeleting, setPermDeleting] = useState<string | null>(null);

  const reload = useCallback(() => {
    setUsers(STORAGE.users.getAll());
    setTrash(getTrashedUsers());
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener('cbl-users-refresh', reload);
    // 背景從 Supabase 拉最新帳號 (小表, 成本可忽略)
    (async () => {
      try {
        const { supabaseUsers } = await import('@/lib/supabase-users');
        await supabaseUsers.syncToStorage();
        reload();
      } catch { /* ignore — 本機照常可用 */ }
    })();
    return () => window.removeEventListener('cbl-users-refresh', reload);
  }, [reload]);

  const trashIds = useMemo(() => new Set(trash.map((t) => t.user.id)), [trash]);
  const activeUsers = useMemo(() => users.filter((u) => !trashIds.has(u.id)), [users, trashIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base: User[] = isTrash
      ? trash.map((t) => t.user)
      : roleTab === 'all'
        ? activeUsers
        : activeUsers.filter((u) => u.role === roleTab);
    const list = q
      ? base.filter((u) =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q),
        )
      : [...base];
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));
  }, [search, isTrash, roleTab, activeUsers, trash]);

  const systemAdmins = activeUsers.filter((u) => u.role === 'system_admin');

  /* ---------------- 停用 / 啟用 ---------------- */
  const toggleStatus = async (u: User) => {
    if (u.id === me?.id) { toast.error('不能停用自己的帳號'); return; }
    const next = u.status === 'active' ? 'inactive' : 'active';
    const prev = STORAGE.users.getAll().find((x) => x.id === u.id);
    STORAGE.users.update(u.id, { status: next });
    reload();
    try {
      const { supabaseUsers } = await import('@/lib/supabase-users');
      const res = await supabaseUsers.update(u.id, { status: next });
      if (!res.success) {
        if (prev) STORAGE.users.update(u.id, { status: prev.status });
        reload();
        toast.error(`儲存失敗: ${res.error ?? '未知錯誤'}`);
        return;
      }
      logAction(next === 'active' ? 'user-update' : 'user-update', `${u.name} → ${next === 'active' ? '啟用' : '停用'}`);
      toast.success(`「${u.name}」已${next === 'active' ? '啟用' : '停用'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '儲存失敗');
    }
  };

  /* ---------------- 刪除 (入垃圾桶, 非真刪) ---------------- */
  const handleDelete = (u: User) => {
    if (u.id === me?.id) { toast.error('不能刪除自己的帳號'); return; }
    if (u.role === 'system_admin' && systemAdmins.length <= 1) {
      toast.error('至少保留一個 system_admin 帳號');
      return;
    }
    if (!window.confirm(`確定將「${u.name}」移入垃圾桶?\n(帳號先停用, 資料仍在 Supabase, 可還原)`)) return;
    trashUser(u, me?.name || 'system_admin');
    STORAGE.users.update(u.id, { status: 'inactive' });
    try { logAction('user-delete', `${u.name} (${u.role}) 移入垃圾桶`); } catch { /* ignore */ }
    reload();
    window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
    toast.success(`「${u.name}」已移入垃圾桶`);
  };

  /* ---------------- 還原 ---------------- */
  const handleRestore = async (id: string) => {
    const hit = restoreTrashedUser(id);
    if (!hit) { reload(); return; }
    const stillLocal = STORAGE.users.getAll().some((x) => x.id === id);
    if (stillLocal) {
      STORAGE.users.update(id, { status: 'active' });
    } else {
      STORAGE.users.add({ ...hit.user, status: 'active' });
      try {
        const { supabaseUsers } = await import('@/lib/supabase-users');
        await supabaseUsers.add({
          id: hit.user.id, phone: hit.user.phone, password: hit.user.password,
          role: hit.user.role, name: hit.user.name, email: hit.user.email ?? null,
          clientId: hit.user.clientId ?? null, companyId: hit.user.companyId ?? null,
          status: 'active', createdAt: hit.user.createdAt,
        });
      } catch { /* ignore — 本機已還原 */ }
    }
    try { logAction('user-restore', `還原 ${hit.user.name}`); } catch { /* ignore */ }
    reload();
    window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
    toast.success(`「${hit.user.name}」已還原`);
  };

  /* ---------------- 永久刪除 (真刪 Supabase) ---------------- */
  const handlePermDelete = async (t: TrashedUser) => {
    const u = t.user;
    if (u.id === me?.id) { toast.error('不能永久刪除自己的帳號'); return; }
    if (!window.confirm(`永久刪除「${u.name}」?\n這會從 Supabase cbl_users 真刪該筆資料, 不可復原!`)) return;
    if (!window.confirm(`最後確認: 真的要從 Supabase 刪除 ${u.phone} (${u.name}) 嗎?`)) return;
    setPermDeleting(u.id);
    try {
      // 1) 真刪 Supabase (硬刪除 — RLS 允許 system_admin/anon dev policy 下執行)
      const { supabaseUsers } = await import('@/lib/supabase-users');
      const res = await supabaseUsers.remove(u.id);
      if (!res.success) {
        toast.error(`Supabase 刪除失敗 (資料仍在雲端): ${res.error ?? '未知錯誤'}`);
        return;
      }
      // 2) 清本機 + 清垃圾桶
      STORAGE.users.remove(u.id);
      removeTrashedUser(u.id);
      try { logAction('user-perm-delete', `永久刪除 ${u.name} (${u.phone}) — 已從 Supabase 硬刪除`); } catch { /* ignore */ }
      reload();
      window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
      toast.success(`「${u.name}」已從 Supabase 永久刪除`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '永久刪除失敗');
    } finally {
      setPermDeleting(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header + stats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">帳號管理</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              system_admin 可新增 / 編輯 / 停用 / 刪除 · 垃圾桶「永久刪除」= 從 Supabase 真刪。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="danger" size="sm">DEV ONLY</Pill>
            <Button variant="primary" size="sm" startIcon={<UserPlus width={12} height={12} />} onClick={() => setModal({ open: true, mode: 'add' })}>新增帳號</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="system_admin" value={systemAdmins.length} hint="平台開發者帳號" tone="danger" icon={<ShieldAlert width={12} height={12} />} />
          <StatTile label="啟用中" value={activeUsers.filter((u) => u.status === 'active').length} hint={`${activeUsers.length} 個有效帳號`} tone="success" icon={<ShieldCheck width={12} height={12} />} />
          <StatTile label="垃圾桶" value={trash.length} hint="可還原 / 永久刪除" tone="warning" icon={<Trash2 width={12} height={12} />} />
          <StatTile label="全部帳號" value={users.length} hint="含垃圾桶內" tone="neutral" icon={<Users width={12} height={12} />} />
        </div>
      </motion.div>

      {/* Search */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700">
        <Pill tone="primary" size="sm">{filtered.length} 筆</Pill>
        <div className="relative ml-auto min-w-[220px] flex-1 sm:flex-none">
          <Search width={11} height={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋姓名、Email、帳號…"
            className="h-8 w-full sm:w-[220px] rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] focus:border-slate-400 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
        {/* 左側 vertical tab — 按 role 分 */}
        <nav className="w-full lg:w-60 shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:border-slate-700 lg:sticky lg:top-4">
          <RoleTabButton
            active={roleTab === 'all'}
            onClick={() => setRoleTab('all')}
            icon={<Users width={14} height={14} />}
            title="全部帳號"
            hint={`${activeUsers.length} 有效`}
            dot="bg-slate-400"
          />
          {ROLE_META.map((r) => {
            const count = activeUsers.filter((u) => u.role === r.id).length;
            const active = roleTab === r.id;
            return (
              <RoleTabButton
                key={r.id}
                active={active}
                onClick={() => setRoleTab(r.id)}
                icon={r.icon}
                title={ROLE_LABEL[r.id]}
                hint={`${count} 個 · ${r.desc}`}
                dot={count > 0 ? 'bg-emerald-500' : 'bg-slate-300'}
                badge={count}
              />
            );
          })}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700/80" />
          <RoleTabButton
            active={isTrash}
            onClick={() => setRoleTab('trash')}
            icon={<Trash2 width={14} height={14} />}
            title="垃圾桶"
            hint={trash.length > 0 ? `${trash.length} 可還原 / 真刪` : '空的'}
            dot={trash.length > 0 ? 'bg-amber-500' : 'bg-slate-300'}
            badge={trash.length}
          />
        </nav>

        {/* 右側內容面板 */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
        <Card>
          <SectionHeader
            icon={isTrash ? <Trash2 width={18} height={18} /> : <UserCheck width={18} height={18} />}
            title={
              isTrash
                ? '垃圾桶 — 永久刪除會真刪 Supabase'
                : roleTab === 'all'
                  ? '帳號清單 — 全部角色'
                  : `${ROLE_LABEL[roleTab as UserRole]} — ${ROLE_META.find((r) => r.id === roleTab)?.desc ?? ''}`
            }
            subtitle={isTrash ? '還原可救回 · 永久刪除不可復原' : '點擊列可編輯 · 刪除先入垃圾桶'}
            accent={isTrash ? 'warning' : 'danger'}
            actions={<Pill tone={isTrash ? 'warning' : 'danger'} size="sm">{filtered.length}</Pill>}
          />
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] text-slate-500">{isTrash ? '垃圾桶是空的 — 刪除的帳號會先放在這裡。' : `「${roleTab === 'all' ? '全部' : ROLE_LABEL[roleTab as UserRole]}」沒有符合的帳號。`}</p>
          ) : (
            <div className="border-t border-slate-100 dark:border-slate-700/80">
              {filtered.map((u) => {
                const t = trash.find((x) => x.user.id === u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-white text-[12px] font-bold ${u.role === 'system_admin' ? 'bg-rose-600' : 'bg-slate-500'}`}>
                        {u.name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-800 truncate dark:text-slate-100">
                          {u.name} {u.id === me?.id && <span className="text-[10px] font-normal text-slate-400">(我)</span>}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                          {u.phone}{u.email ? ` · ${u.email}` : ''}
                          {t && <span className="text-amber-600"> · {fmtTime(t.trashedAt)} 由 {t.trashedBy} 移入</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <Pill tone={ROLE_TONE[u.role] ?? 'primary'} size="sm">{ROLE_LABEL[u.role] ?? u.role}</Pill>
                      <StatusDot ok={u.status === 'active'} label={u.status === 'active' ? '啟用' : '停用'} />
                      {!isTrash ? (
                        <>
                          <button type="button" title="編輯" onClick={() => setModal({ open: true, mode: 'edit', editingId: u.id })}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-slate-800">
                            <Pencil width={13} height={13} />
                          </button>
                          <button type="button" title={u.status === 'active' ? '停用' : '啟用'} onClick={() => toggleStatus(u)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-slate-800">
                            <Power width={13} height={13} />
                          </button>
                          <button type="button" title="刪除 (入垃圾桶)" onClick={() => handleDelete(u)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer dark:hover:bg-rose-950/40">
                            <Trash2 width={13} height={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <Button variant="secondary" size="sm" startIcon={<RotateCcw width={12} height={12} />} onClick={() => handleRestore(u.id)}>還原</Button>
                          <Button variant="primary" size="sm" startIcon={<Flame width={12} height={12} />} isLoading={permDeleting === u.id}
                            onClick={() => t && handlePermDelete(t)} title="從 Supabase cbl_users 真刪, 不可復原">
                            永久刪除
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {isTrash && trash.length > 0 && (
            <p className="px-5 py-3 text-[11px] leading-relaxed text-slate-500 border-t border-slate-100 dark:border-slate-700/80 dark:text-slate-400">
              永久刪除 = 對 Supabase <span className="font-mono">cbl_users</span> 執行硬刪除 (hard delete) 並清掉本機資料, 不可復原。
              若該帳號另有 Supabase Auth 用戶, 需再到 Dashboard → Authentication 手動刪除。
            </p>
          )}
        </Card>
      </motion.div>
        </div>
      </div>

      {modal.open && (
        <AccountModal
          mode={modal.mode}
          editing={modal.editingId ? users.find((u) => u.id === modal.editingId) ?? null : null}
          existingPhones={users.map((u) => u.phone)}
          currentUserId={me?.id}
          saving={saving}
          onClose={() => setModal({ open: false, mode: 'add' })}
          onSave={async (state) => {
            setSaving(true);
            try {
              const { supabaseUsers } = await import('@/lib/supabase-users');
              if (modal.mode === 'edit' && modal.editingId) {
                const existing = STORAGE.users.getAll().find((x) => x.id === modal.editingId);
                if (!existing) { toast.error('找不到此帳號'); return; }
                if (modal.editingId === me?.id && state.status === 'inactive') { toast.error('不能停用自己的帳號'); return; }
                if (modal.editingId === me?.id && state.role !== 'system_admin') { toast.error('不能變更自己的 system_admin 角色'); return; }
                const localPatch: Partial<User> = {
                  name: state.name, phone: state.phone,
                  contactPhone: state.contactPhone || undefined,
                  email: state.email || undefined,
                  role: state.role, status: state.status,
                  ...(state.password ? { password: state.password } : {}),
                };
                STORAGE.users.update(modal.editingId, localPatch);
                const res = await supabaseUsers.update(modal.editingId, {
                  name: state.name, phone: state.phone,
                  contactPhone: state.contactPhone || null,
                  email: state.email || null, role: state.role, status: state.status,
                  ...(state.password ? { password: state.password } : {}),
                });
                if (!res.success) {
                  STORAGE.users.update(modal.editingId, existing);
                  toast.error(`儲存失敗: ${res.error ?? '未知錯誤'}`);
                  return;
                }
                try { logAction('user-update', `編輯 ${state.name}`); } catch { /* ignore */ }
                toast.success(`「${state.name}」已更新`);
              } else {
                const newId = STORAGE.genId('user');
                const payload: User = {
                  id: newId, phone: state.phone, contactPhone: state.contactPhone || undefined,
                  password: state.password, role: state.role, name: state.name,
                  email: state.email || undefined, status: state.status, createdAt: new Date().toISOString(),
                };
                STORAGE.users.add(payload);
                const res = await supabaseUsers.add({
                  id: newId, phone: state.phone, password: state.password, role: state.role,
                  name: state.name, email: state.email || null, status: state.status,
                  createdAt: payload.createdAt,
                });
                if (!res.success) {
                  STORAGE.users.remove(newId);
                  toast.error(`儲存失敗: ${res.error ?? '未知錯誤'}`);
                  return;
                }
                try { logAction('user-create', `新增 ${state.name} (${state.role})`); } catch { /* ignore */ }
                toast.success(`帳號「${state.name}」已建立`);
              }
              setModal({ open: false, mode: 'add' });
              reload();
              window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RoleTabButton — 左側 vertical tab 按鈕 (與 integrations 共用語言)        */
/* ------------------------------------------------------------------ */

function RoleTabButton({ active, onClick, icon, title, hint, dot, badge }: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
  dot: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer',
        active
          ? 'bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800/60'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
      )}
    >
      <span className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset shrink-0',
        active
          ? 'bg-blue-600 text-white ring-blue-600 dark:bg-blue-500 dark:ring-blue-500'
          : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
      )}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-100 truncate">
          <span className="truncate">{title}</span>
          {typeof badge === 'number' && badge > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', dot)} />
          <span className="truncate">{hint}</span>
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  AccountModal — 新增 / 編輯 (精簡版, 自包含)                            */
/* ------------------------------------------------------------------ */

type FormState = {
  name: string; phone: string; contactPhone: string;
  password: string; email: string; role: UserRole; status: 'active' | 'inactive';
};

function AccountModal({ mode, editing, existingPhones, currentUserId, saving, onSave, onClose }: {
  mode: 'add' | 'edit';
  editing: User | null;
  existingPhones: string[];
  currentUserId?: string;
  saving: boolean;
  onSave: (s: FormState) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>({
    name: editing?.name ?? '', phone: editing?.phone ?? '',
    contactPhone: editing?.contactPhone ?? '', password: '',
    email: editing?.email ?? '', role: editing?.role ?? 'client',
    status: editing?.status ?? 'active',
  });
  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v } as FormState));

  const validPhone = (p: string, r: UserRole) => {
    const t = p.trim();
    if (!t) return false;
    if (r === 'super_admin' || r === 'system_admin') return /^[a-zA-Z0-9_.-]{3,32}$/.test(t);
    return /^[0-9]{8}$/.test(t);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('請填寫姓名'); return; }
    if (!validPhone(form.phone, form.role)) {
      toast.error((form.role === 'system_admin' || form.role === 'super_admin') ? '帳號需為 3-32 位英數字' : '登入帳號需為 8 位數字');
      return;
    }
    if (mode === 'add' && existingPhones.includes(form.phone.trim())) { toast.error(`登入帳號「${form.phone.trim()}」已被使用`); return; }
    if (mode === 'add' && form.password.length < 6) { toast.error('密碼至少 6 個字元'); return; }
    if (form.password && (form.password.length < 6 || form.password.length > 64)) { toast.error('密碼需為 6-64 個字元 (留空 = 不改)'); return; }
    void currentUserId;
    onSave({ ...form, name: form.name.trim(), phone: form.phone.trim(), contactPhone: form.contactPhone.trim(), email: form.email.trim() });
  };

  const inputCls = 'w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700';

  return (
    <div role="presentation" onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="w-full max-w-[440px] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:bg-slate-900 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/80">
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{mode === 'add' ? '新增帳號' : `編輯 — ${editing?.name}`}</h2>
          <p className="text-[11px] text-slate-500">system_admin 可建立任何角色 (含 system_admin)</p>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-auto">
          <div>
            <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">姓名 *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="例如 陳大文" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">登入帳號 *</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} placeholder="8 位數字 / admin" />
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">聯絡電話</label>
              <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} className={inputCls} placeholder="8 位數字" />
            </div>
          </div>
          <div>
            <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">密碼 {mode === 'add' ? '*' : '(留空 = 不改)'}</label>
            <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} className={inputCls} placeholder={mode === 'add' ? '至少 6 個字元' : '留空保留原密碼'} autoComplete="new-password" />
          </div>
          <div>
            <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">Email</label>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="選填" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">角色</label>
              <select value={form.role} onChange={(e) => set('role', e.target.value)} className={inputCls}>
                {(['system_admin', 'super_admin', 'client', 'parent', 'nanny'] as UserRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10.5px] uppercase font-semibold text-slate-500 block mb-1">狀態</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2 dark:border-slate-700/80">
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>儲存</Button>
        </div>
      </div>
    </div>
  );
}
