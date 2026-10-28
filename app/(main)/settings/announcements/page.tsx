'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Megaphone, FileText, Sparkles, ArrowRight, BellOff } from 'lucide-react';
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
import { useToast } from '@/components/ui/toast';
import type { Announcement } from '@/lib/types';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'all' | 'templates'>('all');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // 記錄當前 dialog 是從哪個範本衍生的, 提交時直接建立為新公告 (isTemplate=false)
  // 用 id 標識, null = 全新建立 / 編輯現有
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);
  // 「已隱藏通告」清單 — 使用者勾選「不再顯示此通告」的公告
  // (從 popup 的 checkbox 產生; 這裡可以手動恢復, 讓它重新開始自動彈出)
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '', content: '', type: 'info' as Announcement['type'],
    displayCount: 1, maxViewsPerUser: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    isTemplate: false, templateName: '',
  });
  const [error, setError] = useState('');

  // 目標機構 (super_admin 必填 — cbl_announcements.client_id 有 FK 約束)
  const [targetClientIdInput, setTargetClientIdInput] = useState('');
  // 可發佈的機構清單
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setClientOptions(STORAGE.clients.getAll().map((c) => ({ id: c.id, name: c.name })));
  }, []);

  useEffect(() => {
    if (!user) return;
    const isSuperAdmin = user.role === 'super_admin' || user.role === 'system_admin';
    const cid = user.clientId || '';
    // super_admin 看得到所有機構的公告
    const all = tab === 'templates'
      ? STORAGE.announcements.getTemplates(cid, isSuperAdmin)
      : STORAGE.announcements.getVisible(cid, isSuperAdmin).filter(a => !a.isTemplate);
    setAnnouncements(all);
    // 同步讀取「已隱藏通告」清單 (使用者勾選「不再顯示此通告」的公告)
    const dismissed = STORAGE.announcementDismiss.getDismissed(user.id, cid);
    setDismissedIds(Array.from(dismissed));
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

  const handleSubmit = async () => {
    setError('');
    if (!form.title.trim()) { setError('請輸入標題'); return; }
    if (!form.content.trim()) { setError('請輸入內容'); return; }
    if (form.isTemplate && !form.templateName.trim()) { setError('範本請輸入範本名稱'); return; }

    // 目標機構: 跨機構角色沒有 clientId, 必須指定 (FK 約束)
    const isSuperAdmin = user.role === 'super_admin' || user.role === 'system_admin';
    const targetClientId = isSuperAdmin
      ? (targetClientIdInput || '')
      : (user.clientId || '');
    if (!targetClientId) { setError('請選擇發佈機構'); return; }

    const data = {
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
      displayCount: form.displayCount,
      maxViewsPerUser: form.maxViewsPerUser,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      isActive: true,
      // 公告本身永遠不是範本 (範本是另一筆獨立資料)
      isTemplate: false,
      templateName: null,
    };

    try {
      let savedId = editId;
      if (editId) {
        const existing = STORAGE.announcements.getById(editId);
        STORAGE.announcements.update(editId, {
          ...data,
          clientId: targetClientId,
          currentCount: existing?.currentCount ?? 0,
        });
      } else {
        savedId = STORAGE.genId('ann');
        STORAGE.announcements.add({
          id: savedId,
          clientId: targetClientId,
          currentCount: 0,
          ...data,
          createdAt: new Date().toISOString(),
        });
      }

      // 同步寫入 Supabase (讓其他瀏覽器/裝置也能看到)
      try {
        const { supabaseAnnouncements } = await import('@/lib/supabase-announcements');
        const sbPayload = {
          id: savedId!,
          clientId: targetClientId,
          ...data,
          currentCount: STORAGE.announcements.getById(savedId!)?.currentCount ?? 0,
          createdAt: new Date().toISOString(),
        };
        const res = editId
          ? await supabaseAnnouncements.update(savedId!, {
              title: sbPayload.title,
              content: sbPayload.content,
              type: sbPayload.type,
              displayCount: sbPayload.displayCount,
              maxViewsPerUser: sbPayload.maxViewsPerUser,
              startDate: sbPayload.startDate,
              endDate: sbPayload.endDate,
              isActive: sbPayload.isActive,
              isTemplate: sbPayload.isTemplate,
              templateName: sbPayload.templateName,
              clientId: sbPayload.clientId,
            })
          : await supabaseAnnouncements.add(sbPayload);
        if (!res.success) {
          console.warn('[Announcements] Supabase write failed:', res.error);
          toast.error(`已儲存到本機，但同步到伺服器失敗：${res.error}`);
        }
      } catch (sbErr) {
        console.warn('[Announcements] Supabase write error:', sbErr);
        toast.error('已儲存到本機，但同步到伺服器失敗');
      }

      // 額外建立一份範本 (獨立資料)
      if (form.isTemplate && form.templateName.trim()) {
        const templateId = STORAGE.genId('anntpl');
        const templatePayload = {
          id: templateId,
          clientId: targetClientId,
          title: data.title,
          content: data.content,
          type: data.type,
          displayCount: data.displayCount,
          currentCount: 0,
          maxViewsPerUser: data.maxViewsPerUser,
          startDate: data.startDate,
          endDate: data.endDate,
          isActive: true,
          isTemplate: true,
          templateName: form.templateName.trim(),
          createdAt: new Date().toISOString(),
        };
        STORAGE.announcements.add(templatePayload);
        try {
          const { supabaseAnnouncements } = await import('@/lib/supabase-announcements');
          await supabaseAnnouncements.add(templatePayload);
        } catch (tplErr) {
          console.warn('[Announcements] template sync error:', tplErr);
        }
      }

      toast.success(sourceTemplateId ? `已從範本建立公告「${data.title}」` : `公告「${data.title}」已建立`);
    } catch (e) {
      console.error('[Announcements] handleSubmit error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`儲存失敗：${msg}`);
      return;
    }
    const all = tab === 'templates'
      ? STORAGE.announcements.getTemplates(user.clientId || '', isSuperAdmin)
      : STORAGE.announcements.getVisible(user.clientId || '', isSuperAdmin).filter(a => !a.isTemplate);
    setAnnouncements(all);
    setDialogOpen(false);
    setEditId(null);
    setSourceTemplateId(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const isSuperAdmin = user.role === 'super_admin' || user.role === 'system_admin';
      const targetTitle = announcements.find((a) => a.id === deleteId)?.title ?? '';
      STORAGE.announcements.remove(deleteId);
      try {
        const { supabaseAnnouncements } = await import('@/lib/supabase-announcements');
        await supabaseAnnouncements.remove(deleteId);
      } catch (sbErr) {
        console.warn('[Announcements] Supabase delete error:', sbErr);
      }
      toast.success(`公告「${targetTitle}」已刪除`);
      const all = tab === 'templates'
        ? STORAGE.announcements.getTemplates(user.clientId || '', isSuperAdmin)
        : STORAGE.announcements.getVisible(user.clientId || '', isSuperAdmin).filter(a => !a.isTemplate);
      setAnnouncements(all);
      setDeleteId(null);
    } catch (e) {
      console.error('[Announcements] handleDelete error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`刪除失敗：${msg}`);
    }
  };

  // 恢復一則被隱藏的公告 → 下次進入主頁時會重新自動彈出
  const restoreDismissed = (announcementId: string) => {
    if (!user) return;
    try {
      STORAGE.announcementDismiss.restore(user.id, user.clientId || '', announcementId);
      setDismissedIds((prev) => prev.filter((id) => id !== announcementId));
      toast.success('已恢復顯示, 下次進入主頁將重新彈出');
    } catch (e) {
      console.error('[Announcements] restoreDismissed error:', e);
      toast.error('操作失敗');
    }
  };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* 「已隱藏通告」清單
          ─ 為何放頁首: 這是「個人偏好」而非公告資料, 跟公告列表分離;
          使用者勾選「不再顯示此通告」後, 該公告就不會再自動彈出,
          這裡可以手動恢復 (重新開始自動彈出)。 */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
              <BellOff className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">已隱藏通告</p>
                <Badge variant="secondary" className="text-[10px]">
                  {dismissedIds.length} 則
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                生效中的公告會在每次進入主頁時自動彈出。若你不想再看到某則公告,
                可在彈窗勾選「不再顯示此通告」; 這裡可以手動恢復。
              </p>
            </div>
          </div>
          {dismissedIds.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {dismissedIds.map((id) => {
                const a = STORAGE.announcements.getById(id);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-2 py-1.5"
                  >
                    <BellOff className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate">
                      {a?.title || id}
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreDismissed(id)}
                      className="flex-shrink-0 px-2 py-0.5 rounded-md bg-background hover:bg-primary/10 hover:text-primary transition-colors font-medium"
                    >
                      恢復顯示
                    </button>
                  </div>
                );
              })}
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
              {sourceTemplateId ? '使用範本建立公告' : editId ? '編輯' : '新增'} 公告
            </DialogTitle>
            <DialogDescription>
              {sourceTemplateId
                ? '已從範本帶入內容, 可再編輯後保存為新公告'
                : '填寫公告內容與設定'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {(user.role === 'super_admin' || user.role === 'system_admin') && (
              <div className="space-y-1.5">
                <Label>發佈機構 *</Label>
                <Select
                  value={targetClientIdInput}
                  onChange={(e) => setTargetClientIdInput(e.target.value)}
                >
                  <option value="">請選擇機構...</option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  超級管理員沒有機構, 必須指定發佈機構 (資料庫有 FK 約束)
                </p>
              </div>
            )}
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
                    <Label>總顯示次數 (統計)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.displayCount}
                      onChange={(e) => setForm({ ...form, displayCount: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>每用戶上限 (統計)</Label>
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
    </div>
  );
}
