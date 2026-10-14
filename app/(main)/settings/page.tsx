'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  User, Settings as SettingsIcon, Megaphone, LogOut, ChevronRight,
  Bus as BusIcon, Users, IdCard, BarChart3, CreditCard
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DialogAnimated as Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useAuth, useSettings } from '@/lib/hooks';
import { cn, roleLabel } from '@/lib/utils';

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { settings } = useSettings(user?.clientId);
  const [logoutDialog, setLogoutDialog] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'super_admin' || user.role === 'client';

  const handleLogout = () => {
    logout();
    // logout 會自動跳轉到 /login，這裡不需要額外跳轉
  };

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* CBL Admin Setting 入口 - PC Dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={() => router.push('/cbl-admin-setting')}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl transition-shadow active:scale-[0.99]"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-base">CBL Admin Setting</p>
            <p className="text-xs text-white/80">管理後台 · PC 優先 Dashboard</p>
          </div>
          <ChevronRight className="w-5 h-5" />
        </button>
      </motion.div>

      {/* 用戶資料卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: settings?.primaryColor || '#3b82f6' }}
              >
                {user.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email || user.phone}</p>
                <Badge variant="secondary" className="mt-1">{roleLabel(user.role)}</Badge>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/settings/profile')}
            >
              <User className="w-4 h-4" />
              編輯個人資料
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* 帳戶管理 (Admin/Client) */}
      {isAdmin && (
        <Section title="帳戶管理">
          <MenuItem
            icon={IdCard}
            label="學生"
            description="管理學生資料、綁定校巴"
            onClick={() => router.push('/settings/students')}
          />
          <MenuItem
            icon={Users}
            label="家長"
            description="管理家長、接送權限"
            onClick={() => router.push('/settings/parents')}
          />
          <MenuItem
            icon={BusIcon}
            label="校巴"
            description="管理校巴、綁定司機"
            onClick={() => router.push('/settings/buses')}
          />
          <MenuItem
            icon={IdCard}
            label="司機"
            description="管理司機資料"
            onClick={() => router.push('/settings/drivers')}
          />
          <MenuItem
            icon={Users}
            label="保姆"
            description="管理保姆、分配校巴"
            onClick={() => router.push('/settings/nannies')}
          />
        </Section>
      )}

      {/* 報表 (Admin/Client) */}
      {isAdmin && (
        <Section title="報表中心">
          <MenuItem
            icon={BarChart3}
            label="行程報表"
            description="匯出 Excel, 完整行程記錄"
            onClick={() => router.push('/settings/reports')}
          />
        </Section>
      )}

      {/* 網站設定 (Admin/Client) */}
      {isAdmin && (
        <Section title="網站設定">
          <MenuItem
            icon={SettingsIcon}
            label="一般設定"
            description="公司資料、Logo、主題色"
            onClick={() => router.push('/settings/site')}
          />
          <MenuItem
            icon={Megaphone}
            label="公告設定"
            description="新增、編輯公告與範本"
            onClick={() => router.push('/settings/announcements')}
          />
        </Section>
      )}

      {/* 付款 (預留) */}
      <Section title="付款與訂閱">
        <MenuItem
          icon={CreditCard}
          label="付款管理"
          description="管理付款方式 (即將推出)"
          onClick={() => alert('付款系統開發中')}
          disabled
        />
      </Section>

      {/* 登出 */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={() => setLogoutDialog(true)}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-destructive text-destructive-foreground text-sm font-semibold active:scale-95 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        登出
      </motion.button>

      <p className="text-center text-xs text-muted-foreground pt-2">
        CloudBusLink v1.0.0
      </p>

      {/* 登出確認 (置中 Dialog, 純 fade 進退場 - Framer Motion) */}
      <Dialog open={logoutDialog} onOpenChange={setLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認登出</DialogTitle>
            <DialogDescription>您即將登出 CloudBusLink, 確定要繼續嗎?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="active:scale-95"
              onClick={() => setLogoutDialog(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              className="active:scale-95"
              onClick={handleLogout}
            >
              確認登出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">{title}</h3>
      <Card>
        <CardContent className="p-0 divide-y">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function MenuItem({ icon: Icon, label, description, onClick, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 p-4 text-left transition-colors',
        !disabled && 'active:bg-muted/50',
        disabled && 'opacity-50'
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}
