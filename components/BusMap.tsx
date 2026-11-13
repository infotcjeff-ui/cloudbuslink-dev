'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { osm } from '@versatiles/style';
import { MousePointer2 } from 'lucide-react';
import type { Bus } from '@/lib/types';
import { BUS_MOTION_META, getBusMotion, type BusMotion } from '@/lib/bus-motion';

const HK_CENTER: [number, number] = [114.1694, 22.3193];
const DEFAULT_ZOOM = 11;      // 地圖初始 zoom，也是「還原視野」預設值
const FOCUS_ZOOM = 16;        // 選中校巴時 zoom 到的層級（街區級，看清前後路）
const TILE_BASE = 'https://tiles.versatiles.org';
// pin 跟 GPS 跳一下的動畫：短滑行 (~0.9s ease) 到新點就停定，
// 等下一幀 GPS (5-10s) 再郁 — 不是連續即時滑行。

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
// ─── pin 形狀 ─────────────────────────────────────────────────────────────
// 行駛 → 綠箭頭 (跟行車方向)；怠速 → 橙箭頭 (跟行車方向)
// 靜止 → 圓形 (藍底 + 白邊 + 白巴士 icon, 不旋轉)
// 離線 → 圓形 (灰底 + 白邊 + 白巴士 icon, 不旋轉)
function isRoundMotion(m: BusMotion): boolean {
  return m === 'stopped' || m === 'offline';
}

// pin 跟 GPS 跳一下的動畫：短滑行 (~0.9s ease) 到新點就停定，
// 等下一幀 GPS (5-10s) 再郁 — 不是連續即時滑行。
const FIX_ANIM_MS = 900;
// 判定「真係郁咗」的最小位移 (度，約 15 米)，細過唔轉向（去 GPS 抖動）
const MIN_MOVE_DEG = 0.00015;
// MousePointer2 筆尖本身指向西北 (~315°)，要指正北需順時針轉 +45°，
// 再加行車 bearing 才是正確朝向（之前寫 -45 差了 90°，車向前 pin 會指左右）。
const ARROW_BASE_DEG = 45;

/** pin 內核：箭頭 / 圓點二選一。旋轉寫在 React 內層 span，唔經 inner container */
function PinIcon({ motion, hex, rotationDeg }: { motion: BusMotion; hex: string; rotationDeg: number }) {
  if (isRoundMotion(motion)) {
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
      {/* 實心箭頭：fill = 四態色（綠/橙底），stroke = 白邊框 */}
      <MousePointer2 size={24} strokeWidth={2} color="#fff" fill={hex} />
    </span>
  );
}

/**
 * 解算箭頭朝向 (0-360)：808 hx 優先，GPS 位移次之，否則沿用上一幀。
 * - hx 是設備端航向（比兩點差分穩，唔會因 GPS 抖動指左右）；
 * - 差分只在位移 > MIN_MOVE_DEG 先信，防止原地抖動亂轉；
 * - 靜止/離線唔用（圓形唔旋轉），但都記住，方便起步即有正確方向。
 */
function resolveBearing(
  lat: number, lng: number, heading: number | null | undefined,
  speed: number, prev: { lat: number; lng: number } | undefined, prevBearing: number,
): number {
  if (typeof heading === 'number' && Number.isFinite(heading)) {
    const h = ((heading % 360) + 360) % 360;
    // 有速度先信 hx；完全靜止就凍結朝向，唔跟垃圾航向
    if (speed >= 1) return h;
    return prevBearing;
  }
  if (prev) {
    const dLat = lat - prev.lat;
    const meanLatRad = ((lat + prev.lat) / 2) * Math.PI / 180;
    const dLng = (lng - prev.lng) * Math.cos(meanLatRad);
    if (Math.hypot(dLng, dLat) < MIN_MOVE_DEG) return prevBearing;
    const b = calcBearing(prev.lat, prev.lng, lat, lng);
    if (b >= 0) return b;
  }
  return prevBearing;
}

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

