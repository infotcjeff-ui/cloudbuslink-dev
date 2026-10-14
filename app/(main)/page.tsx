'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bus as BusIcon, Gauge, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AriaSelectRoot, AriaSelectItem, SelectedCheck } from '@/components/ui/aria-select';
import { STORAGE } from '@/lib/storage';
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

type StatusFilter = 'all' | 'active' | 'maintenance' | 'inactive';

const STATUS_COLORS: Record<string, string> = {
  all: 'bg-gray-400',
  active: 'bg-green-500',
  maintenance: 'bg-amber-500',
  inactive: 'bg-gray-700',
};
const STATUS_LABELS: Record<string, string> = {
  all: '全部狀態',
  active: '運行中',
  maintenance: '維護中',
  inactive: '停用',
};

function latLngToAddress(lat: number, lng: number): string {
  const hash = Math.abs((Math.round(lat * 1000) * 7919) ^ (Math.round(lng * 1000) * 17));
  const areas = [
    '九龍觀塘協和街123號', '九龍黃大仙龍翔道88號',
    '九龍九龍灣德福大廈T2停車場', '九龍鑽石山龍蟠街3號',
    '九龍深水埗長沙灣道200號', '新界沙田大圍車公廟路9號',
    '新界荃灣青山公路264號', '港島西營盤德輔道西271號',
  ];
  return `${hash % 4 === 0 ? '近' : '對面'}${areas[hash % areas.length]}`;
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '剛剛';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

// ─── 小型 memo 元件 ────────────────────────────────────────────────────────────

// 右上角狀態計數列（只在 buses.length 或狀態分布實質變化時重渲染）
// 注意: 不要用 React.memo 包 — Next 14 + RSC payload 對 memo() 包裝的元件
// 序列化時會拋 "Unsupported Server Component type: {...}"，導致整頁崩潰。
function StatusBadgeBar({ buses }: { buses: Bus[] }) {
  const counts = useMemo(() => ({
    total: buses.length,
    active: buses.filter(b => b.status === 'active').length,
    maintenance: buses.filter(b => b.status === 'maintenance').length,
    inactive: buses.filter(b => b.status === 'inactive').length,
  }), [buses]);

  return (
    <div className="flex-1 min-w-0 flex items-center justify-between gap-2 text-[11px] h-9 rounded-full bg-white shadow-md ring-1 ring-black/[0.04] px-4 overflow-hidden">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-muted-foreground">校巴</span>
        <span className="font-semibold text-foreground">{counts.total}</span>
      </span>
      <span className="w-px h-3 bg-gray-200 shrink-0" />
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-muted-foreground">運行</span>
        <span className="font-semibold text-foreground">{counts.active}</span>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="text-muted-foreground">維護</span>
        <span className="font-semibold text-foreground">{counts.maintenance}</span>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-gray-700" />
        <span className="text-muted-foreground">停用</span>
        <span className="font-semibold text-foreground">{counts.inactive}</span>
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
  const options = useMemo(() => buses.map(bus => ({
    id: bus.id,
    plateNumber: bus.plateNumber,
    model: bus.model,
    capacity: bus.capacity,
    status: bus.status,
    dotColor: bus.status === 'active' ? 'bg-green-500'
      : bus.status === 'maintenance' ? 'bg-amber-500'
      : 'bg-gray-700',
  })), [buses]);

  return (
    <AriaSelectRoot<{ value: string }>
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
              {opt.model} · {opt.capacity}座
            </p>
          </div>
          <SelectedCheck visible={selectedBusId === opt.id} />
        </AriaSelectItem>
      ))}
    </AriaSelectRoot>
  );
}

// 工具箱面板
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
  const address = loc ? latLngToAddress(loc.latitude, loc.longitude) : '';
  const timeStr = loc ? new Date(loc.lastUpdated).toLocaleTimeString('zh-HK', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '';
  const statusText = bus.status === 'active'
    ? `GPS 更新於 ${timeStr} (${loc ? timeSince(loc.lastUpdated) : ''})`
    : bus.status === 'maintenance' ? `進入維護: ${timeStr}`
    : `停用於 ${timeStr}`;

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
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              bus.status === 'active' ? 'bg-success/10 text-success'
                : bus.status === 'maintenance' ? 'bg-amber-500/10 text-amber-600'
                : 'bg-muted text-muted-foreground'
            }`}>
              {bus.status === 'active' ? '運行中'
                : bus.status === 'maintenance' ? '維護中' : '停用'}
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

      {loc && (
        <div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
          <div className="p-2.5 bg-muted/30 rounded-xl min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>位置</span>
            </div>
            <p className="text-sm font-medium leading-snug mb-1 truncate">{address}</p>
            <p className="text-[11px] text-muted-foreground truncate">{statusText}</p>
          </div>
          <div className="p-2.5 bg-muted/30 rounded-xl w-[88px] shrink-0 flex flex-col">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
              <Gauge className="w-3.5 h-3.5" />
              <span>速度</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              {bus.status === 'active' && loc.speed != null ? (
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
      )}

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
  const [toolboxHeight, setToolboxHeight] = useState(0);
  const toolboxRef = useRef<HTMLDivElement>(null);

  // ── 初始載入 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const allBuses = STORAGE.buses.getByClient(user.clientId || '');
    setBuses(allBuses);
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

  // ── GPS 模擬更新（每 2 秒）─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') {
        setBuses(prev => {
          // 批次收集要寫入 localStorage 的更新，tick 結束後一次寫完
          // （避免每輛車觸發一次同步 IO）
          const pendingUpdates: Array<{ id: string; currentLocation: NonNullable<Bus['currentLocation']> }> = [];

          const next = prev.map(bus => {
            if (bus.status !== 'active' || !bus.currentLocation) return bus;
            const newLat = bus.currentLocation.latitude + (Math.random() - 0.5) * 0.0002;
            const newLng = bus.currentLocation.longitude + (Math.random() - 0.5) * 0.0002;
            const speed = Math.round(20 + Math.random() * 30);
            const updatedLocation = {
              latitude: newLat,
              longitude: newLng,
              speed,
              lastUpdated: new Date().toISOString(),
            };
            pendingUpdates.push({ id: bus.id, currentLocation: updatedLocation });
            return { ...bus, currentLocation: updatedLocation };
          });

          // 整個 tick 完成後，一次性寫入所有更新（同步批次）
          if (pendingUpdates.length > 0) {
            for (const u of pendingUpdates) {
              STORAGE.buses.update(u.id, { currentLocation: u.currentLocation });
            }
          }
          return next;
        });
      }
      timer = setTimeout(tick, 2000);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  // ── 過濾後的校巴列表（memoize，避免無關 re-render 重算）────────────────
  const filteredBuses = useMemo(() => {
    if (statusFilter === 'all') return buses;
    return buses.filter(b => b.status === statusFilter);
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
  }, []);

  // onSelect 傳給 BusMap — 只建立一次（BusMap 有 memo，不會因它重跑）
  const handleBusMapSelect = useCallback((bus: Bus) => {
    setSelectedBusId(bus.id);
  }, []);

  const handleCloseToolbox = useCallback(() => {
    setSelectedBusId('');
  }, []);

  const handleViewTrips = useCallback(() => {
    if (selectedBus) {
      window.location.href = `/trips?busId=${selectedBus.id}`;
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
      <div data-status-bar className="absolute right-3 left-3 top-3 flex flex-row items-center gap-2.5 z-20">
        <StatusBadgeBar buses={buses} />

        {/* 狀態篩選 */}
        <AriaSelectRoot<{ value: string }>
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
