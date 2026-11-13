// Supabase 登入帳號 (cbl_users) CRUD 操作
//
// 為什麼需要這個檔案:
// - cbl_users 之前只有「讀」的路徑 (lib/supabase-data.ts 只做 select)
// - /cbl-admin-setting/user 新增帳號後, 如果只寫 localStorage,
//   下一次 syncFromSupabase() 會用 DB 資料覆蓋 → 剛建立的帳號憑空消失
// - 所以帳號的 add / update / remove 必須同步寫回 DB
//
// 密碼: 目前是明碼儲存 (見 supabase/migrations/0001_init.sql 的 ⚠️ 註記),
// 上線前要改成 hash。這裡沿用現況, 不擅自改動資料格式。
//
// RLS: 開發階段 cbl_users 上有 dev_allow_all policy (anon 可讀寫),
// 所以 client 端 (anon key) 就能寫入。上線前要移除並改寫 per-role policy。

import { camelize, snakify } from './supabase-case';
import { alignPayloadClientId } from './supabase-client-id';
import { markSynced, unmarkSynced } from './storage';
import type { User } from './types';

/**
 * 從 PostgREST / Postgres 錯誤解析「不存在的欄位名」。
 *
 * PostgREST 對未知欄位會回兩種錯誤碼:
 *   - 42703   (Postgres 原生)  "column cbl_users.account_name does not exist"
 *   - PGRST204 (PostgREST 層)  "Could not find the 'account_name' column of 'cbl_users' in the schema cache"
 *
 * 兩種都要能解析, 否則帳號寫入的降欄機制會失效
 * (還沒跑 migration 0013 的 DB 會讓整筆 insert 被拒 → 變回「無帳號」)。
 */
function parseMissingColumn(error: { code?: string; message?: string }): string | null {
  const code = error.code;
  const message = error.message ?? '';

  if (code === 'PGRST204') {
    const m = message.match(/Could not find the '([\w]+)' column/i);
    return m?.[1] ?? null;
  }

  if (code === '42703') {
    const m = message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
    return m?.[1] ?? null;
  }

  if (/does not exist/i.test(message) && /column/i.test(message)) {
    const m = message.match(/column\s+[\w.]+"?([\w]+)"?\s+does not exist/i);
    return m?.[1] ?? null;
  }

  return null;
}

