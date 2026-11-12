'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import { createRoot, type Root } from 'react-dom/client';
import { osm } from '@versatiles/style';
import {
  Bus as BusIcon, Gauge, MapPin, Play, Maximize, Pause,
  Video, RefreshCw, Navigation, MousePointer2,
  User as UserIcon, Phone, CircleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QualitySwitch } from '@/components/shadcn-studio/switch/switch-09';
import { Card, CardContent } from '@/components/ui/card';
import { STORAGE } from '@/lib/storage';
import { useAuth } from '@/lib/hooks';
import { resolveSystemConfig } from '@/lib/system-config';
import {
  fetchPositionsFrom808, fetchTrackFrom808, requestVideoToken, buildProxyFlvUrl, buildProxyHlsUrl,
  BUS_VIDEO_CHANNELS,
} from '@/lib/onefleet';
import { reverseGeocodeZh } from '@/lib/reverse-geocode';
import type { Bus } from '@/lib/types';
import { BUS_MOTION_META, getBusMotion, type BusMotion } from '@/lib/bus-motion';
import { cn } from '@/lib/utils';

const TILE_BASE = 'https://tiles.versatiles.org';
const SINGLE_ZOOM = 16;
// 實時錄像自動停止: 開始播放後 3 分鐘自動斷流, 需手動重播 / 刷新頁面再看

function buildStyle(): unknown {
  return osm({ theme: 'colorful', urls: { base: TILE_BASE } });
}

function transformRequest(url: string, _t?: string): { url: string } {
  if (url.includes('tiles.versatiles.org')) return { url };
  if (url.startsWith('/')) return { url: TILE_BASE + url };
  try {
    const u = new URL(url);
    return { url: TILE_BASE + u.pathname + u.search };
  } catch {
    return { url: TILE_BASE + '/' + url };
  }
}

const hasCjk = (s: string | null | undefined): boolean =>
  !!s && /[\u4e00-\u9fff]/.test(s);

/* ── 單車跟車地圖 ───────────────────────────────────────────────
 * 只畫一架車, 每次定位更新自動置中 (跟隨模式, 用戶手動拖地圖可暫停跟隨)
 * Pin / 路線配色與主頁 BusMap 同一套 (lib/bus-motion 四態 + 箭頭/圓點): */

function isSingleRoundMotion(m: BusMotion): boolean {
  return m === 'stopped' || m === 'offline';
}

const SINGLE_ARROW_BASE_DEG = 45;
const SINGLE_MIN_MOVE_DEG = 0.00015;

function calcSingleBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat2 - lat1;
  const meanLatRad = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.cos(meanLatRad);
  if (dLat === 0 && dLng === 0) return -1;
  const theta = Math.atan2(dLng, dLat) * 180 / Math.PI;
  return (theta + 360) % 360;
}

function resolveSingleBearing(
  lat: number, lng: number, heading: number | null | undefined,
  speed: number, prev: { lat: number; lng: number } | undefined, prevBearing: number,
): number {
  if (typeof heading === 'number' && Number.isFinite(heading)) {
    const h = ((heading % 360) + 360) % 360;
    if (speed >= 1) return h;
    return prevBearing;
  }
  if (prev) {
    const dLat = lat - prev.lat;
    const meanLatRad = ((lat + prev.lat) / 2) * Math.PI / 180;
    const dLng = (lng - prev.lng) * Math.cos(meanLatRad);
    if (Math.hypot(dLng, dLat) < SINGLE_MIN_MOVE_DEG) return prevBearing;
    const b = calcSingleBearing(prev.lat, prev.lng, lat, lng);
    if (b >= 0) return b;
  }
  return prevBearing;
}

function SinglePinIcon({ motion, hex, rotationDeg }: { motion: BusMotion; hex: string; rotationDeg: number }) {
  if (isSingleRoundMotion(motion)) {
    return (
      <span
        style={{
          width: 22, height: 22, borderRadius: 9999, background: hex,
          border: '2.5px solid #fff',
          boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
        }}
      />
    );
  }
  return (
    <span
      style={{
        display: 'inline-block',
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: '50% 50%',
        transition: 'transform 300ms ease-out',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
      }}
    >
      <MousePointer2 size={24} strokeWidth={2} color="#fff" fill={hex} />
    </span>
  );
}

