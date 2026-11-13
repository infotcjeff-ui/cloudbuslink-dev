import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { takeVideoToken } from '../_video';

/**
 * GET /api/onefleet/hls — 808 HLS 同源代理
 *
 * 用法:
 *   播放列表: ?plate=SY92&chn=0&stream=1[&token=..]
 *   分片:     ?kind=seg&u=<base64url(上游分片URL)>[&token=..]
 *
 * 文件依據: 808 GPS/Web Interface Documentation.html
 *   HLS: http(s)://<streamHost>:6604/hls/1_<devId>_<chn>_<stream>.m3u8?jsession=..
 */

export const dynamic = 'force-dynamic';

const DEFAULT_ENDPOINT = 'https://console.onefleet.hk';

function norm(s: string | null | undefined): string {
  return (s || '').toUpperCase().replace(/[\s-]/g, '');
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function getJson(url: string, ms = 20000): Promise<Record<string, unknown>> {
  const t = withTimeout(ms);
  try {
    const res = await fetch(url, { signal: t.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { result: -1, message: text.slice(0, 200) };
    }
  } finally {
    t.done();
  }
}

async function getText(url: string, ms = 12000): Promise<string | null> {
  const t = withTimeout(ms);
  try {
    const res = await fetch(url, { signal: t.signal, headers: { Accept: '*/*' }, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    t.done();
  }
}

function b64e(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function b64d(s: string): string {
  return Buffer.from(String(s), 'base64url').toString('utf8');
}

function ctFor(path: string): string {
  const p = path.toLowerCase();
  if (p.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (p.endsWith('.mp4') || p.endsWith('.m4s')) return 'video/mp4';
  if (p.endsWith('.key')) return 'application/octet-stream';
  return 'video/MP2T';
}

const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get('kind') || 'playlist';
  const token = sp.get('token');
  const entry = takeVideoToken(token);

  const hAccount = req.headers.get('x-808-account') || '';
  const hPassword = req.headers.get('x-808-password') || '';
  const hEndpoint = req.headers.get('x-808-endpoint') || '';
  const hDevId = req.headers.get('x-808-devid') || '';
  const headerBase = (hEndpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');

  try {
    /* ── 分片轉發 ── */
    if (kind === 'seg') {
      const uRaw = sp.get('u');
      if (!uRaw) return err('缺少分片參數', 400);
      let upstream = '';
      try {
        upstream = b64d(uRaw);
      } catch {
        return err('分片參數無效', 400);
      }
      let uu: URL;
      try {
        uu = new URL(upstream);
      } catch {
        return err('分片地址無效', 400);
      }
      if (uu.protocol !== 'http:' && uu.protocol !== 'https:') return err('分片地址無效', 400);
      // 先驗證授權，再按會話類型校驗主機，避免誤攔串流主機
      if (!entry && !(hAccount && hPassword)) {
        return err('播放會話已過期請重試', 401);
      }
      if (entry) {
        // 有效會話：串流主機可能與登入主機不同，僅校驗路徑避免開放代理
        if (!uu.pathname.startsWith('/hls/')) return err('分片地址不合法', 403);
      } else {
        // 無會話時採用嚴格主機白名單
        const allowed = new Set<string>();
        try {
          allowed.add(new URL(headerBase).hostname);
        } catch { /* noop */ }
        if (!allowed.has(uu.hostname)) return err('分片地址不合法', 403);
      }
      const t = withTimeout(20000);
      try {
        const headers: Record<string, string> = { Accept: '*/*', Connection: 'keep-alive' };
        const range = req.headers.get('range');
        if (range) headers['Range'] = range;
        let r = await fetch(upstream, { signal: t.signal, headers, cache: 'no-store' });
        if (!r.ok) {
          await new Promise((res) => setTimeout(res, 600));
          r = await fetch(upstream, { signal: t.signal, headers, cache: 'no-store' });
        }
        if (!r.ok) return err('分片載入失敗', 502);
        const buf = await r.arrayBuffer();
        const outHeaders: Record<string, string> = {
          'Content-Type': ctFor(uu.pathname),
          'Cache-Control': 'no-store',
          'Content-Length': String(buf.byteLength),
          'Accept-Ranges': 'bytes',
        };
        const cr = r.headers.get('content-range');
        if (cr) outHeaders['Content-Range'] = cr;
        return new NextResponse(buf, {
          status: cr ? 206 : 200,
          headers: outHeaders,
        });
      } finally {
        t.done();
      }
    }

    /* ── 播放列表 ── */
    const plate = sp.get('plate') || '';
    const chn = Math.max(0, parseInt(sp.get('chn') || '0', 10) || 0);
    const stream = sp.get('stream') || '1'; // 子碼流以節省頻寬

    let jsession = '';
    let base = headerBase;
    let dev = '';
    if (entry) {
      jsession = entry.jsession;
      base = entry.endpoint;
      dev = entry.devId;
    } else {
      if (!hAccount || !hPassword) return err('播放會話已過期,請重試', 401);
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
      if (!dev && hDevId) dev = hDevId;
      if (!dev) return err('找不到此車的 808 設備', 404);
    }

    let host = '';
    try {
      host = new URL(base).hostname;
    } catch {
      return err('808 端點無效', 500);
    }
    // server 對 server 無 mixed-content 限制, http 6604 優先 (文件原例), 再試 https 變體
    const cands = [`http://${host}:6604`, `https://${host}:16604`, `https://${host}:6604`];
    let plText = '';
    let plBase = '';
    for (const c of cands) {
      const url = `${c}/hls/1_${dev}_${chn}_${stream}.m3u8?jsession=${encodeURIComponent(jsession)}`;
      const text = await getText(url);
      if (text && text.includes('#EXTM3U')) {
        plText = text;
        plBase = url;
        break;
      }
    }
    if (!plText) return err('串流伺服器暫無回應，請稍後重試', 502);
    // 空播放清單（設備未推流）直接回 502，前端顯示離線提示，避免 hls.js 空轉不斷重載播放清單
    if (!/#EXTINF/i.test(plText)) return err('設備暫無串流可能已離線請稍後重試', 502);

    // 改寫分片地址 → 同源代理；上游分片多為相對路徑，須補回 jsession 否則分片持續 401 觸發重連循環
    const withSession = (abs: string) => {
      try {
        const u = new URL(abs);
        if (jsession && !u.searchParams.has('jsession')) u.searchParams.set('jsession', jsession);
        return u.toString();
      } catch {
        return abs;
      }
    };
    const tk = token && entry ? `&token=${encodeURIComponent(token)}` : '';
    const prox = (abs: string) => `/api/onefleet/hls?kind=seg${tk}&u=${encodeURIComponent(b64e(withSession(abs)))}`;
    const out = plText
      .split(/\r?\n/)
      .map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
          // EXT-X-MAP / EXT-X-KEY / EXT-X-MEDIA 內 URI="..."
          return line.replace(/URI="([^"]+)"/g, (m, g1: string) => {
            try {
              return `URI="${prox(new URL(g1, plBase).toString())}"`;
            } catch {
              return m;
            }
          });
        }
        try {
          return prox(new URL(t, plBase).toString());
        } catch {
          return line;
        }
      })
      .join('\n');

    return new NextResponse(out, {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return err(`播放服務異常,請重試`, 500);
  }
}
