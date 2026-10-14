'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { formatAcademicYear, parseAcademicYearCode } from '@/lib/utils';

// 學生可選的學年清單 (UI 上顯示 '26-27' / '27-28' 等)。
// 內部仍以 4 位 code (e.g. '2627') 儲存與產 studentId。
// 新增 28-29 學年時, 只要在這裡加一筆, 學年下拉就會自動多一個選項。
const ACADEMIC_YEAR_OPTIONS: string[] = ['2627', '2728'];

export default function NewStudentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [classNumber, setClassNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'graduated' | 'suspended'>('active');
  const [busId, setBusId] = useState('');
  const [parentIds, setParentIds] = useState<string[]>([]);
  // 學年 (4 位 code) — 預設值優先用 settings.academicYear, 若不在白名單內
  // (例如 settings 改成了 '3031') 就 fallback 到白名單第一個, 避免下拉無對應。
  const [academicYear, setAcademicYear] = useState<string>(
    () => {
      const settings = STORAGE.settings.getByClient(user?.clientId || '');
      const cur = settings.academicYear;
      return ACADEMIC_YEAR_OPTIONS.includes(cur) ? cur : ACADEMIC_YEAR_OPTIONS[0];
    }
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const allParents = STORAGE.parents.getByClient(user.clientId || '');
  const allBuses = STORAGE.buses.getByClient(user.clientId || '');

  const handleSubmit = () => {
    setError('');
    if (!name.trim()) { setError('請輸入姓名'); return; }
    if (!classNumber.trim()) { setError('請輸入班別'); return; }
    if (parentIds.length === 0) { setError('請至少關聯一位家長'); return; }

    setSaving(true);
    const studentId = STORAGE.students.generateStudentId(user.clientId || '', academicYear);

    STORAGE.students.add({
      id: STORAGE.genId('student'),
      clientId: user.clientId || '',
      studentId,
      name: name.trim(),
      classNumber: classNumber.trim(),
      phone: phone.trim() || null,
      photo: null,
      gender: 'male',
      dateOfBirth: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      status,
      parentIds,
      primaryParentId: null,
      busId: busId || null,
      pickupLocation: null,
      dropoffLocation: null,
      createdAt: new Date().toISOString(),
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
          {/* 學年 — 預設自動帶入 (從 settings.academicYear 來), 可手動改。 */}
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="張小明" />
          </div>

          <div className="space-y-2">
            <Label>班別 *</Label>
            <Input value={classNumber} onChange={(e) => setClassNumber(e.target.value)} placeholder="1A" />
          </div>

          <div className="space-y-2">
            <Label>電話 (可選)</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="91234567"
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
                <option key={b.id} value={b.id}>{b.plateNumber} - {b.model}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label>關聯家長 * (可多選)</Label>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {allParents.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">請先新增家長</p>
              ) : (
                allParents.map(p => (
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
                ))
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/settings/students')} className="flex-1 h-12">
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1 h-12">
              <Save className="w-4 h-4" />
              保存
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            學生編號將自動生成 (基於當前學年 {formatAcademicYear(academicYear)})
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
