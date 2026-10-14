'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, IdCard, Filter, ChevronRight } from 'lucide-react';
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
import type { Student } from '@/lib/types';

export default function StudentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setStudents(STORAGE.students.getByClient(user.clientId || ''));
  }, [user]);

  if (!user) return null;

  // 取得所有班別
  const classes = Array.from(new Set(students.map(s => s.classNumber))).sort();

  const filtered = students.filter(s => {
    if (search && !s.name.includes(search) && !s.studentId.includes(search)) return false;
    if (filterClass && s.classNumber !== filterClass) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const handleDelete = () => {
    if (!deleteId) return;
    STORAGE.students.remove(deleteId);
    setStudents(STORAGE.students.getByClient(user.clientId || ''));
    setDeleteId(null);
  };

  return (
    <div className="px-4 pt-4 pb-24">
      {/* 搜尋 & 篩選 */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋姓名或學號..."
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
            <option value="">全部班別</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">全部狀態</option>
            <option value="active">在學</option>
            <option value="graduated">畢業</option>
            <option value="suspended">停學</option>
          </Select>
        </div>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <IdCard className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">未有學生資料</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s, i) => {
            const bus = s.busId ? STORAGE.buses.getById(s.busId) : null;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                        {s.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold">{s.name}</p>
                          <Badge
                            variant={s.status === 'active' ? 'success' : s.status === 'suspended' ? 'warning' : 'secondary'}
                            className="text-[10px]"
                          >
                            {s.status === 'active' ? '在學' : s.status === 'suspended' ? '停學' : '畢業'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.classNumber} · {s.studentId}
                        </p>
                        {bus && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            🚌 {bus.plateNumber}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => router.push(`/settings/students/${s.id}/edit`)}
                        className="p-2 rounded-full active:bg-muted"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(s.id)}
                        className="p-2 rounded-full active:bg-destructive/10 text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 新增按鈕 */}
      <Button
        onClick={() => router.push('/settings/students/new')}
        className="fixed right-4 bottom-24 h-14 w-14 rounded-full shadow-lg z-30"
        size="icon"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {/* 刪除確認 */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>此操作無法撤銷, 確定要刪除此學生?</DialogDescription>
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
