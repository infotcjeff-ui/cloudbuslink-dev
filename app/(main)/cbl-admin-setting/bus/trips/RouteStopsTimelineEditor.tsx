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
  const [query, setQuery] = React.useState('');

  if (students.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 px-3 py-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
        此車輛目前沒有綁定任何學生。
      </div>
    );
  }

  const filtered = students
    .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.studentId.includes(query))
    .sort((a, b) => a.classNumber.localeCompare(b.classNumber));

  return (
    <div className="rounded-md border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-700/80">
        <Search width={11} height={11} className="text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋學生姓名 / 學號…"
          className="flex-1 h-6 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
        />
        <span className="text-[10px] text-slate-400 tabular-nums">
          {selectedIds.length}/{students.length}
        </span>
      </div>
      <ul className="max-h-[140px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-2.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            沒有符合「{query}」的學生
          </li>
        ) : (
          filtered.map((s) => {
            const checked = selectedIds.includes(s.id);
            return (
              <li
                key={s.id}
                onClick={() =>
                  onChange(checked ? selectedIds.filter((id) => id !== s.id) : [...selectedIds, s.id])
                }
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1 cursor-pointer text-[12px] transition-colors',
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
                <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-auto shrink-0">
                  {s.classNumber} · {s.studentId}
                </span>
              </li>
            );
          })
        )}
      </ul>
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
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums">
            <Clock width={10} height={10} />
            {stop.eta || '—:—'}
          </span>
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

                {/* 到站時間 */}
                <div>
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    到站時間 (ETA) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Clock width={12} height={12} />
                    </span>
                    <input
                      type="time"
                      value={stop.eta}
                      onChange={(e) => onUpdate({ eta: e.target.value })}
                      className="w-full h-9 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
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

                {/* 經緯度 (選填) */}
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400 inline-flex items-center gap-1">
                    地理定位 (GPS) <span className="text-[10px] text-slate-400 normal-case font-medium">(選填 · 地圖預覽用)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      value={stop.latitude ?? ''}
                      onChange={(e) => onUpdate({ latitude: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="緯度 (Latitude)"
                      className="h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                    />
                    <input
                      type="number"
                      step="0.0001"
                      value={stop.longitude ?? ''}
                      onChange={(e) => onUpdate({ longitude: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="經度 (Longitude)"
                      className="h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
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

                {/* 備註 */}
                <div className="md:col-span-2">
                  <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
                    司機 / 家長備註
                  </label>
                  <input
                    type="text"
                    value={stop.notes}
                    onChange={(e) => onUpdate({ notes: e.target.value })}
                    placeholder="例: 屋苑車閘旁、請勿阻礙巴士站"
                    className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[12.5px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
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
/*  MapPreview — 地圖路徑預覽 (SVG, 不接外部 map provider)                         */
/* -------------------------------------------------------------------------- */

function MapPreview({ stops }: { stops: RouteStop[] }) {
  const valid = stops.filter(
    (s) => s.latitude !== null && s.longitude !== null,
  ) as RouteStop[];

  if (valid.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 dark:bg-slate-800/40 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Info width={12} height={12} />
          {valid.length === 0
            ? '尚未輸入經緯度, 輸入至少 2 個站點的 GPS 即可預覽路徑。'
            : '需至少 2 個站點含 GPS 才能繪製路徑。'}
        </div>
      </div>
    );
  }

  // 計算經緯度的 bounding box, 自動置中縮放
  const lats = valid.map((s) => s.latitude as number);
  const lngs = valid.map((s) => s.longitude as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.2 || 0.005;
  const padLng = (maxLng - minLng) * 0.2 || 0.005;
  const w = 100;
  const h = 60;
  const project = (lat: number, lng: number) => {
    const x = ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * w;
    const y = (1 - (lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * h;
    return { x, y };
  };
  const points = valid.map((s) => ({
    p: project(s.latitude as number, s.longitude as number),
    name: s.name || `站點 ${s.seq}`,
    seq: s.seq,
    kind: s.kind,
  }));

  // 連成 path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.p.x.toFixed(2)} ${p.p.y.toFixed(2)}`).join(' ');

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-slate-800 dark:to-blue-950/20 dark:border-slate-700 overflow-hidden">
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
        <span className="text-[10px] text-slate-400 tabular-nums">
          {valid[0].name} → {valid[valid.length - 1].name}
        </span>
      </div>
      <div className="relative aspect-[5/3] w-full">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
        >
          {/* 底圖方格 */}
          <defs>
            <pattern id="mapgrid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" fill="none" stroke="currentColor" strokeWidth="0.15" className="text-slate-300 dark:text-slate-700" />
            </pattern>
          </defs>
          <rect width={w} height={h} fill="url(#mapgrid)" />

          {/* 路徑線 */}
          <motion.path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-500"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: EASE }}
          />

          {/* 站點 + 編號 */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.p.x}
                cy={p.p.y}
                r="1.6"
                className={cn(
                  p.kind === 'origin'
                    ? 'fill-emerald-500'
                    : p.kind === 'terminal'
                    ? 'fill-rose-500'
                    : 'fill-blue-500',
                )}
              />
              <circle
                cx={p.p.x}
                cy={p.p.y}
                r="2.4"
                fill="none"
                className={cn(
                  p.kind === 'origin'
                    ? 'stroke-emerald-500'
                    : p.kind === 'terminal'
                    ? 'stroke-rose-500'
                    : 'stroke-blue-500',
                )}
                strokeWidth="0.3"
              />
              <text
                x={p.p.x}
                y={p.p.y - 2.4}
                textAnchor="middle"
                fontSize="2.2"
                className="fill-slate-700 dark:fill-slate-200 font-bold"
              >
                {p.seq}
              </text>
            </g>
          ))}
        </svg>
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
