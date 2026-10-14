'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { osm } from '@versatiles/style';
import { MousePointer2 } from 'lucide-react';
import type { Bus } from '@/lib/types';

const HK_CENTER: [number, number] = [114.1694, 22.3193];
const DEFAULT_ZOOM = 11;      // 地圖初始 zoom，也是「還原視野」預設值
const FOCUS_ZOOM = 14;        // 選中校巴時 zoom 到的層級
const TILE_BASE = 'https://tiles.versatiles.org';
const MARKER_MOVE_DURATION = 200; // ms — marker 平滑移動動畫時長

// VersaTiles Colorful 樣式 — 完全免費、無需 API key、基於 OpenStreetMap
// 用 @versatiles/style 套件產 style 物件, 跳過遠端 fetch style.json
// 來源: https://versatiles.org
//
// 注: 返回型別是 @versatiles/style 內部的 StyleSpecification (基於
// @maplibre/maplibre-gl-style-spec), 與 maplibre-gl 內建的型別是 nominal
// 不相容但執行期完全相同。cast 成 unknown 跳過 TS nominal check。
//
// urls.base 是必要: 套件內部用 new URL(relative, base) 解析,
// 預設 base 是 window.location.origin (在 dev 是 localhost:3000),
// 會把 sprite / glyphs / TileJSON 全部誤指到 dev server, 導致 404。
function buildStyle(): unknown {
  return osm({
    theme: 'colorful',
    urls: { base: TILE_BASE },
  });
}

// MapLibre 拿到的 tile URL 經過 transformRequest 我們做一件事:
// 強制把 base 重指到 tiles.versatiles.org (即使風格內寫成 localhost 也照換)
function transformRequest(url: string, _resourceType?: string): { url: string } {
  if (url.includes('tiles.versatiles.org')) return { url };
  if (url.startsWith('/')) return { url: TILE_BASE + url };
  try {
    const u = new URL(url);
    return { url: TILE_BASE + u.pathname + u.search };
  } catch {
    return { url: TILE_BASE + '/' + url };
  }
}

// 計算 bearing (行車方向, 0..360, 0=正北, 順時針)
// 用 atan2(dLng × cos(meanLat), dLat) 近似等距座標
function calcBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = lat2 - lat1;
  const meanLatRad = ((lat1 + lat2) / 2) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.cos(meanLatRad);
  if (dLat === 0 && dLng === 0) return -1; // 沒移動
  const theta = Math.atan2(dLng, dLat) * 180 / Math.PI;
  return (theta + 360) % 360;
}

// 兩點距離（度），用來判斷「是否已經在目標視野」避免多餘 flyTo
function distanceLngLat(a: { lng: number; lat: number }, b: [number, number]): number {
  const dLng = (a.lng - b[0]) * Math.cos(((a.lat + b[1]) / 2) * Math.PI / 180);
  const dLat = a.lat - b[1];
  return Math.hypot(dLng, dLat);
}

// 比對新舊 buses 陣列是否有實質變化 — 只比 currentLocation 欄位
// 若無變化，React.memo 會阻止 BusMap re-render，markers useEffect 也不會重跑
function areBusesEqual(a: Bus[], b: Bus[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (pa.id !== pb.id) return false;
    const la = pa.currentLocation, lb = pb.currentLocation;
    if (!la && !lb) continue;
    if (!la || !lb) return false;
    // 這四個欄位是每次 tick 唯一會變的
    if (
      la.latitude !== lb.latitude ||
      la.longitude !== lb.longitude ||
      la.speed !== lb.speed ||
      la.lastUpdated !== lb.lastUpdated
    ) return false;
  }
  return true;
}

