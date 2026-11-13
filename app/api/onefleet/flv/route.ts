import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { takeVideoToken } from '../_video';

/**
 * GET /api/onefleet/flv — 808 FLV 同源代理 (mpegts.js 用)
 *
 * 用法: ?plate=SY92&chn=0&stream=1[&token=..]
 * 上游 (文件 id 413): http(s)://<streamHost>:6604/3/3?AVType=1&jsession=..&DevIDNO=..&Channel=N&Stream=S
 * 前端 mpegts.js 以 { type: 'flv', isLive: true, url } 接入, MSE 解封裝後餵給 <video src=blob:..>
 */

export const dynamic = 'force-dynamic';

const DEFAULT_ENDPOINT = 'https://console.onefleet.hk';

function norm(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[\s-]/g, '');
}

async function getJson(url: string, ms = 20000): Promise<Record<string, unknown>> {
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

const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = sp.get('token');
  const entry = takeVideoToken(token);
  const hAccount = req.headers.get('x-808-account') || '';
  const hPassword = req.headers.get('x-808-password') || '';
  const hEndpoint = req.headers.get('x-808-endpoint') || '';
  const headerBase = (hEndpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');

  try {
    const plate = sp.get('plate') || '';
    const chn = Math.max(0, parseInt(sp.get('chn') || '0', 10) || 0);
    const stream = sp.get('stream') || '1';

    let jsession = '';
    let base = headerBase;
    let dev = '';
    if (entry) {
      jsession = entry.jsession;
      base = entry.endpoint;
      dev = entry.devId;
    } else {
      if (!hAccount || !hPassword) return err('播放會話已過期請重試', 401);
      const md5 = crypto.createHash('md5').update(String(hPassword)).digest('hex');
      const login = await getJson(
        `${base}/StandardApiAction_login.action?account=${encodeURIComponent(hAccount)}&password=${encodeURIComponent(md5)}`,
      );
      if (Number(login.result) !== 0 || !login.jsession) return err('808 登入失敗', 502);
      jsession = String(login.jsession);
      if (plate) {
        const veh = await getJson(
          `${base}/StandardApiAction_queryUserVehicle.action?jsession=${encodeURIComponent(jsession)}&language=zh`,
        );
        const list = ((veh.vehicles || veh.vehicle || []) as Array<{ nm?: string; dl?: Array<{ id?: string }> }>);
        const hit = list.find((v) => norm(String(v.nm || '')) === norm(plate));
        const dl = Array.isArray(hit?.dl) ? hit!.dl! : [];
        if (dl[0]?.id) dev = String(dl[0].id);
      }
      if (!dev) return err('找不到此車的 808 設備', 404);
    }

    let host = '';
    try {
      host = new URL(base).hostname;
    } catch {
      return err('808 端點無效', 500);
    }

    const cands = [`http://${host}:6604`, `https://${host}:16604`, `https://${host}:6604`];
    let lastErr = '';
    for (const c of cands) {
      const upstream =
        `${c}/3/3?AVType=1&jsession=${encodeURIComponent(jsession)}` +
        `&DevIDNO=${encodeURIComponent(dev)}&Channel=${chn}&Stream=${encodeURIComponent(stream)}`;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        let r: Response;
        try {
          r = await fetch(upstream, {
            headers: { Accept: '*/*', 'User-Agent': 'CloudBusLink-FLV-Proxy/1.0' },
            cache: 'no-store',
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!r.ok || !r.body) {
          const t = await r.text().catch(() => '');
          lastErr = `上游 ${r.status}${t ? `: ${t.slice(0, 120)}` : ''}`;
          continue;
        }
        const ct = r.headers.get('content-type') || '';
        // 上游正常應回 FLV 二進制; 若回 JSON/HTML 說明設備離線或會話失效, 直接當失敗換下一個候選
        if (ct.includes('json') || ct.includes('html') || ct.includes('text')) {
          const t = await r.text().catch(() => '');
          lastErr = t.slice(0, 160) || `非串流回應 (${ct || '無 content-type'})`;
          continue;
        }
        // 直接串流轉發, 不緩衝 (無限長 FLV)
        return new NextResponse(r.body, {
          headers: {
            'Content-Type': 'video/x-flv',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'Content-Encoding': 'identity',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        continue;
      }
    }
    const offlineHint = /abort|timeout|fetch failed|ENOTFOUND|ECONN/i.test(lastErr || '')
      ? '網絡連接超時'
      : '設備暫無串流可能已離線';
    return err(`${offlineHint}請稍後重試${lastErr ? ` (${lastErr.slice(0, 120)})` : ''}`, 502);
  } catch {
    return err('播放服務異常請重試', 500);
  }
}