function SingleBusMap({ bus, address, trail }: {
  bus: Bus; address: string;
  trail: Array<{ latitude: number; longitude: number; gt: string | null; t: number }>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const markerRootRef = useRef<Root | null>(null);
  const prevFixRef = useRef<{ lat: number; lng: number } | undefined>(undefined);
  const prevBearingRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  followRef.current = follow;

  const loc = bus.currentLocation;
  const locRef = useRef(loc);
  locRef.current = loc;
  const addrRef = useRef(address);
  addrRef.current = address;
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // 初始化 (只跑一次, 之後靠定位 effect 更新)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: maplibregl.Map | null = null;
    try {
      const initLoc = locRef.current;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle() as any,
        center: initLoc ? [initLoc.longitude, initLoc.latitude] : [114.1694, 22.3193],
        zoom: initLoc ? SINGLE_ZOOM : 11,
        transformRequest: transformRequest as any,
        attributionControl: { compact: false, customAttribution: '© OpenStreetMap contributors' },
      });
    } catch (e) {
      setMapError('地圖初始化失敗,請重試');
      return;
    }
    mapRef.current = map;
    const markReady = () => {
      setReady(true);
      // 容器初掛時可能量度為 0, 強制重算避免灰格
      try { map?.resize(); } catch { /* noop */ }
    };
    map.on('load', markReady);
    map.on('idle', markReady);
    const t1 = setTimeout(() => { try { map?.resize(); } catch { /* noop */ } }, 250);
    const t2 = setTimeout(markReady, 3500);
    const onErr = (e: unknown) => {
      const msg = String((e as { error?: { message?: string } })?.error?.message || e || '');
      if (msg.includes('READ-usage')) return;
      console.warn('[SingleBusMap] map error:', msg);
    };
    (map as unknown as { on: (ev: string, fn: (e: unknown) => void) => void }).on('error', onErr);
    // 用戶手動拖地圖 → 暫停跟隨 (避免 easeTo 同用戶打架)
    const onDrag = () => setFollow(false);
    map.on('dragstart', onDrag);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      try { map.off('load', markReady); } catch { /* noop */ }
      try { map.off('idle', markReady); } catch { /* noop */ }
      try { map.off('dragstart', onDrag); } catch { /* noop */ }
      markerRef.current?.remove();
      markerRef.current = null;
      try { markerRootRef.current?.unmount(); } catch { /* noop */ }
      markerRootRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      try { map.remove(); } catch { /* noop */ }
      mapRef.current = null;
    };
  }, []);

  // 定位更新 → 移動 marker + 跟隨置中 (+ pin 頂完整地址 toolbox: 車牌 + 實時地址, 無時間)
  // Pin 樣式與主頁 BusMap 完全同套: 四態顏色 + 行駛/怠速箭頭跟方向, 靜止/離線圓點
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loc) return;
    const lngLat: [number, number] = [loc.longitude, loc.latitude];
    const motion: BusMotion = getBusMotion(bus);
    const hex = BUS_MOTION_META[motion].hex;
    const bearing = resolveSingleBearing(
      loc.latitude, loc.longitude, loc.heading, loc.speed ?? 0,
      prevFixRef.current, prevBearingRef.current,
    );
    prevFixRef.current = { lat: loc.latitude, lng: loc.longitude };
    prevBearingRef.current = bearing;
    const rotationDeg = SINGLE_ARROW_BASE_DEG + bearing;
    const meta = BUS_MOTION_META[motion];
    const bubble = () =>
      `<div style="max-width:240px;min-width:160px;font-size:12px;line-height:1.6;color:#111">` +
      `<div style="font-weight:700;font-size:12px;margin-bottom:2px;display:flex;align-items:center;gap:6px">` +
      `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${hex}"></span>` +
      `<span>${bus.plateNumber}</span>` +
      `<span style="font-weight:500;color:#666">${meta.label}</span></div>` +
      `<div style="word-break:break-all">${(addrRef.current || '地址解析中…').replace(/</g, '&lt;')}</div></div>`;
    if (!markerRef.current) {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', bus.plateNumber);
      el.className = 'bus-pin is-selected cursor-pointer bg-transparent border-0 p-0';
      (el as HTMLElement & { dataset: DOMStringMap }).dataset.motion = motion;
      const pulse = document.createElement('span');
      pulse.className = 'bus-pin-pulse';
      pulse.style.background = hex;
      el.appendChild(pulse);
      const inner = document.createElement('span');
      inner.className = 'bus-pin-inner';
      el.appendChild(inner);
      const root = createRoot(inner);
      root.render(<SinglePinIcon motion={motion} hex={hex} rotationDeg={rotationDeg} />);
      markerRootRef.current = root;
      popupRef.current = new maplibregl.Popup({
        offset: 28, closeButton: false, closeOnClick: false, anchor: 'bottom',
        className: 'single-bus-popup',
      }).setHTML(bubble());
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .setPopup(popupRef.current)
        .addTo(map);
      try { markerRef.current.togglePopup(); } catch { /* noop */ }
    } else {
      const el = markerRef.current.getElement() as HTMLElement;
      (el as HTMLElement & { dataset: DOMStringMap }).dataset.motion = motion;
      const pulse = el.querySelector('.bus-pin-pulse') as HTMLElement | null;
      if (pulse) pulse.style.background = hex;
      try { markerRootRef.current?.render(<SinglePinIcon motion={motion} hex={hex} rotationDeg={rotationDeg} />); } catch { /* noop */ }
      markerRef.current.setLngLat(lngLat);
      try { popupRef.current?.setHTML(bubble()); } catch { /* noop */ }
      // 跟隨置中時確保泡泡可見
      try {
        if (!markerRef.current.getPopup()?.isOpen()) markerRef.current.togglePopup();
      } catch { /* noop */ }
    }
    if (followRef.current) {
      try {
        map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), SINGLE_ZOOM - 1), duration: 800 });
      } catch { /* noop */ }
    }
  }, [loc?.latitude, loc?.longitude, loc?.speed, loc?.heading, bus.plateNumber, bus.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 地址反查完成後 → 只更新泡泡文字 (不重建 marker / 不動地圖, 無時間)
  useEffect(() => {
    const motion: BusMotion = getBusMotion(bus);
    const meta = BUS_MOTION_META[motion];
    const hex = meta.hex;
    try { popupRef.current?.setHTML(
      `<div style="max-width:240px;min-width:160px;font-size:12px;line-height:1.6;color:#111">` +
      `<div style="font-weight:700;font-size:12px;margin-bottom:2px;display:flex;align-items:center;gap:6px">` +
      `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${hex}"></span>` +
      `<span>${bus.plateNumber}</span>` +
      `<span style="font-weight:500;color:#666">${meta.label}</span></div>` +
      `<div style="word-break:break-all">${(address || '地址解析中…').replace(/</g, '&lt;')}</div></div>`,
    ); } catch { /* noop */ }
  }, [address, bus]); // eslint-disable-line react-hooks/exhaustive-deps

  // 路線尾巴: trail 按時間切兩段 — 配色與主頁四態同源 (怠速橙 / 靜止藍)
  // 10~5 分鐘前用怠速橙, 近 5 分鐘用靜止藍, 與 BUS_MOTION_META 保持一致
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try {
      const now = Date.now();
      const blue: number[][] = [];
      const orange: number[][] = [];
      for (const p of trail) {
        const age = now - p.t;
        if (age < 0 || age > 10 * 60 * 1000) continue;
        const coord = [p.longitude, p.latitude];
        if (age <= 5 * 60 * 1000) blue.push(coord);
        else orange.push(coord);
      }
      // 兩段線要駁得埋: 藍線頭部補返橙線尾點, 避免中間斷開
      if (blue.length > 0 && orange.length > 0) {
        blue.unshift(orange[orange.length - 1]);
      }
      const ensure = (id: string, color: string) => {
        if (!map.getSource(id)) {
          map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } } as never);
          map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.9 } } as never);
        }
      };
      ensure('trail-orange', BUS_MOTION_META.idle.hex);
      ensure('trail-blue', BUS_MOTION_META.stopped.hex);
      const setLine = (id: string, coords: number[][]) => {
        const src = map.getSource(id) as unknown as { setData: (d: unknown) => void } | undefined;
        const data = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.length >= 2 ? coords : [] } };
        try { src?.setData(data); } catch { /* noop */ }
      };
      setLine('trail-orange', orange);
      setLine('trail-blue', blue);
    } catch { /* noop */ }
  }, [trail, ready]);

  const recenter = useCallback(() => {
    const l = locRef.current;
    const map = mapRef.current;
    if (!l || !map) return;
    setFollow(true);
    try {
      map.flyTo({ center: [l.longitude, l.latitude], zoom: SINGLE_ZOOM, speed: 1.4 });
    } catch { /* noop */ }
  }, []);

  return (
    <div className="relative w-full h-[42dvh] min-h-[300px] bg-[#e8eef4] overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 bus-single-map" style={{ width: '100%', height: '100%' }} />
      {!ready && !mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-background/85 px-3 py-2 rounded-full shadow text-sm text-muted-foreground">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            地圖載入中…
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="bg-background/90 px-4 py-3 rounded-xl shadow text-sm text-muted-foreground flex items-center gap-2">
            <CircleAlert className="w-4 h-4 text-amber-500" />{mapError}
            <button onClick={() => window.location.reload()} className="ml-1 underline text-primary">重試</button>
          </div>
        </div>
      )}
      {/* 跟隨 / 還原按鈕 */}
      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-2">
        <button
          onClick={recenter}
          className={cn(
            'h-9 px-3 rounded-full shadow-lg text-xs font-medium flex items-center gap-1.5 active:scale-95 transition',
            follow ? 'bg-primary text-primary-foreground' : 'bg-background/95 text-foreground ring-1 ring-black/10',
          )}
        >
          <Navigation className="w-3.5 h-3.5" />
          {follow ? '跟隨中' : '置中跟隨'}
        </button>
      </div>
      {/* 路線尾巴圖例: 配色與主頁四態同源 (10 分鐘前怠速橙 / 近 5 分鐘靜止藍) */}
      <div className="absolute left-3 bottom-3 z-10 flex items-center gap-2.5 bg-background/90 backdrop-blur px-2.5 py-1.5 rounded-full shadow text-[10px] text-muted-foreground ring-1 ring-black/10">
        <span className="flex items-center gap-1"><span className="w-4 h-[3px] rounded-full inline-block" style={{ background: BUS_MOTION_META.idle.hex }} />10分鐘前</span>
        <span className="flex items-center gap-1"><span className="w-4 h-[3px] rounded-full inline-block" style={{ background: BUS_MOTION_META.stopped.hex }} />近5分鐘</span>
      </div>
      <style>{`.bus-single-map canvas{width:100%!important;height:100%!important;display:block}.single-bus-popup .maplibregl-popup-content{border-radius:12px;padding:8px 10px;box-shadow:0 6 20px rgba(0,0,0,.25)}.single-bus-popup .maplibregl-popup-tip{border-top-color:#fff}`}</style>
    </div>
  );
}