interface BusMapProps {
  buses: Bus[];
  selectedBusId?: string;
  onSelect?: (bus: Bus) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// BusMap — 用 memo + 自訂 comparator 包住，props 不變就不 re-render
// markers 內部狀態（prevLocation / bearing）全存在 ref，不觸發 React 更新
// ──────────────────────────────────────────────────────────────────────────────
function BusMapInner({ buses, selectedBusId, onSelect }: BusMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const markerRootsRef = useRef<Map<string, Root>>(new Map());
  // 記上一幀座標 → 用來算 bearing
  const prevLocationRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  // 記每輛車目前 bearing（用 CSS transition 做平滑）
  const bearingRef = useRef<Map<string, number>>(new Map());
  // 永遠指向最新 buses，flyTo effect 靠它讀取，不需要放 deps
  const busesRef = useRef<Bus[]>(buses);
  busesRef.current = buses;
  // 記住「未選中校巴時」的使用者視野（center + zoom）。
  // 選中時會 zoom 進 FOCUS_ZOOM，關閉 toolbox 時要還原回這裡記住的視野，
  // 否則鏡頭會一直卡在近距離（使用者回報的 bug）。
  // null 代表還沒記過 → 還原時用 HK_CENTER + DEFAULT_ZOOM。
  const freeViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  // 是否有校巴被選中（moveend 靠它判斷要不要更新 freeView，避免把
  // flyTo 到校巴的鏡頭誤認成「使用者自己的視野」）
  const hasSelectionRef = useRef(false);
  hasSelectionRef.current = selectedBusId !== '';
  const [isReady, setIsReady] = useState(false);

  // ── Map 初始化（只跑一次）────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle() as any,
      center: HK_CENTER,
      zoom: DEFAULT_ZOOM,
      transformRequest: transformRequest as any,
      // 直接用 MapOptions — MapLibre 會在 style 載入後 attach，
      // 並透過 sourcedata / styledata 事件觸發 _updateAttributions，
      // 確保 customAttribution 在 styledata 之後才填入（避免空 container 殘留）
      //
      // compact: false → 右下角不會出現可點擊的 ⓘ toggle，
      // 出處聲明以常駐細字顯示（VersaTiles / OSM 授權要求不可移除）
      attributionControl: {
        compact: false,
        customAttribution: '© OpenStreetMap contributors',
      },
    });

    // 註: 不加 NavigationControl — 地圖左上角會出現 +/− 縮放按鈕，
    // 與主頁右上狀態列視覺衝突，且手機版用雙指縮放即可。

    mapRef.current = map;

    const markReady = () => setIsReady(true);
    map.on('load', markReady);
    map.on('idle', markReady);
    const timer = setTimeout(markReady, 3000);

    const onError = (e: any) => {
      const msg = e?.error?.message || String(e);
      if (msg.includes('READ-usage')) return;
      console.warn('[BusMap] map error:', msg);
    };
    map.on('error', onError);

    // 未選中校巴時，使用者手動平移/縮放 → 更新「還原視野」。
    // 這樣關閉 toolbox 會回到他們最後自己調的畫面，而不是舊的。
    const onMoveEnd = () => {
      if (hasSelectionRef.current) return;
      const c = map.getCenter();
      freeViewRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    };
    map.on('moveend', onMoveEnd);

    return () => {
      clearTimeout(timer);
      map.off('load', markReady);
      map.off('idle', markReady);
      map.off('error', onError);
      map.off('moveend', onMoveEnd);
      for (const root of markerRootsRef.current.values()) root.unmount();
      markerRootsRef.current.clear();
      markersRef.current.clear();
      prevLocationRef.current.clear();
      bearingRef.current.clear();
      freeViewRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Markers 更新（只跑真正有 location 變化的車）─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const bus of buses) {
      if (!bus.currentLocation) continue;
      const id = bus.id;
      seen.add(id);

      const lat = bus.currentLocation.latitude;
      const lng = bus.currentLocation.longitude;

      // ── Bearing 計算 ────────────────────────────────────────────────────
      const prev = prevLocationRef.current.get(id);
      let bearing = bearingRef.current.get(id) ?? 0;
      if (prev) {
        const b = calcBearing(prev.lat, prev.lng, lat, lng);
        if (b >= 0) bearing = b;
      }
      prevLocationRef.current.set(id, { lat, lng });
      bearingRef.current.set(id, bearing);

      // MousePointer2 預設指向右上 45°，所以 bearing=0（正北）時要 -45°
      const rotationDeg = bearing - 45;

      let marker = markersRef.current.get(id);
      if (!marker) {
        // ── 建立新 marker ────────────────────────────────────────────────
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', bus.plateNumber);
        el.className =
          'cursor-pointer transition-transform active:scale-90 hover:scale-110 text-primary drop-shadow-lg bg-transparent border-0 p-0';

        // inner 由我們控制旋轉，不被 MapLibre 的 transform 覆蓋
        const inner = document.createElement('span');
        inner.style.display = 'inline-block';
        inner.style.transformOrigin = '50% 90%';
        inner.style.transition = `transform ${MARKER_MOVE_DURATION}ms ease-out`;
        inner.style.setProperty('--rot', `${rotationDeg}deg`);
        inner.style.transform = `rotate(var(--rot))`;
        el.appendChild(inner);

        const root = createRoot(inner);
        root.render(
          <MousePointer2
            size={32}
            strokeWidth={2}
            color="currentColor"
            fill="white"
          />,
        );
        markerRootsRef.current.set(id, root);

        el.onclick = (e) => {
          e.stopPropagation();
          onSelect?.(bus);
        };

        marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.set(id, marker);
      } else {
        // ── 現有 marker：用 rAF 插值 setLngLat 達到平滑移動 ────────────
        // MapLibre 的 marker 沒有 easeTo，只有 Map 有；
        // 用 requestAnimationFrame 在 200ms 內做線性插值，避免地圖鏡頭被動到
        const existingMarker = marker; // const 進 closure，避免 TS 把 marker 視為可能 undefined
        const el = existingMarker.getElement();
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.setProperty('--rot', `${rotationDeg}deg`);
          inner.style.transform = `rotate(var(--rot))`;
        }
        // 從 marker 內部 _lngLat 拿當前座標（MapLibre 私有欄位但穩定）
        const m = existingMarker as unknown as { _lngLat: { lng: number; lat: number } };
        const fromLng = m._lngLat?.lng ?? lng;
        const fromLat = m._lngLat?.lat ?? lat;
        const start = performance.now();
        const animate = (now: number) => {
          const t = Math.min(1, (now - start) / MARKER_MOVE_DURATION);
          // easeInOutQuad — 起終柔和
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const curLng = fromLng + (lng - fromLng) * eased;
          const curLat = fromLat + (lat - fromLat) * eased;
          existingMarker.setLngLat([curLng, curLat]);
          if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }

    // ── 移除已消失的 marker ──────────────────────────────────────────────
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        const root = markerRootsRef.current.get(id);
        if (root) { root.unmount(); markerRootsRef.current.delete(id); }
        prevLocationRef.current.delete(id);
        bearingRef.current.delete(id);
      }
    }
  }, [buses, onSelect]);

  // ── 飛到選中的校巴 / 關閉時還原視野（只靠 selectedBusId）─────────────
  // selectedBusId: '' → toolbox 已關閉 → 還原到選中前記住的視野
  // selectedBusId: 'xxx' → 記下當前視野（若還沒記），再 zoom 進該校巴
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ── 關閉 → 還原視野 ────────────────────────────────────────────────
    if (!selectedBusId) {
      const free = freeViewRef.current;
      // 已在目標視野就不動作，避免多餘動畫 + 避免覆蓋使用者手動縮放
      const sameView =
        free &&
        Math.abs(map.getZoom() - free.zoom) < 0.01 &&
        distanceLngLat(map.getCenter(), free.center) < 1;
      if (sameView) return;
      map.flyTo({
        center: free ? free.center : HK_CENTER,
        zoom: free ? free.zoom : DEFAULT_ZOOM,
        speed: 1.2,
      });
      return;
    }

    // ── 選中 → 記下當前視野，再 zoom 過去 ─────────────────────────────
    // 只在「從未選中 → 首次選中」時記，避免切換校巴時把 zoom 14 的近視野記下來
    if (!freeViewRef.current) {
      const c = map.getCenter();
      freeViewRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    }

    // 從 ref 取得最新 buses，避免放進 deps 導致每次 tick 都 flyTo
    const bus = busesRef.current.find((b) => b.id === selectedBusId);
    if (!bus?.currentLocation) return;
    map.flyTo({
      center: [bus.currentLocation.longitude, bus.currentLocation.latitude],
      zoom: FOCUS_ZOOM,
      speed: 1.2,
    });
  }, [selectedBusId]); // ← 沒有 buses！

  return (
    <>
      <div ref={containerRef} className="relative w-full h-full bg-[#f0f2f5]" />
      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/30 text-sm text-muted-foreground pointer-events-none">
          <div className="flex items-center gap-2 bg-background/80 px-3 py-2 rounded-full shadow-sm">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            地圖準備中…
          </div>
        </div>
      )}
    </>
  );
}

// 用 React.memo 包住 + 自訂 comparator
// 舊 props === 新 props → BusMap 不 re-render，markers useEffect 不重跑
// 舊 props !== 新 props → re-render，但 markers useEffect 內部仍做 diff
const BusMap = memo(BusMapInner, (prev, next) => {
  return (
    areBusesEqual(prev.buses, next.buses) &&
    prev.selectedBusId === next.selectedBusId
    // onSelect 靠上層 useCallback 保住引用相等，這裡不需比
  );
});

export default BusMap;
