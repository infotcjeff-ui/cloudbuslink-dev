import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSecretsAsync } from '@/lib/server-secrets';

/**
 * POST /api/onefleet — 808 GPS (OneFleet) server-side proxy
 *
 * 為什麼要 proxy:
 *   - 瀏覽器直打 console.onefleet.hk 會撞 CORS
 *   - 帳密放前端 bundle 不安全 — 這裡只收帳密轉發, 不落盤
 *
 * body:
 *   { action: 'sync', account, password, endpoint?, onlyDeviceIds? }
 *   { action: 'session', account, password, endpoint? }
 *   { action: 'track', account, password, endpoint?, devIdno, begintime?, endtime? }
 *     → 過去 N 分鐘軌跡 (queryTrackDetail, toMap=1), 軌跡點含 gt 時間戳
 *
 * 流程 (文件: 808 GPS/Web Interface Documentation.html):
 *   1. StandardApiAction_login.action?account=&password={md5} → jsession
 *   2. StandardApiAction_queryUserVehicle.action?jsession= → vehicles[{nm,dl[]}]
 *   3. StandardApiAction_getDeviceStatus.action?jsession=&devIdno=a,b&toMap=1 → status[]
 *
 * 實時錄像 (文件 id 410/411/802, lang_en.js.download):
 *   - HLS 直播地址: http://<streamHost>:6604/hls/1_<devIdno>_<chn>_<stream>.m3u8?jsession=xxx
 *     (request_type = 1 video_設備號_通道號_碼流類型, 通道由 0 起, 碼流 0 主 1 子)
 *   - H5 整合頁: <endpoint>/808gps/open/player/videoH5.html?lang=zh&devIdno=..&jsession=..&channel=N
 *   - HLS 整合頁: <endpoint>/808gps/open/hls/index.html?lang=zh&devIdno=..&jsession=..&channel=N
 * 前端每格鏡頭用 iframe 嵌入官方 H5 播放頁 (按播放鍵才載入), jsession 由本 proxy 簽發,
 * 帳密永不落前端 URL (文件本身雖容許 account+password 直連, 我們一律用 jsession)。
 */

export const dynamic = 'force-dynamic';

const DEFAULT_ENDPOINT = 'https://console.onefleet.hk';

async function getJson(url: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { result: -1, message: text.slice(0, 300) };
    }
  } finally {
    clearTimeout(timer);
  }
}

