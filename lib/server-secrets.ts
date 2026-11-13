import fs from 'node:fs';
import path from 'node:path';

/**
 * lib/server-secrets.ts — SERVER ONLY (絕不在 'use client' 引用)
 *
 * 為什麼需要:
 *   /system-admin-setting/integrations (API 密鑰) 頁的 GPS 帳密 / API Key
 *   以前放在 localStorage + 經 /api/onefleet body 轉發 → F12 Network / Application
 *   直接看到明文。這裡改為 server-only 存放, 前端永遠拿不到明文。
 *
 * 存放:
 *   1. 環境變數 (優先): ONEFLEET_ACCOUNT / ONEFLEET_PASSWORD / ONEFLEET_API_KEY
 *      / ONEFLEET_ENDPOINT (Vercel 後台設定, 本機 .env.local)
 *   2. 本機 server 檔案: data/system-secrets.json (gitignored, 永不進 repo,
 *      永不 import 到 client bundle)。System Admin 在 UI 改的寫這裡。
 *
 * 讀取順序: env → file。寫入只寫 file (不改 env)。
 */

export interface ServerSecrets {
  gpsAccount: string;
  gpsPassword: string;
  gpsApiKey: string;
  gpsEndpoint: string;
}

const FILE_PATH = path.join(process.cwd(), 'data', 'system-secrets.json');

function readFileSecrets(): Partial<ServerSecrets> {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
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

/** 讀 server-only 密鑰 (只可在 Route Handler / Server Component 呼叫) */
export function getServerSecrets(): ServerSecrets {
  const f = readFileSecrets();
  return {
    gpsAccount:
      (process.env.ONEFLEET_ACCOUNT || f.gpsAccount || '').trim(),
    gpsPassword:
      process.env.ONEFLEET_PASSWORD || f.gpsPassword || '',
    gpsApiKey:
      process.env.ONEFLEET_API_KEY || f.gpsApiKey || '',
    gpsEndpoint:
      (process.env.ONEFLEET_ENDPOINT || f.gpsEndpoint || 'https://console.onefleet.hk').trim() ||
      'https://console.onefleet.hk',
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
  try {
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* ignore — 下次讀 env 兜底 */
  }
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
