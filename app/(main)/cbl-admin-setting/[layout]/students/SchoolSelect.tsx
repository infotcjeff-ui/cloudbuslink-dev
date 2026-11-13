'use client';

/**
 * SchoolSelect — 「學校類型 → 區域 → 學校」三段聯動下拉
 *
 * 用途:
 *   新增/編輯學生時選擇就讀學校。資料來源是 CHSC 公開資料集
 *   (小學概覽 / 中學概覽), 打包在 lib/data/schools.json (見 lib/schools.ts)。
 *
 * 聯動邏輯:
 *   1. 選「小學 / 中學」→ 重置區域與學校
 *   2. 選「區域」→ 重置學校
 *   3. 「學校」下拉只列出「該區 + 該類型」的學校
 *
 * 搜尋 + 自訂新增 (2026-11):
 *   - 「區域」「學校」兩個欄位改用 SearchableSelect (可搜尋 + 可就地新增)
 *   - 使用者可以新增系統名單沒有的區域 / 學校 (例如新開的國際學校、外地學校)
 *   - 自訂值以**紫色字**標示 (trigger 與下拉清單都是), 與系統預設值區分
 *   - 自訂值存進學生的 school_district / school_name →
 *     下次編輯時由 collectCustomSchools() 反推回來, 繼續顯示為自訂值
 *
 * 設計:
 *   - 類型仍用 shadcn/ui Base Select (Radix) — 只有 2 個選項, 不需要搜尋
 *   - 區域 / 學校用自刻的 SearchableSelect (Radix Select 放不進 <input>)
 *   - 學校下拉選項附上類別 + 性別 (例: 「聖公會聖馬太小學 · 資助 · 男女」)
 *
 * 範圍: 僅 /cbl-admin-setting/ 內使用。
 */

import * as React from 'react';
import { MapPin, Info } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn-select';
import {
  HK_DISTRICTS,
  SCHOOL_TYPE_OPTIONS,
  SCHOOL_TYPE_LABEL,
  getAllDistricts,
  getAllSchoolsInDistrict,
  getSchoolsByDistrict,
  isSchoolType,
  type CustomSchoolRef,
  type School,
  type SchoolSelectionRefs,
  type SchoolType,
} from '@/lib/schools';
import { SearchableSelect } from './SearchableSelect';

/* -------------------------------------------------------------------------- */
/*  FieldLabel — 表單欄位標籤 (樣式對齊 StudentFormModal 的 LabeledInput)       */
/* -------------------------------------------------------------------------- */

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400"
    >
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  SchoolSelect                                                               */
/* -------------------------------------------------------------------------- */

export interface SchoolSelectProps {
  /** 目前選的類型 ('' = 未選) */
  schoolType: string;
  /** 目前選的區域 ('' = 未選) */
  schoolDistrict: string;
  /** 目前選的學校 ('' = 未選) */
  schoolName: string;
  onChange: (next: {
    schoolType: string;
    schoolDistrict: string;
    schoolName: string;
  }) => void;
  /** 必填標記 */
  required?: boolean;
  /** 錯誤訊息 (顯示在整組欄位下方) */
  error?: string | null;
  /** 欄位被碰過 (blur 後才顯示錯誤) */
  showError?: boolean;
  /**
   * 使用者自訂的區域 / 學校 (由父層從學生清單反推)。
   * 傳入後, 這些值會出現在下拉清單裡, 並以紫色字標示。
   */
  refs?: SchoolSelectionRefs;
  /**
   * 使用者「就地新增」了區域 / 學校時回呼。
   *
   * 為什麼需要: 新增的值還沒存進任何學生紀錄 → 父層的 collectCustomSchools()
   * 反推不到 → validateSchoolSelection() 會擋下來, 表單永遠存不了。
   * → 父層要自己把「本次新增」的值記下來, 併入驗證用的 refs。
   */
  onCreateCustom?: (created: {
    district?: string;
    school?: { type: SchoolType; district: string; name: string };
  }) => void;
}

