/**
 * lib/server-secrets.ts — SERVER ONLY (絕不在 'use client' 引用)
 *
 * 為什麼需要:
 *   /system-admin-setting/integrations (API 密鑰) 頁的 GPS 帳密 / API Key
 *   以前放在 localStorage + 經 /api/onefleet body 轉發 → F12 Network / Application
 *   直接看到明文。這裡改為 server-only 存放, 前端永遠拿不到明文。
 *
 * 存放 (讀取順序: DB → env → file):
 *   1. Supabase 持久化 (正式, Vercel 重啟 / 重部署不丟), service_role 直連讀寫:
 *      a) 專用表 cbl_server_secrets (若 migration 0025 已執行, 優先用它;
 *         RLS + restrictive block_anon, anon 零權限);
 *      b) 免建表 fallback: cbl_system_config 的獨立行 (id='server-secrets'),
 *         內容是 AES-256-GCM 密文 (key 由 SUPABASE_SERVICE_ROLE_KEY 派生,
 *         anon 就算讀到也解不開)。此行與 id='global' 的平台設定互不干擾。
 *   2. 環境變數 (兜底): ONEFLEET_ACCOUNT / ONEFLEET_PASSWORD / ONEFLEET_API_KEY
 *      / ONEFLEET_ENDPOINT (Vercel 後台設定, 本機 .env.local)。
 *   3. 本機 server 檔案: data/system-secrets.json (gitignored, 永不進 repo,
 *      永不 import 到 client bundle)。只作本機開發兜底; Vercel 上 ephemeral,
 *      寫入只作 best-effort。
 *
 * 寫入: 同時寫 DB + file (file 失敗靜默忽略)。空字串 = 不改該欄
 *       (刪除請傳 null → 清空)。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ServerSecrets {
  gpsAccount: string;
  gpsPassword: string;
  gpsApiKey: string;
  gpsEndpoint: string;
}

const TABLE = 'cbl_server_secrets';
const ROW_ID = 'global';
/** 免建表 fallback: 借用 cbl_system_config 的另一行 (id 不同, 與平台設定互不干擾) */
const FALLBACK_TABLE = 'cbl_system_config';
const FALLBACK_ROW_ID = 'server-secrets';
const DEFAULT_ENDPOINT = 'https://console.onefleet.hk';

/* -------------------------------------------------------------------------- */
/*  file layer (本機開發兜底; Vercel 上 ephemeral, best-effort)                */
/* -------------------------------------------------------------------------- */

function secretsFilePath(): string {
  return path.join(process.cwd(), 'data', 'system-secrets.json');
}

function readFileSecrets(): Partial<ServerSecrets> {
  try {
    const p = secretsFilePath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as Partial<ServerSecrets>;
    return {
      gpsAccount: typeof j.gpsAccount === 'string' ? j.gpsAccount : '',
      gpsPassword: typeof j.gpsPassword === 'string' ? j.gpsPassword : '',
      gpsApiKey: typeof j.gpsApiKey === 'string' ? j.gpsApiKey : '',
      gpsEndpoint: typeof j.gpsEndpoint === 'string' ? j.gpsEndpoint : '',
    };
  } catch {
    return {};
  }
}

/** 寫 file (best-effort; Vercel 上唯讀會靜默失敗, DB 才是正式) */
function writeFileSecrets(next: ServerSecrets): void {
  try {
    const p = secretsFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* ignore — Vercel 上 ephemeral/唯讀, DB 為準 */
  }
}

/* -------------------------------------------------------------------------- */
/*  db layer (正式持久化; service_role 直連, 繞過 RLS)                         */
/* -------------------------------------------------------------------------- */

/** service_role client (server only)。缺 key → 回 null, 呼叫端降級用 env/file。 */
async function getAdminClient(): Promise<import('@supabase/supabase-js').SupabaseClient | null> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}

function cleanRow(d: unknown): Partial<ServerSecrets> {
  const j = (d ?? {}) as Partial<ServerSecrets>;
  return {
    gpsAccount: typeof j.gpsAccount === 'string' ? j.gpsAccount : '',
    gpsPassword: typeof j.gpsPassword === 'string' ? j.gpsPassword : '',
    gpsApiKey: typeof j.gpsApiKey === 'string' ? j.gpsApiKey : '',
    gpsEndpoint: typeof j.gpsEndpoint === 'string' ? j.gpsEndpoint : '',
  };
}

/* -------------------------------------------------------------------------- */
/*  db 加密 fallback (免建表: 借用 cbl_system_config 的獨立行存密文)           */
/*                                                                            */
/*  為什麼要加密: cbl_system_config 有 dev_allow_all (anon 可讀), 明文絕對    */
/*  不能放這裡。內容是 AES-256-GCM 密文, key 由 SUPABASE_SERVICE_ROLE_KEY     */
/*  經 sha256 派生 —— anon 就算讀到該行也解不開; service_role 經後端解密。   */
/*  行 id='server-secrets', 與 id='global' 平台設定互不干擾。                 */
/* -------------------------------------------------------------------------- */

