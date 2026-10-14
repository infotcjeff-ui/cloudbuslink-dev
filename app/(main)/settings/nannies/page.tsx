'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Users, Phone, Bus as BusIcon, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DialogAnimated as Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { isValidPhone } from '@/lib/utils';
import type { Nanny } from '@/lib/types';

// 編輯模式的密碼 sentinel: 代表「保留現有密碼」
const KEEP_PASSWORD = '__KEEP__';
// 遮罩顯示的字元
const MASK = '••••••••';

export default function NanniesPage() {
  const { user } = useAuth();
  const [nannies, setNannies] = useState<Nanny[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // 編輯模式: 儲存「現有密碼」供眼睛 icon 顯示真實內容 (不寫進 form.password)
  const [existingPassword, setExistingPassword] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', employeeId: '', assignedBusIds: [] as string[], status: 'active' as Nanny['status'],
    password: '',     // 新增: 必填 (>=6); 編輯: 留空 = 不改
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setNannies(STORAGE.nannies.getByClient(user.clientId || ''));
  }, [user]);

  if (!user) return null;

  const buses = STORAGE.buses.getByClient(user.clientId || '');

  const filtered = nannies.filter(n => !search || n.name.includes(search) || n.phone.includes(search));

  const openCreate = () => {
    setEditId(null);
    setShowPassword(false);
    setExistingPassword('');
    setForm({ name: '', phone: '', employeeId: '', assignedBusIds: [], status: 'active', password: '' });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (n: Nanny) => {
    setEditId(n.id);
    setShowPassword(false);
    // 若對應 user 帳號已有密碼, 設 sentinel 觸發遮罩顯示, 並保留真實密碼供眼睛 icon 顯示
    const existingUser = STORAGE.users.findByPhone(n.phone);
    setExistingPassword(existingUser?.password || '');
    setForm({
      name: n.name, phone: n.phone, employeeId: n.employeeId,
      assignedBusIds: n.assignedBusIds, status: n.status,
      password: existingUser?.password ? KEEP_PASSWORD : '',
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    setError('');
    if (!form.name.trim()) { setError('請輸入姓名'); return; }
    if (!isValidPhone(form.phone)) { setError('電話格式錯誤'); return; }
    if (!form.employeeId.trim()) { setError('請輸入員工編號'); return; }

    // 將 sentinel 視為「不改密碼」, 其他值都視為新密碼
    const isKeepPassword = form.password === KEEP_PASSWORD;
    const newPassword = isKeepPassword ? '' : form.password;

    if (editId) {
      // 編輯模式: 密碼留空 = 不改; 有填 = 至少 6 字元才更新
      if (newPassword && newPassword.length < 6) {
        setError('密碼至少需要 6 個字元');
        return;
      }
      STORAGE.nannies.update(editId, {
        name: form.name.trim(), phone: form.phone,
        employeeId: form.employeeId.trim(), assignedBusIds: form.assignedBusIds, status: form.status,
      });
      // 若有填新密碼, 同步更新對應 user 帳號
      if (newPassword) {
        const u = STORAGE.users.findByPhone(form.phone);
        if (u) STORAGE.users.update(u.id, { password: newPassword });
      }
    } else {
      // 新增: 密碼必填, 至少 6 字元
      if (!newPassword) { setError('請設定登入密碼'); return; }
      if (newPassword.length < 6) { setError('密碼至少需要 6 個字元'); return; }
      // 檢查電話是否已被註冊
      if (STORAGE.users.findByPhone(form.phone)) {
        setError('此電話已被註冊, 請用其他號碼');
        return;
      }
      const userId = STORAGE.genId('user');
      STORAGE.users.add({
        id: userId,
        phone: form.phone,
        password: newPassword,  // 使用管理員自訂密碼
        role: 'nanny',
        name: form.name.trim(),
        clientId: user.clientId,
        status: 'active',
        createdAt: new Date().toISOString(),
      });

      STORAGE.nannies.add({
        id: STORAGE.genId('nanny'),
        clientId: user.clientId || '',
        name: form.name.trim(),
        phone: form.phone,
        employeeId: form.employeeId.trim(),
        photo: null,
        assignedBusIds: form.assignedBusIds,
        status: form.status,
        createdAt: new Date().toISOString(),
      });
    }
    setNannies(STORAGE.nannies.getByClient(user.clientId || ''));
    setDialogOpen(false);
    setEditId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    STORAGE.nannies.remove(deleteId);
    setNannies(STORAGE.nannies.getByClient(user.clientId || ''));
    setDeleteId(null);
  };

  const toggleBus = (id: string) => {
    setForm(f => ({
      ...f,
      assignedBusIds: f.assignedBusIds.includes(id)
        ? f.assignedBusIds.filter(b => b !== id)
        : [...f.assignedBusIds, id]
    }));
  };

  // 密碼欄位顯示邏輯:
  // - sentinel ('__KEEP__') = 保留現有密碼, 顯示遮罩, 點眼睛可看真實密碼
  // - 其他值 = 使用者輸入的新密碼, 直接顯示/隱藏
  const isKeepMask = form.password === KEEP_PASSWORD;
  const isPasswordVisible = showPassword && (isKeepMask ? !!existingPassword : form.password.length > 0);

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋姓名或電話..."
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">未有任何保姆</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <Card key={n.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center text-sm font-semibold text-warning">
                    {n.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold">{n.name}</p>
                      <Badge variant={n.status === 'active' ? 'success' : 'secondary'} className="text-[10px]">
                        {n.status === 'active' ? '在職' : '離職'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{n.employeeId} · {n.phone}</p>
                    {n.assignedBusIds.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <BusIcon className="w-3 h-3" />
                        <span>{n.assignedBusIds.length} 輛校巴</span>
                      </div>
                    )}
                  </div>
                  <a href={`tel:${n.phone}`} className="p-2 rounded-full bg-success/10 text-success">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => openEdit(n)} className="p-2 rounded-full active:bg-muted">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteId(n.id)} className="p-2 rounded-full active:bg-destructive/10 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button
        onClick={openCreate}
        className="fixed right-4 bottom-24 h-14 w-14 rounded-full shadow-lg z-30"
        size="icon"
      >
        <Plus className="w-6 h-6" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? '編輯保姆' : '新增保姆'}</DialogTitle>
            <DialogDescription>
              {editId ? '更新保姆資料, 密碼欄位留空表示不修改' : '設定登入密碼, 保姆將用手機 + 密碼登入'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">姓名 *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">電話 * (登入帳戶)</label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                disabled={!!editId}
                className={editId ? 'bg-muted' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                登入密碼 {editId ? '(留空保留現有密碼, 或輸入新密碼覆蓋)' : '*'}
              </label>
              <div className="relative">
                <Input
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={isKeepMask ? (showPassword ? existingPassword : MASK) : form.password}
                  onChange={(e) => {
                    if (!isKeepMask) {
                      setForm({ ...form, password: e.target.value });
                      return;
                    }
                    // 遮罩狀態下輸入: 去掉遮罩/現有密碼前綴, 只取使用者新敲的內容
                    // (直接聚焦不動 sentinel, 避免整組密碼消失)
                    const raw = e.target.value;
                    const stripped = (showPassword && existingPassword && raw.startsWith(existingPassword))
                      ? raw.slice(existingPassword.length)
                      : raw.replace(/^•+/, '');
                    setForm({ ...form, password: stripped });
                  }}
                  placeholder={editId ? (isKeepMask ? '已設密碼, 輸入新密碼以覆蓋' : '留空保留, 或輸入新密碼') : '至少 6 個字元'}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md active:bg-muted"
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4 text-muted-foreground" />
                    : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">員工編號 *</label>
              <Input
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                placeholder="EMP-001"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">負責校巴 (可多選)</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {buses.map(b => (
                  <label
                    key={b.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer ${
                      form.assignedBusIds.includes(b.id) ? 'bg-primary/10' : 'bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.assignedBusIds.includes(b.id)}
                      onChange={() => toggleBus(b.id)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1 text-sm">{b.plateNumber} - {b.model}</div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">狀態</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="active">在職</option>
                <option value="inactive">離職</option>
              </Select>
            </div>
          </div>
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditId(null); }}>取消</Button>
            <Button onClick={handleSubmit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>確定要刪除此保姆?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
