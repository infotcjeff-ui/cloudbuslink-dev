/**
 * lib/onefleet.ts — 808 GPS (OneFleet console.onefleet.hk) 前端封裝
 *
 * 文件依據: `808 GPS/Web Interface Documentation.html` + apiPage.js.download
 *   - 登入:  StandardApiAction_login.action?account={ac}&password={md5(pw)}
 *             -> { result: 0, jsession, account_name }
 *   - 車輛:  StandardApiAction_queryUserVehicle.action?jsession={js} [&language=zh]
 *             -> { result: 0, vehicles: [{ id, nm(車牌), dl:[{ id(devIdno), sim }] }], companys }
 *   - 定位:  StandardApiAction_getDeviceStatus.action?jsession={js}&devIdno={id,...}&toMap=1&language=zh
 *             -> { result: 0, status: [{ id, vid, lng, lat, mlng, mlat, sp(/10=km/h), ol(1=在線), gt, hx, ps }] }
 *   - 在線:  StandardApiAction_getDeviceOlStatus.action?jsession={js}&devIdno={id,...}
 *             -> { result: 0, onlines: [{ did, vid, online }] }
 *   - 實時錄像 (文件 id 410/411/802):
 *             H5 整合頁: <endpoint>/808gps/open/player/videoH5.html?lang=zh&devIdno=..&jsession=..&channel=N
 *             HLS 整合頁: <endpoint>/808gps/open/hls/index.html?lang=zh&devIdno=..&jsession=..&channel=N
 *             HLS 直播地址: http://<streamHost>:6604/hls/1_<devIdno>_<chn>_<stream>.m3u8?jsession=..
 *             (request_type = 1 video_設備號_通道號_碼流, 通道由 0 起, 碼流 0 主 1 子)
 *
 * 所有對 808 的請求一律走同源 `/api/onefleet` (server proxy),
 * 避免瀏覽器 CORS + 避免帳密進 bundle。帳密只存 localStorage (system-config)。
 */

import { resolveSystemConfig } from './system-config';

export interface OnefleetVehicle {
  /** 808 車輛 id */
  id: number | string;
  /** 車牌 = 本系統 plateNumber */
  plate: string;
  /** 設備號 = 本系統 gpsDeviceId */
  deviceId: string;
  sim: string | null;
  company: string | null;
}

export interface OnefleetPosition {
  deviceId: string;
  plate: string | null;
  latitude: number;
  longitude: number;
  /** km/h (808 sp / 10) */
  speed: number;
  /** 1 = 在線, 0 = 離線 */
  online: boolean;
  /** 808 上傳時間原文 (gt) */
  gpsTime: string | null;
  /** 方向 0-360 */
  direction: number | null;
  /** 808 解析地址 (ps) */
  address: string | null;
  raw: Record<string, unknown>;
}

export interface OnefleetSyncResult {
  ok: boolean;
  error?: string;
  vehicles: OnefleetVehicle[];
  positions: OnefleetPosition[];
  /** deviceId -> position */
  byDeviceId: Record<string, OnefleetPosition>;
  /** plate(大寫去空格) -> position */
  byPlate: Record<string, OnefleetPosition>;
}

/** 車牌正規化: 去空格轉大寫 (808 nm vs 本機 plateNumber 比對用) */
export function normPlate(p: string | null | undefined): string {
  return (p || '').toUpperCase().replace(/[\s-]/g, '');
}

function getCfg(): { endpoint: string; refreshSeconds: number } {
  try {
    const r = resolveSystemConfig();
    return {
      endpoint: r.gps.endpoint || 'https://console.onefleet.hk',
      refreshSeconds: r.gps.refreshSeconds || 10,
    };
  } catch {
    return { endpoint: 'https://console.onefleet.hk', refreshSeconds: 10 };
  }
}

