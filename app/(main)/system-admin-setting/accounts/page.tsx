'use client';

/**
 * /system-admin-setting/accounts — 帳號
 *
 * 對應舊 /settings/system 的 Section「system_admin 帳號管理」。
 *
 * 設計意圖:
 *   system_admin 帳號只能在此建立 — 不在 /cbl-admin-setting/user 暴露,
 *   避免 super_admin 幫自己提權。
 *
 * 這裡提供:
 *   - 目前系統內 system_admin 帳號的清單 (唯讀)
 *   - 前往 /cbl-admin-setting/user 的入口 (建立 / 編輯帳號)
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ShieldAlert, ShieldCheck, ArrowRight, UserCog, Users, UserCheck,
} from 'lucide-react';
import { Card, SectionHeader, StatTile, Pill } from '@/components/admin/console-primitives';
import { StatusDot } from '../components/ConsoleBits';
import { STORAGE } from '@/lib/storage';
import type { User } from '@/lib/types';

function roleLabel(role: string): string {
  switch (role) {
    case 'system_admin': return '系統開發者';
    case 'super_admin':  return '系統管理員';
    case 'client':       return '客戶管理員';
    case 'parent':       return '家長';
    case 'nanny':        return '保姆';
    default:             return '使用者';
  }
}

export default function SystemAdminAccountsPage() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const load = () => setUsers(STORAGE.users.getAll());
    load();
    window.addEventListener('cbl-users-refresh', load);
    return () => window.removeEventListener('cbl-users-refresh', load);
  }, []);

  const systemAdmins = users.filter((u) => u.role === 'system_admin');
  const superAdmins = users.filter((u) => u.role === 'super_admin');
  const activeSystemAdmins = systemAdmins.filter((u) => u.status === 'active');

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
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">帳號管理</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              平台層級帳號的檢視與建立入口。
            </p>
          </div>
          <Pill tone="danger" size="sm">DEV ONLY</Pill>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="system_admin"
            value={systemAdmins.length}
            hint="平台開發者帳號"
            tone="danger"
            icon={<ShieldAlert width={12} height={12} />}
          />
          <StatTile
            label="啟用中"
            value={activeSystemAdmins.length}
            hint="可登入的開發者帳號"
            tone="success"
            icon={<ShieldCheck width={12} height={12} />}
          />
          <StatTile
            label="super_admin"
            value={superAdmins.length}
            hint="L3 營運總管帳號"
            tone="warning"
            icon={<UserCheck width={12} height={12} />}
          />
          <StatTile
            label="全部帳號"
            value={users.length}
            hint="跨機構帳號總數"
            tone="neutral"
            icon={<Users width={12} height={12} />}
          />
        </div>
      </motion.div>

      {/* L2. 權限說明 + 入口 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
      >
        <Card>
          <SectionHeader
            icon={<ShieldAlert width={18} height={18} />}
            title="system_admin 帳號管理"
            subtitle="平台最高權限帳號的建立與維護"
            accent="danger"
          />
          <div className="px-5 pb-5 space-y-4">
            <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              system_admin 帳號只能在此建立 — 不在 /cbl-admin-setting/user 暴露,
              避免 super_admin 幫自己提權。
            </p>
            <Link
              href="/cbl-admin-setting/user"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:border-slate-300 cursor-pointer dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
            >
              <UserCog width={13} height={13} />
              前往用戶管理 (僅 system_admin 可建 system_admin)
              <ArrowRight width={13} height={13} />
            </Link>
          </div>
        </Card>
      </motion.div>

      {/* L3. system_admin 帳號清單 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <Card>
          <SectionHeader
            icon={<ShieldCheck width={18} height={18} />}
            title="system_admin 帳號"
            subtitle="目前系統內的平台開發者帳號"
            accent="danger"
            actions={<Pill tone="danger" size="sm">{systemAdmins.length}</Pill>}
          />
          {systemAdmins.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                尚未建立任何 system_admin 帳號。
              </p>
            </div>
          ) : (
            <div className="border-t border-slate-100 dark:border-slate-700/80">
              {systemAdmins.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-rose-600 flex items-center justify-center text-white text-[12px] font-bold">
                      {u.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-slate-800 truncate dark:text-slate-100">
                        {u.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">
                        {u.phone} {u.email ? `· ${u.email}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Pill tone="danger" size="sm">{roleLabel(u.role)}</Pill>
                    <StatusDot
                      ok={u.status === 'active'}
                      label={u.status === 'active' ? '啟用' : '停用'}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
