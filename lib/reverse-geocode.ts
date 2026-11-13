/**
 * lib/reverse-geocode.ts — 經緯度 → 中文完整地址 (校巴詳情頁位置顯示用)
 *
 * 點解要做: 808 ps 有時係空 / 英文 / 得個區名, 用戶要求一律顯示中文完整地址, 唔要 "22.44,114.03"。
 * 對準 808 格式: 中文地址由大到細 (香港新界元朗區朗和路1號), 同 808 ps 寫法一致,
 * 之前版本由細到大拼 (朗和路1元朗區香港中國) 所以睇落好怪。
 *
 * 策略: Nominatim addressdetails (開 CORS, accept-language=zh-Hant) 主力取路名級詳細地址
 *        → BigDataCloud 兜底 (免 key)。
 * 結果 memory cache, 失敗回 null (呼叫端顯示「地址解析中…」, 永不顯示座標)。
 */

const cache = new Map<string, string | null>();

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

interface NominatimAddr {
  house_number?: string;
  road?: string;
  street?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  hamlet?: string;
  residential?: string;
  quarter?: string;
  city_district?: string;
  district?: string;
  county?: string;
  city?: string;
  town?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

/** Nominatim 有時回中英夾雜 (例: "Long Yat Road;朗和路"), 只拎中文嗰截 */
function pickZh(s: string | null | undefined): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  if (!/[\u4e00-\u9fff]/.test(t)) return t; // 純英文 (例: Yuen Long) 照留, 上層再處理
  // 有分隔符 → 揀含中文嗰節
  for (const sep of [';', '/', '|', ',']) {
    if (t.includes(sep)) {
      const segs = t.split(sep).map((x) => x.trim()).filter(Boolean);
      const zh = segs.find((x) => /[\u4e00-\u9fff]/.test(x));
      if (zh) return zh;
    }
  }
  // 混埋一齊 (例: "Long Yat Road朗和路") → 抽中文連續段
  const m = t.match(/[\u4e00-\u9fff][\u4e00-\u9fff0-9號路街巷道段村鄉鎮區市里園邨苑廈中心廣場]*[號路街巷道村]?/g);
  if (m && m.length > 0) {
    // 揀最長嗰段 (通常係路名)
    let best = m[0];
    for (const c of m) if (c.length > best.length) best = c;
    return best;
  }
  return t;
}

function buildFullZh(a: NominatimAddr, displayNameFallback: string): string | null {
  const pick = (...keys: (keyof NominatimAddr)[]): string => {
    for (const k of keys) {
      const s = pickZh(String(a[k] ?? ''));
      if (s) return s;
    }
    return '';
  };
  const road = pick('road', 'street');
  let no = pick('house_number').replace(/\s+/g, '');
  // 門牌加「號」 (1 → 1號; 1號 / 1A 唔重加)
  if (no && /^\d+[A-Za-z]?$/.test(no)) no = `${no}號`;
  const streetPart = road ? `${road}${no}` : no;
  const mid = pick('neighbourhood', 'residential', 'quarter', 'suburb', 'village', 'hamlet');
  const district = pick('city_district', 'district', 'county');
  const city = pick('city', 'town', 'state');
  let country = pickZh(String(a.country ?? ''));
  // 香港地址習慣唔寫「中國」做頭, 丟走佢 (Nominatim 成日回 country=中國)
  if (/^(中國|中国|China)$/i.test(country)) country = '';
  // 由大到細拼 (同 808 ps 一致): 香港 + 新界 + 元朗區 + ... + 朗和路1號
  const parts = [country, city, district, mid, streetPart].map((s) => s.trim()).filter(Boolean);
  // 去重 + 去包含 (例: city=香港, district=香港島 → 唔好變「香港香港島」? 保留, 因為唔同級)
  const uniq: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (uniq.includes(p)) continue;
    // 細級已包含大級全名 (例: district=元朗區, mid=元朗) → 唔重複加 mid
    if (uniq.some((u) => p.length < u.length && u.includes(p))) continue;
    uniq.push(p);
  }
  if (uniq.join('').replace(/[、,\s]/g, '').length >= 2) {
    // 純英文 district (Yuen Long) → 嘗試用 fallback 中文
    if (!/[\u4e00-\u9fff]/.test(uniq.join(''))) {
      const fb = buildFromDisplayName(displayNameFallback);
      if (fb) return fb;
    }
    return uniq.join('');
  }
  return buildFromDisplayName(displayNameFallback);
}

/** display_name 例: "1, 朗和路, 元朗, 新界, 香港, 中國" (由細到大) → 反轉由大到細 */
function buildFromDisplayName(displayName: string): string | null {
  const d = String(displayName || '').trim();
  if (!d) return null;
  const segs = d
    .split(',')
    .map((s) => pickZh(s.trim()))
    .filter(Boolean)
    // 丟走郵編 / 純數字座標類雜訊
    .filter((s) => !/^\d{5,}$/.test(s));
  if (segs.length === 0) return null;
  // 丟走 中國/China, 反轉由大到細
  const filtered = segs.filter((s) => !/^(中國|中国|China|中華人民共和國)$/i.test(s));
  const ordered = filtered.reverse();
  // 去重 (相鄰同名)
  const uniq = ordered.filter((p, i) => ordered.indexOf(p) === i);
  let out = uniq.join('');
  // 尾字係純數字門牌 → 補「號」
  if (/\d$/.test(out) && !/[號A-Za-z]$/.test(out)) out += '號';
  return out.length >= 2 ? out : null;
}

export async function reverseGeocodeZh(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  let out: string | null = null;

  // 1) Nominatim 詳細地址 (主力)
  try {
    const j = (await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh-Hant`,
      8000,
    )) as { address?: NominatimAddr; display_name?: string } | null;
    if (j?.address) {
      out = buildFullZh(j.address, String(j.display_name || ''));
    } else if (j?.display_name) {
      out = buildFullZh({}, String(j.display_name));
    }
  } catch { /* 跌落 BigDataCloud */ }

  // 2) BigDataCloud 兜底 (由大到細)
  if (!out) {
    try {
      const j = (await fetchJson(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`,
        8000,
      )) as { city?: string; locality?: string; principalSubdivision?: string } | null;
      if (j) {
        const parts: string[] = [];
        for (const p of [j.principalSubdivision, j.city, j.locality]) {
          const s = pickZh(p || '');
          if (s && !parts.includes(s)) parts.push(s);
        }
        if (parts.join('').length >= 2) out = parts.join('');
      }
    } catch { /* 保持 null */ }
  }

  cache.set(key, out);
  return out;
}
