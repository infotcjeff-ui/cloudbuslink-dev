'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Edit2, Trash2, Bus, Users } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { Bus as BusType } from '@/lib/types';

export default function BusesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [buses, setBuses] = useState<BusType[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    plateNumber: '', model: '', capacity: 28, driverId: '', status: 'active' as BusType['status'],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setBuses(STORAGE.buses.getByClient(user.clientId || ''));
  }, [user]);

  if (!user) return null;

  const drivers = STORAGE.drivers.getByClient(user.clientId || '');

  const filtered = buses.filter(b => !search || b.plateNumber.includes(search.toUpperCase()));

  const openCreate = () => {
    setEditId(null);
    setForm({ plateNumber: '', model: '', capacity: 28, driverId: '', status: 'active' });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (b: BusType) => {
    setEditId(b.id);
    setForm({
      plateNumber: b.plateNumber, model: b.model, capacity: b.capacity,
      driverId: b.driverId || '', status: b.status,
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    setError('');
    if (!form.plateNumber.trim()) { setError('請輸入車牌'); return; }
    if (!form.model.trim()) { setError('請輸入型號'); return; }
    if (form.capacity < 1) { setError('座位數必須大於 0'); return; }

    if (editId) {
      STORAGE.buses.update(editId, {
        plateNumber: form.plateNumber.trim().toUpperCase(),
        model: form.model.trim(),
        capacity: form.capacity,
        driverId: form.driverId || null,
        status: form.status,
      });
    } else {
      STORAGE.buses.add({
        id: STORAGE.genId('bus'),
        clientId: user.clientId || '',
        plateNumber: form.plateNumber.trim().toUpperCase(),
        model: form.model.trim(),
        capacity: form.capacity,
        driverId: form.driverId || null,
        gpsDeviceId: null,
        status: form.status,
        currentLocation: {
          latitude: 22.3193,
          longitude: 114.1694,
          speed: 0,
          lastUpdated: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });
    }
    setBuses(STORAGE.buses.getByClient(user.clientId || ''));
    setDialogOpen(false);
    setEditId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    STORAGE.buses.remove(deleteId);
    setBuses(STORAGE.buses.getByClient(user.clientId || ''));
    setDeleteId(null);
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value.toUpperCase())}
          placeholder="搜尋車牌..."
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <Bus className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">未有任何校巴</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => {
            const driver = b.driverId ? STORAGE.drivers.getById(b.driverId) : null;
            const studentCount = STORAGE.students.getByClient(user.clientId || '').filter(s => s.busId === b.id).length;
            return (
              <Card key={b.id}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      b.status === 'active' ? 'bg-success/10' : 'bg-muted'
                    )}>
                      <Bus className={cn('w-6 h-6', b.status === 'active' ? 'text-success' : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold">{b.plateNumber}</p>
                        <Badge variant={b.status === 'active' ? 'success' : b.status === 'maintenance' ? 'warning' : 'secondary'} className="text-[10px]">
                          {b.status === 'active' ? '運行' : b.status === 'maintenance' ? '維護' : '停用'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{b.model} · {b.capacity}座</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>👤 {driver?.name || '未指派司機'}</span>
                        <span>·</span>
                        <span>🎒 {studentCount} 學生</span>
                      </div>
                    </div>
                    <button onClick={() => openEdit(b)} className="p-2 rounded-full active:bg-muted">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(b.id)} className="p-2 rounded-full active:bg-destructive/10 text-destructive">
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
        className="fixed right-4 bottom-24 h-14 w-14 rounded-full shadow-lg z-30"
        size="icon"
      >
        <Plus className="w-6 h-6" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? '編輯校巴' : '新增校巴'}</DialogTitle>
            <DialogDescription>填寫校巴資料</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">車牌 *</label>
              <Input
                value={form.plateNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })}
                placeholder="AB-1234"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">型號 *</label>
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="Toyota Coaster"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">座位數 *</label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">綁定司機</label>
              <Select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                <option value="">未指派</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} - {d.phone}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">狀態</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="active">運行中</option>
                <option value="maintenance">維護中</option>
                <option value="inactive">停用</option>
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
            <DialogDescription>確定要刪除此校巴? 學生綁定將被解除</DialogDescription>
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