async function postProxy<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/onefleet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `808 代理請求失敗 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * 一次拿回「車輛清單 + 全部即時定位」。
 * server 端一次做完 login → queryUserVehicle → getDeviceStatus, 前端只打一槍。
 */
export async function syncFrom808(opts?: {
  endpoint?: string;
}): Promise<OnefleetSyncResult> {
  const cfg = getCfg();
  const endpoint = (opts?.endpoint ?? cfg.endpoint).trim() || 'https://console.onefleet.hk';
  // 帳密不出前端: 一律由 server-only 密鑰登入, 前端只帶 endpoint。
  const data = await postProxy<OnefleetSyncResult>({
    action: 'sync',
    endpoint,
  });
  return data;
}

/** 只查定位 (已知 deviceIds) — 地圖輪詢用 (帳密不出前端, server 用 server-only 密鑰) */
export async function fetchPositionsFrom808(deviceIds: string[]): Promise<OnefleetSyncResult> {
  const cfg = getCfg();
  if (deviceIds.length === 0) {
    return { ok: true, vehicles: [], positions: [], byDeviceId: {}, byPlate: {} };
  }
  return postProxy<OnefleetSyncResult>({
    action: 'sync',
    endpoint: cfg.endpoint,
    onlyDeviceIds: deviceIds,
  });
}

export interface TrackPoint {
  latitude: number;
  longitude: number;
  gt: string | null;
  speed: number;
  direction: number | null;
}

/** 查過去 N 分鐘軌跡 (路線尾巴用) — server 經 queryTrackDetail 攞 (帳密不出前端) */
export async function fetchTrackFrom808(devIdno: string): Promise<{ ok: boolean; points: TrackPoint[]; error?: string }> {
  const cfg = getCfg();
  if (!devIdno) return { ok: false, points: [], error: '缺少設備號' };
  try {
    const data = await postProxy<{ ok: boolean; points: TrackPoint[]; error?: string }>({
      action: 'track',
      endpoint: cfg.endpoint,
      devIdno,
    });
    if (!data.ok) return { ok: false, points: [], error: (data as { error?: string }).error || '軌跡查詢失敗' };
    return { ok: true, points: (data.points || []) as TrackPoint[] };
  } catch (e) {
    return { ok: false, points: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── 實時錄像 session (808 文件 id 802 / 410 / 411) ─────────────────────────
 * H5 整合頁: <endpoint>/808gps/open/player/videoH5.html?lang=zh&devIdno=..&jsession=..&channel=N
 * HLS 整合頁: <endpoint>/808gps/open/hls/index.html?lang=zh&devIdno=..&jsession=..&channel=N
 * HLS 直播地址: http(s)://<streamHost>:6604/hls/1_<devIdno>_<chn>_<stream>.m3u8?jsession=..
 * (request_type = 1 video_設備號_通道號_碼流, 通道由 0 起: 0=ADAS 1=DSM 2=CH3 3=CH4, 碼流 0 主 1 子)
 * 帳密永不落前端 URL, 一律由 /api/onefleet 簽發 jsession。
 */

export interface OnefleetSession {
  ok: boolean;
  jsession?: string;
  endpoint?: string;
  error?: string;
}

/** 向 proxy 取一次性 jsession 給實時錄像播放頁用 (帳密不出前端) */
export async function request808Session(): Promise<OnefleetSession> {
  const cfg = getCfg();
  try {
    const data = await postProxy<{ ok: boolean; jsession?: string; endpoint?: string; error?: string }>({
      action: 'session',
      endpoint: cfg.endpoint,
    });
    if (!data.ok || !data.jsession) {
      return { ok: false, error: (data as { error?: string }).error || '808 會話簽發失敗' };
    }
    return { ok: true, jsession: data.jsession, endpoint: data.endpoint || cfg.endpoint };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 四路鏡頭定義: 通道號由 0 起 (見 lang open_device_chn_desc) */
export const BUS_VIDEO_CHANNELS = [
  { chn: 0, key: 'ADAS', label: 'ADAS', desc: '前向駕駛輔助' },
  { chn: 1, key: 'DSM', label: 'DSM', desc: '駕駛員行為監測' },
  { chn: 2, key: 'CH3', label: 'CH3', desc: '車廂鏡頭' },
  { chn: 3, key: 'CH4', label: 'CH4', desc: '車門 / 車尾鏡頭' },
  { chn: 4, key: 'CH5', label: 'CH5', desc: '擴展鏡頭' },
  { chn: 5, key: 'CH6', label: 'CH6', desc: '擴展鏡頭' },
  { chn: 6, key: 'CH7', label: 'CH7', desc: '擴展鏡頭' },
  { chn: 7, key: 'CH8', label: 'CH8', desc: '擴展鏡頭' },
] as const;

/** 組 H5 官方播放頁 URL (iframe 嵌入, 按播放鍵才載入) */
export function build808H5PlayerUrl(endpoint: string, devIdno: string, jsession: string, channel: number): string {
  const base = (endpoint || 'https://console.onefleet.hk').replace(/\/+$/, '');
  return `${base}/808gps/open/player/videoH5.html?lang=zh&devIdno=${encodeURIComponent(devIdno)}&jsession=${encodeURIComponent(jsession)}&channel=${channel}`;
}

/** 組 HLS 整合頁 URL (新視窗開啟用) */
export function build808HlsPageUrl(endpoint: string, devIdno: string, jsession: string, channel: number): string {
  const base = (endpoint || 'https://console.onefleet.hk').replace(/\/+$/, '');
  return `${base}/808gps/open/hls/index.html?lang=zh&devIdno=${encodeURIComponent(devIdno)}&jsession=${encodeURIComponent(jsession)}&channel=${channel}`;
}

/** 取本地 808 登入資料 (已廢棄: 帳密改為 server-only, 此函式不再回傳明文, 只保留 endpoint 供相容) */
export function get808Creds(): { account: string; password: string; endpoint: string } {
  const cfg = getCfg();
  return { account: '', password: '', endpoint: cfg.endpoint };
}

/** 簽發實時錄像 opaque token (server 內存記 jsession+devId, 前端只拿 token; 帳密不出前端) */
export async function requestVideoToken(plate: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!plate) return { ok: false, error: '缺少車牌' };
  try {
    const res = await fetch('/api/onefleet/hls-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok: boolean; token?: string; error?: string };
    if (!data.ok || !data.token) return { ok: false, error: data.error || '簽發失敗' };
    return { ok: true, token: data.token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 自建播放器播放地址 (同源代理, URL 只有 plate+chn+token, 無 device id / jsession) */
export function buildProxyHlsUrl(plate: string, chn: number, token: string, stream = 1): string {
  return `/api/onefleet/hls?plate=${encodeURIComponent(plate)}&chn=${chn}&stream=${stream}&token=${encodeURIComponent(token)}`;
}

/** FLV 直播播放地址 (同源代理, mpegts.js 用, 與參考站一致走 FLV-WS/MSE) */
export function buildProxyFlvUrl(plate: string, chn: number, token: string, stream = 1): string {
  return `/api/onefleet/flv?plate=${encodeURIComponent(plate)}&chn=${chn}&stream=${stream}&token=${encodeURIComponent(token)}`;
}
