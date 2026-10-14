'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, ChevronRight, User, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DialogAnimated as Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/**
 * PortalSettings — 家長 / 保姆專用的精簡設定頁。
 *
 * 依角色顯示:
 *   - 家長: 編輯個人資料 + 已綁定子女 + 付款與訂閱 + 登出
 *   - 保姆: 編輯個人資料 + 登出
 *
 * 兩者都「無」帳戶管理 / 報表 / 網站設定等管理員區塊 ——
 * 那些頁面位於 (main) 群組, 家長/保姆被 layout 守衛擋下。
 *
 * 額外項目: 透過 children 傳入 (如家長的「已綁定子女」連結)。
 *
 * 注意: 「編輯個人資料」以 inline 展開表單, 避免只有一項設定時還要多跳一層頁面。
 */
export default function PortalSettings({
  showPayment = false,
  children,
}: {
  showPayment?: boolean;
  children?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState(false);

  if (!user) return null;

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 編輯個人資料 */}
      {showProfileForm ? (
        <Card>
          <CardContent className="p-0">
            <ProfileForm />
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardContent className="p-0 divide-y">
              <button
                type="button"
                onClick={() => setShowProfileForm(true)}
                className="w-full flex items-center gap-3 p-4 text-left transition-colors active:bg-muted/50"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">編輯個人資料</p>
                  <p className="text-xs text-muted-foreground">修改姓名等個人資訊</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* 額外項目 (如家長的「已綁定子女」) */}
      {children}

      {/* 付款與訂閱 (僅家長) */}
      {showPayment && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">付款與訂閱</h3>
          <Card>
            <CardContent className="p-0 divide-y">
              <button
                type="button"
                onClick={() => setPaymentNotice(true)}
                className="w-full flex items-center gap-3 p-4 text-left transition-colors active:bg-muted/50"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">付款管理</p>
                  <p className="text-xs text-muted-foreground">管理付款方式 (即將推出)</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 登出 */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={() => logout()}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-destructive text-destructive-foreground text-sm font-semibold active:scale-95 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        登出
      </motion.button>

      <p className="text-center text-xs text-muted-foreground pt-2">
        CloudBusLink v1.0.0
      </p>

      {/* 付款功能尚未開放 */}
      <Dialog open={paymentNotice} onOpenChange={setPaymentNotice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>付款系統開發中</DialogTitle>
            <DialogDescription>
              付款管理功能尚未開放, 敬請期待。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="active:scale-95"
              onClick={() => setPaymentNotice(false)}
            >
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 個人資料表單 — 邏輯與 components/portal/ProfileContent 相同, 但可嵌入此頁 */
function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!user) return null;

  const handleSave = () => {
    setError('');
    if (!name.trim()) {
      setError('請輸入姓名');
      return;
    }
    updateProfile({ name: name.trim(), phone });
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <label htmlFor="portal-settings-name" className="text-xs font-medium">
          姓名
        </label>
        <input
          id="portal-settings-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="請輸入姓名"
          className={cn(
            'w-full h-12 rounded-lg border border-input bg-background px-3 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/50'
          )}
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-success bg-success/10 rounded-lg px-3 py-2">
          ✓ 資料已更新
        </div>
      )}

      <Button onClick={handleSave} className="w-full h-12">
        保存修改
      </Button>
    </div>
  );
}