type Vehicle808 = { id: number | string; nm: string; pnm?: string; dl?: Array<{ id: string; sim?: string }> };
type Status808 = {
  id: string; vid?: string | null; lng?: number; lat?: number;
  mlng?: string; mlat?: string; sp?: number; ol?: number;
  gt?: string; hx?: number; ps?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, endpoint, onlyDeviceIds, devIdno, begintime, endtime } = body as {
      action?: string;
      endpoint?: string;
      onlyDeviceIds?: string[];
      devIdno?: string;
      begintime?: string;
      endtime?: string;
    };

    if (action !== 'sync' && action !== 'session' && action !== 'track') {
      return NextResponse.json({ ok: false, error: '未知動作' }, { status: 400 });
    }
    // 帳密一律用 server-only 密鑰 (經 /api/system-admin/secrets 寫入);
    // 前端 body / header 不再接受帳密, F12 看不到明文。
    const srv = await getServerSecretsAsync();
    const effAccount = srv.gpsAccount.trim();
    const effPassword = srv.gpsPassword || '';
    const effEndpoint = (endpoint || srv.gpsEndpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
    if (!effAccount || !effPassword) {
      return NextResponse.json(
        { ok: false, error: '缺少 808 帳號 / 密碼 (請到 System Admin → API 密鑰寫入)', vehicles: [], positions: [], byDeviceId: {}, byPlate: {} },
        { status: 400 },
      );
    }
    const base = effEndpoint;

    // 1) login — password 需 md5 (見文件 lang: open_login_pwd_desc)
    const md5 = crypto.createHash('md5').update(String(effPassword)).digest('hex');
    const loginUrl = `${base}/StandardApiAction_login.action?account=${encodeURIComponent(effAccount)}&password=${encodeURIComponent(md5)}`;
    const login = await getJson(loginUrl);
    if (Number(login.result) !== 0 || !login.jsession) {
      const msg =
        login.message || login.error || login.errorMsg || login.msg || `登入失敗 (result=${String(login.result ?? '?')})`;
      return NextResponse.json({
        ok: false,
        error: `808 登入失敗: ${String(msg)}`,
        vehicles: [],
        positions: [],
        byDeviceId: {},
        byPlate: {},
      });
    }
    const jsession = String(login.jsession);

    // 輕量會話: 只登入取 jsession 給實時錄像 H5 播放頁用 (不拉車輛/定位)
    if (action === 'session') {
      return NextResponse.json({ ok: true, jsession, endpoint: base });
    }

    // 軌跡: 過去 N 分鐘路線尾巴 (queryTrackDetail, toMap=1)
    // 文件: StandardApiAction_queryTrackDetail.action?jsession=&devIdno=&begintime=&endtime=&toMap=1
    if (action === 'track') {
      const dev = String(devIdno || (Array.isArray(onlyDeviceIds) ? onlyDeviceIds[0] : '') || '').trim();
      if (!dev) return NextResponse.json({ ok: false, error: '缺少設備號', points: [] }, { status: 400 });
      const fmt = (d: Date) => {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      };
      const now = new Date();
      const end = typeof endtime === 'string' && endtime ? endtime : fmt(now);
      const begin = typeof begintime === 'string' && begintime
        ? begintime
        : fmt(new Date(now.getTime() - 15 * 60 * 1000));
      const tUrl =
        `${base}/StandardApiAction_queryTrackDetail.action?jsession=${encodeURIComponent(jsession)}` +
        `&devIdno=${encodeURIComponent(dev)}&begintime=${encodeURIComponent(begin)}&endtime=${encodeURIComponent(end)}` +
        `&distance=0&parkTime=0&currentPage=1&pageRecords=500&toMap=1`;
      const tj = await getJson(tUrl);
      const tracks = (tj.tracks || tj.infos || []) as Array<{
        lng?: number; lat?: number; mlng?: string; mlat?: string;
        gt?: string; sp?: number; hx?: number;
      }>;
      const points = tracks
        .map((t) => {
          let latitude = 0;
          let longitude = 0;
          if (t.mlat && t.mlng) {
            latitude = parseFloat(String(t.mlat));
            longitude = parseFloat(String(t.mlng));
          } else if (typeof t.lat === 'number' && typeof t.lng === 'number') {
            latitude = t.lat / 1000000;
            longitude = t.lng / 1000000;
          } else {
            return null;
          }
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
          if (latitude === 0 || longitude === 0) return null;
          return {
            latitude,
            longitude,
            gt: t.gt ? String(t.gt) : null,
            speed: typeof t.sp === 'number' ? Math.round(t.sp / 10) : 0,
            direction: typeof t.hx === 'number' ? t.hx : null,
          };
        })
        .filter(Boolean);
      return NextResponse.json({ ok: true, points, begintime: begin, endtime: end });
    }

    // 2) 車輛清單
    const vehUrl = `${base}/StandardApiAction_queryUserVehicle.action?jsession=${encodeURIComponent(jsession)}&language=zh`;
    const veh = await getJson(vehUrl);
    const rawVehicles = (veh.vehicles || veh.vehicle || []) as Vehicle808[];

    const vehicles = rawVehicles.map((v) => {
      const dl = Array.isArray(v.dl) ? v.dl : [];
      return {
        id: v.id,
        plate: String(v.nm || ''),
        deviceId: dl[0]?.id ? String(dl[0].id) : '',
        sim: dl[0]?.sim ? String(dl[0].sim) : null,
        company: v.pnm ? String(v.pnm) : null,
        allDeviceIds: dl.map((d) => String(d.id)),
      };
    });

    // 3) 即時定位 — devIdno 可逗號多個
    let devIds: string[] = Array.isArray(onlyDeviceIds) && onlyDeviceIds.length > 0
      ? onlyDeviceIds.map(String)
      : vehicles.flatMap((v) => (v as unknown as { allDeviceIds: string[] }).allDeviceIds || (v.deviceId ? [v.deviceId] : []));

    devIds = [...new Set(devIds.filter(Boolean))];

    const positions: Array<{
      deviceId: string; plate: string | null; latitude: number; longitude: number;
      speed: number; online: boolean; gpsTime: string | null; direction: number | null;
      address: string | null; raw: Record<string, unknown>;
    }> = [];

    // 分批 (每批最多 50 台, 避免 URL 過長)
    const CHUNK = 50;
    for (let i = 0; i < devIds.length; i += CHUNK) {
      const chunk = devIds.slice(i, i + CHUNK);
      const stUrl =
        `${base}/StandardApiAction_getDeviceStatus.action?jsession=${encodeURIComponent(jsession)}` +
        `&devIdno=${encodeURIComponent(chunk.join(','))}&toMap=1&language=zh`;
      const st = await getJson(stUrl);
      const list = (st.status || st.infos || []) as Status808[];
      for (const s of list) {
        const id = String(s.id || '');
        // toMap=1 時 mlng/mlat 是 Google 座標字串; lng/lat 是 ×1e6 整數
        let latitude = 0;
        let longitude = 0;
        if (s.mlat && s.mlng) {
          latitude = parseFloat(String(s.mlat));
          longitude = parseFloat(String(s.mlng));
        } else if (typeof s.lat === 'number' && typeof s.lng === 'number' && s.lat !== 0 && s.lng !== 0) {
          latitude = s.lat / 1000000;
          longitude = s.lng / 1000000;
        } else {
          continue; // 無有效座標 (離線未定位)
        }
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const match = vehicles.find(
          (v) => v.deviceId === id || (v as unknown as { allDeviceIds: string[] }).allDeviceIds?.includes(id),
        );
        positions.push({
          deviceId: id,
          plate: match?.plate ?? (s.vid ? String(s.vid) : null),
          latitude,
          longitude,
          speed: typeof s.sp === 'number' ? Math.round(s.sp / 10) : 0,
          online: Number(s.ol) === 1,
          gpsTime: s.gt ? String(s.gt) : null,
          direction: typeof s.hx === 'number' ? s.hx : null,
          address: s.ps ? String(s.ps) : null,
          raw: s as unknown as Record<string, unknown>,
        });
      }
    }

    const byDeviceId: Record<string, (typeof positions)[number]> = {};
    const byPlate: Record<string, (typeof positions)[number]> = {};
    for (const p of positions) {
      byDeviceId[p.deviceId] = p;
      if (p.plate) byPlate[p.plate.toUpperCase().replace(/[\s-]/g, '')] = p;
    }

    const cleanVehicles = vehicles.map(({ allDeviceIds: _drop, ...rest }) => rest);

    return NextResponse.json({ ok: true, vehicles: cleanVehicles, positions, byDeviceId, byPlate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `808 同步異常: ${msg}`, vehicles: [], positions: [], byDeviceId: {}, byPlate: {} },
      { status: 500 },
    );
  }
}
