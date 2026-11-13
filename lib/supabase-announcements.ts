// Supabase 公告 (cbl_announcements) CRUD 操作
//
// 為什麼需要這個檔案:
// - 公告之前只有「讀」的路徑 (lib/supabase-data.ts 只做 select)
// - 在 /cbl-admin-setting/announcements 新增/編輯/停用/刪除時, 如果只寫 localStorage,
//   下一次 syncFromSupabase() 會用 DB 資料覆蓋 → 剛建立的公告憑空消失;
//   而且其他瀏覽器/裝置的使用者永遠看不到 (公告只存在發佈者那台電腦)
// - 所以公告的 add / update / remove 必須同步寫回 DB
//
// 設計重點:
// 1. client_id 有 NOT NULL + FK 約束 (指向 cbl_clients.id)
//    → super_admin 沒有自己的 clientId, 發佈公告時必須指定一個「目標機構」
//      (由呼叫端傳入 targetClientId), 不能塞空字串 (會觸發 FK violation)
// 2. 寫入後會「二次驗證」select, 避免 RLS 靜默拒絕
//    (insert 回傳成功但實際沒寫進去 — 這是 anon key + RLS 常見的坑)
// 3. client_id 指向 cbl_clients, 所以刪除機構時公告會被 cascade 刪掉
//
// RLS: 開發階段 cbl_announcements 上有 dev_allow_all policy (anon 可讀寫),
// 所以 client 端 (anon key) 就能寫入。上線前要移除並改寫 per-role policy。

import { camelize, snakify } from './supabase-case';
import type { Announcement } from './types';

/** 公告寫入時的欄位集合 (對應 cbl_announcements) */
export interface SupabaseAnnouncementPayload {
  id: string;
  /**
   * 目標機構 id — 指向 cbl_clients.id (FK)。
   *
   * ⚠️ 2026-11 起「發佈機構」欄位已從 UI 移除, 但 DB 的 client_id 仍有 FK,
   *    所以:
   *    - 系統公告 (scope='system')  → 傳 '' (migration 0020 已把欄位改成 nullable)
   *    - 繳費公告 (scope='payment') → 傳被選家長所屬的 clientId
   */
  clientId: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent';
  displayCount: number;
  currentCount: number;
  maxViewsPerUser: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isTemplate: boolean;
  templateName: string | null;
  /**
   * 受眾類型 — 'system' (所有用戶) / 'payment' (指定家長)。
   * migration 0020 新增; 未套用時會被降欄機制剔除 (預設視為 'system')。
   */
  scope?: 'system' | 'payment';
  /**
   * 繳費公告的指定家長 id 清單 (cbl_parents.id)。
   * scope='system' 時為空陣列。
   */
  targetParentIds?: string[];
  /**
   * 公告所屬學年 (4 位 code, 例 '2627') — migration 0017。
   * optional: migration 未套用時會被降欄機制剔除, 不影響寫入。
   */
  academicYear?: string;
  createdAt: string;
}

/** 更新時允許修改的欄位 (id / createdAt 不變) */
export type SupabaseAnnouncementPatch = Partial<
  Omit<SupabaseAnnouncementPayload, 'id' | 'createdAt'>
>;

