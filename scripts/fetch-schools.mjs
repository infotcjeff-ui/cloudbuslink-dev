// ============================================================================
//  fetch-schools.mjs — 從 CHSC (家校／學校資訊中心) 抓取全港學校名單
//
//  用途:
//    產生 lib/data/schools.json — 供「新增學生」表單的三段聯動下拉
//    (學校類型 → 18 區 → 學校) 使用。
//
//  資料來源 (政府公開資料平台 data.gov.hk):
//    小學概覽: https://data.gov.hk/tc-data/dataset/chsc-chsc-primary-school-profiles
//    中學概覽: https://data.gov.hk/tc-data/dataset/chsc-chsc-secondary-school-profiles
//
//  為什麼要預先打包成 JSON 而不是執行時即時抓?
//    1. www.chsc.hk 回 403 且沒有 CORS header → 瀏覽器根本無法直接 fetch。
//    2. CSV 檔很大 (小學 3.7MB / 中學 5.4MB, 內含長篇學校特色文字),
//       只取「區域 / 學校名稱 / 類別 / 性別」後精簡到 ~50KB。
//    3. 離線可用 → 選單載入零延遲, 也不會因為 CHSC 掛掉就不能新增學生。
//
//  用法:
//    node scripts/fetch-schools.mjs
//    (需要網絡; 輸出寫到 lib/data/schools.json)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'lib', 'data', 'schools.json');
const CACHE_DIR = path.join(ROOT, '.cache', 'chsc');

/** 每個資料集的來源與欄位映射 */
const DATASETS = [
  {
    key: 'primary',
    label: '小學',
    url: 'https://www.chsc.hk/datagovhk/psp_2026_tc.csv',
    // 小學的類別在兩個欄位: 學校類別1 = 資助/官立/私立/直資, 學校類別2 = 全日/上午
    categoryField: '學校類別1',
  },
  {
    key: 'secondary',
    label: '中學',
    url: 'https://www.chsc.hk/datagovhk/ssp_2025_2026_tc.csv',
    // 中學只有一個 學校類別 欄位: 資助/官立/直資/按位津貼
    categoryField: '學校類別',
  },
];

/* -------------------------------------------------------------------------- */
/*  CSV parser — 支援引號包住的多行欄位                                        */
/* -------------------------------------------------------------------------- */

/**
 * 把 CSV 文字切成「列 → 欄」陣列。
 *
 * 為什麼不用 split(','):
 *   CHSC 的 CSV 有大量欄位含逗號 (例: "中西區,聖公會聖馬太小學,香港上環新街12-20號,...")
 *   而且內容含雙引號與換行 (<br> 標籤)。必須用真正的 CSV 解析器。
 */
function parseCsv(text) {
  // 去掉 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" = 轉義的單一引號
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // 略過 (行尾 CRLF)
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // 收尾 (檔案最後一行未必有換行)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** 解析後的列 → 物件 (第一列當表頭) */
function toObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 0 || (cells.length === 1 && cells[0].trim() === '')) continue;
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = (cells[c] ?? '').trim();
    }
    out.push(obj);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  下載 (含本地快取)                                                          */
/* -------------------------------------------------------------------------- */

async function download(url, cacheName) {
  const cachePath = path.join(CACHE_DIR, cacheName);

  // 若有快取且未過期 (7 天) 就直接用, 避免每次都打 CHSC
  if (fs.existsSync(cachePath)) {
    const ageDays = (Date.now() - fs.statSync(cachePath).mtimeMs) / 86400000;
    if (ageDays < 7) {
      console.log(`  ↺ 使用快取 (${ageDays.toFixed(1)} 天前下載) — ${cacheName}`);
      return fs.readFileSync(cachePath, 'utf8');
    }
  }

  console.log(`  ↓ 下載 ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CloudBusLink/1.0; school-list-updater)',
      Accept: 'text/csv,*/*',
    },
  });
  if (!res.ok) throw new Error(`下載失敗 ${res.status} ${res.statusText} — ${url}`);

  const text = await res.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, text, 'utf8');
  console.log(`  ✓ 取得 ${(text.length / 1024 / 1024).toFixed(2)} MB`);
  return text;
}

/* -------------------------------------------------------------------------- */
/*  主流程                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('=== 抓取全港學校名單 (CHSC / data.gov.hk) ===\n');

  const byDistrict = new Map(); // district → { label, schools: [...] }
  const districtLabels = new Map(); // district → 顯示名稱 (以第一個出現的為準)
  let total = 0;

  for (const ds of DATASETS) {
    console.log(`[${ds.label}]`);
    const text = await download(ds.url, `${ds.key}.csv`);
    const rows = toObjects(parseCsv(text));
    console.log(`  ✓ 解析 ${rows.length} 筆`);

    for (const r of rows) {
      const district = (r['區域'] ?? '').trim();
      const name = (r['學校名稱'] ?? '').trim();
      // 資料完整性: 缺區域或名稱就跳過 (不要產生半截的選項)
      if (!district || !name) continue;

      const category = (r[ds.categoryField] ?? '').trim();
      const gender = (r['學生性別'] ?? '').trim();

      if (!byDistrict.has(district)) {
        byDistrict.set(district, { schools: [] });
      }
      byDistrict.get(district).schools.push({
        t: ds.key, // 'primary' | 'secondary'
        n: name,
        c: category,
        g: gender,
      });
      total++;
    }
    console.log('');
  }

  // 依「18 區」的慣例排序 (港島 → 九龍 → 新界)
  const DISTRICT_ORDER = [
    '中西區', '灣仔區', '香港東區', '香港南區',
    '油尖旺區', '深水埗區', '九龍城區', '黃大仙區', '觀塘區',
    '荃灣區', '屯門區', '元朗區', '北區', '大埔區', '沙田區', '西貢區', '離島區', '葵青區',
  ];

  const districts = [...byDistrict.keys()].sort((a, b) => {
    const ia = DISTRICT_ORDER.indexOf(a);
    const ib = DISTRICT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'zh-HK');
  });

  const payload = {
    version: 1,
    // 資料來源 (供日後追溯 / 更新)
    source: {
      primary: 'https://data.gov.hk/tc-data/dataset/chsc-chsc-primary-school-profiles',
      secondary: 'https://data.gov.hk/tc-data/dataset/chsc-chsc-secondary-school-profiles',
    },
    // 抓取當下的時間 (ISO) — 顯示用, 讓人知道這份名單多新
    fetchedAt: new Date().toISOString(),
    // 區域順序 (18 區)
    districts,
    // district → schools[]
    schools: Object.fromEntries(
      districts.map((d) => [
        d,
        byDistrict.get(d).schools.sort((a, b) => a.n.localeCompare(b.n, 'zh-HK')),
      ]),
    ),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify(payload);
  fs.writeFileSync(OUT_FILE, json, 'utf8');

  const kb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
  console.log('=== 完成 ===');
  console.log(`  學校總數: ${total}`);
  console.log(`  區域數:   ${districts.length}`);
  console.log(`  輸出:     ${path.relative(ROOT, OUT_FILE)} (${kb} KB)`);
  console.log(`  區域:     ${districts.join('、')}`);
}

main().catch((e) => {
  console.error('\n❌ 失敗:', e.message);
  process.exit(1);
});