/** 帳號寫入時的欄位集合 (對應 cbl_users) */
export interface SupabaseUserPayload {
  id: string;
  phone: string;
  /**
   * 帳戶名稱 (選填) — 與 phone 皆可作為登入帳號。
   * 對應 DB 欄位 `account_name`。
   */
  accountName?: string | null;
  /**
   * 聯絡電話 (WhatsApp) — 對應 DB `contact_phone`。
   * 保姆「異常回報」時可直接致電 / WhatsApp 此號碼。
   */
  contactPhone?: string | null;
  password: string;
  role: 'system_admin' | 'super_admin' | 'client' | 'parent' | 'nanny';
  name: string;
  email?: string | null;
  clientId?: string | null;
  companyId?: string | null;
  photo?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

/** 更新時允許修改的欄位 (id / createdAt 不變) */
export type SupabaseUserPatch = Partial<
  Omit<SupabaseUserPayload, 'id' | 'createdAt'>
>;

export const supabaseUsers = {
  /**
   * 查詢所有登入帳號
   * - 不按 client 過濾: super_admin 沒有 client_id, 且用戶頁是跨機構的管理頁
   */
  async getAll(): Promise<{ data: any[]; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('cbl_users').select('*');

    if (error) {
      console.error('[Supabase] Failed to fetch users:', error);
      return { data: [], error: error.message };
    }
    return { data: (data || []).map(camelize) };
  },

  /**
   * 把 cbl_users 同步到 LocalStorage, 並同步更新「目前登入者」的 session 記錄。
   *
   * 為什麼需要這個獨立函式 (而不是只靠 syncFromSupabase):
   * - initWithSupabase() 在 localStorage 已 initialized 時會直接 return,
   *   所以「登入帳號」這種安全相關的資料在第一次載入後就不再更新
   * - 結果: 用後台改了密碼 → 舊密碼仍可登入; 改了姓名 → 畫面仍顯示舊名稱
   * - cbl_users 是一張很小的表, 每次 mount 都拉一次的成本可以忽略,
   *   所以把它獨立出來「一定會同步」
   *
   * ⚠️ 為什麼不能用 setAll() 整批覆蓋 (這是「家長/保姆登入不到」的根因):
   *   帳號是「本機先寫、雲端後推」的流程 ——
   *   管理員新增家長時先寫 localStorage (讓 UI 即時反應), 背景再 push 到 DB。
   *   如果 push 還沒完成、或 push 失敗 (例如 FK / RLS), 雲端就沒有這筆帳號。
   *   → setAll() 會用雲端快照「整批覆蓋」本機 → 剛建立的帳號憑空消失
   *   → 重新整理後家長頁顯示「無帳號」, 家長端登入回「帳戶不存在」。
   *
   *   修正: 改成「合併」——
   *     - 雲端有的 id       → 以雲端為準 (source of truth, 別裝置改的)
   *     - 只有本機有的 id   → 保留 (還沒 push 成功, 別洗掉)
   *   這跟 lib/storage.ts 的 mergeCloudRecords 同一套思路。
   */
  async syncToStorage(): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.getAll();
    if (error) return { success: false, error };
    if (data.length === 0) {
      // DB 沒有帳號 → 不覆蓋 localStorage (避免把資料清空)
      return { success: true };
    }

    const { STORAGE, mergeCloudUsers } = await import('./storage');
    const cloudUsers = data as User[];

    // ---- 合併 (而非整批覆蓋) ----
    //  詳見 lib/storage.ts mergeCloudUsers 的說明:
    //  帳號是「本機先寫、雲端後推」, setAll 會把還沒 push 成功的本機帳號洗掉
    //  → 家長 / 保姆重新整理後顯示「無帳號」, 登入回「帳戶不存在」。
    const { merged, keptLocal } = mergeCloudUsers(cloudUsers);
    if (keptLocal > 0) {
      console.log(
        `[Supabase] 保留 ${keptLocal} 筆尚未推上雲端的本機帳號: ${merged
          .filter((u) => !cloudUsers.some((c) => c.id === u.id))
          .map((u) => u.phone)
          .join(', ')}`,
      );
    }

    STORAGE.users.setAll(merged);

    // 目前登入者的 session 記錄也一併更新 (名稱 / 密碼 / 角色 / 狀態)
    const current = STORAGE.auth.get();
    if (current) {
      const fresh = cloudUsers.find(
        (u) => u.id === current.id || u.phone === current.phone,
      );
      if (fresh && fresh.password !== current.password) {
        // 密碼在 DB 被改過 → 舊 session 的密碼已失效, 這是預期行為
        console.log('[Supabase] current user credentials updated from DB');
      }
      if (fresh) {
        STORAGE.auth.set({ ...current, ...fresh });
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbl-users-refresh'));
    }
    return { success: true };
  },

  /** 依登入帳號 (phone) 查詢 */
  async findByPhone(
    phone: string,
  ): Promise<{ data: any | null; error?: string }> {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to find user by phone:', error);
      return { data: null, error: error.message };
    }
    return { data: data ? camelize(data) : null };
  },