export function SchoolSelect({
  schoolType,
  schoolDistrict,
  schoolName,
  onChange,
  required = true,
  error,
  showError = false,
  refs,
  onCreateCustom,
}: SchoolSelectProps) {
  const type = isSchoolType(schoolType) ? schoolType : null;

  // 該區的學校清單 (依類型過濾) — 系統名單 + 自訂
  const schools = React.useMemo(() => {
    if (!type || !schoolDistrict) return [];
    return getAllSchoolsInDistrict(schoolDistrict, type, refs);
  }, [type, schoolDistrict, refs]);

  /** 系統名單 (不含自訂) — 用來判斷某個值是不是自訂的 */
  const systemSchoolNames = React.useMemo(() => {
    if (!type || !schoolDistrict) return new Set<string>();
    return new Set(getSchoolsByDistrict(schoolDistrict, type).map((s) => s.n));
  }, [type, schoolDistrict]);

  /** 區域清單 (18 區 + 自訂) */
  const districts = React.useMemo(() => getAllDistricts(refs), [refs]);

  /** 改類型 → 清空區域 + 學校 */
  const handleTypeChange = (nextType: string) => {
    onChange({
      schoolType: nextType,
      schoolDistrict: '',
      schoolName: '',
    });
  };

  /** 改區域 → 清空學校 */
  const handleDistrictChange = (nextDistrict: string) => {
    onChange({
      schoolType,
      schoolDistrict: nextDistrict,
      schoolName: '',
    });
  };

  const handleSchoolChange = (nextName: string) => {
    onChange({ schoolType, schoolDistrict, schoolName: nextName });
  };

  /* ---- 區域下拉選項 ---- */
  const districtOptions = React.useMemo(
    () =>
      districts.map((d) => {
        const isCustom = !HK_DISTRICTS.includes(d);
        // 數量 = 系統名單 + 自訂 (自訂的區域底下通常只有自訂學校)
        const total = type ? getAllSchoolsInDistrict(d, type, refs).length : 0;
        return {
          value: d,
          label: d,
          searchText: d,
          isCustom,
          // 自訂區域底下可能沒有系統學校 → 不能 disable (要能選)
          disabled: false,
          hint: type
            ? isCustom
              ? total > 0
                ? `自訂 · ${total} 間`
                : '自訂'
              : `(${total})`
            : undefined,
        };
      }),
    [districts, type, refs],
  );

  /* ---- 學校下拉選項 ---- */
  const schoolOptions = React.useMemo(
    () =>
      schools.map((s: School) => {
        const isCustom = !systemSchoolNames.has(s.n);
        return {
          value: s.n,
          label: (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{s.n}</span>
              {isCustom && (
                <span className="text-[9.5px] shrink-0 opacity-80">自訂</span>
              )}
              {!isCustom && s.c && (
                <span className="text-[10px] text-slate-400 shrink-0">· {s.c}</span>
              )}
              {!isCustom && s.g && s.g !== '男女' && (
                <span className="text-[10px] text-slate-400 shrink-0">· {s.g}</span>
              )}
            </span>
          ),
          searchText: s.n,
          isCustom,
        };
      }),
    [schools, systemSchoolNames],
  );

  /* ---- 就地新增區域 ---- */
  const handleCreateDistrict = (name: string) => {
    onCreateCustom?.({ district: name });
    onChange({
      schoolType,
      schoolDistrict: name,
      schoolName: '',
    });
  };

  /* ---- 就地新增學校 ---- */
  const handleCreateSchool = (name: string) => {
    if (type) {
      onCreateCustom?.({
        school: { type, district: schoolDistrict, name },
      });
    }
    onChange({ schoolType, schoolDistrict, schoolName: name });
  };

  const selectedDistrictIsCustom =
    Boolean(schoolDistrict) && !HK_DISTRICTS.includes(schoolDistrict);

  return (
    <div className="space-y-2">
      {/* Row: 類型 + 區域 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="student-form-school-type" required={required}>
            學校類型
          </FieldLabel>
          <Select
            value={schoolType || '__unset__'}
            onValueChange={(v) => {
              if (v === '__unset__') {
                handleTypeChange('');
                return;
              }
              handleTypeChange(v);
            }}
          >
            <SelectTrigger id="student-form-school-type">
              <SelectValue placeholder="— 請選擇 —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset__">
                <span className="text-slate-400 dark:text-slate-500">— 請選擇 —</span>
              </SelectItem>
              {SCHOOL_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel htmlFor="student-form-school-district" required={required}>
            區域
          </FieldLabel>
          <SearchableSelect
            id="student-form-school-district"
            value={schoolDistrict}
            options={districtOptions}
            onChange={handleDistrictChange}
            onCreate={handleCreateDistrict}
            disabled={!type}
            placeholder={type ? '— 請選擇 —' : '請先選學校類型'}
            searchPlaceholder="搜尋區域或輸入區域名稱新增"
            emptyText="沒有符合的區域"
            createLabel={(q) => `新增區域「${q}」`}
          />
        </div>
      </div>

      {/* Row: 學校 */}
      <div>
        <FieldLabel htmlFor="student-form-school-name" required={required}>
          學校
        </FieldLabel>
        <SearchableSelect
          id="student-form-school-name"
          value={schoolName}
          options={schoolOptions}
          onChange={handleSchoolChange}
          onCreate={handleCreateSchool}
          disabled={!type || !schoolDistrict}
          placeholder={
            !type
              ? '請先選學校類型'
              : !schoolDistrict
                ? '請先選區域'
                : '— 請選擇學校 —'
          }
          searchPlaceholder="搜尋學校或輸入學校名稱新增"
          emptyText="沒有符合的學校"
          createLabel={(q) => `新增學校「${q}」`}
        />

        {/* 即時提示 */}
        <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
          <Info width={10} height={10} />
          {type && schoolDistrict ? (
            <>
              {schoolDistrict} 有 {schools.length} 間
              {SCHOOL_TYPE_LABEL[type]}
              {schoolName ? ` · 已選「${schoolName}」` : ''}
              {selectedDistrictIsCustom ? ' · 自訂區域' : ''}
            </>
          ) : (
            '資料來源: CHSC 小學/中學概覽 (政府公開資料平台)'
          )}
        </p>
      </div>

      {/* 錯誤訊息 */}
      {showError && error && (
        <p className="text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