function encKey(): Buffer | null {
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/** { iv, tag, data } base64 拼成單一字串存 jsonb */
function encryptSecrets(next: ServerSecrets): string | null {
  try {
    const key = encKey();
    if (!key) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  } catch {
    return null;
  }
}

function decryptSecrets(payload: unknown): Partial<ServerSecrets> | null {
  try {
    if (typeof payload !== 'string' || !payload.startsWith('gcm1.')) return null;
    const key = encKey();
    if (!key) return null;
    const [, ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return cleanRow(JSON.parse(dec) as Partial<ServerSecrets>);
  } catch {
    return null;
  }
}

/** 讀 fallback 行密文 → 解密。表/行唔存在 → 回 null (不 throw)。 */
async function readFallbackSecrets(
  admin: import('@supabase/supabase-js').SupabaseClient,
): Promise<Partial<ServerSecrets> | null> {
  try {
    const { data, error } = await admin
      .from(FALLBACK_TABLE)
      .select('data')
      .eq('id', FALLBACK_ROW_ID)
      .maybeSingle();
    if (error || !data) return null;
    const d = (data as { data?: unknown }).data as
      | { enc?: unknown }
      | Partial<ServerSecrets>
      | null;
    if (!d || typeof d !== 'object') return null;
    // 新格式: { enc: 'gcm1.…', updatedAt } ; 舊格式(若有人手動寫過明文)直接清掉不用
    if (typeof (d as { enc?: unknown }).enc === 'string') {
      return decryptSecrets((d as { enc: string }).enc);
    }
    return null;
  } catch {
    return null;
  }
}

/** 寫 fallback 行密文。回 false = 寫唔到 (不 throw)。 */
async function writeFallbackSecrets(
  admin: import('@supabase/supabase-js').SupabaseClient,
  next: ServerSecrets,
): Promise<boolean> {
  try {
    const enc = encryptSecrets(next);
    if (!enc) return false;
    const { error } = await admin.from(FALLBACK_TABLE).upsert(
      {
        id: FALLBACK_ROW_ID,
        data: { enc, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.warn('[server-secrets] fallback 寫入失敗:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[server-secrets] fallback 寫入異常:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** PGRST 表唔存在嘅錯誤碼/訊息 (migration 0025 未執行) */
function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const msg = err.message || '';
  return /does not exist|Could not find the table|schema cache/i.test(msg);
}

/**
 * 讀 DB。順序: 專用表 cbl_server_secrets → 加密 fallback 行。
 * 回 null = 讀唔到 (未設 service_role / 離線) → 呼叫端降級用 env + file, 不 throw。
 */
async function readDbSecrets(): Promise<Partial<ServerSecrets> | null> {
  try {
    const admin = await getAdminClient();
    if (!admin) return null;
    const { data, error } = await admin.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (!error && data) return cleanRow((data as { data?: unknown }).data);
    if (error && !isMissingTable(error)) {
      console.warn('[server-secrets] 專用表讀取失敗:', error.message);
      return null;
    }
    // 專用表未建 (migration 未執行) 或行為空 → 用免建表 fallback
    return readFallbackSecrets(admin);
  } catch {
    return null;
  }
}

/**
 * 寫 DB。順序: 專用表 cbl_server_secrets → 加密 fallback 行 (兩者都試埋,
 * 等日後 migration 執行後自動升級到專用表)。回 boolean, 不 throw。
 */
async function writeDbSecrets(next: ServerSecrets): Promise<boolean> {
  try {
    const admin = await getAdminClient();
    if (!admin) {
      console.warn('[server-secrets] 未設 SUPABASE_SERVICE_ROLE_KEY, 密鑰只寫本機檔案 (Vercel 上重啟會丟)');
      return false;
    }
    let primaryOk = false;
    const { error } = await admin
      .from(TABLE)
      .upsert({ id: ROW_ID, data: next, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (!error) {
      primaryOk = true;
    } else if (!isMissingTable(error)) {
      console.warn('[server-secrets] 專用表寫入失敗:', error.message);
    }
    // fallback 行永遠同步寫 (免建表方案即時生效; 專用表建好後兩邊一致)
    const fallbackOk = await writeFallbackSecrets(admin, next);
    return primaryOk || fallbackOk;
  } catch (e) {
    console.warn('[server-secrets] DB 寫入異常:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  async 主 API (route handler 用呢套)                                        */
/* -------------------------------------------------------------------------- */

/** 讀 server-only 密鑰 (async): DB → env → file */
export async function getServerSecretsAsync(): Promise<ServerSecrets> {
  const db = await readDbSecrets();
  const f = readFileSecrets();
  return {
    gpsAccount: (db?.gpsAccount || process.env.ONEFLEET_ACCOUNT || f.gpsAccount || '').trim(),
    gpsPassword: db?.gpsPassword || process.env.ONEFLEET_PASSWORD || f.gpsPassword || '',
    gpsApiKey: db?.gpsApiKey || process.env.ONEFLEET_API_KEY || f.gpsApiKey || '',
    gpsEndpoint:
      (db?.gpsEndpoint || process.env.ONEFLEET_ENDPOINT || f.gpsEndpoint || DEFAULT_ENDPOINT).trim() ||
      DEFAULT_ENDPOINT,
  };
}

/** 寫 server-only 密鑰 (async): 以 DB(+file) 現值做 base 合併 patch, 同時寫 DB + file */
export async function setServerSecretsAsync(patch: {
  gpsAccount?: string | null;
  gpsPassword?: string | null;
  gpsApiKey?: string | null;
  gpsEndpoint?: string | null;
}): Promise<ServerSecrets> {
  const db = await readDbSecrets();
  const f = readFileSecrets();
  const base: ServerSecrets = {
    gpsAccount: db?.gpsAccount ?? f.gpsAccount ?? '',
    gpsPassword: db?.gpsPassword ?? f.gpsPassword ?? '',
    gpsApiKey: db?.gpsApiKey ?? f.gpsApiKey ?? '',
    gpsEndpoint: db?.gpsEndpoint ?? f.gpsEndpoint ?? '',
  };
  const next: ServerSecrets = {
    gpsAccount: patch.gpsAccount === undefined ? base.gpsAccount : (patch.gpsAccount || ''),
    gpsPassword: patch.gpsPassword === undefined ? base.gpsPassword : (patch.gpsPassword || ''),
    gpsApiKey: patch.gpsApiKey === undefined ? base.gpsApiKey : (patch.gpsApiKey || ''),
    gpsEndpoint: patch.gpsEndpoint === undefined ? base.gpsEndpoint : (patch.gpsEndpoint || ''),
  };
  writeFileSecrets(next);
  await writeDbSecrets(next);
  return getServerSecretsAsync();
}

/** 狀態 (async, 給 UI 用 — 只回「有/無」, 永不回明文) */
export async function getSecretsStatusAsync(): Promise<{
  hasAccount: boolean;
  accountMasked: string;
  hasPassword: boolean;
  hasApiKey: boolean;
  endpoint: string;
}> {
  const s = await getServerSecretsAsync();
  const acc = s.gpsAccount;
  return {
    hasAccount: !!acc,
    // 只露頭尾各 1 字, 其餘打碼 (例如 c•••••6)。無帳號則空字串。
    accountMasked: acc.length <= 2 ? (acc ? '••' : '') : `${acc.slice(0, 1)}•••••${acc.slice(-1)}`,
    hasPassword: !!s.gpsPassword,
    hasApiKey: !!s.gpsApiKey,
    endpoint: s.gpsEndpoint,
  };
}

/* -------------------------------------------------------------------------- */
/*  同步相容層 (env → file; 本機舊呼叫端用。Vercel 上讀唔到 DB 持久值,        */
/*  route handler 一律用上面嘅 Async 版)                                      */
/* -------------------------------------------------------------------------- */

/** 讀 server-only 密鑰 (只可在 Route Handler / Server Component 呼叫) */
export function getServerSecrets(): ServerSecrets {
  const f = readFileSecrets();
  return {
    gpsAccount: (process.env.ONEFLEET_ACCOUNT || f.gpsAccount || '').trim(),
    gpsPassword: process.env.ONEFLEET_PASSWORD || f.gpsPassword || '',
    gpsApiKey: process.env.ONEFLEET_API_KEY || f.gpsApiKey || '',
    gpsEndpoint:
      (process.env.ONEFLEET_ENDPOINT || f.gpsEndpoint || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT,
  };
}

/** 寫 server-only 密鑰 (只寫 file 層, 不碰 env)。空字串 = 不改該欄 (刪除請傳 null → 清空)。 */
export function setServerSecrets(patch: {
  gpsAccount?: string | null;
  gpsPassword?: string | null;
  gpsApiKey?: string | null;
  gpsEndpoint?: string | null;
}): ServerSecrets {
  const cur = readFileSecrets();
  const next: ServerSecrets = {
    gpsAccount: patch.gpsAccount === undefined ? (cur.gpsAccount || '') : (patch.gpsAccount || ''),
    gpsPassword: patch.gpsPassword === undefined ? (cur.gpsPassword || '') : (patch.gpsPassword || ''),
    gpsApiKey: patch.gpsApiKey === undefined ? (cur.gpsApiKey || '') : (patch.gpsApiKey || ''),
    gpsEndpoint: patch.gpsEndpoint === undefined ? (cur.gpsEndpoint || '') : (patch.gpsEndpoint || ''),
  };
  writeFileSecrets(next);
  return getServerSecrets();
}

/** 狀態 (給 UI 用 — 只回「有/無」, 永不回明文) */
export function getSecretsStatus(): {
  hasAccount: boolean;
  accountMasked: string;
  hasPassword: boolean;
  hasApiKey: boolean;
  endpoint: string;
} {
  const s = getServerSecrets();
  const acc = s.gpsAccount;
  return {
    hasAccount: !!acc,
    // 只露頭尾各 1 字, 其餘打碼 (例如 c•••••6)。無帳號則空字串。
    accountMasked: acc.length <= 2 ? (acc ? '••' : '') : `${acc.slice(0, 1)}•••••${acc.slice(-1)}`,
    hasPassword: !!s.gpsPassword,
    hasApiKey: !!s.gpsApiKey,
    endpoint: s.gpsEndpoint,
  };
}
