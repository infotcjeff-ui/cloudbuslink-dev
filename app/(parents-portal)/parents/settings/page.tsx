'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, IdCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import PortalSettings from '@/components/portal/PortalSettings';

/**
 * /parents/settings — 家長 portal 的設定頁。
 *
 * 只顯示: 編輯個人資料 + 已綁定子女 + 付款與訂閱 + 登出。
 * 管理員區塊 (帳戶管理/報表/網站設定) 位於 (main) 群組的 /settings,
 * 家長無權進入, 因此不在此提供入口。
 */
export default function ParentsSettingsPage() {
  const router = useRouter();

  return (
    <PortalSettings showPayment>
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">我的子女</h3>
        <Card>
          <CardContent className="p-0 divide-y">
            <button
              type="button"
              onClick={() => router.push('/parents/settings/binding')}
              className="w-full flex items-center gap-3 p-4 text-left transition-colors active:bg-muted/50"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <IdCard className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">已綁定子女</p>
                <p className="text-xs text-muted-foreground">查看子女乘車狀態</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>
      </div>
    </PortalSettings>
  );
}