'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bus, Phone, Lock, Eye, EyeOff, LogIn, UserCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/hooks';
import { isValidLoginAccount } from '@/lib/auth-lookup';
import { isSupabaseAvailable } from '@/lib/supabase-data';
import { nannyHomePath } from '@/lib/nanny-path';

export default function NannyLoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      // 已登入且是保姆 → 去個人化保姆頁 (如 /wendy/route), 否則回 login
      if (user.role === 'nanny') {
        router.replace(nannyHomePath(user));
      } else {
        router.replace('/');
      }
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!account.trim()) {
      setError('請輸入帳號名稱或手機號碼');
      return;
    }
    if (!password) {
      setError('請輸入密碼');
      return;
    }
    if (!isValidLoginAccount(account)) {
      setError('請輸入有效的帳號名稱或手機號碼 (8位數字)');
      return;
    }
    if (password.length < 6) {
      setError('密碼至少6位');
      return;
    }

    setSubmitting(true);
    // Vercel 首次開啟 localStorage 是空的 — 先等 cbl_users 同步下來再驗證，
    // 否則立即點登入會誤報「帳戶不存在」。
    if (isSupabaseAvailable()) {
      try {
        const { supabaseUsers } = await import('@/lib/supabase-users');
        await Promise.race([
          supabaseUsers.syncToStorage(),
          new Promise((r) => setTimeout(r, 8000)),
        ]);
      } catch (e) {
        console.warn('[NannyLogin] pre-login user sync failed:', e);
      }
    }
    // 只允許 nanny 角色登入
    const result = login(account, password, ['nanny']);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || '登入失敗');
      return;
    }
    router.replace(nannyHomePath(result.user));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* 返回按鈕 */}
        <button
          onClick={() => router.push('/login')}
          className="flex items-center gap-1 text-sm text-muted-foreground mb-6 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4"
          >
            <UserCheck className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">保姆入口</h1>
          <p className="text-sm text-muted-foreground mt-1">校巴隨車打卡</p>
        </div>

        {/* 表單卡片 */}
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">帳號名稱 / 手機號碼</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="text"
                    placeholder="請輸入帳號名稱或 8 位手機號碼"
                    className="pl-10"
                    value={account}
                    onChange={(e) => setAccount(e.target.value.trim())}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  可使用「帳號名稱」或「8 位手機號碼」登入
                </p>
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
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base bg-gradient-to-r from-emerald-500 to-teal-500"
                disabled={submitting}
              >
                <motion.span
                  animate={submitting ? { rotate: 360 } : { rotate: 0 }}
                  transition={submitting ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : {}}
                  className="flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {submitting ? '登入中...' : '登入'}
                </motion.span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 CloudBusLink
        </p>
      </motion.div>
    </div>
  );
}
