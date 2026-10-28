'use client';

/**
 * RouteStopsTimelineEditor — 上落車地點與時間軸
 *
 * 對應使用者需求第二部分: 「核心」上落車地點與時間軸
 *   1. 站點順序 (Seq No.) — 自動生成數字, 支援滑鼠拖曳上下調整
 *   2. 站點類型 — 起點站 / 分站 / 終點站
 *   3. 大概到站時間 (ETA) — 24h Time Picker
 *   4. 站點名稱 — 文字輸入
 *   5. 地理定位 (GPS) — 暫時可空白
 *   6. 乘客 (學生) — 選取已綁定該車輛的學生
 *   7. 司機/家長備註 — 文字輸入
 *
 * 額外功能:
 *   - 一鍵反轉路線
 *   - 地圖路徑預覽
 *
 * 範圍: 僅 /cbl-admin-setting/bus/trips/ 內使用。
 *
 * 設計語言: 沿用 OneFleet 風格, 跟 /students 的 primitives 一致;
 * 拖曳用 framer-motion Reorder.Group/Item。
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
  Users as UsersIcon,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRightLeft,
  Search,
  Route as RouteIcon,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Pill, Dot, IconButton } from './primitives';
import { EASE } from './design-tokens';
import {
  EMPTY_STOP_DRAFT,
  STOP_KIND_OPTIONS,
  type RouteStopDraft,
} from './types';
import type { RouteStop, Student, RouteStopKind } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function stopKindTone(kind: RouteStopKind): 'success' | 'danger' | 'neutral' {
  return kind === 'origin' ? 'success' : kind === 'terminal' ? 'danger' : 'neutral';
}

function stopKindLabel(kind: RouteStopKind): string {
  return kind === 'origin' ? '起點' : kind === 'terminal' ? '終點' : '分站';
}

function draftFromStop(s: RouteStop): RouteStopDraft {
  return {
    kind: s.kind,
    eta: s.eta,
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    studentIds: [...s.studentIds],
    notes: s.notes,
  };
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
/*  StudentMultiSelect — 依第一步選定車輛的綁定學生, 多選                       */
/* -------------------------------------------------------------------------- */

