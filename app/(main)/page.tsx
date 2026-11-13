'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bus as BusIcon, Clock, Gauge, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AriaSelectRoot, AriaSelectItem, SelectedCheck } from '@/components/ui/aria-select';
import { STORAGE, resolveDataScope } from '@/lib/storage';
import { fetchPositionsFrom808, syncFrom808, normPlate } from '@/lib/onefleet';
import { resolveSystemConfig } from '@/lib/system-config';
import { reverseGeocodeZh } from '@/lib/reverse-geocode';
import { BUS_MOTION_META, getBusMotion, type BusMotion } from '@/lib/bus-motion';
import type { Bus } from '@/lib/types';
import { useAuth } from '@/lib/hooks';

// 動態載入地圖組件 — 放在獨立 client component，避免 RSC payload
// 把 next/dynamic 的 LoadableComponent 序列化時拋
// "Unsupported Server Component type: {...}"。
// BusMap 內部自帶「地圖準備中…」loading 遮罩，這裡不需要 fallback。
function BusMapClient(props: { buses: Bus[]; selectedBusId: string; onSelect: (bus: Bus) => void }) {
  const [Comp, setComp] = useState<React.ComponentType<typeof props> | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('@/components/BusMap').then(mod => {
      if (!cancelled) setComp(() => mod.default);
    });
    return () => { cancelled = true; };
  }, []);
  if (!Comp) return null;
  return <Comp {...props} />;
}

// ─── 共用 helpers ───────────────────────────────────────────────────────────────

type StatusFilter = 'all' | BusMotion;

const STATUS_COLORS: Record<StatusFilter, string> = {
  all: 'bg-gray-400',
  driving: BUS_MOTION_META.driving.dot,
  stopped: BUS_MOTION_META.stopped.dot,
  idle: BUS_MOTION_META.idle.dot,
  offline: BUS_MOTION_META.offline.dot,
};
const STATUS_LABELS: Record<StatusFilter, string> = {
  all: '全部狀態',
  driving: BUS_MOTION_META.driving.label,
  stopped: BUS_MOTION_META.stopped.label,
  idle: BUS_MOTION_META.idle.label,
  offline: BUS_MOTION_META.offline.label,
};

/** 是否含中文 — 808 ps 有中文就直接用, 否則走反查 (永不顯示座標) */
function hasCjk(s: string | null | undefined): boolean {
  return !!s && /[\u4e00-\u9fff]/.test(s);
}

