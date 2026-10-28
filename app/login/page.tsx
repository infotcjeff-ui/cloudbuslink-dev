'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Phone, Lock, Eye, EyeOff, LogIn, Users, UserCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/PageLoader';
import { useAuth } from '@/lib/hooks';
import { isValidPhone } from '@/lib/utils';
import { initWithSupabase, isSupabaseAvailable } from '@/lib/supabase-data';
import type { UserRole } from '@/lib/types';

type PortalTab = 'admin' | 'parent' | 'nanny';

interface TabConfig {
  id: PortalTab;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  tagline: string;
  // 允許登入的角色 (留空 = 不限制, 交由後端決定)
  allowedRoles?: UserRole[];
  // 登入成功後跳轉的路徑
  redirect: (role?: UserRole) => string;
  // 背景漸層
  bg: string;
  iconGradient: string;
  buttonGradient: string;
}

const TABS: TabConfig[] = [
  {
    id: 'admin',
    label: '管理員',
    shortLabel: '管理',
    icon: ShieldCheck,
    tagline: '系統後台管理',
    bg: 'from-blue-50 via-white to-cyan-50',
    iconGradient: 'from-blue-500 to-cyan-500',
    buttonGradient: 'from-blue-500 to-cyan-500',
    redirect: () => '/',
  },
  {
    id: 'parent',
    label: '家長',
    shortLabel: '家長',
    icon: Users,
    tagline: '查看子女乘車資訊',
    allowedRoles: ['parent'],
    bg: 'from-pink-50 via-white to-rose-50',
    iconGradient: 'from-pink-500 to-rose-500',
    buttonGradient: 'from-pink-500 to-rose-500',
    redirect: () => '/parents',
  },
  {
    id: 'nanny',
    label: '保姆',
    shortLabel: '保姆',
    icon: UserCheck,
    tagline: '校巴隨車打卡',
    allowedRoles: ['nanny'],
    bg: 'from-emerald-50 via-white to-teal-50',
    iconGradient: 'from-emerald-500 to-teal-500',
    buttonGradient: 'from-emerald-500 to-teal-500',
    redirect: () => '/nanny',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [tab, setTab] = useState<PortalTab>('admin');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 登入成功後顯示全螢幕 PageLoader, 給目標頁面一點時間 hydrate
  const [loginSuccess, setLoginSuccess] = useState(false);
  // 用 ref 而非 state 來追蹤即時輸入值，避免 keydown 讀到舊 state
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const config = TABS.find((t) => t.id === tab)!;
  const TabIcon = config.icon;

  // 初始化 Supabase 資料 (僅在 client side)
  useEffect(() => {
    const init = async () => {
      if (isSupabaseAvailable()) {
        await initWithSupabase();
      }
    };
    init();
  }, []);

  // 額外同步「登入帳號」— initWithSupabase() 在已 initialized 時會跳過,
  // 但登入用的帳號/密碼必須是最新的 (避免用舊密碼登入成功)。
  useEffect(() => {
    if (!isSupabaseAvailable()) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const { supabaseUsers } = await import('@/lib/supabase-users');
        await supabaseUsers.syncToStorage();
      } catch (e) {
        console.warn('[Login] user sync failed:', e);
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace(config.redirect(user.role));
    }
  }, [user, loading, router, config]);

  // 切換 tab 時清空表單與錯誤
  useEffect(() => {
    setPhone('');
    setPassword('');
    setError('');
    if (phoneInputRef.current) phoneInputRef.current.value = '';
    setShowPwd(false);
  }, [tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 從 uncontrolled input 的 ref 讀取即時值
    const phoneVal = phoneInputRef.current?.value ?? '';
    const pwdVal = password;

    if (!phoneVal.trim()) {
      setError('請輸入手機號碼或帳號');
      return;
    }
    if (!pwdVal) {
      setError('請輸入密碼');
      return;
    }

    // 管理員入口的帳號可以是 8 位手機號碼, 也可以是英數字的帳號名稱
    // (例如 super_admin 的自訂登入帳號)。其他入口只接受 8 位手機號碼。
    const isAdminLogin = tab === 'admin';
    const isValidAccount = isAdminLogin
      ? isValidPhone(phoneVal) || /^[a-zA-Z0-9_.-]{3,32}$/.test(phoneVal)
      : isValidPhone(phoneVal);
    if (!isValidAccount) {
      setError(
        isAdminLogin
          ? '請輸入 8 位手機號碼或有效的帳號名稱'
          : '請輸入有效的手機號碼 (8位數字)',
      );
      return;
    }
    if (pwdVal.length < 6) {
      setError('密碼至少6位');
      return;
    }

    setSubmitting(true);
    const result = login(phoneVal, pwdVal, config.allowedRoles);

    if (!result.ok) {
      setSubmitting(false);
      setError(result.error || '登入失敗');
      return;
    }

    // 登入成功: 按鈕停止 spinning、顯示全螢幕 PageLoader 800ms,
    // 給目標頁面 hydrate 一點時間, 視覺上也比較有「完成 → 進入」的反饋感。
    // 在這 800ms 內 spinner 仍在轉 (isLoading=true), 但背景已被 PageLoader 蓋住。
    setLoginSuccess(true);
    const target = config.redirect(result.user?.role);
    setTimeout(() => {
      router.replace(target);
    }, 800);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 transition-colors duration-300 relative overflow-hidden">
      {/* 流水式動畫背景層 — 整層 pointer-events-none + z-0,
          確保圓形漂浮、縮放時絕對不擋到前景 UI 的點擊。 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        {/* 基礎漸變背景 */}
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br ${config.bg}`}
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />

        {/* 浮動圓形 - 使用 framer-motion 的 animate 屬性做無限循環動畫。
            每個圓形有獨立的隨機路徑、duration、scale 與延遲,
            透過 easeInOut 緩動避免機械感。
            容器已設 pointer-events-none + z-index 低於前景,
            圓形本身不接收任何 pointer 事件。 */}
        <motion.div
          className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-gradient-to-br from-blue-400/40 to-cyan-400/40 blur-3xl"
          animate={{
            x: [0, 60, -40, 30, 0],
            y: [0, 40, -30, 50, 0],
            scale: [1, 1.12, 0.95, 1.08, 1],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0,
          }}
          style={{ pointerEvents: 'none' }}
        />
        <motion.div
          className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-gradient-to-br from-cyan-400/40 to-teal-400/40 blur-3xl"
          animate={{
            x: [0, -50, 30, -40, 0],
            y: [0, -30, 40, -20, 0],
            scale: [1, 0.92, 1.1, 0.98, 1],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2.5,
          }}
          style={{ pointerEvents: 'none' }}
        />
        <motion.div
          className="absolute top-1/3 right-10 w-60 h-60 rounded-full bg-gradient-to-br from-pink-400/30 to-rose-400/30 blur-3xl"
          animate={{
            x: [0, 40, -50, 20, 0],
            y: [0, -40, 30, -20, 0],
            scale: [1, 1.15, 0.9, 1.05, 1],
          }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 4.8,
          }}
          style={{ pointerEvents: 'none' }}
        />
        <motion.div
          className="absolute bottom-1/4 left-10 w-52 h-52 rounded-full bg-gradient-to-br from-purple-400/30 to-indigo-400/30 blur-3xl"
          animate={{
            x: [0, -30, 50, -40, 0],
            y: [0, 40, -20, 30, 0],
            scale: [1, 0.95, 1.12, 1.02, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 7.2,
          }}
          style={{ pointerEvents: 'none' }}
        />
        {/* 第五個圓 (中間) — 增加層次, 路徑更長更慢 */}
        <motion.div
          className="absolute top-1/2 left-1/3 w-72 h-72 rounded-full bg-gradient-to-br from-sky-300/20 to-violet-400/20 blur-3xl"
          animate={{
            x: [0, 80, -60, 40, 0],
            y: [0, -50, 30, -40, 0],
            scale: [1, 1.08, 0.93, 1.1, 1],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1.3,
          }}
          style={{ pointerEvents: 'none' }}
        />

        {/* 頂部光澤效果 */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent animate-shimmer" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            key={`logo-${tab}`}
            className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${config.iconGradient} flex items-center justify-center shadow-lg mb-4 transition-colors duration-300`}
          >
            <TabIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">CloudBusLink</h1>
          <p className="text-sm text-muted-foreground mt-1">{config.tagline}</p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-2 mb-4" role="tablist" aria-label="登入入口">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center justify-center gap-1 h-14 rounded-xl text-sm font-medium transition-colors duration-200 active:scale-95 ${
                  active
                    ? `bg-gradient-to-br ${t.buttonGradient} text-white shadow-md`
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* 表單卡片 */}
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {tab === 'admin' ? '帳號 / 手機號碼' : '手機號碼'}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    ref={phoneInputRef}
                    id="phone-input"
                    type="text"
                    inputMode={tab === 'admin' ? 'text' : 'numeric'}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={tab === 'admin' ? '請輸入帳號或 8 位手機號碼' : '請輸入 8 位手機號碼'}
                    className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue=""
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    onBeforeInput={(e) => {
                      // 管理員 tab 允許輸入所有字元；其他 tab 只限數字
                      if (tab !== 'admin' && !/^\d$/.test(e.data ?? '')) {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">密碼</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="請輸入密碼"
                    className="pl-10 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPwd ? '隱藏密碼' : '顯示密碼'}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className={`w-full h-12 text-base bg-gradient-to-r ${config.buttonGradient}`}
                isLoading={submitting}
                loadingText="登入中..."
              >
                <LogIn className="w-4 h-4" />
                <span>登入</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 CloudBusLink
        </p>
      </div>

      {/* 登入成功後的全螢幕 PageLoader — 用 AnimatePresence 包住
          讓 loginSuccess 從 true → false (例如跳轉前 router 卸載) 時
          也能正常淡出, 不會殘影。 */}
      <AnimatePresence>
        {loginSuccess && (
          <PageLoader title="登入成功" subtitle="正在進入系統..." />
        )}
      </AnimatePresence>
    </div>
  );
}