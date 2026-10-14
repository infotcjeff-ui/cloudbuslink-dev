'use client';

import * as React from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Trash2, Plus, ChevronDown, ChevronUp, Check, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DUR, EASE_OUT_QUART, EASE_OUT, useReducedMotion, SPRING } from '@/lib/motion';
import type { Waypoint } from '@/lib/types';

export interface WaypointEditorProps {
  waypoints: Waypoint[];
  onChange: (next: Waypoint[]) => void;
  /** Allow drag-to-reorder. */
  reorderable?: boolean;
  /** Allow toggling expanded state of each row. */
  collapsible?: boolean;
  /** Compact layout (used inside small cards). */
  compact?: boolean;
  /** Whether to show the status toggle inside each row. */
  showStatus?: boolean;
}

const STATUS_META: Record<Waypoint['status'], { label: string; color: string }> = {
  pending: { label: '待辦', color: 'bg-muted-foreground/40' },
  arrived: { label: '已到達', color: 'bg-primary/60' },
  completed: { label: '已完成', color: 'bg-primary' },
  skipped: { label: '已跳過', color: 'bg-muted-foreground/30' },
};

function createEmptyWaypoint(): Waypoint {
  return {
    id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    location: {
      name: '',
      address: '',
      latitude: 22.3193,
      longitude: 114.1694,
      type: 'pickup',
    },
    type: 'pickup',
    scheduledTime: '',
    actualTime: null,
    status: 'pending',
    studentIds: [],
    notes: null,
  };
}