  /**
   * 新增登入帳號
   * - insert 後用 .select() 二次驗證, 避免 RLS 靜默拒絕 (insert 回傳成功但資料沒寫進去)
   * - account_name 若 live DB 還沒跑 migration 0013 會回 42703 → 降欄重試,
   *   帳號照樣建得起來 (只是帳戶名稱暫時存不到雲端, 电话登入不受影響)
   */
  async add(
    user: SupabaseUserPayload,
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const { supabase } = await import('./supabase');
    let payload: Record<string, unknown> = snakify(user);
    const dropped: string[] = [];

    // ⚠️ client_id 有 FK → cbl_clients(id)。
    //    空字串 '' 一定撞 FK (cbl_users_client_id_fkey), 而 null 是允許的
    //    (system_admin / super_admin 刻意不屬於任何學校)。
    //    → 這裡把 '' 對齊到雲端真的存在的學校; 刻意給 null 的則保留 null。
    await alignPayloadClientId(payload, { allowNull: true });

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('cbl_users')
        .insert(payload)
        .select('id')
        .maybeSingle();

      if (!error) {
        if (!data) {
          console.warn('[Supabase] add user was silently rejected by RLS', user.id);
          return {
            success: false,
            error: 'RLS 政策拒絕 (無寫入權限或欄位不符)',
          };
        }

        // 二次驗證: 真的 select 出來才算數
        const { data: verifyData, error: verifyError } = await supabase
          .from('cbl_users')
          .select('id')
          .eq('id', data.id)
          .maybeSingle();

        if (verifyError) {
          console.warn('[Supabase] verify select error:', verifyError);
        } else if (!verifyData) {
          console.warn('[Supabase] insert 回傳成功但 verify select 找不到 row');
          return { success: false, error: 'RLS 政策過濾掉 insert (verify 失敗)' };
        }

        if (dropped.length > 0) {
          console.warn(
            `[Supabase] cbl_users.insert 已略過 live schema 沒有的欄位: ${dropped.join(', ')} (請跑 migration 0013)`,
          );
        }
        // 記錄「這筆已推上雲端」→ 之後 mergeCloudUsers 才能分辨
        // 「這筆是還沒 push」還是「這筆在別的裝置被刪了」
        markSynced('users', data.id);
        return { success: true, id: data.id };
      }

      // 42703 = undefined column (account_name 還沒加到 DB) → 移除該欄再試
      const colName = parseMissingColumn(error);
      if (colName && colName in payload) {
        const next = { ...payload };
        delete next[colName];
        payload = next;
        dropped.push(colName);
        continue;
      }

      console.error('[Supabase] Failed to add user:', error);
      return { success: false, error: error.message };
    }

    return { success: false, error: '新增帳號失敗 (欄位降級重試已用盡)' };
  },

  /**
   * 更新登入帳號
   * - 同上: account_name 若 live DB 還沒跑 migration 會回 PGRST204/42703 → 降欄重試
   */
  async update(
    id: string,
    patch: SupabaseUserPatch,
  ): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');
    let payload: Record<string, unknown> = snakify(patch);
    const dropped: string[] = [];

    // 同 add: client_id 空字串會撞 FK, 必須對齊到雲端真的存在的 id (或保留 null)
    if ('client_id' in payload) {
      await alignPayloadClientId(payload, { allowNull: true });
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('cbl_users')
        .update(payload)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (!error) {
        if (!data) {
          console.warn('[Supabase] update user was silently rejected by RLS', id);
          return { success: false, error: 'RLS 政策拒絕 (無更新權限)' };
        }
        if (dropped.length > 0) {
          console.warn(
            `[Supabase] cbl_users.update 已略過 live schema 沒有的欄位: ${dropped.join(', ')} (請跑 migration 0013)`,
          );
        }
        // 同 add: 這筆已經在雲端了
        markSynced('users', id);
        return { success: true };
      }

      // PGRST204 (schema cache) / 42703 (undefined column) → 移除該欄再試
      const colName = parseMissingColumn(error);
      if (colName && colName in payload) {
        const next = { ...payload };
        delete next[colName];
        payload = next;
        dropped.push(colName);
        continue;
      }

      console.error('[Supabase] Failed to update user:', error);
      return { success: false, error: error.message };
    }

    return { success: false, error: '更新帳號失敗 (欄位降級重試已用盡)' };
  },

  /** 刪除登入帳號 */
  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase } = await import('./supabase');

    const { data, error } = await supabase
      .from('cbl_users')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Failed to delete user:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.warn('[Supabase] delete user was silently rejected by RLS', id);
      return { success: false, error: 'RLS 政策拒絕 (無刪除權限)' };
    }

    // 已從雲端刪除 → 取消「已同步」標記 (這筆帳號不該再被保留在本機)
    unmarkSynced('users', id);
    return { success: true };
  },
};
