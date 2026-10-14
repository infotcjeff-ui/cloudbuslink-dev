'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/hooks';
import { isValidPhone, roleLabel } from '@/lib/utils';

/**
 * 編輯個人資料 — 共用於 /settings/profile (主介面) 與各 portal 的設定頁。
 * 內容不依賴角色, 家長/保姆也可使用。
 */
export default function ProfileContent() {
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
    if (!isValidPhone(phone)) {
      setError('電話格式錯誤');
      return;
    }
    updateProfile({ name: name.trim(), phone });
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">角色</Label>
            <p className="text-sm font-semibold mt-1">{roleLabel(user.role)}</p>
          </div>

          <div className="space-y-2">
            <Label>姓名</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="請輸入姓名"
            />
          </div>

          <div className="space-y-2">
            <Label>電話號碼 (不可更改)</Label>
            <Input
              value={user.phone}
              disabled
              className="bg-muted"
            />
            <p className="text-[10px] text-muted-foreground">
              電話號碼為登入帳戶, 如需更改請聯絡管理員
            </p>
          </div>

          {user.email && (
            <div className="space-y-2">
              <Label>Email (不可更改)</Label>
              <Input
                value={user.email}
                disabled
                className="bg-muted"
              />
            </div>
          )}

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
            <Save className="w-4 h-4" />
            保存修改
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}