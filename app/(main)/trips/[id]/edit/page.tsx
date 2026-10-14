'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bus, Calendar, Clock, MapPin, Trash2, User, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { cn, cnWeekday, tripStatusLabel, tripTypeLabel } from '@/lib/utils';
import type { Trip, TripStatus, Waypoint } from '@/lib/types';
import { SegmentedControl } from '@/components/trips/segmented-control';
import { StickyActionBar } from '@/components/trips/sticky-action-bar';
import { WaypointEditor } from '@/components/trips/waypoint-editor';
import { DUR, EASE_OUT_QUART } from '@/lib/motion';

const STATUS_OPTIONS = [
  { value: 'scheduled' as TripStatus, label: tripStatusLabel('scheduled') },
  { value: 'in_progress' as TripStatus, label: tripStatusLabel('in_progress') },
  { value: 'completed' as TripStatus, label: tripStatusLabel('completed') },
  { value: 'cancelled' as TripStatus, label: tripStatusLabel('cancelled') },
];

export default function EditTripPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [status, setStatus] = useState<TripStatus>('scheduled');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [statusDirty, setStatusDirty] = useState(false);
  const [waypointsDirty, setWaypointsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    const found = STORAGE.trips.getById(params.id as string);
    if (found) {
      setTrip(found);
      setStatus(found.status);
      setWaypoints(found.waypoints);
    }
  }, [params.id]);

  const dirty = statusDirty || waypointsDirty;

  const handleSave = () => {
    if (!trip) return;
    setSaving(true);
    STORAGE.trips.update(trip.id, {
      status,
      waypoints,
    });
    setStatusDirty(false);
    setWaypointsDirty(false);
    setSuccess(true);
    setTimeout(() => router.push(`/trips/${trip.id}`), 650);
  };

  const handleDelete = () => {
    if (!trip) return;
    STORAGE.trips.remove(trip.id);
    setConfirmDelete(false);
    router.push('/trips');
  };

  const setStatusAndDirty = (s: TripStatus) => {
    setStatus(s);
    setStatusDirty(true);
  };

  const setWaypointsAndDirty = (w: Waypoint[]) => {
    setWaypoints(w);
    setWaypointsDirty(true);
  };

  if (!trip || !user) {
    return (
      <div className="px-4 pt-4 pb-6">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded-2xl" />
          <div className="h-48 bg-muted rounded-2xl" />
          <div className="h-32 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  const bus = STORAGE.buses.getById(trip.busId);
  const nanny = STORAGE.nannies.getById(trip.nannyId);
  const driver = bus?.driverId ? STORAGE.drivers.getById(bus.driverId) : null;
  const students = STORAGE.students
    .getByClient(trip.clientId)
    .filter((s) => trip.studentIds.includes(s.id));

  return (
    <div className="pb-32">
      {/* Sticky header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE_OUT_QUART }}
        className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-background/85 backdrop-blur-md border-b border-border/50"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/trips/${trip.id}`)}
            aria-label="返回"
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold">編輯班次</h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {bus?.plateNumber} · {cnWeekday(trip.date)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.base, ease: EASE_OUT_QUART, delay: 0.05 }}
        className="px-4 pt-4 space-y-4"
      >
        {/* Summary card (read-only) */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">班次編號</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {trip.id.slice(0, 14)}…
              </span>
            </div>

            <div className="flex items-center gap-2 text-lg font-bold tracking-tight tabular-nums">
              <Clock className="w-4 h-4 text-primary" />
              {trip.plannedStartTime}
              <span className="text-muted-foreground font-normal mx-1">—</span>
              {trip.plannedEndTime}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-sm">
              <SummaryRow icon={<Bus className="w-3.5 h-3.5" />} label="校巴" value={bus?.plateNumber || '未指派'} />
              <SummaryRow
                icon={<User className="w-3.5 h-3.5" />}
                label="保姆"
                value={nanny?.name || '未指派'}
              />
              <SummaryRow
                icon={<Calendar className="w-3.5 h-3.5" />}
                label="日期"
                value={`${trip.date} (${cnWeekday(trip.date)})`}
              />
              <SummaryRow
                icon={<MapPin className="w-3.5 h-3.5" />}
                label="類型"
                value={tripTypeLabel(trip.type)}
              />
            </div>

            {/* Student avatar group */}
            {students.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                  <Users className="w-3 h-3" />
                  {students.length}
                </span>
                <div className="flex -space-x-2">
                  {students.slice(0, 6).map((s) => (
                    <div
                      key={s.id}
                      title={s.name}
                      className={cn(
                        'w-7 h-7 rounded-full ring-2 ring-background',
                        'bg-primary/15 text-primary text-[10px] font-bold',
                        'flex items-center justify-center'
                      )}
                    >
                      {s.name.slice(0, 1)}
                    </div>
                  ))}
                  {students.length > 6 && (
                    <div className="w-7 h-7 rounded-full ring-2 ring-background bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center">
                      +{students.length - 6}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status segmented control */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-primary" />
              </span>
              <h3 className="text-sm font-semibold">班次狀態</h3>
            </div>
            <SegmentedControl
              value={status}
              onChange={setStatusAndDirty}
              options={STATUS_OPTIONS}
              layoutId="trip-status-active"
            />
            <AnimatePresence>
              {statusDirty && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
                  className="text-[11px] text-primary overflow-hidden"
                >
                  狀態已變更，記得保存
                </motion.p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Waypoint editor */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5 text-primary" />
              </span>
              <h3 className="text-sm font-semibold">路線站點 ({waypoints.length})</h3>
              {waypoints.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-auto">可拖曳排序</span>
              )}
            </div>
            <WaypointEditor
              waypoints={waypoints}
              onChange={setWaypointsAndDirty}
              reorderable
              collapsible
              showStatus
            />
            <AnimatePresence>
              {waypointsDirty && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: DUR.fast, ease: EASE_OUT_QUART }}
                  className="text-[11px] text-primary overflow-hidden mt-3"
                >
                  站點已變更，記得保存
                </motion.p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <StickyActionBar
        showBack
        backLabel="取消"
        onBack={() => router.push(`/trips/${trip.id}`)}
        showNext
        nextLabel="保存變更"
        onNext={handleSave}
        loading={saving}
        success={success}
        nextDisabled={!dirty || saving}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除班次？</DialogTitle>
            <DialogDescription>
              將會刪除 {bus?.plateNumber || '此班次'} 在 {trip.date} 的班次紀錄，動作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}
