import crypto from 'crypto';

/**
 * 實時錄像播放會話 (hls-token / hls 共用, 同一 Node 實例內有效)
 * devId / jsession 只留 server 內存, 永不落前端 URL / 畫面。
 */
export interface VideoEntry {
  jsession: string;
  endpoint: string;
  devId: string;
  exp: number;
}

const g = globalThis as unknown as { __videoTokens?: Map<string, VideoEntry> };
if (!g.__videoTokens) g.__videoTokens = new Map<string, VideoEntry>();
const tokens = g.__videoTokens;
const TOKEN_TTL_MS = 30 * 60 * 1000;

export function mintVideoToken(e: Omit<VideoEntry, 'exp'>): string {
  const t = crypto.randomUUID().replace(/-/g, '');
  tokens.set(t, { ...e, exp: Date.now() + TOKEN_TTL_MS });
  if (tokens.size > 1000) {
    const now = Date.now();
    for (const [k, v] of tokens) {
      if (v.exp < now) tokens.delete(k);
    }
  }
  return t;
}

/** 取會話 (過期自動刪, 回 undefined → 呼叫端回 401 叫前端重簽) */
export function takeVideoToken(t: string | null | undefined): VideoEntry | undefined {
  if (!t) return undefined;
  const e = tokens.get(t);
  if (!e) return undefined;
  if (e.exp < Date.now()) {
    tokens.delete(t);
    return undefined;
  }
  return e;
}
