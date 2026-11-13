/**
 * lib/server-secrets.ts — SERVER ONLY (絕不在 'use client' 引用)
 *
 * 為什麼需要:
 *   /system-admin-setting/integrations (API 密鑰) 頁的 GPS 帳密 / API Key
 *   以前放在 localStorage + 經 /api/onefleet body 轉發 → F12 Network / Application
 *   直接看到明文。這裡改為 server-only 存放, 前端永遠拿不到明文。
 *
 * 存放 (讀取順序: DB → env → file):
 *   1. Supabase 表 cbl_server_secrets (正式持久化, Vercel 重啟 / 重部署不丟):
 *      service_role 直連讀寫 (繞過 RLS); 表上 RLS + restrictive block_anon,
 *      anon key 讀寫一律拒絕。System Admin 在 UI 改的寫這裡。
 *   2. 環境變數 (優先兜底): ONEFLEET_ACCOUNT / ONEFLEET_PASSWORD / ONEFLEET_API_KEY
 *      / ONEFLEET_ENDPOINT (Vercel 後台設定, 本機 .env.local)。
 *   3. 本機 server 檔案: data/system-secrets.json (gitignored, 永不進 repo,
 *      永不 import 到 client bundle)。只作本機開發兜底; Vercel 上 ephemeral,
 *      寫入只作 best-effort。
 *
 * 寫入: 同時寫 DB + file (file 失敗靜默忽略)。空字串 = 不改該欄
 *       (刪除請傳 null → 清空)。
 */

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

/**
 * 讀 DB 列。回 null = 讀唔到 (未設 service_role / 表未建 / 離線) →
 * 呼叫端降級用 env + file, 不 throw。
 */
async function readDbSecrets(): Promise<Partial<ServerSecrets> | null> {
  try {
    const admin = await getAdminClient();
    if (!admin) return null;
    const { data, error } = await admin.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error || !data) return null;
    return cleanRow((data as { data?: unknown }).data);
  } catch {
    return null;
  }
}

/** 寫 DB。回 false = 寫唔到 (log 警告, 呼叫端照樣回成功 + file 兜底, 不 throw)。 */
async function writeDbSecrets(next: ServerSecrets): Promise<boolean> {
  try {
    const admin = await getAdminClient();
    if (!admin) {
      console.warn('[server-secrets] 未設 SUPABASE_SERVICE_ROLE_KEY, 密鑰只寫本機檔案 (Vercel 上重啟會丟)');
      return false;
    }
    const { error } = await admin
      .from(TABLE)
      .upsert({ id: ROW_ID, data: next, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      console.warn('[server-secrets] DB 寫入失敗:', error.message);
      return false;
    }
    return true;
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
