'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, IdCard, Phone } from 'lucide-react';
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
import type { Driver } from '@/lib/types';

export default function DriversPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', licenseNumber: '', status: 'available' as Driver['status'],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setDrivers(STORAGE.drivers.getByClient(user.clientId || ''));
  }, [user]);

  if (!user) return null;

  const filtered = drivers.filter(d => !search || d.name.includes(search) || d.phone.includes(search));

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', phone: '', licenseNumber: '', status: 'available' });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditId(d.id);
    setForm({ name: d.name, phone: d.phone, licenseNumber: d.licenseNumber, status: d.status });
    setError('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    setError('');
    if (!form.name.trim()) { setError('請輸入姓名'); return; }
    if (!isValidPhone(form.phone)) { setError('電話格式錯誤'); return; }
    if (!form.licenseNumber.trim()) { setError('請輸入駕照號碼'); return; }

    if (editId) {
      STORAGE.drivers.update(editId, {
        name: form.name.trim(), phone: form.phone,
        licenseNumber: form.licenseNumber.trim(), status: form.status,
      });
    } else {
      STORAGE.drivers.add({
        id: STORAGE.genId('driver'),
        clientId: user.clientId || '',
        name: form.name.trim(),
        phone: form.phone,
        licenseNumber: form.licenseNumber.trim(),
        photo: null,
        status: form.status,
        createdAt: new Date().toISOString(),
      });
    }
    setDrivers(STORAGE.drivers.getByClient(user.clientId || ''));
    setDialogOpen(false);
    setEditId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    STORAGE.drivers.remove(deleteId);
    setDrivers(STORAGE.drivers.getByClient(user.clientId || ''));
    setDeleteId(null);
  };

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
            <IdCard className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">未有任何司機</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => (
            <Card key={d.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {d.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold">{d.name}</p>
                      <Badge variant={d.status === 'available' ? 'success' : d.status === 'on_trip' ? 'warning' : 'secondary'} className="text-[10px]">
                        {d.status === 'available' ? '可派' : d.status === 'on_trip' ? '行駛中' : '休假'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.phone} · 駕照 {d.licenseNumber}</p>
                  </div>
                  <a href={`tel:${d.phone}`} className="p-2 rounded-full bg-success/10 text-success">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => openEdit(d)} className="p-2 rounded-full active:bg-muted">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteId(d.id)} className="p-2 rounded-full active:bg-destructive/10 text-destructive">
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
            <DialogTitle>{editId ? '編輯司機' : '新增司機'}</DialogTitle>
            <DialogDescription>填寫司機資料</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">姓名 *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">電話 *</label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">駕照號碼 *</label>
              <Input
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                placeholder="D1234567"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">狀態</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="available">可派</option>
                <option value="on_trip">行駛中</option>
                <option value="off_duty">休假</option>
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
            <DialogDescription>確定要刪除此司機?</DialogDescription>
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
