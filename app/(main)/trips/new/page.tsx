'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bus, Users, Route, MapPin, AlertCircle, User, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AriaSelectRoot, AriaSelectItem, SelectedCheck } from '@/components/ui/aria-select';
import { useAuth } from '@/lib/hooks';
import { STORAGE } from '@/lib/storage';
import { cn, today, cnWeekday, tripTypeLabel } from '@/lib/utils';
import type { Waypoint, TripType } from '@/lib/types';
import { StepsProgress } from '@/components/trips/steps-progress';
import { SegmentedControl } from '@/components/trips/segmented-control';
import { StickyActionBar } from '@/components/trips/sticky-action-bar';
import { WaypointEditor } from '@/components/trips/waypoint-editor';
import { DUR, EASE_OUT_QUART, EASE_OUT, errorShake, stepSlide } from '@/lib/motion';

const STEPS = [
  { key: 'basic', label: '基本', hint: '日期 / 時間' },
  { key: 'staff', label: '人員', hint: '校巴 / 保姆' },
  { key: 'route', label: '路線', hint: '學生 / 站點' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export default function NewTripPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [direction, setDirection] = useState(1);

  // form state
  const [date, setDate] = useState(today());
  const [type, setType] = useState<TripType>('morning');
  const [busId, setBusId] = useState('');
  const [nannyId, setNannyId] = useState('');
  const [plannedStartTime, setPlannedStartTime] = useState('07:30');
  const [plannedEndTime, setPlannedEndTime] = useState('08:30');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Computed
  const buses = useMemo(() => (user ? STORAGE.buses.getByClient(user.clientId || '') : []), [user]);
  const nannies = useMemo(() => (user ? STORAGE.nannies.getByClient(user.clientId || '') : []), [user]);
  const allStudents = useMemo(
    () => (user ? STORAGE.students.getByClient(user.clientId || '').filter((s) => s.status === 'active') : []),
    [user]
  );
  const busStudents = useMemo(() => allStudents.filter((s) => s.busId === busId), [allStudents, busId]);

  // Auto-load students when bus changes
  useEffect(() => {
    if (!busId) {
      setStudentIds([]);
      return;
    }
    setStudentIds(busStudents.map((s) => s.id));
  }, [busId, busStudents.length]);

  // Auto-generate waypoints when students change
  useEffect(() => {
    if (!busId || studentIds.length === 0) {
      setWaypoints([]);
      return;
    }
    const students = allStudents.filter((s) => studentIds.includes(s.id));
    const pickupMap = new Map<string, typeof students>();
    const dropoffMap = new Map<string, typeof students>();

    students.forEach((s) => {
      if (s.pickupLocation) {
        const key = `${s.pickupLocation.latitude},${s.pickupLocation.longitude}`;
        if (!pickupMap.has(key)) pickupMap.set(key, []);
        pickupMap.get(key)!.push(s);
      }
      if (s.dropoffLocation) {
        const key = `${s.dropoffLocation.latitude},${s.dropoffLocation.longitude}`;
        if (!dropoffMap.has(key)) dropoffMap.set(key, []);
        dropoffMap.get(key)!.push(s);
      }
    });

    const next: Waypoint[] = [];
    pickupMap.forEach((stds) => {
      const loc = stds[0].pickupLocation!;
      next.push({
        id: STORAGE.genId('wp'),
        location: { ...loc },
        type: 'pickup',
        scheduledTime: '',
        actualTime: null,
        status: 'pending',
        studentIds: stds.map((s) => s.id),
        notes: null,
      });
    });
    dropoffMap.forEach((stds) => {
      const loc = stds[0].dropoffLocation!;
      next.push({
        id: STORAGE.genId('wp'),
        location: { ...loc },
        type: 'dropoff',
        scheduledTime: '',
        actualTime: null,
        status: 'pending',
        studentIds: stds.map((s) => s.id),
        notes: null,
      });
    });
    setWaypoints(next);
  }, [busId, studentIds.length]);

  const toggleStudent = (id: string) => {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const validateStep = (s: StepKey): boolean => {
    const e: Record<string, string> = {};
    if (s === 'basic') {
      if (!date) e.date = '請選擇日期';
      if (!plannedStartTime) e.start = '請選擇開始時間';
      if (!plannedEndTime) e.end = '請選擇結束時間';
      if (plannedStartTime && plannedEndTime && plannedStartTime >= plannedEndTime) {
        e.end = '結束時間需晚於開始時間';
      }
    }
    if (s === 'staff') {
      if (!busId) e.busId = '請選擇校巴';
      if (!nannyId) e.nannyId = '請選擇保姆';
    }
    if (s === 'route') {
      if (studentIds.length === 0) e.studentIds = '請選擇至少一位學生';
      if (waypoints.length === 0) e.waypoints = '請添加至少一個站點';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    const key = STEPS[stepIndex].key as StepKey;
    if (!validateStep(key)) return;
    if (stepIndex < STEPS.length - 1) {
      setDirection(1);
      const next = stepIndex + 1;
      setStepIndex(next);
      setMaxReached((m) => Math.max(m, next));
      setErrors({});
    } else {
      handleSubmit();
    }
  };

  const goBack = () => {
    if (stepIndex === 0) {
      router.push('/trips');
      return;
    }
    setDirection(-1);
    setStepIndex(stepIndex - 1);
    setErrors({});
  };

  const goToStep = (idx: number) => {
    if (idx <= maxReached && idx !== stepIndex) {
      setDirection(idx > stepIndex ? 1 : -1);
      setStepIndex(idx);
      setErrors({});
    }
  };

  const handleSubmit = () => {
    if (!user) return;
    // Final validation
    if (!validateStep('basic') || !validateStep('staff') || !validateStep('route')) return;
    setSaving(true);
    STORAGE.trips.add({
      id: STORAGE.genId('trip'),
      clientId: user.clientId || '',
      busId,
      nannyId,
      date,
      type,
      status: 'scheduled',
      plannedStartTime,
      plannedEndTime,
      actualStartTime: null,
      actualEndTime: null,
      currentRouteIndex: 0,
      completedStops: [],
      studentIds,
      waypoints,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setSuccess(true);
    setTimeout(() => router.push('/trips'), 650);
  };

  if (!mounted || !user) {
    return (
      <div className="px-4 pt-4 pb-6">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded-2xl" />
          <div className="h-32 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

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
            onClick={goBack}
            aria-label="返回"
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold">新增班次</h1>
            <p className="text-[11px] text-muted-foreground">
              步驟 {stepIndex + 1} / {STEPS.length} · {STEPS[stepIndex].label}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <StepsProgress
            steps={STEPS as any}
            current={stepIndex}
            maxReached={maxReached}
            onStepClick={goToStep}
          />
        </div>
      </motion.div>

      <div className="px-4 pt-4">
        <motion.div
          key={STEPS[stepIndex].key}
          custom={direction}
          variants={stepSlide}
          initial="enter"
          animate="center"
          className="space-y-4"
        >
          {STEPS[stepIndex].key === 'basic' && (
            <StepBasic
              date={date}
              setDate={setDate}
              type={type}
              setType={setType}
              plannedStartTime={plannedStartTime}
              setPlannedStartTime={setPlannedStartTime}
              plannedEndTime={plannedEndTime}
              setPlannedEndTime={setPlannedEndTime}
              errors={errors}
            />
          )}
          {STEPS[stepIndex].key === 'staff' && (
            <StepStaff
              busId={busId}
              setBusId={setBusId}
              nannyId={nannyId}
              setNannyId={setNannyId}
              buses={buses}
              nannies={nannies}
              errors={errors}
            />
          )}
          {STEPS[stepIndex].key === 'route' && (
            <StepRoute
              busId={busId}
              busStudents={busStudents}
              studentIds={studentIds}
              toggleStudent={toggleStudent}
              waypoints={waypoints}
              setWaypoints={setWaypoints}
              errors={errors}
            />
          )}
        </motion.div>
      </div>

      <StickyActionBar
        showBack
        backLabel={stepIndex === 0 ? '取消' : '上一步'}
        onBack={goBack}
        showNext
        nextLabel={stepIndex === STEPS.length - 1 ? '保存班次' : '下一步'}
        onNext={goNext}
        loading={saving}
        success={success}
        nextDisabled={saving}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step panels
// ─────────────────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <motion.p
      variants={errorShake}
      initial="hidden"
      animate="show"
      className="text-[11px] text-destructive flex items-center gap-1 mt-1"
    >
      <AlertCircle className="w-3 h-3" />
      {msg}
    </motion.p>
  );
}

function StepBasic({
  date,
  setDate,
  type,
  setType,
  plannedStartTime,
  setPlannedStartTime,
  plannedEndTime,
  setPlannedEndTime,
  errors,
}: {
  date: string;
  setDate: (v: string) => void;
  type: TripType;
  setType: (v: TripType) => void;
  plannedStartTime: string;
  setPlannedStartTime: (v: string) => void;
  plannedEndTime: string;
  setPlannedEndTime: (v: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Route className="w-3.5 h-3.5 text-primary" />
            </span>
            <h3 className="text-sm font-semibold">班次類型</h3>
          </div>
          <SegmentedControl
            value={type}
            onChange={(v) => setType(v as TripType)}
            options={[
              { value: 'morning', label: tripTypeLabel('morning') },
              { value: 'afternoon', label: tripTypeLabel('afternoon') },
              { value: 'custom', label: tripTypeLabel('custom') },
            ]}
            layoutId="newtrip-type-active"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-primary" />
            </span>
            <h3 className="text-sm font-semibold">日期</h3>
          </div>
          <div className="space-y-1.5">
            <div className="relative">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={cn('h-11 pr-24', errors.date && 'border-destructive')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                {cnWeekday(date)}
              </span>
            </div>
            <FieldError msg={errors.date} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-primary" />
            </span>
            <h3 className="text-sm font-semibold">時間</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>開始</Label>
              <Input
                type="time"
                value={plannedStartTime}
                onChange={(e) => setPlannedStartTime(e.target.value)}
                className={cn('h-11', errors.start && 'border-destructive')}
              />
              <FieldError msg={errors.start} />
            </div>
            <div className="space-y-1.5">
              <Label>結束</Label>
              <Input
                type="time"
                value={plannedEndTime}
                onChange={(e) => setPlannedEndTime(e.target.value)}
                className={cn('h-11', errors.end && 'border-destructive')}
              />
              <FieldError msg={errors.end} />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function StepStaff({
  busId,
  setBusId,
  nannyId,
  setNannyId,
  buses,
  nannies,
  errors,
}: {
  busId: string;
  setBusId: (v: string) => void;
  nannyId: string;
  setNannyId: (v: string) => void;
  buses: any[];
  nannies: any[];
  errors: Record<string, string>;
}) {
  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bus className="w-3.5 h-3.5 text-primary" />
            </span>
            <h3 className="text-sm font-semibold">校巴</h3>
          </div>
          <AriaSelectRoot
            aria-label="選擇校巴"
            selectedKey={busId}
            onSelectionChange={(k) => setBusId((k as string) || '')}
            placeholder="請選擇校巴"
            triggerClassName="h-12 px-4 w-full justify-between text-sm rounded-xl"
            popoverClassName="w-[var(--button-width)]"
          >
            <AriaSelectItem id="" textValue="請選擇校巴">
              <span className="text-sm text-muted-foreground">請選擇校巴</span>
              <SelectedCheck visible={!busId} />
            </AriaSelectItem>
            {buses.map((b) => (
              <AriaSelectItem key={b.id} id={b.id} textValue={`${b.plateNumber} ${b.model}`}>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">{b.plateNumber}</span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {b.model} · 容量 {b.capacity}
                  </span>
                </div>
                <SelectedCheck visible={busId === b.id} />
              </AriaSelectItem>
            ))}
          </AriaSelectRoot>
          <FieldError msg={errors.busId} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary" />
            </span>
            <h3 className="text-sm font-semibold">保姆</h3>
          </div>
          <AriaSelectRoot
            aria-label="選擇保姆"
            selectedKey={nannyId}
            onSelectionChange={(k) => setNannyId((k as string) || '')}
            placeholder="請選擇保姆"
            triggerClassName="h-12 px-4 w-full justify-between text-sm rounded-xl"
            popoverClassName="w-[var(--button-width)]"
          >
            <AriaSelectItem id="" textValue="請選擇保姆">
              <span className="text-sm text-muted-foreground">請選擇保姆</span>
              <SelectedCheck visible={!nannyId} />
            </AriaSelectItem>
            {nannies.map((n) => (
              <AriaSelectItem key={n.id} id={n.id} textValue={`${n.name} ${n.phone}`}>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">{n.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{n.phone}</span>
                </div>
                <SelectedCheck visible={nannyId === n.id} />
              </AriaSelectItem>
            ))}
          </AriaSelectRoot>
          <FieldError msg={errors.nannyId} />
        </CardContent>
      </Card>
    </>
  );
}

function StepRoute({
  busId,
  busStudents,
  studentIds,
  toggleStudent,
  waypoints,
  setWaypoints,
  errors,
}: {
  busId: string;
  busStudents: any[];
  studentIds: string[];
  toggleStudent: (id: string) => void;
  waypoints: Waypoint[];
  setWaypoints: (w: Waypoint[]) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-primary" />
            </span>
            <h3 className="text-sm font-semibold">學生 ({studentIds.length})</h3>
            {studentIds.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {studentIds.length} 位已選
              </span>
            )}
          </div>

          {!busId ? (
            <p className="text-xs text-muted-foreground py-6 text-center">請先選擇校巴</p>
          ) : busStudents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              此校巴目前沒有指派學生
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto -mx-1 px-1">
              {busStudents.map((s) => {
                const selected = studentIds.includes(s.id);
                return (
                  <motion.button
                    key={s.id}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.1, ease: EASE_OUT }}
                    onClick={() => toggleStudent(s.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-colors',
                      selected
                        ? 'bg-primary/10 ring-1 ring-primary/40'
                        : 'bg-muted/40 hover:bg-muted/60'
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                        selected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3.5} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {s.classNumber} · {s.studentId}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
          <FieldError msg={errors.studentIds} />
        </CardContent>
      </Card>

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
            onChange={setWaypoints}
            reorderable
            collapsible
          />
          <FieldError msg={errors.waypoints} />
        </CardContent>
      </Card>
    </>
  );
}
