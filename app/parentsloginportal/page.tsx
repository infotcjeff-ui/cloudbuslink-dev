'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bus, Phone, Lock, Eye, EyeOff, LogIn, Users, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/hooks';
import { isValidPhone } from '@/lib/utils';
import { initMockData } from '@/lib/mock-data';

export default function ParentsLoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    initMockData();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      // 已登入且是家長 → 去家長頁, 否則回 login
      if (user.role === 'parent') {
        router.replace('/parents');
      } else {
        router.replace('/');
      }
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim()) {
      setError('請輸入手機號碼');
      return;
    }
    if (!password) {
      setError('請輸入密碼');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('請輸入有效的手機號碼 (8位數字)');
      return;
    }
    if (password.length < 6) {
      setError('密碼至少6位');
      return;
    }

    setSubmitting(true);
    // 只允許 parent 角色登入
    const result = login(phone, password, ['parent']);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || '登入失敗');
      return;
    }
    router.replace('/parents');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-pink-50 via-white to-rose-50">
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
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/30 mb-4"
          >
            <Users className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">家長入口</h1>
          <p className="text-sm text-muted-foreground mt-1">查看子女乘車資訊</p>
        </div>

        {/* 表單卡片 */}
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">手機號碼</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="請輸入 8 位手機號碼"
                    className="pl-10"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    autoComplete="tel"
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
                className="w-full h-12 text-base bg-gradient-to-r from-pink-500 to-rose-500"
                disabled={submitting}
              >
                <LogIn className="w-4 h-4" />
                {submitting ? '登入中...' : '登入'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 示範帳戶 */}
        <div className="mt-6">
          <p className="text-xs text-center text-muted-foreground mb-2">示範帳戶 (一鍵登入)</p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhone('90000005');
                setPassword('parent123');
              }}
              className="text-xs h-9"
            >
              家長 - 張先生 (90000005)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhone('90000006');
                setPassword('parent123');
              }}
              className="text-xs h-9"
            >
              家長 - 陳太太 (90000006)
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 CloudBusLink
        </p>
      </motion.div>
    </div>
  );
}
