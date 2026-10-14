'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Edit2, Trash2, Users, Eye, EyeOff, Sparkles } from 'lucide-react';
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
import {
  ParentFormModal,
  EMPTY_PARENT_FORM,
  type ParentFormState,
} from '@/app/(main)/cbl-admin-setting/[layout]/students/ParentFormModal';
import type { Parent } from '@/lib/types';

// 編輯模式的密碼 sentinel: 代表「保留現有密碼」
const KEEP_PASSWORD = '__KEEP__';
// 遮罩顯示的字元
const MASK = '••••••••';

export default function ParentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [parents, setParents] = useState<Parent[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // 編輯模式: 儲存「現有密碼」供眼睛 icon 顯示真實內容 (不寫進 form.password)
  const [existingPassword, setExistingPassword] = useState('');
  // 「新版家長表單」(ParentFormModal) 開關 — 提供完整欄位含主要聯繫人/密碼/通訊地址
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [isNewFormSaving, setIsNewFormSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', alternatePhone: '',
    relationship: 'father' as Parent['relationship'],
    isPickupAuth: true, notificationEnabled: true, status: 'active' as Parent['status'],
    password: '',     // 新增: 必填 (>=6); 編輯: 留空 = 不改
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setParents(STORAGE.parents.getByClient(user.clientId || ''));
  }, [user]);

  if (!user) return null;

  const filtered = parents.filter(p =>
    !search || p.name.includes(search) || p.phone.includes(search)
  );

  const openCreate = () => {
    setEditId(null);
    setShowPassword(false);
    setExistingPassword('');
    setForm({ name: '', phone: '', alternatePhone: '', relationship: 'father', isPickupAuth: true, notificationEnabled: true, status: 'active', password: '' });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (p: Parent) => {
    setEditId(p.id);
    setShowPassword(false);
    // 若對應 user 帳號已有密碼, 設 sentinel 觸發遮罩顯示, 並保留真實密碼供眼睛 icon 顯示
    const existingUser = STORAGE.users.findByPhone(p.phone);
    setExistingPassword(existingUser?.password || '');
    setForm({
      name: p.name, phone: p.phone,
      alternatePhone: p.alternatePhone || '',
      relationship: p.relationship,
      isPickupAuth: p.isPickupAuth, notificationEnabled: p.notificationEnabled, status: p.status,
      password: existingUser?.password ? KEEP_PASSWORD : '',
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    setError('');
    if (!form.name.trim()) { setError('請輸入姓名'); return; }
    if (!isValidPhone(form.phone)) { setError('電話格式錯誤 (8位數字)'); return; }

    // 將 sentinel 視為「不改密碼」, 其他值都視為新密碼
    const isKeepPassword = form.password === KEEP_PASSWORD;
    const newPassword = isKeepPassword ? '' : form.password;

    if (editId) {
      // 編輯模式: 密碼留空 = 不改; 有填 = 至少 6 字元才更新
      if (newPassword && newPassword.length < 6) {
        setError('密碼至少需要 6 個字元');
        return;
      }
      STORAGE.parents.update(editId, {
        name: form.name.trim(),
        phone: form.phone,
        alternatePhone: form.alternatePhone || null,
        relationship: form.relationship,
        isPickupAuth: form.isPickupAuth,
        notificationEnabled: form.notificationEnabled,
        status: form.status,
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
      // 創建 user 帳戶 + parent
      const userId = STORAGE.genId('user');
      STORAGE.users.add({
        id: userId,
        phone: form.phone,
        password: newPassword,  // 使用管理員自訂密碼
        role: 'parent',
        name: form.name.trim(),
        clientId: user.clientId,
        status: 'active',
        createdAt: new Date().toISOString(),
      });

      STORAGE.parents.add({
        id: STORAGE.genId('parent'),
        clientId: user.clientId || '',
        name: form.name.trim(),
        phone: form.phone,
        alternatePhone: form.alternatePhone || null,
        homePhone: null,
        officePhone: null,
        address: null,
        relationship: form.relationship,
        isPickupAuth: form.isPickupAuth,
        isPrimaryContact: false,
        password: form.phone, // 預設密碼 = 電話 (使用者可在「家長管理」再改)
        notificationEnabled: form.notificationEnabled,
        status: form.status,
        createdAt: new Date().toISOString(),
      });
    }
    setParents(STORAGE.parents.getByClient(user.clientId || ''));
    setDialogOpen(false);
    setEditId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    STORAGE.parents.remove(deleteId);
    setParents(STORAGE.parents.getByClient(user.clientId || ''));
    setDeleteId(null);
  };

  /**
   * 「新版家長表單」儲存 handler
   * 接收來自 ParentFormModal 的 ParentFormState, 寫入 STORAGE.parents
   * 注意: 主要聯繫人已改為「學生視角」, 此處不再處理 isPrimaryContact。
   */
  const handleNewFormSave = async (state: ParentFormState) => {
    setIsNewFormSaving(true);
    try {
      const clientId = user?.clientId || '';
      // 1) 新增家長 (主要聯繫人標記已移至學生層級, 此處不再儲存)
      const newId = STORAGE.genId('parent');
      STORAGE.parents.add({
        id: newId,
        clientId,
        name: state.name.trim(),
        phone: state.phone.trim(),
        alternatePhone: null,
        homePhone: state.homePhone.trim() || null,
        officePhone: state.officePhone.trim() || null,
        address: state.address.trim() || null,
        relationship: state.relationship,
        isPickupAuth: true,
        password: state.password,
        notificationEnabled: true,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      // 3) 同步建立 user 帳號 (供家長登入)
      const existingUser = STORAGE.users.findByPhone(state.phone.trim());
      if (existingUser) {
        STORAGE.users.update(existingUser.id, { password: state.password, name: state.name.trim() });
      } else {
        STORAGE.users.add({
          id: STORAGE.genId('user'),
          phone: state.phone.trim(),
          password: state.password,
          role: 'parent',
          name: state.name.trim(),
          email: undefined,
          clientId,
          photo: null,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }
      // 4) 重新載入 + 關閉
      setParents(STORAGE.parents.getByClient(clientId));
      setNewFormOpen(false);
    } finally {
      setIsNewFormSaving(false);
    }
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
          <p className="text-sm text-muted-foreground">未有關係人資料</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const relLabel = { father: '父親', mother: '母親', grandfather_paternal: '祖父', grandmother_paternal: '祖母', grandfather_maternal: '外祖父', grandmother_maternal: '外祖母', guardian_other: '其他監護人' }[p.relationship];
            return (
              <Card key={p.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {p.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <Badge variant="secondary" className="text-[10px]">{relLabel}</Badge>
                        {p.isPickupAuth && <Badge variant="success" className="text-[10px]">接送</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.phone}</p>
                      {p.alternatePhone && (
                        <p className="text-[10px] text-muted-foreground">備用: {p.alternatePhone}</p>
                      )}
                    </div>
                    <button onClick={() => openEdit(p)} className="p-2 rounded-full active:bg-muted">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="p-2 rounded-full active:bg-destructive/10 text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Button
        onClick={openCreate}
        variant="outline"
        className="fixed right-20 bottom-24 h-14 w-14 rounded-full shadow-lg z-30"
        size="icon"
        title="舊版快速新增"
      >
        <Plus className="w-6 h-6" />
      </Button>
      <Button
        onClick={() => setNewFormOpen(true)}
        className="fixed right-4 bottom-24 h-14 w-14 rounded-full shadow-lg z-30"
        size="icon"
        title="新版本表單新增 (含主要聯繫人/通訊地址/進階備用電話)"
      >
        <Sparkles className="w-6 h-6" />
      </Button>

      {/* 新增/編輯對話框 */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? '編輯家長' : '新增家長'}</DialogTitle>
            <DialogDescription>
              {editId ? '更新家長資料, 密碼欄位留空表示不修改' : '設定登入密碼, 家長將用手機 + 密碼登入'}
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
              <label className="text-xs font-medium">備用電話</label>
              <Input
                type="tel"
                value={form.alternatePhone}
                onChange={(e) => setForm({ ...form, alternatePhone: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">關係</label>
              <Select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value as any })}>
                <option value="father">父親</option>
                <option value="mother">母親</option>
                <option value="guardian">監護人</option>
                <option value="other">其他</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">狀態</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pickup"
                checked={form.isPickupAuth}
                onChange={(e) => setForm({ ...form, isPickupAuth: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="pickup" className="text-sm">有接送權限</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notify"
                checked={form.notificationEnabled}
                onChange={(e) => setForm({ ...form, notificationEnabled: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="notify" className="text-sm">接收通知</label>
            </div>
          </div>
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-2">{error}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditId(null); }}>取消</Button>
            <Button onClick={handleSubmit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 刪除確認 */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>此操作無法撤銷, 確定要刪除此家長?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新版家長表單 (主要聯繫人/通訊地址/進階備用) */}
      <ParentFormModal
        open={newFormOpen}
        mode="add"
        initial={EMPTY_PARENT_FORM}
        existingParents={parents}
        isSaving={isNewFormSaving}
        onSave={handleNewFormSave}
        onClose={() => setNewFormOpen(false)}
      />
    </div>
  );
}
