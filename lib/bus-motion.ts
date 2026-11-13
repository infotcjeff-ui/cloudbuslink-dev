import type { Bus } from '@/lib/types';

/**
 * lib/bus-motion.ts — 主頁地圖用的「即時動態」四態
 * ─────────────────────────────────────────────
 * 行駛中 driving → 綠色 (速度 >= 5 km/h 進入，跌回 < 3 才退出，有遲滯防抖)
 * 靜止 stopped  → 藍色 (速度 == 0 且持續超過 STOP_CONFIRM_MS，在線)
 * 怠速 idle     → 橙色 (0 < 速度 < 5 蠕行，或者短暫停車未滿 STOP_CONFIRM_MS)
 * 離線 offline  → 灰色 (無定位 / 設備離線 / 資料過期 / 非 active)
 *
 * 點解短暫停車唔直接判靜止：
 * 行駛中遇到紅燈 / 上落客停十幾秒，GPS 速度會瞬間變 0。
 * 如果即時轉藍色圓點，架車一開又要跳返綠箭頭，睇落好敏感、pin 閃嚟閃去。
 * 所以速度歸零後先當「怠速」(橙箭頭，唔轉形狀)，停夠 STOP_CONFIRM_MS
 * 先轉「靜止」(藍圓點)。起步則即時反應，唔等。
 *
 * 為什麼放這裡: 主頁 pin / 狀態列 / 篩選 / 下拉 / 工具箱 badge
 * 五個地方都要同一套判斷, 集中一處避免各寫各的閾值打架。
 */

export type BusMotion = 'driving' | 'stopped' | 'idle' | 'offline';

/** 進入行駛中的速度閾值 (km/h) */
export const DRIVING_SPEED_KMH = 5;
/** 行駛中退出到怠速的閾值 (km/h，比進入低，遲滯防 4-6 來回跳) */
export const DRIVING_EXIT_KMH = 3;
/** 短暫停車幾耐先算真靜止 (ms)。紅燈 / 上落客一般 < 60s，繼續顯示怠速 */
export const STOP_CONFIRM_MS = 60_000;
/** 定位超過幾分鐘沒更新就視為離線 */
export const STALE_MINUTES = 10;

export const BUS_MOTION_META: Record<BusMotion, { label: string; short: string; dot: string; hex: string }> = {
  driving: { label: '行駛中', short: '行駛', dot: 'bg-green-500', hex: '#22c55e' },
  stopped: { label: '靜止', short: '靜止', dot: 'bg-blue-500', hex: '#3b82f6' },
  idle: { label: '怠速', short: '怠速', dot: 'bg-orange-500', hex: '#f97316' },
  offline: { label: '離線', short: '離線', dot: 'bg-gray-400', hex: '#9ca3af' },
};

// 每架車上一幀動態 + 速度歸零起點（短暫停車防抖用，唔使等齊 60 秒先轉靜止）
const motionCache = new Map<string, { motion: BusMotion; zeroSince: number | null }>();

export function getBusMotion(bus: Bus): BusMotion {
  const now = Date.now();
  const loc = bus.currentLocation;
  let entry = motionCache.get(bus.id);
  if (!entry) {
    entry = { motion: 'offline', zeroSince: null };
    motionCache.set(bus.id, entry);
  }
  const set = (m: BusMotion): BusMotion => {
    entry.motion = m;
    return m;
  };

  if (bus.status !== 'active') {
    entry.zeroSince = null;
    return set('offline');
  }
  if (!loc) {
    entry.zeroSince = null;
    return set('offline');
  }
  if (loc.online === false) {
    entry.zeroSince = null;
    return set('offline');
  }
  // 資料過期 (輪詢正常時 lastUpdated 每次都會刷新, 卡住即代表掉線)
  const age = now - new Date(loc.lastUpdated).getTime();
  if (Number.isFinite(age) && age > STALE_MINUTES * 60 * 1000) {
    entry.zeroSince = null;
    return set('offline');
  }
  const sp = loc.speed ?? 0;
  // 起步 / 行駛：即時反應，唔等
  if (sp >= DRIVING_SPEED_KMH) {
    entry.zeroSince = null;
    return set('driving');
  }
  // 遲滯：上次係行駛中，速度未跌穿退出線就當仲行緊
  // (4-6 km/h 來回跳唔會綠↔橙閃)
  if (entry.motion === 'driving' && sp >= DRIVING_EXIT_KMH) {
    entry.zeroSince = null;
    return set('driving');
  }
  // 蠕行 / 怠速
  if (sp > 0) {
    entry.zeroSince = null;
    return set('idle');
  }
  // sp == 0：短暫停車（紅燈 / 上落客）先當怠速，停夠先轉靜止
  if (entry.motion === 'stopped') return set('stopped');
  if (entry.zeroSince == null) {
    // 用 808 上傳時間回推停車起點：停咗好耐嘅車 reload 唔使再等 60 秒
    let z = now;
    const g = loc.gpsTime ? Date.parse(String(loc.gpsTime).replace(' ', 'T')) : NaN;
    if (Number.isFinite(g) && g <= now) z = Math.min(now, g);
    entry.zeroSince = z;
  }
  if (now - entry.zeroSince >= STOP_CONFIRM_MS) return set('stopped');
  return set('idle');
}
