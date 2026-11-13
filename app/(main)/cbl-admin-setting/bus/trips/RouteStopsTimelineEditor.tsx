'use client';

/**
 * RouteStopsTimelineEditor — 上落車地點與時間軸
 *
 * 對應使用者需求 (2026-11-03 更新):
 *   1. 站點順序 (Seq No.) — 自動生成數字, 支援滑鼠拖曳上下調整
 *   2. 站點類型 — 起點站 / 分站 / 終點站
 *   3. 大概到站時間 (ETA) — 24h Time Picker
 *   4. 站點地址 — 文字輸入 (地圖預覽依此地址自動定位)
 *   5. 備註 — 司機/家長備註
 *   6. 確定按鈕 — 按下後收起站點
 *   7. 地圖路徑預覽 — 依站點地址自動 geocode (OSM Nominatim) + 顯示路線
 *
 * 已移除: 地理定位 GPS / 乘客 (學生) 欄位。
 *
 * 範圍: 僅 /cbl-admin-setting/bus/trips/ 內使用。
 */

import * as React from 'react';
import maplibregl from 'maplibre-gl';
import {
  Reorder,
  motion,
  AnimatePresence,
} from 'framer-motion';
import {
  GripVertical,
  Trash2,
  Plus,
  Clock,
  MapPin,
  Check,
  ChevronDown,
  Sparkles,
  ArrowRightLeft,
  Route as RouteIcon,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Pill, Dot, IconButton } from './primitives';
import { EASE } from './design-tokens';
import {
  STOP_KIND_OPTIONS,
  type RouteStopDraft,
} from './types';
import type { RouteStop, RouteStopKind } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function stopKindTone(kind: RouteStopKind): 'success' | 'danger' | 'neutral' {
  return kind === 'origin' ? 'success' : kind === 'terminal' ? 'danger' : 'neutral';
}

function stopKindLabel(kind: RouteStopKind): string {
  return kind === 'origin' ? '起點' : kind === 'terminal' ? '終點' : '分站';
}

/** 將現有 RouteStop[] (含 id/seq) 對齊成新順序的 RouteStop[] (重新編號 seq) */
function renumberStops(stops: RouteStop[]): RouteStop[] {
  return stops.map((s, idx) => ({ ...s, seq: idx + 1 }));
}

/** 一鍵反轉: 起點 ↔ 終點互換, 中間反序; 起點變終點, 終點變起點 */
function reverseStops(stops: RouteStop[]): RouteStop[] {
  if (stops.length === 0) return stops;
  const flipped = [...stops].reverse().map((s) => {
    let kind: RouteStopKind = s.kind;
    if (s.kind === 'origin') kind = 'terminal';
    else if (s.kind === 'terminal') kind = 'origin';
    return { ...s, kind };
  });
  return renumberStops(flipped);
}

/* -------------------------------------------------------------------------- */
/*  StopRow — 單一站點的可編輯行                                                  */
/* -------------------------------------------------------------------------- */

