'use client';

/**
 * ParentDetailPopup — 查看家長詳情
 *
 * 從家長列表點「檢視」按鈕觸發。內容重點是「此家長的子女資料」, 即所有
 * parentIds 含此家長 id 的學生。每個學生卡片上會標示:
 *   - 學生編號 / 姓名 / 班別
 *   - 主要聯繫人標記 (★) — 從 Student.primaryParentId 取得
 *   - 綁定校巴
 *   - 狀態
 *
 * 也包含家長基本資料區塊, 方便核對登入帳號資訊 (電話 / 角色 / 狀態)。
 *
 * 範圍: 僅 /cbl-admin-setting/[layout]/parents/ 內使用。
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Baby,
  Phone,
  Mail,
  MapPin,
  Building2,
  Home as HomeIcon,
  Hash,
  Star,
  CheckCircle2,
  PowerOff,
  Calendar,
  Bus as BusIcon,
  Users as UsersIcon,
  KeyRound,
  GraduationCap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill, Dot, Button } from './primitives';
import { MODAL_FADE, MODAL_SLIDE, EASE } from './design-tokens';
import type { Parent, Student, Bus, ParentRelationship, User } from '@/lib/types';

const RELATIONSHIP_LABEL: Record<ParentRelationship, string> = {
  father: '父親',
  mother: '母親',
  grandfather_paternal: '祖父',
  grandmother_paternal: '祖母',
  grandfather_maternal: '外祖父',
  grandmother_maternal: '外祖母',
  guardian_other: '其他監護人',
};

const STATUS_LABEL: Record<Parent['status'], { label: string; tone: 'success' | 'neutral' }> = {
  active: { label: '啟用', tone: 'success' },
  inactive: { label: '停用', tone: 'neutral' },
};

const STUDENT_STATUS_LABEL: Record<Student['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { label: '在學', tone: 'success' },
  suspended: { label: '停學', tone: 'warning' },
  graduated: { label: '畢業', tone: 'neutral' },
};

export interface ParentDetailPopupProps {
  open: boolean;
  parent: Parent | null;
  /** 全部學生清單 (供計算子女 — 透過 student.parentIds.includes(parent.id)) */
  students: Student[];
  /** 全部校巴清單 (顯示子女綁定的車牌) */
  buses: Bus[];
  /** 對應的家長登入 user 帳號 (可能不存在) */
  parentUser: User | null;
  onClose: () => void;
}