function StudentMultiSelect({
  students,
  selectedIds,
  onChange,
}: {
  students: Student[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selectedStudents = React.useMemo(
    () =>
      selectedIds
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is Student => Boolean(s)),
    [selectedIds, students],
  );

  if (students.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-3 py-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
        此車輛目前沒有綁定任何學生。
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = students
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q))
    .sort((a, b) => a.classNumber.localeCompare(b.classNumber));

  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((sid) => sid !== id) : [...selectedIds, id],
    );

  const selectAllFiltered = () => {
    const ids = new Set(selectedIds);
    filtered.forEach((s) => ids.add(s.id));
    onChange([...ids]);
  };
  const clearAll = () => onChange([]);

  const MAX_CHIPS = 6;
  const visibleChips = selectedStudents.slice(0, MAX_CHIPS);
  const hiddenCount = selectedStudents.length - visibleChips.length;

  return (
    <div className="rounded-md border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700">
      {/* 摘要列: 永遠可見, 不展開不佔位 */}
      <div className="px-2.5 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            已選 {selectedIds.length}/{students.length}
          </span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10.5px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
            >
              清除
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
          >
            {open ? '收合' : selectedIds.length > 0 ? '增減學生' : '選擇學生'}
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.14 }}
              className="block"
            >
              <ChevronDown width={12} height={12} />
            </motion.span>
          </button>
        </div>
        {/* 已選 chips (最多 6 + +N, 超長不撐版) */}
        {selectedStudents.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {visibleChips.map((s) => (
              <span
                key={s.id}
                title={`${s.name} · ${s.classNumber} · ${s.studentId}`}
                className="inline-flex items-center gap-1 max-w-[160px] pl-2 pr-1 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70 text-[11px] dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800/50"
              >
                <span className="truncate font-medium">{s.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-label={`移除 ${s.name}`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-200/70 dark:hover:bg-blue-800/60 cursor-pointer shrink-0"
                >
                  <X width={10} height={10} strokeWidth={3} />
                </button>
              </span>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                title={selectedStudents.map((s) => s.name).join('、')}
                className="inline-flex items-center h-[22px] px-2 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                +{hiddenCount} 更多
              </button>
            )}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            尚未選擇學生, 撳「選擇學生」勾選此站上/落車名單。
          </p>
        )}
      </div>

      {/* 展開: 搜尋 + 滾動清單 (固定高度, 20-35 人唔會撐版) */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="student-picker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="overflow-hidden border-t border-slate-100 dark:border-slate-700/80"
          >
            <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-700/80">
              <Search width={11} height={11} className="text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋學生姓名 / 學號…"
                className="flex-1 h-6 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-[10.5px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 shrink-0 cursor-pointer"
              >
                全選篩選
              </button>
            </div>
            <ul className="max-h-[168px] overflow-y-auto p-1.5 grid grid-cols-2 gap-1 content-start">
              {filtered.length === 0 ? (
                <li className="col-span-2 px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                  沒有符合「{query}」的學生
                </li>
              ) : (
                filtered.map((s) => {
                  const checked = selectedIds.includes(s.id);
                  return (
                    <li
                      key={s.id}
                      onClick={() => toggle(s.id)}
                      title={`${s.name} · ${s.classNumber} · ${s.studentId}`}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-[12px] transition-colors min-w-0',
                        checked
                          ? 'bg-blue-50/60 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-4 w-4 items-center justify-center rounded border-2 shrink-0',
                          checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600',
                        )}
                      >
                        {checked && <Check width={10} height={10} className="text-white" strokeWidth={3.5} />}
                      </span>
                      <span className="font-medium truncate">{s.name}</span>
                      <span className="text-[9px] leading-tight text-slate-400 dark:text-slate-500 ml-auto shrink-0 tabular-nums">
                        {s.classNumber} · {s.studentId}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StopRow — 單一站點的可編輯行                                                  */
/* -------------------------------------------------------------------------- */

function StopRow({
  stop,
  index,
  busStudents,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
}: {
  stop: RouteStop;
  index: number;
  busStudents: Student[];
  expanded: boolean;
  onToggleExpand: () => void;
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
                <span className="text-slate-400 italic">未命名站點</span>
              )}
            </p>
            {stop.studentIds.length > 0 && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mt-0.5">
                <UsersIcon width={9} height={9} />
                {stop.studentIds.length} 位學生
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

                {/* 地理定位 GPS (地圖預覽用) */}
                <div>
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    地理定位 GPS
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      step="any"
                      value={stop.latitude ?? ''}
                      onChange={(e) => onUpdate({ latitude: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="緯度 22.38"
                      className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                    <input
                      type="number"
                      step="any"
                      value={stop.longitude ?? ''}
                      onChange={(e) => onUpdate({ longitude: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="經度 114.17"
                      className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                  </div>
                </div>

                {/* 站點名稱 */}
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    站點名稱 <span className="text-rose-500">*</span>
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

                {/* 學生多選 (依第一步選定車輛) */}
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400 inline-flex items-center gap-1.5">
                    <UsersIcon width={11} height={11} />
                    乘客 (學生) — 此站上/落車
                    <span className="text-[10px] text-slate-400 normal-case font-medium">({stop.studentIds.length} 位已選)</span>
                  </label>
                  <StudentMultiSelect
                    students={busStudents}
                    selectedIds={stop.studentIds}
                    onChange={(next) => onUpdate({ studentIds: next })}
                  />
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
/*  MapPreview — 地圖路徑預覽 (OpenStreetMap raster + maplibre-gl)               */
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

function MapPreview({ stops }: { stops: RouteStop[] }) {
  // 用「節點 state」而不是 ref 追蹤容器 ——
  // ref 只在 mount 時賦值, 若容器是後來才渲染出來 (例如 stops 從空變有資料),
  // 底下那個 useEffect 依賴 [] 不會重跑, 地圖就永遠不會初始化 (空白框無 pin 無路線)。
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markersRef = React.useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = React.useState(false);

  const valid = React.useMemo(
    () =>
      (stops as RouteStop[]).filter(
        (s) => s.latitude !== null && s.longitude !== null,
      ),
    [stops],
  );

  /* 地圖初始化 — 依賴 container 節點 (節點出現/換掉時才重建) */
  React.useEffect(() => {
    if (!container) return;
    if (mapRef.current) return;

    const first = valid[0];
    const map = new maplibregl.Map({
      container,
      style: OSM_STYLE as never,
      center: first ? [first.longitude as number, first.latitude as number] : [114.1694, 22.3193],
      zoom: first ? 13 : 11,
      attributionControl: { compact: false } as never,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    const ready = () => setMapReady(true);
    map.on('load', ready);
    map.on('idle', ready);
    // 保險: 若 load 事件因故沒觸發 (例如 style 已在 cache), 3 秒後也放行
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

  /* 站點 / GPS 變動 → 重繪 markers + 路線 + 視野 */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const draw = () => {
      // 清舊 markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // 沒有任何有效站點 → 只清掉舊圖, 不畫線
      if (valid.length === 0) return;

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
              `${s.seq}. ${s.name || '未命名站點'}`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      });

      // 路線 (GeoJSON LineString) — 至少 2 個站點才畫線;
      // 只有 1 站時送空 FeatureCollection (LineString 至少要 2 個點, 否則 GeoJSON 非法)
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

      // source / layer 只建立一次, 之後用 setData 更新。
      // 注意: 就算當下只有 1 個站點 (畫不出線), 也要先把 source 建立好 ——
      // 否則之後新增第 2 個站點時 source 還沒建立, 線會一直畫不出來。
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

      // 視野: 1 站 → 置中放大; 多站 → fitBounds
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

    // 用 isStyleLoaded() 而非 loaded() ——
    // loaded() 會因瓦片載入而反覆 true/false, 一旦錯過 'load' 事件就再也畫不出來。
    if (map.isStyleLoaded()) draw();
    else map.once('style.load', draw);
  }, [valid, mapReady]);

  if (valid.length === 0) {
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
            尚未輸入經緯度, 輸入至少 1 個站點的 GPS 即可在 OSM 地圖預覽。
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
          <Pill tone="info" size="sm">
            {valid.length} 站
          </Pill>
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
          {valid.length} 個站點有 GPS
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
  /** 由 MasterInfo 傳入的車輛 — 學生清單依此篩選 */
  busId: string;
  busStudents: Student[];
}

export function RouteStopsTimelineEditor({
  stops,
  onChange,
  busId,
  busStudents,
}: RouteStopsTimelineEditorProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

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
    },
    [stops, onChange],
  );

  const removeStop = React.useCallback(
    (id: string) => {
      onChange(renumberStops(stops.filter((s) => s.id !== id)));
    },
    [stops, onChange],
  );

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
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
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
  }, [stops.length]);

  const hasOrigin = stops.some((s) => s.kind === 'origin');
  const hasTerminal = stops.some((s) => s.kind === 'terminal');

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
            {busId
              ? '點擊「新增站點」開始建立路線時間軸, 學生清單將依你選的車輛自動載入。'
              : '請先到上方「指派車輛」選擇校巴, 這裡才能挑選已綁定該車輛的學生。'}
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
                busStudents={busStudents}
                expanded={expanded[stop.id] ?? true}
                onToggleExpand={() => toggleExpand(stop.id)}
                onUpdate={(patch) => updateStop(stop.id, patch)}
                onRemove={() => removeStop(stop.id)}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      {/* 地圖路徑預覽 */}
      <div className="pt-1">
        <MapPreview stops={stops} />
      </div>
    </div>
  );
}