function StopRow({
  stop,
  index,
  expanded,
  onToggleExpand,
  onCollapse,
  onUpdate,
  onRemove,
}: {
  stop: RouteStop;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onCollapse: () => void;
  onUpdate: (patch: Partial<RouteStopDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <Reorder.Item
      value={stop}
      className={cn(
        'relative pl-8',
        'before:absolute before:left-3.5 before:top-7 before:bottom-0 before:w-px before:bg-slate-200 dark:before:bg-slate-700',
        'last:before:hidden',
      )}
      whileDrag={{ scale: 1.02, zIndex: 10 }}
      transition={{ duration: 0.12, ease: EASE }}
    >
      {/* Timeline dot — 顯示序號 */}
      <span
        aria-hidden
        className={cn(
          'absolute left-1 top-3 w-5 h-5 rounded-full flex items-center justify-center',
          'ring-2 ring-white dark:ring-slate-900',
          stop.kind === 'origin'
            ? 'bg-emerald-500'
            : stop.kind === 'terminal'
            ? 'bg-rose-500'
            : 'bg-blue-600',
        )}
      >
        <span className="text-[10px] font-bold text-white">{index + 1}</span>
      </span>

      <div
        className={cn(
          'rounded-xl border bg-white dark:bg-slate-900 overflow-hidden',
          expanded
            ? 'border-blue-400/60 shadow-[0_1px_2px_rgba(37,99,235,0.15)]'
            : 'border-slate-200 dark:border-slate-700',
        )}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Pill tone={stopKindTone(stop.kind)} size="sm">
            {stopKindLabel(stop.kind)}
          </Pill>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-medium text-slate-900 truncate dark:text-slate-100">
              {stop.name || (
                <span className="text-slate-400 italic">未填寫地址</span>
              )}
            </p>
            {stop.eta && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mt-0.5 tabular-nums">
                <Clock width={9} height={9} />
                {stop.eta}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <IconButton onClick={onRemove} title="刪除此站點" variant="danger">
              <Trash2 width={13} height={13} />
            </IconButton>
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={expanded ? '收合' : '展開編輯'}
              aria-expanded={expanded}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.14, ease: EASE }}
                className="block"
              >
                <ChevronDown width={13} height={13} />
              </motion.span>
            </button>
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 cursor-grab active:cursor-grabbing touch-none"
              aria-label="拖曳排序"
              title="拖曳以調整順序"
            >
              <GripVertical width={13} height={13} />
            </span>
          </div>
        </div>

        {/* Expandable form body */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="overflow-hidden border-t border-slate-100 dark:border-slate-700/80"
            >
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 站點類型 */}
                <div>
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    站點類型
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {STOP_KIND_OPTIONS.map((opt) => {
                      const active = stop.kind === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onUpdate({ kind: opt.value })}
                          className={cn(
                            'h-9 rounded-md text-[12px] font-medium border transition-colors cursor-pointer',
                            active
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
                          )}
                          title={opt.hint}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 到站時間 ETA */}
                <div>
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400 inline-flex items-center gap-1">
                    <Clock width={11} height={11} />
                    到站時間
                  </label>
                  <input
                    type="time"
                    value={stop.eta}
                    onChange={(e) => onUpdate({ eta: e.target.value })}
                    className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>

                {/* 站點地址 */}
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    站點地址 <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <MapPin width={12} height={12} />
                    </span>
                    <input
                      type="text"
                      value={stop.name}
                      onChange={(e) => onUpdate({ name: e.target.value })}
                      placeholder="例: 圍方 (The Wai) 大圍站 B 出口對出"
                      className="w-full h-9 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                  </div>
                </div>

                {/* 備註 */}
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    備註
                  </label>
                  <input
                    type="text"
                    value={stop.notes ?? ''}
                    onChange={(e) => onUpdate({ notes: e.target.value })}
                    placeholder="司機 / 家長備註 (選填)"
                    className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                  />
                </div>

                {/* 確定按鈕 — 按下後收起站點 */}
                <div className="md:col-span-2 flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    startIcon={<Check width={12} height={12} />}
                    onClick={onCollapse}
                  >
                    確定
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reorder.Item>
  );
}

/* -------------------------------------------------------------------------- */
/*  MapPreview — 地圖路徑預覽 (站點地址 → OSM Nominatim 自動定位)                  */
/* -------------------------------------------------------------------------- */

const OSM_STYLE: unknown = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function kindColor(kind: RouteStopKind): string {
  return kind === 'origin' ? '#10b981' : kind === 'terminal' ? '#f43f5e' : '#2563eb';
}

/** 地址正規化 (去空格 + 小寫) — 用作 geocode cache key */
function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

/**
 * 站點地址 → 座標 (Nominatim)。
 * 自動補「Hong Kong」偏置, 令「圍方 / 大圍站」呢類本地地址搵得中。
 */
async function geocodeAddress(addr: string): Promise<{ lat: number; lon: number } | null> {
  const q = addr.trim();
  if (q.length < 2) return null;
  const hasHK = /香港|hong\s*kong/i.test(q);
  const query = hasHK ? q : `${q}, Hong Kong`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data || data.length === 0) return null;
  const lat = Number(data[0].lat);
  const lon = Number(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

function MapPreview({ stops }: { stops: RouteStop[] }) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markersRef = React.useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = React.useState(false);
  const [points, setPoints] = React.useState<Record<string, { lat: number; lon: number }>>({});
  const [locating, setLocating] = React.useState(false);
  const cacheRef = React.useRef(new Map<string, { lat: number; lon: number }>());
  const seqRef = React.useRef(0);

  // 所有站點的地址簽名 — 地址改咗先重新定位
  const addrKey = stops.map((s) => `${s.id}:${s.name.trim()}`).join('|');

  /* 地址 → 座標 (debounced, 有 cache 就唔打 API) */
  React.useEffect(() => {
    const mySeq = ++seqRef.current;
    const timer = window.setTimeout(async () => {
      const targets = stops.filter((s) => s.name.trim().length >= 2);
      if (targets.length === 0) {
        if (seqRef.current === mySeq) setPoints({});
        return;
      }
      // 全部命中 cache → 直接用, 唔閃 locating
      const missing = targets.filter((s) => !cacheRef.current.has(normalizeAddress(s.name)));
      if (missing.length === 0) {
        if (seqRef.current !== mySeq) return;
        const next: Record<string, { lat: number; lon: number }> = {};
        targets.forEach((s) => {
          const hit = cacheRef.current.get(normalizeAddress(s.name));
          if (hit) next[s.id] = hit;
        });
        setPoints(next);
        return;
      }
      if (seqRef.current === mySeq) setLocating(true);
      const next: Record<string, { lat: number; lon: number }> = {};
      // 逐個打 Nominatim (遵守 1 req/sec 禮貌間隔)
      for (const s of targets) {
        const key = normalizeAddress(s.name);
        const cached = cacheRef.current.get(key);
        if (cached) {
          next[s.id] = cached;
          continue;
        }
        try {
          const pt = await geocodeAddress(s.name);
          if (seqRef.current !== mySeq) return;
          if (pt) {
            cacheRef.current.set(key, pt);
            next[s.id] = pt;
          }
        } catch {
          /* 單個地址失敗唔阻其他站點 */
        }
        await new Promise((r) => setTimeout(r, 900));
        if (seqRef.current !== mySeq) return;
      }
      if (seqRef.current !== mySeq) return;
      setPoints(next);
      setLocating(false);
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey]);

  const valid = React.useMemo(
    () =>
      stops
        .filter((s) => points[s.id])
        .map((s) => ({ ...s, latitude: points[s.id].lat, longitude: points[s.id].lon })),
    [stops, points],
  );

  /* 地圖初始化 — 依賴 container 節點 */
  React.useEffect(() => {
    if (!container) return;
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container,
      style: OSM_STYLE as never,
      center: [114.1694, 22.3193],
      zoom: 11,
      attributionControl: { compact: false } as never,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    const ready = () => setMapReady(true);
    map.on('load', ready);
    map.on('idle', ready);
    const timer = setTimeout(ready, 3000);
    return () => {
      clearTimeout(timer);
      map.off('load', ready);
      map.off('idle', ready);
      setMapReady(false);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  /* 站點 / 定位變動 → 重繪 markers + 路線 + 視野 */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (valid.length === 0) {
        const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: 'FeatureCollection', features: [] } as never);
        }
        return;
      }
      valid.forEach((s) => {
        const el = document.createElement('div');
        const c = kindColor(s.kind);
        el.style.cssText = [
          'width:26px;height:26px;border-radius:9999px',
          `background:${c};border:2.5px solid #fff`,
          'box-shadow:0 2px 8px rgba(0,0,0,.35)',
          'display:flex;align-items:center;justify-content:center',
          'color:#fff;font-size:12px;font-weight:800;line-height:1',
          'cursor:default',
        ].join(';');
        el.textContent = String(s.seq);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([s.longitude as number, s.latitude as number])
          .setPopup(
            new maplibregl.Popup({ offset: 14, closeButton: false }).setText(
              `${s.seq}. ${s.name || '未填寫地址'}`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      });
      const hasLine = valid.length >= 2;
      const geojson = {
        type: 'FeatureCollection',
        features: hasLine
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: valid.map((s) => [s.longitude as number, s.latitude as number]),
                },
              },
            ]
          : [],
      };
      const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geojson as never);
      } else {
        map.addSource('route', { type: 'geojson', data: geojson as never });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 },
        });
      }
      if (valid.length === 1) {
        map.easeTo({
          center: [valid[0].longitude as number, valid[0].latitude as number],
          zoom: 15,
          duration: 400,
        });
      } else if (hasLine) {
        const bounds = new maplibregl.LngLatBounds();
        valid.forEach((s) => bounds.extend([s.longitude as number, s.latitude as number]));
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 400 });
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once('style.load', draw);
  }, [valid, mapReady]);

  const locatedCount = valid.length;

  if (stops.length === 0 || locatedCount === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/80 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <RouteIcon width={12} height={12} />
          </span>
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            地圖路徑預覽
          </span>
          <span className="ml-auto text-[10px] text-slate-400">© OpenStreetMap contributors</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <Info width={12} height={12} />
            {stops.length === 0
              ? '尚未新增任何站點, 新增後會按站點地址自動定位預覽。'
              : locating
              ? '正按站點地址定位中…'
              : '輸入站點地址後即可在地圖預覽路線 (未能定位的地址不會顯示)。'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <RouteIcon width={12} height={12} />
          </span>
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            地圖路徑預覽
          </span>
          <Pill tone="primary" size="sm">
            {locatedCount} 站已定位
          </Pill>
          {locating && (
            <Pill tone="neutral" size="sm">
              定位中…
            </Pill>
          )}
        </div>
        <span className="text-[10px] text-slate-400 tabular-nums truncate max-w-[45%]">
          {valid[0].name || `站點 ${valid[0].seq}`} → {valid[valid.length - 1].name || `站點 ${valid[valid.length - 1].seq}`}
        </span>
      </div>
      <div className="relative w-full" style={{ height: 300 }}>
        <div ref={setContainer} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">© OpenStreetMap contributors</span>
        <span className="text-[10px] text-slate-400 tabular-nums">
          {locatedCount} / {stops.length} 站已定位
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  RouteStopsTimelineEditor — 主元件                                            */
/* -------------------------------------------------------------------------- */

export interface RouteStopsTimelineEditorProps {
  stops: RouteStop[];
  onChange: (next: RouteStop[]) => void;
  /** 以下為舊 props, 保留可選以兼容舊調用, 已不再使用 */
  busId?: string;
  busStudents?: unknown[];
  defaultEta?: string;
}

export function RouteStopsTimelineEditor({
  stops,
  onChange,
}: RouteStopsTimelineEditorProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  // 已按「確定」收起的站點 — 地圖預覽只認已確定的站點, 打字中唔會即刻出現
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({});

  /** 為新加入的 stop 自動挑選 kind:
   *  - 第一個 → origin
   *  - 最後一個 → terminal
   *  - 中間 → middle
   *  (若現有 stops 已標記 kind, 不覆蓋) */
  const addStop = React.useCallback(() => {
    const seq = stops.length + 1;
    let kind: RouteStopKind = 'middle';
    if (stops.length === 0) kind = 'origin';
    else if (stops.length > 0) {
      // 自動決定新加入的是 middle; 但若目前沒有 terminal 就把最後一個當 terminal
      const hasTerminal = stops.some((s) => s.kind === 'terminal');
      if (!hasTerminal) {
        // 把原最後一個改成 terminal, 新加入的放末端但 kind=middle (待使用者決定)
        const next = stops.map((s) => s);
        next[next.length - 1] = { ...next[next.length - 1], kind: 'terminal' };
        const newStop: RouteStop = {
          id: `rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          seq: next.length + 1,
          kind: 'middle',
          eta: '',
          name: '',
          latitude: null,
          longitude: null,
          studentIds: [],
          notes: '',
        };
        const merged = renumberStops([...next, newStop]);
        onChange(merged);
        setExpanded((s) => ({ ...s, [newStop.id]: true }));
        return;
      }
    }
    const newStop: RouteStop = {
      id: `rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      seq,
      kind,
      eta: '',
      name: '',
      latitude: null,
      longitude: null,
      studentIds: [],
      notes: '',
    };
    onChange(renumberStops([...stops, newStop]));
    setExpanded((s) => ({ ...s, [newStop.id]: true }));
  }, [stops, onChange]);

  const updateStop = React.useCallback(
    (id: string, patch: Partial<RouteStopDraft>) => {
      onChange(
        stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
      // 改動內容視同未確定 — 要再按確定先会计入地圖
      setConfirmed((s) => ({ ...s, [id]: false }));
    },
    [stops, onChange],
  );

  const removeStop = React.useCallback(
    (id: string) => {
      onChange(renumberStops(stops.filter((s) => s.id !== id)));
      setExpanded((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      setConfirmed((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
    },
    [stops, onChange],
  );

  /** 拖曳排序: 整個站點卡片跟住搬 (種類 + 名稱 + 時間 + 備註一齊搬) */
  const handleReorder = React.useCallback(
    (next: RouteStop[]) => {
      onChange(renumberStops(next));
    },
    [onChange],
  );

  const handleReverse = React.useCallback(() => {
    if (stops.length < 2) return;
    onChange(reverseStops(stops));
  }, [stops, onChange]);

  const toggleExpand = (id: string) => {
    const isExpanded = expanded[id] ?? true;
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
    // 收起視同確定, 重新展開就要再按確定先會計入地圖
    setConfirmed((s) => ({ ...s, [id]: isExpanded }));
  };

  const collapseStop = (id: string) => {
    setExpanded((s) => ({ ...s, [id]: false }));
    setConfirmed((s) => ({ ...s, [id]: true }));
  };

  /** 自動展開/收合 — 新加入時自動展開, 現有 stops 在數量 < 4 時自動展開 */
  React.useEffect(() => {
    setExpanded((cur) => {
      const next = { ...cur };
      stops.forEach((s) => {
        if (next[s.id] === undefined) {
          next[s.id] = stops.length <= 3;
        }
      });
      return next;
    });
    // 載入已有路線 (有地址) 視同已確定; 全新加入 (空白地址) 要按確定先計入地圖
    setConfirmed((cur) => {
      const next = { ...cur };
      stops.forEach((s) => {
        if (next[s.id] === undefined && cur[s.id] === undefined) {
          next[s.id] = s.name.trim().length > 0;
        }
      });
      return next;
    });
  }, [stops.length]);

  // 地圖預覽只認已按「確定」的站點 — 打字中 / 未確定的唔会计入
  const confirmedStops = stops.filter((s) => confirmed[s.id]);
  const hasOrigin = confirmedStops.some((s) => s.kind === 'origin');
  const hasTerminal = confirmedStops.some((s) => s.kind === 'terminal');

  return (
    <div className="space-y-3">
      {/* 工具列 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          startIcon={<Plus width={12} height={12} />}
          onClick={addStop}
        >
          新增站點
        </Button>
        <Button
          type="button"
          variant="warning"
          size="sm"
          startIcon={<ArrowRightLeft width={12} height={12} />}
          onClick={handleReverse}
          disabled={stops.length < 2}
          title={stops.length < 2 ? '至少需要 2 個站點才能反轉' : '一鍵反轉路線順序 + 互換起點/終點'}
        >
          一鍵反轉路線
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <Pill tone={stops.length > 0 ? 'primary' : 'neutral'} size="sm">
            {stops.length} 站
          </Pill>
          {!hasOrigin && stops.length > 0 && (
            <Pill tone="warning" size="sm">
              <Dot tone="warning" />
              缺起點
            </Pill>
          )}
          {!hasTerminal && stops.length > 1 && (
            <Pill tone="warning" size="sm">
              <Dot tone="warning" />
              缺終點
            </Pill>
          )}
        </div>
      </div>

      {/* 站點時間軸 */}
      {stops.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-8 flex flex-col items-center gap-2 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-300">
            <Sparkles width={18} height={18} />
          </span>
          <p className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
            尚未新增任何站點
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm">
            點擊「新增站點」開始建立路線時間軸。
          </p>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={stops}
          onReorder={handleReorder}
          className="space-y-2"
        >
          <AnimatePresence initial={false}>
            {stops.map((stop, idx) => (
              <StopRow
                key={stop.id}
                stop={stop}
                index={idx}
                expanded={expanded[stop.id] ?? true}
                onToggleExpand={() => toggleExpand(stop.id)}
                onCollapse={() => collapseStop(stop.id)}
                onUpdate={(patch) => updateStop(stop.id, patch)}
                onRemove={() => removeStop(stop.id)}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      {/* 地圖路徑預覽 — 已確定的站點有起點 + 終點先出現, 依站點地址自動定位 */}
      {hasOrigin && hasTerminal && (
        <div className="pt-1">
          <MapPreview stops={confirmedStops} />
        </div>
      )}
    </div>
  );
}
