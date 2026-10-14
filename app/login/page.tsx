'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bus, Phone, Lock, Eye, EyeOff, LogIn, Users, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/hooks';
import { isValidPhone } from '@/lib/utils';
import { initMockData } from '@/lib/mock-data';

export default function LoginPage() {
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
      router.replace('/');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidPhone(phone)) {
      setError('請輸入有效的手機號碼 (8位數字)');
      return;
    }
    if (password.length < 6) {
      setError('密碼至少6位');
      return;
    }

    setSubmitting(true);
    const result = login(phone, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || '登入失敗');
      return;
    }
    // 登入成功: 根據角色跳轉到對應頁面
    const role = result.user?.role;
    if (role === 'parent') {
      router.replace('/parents');
    } else if (role === 'nanny') {
      router.replace('/nanny');
    } else {
      router.replace('/');
    }
  };

  const quickLogin = (p: string) => {
    setPhone(p);
    setPassword(p === '90000001' ? 'admin123' : 'client123');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30 mb-4"
          >
            <Bus className="w-10 h-10 text-primary-foreground" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">CloudBusLink</h1>
          <p className="text-sm text-muted-foreground mt-1">校巴點名打卡系統</p>
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
                className="w-full h-12 text-base"
                disabled={submitting}
              >
                <LogIn className="w-4 h-4" />
                {submitting ? '登入中...' : '登入'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Portal 入口 - 家長 & 保姆 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-6 space-y-2"
        >
          <p className="text-xs text-center text-muted-foreground mb-2">選擇您的入口</p>

          <Button
            type="button"
            onClick={() => router.push('/parentsloginportal')}
            className="w-full h-14 text-base bg-gradient-to-r from-pink-500 to-rose-500"
          >
            <Users className="w-5 h-5 mr-2" />
            家長入口
          </Button>

          <Button
            type="button"
            onClick={() => router.push('/nannyloginportal')}
            className="w-full h-14 text-base bg-gradient-to-r from-emerald-500 to-teal-500"
          >
            <UserCheck className="w-5 h-5 mr-2" />
            保姆入口
          </Button>
        </motion.div>

        {/* 示範帳戶 */}
        <div className="mt-6">
          <p className="text-xs text-center text-muted-foreground mb-2">管理員/校長示範帳戶 (一鍵登入)</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => quickLogin('90000001')}
              className="text-xs h-9"
            >
              系統管理員
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => quickLogin('90000002')}
              className="text-xs h-9"
            >
              客戶 (校長)
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