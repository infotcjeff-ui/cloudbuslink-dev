'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Megaphone, FileText, Sparkles, ArrowRight, Bell, BellOff, Power } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    DialogAnimated as Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { cn, fmtDate } from '@/lib/utils';
import type { Announcement } from '@/lib/types';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'all' | 'templates'>('all');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // 記錄當前 dialog 是從哪個範本衍生的, 提交時直接建立為新公告 (isTemplate=false)
  // 用 id 標識, null = 全新建立 / 編輯現有
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);
  // 「全站公告彈窗」開關 — 預設 false (popup 正常彈), 開啟後即使用戶點鈴鐺
  // 也不再打開 AnnouncementPopup dialog
  const [popupDisabled, setPopupDisabled] = useState<boolean>(false);
  // 切換「全站公告彈窗」開關的 confirm dialog 控制 state
  // 為何加 confirm dialog: 這是「不可逆的體驗降級」動作,
  // 用戶可能不小心按到, 失去未來看到重要公告的入口。
  // 放在頂部是因為 React Hooks 必須在 conditional return 之前呼叫。
  const [confirmToggleOpen, setConfirmToggleOpen] = useState<null | 'enable' | 'disable'>(null);
  const [form, setForm] = useState({
    title: '', content: '', type: 'info' as Announcement['type'],
    displayCount: 1, maxViewsPerUser: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    isTemplate: false, templateName: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    const all = tab === 'templates'
      ? STORAGE.announcements.getTemplates(user.clientId || '')
      : STORAGE.announcements.getByClient(user.clientId || '').filter(a => !a.isTemplate);
    setAnnouncements(all);
    // 同步讀取「全站公告彈窗」開關狀態
    setPopupDisabled(
      STORAGE.announcementPopupPref.isDisabled(user.id, user.clientId || '')
    );
  }, [user, tab]);

  if (!user) return null;

  const openCreate = () => {
    setEditId(null);
    setSourceTemplateId(null);
    setForm({
      title: '', content: '', type: 'info',
      displayCount: 1, maxViewsPerUser: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isTemplate: false, templateName: '',
    });
    setError('');
    setDialogOpen(true);
  };

  // 從範本建立新通告: 預填標題/類型/內容, 強制 isTemplate=false
  const openFromTemplate = (tpl: Announcement) => {
    setEditId(null);
    setSourceTemplateId(tpl.id);
    setForm({
      title: tpl.title,
      content: tpl.content,
      type: tpl.type,
      displayCount: tpl.displayCount || 1,
      maxViewsPerUser: tpl.maxViewsPerUser || 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isTemplate: false, templateName: '',
    });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditId(a.id);
    setSourceTemplateId(null);
    setForm({
      title: a.title, content: a.content, type: a.type,
      displayCount: a.displayCount, maxViewsPerUser: a.maxViewsPerUser,
      startDate: a.startDate.split('T')[0], endDate: a.endDate.split('T')[0],
      isTemplate: a.isTemplate, templateName: a.templateName || '',
    });
    setError('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    setError('');
    if (!form.title.trim()) { setError('請輸入標題'); return; }
    if (!form.content.trim()) { setError('請輸入內容'); return; }
    if (form.isTemplate && !form.templateName.trim()) { setError('範本請輸入範本名稱'); return; }

    const data = {
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
      displayCount: form.displayCount,
      maxViewsPerUser: form.maxViewsPerUser,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      isActive: true,
      isTemplate: form.isTemplate,
      templateName: form.isTemplate ? form.templateName.trim() : null,
    };

    if (editId) {
      STORAGE.announcements.update(editId, data);
    } else {
      STORAGE.announcements.add({
        id: STORAGE.genId('ann'),
        clientId: user.clientId || '',
        currentCount: 0,
        ...data,
        createdAt: new Date().toISOString(),
      });
    }
    const all = tab === 'templates'
      ? STORAGE.announcements.getTemplates(user.clientId || '')
      : STORAGE.announcements.getByClient(user.clientId || '').filter(a => !a.isTemplate);
    setAnnouncements(all);
    setDialogOpen(false);
    setEditId(null);
    setSourceTemplateId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    STORAGE.announcements.remove(deleteId);
    const all = tab === 'templates'
      ? STORAGE.announcements.getTemplates(user.clientId || '')
      : STORAGE.announcements.getByClient(user.clientId || '').filter(a => !a.isTemplate);
    setAnnouncements(all);
    setDeleteId(null);
  };

  // 切換「全站公告彈窗」開關。
  // 為何加 confirm dialog: 這是「不可逆的體驗降級」動作,
  // 用戶可能不小心按到, 失去未來看到重要公告的入口。
  const requestToggle = () => {
    if (!user) return;
    // 開 → 關 要 confirm; 關 → 開 直接生效 (恢復體驗, 無風險)
    if (!popupDisabled) {
      setConfirmToggleOpen('disable');
    } else {
      setConfirmToggleOpen('enable');
    }
  };
  const applyToggle = () => {
    if (!user || !confirmToggleOpen) return;
    const newVal = confirmToggleOpen === 'disable';
    STORAGE.announcementPopupPref.setDisabled(
      user.id, user.clientId || '', newVal
    );
    setPopupDisabled(newVal);
    setConfirmToggleOpen(null);
  };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 「全站公告彈窗」開關
          ─ 為何放頁首: 這是「個人偏好」而非公告資料, 跟公告列表分離;
          公告管理員也需要一眼看到自己是否關了彈窗, 避免「為什麼用戶說沒看到公告」;
          點一下切換, 關閉方向需要 confirm dialog 防止誤觸。 */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                popupDisabled
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'
              )}
            >
              {popupDisabled
                ? <BellOff className="w-5 h-5" />
                : <Bell className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">全站公告彈窗</p>
                <Badge
                  variant={popupDisabled ? 'secondary' : 'default'}
                  className="text-[10px]"
                >
                  {popupDisabled ? '已關閉' : '已啟用'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {popupDisabled
                  ? '目前已關閉。即便點頭部鈴鐺, 公告也不會再以彈窗方式顯示。'
                  : '啟用時, 點頭部鈴鐺 → 選公告 → 全站彈窗會顯示完整內容。'}
              </p>
            </div>
            {/* iOS-style switch */}
            <button
              type="button"
              role="switch"
              aria-checked={!popupDisabled}
              aria-label={popupDisabled ? '開啟全站公告彈窗' : '關閉全站公告彈窗'}
              onClick={requestToggle}
              className={cn(
                'relative w-12 h-7 rounded-full transition-colors flex-shrink-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                popupDisabled ? 'bg-muted' : 'bg-primary'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform',
                  popupDisabled ? 'translate-x-0' : 'translate-x-5'
                )}
              />
            </button>
          </div>
          {popupDisabled && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-2 py-1.5">
              <BellOff className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>關閉後仍可在頭部鈴鐺下拉中查看公告標題與摘要; 隨時在此頁重新開啟全站彈窗。</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('all')}
          className={cn(
            'flex-1 py-2 rounded-xl text-sm font-medium',
            tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          公告
        </button>
        <button
          onClick={() => setTab('templates')}
          className={cn(
            'flex-1 py-2 rounded-xl text-sm font-medium',
            tab === 'templates' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          範本
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            {tab === 'templates' ? <FileText className="w-7 h-7 text-muted-foreground" /> : <Megaphone className="w-7 h-7 text-muted-foreground" />}
          </div>
          <p className="text-sm text-muted-foreground">
            {tab === 'templates' ? '未有任何範本' : '未有任何公告'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map(a => {
            const typeVariant = a.type === 'urgent' ? 'destructive' : a.type === 'warning' ? 'warning' : 'default';
            return (
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {tab === 'templates' && a.templateName && (
                        <p className="text-[11px] font-medium text-primary mb-0.5">{a.templateName}</p>
                      )}
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant={typeVariant as any} className="text-[10px]">
                          {a.type === 'urgent' ? '緊急' : a.type === 'warning' ? '警告' : '資訊'}
                        </Badge>
                        {a.isTemplate && <Badge variant="secondary" className="text-[10px]">範本</Badge>}
                      </div>
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.content}</p>
                      {!a.isTemplate && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {a.startDate.split('T')[0]} - {a.endDate.split('T')[0]}
                        </p>
                      )}
                    </div>
                    <button onClick={() => openEdit(a)} className="p-2 rounded-full active:bg-muted" aria-label="編輯">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(a.id)} className="p-2 rounded-full active:bg-destructive/10 text-destructive" aria-label="刪除">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* 範本卡片底部加入「使用此範本」CTA, 一鍵建立新公告 */}
                  {tab === 'templates' && a.isTemplate && (
                    <button
                      onClick={() => openFromTemplate(a)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary/10 text-primary text-sm font-medium active:scale-[0.98] active:bg-primary/20 transition-transform"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>使用此範本建立公告</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
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

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditId(null); setSourceTemplateId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sourceTemplateId ? '使用範本建立公告' : editId ? '編輯' : '新增'} {form.isTemplate ? '範本' : '公告'}
            </DialogTitle>
            <DialogDescription>
              {sourceTemplateId
                ? '已從範本帶入內容, 可再編輯後保存為新公告'
                : '填寫公告內容與設定'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label>類型</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="info">資訊</option>
                <option value="warning">警告</option>
                <option value="urgent">緊急</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>標題 *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="標題..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>內容 *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="公告內容..."
                rows={4}
              />
            </div>
            {/* 從範本建立時, 不允許再保存為範本 (已是新公告); 否則使用者可勾選保存為範本 */}
            {!sourceTemplateId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isTemplate"
                  checked={form.isTemplate}
                  onChange={(e) => setForm({ ...form, isTemplate: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isTemplate" className="text-sm">保存為範本</label>
              </div>
            )}
            {form.isTemplate && !sourceTemplateId && (
              <div className="space-y-1.5">
                <Label>範本名稱 *</Label>
                <Input
                  value={form.templateName}
                  onChange={(e) => setForm({ ...form, templateName: e.target.value })}
                  placeholder="例: 雨天通告"
                />
              </div>
            )}
            {!form.isTemplate && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>開始日期</Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>結束日期</Label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>總顯示次數</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.displayCount}
                      onChange={(e) => setForm({ ...form, displayCount: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>每用戶上限</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.maxViewsPerUser}
                      onChange={(e) => setForm({ ...form, maxViewsPerUser: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          {error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditId(null); setSourceTemplateId(null); }}>取消</Button>
            <Button onClick={handleSubmit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>確定要刪除?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 切換全站公告彈窗的確認 dialog
          - 「關閉」方向: 顯示風險說明, 用戶必須確認才生效
          - 「開啟」方向: 仍是 dialog 但措辭正面, 維持一致的二次確認體驗 */}
      <Dialog
        open={!!confirmToggleOpen}
        onOpenChange={(o) => !o && setConfirmToggleOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmToggleOpen === 'disable' ? '關閉全站公告彈窗?' : '開啟全站公告彈窗'}
            </DialogTitle>
            <DialogDescription>
              {confirmToggleOpen === 'disable' ? (
                <>
                  關閉後, 即便點頭部鈴鐺, 公告也不會再以彈窗方式顯示完整內容。
                  <br />
                  <br />
                  您仍可在鈴鐺下拉列表中查看公告標題與摘要;
                  隨時可回到此頁重新開啟全站彈窗。
                </>
              ) : (
                <>
                  開啟後, 點頭部鈴鐺 → 選擇公告 → 將以全站彈窗顯示完整內容。
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmToggleOpen(null)}>
              取消
            </Button>
            {confirmToggleOpen === 'disable' ? (
              <Button variant="destructive" onClick={applyToggle}>
                <Power className="w-4 h-4" />
                確認關閉
              </Button>
            ) : (
              <Button onClick={applyToggle}>
                <Bell className="w-4 h-4" />
                確認開啟
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