function WaypointRow({
  wp,
  index,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onStatus,
  compact,
  showStatus,
  collapsible,
}: {
  wp: Waypoint;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<Waypoint>) => void;
  onRemove: () => void;
  onStatus: (next: Waypoint['status']) => void;
  compact?: boolean;
  showStatus?: boolean;
  collapsible?: boolean;
}) {
  const reduced = useReducedMotion();
  const meta = STATUS_META[wp.status];
  const pickup = wp.type === 'pickup';

  return (
    <Reorder.Item
      value={wp}
      className={cn(
        'relative pl-8',
        // Timeline line — only show if not the last item
        'before:absolute before:left-3.5 before:top-7 before:bottom-0 before:w-px before:bg-border',
        'last:before:hidden'
      )}
      whileDrag={reduced ? undefined : { scale: 1.02, zIndex: 10 }}
      transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
    >
      {/* Timeline dot */}
      <span
        aria-hidden
        className={cn(
          'absolute left-1 top-3 w-5 h-5 rounded-full flex items-center justify-center',
          'ring-2 ring-background',
          pickup ? 'bg-primary' : 'bg-primary/40'
        )}
      >
        <span className="text-[10px] font-bold text-primary-foreground">
          {index + 1}
        </span>
      </span>

      <div
        className={cn(
          'rounded-2xl border bg-card overflow-hidden',
          expanded ? 'border-primary/40 shadow-sm' : 'border-border'
        )}
      >
        {/* Header row */}
        <div className={cn('flex items-center gap-2', compact ? 'p-2.5' : 'p-3')}>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              pickup
                ? 'bg-primary/10 text-primary'
                : 'bg-primary/5 text-primary/70'
            )}
          >
            {pickup ? '上車' : '下車'}
          </span>
          {showStatus && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn('w-1.5 h-1.5 rounded-full', meta.color)} />
              {meta.label}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {wp.location.name || (
                <span className="text-muted-foreground italic">未命名站點</span>
              )}
            </p>
            {wp.scheduledTime && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {wp.scheduledTime}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onRemove}
              aria-label="刪除站點"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {collapsible && (
              <button
                type="button"
                onClick={onToggleExpand}
                aria-label={expanded ? '收合' : '展開'}
                aria-expanded={expanded}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
                  className="block"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.span>
              </button>
            )}
            <span
              {...(collapsible ? {} : { 'data-drag-handle': true } as any)}
              className="p-1.5 text-muted-foreground/60 cursor-grab active:cursor-grabbing touch-none"
              aria-label="拖曳排序"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Expandable form body */}
        <AnimatePresence initial={false}>
          {(expanded || !collapsible) && (
            <motion.div
              key="body"
              initial={collapsible ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1 }}
              exit={collapsible ? { height: 0, opacity: 0 } : undefined}
              transition={{ duration: DUR.base, ease: EASE_OUT_QUART }}
              className="overflow-hidden"
            >
              <div className={cn('space-y-2 border-t border-border/60', compact ? 'p-2.5' : 'p-3 pt-3')}>
                <Input
                  value={wp.location.name}
                  onChange={(e) =>
                    onUpdate({ location: { ...wp.location, name: e.target.value } })
                  }
                  placeholder="站點名稱"
                  className="h-9 text-sm"
                />
                <Input
                  value={wp.location.address}
                  onChange={(e) =>
                    onUpdate({ location: { ...wp.location, address: e.target.value } })
                  }
                  placeholder="地址"
                  className="h-9 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div
                    role="tablist"
                    aria-label="站點類型"
                    className="relative inline-flex items-center rounded-full bg-muted/60 p-0.5 h-9"
                  >
                    {(['pickup', 'dropoff'] as const).map((t) => {
                      const active = wp.type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => onUpdate({ type: t })}
                          className={cn(
                            'relative z-10 inline-flex items-center justify-center flex-1 h-8 px-3 rounded-full text-xs font-medium transition-colors',
                            active ? 'text-primary-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId={`wp-type-${wp.id}`}
                              className="absolute inset-0 rounded-full bg-primary shadow-sm"
                              transition={reduced ? { duration: 0 } : SPRING.indicator}
                              style={{ zIndex: -1 }}
                              aria-hidden
                            />
                          )}
                          {t === 'pickup' ? '上車' : '下車'}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    type="time"
                    value={wp.scheduledTime}
                    onChange={(e) => onUpdate({ scheduledTime: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  經緯度: {wp.location.latitude.toFixed(4)}, {wp.location.longitude.toFixed(4)} · 學生: {wp.studentIds.length}
                </p>

                {showStatus && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(['pending', 'arrived', 'completed', 'skipped'] as Waypoint['status'][]).map(
                      (s) => {
                        const active = s === wp.status;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => onStatus(s)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors',
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:text-foreground'
                            )}
                          >
                            {active ? <Check className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
                            {STATUS_META[s].label}
                          </button>
                        );
                      }
                    )}
                  </div>
                )}

                {wp.notes !== null && (
                  <Input
                    value={wp.notes || ''}
                    onChange={(e) => onUpdate({ notes: e.target.value })}
                    placeholder="備註 (例: 交通意外改道)"
                    className="h-9 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onUpdate({ notes: wp.notes === null ? '' : null })}
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                  {wp.notes === null ? '+ 添加備註' : '移除備註'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reorder.Item>
  );
}

export function WaypointEditor({
  waypoints,
  onChange,
  reorderable = true,
  collapsible = true,
  compact = false,
  showStatus = false,
}: WaypointEditorProps) {
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const updateAt = React.useCallback(
    (id: string, patch: Partial<Waypoint>) => {
      onChange(waypoints.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    },
    [waypoints, onChange]
  );

  const removeAt = React.useCallback(
    (id: string) => {
      onChange(waypoints.filter((w) => w.id !== id));
    },
    [waypoints, onChange]
  );

  const addWaypoint = () => {
    const wp = createEmptyWaypoint();
    onChange([...waypoints, wp]);
    setExpanded((s) => ({ ...s, [wp.id]: true }));
  };

  const toggleExpand = (id: string) => {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  };

  if (waypoints.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-border rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">尚未添加站點</p>
          <Button type="button" size="sm" variant="outline" onClick={addWaypoint}>
            <Plus className="w-3.5 h-3.5" />
            新增站點
          </Button>
        </div>
      </div>
    );
  }

  const list = (
    <Reorder.Group
      axis="y"
      values={waypoints}
      onReorder={onChange}
      className="space-y-2"
    >
      <AnimatePresence initial={false}>
        {waypoints.map((wp, idx) => (
          <WaypointRow
            key={wp.id}
            wp={wp}
            index={idx}
            expanded={expanded[wp.id] ?? true}
            onToggleExpand={() => toggleExpand(wp.id)}
            onUpdate={(p) => updateAt(wp.id, p)}
            onRemove={() => removeAt(wp.id)}
            onStatus={(s) => updateAt(wp.id, { status: s })}
            compact={compact}
            showStatus={showStatus}
            collapsible={collapsible}
          />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );

  return (
    <div className="space-y-3">
      {list}
      <Button
        type="button"
        variant="outline"
        onClick={addWaypoint}
        className="w-full h-11 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary"
      >
        <Plus className="w-4 h-4" />
        新增站點
      </Button>
    </div>
  );
}