export const supabaseAnnouncements = {
  /**
   * 查詢所有公告
   * - 不按 client 過濾: super_admin 需要跨機構檢視公告
   */
  async getAll(): Promise<{ data: Announcement[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_announcements').select('*');

    if (error) {
      console.error('[Supabase] Failed to fetch announcements:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) as Announcement[] };
  },

  /** 依 id 查單一公告 */
  async getById(
    id: string,
  ): Promise<{ data: Announcement | null; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_announcements')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to fetch announcement by id:', error);
      return { data: null, error: error.message };
    }
    return { data: data ? (camelize(data) as Announcement) : null };
  },

  /**
   * 新增公告
   * - insert 後用 .select() 二次驗證, 避免 RLS 靜默拒絕
   */
  async add(
    announcement: SupabaseAnnouncementPayload,
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');

    // ⚠️ clientId 可以是空字串 (系統公告 = 所有用戶都看得到)。
    //    空字串 → 寫成 null (migration 0020 已把 client_id 改成 nullable)。
    //    若 DB 尚未套用 0020 (client_id 仍 NOT NULL), 會在 insert 時報錯,
    //    錯誤訊息會明確提示要執行該 migration。
    const payload = snakify({
      ...announcement,
      clientId: announcement.clientId || null,
    }) as Record<string, unknown>;

    let { data, error } = await supabase
      .from('cbl_announcements')
      .insert(payload)
      .select('id')
      .maybeSingle();

    // 42703 = undefined_column → 該欄在 live DB 不存在 (例: migration 0017/0020 未套用)
    //   → 逐個剔除該欄重試, 讓公告仍可正常寫入 (只是沒有該欄位的邊界)。
    if (error && error.code === '42703') {
      const retry = await this.insertWithColumnTrim(payload, error.message);
      if (retry) return retry;
    }

    if (error) {
      console.error('[Supabase] Failed to add announcement:', error);
      if (error.code === '23502') {
        return {
          success: false,
          error:
            '資料庫欄位 client_id 仍為必填 — 請執行 supabase/migrations/0020_announcement_scope.sql',
        };
      }
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn(
        '[Supabase] add announcement was silently rejected by RLS',
        announcement.id,
      );
      return {
        success: false,
        error: 'RLS 政策拒絕 (無寫入權限或欄位不符)',
      };
    }

    // 二次驗證: 真的 select 出來才算數
    const { data: verifyData, error: verifyError } = await supabase
      .from('cbl_announcements')
      .select('id')
      .eq('id', data.id)
      .maybeSingle();

    if (verifyError) {
      console.warn('[Supabase] verify select error:', verifyError);
    } else if (!verifyData) {
      console.warn(
        '[Supabase] insert 回傳成功但 verify select 找不到 row',
      );
      return {
        success: false,
        error: 'RLS 政策過濾掉 insert (verify 失敗)',
      };
    }

    return { success: true, id: data.id };
  },

  /**
   * 逐一剔除「DB 沒有的欄位」後重試 insert。
   *
   * 為什麼要迴圈: 一次可能缺多個欄位 (例: 同時缺 scope 與 target_parent_ids),
   * 只剔一個欄位重試一次還是不會成功 → 必須迴圈到 insert 成功或欄位用完。
   */
  async insertWithColumnTrim(
    payload: Record<string, unknown>,
    firstErrorMessage: string,
  ): Promise<{ success: boolean; error?: string; id?: string } | null> {
    const { supabase } = await import('./supabase');
    const working = { ...payload };
    const removed: string[] = [];

    for (let i = 0; i < 8; i++) {
      const badColumn = this.extractMissingColumn(firstErrorMessage);
      if (!badColumn) return null;

      const key = Object.keys(working).find(
        (k) =>
          k === badColumn ||
          k.replace(/_([a-z])/g, (_mm, l) => String(l).toUpperCase()) === badColumn,
      );
      if (!key) return null;

      delete working[key];
      removed.push(key);

      const res = await supabase
        .from('cbl_announcements')
        .insert(working)
        .select('id')
        .maybeSingle();

      if (!res.error && res.data) {
        console.warn(
          `[Supabase] cbl_announcements 欄位 "${removed.join(', ')}" 不存在, 已剔除後重試 — 請執行 ` +
            'supabase/migrations/0020_announcement_scope.sql',
        );
        return { success: true, id: res.data.id };
      }
      if (!res.error) {
        // insert 成功但沒回傳 row → 交給呼叫端處理 (RLS 靜默拒絕)
        return null;
      }
      if (res.error.code !== '42703') {
        console.error('[Supabase] Failed to add announcement (after column trim):', res.error);
        return { success: false, error: res.error.message };
      }
      // 下一圈繼續剔下一個壞欄位 (firstErrorMessage 更新)
      firstErrorMessage = res.error.message;
    }

    console.error('[Supabase] Failed to add announcement after column trim:', removed.join(', '));
    return null;
  },

  /**
   * 從 PostgREST 的錯誤訊息裡抽出「DB 沒有的欄位名」。
   *
   * 例: 'column "scope" of relation "cbl_announcements" does not exist'
   *   → 'scope'
   */
  extractMissingColumn(message: string): string | null {
    const m = message.match(
      /column "([^"]+)" of relation "([^"]+)" does not exist/,
    );
    return m?.[1] ?? null;
  },

  /**
   * 逐一剔除「DB 沒有的欄位」後重試 update。
   *
   * ⚠️ 為什麼 update 也需要這個:
   *   若 migration 0020 還沒套用 (DB 沒有 scope / target_parent_ids 欄位),
   *   update 會整個失敗 → 連「改標題」都存不進雲端。
   *   → 剔除不存在的欄位後重試, 讓其他欄位照常更新。
   */
  async updateWithColumnTrim(
    id: string,
    payload: Record<string, unknown>,
    firstErrorMessage: string,
  ): Promise<{ success: boolean; error?: string } | null> {
    const { supabase } = await import('./supabase');
    const working = { ...payload };
    const removed: string[] = [];

    for (let i = 0; i < 8; i++) {
      const badColumn = this.extractMissingColumn(firstErrorMessage);
      if (!badColumn) return null;

      const key = Object.keys(working).find(
        (k) =>
          k === badColumn ||
          k.replace(/_([a-z])/g, (_mm, l) => String(l).toUpperCase()) === badColumn,
      );
      if (!key) return null;

      delete working[key];
      removed.push(key);

      const { data, error } = await supabase
        .from('cbl_announcements')
        .update(working)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (!error && data) {
        console.warn(
          `[Supabase] cbl_announcements 欄位 "${removed.join(', ')}" 不存在, 已剔除後重試 — 請執行 ` +
            'supabase/migrations/0020_announcement_scope.sql',
        );
        return { success: true };
      }
      if (!error) {
        // update 成功但沒回傳 row → 交由呼叫端處理 (RLS 靜默拒絕)
        return null;
      }
      if (error.code !== '42703') {
        console.error('[Supabase] Failed to update announcement (after column trim):', error);
        return { success: false, error: error.message };
      }
      firstErrorMessage = error.message;
    }

    console.error('[Supabase] Failed to update announcement after column trim:', removed.join(', '));
    return null;
  },

  /** 更新公告 */
  async update(
    id: string,
    patch: SupabaseAnnouncementPatch,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    // ⚠️ 系統公告的 clientId 為空字串 → 必須轉成 null,
    //    否則會違反 client_id 的 FK 約束 (找不到 id = '' 的 cbl_clients)。
    const payload = { ...patch } as Record<string, unknown>;
    if (payload.clientId === '') payload.clientId = null;

    const { data, error } = await supabase
      .from('cbl_announcements')
      .update(snakify(payload))
      .eq('id', id)
      .select('id')
      .maybeSingle();

    // 42703 = undefined_column → 該欄在 live DB 不存在 (例: migration 0017/0020 未套用)
    //   → 逐個剔除該欄重試, 讓其他欄位照常更新。
    if (error && error.code === '42703') {
      const retry = await this.updateWithColumnTrim(
        id,
        snakify(payload) as Record<string, unknown>,
        error.message,
      );
      if (retry) return retry;
    }

    if (error) {
      console.error('[Supabase] Failed to update announcement:', error);
      if (error.code === '23502' || error.code === '23503') {
        return {
          success: false,
          error:
            '資料庫欄位 client_id 仍為必填 — 請執行 supabase/migrations/0020_announcement_scope.sql',
        };
      }
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] update announcement was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
    }

    return { success: true };
  },

  /** 刪除公告 */
  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_announcements')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to delete announcement:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] delete announcement was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    }

    return { success: true };
  },

  /**
   * 把 current_count +1 (該公告被看開一次)。
   *
   * 為什麼要寫回 DB:
   * - localStorage 的 currentCount 只是快取; 下次 syncToStorage() 會用 DB 值覆蓋
   * - 不寫回的話, 「總顯示次數上限 (displayCount)」在每次重新整理後就被重設,
   *   公告會無限重複彈出
   *
   * 實作: 先讀目前值再 +1 (PostgREST 沒有原子 increment)。
   */
  async incrementCount(id: string): Promise<{ success: boolean; count?: number; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_announcements')
      .select('current_count')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to read announcement count:', error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: '找不到該公告' };
    }

    const next = (data.current_count || 0) + 1;
    const { error: updErr } = await supabase
      .from('cbl_announcements')
      .update({ current_count: next })
      .eq('id', id);

    if (updErr) {
      console.error('[Supabase] Failed to update announcement count:', updErr);
      return { success: false, error: updErr.message };
    }

    return { success: true, count: next };
  },

  /**
   * 把 DB 公告同步到 LocalStorage。
   *
   * 為什麼需要這個獨立函式 (而不是只靠 syncFromSupabase):
   * - initWithSupabase() 在 localStorage 已 initialized 時會直接 return,
   *   所以公告不會在「第二次之後的載入」被重新拉取
   * - 公告是「會變動」的資料 (管理員新增/停用), 需要在進入頁面時保證是最新
   *
   * 為什麼用 mergeAll 而不是 setAll:
   * - 公告支援「本機先寫、雲端後推」(後台頁先寫 localStorage 再同步 DB)
   * - 用 setAll 覆蓋會讓尚未推上雲端的那則公告在下一次同步時消失
   */
  async syncToStorage(): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.getAll();
    if (error) return { success: false, error };
    if (data.length === 0) {
      // DB 沒有公告 → 不覆蓋 localStorage (避免把資料清空)
      return { success: true };
    }

    const { STORAGE } = await import('./storage');
    STORAGE.announcements.mergeAll(data);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbl-announcements-refresh'));
    }
    return { success: true };
  },
};