export function ParentDetailPopup({
  open,
  parent,
  students,
  buses,
  parentUser,
  onClose,
}: ParentDetailPopupProps) {
  // 計算此家長的所有子女 — 透過 student.parentIds.includes(parent.id)
  const boundStudents = React.useMemo(() => {
    if (!parent) return [];
    return students
      .filter((s) => s.parentIds.includes(parent.id))
      .sort((a, b) => {
        // 主要聯繫人排第一
        if (a.primaryParentId === parent.id && b.primaryParentId !== parent.id) return -1;
        if (b.primaryParentId === parent.id && a.primaryParentId !== parent.id) return 1;
        // 在學排前
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        // 依姓名筆畫/英文排序 — 用 createdAt 倒序近似
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [parent, students]);

  const busesById = React.useMemo(() => {
    const m = new Map<string, Bus>();
    buses.forEach((b) => m.set(b.id, b));
    return m;
  }, [buses]);

  // ESC 關閉
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 鎖住 body scroll
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && parent && (
        <motion.div
          key="parent-detail-backdrop"
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MODAL_FADE, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="parent-detail-title"
            className="relative w-full max-w-[720px] mx-4 max-h-[90vh] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-700"
            initial={{ opacity: 0, y: MODAL_SLIDE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: MODAL_SLIDE }}
            transition={{ duration: MODAL_FADE, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-br from-violet-50/60 to-white dark:border-slate-700/80 dark:from-violet-950/30 dark:to-slate-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200/70 shrink-0 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-800/50">
                <UsersIcon width={20} height={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="parent-detail-title"
                  className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate"
                >
                  {parent.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Pill tone="violet" size="sm">
                    {RELATIONSHIP_LABEL[parent.relationship]}
                  </Pill>
                  <Pill tone={STATUS_LABEL[parent.status].tone} size="sm">
                    <Dot tone={STATUS_LABEL[parent.status].tone} />
                    {STATUS_LABEL[parent.status].label}
                  </Pill>
                  {parentUser && (
                    <Pill tone="primary" size="sm">
                      <KeyRound width={9} height={9} />
                      登入帳號
                    </Pill>
                  )}
                </div>
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

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto dark:scrollbar-thin">
              {/* 區塊 1: 聯絡資料 */}
              <Section
                icon={<Phone width={14} height={14} />}
                title="聯絡資料"
                accent="primary"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field icon={<Phone width={11} height={11} />} label="行動電話 (登入帳號)">
                    <span className="font-mono">{parent.phone}</span>
                  </Field>
                  {parent.alternatePhone && (
                    <Field icon={<Phone width={11} height={11} />} label="備用行動電話">
                      <span className="font-mono">{parent.alternatePhone}</span>
                    </Field>
                  )}
                  {parent.homePhone && (
                    <Field icon={<HomeIcon width={11} height={11} />} label="住家電話">
                      <span className="font-mono">{parent.homePhone}</span>
                    </Field>
                  )}
                  {parent.officePhone && (
                    <Field icon={<Building2 width={11} height={11} />} label="公司電話">
                      <span className="font-mono">{parent.officePhone}</span>
                    </Field>
                  )}
                  {parent.address && (
                    <Field
                      icon={<MapPin width={11} height={11} />}
                      label="通訊地址"
                      className="md:col-span-2"
                    >
                      {parent.address}
                    </Field>
                  )}
                </div>
              </Section>

              {/* 區塊 2: 登入帳號 (User) — 顯示密碼遮罩, 可切換顯示 */}
              {parentUser && (
                <Section
                  icon={<KeyRound width={14} height={14} />}
                  title="登入帳號"
                  accent="info"
                >
                  <UserAccountRow user={parentUser} />
                </Section>
              )}

              {/* 區塊 3: 子女資料 — 重點 */}
              <Section
                icon={<Baby width={14} height={14} />}
                title={`子女資料 (${boundStudents.length})`}
                accent="violet"
                rightHint={
                  boundStudents.length > 0
                    ? '已綁定此家長的學生'
                    : '此家長尚未關聯任何子女'
                }
              >
                {boundStudents.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-700 px-4 py-6 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 mx-auto mb-2 dark:bg-slate-800 dark:text-slate-500">
                      <Baby width={18} height={18} />
                    </div>
                    <p className="text-[12.5px] text-slate-600 dark:text-slate-300 font-medium">
                      此家長尚未關聯任何子女
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1">
                      可至「學生」頁面, 在學生的「關聯家長」中加入此家長。
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {boundStudents.map((s) => {
                      const isPrimary = s.primaryParentId === parent.id;
                      const bus = s.busId ? busesById.get(s.busId) : null;
                      const stat = STUDENT_STATUS_LABEL[s.status];
                      return (
                        <li
                          key={s.id}
                          className={cn(
                            'rounded-lg border px-3 py-2.5 flex items-start gap-3 transition-colors',
                            isPrimary
                              ? 'border-amber-200/70 bg-amber-50/60 ring-1 ring-inset ring-amber-200/40 dark:border-amber-800/50 dark:bg-amber-950/20 dark:ring-amber-800/40'
                              : 'border-slate-200 bg-white hover:bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-800/40',
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-md shrink-0 text-[13px] font-semibold',
                              isPrimary
                                ? 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/50'
                                : 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50',
                            )}
                          >
                            {s.name.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {s.name}
                              </span>
                              {isPrimary && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800/50">
                                  <Star width={9} height={9} fill="currentColor" strokeWidth={0} />
                                  主要聯繫人
                                </span>
                              )}
                              <Pill tone={stat.tone} size="sm">
                                {stat.tone === 'success' ? (
                                  <CheckCircle2 width={9} height={9} />
                                ) : stat.tone === 'warning' ? (
                                  <PowerOff width={9} height={9} />
                                ) : (
                                  <Calendar width={9} height={9} />
                                )}
                                {stat.label}
                              </Pill>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap text-[10.5px] text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <Hash width={9} height={9} />
                                <span className="font-mono">{s.studentId}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <GraduationCap width={9} height={9} />
                                {s.classNumber || '—'}
                              </span>
                              {bus ? (
                                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                  <BusIcon width={9} height={9} />
                                  {bus.plateNumber}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                  <BusIcon width={9} height={9} />
                                  未綁定校巴
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {/* 區塊 4: 其他資訊 (接送權限 / 通知 / 建立日期) */}
              <Section
                icon={<CheckCircle2 width={14} height={14} />}
                title="其他資訊"
                accent="neutral"
              >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11.5px]">
                  <Field icon={<CheckCircle2 width={11} height={11} />} label="接送權限">
                    {parent.isPickupAuth ? (
                      <Pill tone="success" size="sm">
                        <CheckCircle2 width={9} height={9} />
                        已授權
                      </Pill>
                    ) : (
                      <Pill tone="neutral" size="sm">
                        <PowerOff width={9} height={9} />
                        未授權
                      </Pill>
                    )}
                  </Field>
                  <Field icon={<Mail width={11} height={11} />} label="接收通知">
                    {parent.notificationEnabled ? (
                      <Pill tone="success" size="sm">
                        開啟
                      </Pill>
                    ) : (
                      <Pill tone="neutral" size="sm">
                        關閉
                      </Pill>
                    )}
                  </Field>
                  <Field icon={<Calendar width={11} height={11} />} label="建立日期">
                    <span className="tabular-nums">{formatDate(parent.createdAt)}</span>
                  </Field>
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-700/80">
              <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400 inline-flex items-center gap-1.5">
                <Pill tone="violet" size="sm">
                  <Baby width={9} height={9} />
                  {boundStudents.length} 位子女
                </Pill>
              </span>
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
/*  Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

function Section({
  icon,
  title,
  accent,
  rightHint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: 'primary' | 'violet' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  rightHint?: string;
  children: React.ReactNode;
}) {
  const accentBg: Record<string, string> = {
    primary: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50',
    info: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50',
    success: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50',
    warning: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',
    danger: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  };
  return (
    <section className="px-5 py-4 border-b border-slate-100 last:border-b-0 dark:border-slate-700/80">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset shrink-0', accentBg[accent])}>
          {icon}
        </div>
        <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-[0.05em]">
          {title}
        </h3>
        {rightHint && (
          <span className="text-[10.5px] text-slate-400 dark:text-slate-500 ml-1">· {rightHint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  icon,
  label,
  className,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 inline-flex items-center gap-1 dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
        {children}
      </span>
    </div>
  );
}

function UserAccountRow({ user }: { user: User }) {
  const [showPwd, setShowPwd] = React.useState(false);
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/40 px-3 py-2.5 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <KeyRound width={12} height={12} className="text-slate-400 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
            角色
          </span>
          <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
            {user.role === 'parent' ? '家長' : user.role}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Hash width={12} height={12} className="text-slate-400 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 dark:text-slate-400">
            登入密碼
          </span>
          <span className="text-[12.5px] font-mono text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
            {showPwd ? user.password : '••••••••'}
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="text-[10px] text-blue-600 dark:text-blue-300 hover:underline"
            >
              {showPwd ? '隱藏' : '顯示'}
            </button>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Pill tone={user.status === 'active' ? 'success' : 'neutral'} size="sm">
          {user.status === 'active' ? '可登入' : '停用'}
        </Pill>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