/** GPS 更新時間 → 即時 / 少於1分鐘前 / X分鐘前（優先用 808 gt，否則用 lastUpdated） */
function formatGpsAge(loc: NonNullable<Bus['currentLocation']>, now: number): string {
  let t = NaN;
  if (loc.gpsTime) t = Date.parse(String(loc.gpsTime).replace(' ', 'T'));
  if (!Number.isFinite(t)) t = new Date(loc.lastUpdated).getTime();
  if (!Number.isFinite(t)) return '時間未知';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 10) return '即時';
  if (sec < 60) return '少於1分鐘前';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分鐘前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小時前`;
  return `${Math.floor(h / 24)}天前`;
}

// ─── 小型 memo 元件 ────────────────────────────────────────────────────────────

// 右上角狀態計數列（只在 buses.length 或狀態分布實質變化時重渲染）
// 注意: 不要用 React.memo 包 — Next 14 + RSC payload 對 memo() 包裝的元件
// 序列化時會拋 "Unsupported Server Component type: {...}"，導致整頁崩潰。
function StatusBadgeBar({ buses }: { buses: Bus[] }) {
  const counts = useMemo(() => {
    let driving = 0, stopped = 0, idle = 0, offline = 0;
    for (const b of buses) {
      const m = getBusMotion(b);
      if (m === 'driving') driving++;
      else if (m === 'stopped') stopped++;
      else if (m === 'idle') idle++;
      else offline++;
    }
    return { total: buses.length, driving, stopped, idle, offline };
  }, [buses]);

  return (
    <div className="flex-1 min-w-0 flex items-center justify-between gap-2 text-[11px] h-9 rounded-full bg-white shadow-md ring-1 ring-black/[0.04] px-4 overflow-hidden">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-muted-foreground">校巴</span>
        <span className="font-semibold text-foreground">{counts.total}</span>
      </span>
      <span className="w-px h-3 bg-gray-200 shrink-0" />
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-2 h-2 rounded-full ${BUS_MOTION_META.driving.dot}`} />
        <span className="text-muted-foreground">{BUS_MOTION_META.driving.short}</span>
        <span className="font-semibold text-foreground">{counts.driving}</span>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-2 h-2 rounded-full ${BUS_MOTION_META.stopped.dot}`} />
        <span className="text-muted-foreground">{BUS_MOTION_META.stopped.short}</span>
        <span className="font-semibold text-foreground">{counts.stopped}</span>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-2 h-2 rounded-full ${BUS_MOTION_META.idle.dot}`} />
        <span className="text-muted-foreground">{BUS_MOTION_META.idle.short}</span>
        <span className="font-semibold text-foreground">{counts.idle}</span>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-2 h-2 rounded-full ${BUS_MOTION_META.offline.dot}`} />
        <span className="text-muted-foreground">{BUS_MOTION_META.offline.short}</span>
        <span className="font-semibold text-foreground">{counts.offline}</span>
      </span>
    </div>
  );
}

// 校巴選擇下拉（只在 selectedBusId 或 buses 實質變化時重渲染）
function BusSelector({
  buses,
  selectedBusId,
  onSelectionChange,
}: {
  buses: Bus[];
  selectedBusId: string;
  onSelectionChange: (key: string) => void;
}) {
  const options = useMemo(() => buses.map(bus => {
    const motion = getBusMotion(bus);
    return {
      id: bus.id,
      plateNumber: bus.plateNumber,
      model: bus.model,
      capacity: bus.capacity,
      status: bus.status,
      motion,
      motionLabel: BUS_MOTION_META[motion].label,
      dotColor: BUS_MOTION_META[motion].dot,
    };
  }), [buses]);

  return (
    <AriaSelectRoot
      selectedKey={selectedBusId}
      onSelectionChange={(key) => {
        if (typeof key === 'string') onSelectionChange(key);
      }}
      icon={<BusIcon className="w-4 h-4 text-muted-foreground" />}
      triggerClassName="shrink-0 max-w-[180px]"
    >
      <AriaSelectItem id="" textValue="選擇校巴">
        <BusIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm">選擇校巴</span>
        <SelectedCheck visible={!selectedBusId} />
      </AriaSelectItem>
      {options.map(opt => (
        <AriaSelectItem key={opt.id} id={opt.id} textValue={opt.plateNumber}>
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <BusIcon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dotColor}`} />
              <p className="text-sm font-semibold truncate">{opt.plateNumber}</p>
            </div>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {opt.model} · {opt.capacity}座 · {opt.motionLabel}
            </p>
          </div>
          <SelectedCheck visible={selectedBusId === opt.id} />
        </AriaSelectItem>
      ))}
    </AriaSelectRoot>
  );
}

