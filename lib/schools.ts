// ============================================================================
//  lib/schools.ts — 全港學校名單 (小學 / 中學 × 18 區)
//
//  資料來源 (政府公開資料平台 data.gov.hk / CHSC):
//    小學概覽: https://data.gov.hk/tc-data/dataset/chsc-chsc-primary-school-profiles
//    中學概覽: https://data.gov.hk/tc-data/dataset/chsc-chsc-secondary-school-profiles
//
//  為什麼是「打包好的靜態 JSON」而不是執行時抓?
//    1. www.chsc.hk 回 403 且沒有 CORS header → 瀏覽器無法直接 fetch。
//    2. 原始 CSV 含大量長篇校情文字 (小學 3.7MB / 中學 5.4MB),
//       只取「區域 / 學校名稱 / 類別 / 性別」後精簡到 ~70KB。
//    3. 離線可用 → 選單載入零延遲, CHSC 掛掉也不影響新增學生。
//
//  更新方式: node scripts/fetch-schools.mjs
// ============================================================================

import schoolsData from './data/schools.json';

/** 學校類型 — 小學 / 中學 */
export type SchoolType = 'primary' | 'secondary';

/** 18 區 */
export type SchoolDistrict = string;

/** 單一學校 (精簡欄位) */
export interface School {
  /** 'primary' = 小學, 'secondary' = 中學 */
  t: SchoolType;
  /** 學校名稱 */
  n: string;
  /** 類別 (資助 / 官立 / 私立 / 直資 / 按位津貼) */
  c: string;
  /** 學生性別 (男 / 女 / 男女) */
  g: string;
}

interface SchoolsPayload {
  version: number;
  source: { primary: string; secondary: string };
  fetchedAt: string;
  districts: SchoolDistrict[];
  schools: Record<SchoolDistrict, School[]>;
}

const payload = schoolsData as unknown as SchoolsPayload;

/** 資料抓取時間 (ISO) — 顯示用, 讓人知道這份名單多新 */
export const SCHOOLS_FETCHED_AT = payload.fetchedAt;

/** 資料來源連結 */
export const SCHOOLS_SOURCE = payload.source;

/** 18 區 (已按港島 → 九龍 → 新界排序) */
export const HK_DISTRICTS: readonly SchoolDistrict[] = payload.districts;

/** 學校類型的顯示名稱 */
export const SCHOOL_TYPE_LABEL: Record<SchoolType, string> = {
  primary: '小學',
  secondary: '中學',
};

/** 學校類型選項 (供下拉使用) */
export const SCHOOL_TYPE_OPTIONS: { value: SchoolType; label: string }[] = [
  { value: 'primary', label: '小學' },
  { value: 'secondary', label: '中學' },
];

/* -------------------------------------------------------------------------- */
/*  查詢 helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * 取某區的某類型學校。
 *
 * 回傳新陣列 (每次呼叫都 copy) — 呼叫端若排序不會污染原始資料。
 */
export function getSchoolsByDistrict(
  district: SchoolDistrict,
  type: SchoolType,
): School[] {
  const list = payload.schools[district];
  if (!list) return [];
  return list.filter((s) => s.t === type);
}

/**
 * 某區是否還有某類型的學校。
 *
 * 用於「學校」下拉在未選區域時的 disabled 狀態。
 */
export function hasSchoolsInDistrict(
  district: SchoolDistrict,
  type: SchoolType,
): boolean {
  return getSchoolsByDistrict(district, type).length > 0;
}

/**
 * 找出某區某類型中, 名稱完全相同的學校 (用於驗證不會撞名)。
 *
 * 「區域 + 類型 + 名稱」在資料集內唯一 (已於抓取時驗證過)。
 */
export function findSchool(
  district: SchoolDistrict,
  type: SchoolType,
  name: string,
): School | undefined {
  return getSchoolsByDistrict(district, type).find((s) => s.n === name);
}

/**
 * 驗證「類型 + 區域 + 學校」組合是否有效。
 *
 * 回傳錯誤訊息字串; 有效則回傳 null。
 *
 * ⚠️ refs: 使用者可以「就地新增」自訂的區域 / 學校 (不在 CHSC 名單內)。
 *   那些值對系統來說是合法的 → 驗證時必須放行, 否則表單永遠存不了。
 */
export function validateSchoolSelection(
  type: string,
  district: string,
  name: string,
  refs?: SchoolSelectionRefs,
): string | null {
  if (!type) return '請選擇「學校類型」';
  if (!district) return '請選擇「區域」';
  if (!name) return '請選擇「學校」';
  if (!isSchoolType(type)) return '學校類型無效';

  // 區域: 18 區之一, 或是使用者自訂的區域
  const knownDistrict =
    HK_DISTRICTS.includes(district) ||
    (refs?.customDistricts ?? []).includes(district);
  if (!knownDistrict) return '區域無效';

  // 學校: 系統名單內, 或是使用者自訂的學校 (同類型 + 同區域)
  if (findSchool(district, type, name)) return null;
  const isCustom = (refs?.customSchools ?? []).some(
    (s) => s.type === type && s.district === district && s.name === name,
  );
  if (!isCustom) return '該區找不到這間學校';
  return null;
}

