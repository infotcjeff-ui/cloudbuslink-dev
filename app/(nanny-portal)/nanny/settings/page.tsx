'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { IdCard } from 'lucide-react';
import PortalSettings from '@/components/portal/PortalSettings';
import { useAuth, useNannyTrips } from '@/lib/hooks';
import { today } from '@/lib/utils';

/**
 * /nanny/settings — 保姆 portal 的設定頁。
 *
 * 只顯示: 員工基本資料 + 編輯個人資料 + 登出 (付款與訂閱僅家長可見)。
 * 「我的班次」在 portal 首頁 (/nanny), 不在此重複列出。
 *
 * 員工基本資料 (姓名 / 員工編號 / 在職狀態) 由 cbl_nannies 提供,
 * 與帳戶 (cbl_users) 分開 —— 管理員改的是 nannies 記錄, 所以呢度顯示唔係即時更新,
 * 但可以清楚話俾保姆知自己嘅僱傭編號同狀態。
 */
export default function NannySettingsPage() {
  const { user } = useAuth();
  const { nanny } = useNannyTrips(today());

  return (
    <PortalSettings
      topContent={
        nanny ? (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">員工基本資料</h3>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg font-bold flex-shrink-0">
                    {nanny.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{nanny.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <IdCard className="w-3 h-3 flex-shrink-0" />
                      員工編號: {nanny.employeeId}
                    </p>
                  </div>
                  <Badge variant={nanny.status === 'active' ? 'success' : 'secondary'}>
                    {nanny.status === 'active' ? '在職' : '離職'}
                  </Badge>
                </div>
                {nanny.phone && (
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
                    聯絡電話: {nanny.phone}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : user ? (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-1">員工基本資料</h3>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">找不到你的保姆資料</p>
                <p className="text-xs text-muted-foreground mt-1">請聯絡管理員更新你的帳戶</p>
              </CardContent>
            </Card>
          </div>
        ) : null
      }
    />
  );
}