/* ── 自建單格播放器 (固定四路, FLV-WS + 同源代理) ──────────
 * - 地址僅含車牌、通道及不透明授權標記,畫面不顯示設備編號或密鑰
 * - 未播放不載入串流,按下播放建立播放器;停止即銷毀並斷開連線 */

function VideoTile({
  plate, label, desc, chn, stream = 1, token, tokenError, tokenLoading, onRetry, single,
}: {
  plate: string; label: string; desc: string; chn: number;
  stream?: number;
  token: string; tokenError: string; tokenLoading: boolean;
  onRetry: () => Promise<string | null>;
  single?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<{ destroy: () => void } | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef(-1);
  const lastAdvanceRef = useRef(0);
  // 實時錄像 3 分鐘自動停止 (省流量 / 設備連接數), 需手動重播或刷新頁面再看
  const AUTO_STOP_MS = 3 * 60 * 1000;
  const [autoStopped, setAutoStopped] = useState(false);
  const [remainSec, setRemainSec] = useState(180);
  const clearAutoStopTimers = () => {
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
  };
  const clearStallTimer = () => {
    if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
  };
  const clearAllTimers = () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null; }
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
    clearStallTimer();
    clearAutoStopTimers();
  };
  const stoppedRef = useRef(false);
  const hasFrameRef = useRef(false);
  const refreshingRef = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [playError, setPlayError] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  // 真係播緊 (timeupdate 有推進) 先顯示「播放中」, 唔係一有緩衝就當播緊
  const [actuallyPlaying, setActuallyPlaying] = useState(false);
  // 瀏覽器擋咗自動播放 (async 簽發搞到冇咗 user gesture) → 顯示「點擊繼續」而唔係假裝播緊
  const [playBlocked, setPlayBlocked] = useState(false);

  // 切車 / 換 token / 切畫質時重置自動播旗標, 免舊流殘留
  const autoStartRef = useRef(false);
  useEffect(() => {
    autoStartRef.current = false;
    hasFrameRef.current = false;
    return () => {
      try { playerRef.current?.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    };
  }, [plate, chn, stream]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    retryRef.current = 0;
    hasFrameRef.current = false;
    refreshingRef.current = false;
    lastTimeRef.current = -1;
    clearAllTimers();
    try { playerRef.current?.destroy(); } catch { /* noop */ }
    playerRef.current = null;
    const v = videoRef.current;
    if (v) {
      try { v.pause(); } catch { /* noop */ }
      v.removeAttribute('src');
      try { v.load(); } catch { /* noop */ }
    }
    setPlaying(false);
    setLoading(false);
    setHasFrame(false);
    setReconnecting(false);
    setActuallyPlaying(false);
    setPlayBlocked(false);
    setPlayError('');
    setAutoStopped(false);
    setRemainSec(180);
  }, []);

  // 3 分鐘到: 自動斷流 (不斷 token, 只停播放器), 需手動按播放 / 刷新頁面再看
  const autoStop = useCallback(() => {
    stoppedRef.current = true;
    retryRef.current = 0;
    hasFrameRef.current = false;
    refreshingRef.current = false;
    lastTimeRef.current = -1;
    clearAllTimers();
    try { playerRef.current?.destroy(); } catch { /* noop */ }
    playerRef.current = null;
    const v = videoRef.current;
    if (v) {
      try { v.pause(); } catch { /* noop */ }
      v.removeAttribute('src');
      try { v.load(); } catch { /* noop */ }
    }
    setPlaying(false);
    setLoading(false);
    setHasFrame(false);
    setReconnecting(false);
    setActuallyPlaying(false);
    setPlayBlocked(false);
    setPlayError('');
    setRemainSec(0);
    setAutoStopped(true);
  }, []);
  const autoStopRef = useRef(autoStop);
  autoStopRef.current = autoStop;

  const toggleFullscreen = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => { /* noop */ });
      } else {
        void (el.requestFullscreen?.() as Promise<void> | void);
      }
    } catch { /* noop */ }
  }, []);

  const start = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    stoppedRef.current = false;
    hasFrameRef.current = false;
    retryRef.current = 0;
    refreshingRef.current = false;
    lastTimeRef.current = -1;
    lastAdvanceRef.current = Date.now();
    clearAllTimers();
    setAutoStopped(false);
    setRemainSec(180);
    // 3 分鐘自動停止計時 (一按播放就開始算, 到時自動斷流)
    const startedAt = Date.now();
    if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = setTimeout(() => {
      autoStopRef.current();
    }, AUTO_STOP_MS);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((AUTO_STOP_MS - (Date.now() - startedAt)) / 1000));
      setRemainSec(left);
      if (left <= 0 && countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }, 1000);
    setPlaying(true);
    setLoading(true);
    setHasFrame(false);
    setReconnecting(false);
    setPlayBlocked(false);
    setActuallyPlaying(false);
    setPlayError('');

    // token 自救: 無 token 就即場簽, 唔係撳完無反應
    let tok = tokenRef.current;
    if (!tok) {
      try {
        const fresh = await onRetry();
        if (fresh) tok = fresh;
      } catch { /* noop */ }
      if (!tok) {
        setLoading(false);
        setPlayError('播放會話簽發失敗,請重試');
        return;
      }
    }

    const buildFlvUrl = (t: string) => buildProxyFlvUrl(plate, chn, t, stream);
    const buildHlsUrl = (t: string) => buildProxyHlsUrl(plate, chn, t, stream);

    const fail = (msg: string) => {
      if (stoppedRef.current) return;
      clearAllTimers();
      setLoading(false);
      setReconnecting(false);
      setActuallyPlaying(false);
      setPlayError(msg);
      try { playerRef.current?.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    };

    try {
      const mpegts = (await import('mpegts.js')).default;
      if (stoppedRef.current) return;
      if (mpegts.isSupported()) {
        try { playerRef.current?.destroy(); } catch { /* noop */ }
        // 與參考站一致：FLV over HTTP + MSE，video 最終呈現 blob: 地址
        // 注意：不強制 hasAudio（808 子碼流多數只有視頻，無音頻，強制聲道會觸發解封裝錯誤）
        const flvUrl = buildFlvUrl(tok);
        const player = mpegts.createPlayer(
          { type: 'flv', isLive: true, url: flvUrl, cors: true },
          {
            // Next.js 下 transmuxing worker 會經 Worker 拋未捕獲 error 導致整頁白屏
            // （截圖裡 s.emit / _onWorkerMessage 那串），主線程解封裝最穩
            enableWorker: false,
            enableStashBuffer: false,
            lazyLoad: false,
            deferLoadAfterSourceOpen: false,
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 1.5,
            liveBufferLatencyMinRemain: 0.5,
            autoCleanupSourceBuffer: true,
          },
        );
        const flv = player as unknown as {
          unload: () => void; load: () => void; play: () => void; pause: () => void; destroy: () => void;
          attachMediaElement: (m: HTMLMediaElement) => void;
          detachMediaElement: () => void;
          on: (ev: string, cb: (...a: never[]) => void) => void;
        };
        try {
          flv.attachMediaElement(v);
        } catch { /* noop */ }
        playerRef.current = flv as unknown as { destroy: () => void };
        const tryPlay = (why: string) => {
          const vv = videoRef.current;
          if (!vv || stoppedRef.current) return;
          try { vv.muted = true; } catch { /* noop */ }
          const p = vv.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              if (!stoppedRef.current) { setPlayBlocked(false); setActuallyPlaying(true); }
            }).catch(() => {
              // 瀏覽器擋咗自動播放 (async 簽發搞到冇咗 user gesture) → 顯示「點擊繼續」而唔係假裝播放緊
              if (!stoppedRef.current) {
                setPlayBlocked(true);
                setLoading(false);
              }
              console.warn(`[VideoTile CH${chn + 1}] play blocked (${why})`);
            });
          }
        };
        const markFrame = () => {
          if (stoppedRef.current) return;
          hasFrameRef.current = true;
          retryRef.current = 0;
          setHasFrame(true);
          setLoading(false);
          setReconnecting(false);
          lastAdvanceRef.current = Date.now();
          if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
          // 有幀唔等於播緊: 補一腳 play, 唔係就會停喺第一格假播
          tryPlay('buffered');
        };
        // 載入看門狗: 20s 仲未有畫面就報錯收手, 唔無限 reload (token 重簽只留畀 401 handler 做一次)
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
        loadTimerRef.current = setTimeout(() => {
          if (stoppedRef.current || hasFrameRef.current) return;
          fail('串流載入逾時,請重試');
        }, 20000);
        // 嚴重錯誤先至重試: 最多 3 次、每次隔 3s, 唔再每次 waiting 都 startLoad (之前係不停 reload 同一分片嘅元兇)
        const scheduleRetry = (msg: string) => {
          if (stoppedRef.current) return;
          const n = ++retryRef.current;
          if (n > 3) {
            fail('串流載入失敗,請重試');
            return;
          }
          try {
            const vv = videoRef.current;
            if (vv && vv.readyState >= 2) { hasFrameRef.current = true; setHasFrame(true); }
          } catch { /* noop */ }
          if (hasFrameRef.current) setReconnecting(true);
          setLoading(false);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (stoppedRef.current) return;
            try { flv.unload(); flv.load(); } catch { /* noop */ }
          }, 3000);
          console.warn(`[VideoTile CH${chn + 1}] ${msg}, auto-retry #${n}`);
        };
        try {
          flv.load();
        } catch {
          scheduleRetry('load 異常');
          return;
        }
        try {
          const pr = flv.play() as unknown as Promise<void> | void;
          if (pr && typeof (pr as Promise<void>).catch === 'function') {
            (pr as Promise<void>).catch(() => { /* 由 tryPlay 補 */ });
          }
        } catch { /* 由 tryPlay 補 */ }
        tryPlay('flv-load');
        // 與參考站一致：MSE 收齊初始化片段即有畫面（對應訊息 Received Initialization Segment）
        flv.on(mpegts.Events.MEDIA_INFO, () => {
          markFrame();
        });
        flv.on(mpegts.Events.METADATA_ARRIVED, () => {
          markFrame();
        });
        // 授權失效或串流中斷：未出畫面前重簽權杖並重建播放器，其餘按次重試
        flv.on(mpegts.Events.ERROR, (errType: unknown, errDetail: unknown) => {
          if (stoppedRef.current) return;
          try {
            const rawD = (errDetail ?? '') as { msg?: unknown; message?: unknown; code?: unknown } | string | number;
            const detail = String(
              typeof rawD === 'object' && rawD !== null ? ((rawD.msg ?? rawD.message ?? rawD.code ?? '') as unknown) : rawD,
            ) || String(errType || '');
            const unauth = /401|403|token|jsession|expired|unauthorized|session/i.test(`${errType || ''} ${detail}`);
            const shouldRefresh = !hasFrameRef.current && !refreshingRef.current && (unauth || retryRef.current === 0);
            if (shouldRefresh) {
              refreshingRef.current = true;
              void onRetry().then((fresh) => {
                refreshingRef.current = false;
                if (stoppedRef.current) return;
                if (fresh) {
                  retryRef.current = 0;
                  try { flv.unload(); } catch { /* noop */ }
                  try { flv.destroy(); } catch { /* noop */ }
                  try {
                    const np = mpegts.createPlayer(
                      { type: 'flv', isLive: true, url: buildFlvUrl(fresh), cors: true },
                      { enableWorker: false, enableStashBuffer: false, lazyLoad: false, deferLoadAfterSourceOpen: false, liveBufferLatencyChasing: true, autoCleanupSourceBuffer: true },
                    );
                    const npAny = np as unknown as { attachMediaElement: (m: HTMLMediaElement) => void; load: () => void; play: () => void; destroy: () => void; on: (ev: string, cb: (...a: never[]) => void) => void };
                    try { npAny.attachMediaElement(v); } catch { /* noop */ }
                    try { npAny.load(); } catch { /* noop */ }
                    try { npAny.play(); } catch { /* noop */ }
                    playerRef.current = np as unknown as { destroy: () => void };
                  } catch { /* noop */ }
                } else {
                  fail('播放會話已過期,請重試');
                }
              }).catch(() => {
                refreshingRef.current = false;
                if (!hasFrameRef.current) fail('播放會話已過期,請重試');
              });
              return;
            }
            scheduleRetry(`flv ${detail || errType}`);
          } catch { /* noop */ }
        });
        let lastT = -1;
        const onPlaying = () => {
          setActuallyPlaying(true);
          setPlayBlocked(false);
          lastAdvanceRef.current = Date.now();
          markFrame();
        };
        const onPause = () => {
          // 被瀏覽器暫停 / 用戶暫停都唔好假裝「播放中」
          if (stoppedRef.current) return;
          setActuallyPlaying(false);
        };
        const onCanPlay = () => { if (!stoppedRef.current && v.readyState >= 2) markFrame(); };
        const onTimeUpdate = () => {
          try {
            const t = v.currentTime;
            if (t > 0 && t !== lastT) {
              lastT = t;
              lastTimeRef.current = t;
              lastAdvanceRef.current = Date.now();
              setActuallyPlaying(true);
              setPlayBlocked(false);
              if (!hasFrameRef.current) markFrame();
              else {
                // 有推進就唔係 stall, 熄咗個 reconnect pill
                setReconnecting(false);
                setLoading(false);
              }
              if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null; }
            }
          } catch { /* noop */ }
        };
        // 真 stall 判斷: currentTime 4 秒都冇郁 + 未暫停, 先至算訊號問題 (唔係有 waiting event 就話重連)
        clearStallTimer();
        stallTimerRef.current = setInterval(() => {
          if (stoppedRef.current || !hasFrameRef.current) return;
          try {
            const t = v.currentTime;
            if (t !== lastTimeRef.current) {
              lastTimeRef.current = t;
              lastAdvanceRef.current = Date.now();
              setReconnecting(false);
              if (t > 0) setActuallyPlaying(true);
              return;
            }
            const frozenMs = Date.now() - lastAdvanceRef.current;
            if (!v.paused && !v.ended && v.readyState >= 2 && frozenMs > 4000) {
              setActuallyPlaying(false);
              setReconnecting(true);
              // 真係卡死先重建連線，唔係每秒拉同一分片造成閃爍
              try { flv.unload(); flv.load(); } catch { /* noop */ }
              lastAdvanceRef.current = Date.now();
            } else if (v.paused) {
              setActuallyPlaying(false);
              setReconnecting(false);
            }
          } catch { /* noop */ }
        }, 1000);
        // waiting 只係提示, 唔主動 startLoad (等上面 stall timer 先至郁手, 避免重複拉同一分片造成閃爍同慢)
        const onWaiting = () => {
          if (stoppedRef.current || !hasFrameRef.current) return;
          if (waitingTimerRef.current) return;
          waitingTimerRef.current = setTimeout(() => {
            waitingTimerRef.current = null;
            if (stoppedRef.current || !hasFrameRef.current) return;
            try {
              // paused 唔算 stall (多數係被擋 autoplay), 唔好顯示重連中誤導
              if (!v.paused && Date.now() - lastAdvanceRef.current > 4000) setReconnecting(true);
            } catch { /* noop */ }
          }, 2500);
        };
        // 畫面被撳停 / autoplay 被擋, 撳畫面任何位都補 play (唔靠原生 controls)
        const onClickResume = () => {
          if (stoppedRef.current) return;
          tryPlay('tap-resume');
        };
        v.addEventListener('playing', onPlaying);
        v.addEventListener('pause', onPause);
        v.addEventListener('timeupdate', onTimeUpdate);
        v.addEventListener('canplay', onCanPlay);
        v.addEventListener('waiting', onWaiting);
        v.addEventListener('click', onClickResume);
        const origDestroy = flv.destroy.bind(flv);
        (playerRef.current as unknown as { destroy: () => void }).destroy = () => {
          try { v.removeEventListener('playing', onPlaying); } catch { /* noop */ }
          try { v.removeEventListener('pause', onPause); } catch { /* noop */ }
          try { v.removeEventListener('timeupdate', onTimeUpdate); } catch { /* noop */ }
          try { v.removeEventListener('canplay', onCanPlay); } catch { /* noop */ }
          try { v.removeEventListener('waiting', onWaiting); } catch { /* noop */ }
          try { v.removeEventListener('click', onClickResume); } catch { /* noop */ }
          clearAllTimers();
          origDestroy();
        };
        return;
      }
      // MSE 不可用時的後備方案（例如 iOS Safari）：以原生 HLS 播放，同樣僅攜帶不透明授權標記
      v.src = buildHlsUrl(tok);
      try { v.muted = true; } catch { /* noop */ }
      const onNativePlay = () => {
        if (stoppedRef.current) return;
        hasFrameRef.current = true;
        retryRef.current = 0;
        lastAdvanceRef.current = Date.now();
        setHasFrame(true);
        setActuallyPlaying(true);
        setPlayBlocked(false);
        setLoading(false);
        setReconnecting(false);
      };
      v.addEventListener('playing', onNativePlay, { once: true });
      try {
        await v.play();
      } catch {
        // 被擋 autoplay → 顯示「點擊繼續」, 唔係假播
        if (!stoppedRef.current) { setPlayBlocked(true); setLoading(false); }
      }
      setTimeout(() => {
        if (stoppedRef.current) return;
        // 已暂停就不算有画面在播,免得又出现假播放
        try {
          if (v.readyState >= 2 && !v.paused) onNativePlay();
        } catch { /* noop */ }
      }, 2500);
    } catch (e) {
      setLoading(false);
      setReconnecting(false);
      setPlayError(e instanceof Error ? e.message : '播放失敗,請重試');
    }
  }, [plate, chn, stream, onRetry, single]);

  // 點 CH 即播: 掛載後 token 就緒就自動 start (不再等手動按格內播放鍵)
  useEffect(() => {
    if (autoStartRef.current || playing) return;
    if (!token || tokenLoading || tokenError) return;
    autoStartRef.current = true;
    void start();
  }, [token, tokenLoading, tokenError, playing, start]);

  useEffect(() => () => {
    stoppedRef.current = true;
    clearAllTimers();
    try { playerRef.current?.destroy(); } catch { /* noop */ }
    playerRef.current = null;
  }, []);

  const showBuffering = playing && !hasFrame && !playError;
  const showStallPill = playing && hasFrame && reconnecting && !playError;

  return (
    <div ref={tileRef} className="relative overflow-hidden bg-black aspect-video flex flex-col">
      {/* 頂欄: 通道名 + 3 分鐘倒數 (無任何 device id) */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <span className="text-[11px] font-semibold text-white flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', playing && !playError ? 'bg-red-500 animate-pulse' : 'bg-white/50')} />
          CH{chn + 1} {label.startsWith('CH') ? desc : `${label}鏡頭`}
        </span>
        {playing && !playError && (
          <span className="text-[10px] tabular-nums text-white/85 bg-black/50 px-2 py-0.5 rounded-full">
            {Math.floor(remainSec / 60)}:{String(remainSec % 60).padStart(2, '0')} 後自動停止
          </span>
        )}
      </div>

      {/* 畫面本體: 自建播放器, 永不顯示原生 controls (唔好畀背後播放掣干擾) */}
      <video
        ref={videoRef}
        className={cn('absolute inset-0 w-full h-full bg-black object-cover', !hasFrame && 'invisible')}
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        muted
        playsInline
        preload="none"
      />
      {!playing && (
        <button
          onClick={start}
          disabled={tokenLoading}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 text-white active:scale-[.99] transition disabled:opacity-60 bg-black"
        >
          <span className="w-14 h-14 rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur flex items-center justify-center">
            <Play className="w-6 h-6 fill-white text-white ml-0.5" />
          </span>
          <span className="text-xs text-white/80">
            {autoStopped
              ? `CH${chn + 1} 已播放 3 分鐘並自動停止`
              : tokenError ? '播放會話簽發失敗' : !token ? '正在簽發播放會話…' : `播放 CH${chn + 1}實時畫面`}
          </span>
          {autoStopped && (
            <span className="text-[11px] text-white/60">按播放繼續，或刷新頁面重播</span>
          )}
          {tokenError && <span className="text-[11px] text-red-300 max-w-[90%] truncate">{tokenError}</span>}
        </button>
      )}
      {/* 未出畫面: 圓形 pulsing + BUFFERING (含被擋 autoplay, 唔再顯示播放鍵) */}
      {showBuffering && (
        <button
          onClick={() => {
            if (!playBlocked) return;
            const vv = videoRef.current;
            if (!vv) return;
            try { vv.muted = true; } catch { /* noop */ }
            vv.play().then(() => {
              setPlayBlocked(false);
              setActuallyPlaying(true);
            }).catch(() => { /* 仍然被擋就繼續顯示 BUFFERING 等再撳 */ });
          }}
          className={cn(
            'absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black text-white',
            !playBlocked && 'pointer-events-none',
          )}
        >
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/20 animate-ping" />
            <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur">
              <span className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            </span>
          </span>
          <span className="text-xs tracking-[0.25em] text-white/90">BUFFERING</span>
        </button>
      )}
      {/* 有畫面後嘅輕微卡頓: 只顯示細 pill, 唔遮成個屏 (防閃爍) */}
      {showStallPill && (
        <div className="absolute top-8 left-0 right-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full text-white text-[11px]">
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            訊號不穩,重新連接中…
          </div>
        </div>
      )}
      {playing && playError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 p-3 text-center">
          <p className="text-xs text-white/85">{playError}</p>
          <button
            onClick={() => { stop(); start(); }}
            className="h-8 px-3 rounded-full bg-white/15 text-white text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 重試
          </button>
        </div>
      )}

      {/* 右下控制: 播放/暫停 + 全螢幕 (有畫面先顯示, 唔穿透) */}
      {playing && hasFrame && !playError && (
        <div className="absolute bottom-0 right-0 z-10 flex items-center gap-1.5 px-2 py-1.5 pointer-events-none">
          <button
            onClick={stop}
            aria-label={actuallyPlaying ? '暫停' : '播放'}
            className="pointer-events-auto h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur active:scale-95 transition"
          >
            {actuallyPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>
          <button
            onClick={toggleFullscreen}
            aria-label="全螢幕"
            className="pointer-events-auto h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur active:scale-95 transition"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 未播放時右下都留全螢幕掣 */}
      {!playing && (
        <div className="absolute bottom-0 right-0 z-10 flex items-center px-2 py-1.5 pointer-events-none">
          <button
            onClick={toggleFullscreen}
            aria-label="全螢幕"
            className="pointer-events-auto h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur active:scale-95 transition"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!playing && tokenError && !token && (
        <button
          onClick={onRetry}
          className="absolute bottom-2 right-2 z-10 h-7 px-2.5 rounded-full bg-white/15 text-white text-[11px] flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> 重試簽發
        </button>
      )}
    </div>
  );
}

/* ── 主頁 ─────────────────────────────────────────────────────── */

export default function BusDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const busId = params.id as string;

  const [bus, setBus] = useState<Bus | null>(null);
  // 自由選格: 預設未選, CH1~CH8 任選, 最多同時 4 格
  const [selectedChns, setSelectedChns] = useState<number[]>([]);
  const chns = selectedChns;
  // 畫質: 標清 stream=1 (預設, 流量低) / 高清 stream=0
  const [quality, setQuality] = useState<'sd' | 'hd'>('sd');
  const [hdConfirmOpen, setHdConfirmOpen] = useState(false);
  const handleQualityChange = (q: 'sd' | 'hd') => {
    // 標清 -> 高清需置中確認 (高流量提示); 高清 -> 標清直接切
    if (q === 'hd' && quality !== 'hd') {
      setHdConfirmOpen(true);
      return;
    }
    setQuality(q);
  };
  const stream = quality === 'hd' ? 0 : 1;
  const [trail, setTrail] = useState<Array<{ latitude: number; longitude: number; gt: string | null; t: number }>>([]);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [zhAddr, setZhAddr] = useState<string | null>(null);

  // 載入校巴本體
  useEffect(() => {
    if (!busId) return;
    const found = STORAGE.buses.getById(busId);
    setBus(found ?? null);
    // GPS 查看打點 (System Admin 概覽用)
    if (found) {
      try {
        const raw = localStorage.getItem('cbl_auth');
        const u = raw ? JSON.parse(raw) : null;
        import('@/lib/admin-telemetry').then((m) => {
          m.logGpsView(u ? { id: u.id, name: u.name } : null, { deviceId: found.gpsDeviceId, plate: found.plateNumber });
        }).catch(() => {});
      } catch { /* ignore */ }
    }
  }, [busId]);

  // 808 定位輪詢 (只追呢架車) + 積累路線尾巴 (近 10 分鐘)
  useEffect(() => {
    if (!user || !bus) return;
    const devId = bus.gpsDeviceId;
    if (!devId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 初次拉 808 軌跡做底 (過去 15 分鐘), 無都唔怕, 輪詢會慢慢累
    fetchTrackFrom808(devId).then((r) => {
      if (cancelled || !r.ok) return;
      const now = Date.now();
      const pts = r.points
        .map((p) => ({ latitude: p.latitude, longitude: p.longitude, gt: p.gt, t: p.gt ? Date.parse(p.gt.replace(' ', 'T')) || now : now }))
        .filter((p) => Number.isFinite(p.t) && now - p.t <= 10 * 60 * 1000 && now - p.t >= -60000);
      if (pts.length > 0) {
        setTrail((prev) => {
          const merged = [...prev, ...pts].sort((a, b) => a.t - b.t);
          return merged.slice(-300);
        });
      }
    }).catch(() => { /* 軌跡拉唔到就靠輪詢累 */ });
    const poll = async () => {
      if (cancelled) return;
      try {
        if (document.visibilityState === 'visible') {
          const res = await fetchPositionsFrom808([devId]);
          if (!cancelled && res.ok) {
            const pos = res.byDeviceId[devId]
              ?? (bus.plateNumber ? res.byPlate[bus.plateNumber.toUpperCase().replace(/[\s-]/g, '')] : undefined);
            if (pos) {
              const loc: NonNullable<Bus['currentLocation']> = {
                latitude: pos.latitude,
                longitude: pos.longitude,
                speed: pos.speed,
                lastUpdated: new Date().toISOString(),
                address: pos.address,
                gpsTime: pos.gpsTime,
                online: pos.online,
                heading: pos.direction,
              };
              try { STORAGE.buses.update(bus.id, { currentLocation: loc }); } catch { /* noop */ }
              setBus((prev) => (prev ? { ...prev, currentLocation: loc } : prev));
              // 尾巴加一點 (去重 + 只留 10 分鐘 + 上限 300 點)
              const t = pos.gpsTime ? Date.parse(pos.gpsTime.replace(' ', 'T')) || Date.now() : Date.now();
              setTrail((prev) => {
                const last = prev[prev.length - 1];
                if (last && Math.abs(last.latitude - pos.latitude) < 1e-7 && Math.abs(last.longitude - pos.longitude) < 1e-7) return prev;
                const next = [...prev, { latitude: pos.latitude, longitude: pos.longitude, gt: pos.gpsTime, t }];
                const cutoff = Date.now() - 10 * 60 * 1000;
                return next.filter((p) => p.t >= cutoff).slice(-300);
              });
            }
          }
        }
      } catch (e) {
        console.warn('[BusDetail] 808 輪詢失敗:', e);
      }
      const ms = Math.max(5, resolveSystemConfig().gps.refreshSeconds || 10) * 1000;
      timer = setTimeout(poll, ms);
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [user, bus?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 簽發播放 token (opaque, server 內記 jsession+devId, 前端無敏感資料)
  const issueToken = useCallback(async (): Promise<string | null> => {
    if (!bus?.plateNumber) return null;
    setTokenLoading(true);
    setTokenError('');
    const r = await requestVideoToken(bus.plateNumber);
    setTokenLoading(false);
    if (r.ok && r.token) {
      setToken(r.token);
      return r.token;
    }
    setTokenError(r.error || '簽發失敗');
    return null;
  }, [bus?.plateNumber]);

  // token 過期自救: VideoTile 回報 401 時重簽 (每格獨立觸發, 防抖 5s 內只簽一次)
  const lastRefreshRef = useRef(0);
  const refreshToken = useCallback(async (): Promise<string | null> => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 5000 && token) return token;
    lastRefreshRef.current = now;
    return issueToken();
  }, [issueToken, token]);

  useEffect(() => {
    if (bus?.plateNumber && !token && !tokenLoading && !tokenError) {
      issueToken();
    }
  }, [bus?.plateNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // 中文地址: 一律以 808 ps 原文為準; 無中文先用反查兜底 (永不顯示座標)
  const loc = bus?.currentLocation;
  const raw808 = (loc?.address || '').trim();
  useEffect(() => {
    if (!loc || hasCjk(raw808)) {
      setZhAddr(null);
      return;
    }
    let cancelled = false;
    setZhAddr(null);
    reverseGeocodeZh(loc.latitude, loc.longitude).then((s) => {
      if (!cancelled && s) setZhAddr(s);
    });
    return () => { cancelled = true; };
  }, [loc?.latitude, loc?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayAddr = useMemo(() => {
    if (!loc) return '808 暫無定位';
    if (hasCjk(raw808)) return raw808;
    return zhAddr || '地址解析中…';
  }, [loc, raw808, zhAddr]);

  if (!bus) {
    return (
      <div className="px-4 py-10 text-center text-muted-foreground text-sm">
        載入校巴資料中… (若長期空白, 請返回主頁重試)
      </div>
    );
  }

  const driver = bus.driverId ? STORAGE.drivers.getById(bus.driverId) : null;
  const nannyCount = STORAGE.nannies.getAll().filter((n) => (n.assignedBusIds || []).includes(bus.id)).length;

  return (
    <div className="pb-24 -mx-0">
      {/* 頂欄 (返回鍵由全局 header 提供, 這裡只顯示標題) */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base leading-tight truncate">{bus.plateNumber}</h1>
          <p className="text-[11px] text-muted-foreground truncate">{bus.model} · {bus.capacity}座</p>
        </div>
      </div>

      {/* ── Section 1: 跟車地圖 ── */}
      <section className="px-4">
        <Card className="overflow-hidden">
          <SingleBusMap bus={bus} address={displayAddr} trail={trail} />
          <CardContent className="p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="p-2.5 bg-muted/30 rounded-xl min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
                  <MapPin className="w-3.5 h-3.5" /><span>位置 (808 GPS)</span>
                </div>
                <p className="text-sm font-medium leading-snug mb-1 break-words">{displayAddr}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {loc?.gpsTime ? `808 GPS 更新於 ${loc.gpsTime.slice(0, 16).replace('T', ' ')}` : '離線或未上線'}
                  {loc?.online === false ? ' (設備離線)' : ''}
                </p>
              </div>
              <div className="p-2.5 bg-muted/30 rounded-xl w-[88px] shrink-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
                  <Gauge className="w-3.5 h-3.5" /><span>速度</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  {loc ? (
                    <><span className="text-lg font-bold tabular-nums">{loc.speed}</span>
                      <span className="text-[11px] text-muted-foreground">km/h</span></>
                  ) : (<span className="text-lg font-bold text-muted-foreground/40">—</span>)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Section 2: 實時錄像 (自建 hardcode 四路播放器) ── */}
      <section className="px-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <Video className="w-4 h-4 text-primary" /> 實時錄像
          </h2>
          {/* 畫質切換 switch-09: 標清 stream=1 / 高清 stream=0, 真實切換串流 */}
          <QualitySwitch value={quality} onChange={handleQualityChange} />
        </div>
        <ConfirmDialog
          open={hdConfirmOpen}
          onOpenChange={setHdConfirmOpen}
          title="切換到高清？"
          description="高清模式將產生較高流量使用"
          confirmLabel="切換高清"
          cancelLabel="取消"
          onConfirm={() => {
            setQuality('hd');
            setHdConfirmOpen(false);
          }}
        />

        {!bus.gpsDeviceId ? (
          <Card><CardContent className="p-4 flex items-start gap-2 text-sm text-muted-foreground">
            <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
            此校巴未綁定 808 設備, 請到後台校巴管理綁定後再播放實時錄像。
          </CardContent></Card>
        ) : (
          <>
            {chns.length === 0 ? (
              <div className="rounded-[10px] bg-black aspect-video flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                <p className="text-sm text-white font-medium">請選擇頻道以觀看</p>
                <p className="text-[11px] text-white/70">從下方按鈕選擇 CH1 ~ CH8（最多同時 4 個）</p>
                <p className="text-[11px] text-white/70">高清模式將產生較高流量使用</p>
              </div>
            ) : (
            <div className={chns.length === 1 ? 'grid grid-cols-1 gap-0 max-w-[560px] rounded-[10px] overflow-hidden bg-black' : 'grid grid-cols-2 gap-0 rounded-[10px] overflow-hidden bg-black'}>
              {chns.map((chn) => {
                const meta = BUS_VIDEO_CHANNELS.find((c) => c.chn === chn)!;
                return (
                  <VideoTile
                    key={`${chn}-${stream}`}
                    single={chns.length === 1}
                    plate={bus.plateNumber}
                    label={meta.label}
                    desc={meta.desc}
                    chn={chn}
                    stream={stream}
                    token={token}
                    tokenError={tokenError}
                    tokenLoading={tokenLoading}
                    onRetry={refreshToken}
                  />
                );
              })}
            </div>
            )}
            {/* CH 選台: 錄像格下, 兩行, 一行 4 個 */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {BUS_VIDEO_CHANNELS.map((c) => {
                const active = selectedChns.includes(c.chn);
                return (
                  <button
                    key={c.chn}
                    onClick={() => {
                      setSelectedChns((prev) => {
                        if (prev.includes(c.chn)) {
                          return prev.filter((x) => x !== c.chn);
                        }
                        if (prev.length >= 4) return prev;
                        return [...prev, c.chn].sort((a, b) => a - b);
                      });
                    }}
                    className={cn(
                      'h-7 w-full rounded-full text-[11px] font-medium ring-1 transition active:scale-95',
                      active
                        ? 'bg-primary text-primary-foreground ring-primary'
                        : 'bg-muted text-muted-foreground ring-black/10',
                    )}
                  >
                    {`CH${c.chn + 1}`}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Section 3: 車輛資料 (不顯示設備號原文) ── */}
      <section className="px-4 mt-4 space-y-2.5">
        <h2 className="font-bold text-sm flex items-center gap-1.5">
          <BusIcon className="w-4 h-4 text-primary" /> 車輛資料
        </h2>
        <Card>
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BusIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold">{bus.plateNumber}</p>
                <p className="text-xs text-muted-foreground">{bus.model} · {bus.capacity}座</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/30 rounded-xl p-2.5">
                <p className="text-muted-foreground mb-0.5 flex items-center gap-1"><UserIcon className="w-3 h-3" />司機</p>
                <p className="font-medium truncate">{driver?.name || '未指派'}</p>
                {driver?.phone && <p className="text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{driver.phone}</p>}
              </div>
              <div className="bg-muted/30 rounded-xl p-2.5">
                <p className="text-muted-foreground mb-0.5">跟車保姆</p>
                <p className="font-medium">{nannyCount ? `${nannyCount} 人` : '未指派'}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-2.5 col-span-2">
                <p className="text-muted-foreground mb-0.5">808 設備狀態</p>
                <p className="font-medium">{bus.gpsDeviceId ? `已綁定${loc?.online === false ? ' (設備離線)' : ''}` : '未綁定'}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/trips?busId=${bus.id}`)}
            >
              查看此車班次
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
