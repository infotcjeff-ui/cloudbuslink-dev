'use client';

import { useState } from 'react';
import { Save, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth, useSettings } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#6366f1',
];

export default function SiteSettingsPage() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings(user?.clientId);
  // 永遠不讓畫面空白: useSettings 在 hydration race 或 clientId 還沒拿到時
  // 可能回 null, 用 default() fallback 確保 input 一定有值可顯示。
  // (getByClient 本身也會 fallback, 但 useSettings 早期 return null 的路徑
  // 會讓整頁消失, 這裡雙重保險。)
  const safeSettings = settings ?? STORAGE.settings.default(user?.clientId ?? '');
  const [title, setTitle] = useState(safeSettings.title);
  const [phone, setPhone] = useState(safeSettings.phone);
  const [email, setEmail] = useState(safeSettings.email);
  const [address, setAddress] = useState(safeSettings.address);
  const [primaryColor, setPrimaryColor] = useState(safeSettings.primaryColor);
  const [logo, setLogo] = useState(safeSettings.logo ?? '');
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    if (!user?.clientId) return;
    updateSettings({
      title, phone, email, address, primaryColor, logo: logo || null
    });
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>公司 / 機構名稱</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="CloudBusLink"
            />
          </div>

          <div className="space-y-2">
            <Label>Logo (URL)</Label>
            <div className="flex gap-2">
              <Input
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://..."
              />
              {logo && (
                <img src={logo} alt="logo" className="w-11 h-11 rounded-lg object-contain border" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              留空將使用默認 Logo 佔位符
            </p>
          </div>

          <div className="space-y-2">
            <Label>主題色</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setPrimaryColor(c)}
                  className={`w-9 h-9 rounded-full border-2 transition-all ${
                    primaryColor === c ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#3b82f6"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>聯絡電話</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="23456789"
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@school.edu.hk"
            />
          </div>

          <div className="space-y-2">
            <Label>地址</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="香港九龍..."
              rows={2}
            />
          </div>

          {success && (
            <div className="text-sm text-success bg-success/10 rounded-lg px-3 py-2">
              ✓ 設定已保存
            </div>
          )}

          <Button onClick={handleSave} className="w-full h-12">
            <Save className="w-4 h-4" />
            保存設定
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