// 工具箱面板 — 所有位置 / 速度 / 地址一律以 808 GPS 為準
// 地址: 808 ps 有中文直接用；無中文 / 英文 / 空 → 反查中文完整地址，永不顯示座標
function BusToolbox({
  bus,
  onClose,
  onViewTrips,
}: {
  bus: Bus;
  onClose: () => void;
  onViewTrips: () => void;
}) {
  const loc = bus.currentLocation;
  const motion = getBusMotion(bus);
  const meta = BUS_MOTION_META[motion];
  const raw808 = (loc?.address || '').trim();
  const [zhAddr, setZhAddr] = useState<string | null>(null);

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

  const address = !loc
    ? '808 暫無定位'
    : hasCjk(raw808) ? raw808 : (zhAddr || '地址解析中…');
  // 相對時間需跟住跳（每 10 秒刷新一次顯示）
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 10000);
    return () => window.clearInterval(t);
  }, []);
  const gpsAge = loc ? formatGpsAge(loc, nowMs) : '808 暫無定位';

  return (
    <div className="liquid-glass rounded-2xl p-4 shadow-2xl animate-slide-up">
      <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-3" />
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BusIcon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base truncate">{bus.plateNumber}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1.5 bg-white border border-gray-200 text-gray-900 font-medium shadow-sm">
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {bus.model} · {bus.capacity}座
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="關閉"
          className="w-8 h-8 rounded-full bg-muted/70 hover:bg-muted flex items-center justify-center shrink-0 active:scale-95 transition"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
        <div className="p-2.5 bg-muted/30 rounded-xl min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
            <MapPin className="w-3.5 h-3.5" />
            <span>位置</span>
          </div>
          <p className="text-sm font-medium leading-snug mb-1 truncate">{address}</p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{gpsAge}</span>
          </div>
        </div>
        <div className="p-2.5 bg-muted/30 rounded-xl w-[88px] shrink-0 flex flex-col">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
            <Gauge className="w-3.5 h-3.5" />
            <span>速度</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            {motion !== 'offline' && loc ? (
              <>
                <span className="text-lg font-bold tabular-nums">{loc.speed}</span>
                <span className="text-[11px] text-muted-foreground">km/h</span>
              </>
            ) : (
              <span className="text-lg font-bold text-muted-foreground/40">—</span>
            )}
          </div>
        </div>
      </div>

      <Button variant="default" className="w-full h-9" onClick={onViewTrips}>
        查看詳情
      </Button>
    </div>
  );
}

