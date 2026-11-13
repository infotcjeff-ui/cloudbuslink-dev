import { NextRequest, NextResponse } from 'next/server';
import { getSecretsStatusAsync, setServerSecretsAsync, getServerSecretsAsync } from '@/lib/server-secrets';

export const dynamic = 'force-dynamic';

/** 僅 system_admin 可讀寫 — client 需帶 x-cbl-role: system_admin (layout 已擋非管理員, 此為縱深防禦) */
function requireSystemAdmin(req: NextRequest) {
  const role = req.headers.get('x-cbl-role');
  if (role !== 'system_admin') {
    return NextResponse.json({ ok: false, error: '僅系統開發者可查看密鑰' }, { status: 403 });
  }
  return null;
}

/** GET → 只回「有/無 + 遮罩」, 永不回明文 */
export async function GET(req: NextRequest) {
  const denied = requireSystemAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(
      { ok: true, ...(await getSecretsStatusAsync()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * POST → 寫入 server-only 密鑰 (只存 server, 永不回傳明文)。
 * body: { account?, password?, apiKey?, endpoint?, clearPassword?, clearApiKey? }
 * 空字串 = 不改該欄; clear* = true 則清空該欄。
 */
export async function POST(req: NextRequest) {
  const denied = requireSystemAdmin(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      account?: string;
      password?: string;
      apiKey?: string;
      endpoint?: string;
      clearPassword?: boolean;
      clearApiKey?: boolean;
      /** 按需解密查看 (eye icon) — 僅 system_admin, 每次只回一個欄位明文, 不落盤不緩存 */
      reveal?: 'account' | 'password' | 'apiKey';
    };
    // 按需解密查看: 只回請求的那一個欄位明文, 並寫 server log 備查
    if (body.reveal) {
      const s = await getServerSecretsAsync();
      const value =
        body.reveal === 'password' ? s.gpsPassword
        : body.reveal === 'apiKey' ? s.gpsApiKey
        : s.gpsAccount;
      try {
        const { appendFileSync, mkdirSync } = await import('node:fs');
        const { dirname, join } = await import('node:path');
        const logFile = join(process.cwd(), 'data', 'system-secrets-access.log');
        try {
          mkdirSync(dirname(logFile), { recursive: true });
          appendFileSync(logFile, `${new Date().toISOString()} reveal:${body.reveal}\n`);
        } catch { /* ignore */ }
      } catch { /* ignore */ }
      return NextResponse.json(
        { ok: true, value, revealed: body.reveal },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const patch: {
      gpsAccount?: string | null;
      gpsPassword?: string | null;
      gpsApiKey?: string | null;
      gpsEndpoint?: string | null;
    } = {};
    if (typeof body.account === 'string' && body.account.trim()) {
      patch.gpsAccount = body.account.trim();
    }
    if (typeof body.password === 'string' && body.password) {
      patch.gpsPassword = body.password;
    } else if (body.clearPassword) {
      patch.gpsPassword = null;
    }
    if (typeof body.apiKey === 'string' && body.apiKey) {
      patch.gpsApiKey = body.apiKey;
    } else if (body.clearApiKey) {
      patch.gpsApiKey = null;
    }
    if (typeof body.endpoint === 'string' && body.endpoint.trim()) {
      patch.gpsEndpoint = body.endpoint.trim();
    }
    await setServerSecretsAsync(patch);
    // 回傳狀態 (遮罩), 不回明文
    return NextResponse.json({ ok: true, ...(await getSecretsStatusAsync()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