/* -------------------------------------------------------------------------- */
/*  使用者自訂的區域 / 學校                                                       */
/* -------------------------------------------------------------------------- */

/** 一筆「使用者自訂」的學校 (不在 CHSC 系統名單內) */
export interface CustomSchoolRef {
  /** 類型 (小學 / 中學) */
  type: SchoolType;
  /** 區域 */
  district: string;
  /** 學校名稱 */
  name: string;
}

/** 驗證 / 顯示時需要的「自訂值」清單 */
export interface SchoolSelectionRefs {
  /** 自訂區域名稱 */
  customDistricts: readonly string[];
  /** 自訂學校 */
  customSchools: readonly CustomSchoolRef[];
}

/**
 * 從「學生紀錄」反推哪些區域 / 學校是使用者自訂的。
 *
 * 為什麼不另外建一張自訂名單表?
 *   自訂的區域 / 學校最終一定會寫在某位學生的 school_district / school_name 上,
 *   而學生本身就會同步到雲端 (換裝置也看得見)。
 *   → 直接從學生紀錄反推, 不需要額外的持久化層, 也不會出現
 *     「名單裡有這個自訂區域, 但沒有任何學生用它」的孤兒資料。
 *
 * @param students 學生清單 (只需 schoolType / schoolDistrict / schoolName)
 */
export function collectCustomSchools(
  students: Array<{
    schoolType?: string | null;
    schoolDistrict?: string | null;
    schoolName?: string | null;
  }>,
): { districts: string[]; schools: CustomSchoolRef[] } {
  const districts = new Set<string>();
  const schools = new Map<string, CustomSchoolRef>();

  for (const s of students) {
    const district = (s.schoolDistrict ?? '').trim();
    const name = (s.schoolName ?? '').trim();
    const rawType = (s.schoolType ?? '').trim();
    if (!district || !name || !isSchoolType(rawType)) continue;

    // 區域不在 18 區內 → 使用者自訂
    if (!HK_DISTRICTS.includes(district)) districts.add(district);

    // 學校不在系統名單內 → 使用者自訂
    if (findSchool(district, rawType, name)) continue;
    const key = `${rawType}|${district}|${name}`;
    if (!schools.has(key)) {
      schools.set(key, { type: rawType, district, name });
    }
  }

  return { districts: [...districts], schools: [...schools.values()] };
}

/**
 * 這個 (區域, 類型, 學校) 是否屬於系統預設名單。
 *
 * 用於表格 / 摘要上標示「自訂」值。
 */
export function isSystemSchool(
  district: string,
  type: string,
  name: string,
): boolean {
  if (!isSchoolType(type)) return false;
  return Boolean(findSchool(district, type, name));
}

/** 型別守衛 */
export function isSchoolType(v: string): v is SchoolType {
  return v === 'primary' || v === 'secondary';
}

/**
 * 取得某類型在某區的統計 (供 UI 顯示「該區有 N 間小學」)
 */
export function countSchoolsInDistrict(
  district: SchoolDistrict,
  type: SchoolType,
): number {
  return getSchoolsByDistrict(district, type).length;
}

/* -------------------------------------------------------------------------- */
/*  合併「系統名單 + 使用者自訂」                                               */
/* -------------------------------------------------------------------------- */

/**
 * 某個區域底下 (某類型) 的所有學校 — 系統名單 + 使用者自訂。
 *
 * 系統名單的在前 (依原本順序), 自訂的接在後面 (依名稱排序)。
 */
export function getAllSchoolsInDistrict(
  district: SchoolDistrict,
  type: SchoolType,
  refs?: SchoolSelectionRefs,
): School[] {
  const system = getSchoolsByDistrict(district, type);
  const custom = (refs?.customSchools ?? [])
    .filter((c) => c.district === district && c.type === type)
    .map((c) => ({ t: c.type, n: c.name, c: '', g: '' }));
  if (custom.length === 0) return system;
  return [...system, ...custom];
}

/**
 * 所有區域 — 18 區 + 使用者自訂的區域。
 *
 * 自訂區域接在 18 區之後 (依名稱排序), 方便辨識。
 */
export function getAllDistricts(refs?: SchoolSelectionRefs): SchoolDistrict[] {
  const custom = (refs?.customDistricts ?? [])
    .filter((d) => !HK_DISTRICTS.includes(d))
    .slice()
    .sort((a, b) => a.localeCompare(b, 'zh-HK'));
  return custom.length === 0
    ? [...HK_DISTRICTS]
    : [...HK_DISTRICTS, ...custom];
}