// ─── 主頁面 ───────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBusId, setSelectedBusId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [syncError, setSyncError] = useState<string>('');
  const [toolboxHeight, setToolboxHeight] = useState(0);
  const toolboxRef = useRef<HTMLDivElement>(null);

  // ── 初始載入: 以 808 GPS 為準 ─────────────────────
  useEffect(() => {
    if (!user) return;
    // 1) 依資料可見範圍取校巴
    const scope = resolveDataScope(user);
    const allBuses = (scope.isSuperAdmin
      ? STORAGE.buses.getAll()
      : STORAGE.buses.getByClient(scope.clientId)
    );
    // 2) 移除假定位: 沒有綁 808 設備號的車不顯示位置
    // (舊假資料在建立時被寫入 22.3193 / 114.1694 深水埗假座標, 在此清除 —
    //  之後只顯示 808 回傳的真實定位, BusMap 只畫有 currentLocation 的車)
    const cleaned = allBuses.map((b) => {
      if (!b.gpsDeviceId && b.currentLocation) {
        try { STORAGE.buses.update(b.id, { currentLocation: undefined } as Partial<Bus>); } catch { /* noop */ }
        const { currentLocation: _drop, ...rest } = b;
        return rest as Bus;
      }
      return b;
    });
    setBuses(cleaned);
    setSyncError('');
  }, [user]);

  // ── 量工具箱高度 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!toolboxRef.current) return;
    const ro = new ResizeObserver(entries => {
      setToolboxHeight(entries[0]?.contentRect.height ?? 0);
    });
    ro.observe(toolboxRef.current);
    return () => ro.disconnect();
  }, []); // 只測量一次，之後由 selectedBus 控制顯示

  // ── 808 GPS 真實輪詢 (取代舊的 Math.random 模擬) ───────────────────────
  // 所有座標 / 速度 / 地址一律以 808 回傳為準, 本地不再產生任何假數據。
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        if (document.visibilityState === 'visible') {
          const cfg = resolveSystemConfig();
          const refreshMs = Math.max(5, cfg.gps.refreshSeconds || 10) * 1000;
          // 帳密已改為 server-only（經 /api/system-admin/secrets 寫入），前端本地不再持有明文，
          // 不在此預檢帳密，直接打 /api/onefleet，由 server 回真實狀態，避免誤報「未設定」。
          const scope = resolveDataScope(user);
          const all = scope.isSuperAdmin
            ? STORAGE.buses.getAll()
            : STORAGE.buses.getByClient(scope.clientId);
          const ids = all.map((b) => b.gpsDeviceId).filter((x): x is string => !!x);
          // 以車牌配對作後備 (808 nm vs 本機 plateNumber)：
          // 無綁定 deviceId 時不能用 fetchPositionsFrom808([])（會直接回空不打 server），
          // 改用 syncFrom808() 全量拉一次，讓 byPlate 能配對，並自動回填 gpsDeviceId。
          const plates = all.map((b) => b.plateNumber).filter(Boolean);
          if (ids.length === 0 && plates.length === 0) {
            timer = setTimeout(poll, refreshMs);
            return;
          }
          // 有車未綁 deviceId 時必須全量拉（只查已綁 id 會漏掉未綁車的車牌配對），否則 SY92 這類車永遠沒針。
          const needsFullSync = all.some((b) => !b.gpsDeviceId && b.plateNumber);
          const res = needsFullSync
            ? await syncFrom808()
            : await fetchPositionsFrom808(ids);
          if (cancelled) return;
          if (!res.ok) {
            setSyncError(res.error || '808 同步失敗');
          } else {
            // 缺帳密時 server 回 ok:false 已在上面處理；若全空但 server 有車，byPlate 仍可配對
            setSyncError('');
            // 用每輪新鮮讀到的 all 重建（不用 prev.map）：否則在 settings/buses 新增的車
            // homepage 不刷新永遠看不到，React state 會和 localStorage 越差越遠。
            const next = all.map((item) => {
                let bus = item;
                let pos = bus.gpsDeviceId ? res.byDeviceId[bus.gpsDeviceId] : undefined;
                if (!pos && bus.plateNumber) pos = res.byPlate[normPlate(bus.plateNumber)];
                // 車牌配對成功但本地尚未綁 deviceId → 自動回填，下輪直接用 id 查更快
                if (pos && !bus.gpsDeviceId && (pos as { deviceId?: string }).deviceId) {
                  const devId = (pos as { deviceId?: string }).deviceId as string;
                  try { STORAGE.buses.update(bus.id, { gpsDeviceId: devId } as Partial<Bus>); } catch { /* noop */ }
                  bus = { ...bus, gpsDeviceId: devId };
                }
                if (!pos) {
                  // 808 無此車定位 → 不顯示假位置 (與 808 console 一致: 離線/未上線就不畫)
                  if (bus.currentLocation) {
                    try { STORAGE.buses.update(bus.id, { currentLocation: undefined } as Partial<Bus>); } catch { /* noop */ }
                    const { currentLocation: _drop, ...rest } = bus;
                    return rest as Bus;
                  }
                  return bus;
                }
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
                return { ...bus, currentLocation: loc };
            });
            setBuses(next);
          }
          timer = setTimeout(poll, refreshMs);
          return;
        }
      } catch (e) {
        console.warn('[HomePage] 808 輪詢失敗:', e);
      }
      const fallbackMs = Math.max(5, resolveSystemConfig().gps.refreshSeconds || 10) * 1000;
      timer = setTimeout(poll, fallbackMs);
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  // ── 過濾後的校巴列表（memoize，避免無關 re-render 重算）────────────────
  // 狀態篩選用的是即時動態四態（行駛/靜止/怠速/離線），不是車輛檔案 status
  const filteredBuses = useMemo(() => {
    if (statusFilter === 'all') return buses;
    return buses.filter(b => getBusMotion(b) === statusFilter);
  }, [buses, statusFilter]);

  // ── 選中的校巴完整物件（直接用 ref 查，不觸發 re-render）───────────────
  const selectedBus = useMemo(
    () => (selectedBusId ? buses.find(b => b.id === selectedBusId) ?? null : null),
    [buses, selectedBusId],
  );

  // ── 穩定的 callback（不重複建立，保護 memo 的 comparator）──────────────
  const handleStatusChange = useCallback((key: React.Key | null) => {
    if (key) setStatusFilter(key as StatusFilter);
  }, []);

  const handleBusSelect = useCallback((key: React.Key | null) => {
    const busId = key as string;
    setSelectedBusId(busId || '');
    if (busId) {
      try {
        const b = STORAGE.buses.getById(busId);
        const raw = localStorage.getItem('cbl_auth');
        const u = raw ? JSON.parse(raw) : null;
        import('@/lib/admin-telemetry').then((m) => {
          m.logGpsView(u ? { id: u.id, name: u.name } : null, { deviceId: b?.gpsDeviceId, plate: b?.plateNumber });
        }).catch(() => {});
      } catch { /* 遙測失敗不影響主流程 */ }
    }
  }, []);

  // onSelect 傳給 BusMap — 只建立一次（BusMap 有 memo不會因它重跑）
  const handleBusMapSelect = useCallback((bus: Bus) => {
    setSelectedBusId(bus.id);
    try {
      const raw = localStorage.getItem('cbl_auth');
      const u = raw ? JSON.parse(raw) : null;
      import('@/lib/admin-telemetry').then((m) => {
        m.logGpsView(u ? { id: u.id, name: u.name } : null, { deviceId: bus.gpsDeviceId, plate: bus.plateNumber });
      }).catch(() => {});
    } catch { /* 遙測失敗不影響主流程 */ }
  }, []);

  const handleCloseToolbox = useCallback(() => {
    setSelectedBusId('');
  }, []);

  const handleViewTrips = useCallback(() => {
    if (selectedBus) {
      window.location.href = `/bus/${selectedBus.id}`;
    }
  }, [selectedBus]);

  return (
    <div
      className="relative w-full bg-muted overflow-hidden no-scrollbar"
      style={{ height: 'calc(100dvh - 3.8125rem)' }}
    >
      {/* ── 地圖（client 端 lazy import 完才掛上,BusMap 內部自帶 loading 遮罩） */}
      <BusMapClient
        buses={filteredBuses}
        selectedBusId={selectedBusId}
        onSelect={handleBusMapSelect}
      />

      {/* ── 右上 UI 區（data-status-bar 供 resize 量測）────────────── */}
      {/* 選中校巴 focus 時淡出收起（只留工具箱 + 地圖），關閉後淡入回來 */}
      <div
        data-status-bar
        className={`absolute right-3 left-3 top-3 flex flex-row items-center gap-2.5 z-20 transition-all duration-300 ${
          selectedBusId
            ? 'opacity-0 -translate-y-2 pointer-events-none'
            : 'opacity-100 translate-y-0'
        }`}
      >
        <StatusBadgeBar buses={buses} />

        {/* 狀態篩選 */}
        <AriaSelectRoot
          selectedKey={statusFilter}
          onSelectionChange={handleStatusChange}
          icon={<span className="w-2.5 h-2.5 rounded-full bg-white border border-gray-200 shrink-0" />}
          triggerClassName="shrink-0"
        >
          {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map(key => (
            <AriaSelectItem key={key} id={key} textValue={STATUS_LABELS[key]}>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[key]}`} />
              <span className="flex-1 truncate text-sm">{STATUS_LABELS[key]}</span>
              <SelectedCheck visible={statusFilter === key} />
            </AriaSelectItem>
          ))}
        </AriaSelectRoot>

        {/* 校巴選擇 */}
        <BusSelector
          buses={buses}
          selectedBusId={selectedBusId}
          onSelectionChange={handleBusSelect}
        />
      </div>

      {/* 808 未設定提示 */}
      {syncError && (
        <div className="absolute left-3 bottom-24 z-20 max-w-[480px] rounded-xl bg-amber-50/95 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200 shadow">
          {syncError}
        </div>
      )}

      {/* ── 工具箱（選中校巴時浮現）────────────────────────────────── */}
      {selectedBus && (
        <div ref={toolboxRef} className="absolute bottom-24 left-0 right-0 mx-auto w-[75%] z-30 max-w-[480px]">
          <BusToolbox
            bus={selectedBus}
            onClose={handleCloseToolbox}
            onViewTrips={handleViewTrips}
          />
        </div>
      )}
    </div>
  );
}
