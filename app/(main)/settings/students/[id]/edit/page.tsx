'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { formatAcademicYear, parseAcademicYearCode } from '@/lib/utils';
import type { Student } from '@/lib/types';

// 與 new 頁共用同一份白名單, 確保兩處 UI 一致。
const ACADEMIC_YEAR_OPTIONS: string[] = ['2627', '2728'];

// 從 studentId ('stu-2627001') 抽出 '2627'。
// 無法解析時 (e.g. 舊資料格式異常) fallback 到白名單第一個。
function extractYearCode(studentId: string): string {
  // 預期格式: stu-YYYYNNN
  const m = /^stu-(\d{4})\d+$/.exec(studentId || '');
  if (m) {
    const code = m[1];
    return ACADEMIC_YEAR_OPTIONS.includes(code) ? code : ACADEMIC_YEAR_OPTIONS[0];
  }
  return ACADEMIC_YEAR_OPTIONS[0];
}

export default function EditStudentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [name, setName] = useState('');
  const [classNumber, setClassNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'graduated' | 'suspended'>('active');
  const [busId, setBusId] = useState('');
  const [parentIds, setParentIds] = useState<string[]>([]);
  // 學年 (4 位 code) — 預設從現有 studentId 反推; 之後使用者可改。
  const [academicYear, setAcademicYear] = useState<string>(ACADEMIC_YEAR_OPTIONS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) return;
    const s = STORAGE.students.getById(params.id as string);
    if (s) {
      setStudent(s);
      setName(s.name);
      setClassNumber(s.classNumber);
      setPhone(s.phone || '');
      setStatus(s.status);
      setBusId(s.busId || '');
      setParentIds(s.parentIds);
      setAcademicYear(extractYearCode(s.studentId));
    }
  }, [params.id]);

  if (!student || !user) return <div className="p-4 text-center text-muted-foreground">載入中...</div>;

  const allParents = STORAGE.parents.getByClient(user.clientId || '');
  const allBuses = STORAGE.buses.getByClient(user.clientId || '');

  const handleSubmit = () => {
    setError('');
    if (!name.trim()) { setError('請輸入姓名'); return; }
    if (!classNumber.trim()) { setError('請輸入班別'); return; }
    if (parentIds.length === 0) { setError('請至少關聯一位家長'); return; }

    // 注意: studentId 是 primary key, 不在這裡改; 學年 UI 主要讓使用者看到/確認
    // 該學生目前屬於哪個學年, 不重編號。
    STORAGE.students.update(student.id, {
      name: name.trim(),
      classNumber: classNumber.trim(),
      phone: phone.trim() || null,
      status,
      busId: busId || null,
      parentIds,
    });
    router.push('/settings/students');
  };

  const toggleParent = (id: string) => {
    setParentIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="bg-muted/40 rounded-xl p-3 mb-2">
            <p className="text-xs text-muted-foreground">學生編號</p>
            <p className="text-sm font-mono font-semibold">{student.studentId}</p>
          </div>

          {/* 學年 — 從現有 studentId 自動帶入, 唯讀顯示 (見上方 handleSubmit 註解)。 */}
          <div className="space-y-2">
            <Label>學年</Label>
            <Select
              value={academicYear}
              onChange={(e) => setAcademicYear(parseAcademicYearCode(e.target.value))}
            >
              {ACADEMIC_YEAR_OPTIONS.map(code => (
                <option key={code} value={code}>{formatAcademicYear(code)}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label>姓名 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>班別 *</Label>
            <Input value={classNumber} onChange={(e) => setClassNumber(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>電話</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          </div>

          <div className="space-y-2">
            <Label>狀態</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">在學</option>
              <option value="graduated">畢業</option>
              <option value="suspended">停學</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>綁定校巴</Label>
            <Select value={busId} onChange={(e) => setBusId(e.target.value)}>
              <option value="">未指派</option>
              {allBuses.map(b => (
                <option key={b.id} value={b.id}>{b.plateNumber}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label>關聯家長 *</Label>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {allParents.map(p => (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer ${
                    parentIds.includes(p.id) ? 'bg-primary/10' : 'bg-muted/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={parentIds.includes(p.id)}
                    onChange={() => toggleParent(p.id)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/settings/students')} className="flex-1 h-12">取消</Button>
            <Button onClick={handleSubmit} className="flex-1 h-12">
              <Save className="w-4 h-4" />
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