// 比對新舊 buses 陣列是否有實質變化 — 只比 currentLocation 欄位 + status
// 若無變化，React.memo 會阻止 BusMap re-render，markers useEffect 也不會重跑
function areBusesEqual(a: Bus[], b: Bus[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (pa.id !== pb.id) return false;
    if (pa.status !== pb.status) return false;
    const la = pa.currentLocation, lb = pb.currentLocation;
    if (!la && !lb) continue;
    if (!la || !lb) return false;
    // 每次 tick 可能變的欄位全比 (含 online: 掉線要即時轉灰)
    if (
      la.latitude !== lb.latitude ||
      la.longitude !== lb.longitude ||
      la.speed !== lb.speed ||
      la.lastUpdated !== lb.lastUpdated ||
      (la.online ?? true) !== (lb.online ?? true) ||
      (la.heading ?? null) !== (lb.heading ?? null)
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
  // 記每輛車目前 bearing（箭頭朝向，跨 tick 沿用，唔會因為靜止一幀就彈返正北）
  const bearingRef = useRef<Map<string, number>>(new Map());
  // 每架車當前 rAF 動畫 handle — 新一幀 GPS 到就 cancel 舊動畫再起新，唔會疊動畫打架
  const animFrameRef = useRef<Map<string, number>>(new Map());
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
  // focus 跟車：選中後地圖跟住該 pin 郁；使用者手動拖地圖就暫停跟，
  // 切換選中 / 重新選中時恢復跟。
  const followPausedRef = useRef(false);
  // 剛選中時的 flyTo 未跑完前唔跟，免同 easeTo 打架（ jitter ）
  const selectedAtRef = useRef(0);
  // 點 pin 先 zoom in：pin onclick 會直接 flyTo；下拉 / 篩選改 selectedBusId
  // 只亮 pin + 開 toolbox，唔郁鏡頭。靠呢個 flag 區分兩種選擇來源。
  const pinClickRef = useRef(false);
  // markers effect 不依賴 selectedBusId（避免選中時整批 marker 重跑動畫），
  // 新建 marker 的選中態經 ref 讀取
  const selectedIdRef = useRef(selectedBusId);
  selectedIdRef.current = selectedBusId;
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
    const onDragStart = () => {
      // focus 緊架車時手動拖地圖 = 唔想再被跟，暫停跟車直到切換/重選
      if (hasSelectionRef.current) followPausedRef.current = true;
    };
    const onMoveEnd = () => {
      if (hasSelectionRef.current) return;
      const c = map.getCenter();
      freeViewRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    };
    map.on('dragstart', onDragStart);
    map.on('moveend', onMoveEnd);

    return () => {
      clearTimeout(timer);
      map.off('load', markReady);
      map.off('idle', markReady);
      map.off('error', onError);
      map.off('dragstart', onDragStart);
      map.off('moveend', onMoveEnd);
      for (const root of markerRootsRef.current.values()) root.unmount();
      markerRootsRef.current.clear();
      for (const f of animFrameRef.current.values()) cancelAnimationFrame(f);
      animFrameRef.current.clear();
      markersRef.current.clear();
      prevLocationRef.current.clear();
      bearingRef.current.clear();
      freeViewRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Markers 更新：pin 跟 GPS 跳動 ───────────────────────────────────
  // 每幀 808 fix 到就短滑 (~0.9s) 到新點，停定等下一幀 (5-10s)；新 fix 到打斷重起。
  // 形狀：行駛/怠速 = 箭頭（跟方向轉），靜止/離線 = 圓形（不轉）。
  // anchor 統一 center，pin / 脈動 / GPS 點三者置中。
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
      const motion = getBusMotion(bus);
      const hex = BUS_MOTION_META[motion].hex;

      // ── 朝向解算：808 hx 優先 → GPS 位移次之 → 沿用上一幀 ─────────
      // 唔用「上次畫面位置 vs 新 fix」嚟計（嗰個係動畫中間值，會指歪），
      // 用「上一個 GPS fix vs 呢個 fix」先係真行車方向。
      const prev = prevLocationRef.current.get(id);
      const bearing = resolveBearing(
        lat, lng, bus.currentLocation.heading, bus.currentLocation.speed ?? 0,
        prev, bearingRef.current.get(id) ?? 0,
      );
      prevLocationRef.current.set(id, { lat, lng });
      bearingRef.current.set(id, bearing);

      const rotationDeg = ARROW_BASE_DEG + bearing;

      let marker = markersRef.current.get(id);
      if (!marker) {
        // ── 建立新 marker ────────────────────────────────────────────────
        // 結構: button.bus-pin > span.bus-pin-pulse + span.bus-pin-inner
        // pulse 只在選中時顯示 (CSS .is-selected 控制)，inner 由 React 畫箭頭/圓點。
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', bus.plateNumber);
        el.className = 'bus-pin cursor-pointer bg-transparent border-0 p-0';
        if (id === selectedIdRef.current) el.classList.add('is-selected');
        (el as HTMLElement & { dataset: DOMStringMap }).dataset.motion = motion;

        const pulse = document.createElement('span');
        pulse.className = 'bus-pin-pulse';
        pulse.style.background = hex;
        el.appendChild(pulse);

        const inner = document.createElement('span');
        inner.className = 'bus-pin-inner';
        el.appendChild(inner);

        const root = createRoot(inner);
        root.render(<PinIcon motion={motion} hex={hex} rotationDeg={rotationDeg} />);
        markerRootsRef.current.set(id, root);

        el.onclick = (e) => {
          e.stopPropagation();
          // 用 ref 拿最新 bus 物件，避免閉包拿到舊座標
          const latest = busesRef.current.find((x) => x.id === id);
          const target = latest ?? bus;
          // 只有點擊 pin 才 zoom in：先標記來源，記下當前自由視野（供關閉時還原），再飛過去。
          // 下拉選車 / 篩選只改 selectedBusId（亮 pin + 開 toolbox），不觸發飛行。
          pinClickRef.current = true;
          const tloc = target.currentLocation;
          if (tloc) {
            if (!selectedIdRef.current && !freeViewRef.current) {
              const c = map.getCenter();
              freeViewRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
            }
            followPausedRef.current = false;
            selectedAtRef.current = Date.now();
            map.flyTo({
              center: [tloc.longitude, tloc.latitude],
              zoom: FOCUS_ZOOM,
              speed: 1.2,
            });
          }
          onSelect?.(target);
        };

        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.set(id, marker);
      } else {
        // ── 現有 marker：形狀/顏色 + 跟 GPS 滑行 ─────────────────────────
        const existingMarker = marker; // const 進 closure，避免 TS 把 marker 視為可能 undefined
        const el = existingMarker.getElement();
        (el as HTMLElement & { dataset: DOMStringMap }).dataset.motion = motion;
        const pulse = el.querySelector('.bus-pin-pulse') as HTMLElement | null;
        if (pulse) pulse.style.background = hex;
        // 形狀/顏色/方向經 React 重畫（箭頭↔圓點切換、轉向 transition 都在 PinIcon 內）
        const root = markerRootsRef.current.get(id);
        if (root) root.render(<PinIcon motion={motion} hex={hex} rotationDeg={rotationDeg} />);

        // 新 fix 到：如果仲喺上一段滑行緊就打斷，由「而家畫面位置」短滑 (~0.9s) 到新點，
        // 到點就停定等下一幀 GPS (5-10s) — 跟跳節奏，唔係連續滑行。
        const oldFrame = animFrameRef.current.get(id);
        if (oldFrame) cancelAnimationFrame(oldFrame);
        const m = existingMarker as unknown as { _lngLat: { lng: number; lat: number } };
        const fromLng = m._lngLat?.lng ?? lng;
        const fromLat = m._lngLat?.lat ?? lat;
        const moved = Math.hypot((lng - fromLng) * Math.cos(lat * Math.PI / 180), lat - fromLat);
        if (moved < 1e-8) {
          existingMarker.setLngLat([lng, lat]);
          animFrameRef.current.delete(id);
        } else {
          const start = performance.now();
          const animate = (now: number) => {
            const t = Math.min(1, (now - start) / FIX_ANIM_MS);
            // easeOutCubic：起步爽快、到點收油，似足跟住架車跳一格
            const eased = 1 - Math.pow(1 - t, 3);
            const curLng = fromLng + (lng - fromLng) * eased;
            const curLat = fromLat + (lat - fromLat) * eased;
            existingMarker.setLngLat([curLng, curLat]);
            if (t < 1) {
              animFrameRef.current.set(id, requestAnimationFrame(animate));
            } else {
              animFrameRef.current.delete(id);
            }
          };
          animFrameRef.current.set(id, requestAnimationFrame(animate));
        }
      }
    }

    // ── 移除已消失的 marker ──────────────────────────────────────────────
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        const oldFrame = animFrameRef.current.get(id);
        if (oldFrame) cancelAnimationFrame(oldFrame);
        animFrameRef.current.delete(id);
        marker.remove();
        markersRef.current.delete(id);
        const root = markerRootsRef.current.get(id);
        if (root) { root.unmount(); markerRootsRef.current.delete(id); }
        prevLocationRef.current.delete(id);
        bearingRef.current.delete(id);
      }
    }
  }, [buses, onSelect]);

  // ── 選中切換時只改 class（不重建 marker、不重跑上面大 effect）─────────
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const el = marker.getElement();
      if (id === selectedBusId) el.classList.add('is-selected');
      else el.classList.remove('is-selected');
    }
  }, [selectedBusId]);

  // ── 關閉時還原視野；選中時唔郁鏡頭（飛行只由 pin onclick 做）──────
  // selectedBusId: '' → toolbox 已關閉 → 還原到選中前記住的視野
  // selectedBusId: 'xxx' → pin 點選已在 onclick 飛過，這裡不再飛；
  //                 下拉 / 篩選只亮 pin + 開 toolbox，鏡頭完全唔郁。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ── 關閉 → 還原視野 ────────────────────────────────────────────────
    if (!selectedBusId) {
      pinClickRef.current = false;
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

    // ── 選中 → 只記視野，唔飛 ─────────────────────────────────────────
    // 只在「從未選中 → 首次選中」時記，避免切換校巴時把 zoom 16 的近視野記下來
    if (!freeViewRef.current) {
      const c = map.getCenter();
      freeViewRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    }

    if (pinClickRef.current) {
      // pin 點選：onclick 已 flyTo，這裡只消耗標記 + 保住 2s 跟車保護窗
      pinClickRef.current = false;
      selectedAtRef.current = Date.now();
      return;
    }
    // 下拉 / 篩選選中：鏡頭唔郁，亦唔跟車（免 2 秒後突然 pan 走）
    followPausedRef.current = true;
  }, [selectedBusId]); // ← 沒有 buses！

  // ── focus 跟車：選中後 pin 郁到邊，地圖跟到邊 ─────────────────────────
  // 只 pan（唔改 zoom），短 ease 跟住 pin 的 0.9s 跳動；位移好細就唔郁防抖。
  // 使用者手動拖過圖會暫停跟車，切換/重選時恢復。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedBusId || followPausedRef.current) return;
    // 剛選中 2s 內係初次 flyTo 階段，唔跟，免打架
    if (Date.now() - selectedAtRef.current < 2000) return;
    const bus = buses.find((b) => b.id === selectedBusId);
    const loc = bus?.currentLocation;
    if (!loc) return;
    const cur = map.getCenter();
    // < ~5 米唔跟（去 GPS 抖動）；之前用 ~20 米，慢車（5km/h 十秒先行十幾米）
    //郁少少就永遠唔跟，所以地圖睇落完全唔郁 — 而家改細到 5 米。
    if (distanceLngLat(cur, [loc.longitude, loc.latitude]) < 0.00005) return;
    map.stop();
    map.easeTo({
      center: [loc.longitude, loc.latitude],
      duration: FIX_ANIM_MS,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [buses, selectedBusId]);

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
