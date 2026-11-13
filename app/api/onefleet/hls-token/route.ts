import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { mintVideoToken } from '../_video';

/**
 * POST /api/onefleet/hls-token — 簽發實時錄像播放 token
 *
 * body: { account, password, endpoint?, plate?, devId? }
 * 流程: login → (plate → queryUserVehicle 找 devId, 找不到用 body devId 兜底)
 *       → 回 opaque token (10 分鐘)。devId / jsession 只留 server 內存,
 *       永不落前端 URL / 畫面 (敏感資料不顯示)。
 */

export const dynamic = 'force-dynamic';

const DEFAULT_ENDPOINT = 'https://console.onefleet.hk';

function norm(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[\s-]/g, '');
}

async function getJson(url: string, ms = 25000): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { result: -1, message: text.slice(0, 200) };
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      account?: string;
      password?: string;
      endpoint?: string;
      plate?: string;
      devId?: string;
    };
    const { endpoint, plate, devId } = body;
    const { getServerSecrets } = await import('@/lib/server-secrets');
    const srv = getServerSecrets();
    const account = srv.gpsAccount.trim();
    const password = srv.gpsPassword || '';
    if (!account || !password) {
      return NextResponse.json(
        { ok: false, error: '缺少 808 帳號 / 密碼 (請到 System Admin → API 密鑰寫入)', vehicles: [], positions: [], byDeviceId: {}, byPlate: {} },
        { status: 400 },
      );
    }
    const base = (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');

    const md5 = crypto.createHash('md5').update(String(password)).digest('hex');
    const login = await getJson(
      `${base}/StandardApiAction_login.action?account=${encodeURIComponent(account)}&password=${encodeURIComponent(md5)}`,
    );
    if (Number(login.result) !== 0 || !login.jsession) {
      return NextResponse.json({ ok: false, error: '808 登入失敗' }, { status: 502 });
    }
    const jsession = String(login.jsession);

    // plate → devId (server 內解析, 前端唔使掂 device id)
    let dev = String(devId || '');
    if (!dev && plate) {
      const veh = await getJson(
        `${base}/StandardApiAction_queryUserVehicle.action?jsession=${encodeURIComponent(jsession)}&language=zh`,
      );
      const list = ((veh.vehicles || veh.vehicle || []) as Array<{ nm?: string; dl?: Array<{ id?: string }> }>);
      const hit = list.find((v) => norm(String(v.nm || '')) === norm(String(plate)));
      const dl = Array.isArray(hit?.dl) ? hit!.dl! : [];
      if (dl[0]?.id) dev = String(dl[0].id);
    }
    if (!dev) {
      return NextResponse.json({ ok: false, error: '找不到此車的 808 設備' }, { status: 404 });
    }

    const token = mintVideoToken({ jsession, endpoint: base, devId: dev });
    return NextResponse.json({ ok: true, token });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `簽發失敗: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
