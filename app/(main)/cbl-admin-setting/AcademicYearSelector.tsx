'use client';

/**
 * AcademicYearSelector — 學年切換器
 *
 * 放在後台 header 或各頁面的工具列, 讓管理者隨時切換「正在檢視哪一個學年」。
 *
 * 設計重點:
 *   1. 切到「封存 / 非現行」學年時, 旁邊會出現明確的唯讀徽章 ——
 *      使用者要立刻知道「我現在看的是歷史資料, 不能改」。
 *   2. 學年清單來自 cbl_academic_years (學年登錄表), 不是硬編碼的選項。
 *      新增學年不需要改程式。
 *   3. 還沒建立學年登錄時 (migration 0016 未套或資料是舊的),
 *      自動降級成「顯示站台設定的學年 + 提示要建立學年登錄」。
 */

import { useMemo, useState } from 'react';
import { CalendarDays, Lock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAcademicYear } from './AcademicYearProvider';
import { getAcademicYearLabel, type AcademicYearStatus } from '@/lib/academic-year';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** 學年狀態 → 徽章樣式 */
const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: '現行學年',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
  upcoming: {
    label: '即將開始',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  archived: {
    label: '已封存',
    className:
      'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
  },
};

/**
 * 唯讀原因 ——
 * 唯讀有兩種情況, 但對使用者的意義不同:
 *   - archived  → 這個學年已經結束, 資料是歷史的 → 「已封存」
 *   - 非現行     → 這個學年還沒開始或是已被換下 → 「尚未開始」
 * 兩者都是唯讀, 但提示語要講清楚「為什麼不能改」。
 */
function readOnlyReason(status: AcademicYearStatus): {
  label: string;
  hint: string;
} {
  if (status === 'archived') {
    return {
      label: '已封存 · 唯讀',
      hint: '這個學年已封存 — 可以查看與匯出報表, 但不能新增/編輯/刪除資料',
    };
  }
  return {
    label: '非現行學年 · 唯讀',
    hint: '這個學年不是現行學年 — 可以查看與匯出報表, 但不能新增/編輯/刪除資料。切回現行學年即可編輯。',
  };
}

export function AcademicYearSelector({
  className,
  showBadge = true,
  /** 是否顯示「管理學年」按鈕 (只有超管需要) */
  onManage,
}: {
  className?: string;
  showBadge?: boolean;
  onManage?: () => void;
}) {
  const { selectedYear, selectedYearRecord, years, isReadOnly, setSelectedYear, loading } =
    useAcademicYear();

  /** 待確認切換的學年代碼 (null = 沒有待確認的切換) */
  const [pendingYear, setPendingYear] = useState<string | null>(null);

  const pendingRecord = useMemo(
    () => (pendingYear ? years.find((y) => y.academicYear === pendingYear) ?? null : null),
    [pendingYear, years],
  );

  /**
   * 切換學年前先跳出確認視窗 ——
   *
   * ⚠️ 為什麼一定要確認:
   *   切換學年會「整批換掉」畫面上的資料 (學生、班次、路線、公告)。
   *   使用者常會誤以為是篩選, 實際上是切到另一份完全獨立的資料。
   *   而且切到非現行學年後所有改動按鈕會變成唯讀 ——
   *   若沒有提示, 使用者會以為是 bug。
   */
  const handleSelectChange = (next: string) => {
    // 沒變 → 不做任何事
    if (!next || next === selectedYear) return;
    setPendingYear(next);
  };

  /** 確認切換 → 寫入學年 + 重整頁面 (讓所有資料用新學年重新載入) */
  const handleConfirmSwitch = () => {
    if (!pendingYear) return;
    setSelectedYear(pendingYear);
    setPendingYear(null);
    // ⚠️ 必須整頁重整 (不是 router.refresh) ——
    //    router.refresh() 只會重跑 Server Component, 不會重新 mount
    //    AcademicYearProvider, 也不會重新讀 localStorage 的選定學年。
    //    只有 location.reload() 能確保所有頁面的資料都重新按新學年載入。
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const statusBadge = useMemo(() => {
    if (!selectedYearRecord) return null;
    return (
      STATUS_BADGE[selectedYearRecord.status] ??
      STATUS_BADGE.active
    );
  }, [selectedYearRecord]);

  // 沒有學年登錄 → 顯示警示 (migration 0016 未套, 或資料尚未建立)
  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800',
          className,
        )}
      >
        <div className="h-3 w-16 rounded bg-slate-300 dark:bg-slate-600 animate-pulse" />
      </div>
    );
  }

  if (years.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
          className,
        )}
        title="尚未建立學年登錄 — 請先執行 supabase/migrations/0016_academic_years.sql"
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="whitespace-nowrap">未設定學年</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <CalendarDays className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
        <label htmlFor="cbl-academic-year-select" className="sr-only">
          選擇學年
        </label>
        <select
          id="cbl-academic-year-select"
          value={selectedYear}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          title="切換檢視的學年"
        >
          {years.map((y) => (
            <option key={y.id} value={y.academicYear}>
              {getAcademicYearLabel(y)}
              {y.isCurrent ? ' (現行)' : ''}
              {y.status === 'archived' ? ' [已封存]' : ''}
            </option>
          ))}
        </select>
      </div>

      {showBadge && isReadOnly && selectedYearRecord && (
        <span
          className={cn(
            'inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap',
            statusBadge?.className,
          )}
          title={readOnlyReason(selectedYearRecord.status).hint}
        >
          <Lock className="w-3.5 h-3.5" />
          {readOnlyReason(selectedYearRecord.status).label}
        </span>
      )}

      {showBadge && !isReadOnly && selectedYearRecord && (
        <span
          className={cn(
            'inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap',
            statusBadge?.className,
          )}
        >
          {statusBadge?.label}
        </span>
      )}

      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="h-9 px-2.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          管理學年
        </button>
      )}

      {/* ⚠️ 切換學年確認彈窗 —— 確定後會重新載入整頁 */}
      <ConfirmDialog
        open={pendingYear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingYear(null);
        }}
        title="確認切換學年？"
        description={
          <div className="space-y-2 text-left">
            <p>
              你正在從{' '}
              <span className="font-semibold text-foreground">
                {selectedYearRecord
                  ? getAcademicYearLabel(selectedYearRecord)
                  : selectedYear}
              </span>{' '}
              切換到{' '}
              <span className="font-semibold text-foreground">
                {pendingRecord ? getAcademicYearLabel(pendingRecord) : pendingYear}
              </span>
              。
            </p>
            <p className="text-muted-foreground">
              切換後畫面會載入該學年自己的學生、路線、班次與公告資料。
            </p>
            {pendingRecord && pendingRecord.status !== 'active' && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                ⚠️{' '}
                {pendingRecord.status === 'archived'
                  ? '該學年已封存 — 只能查看與匯出, 不能新增或修改資料。'
                  : '該學年不是現行學年 — 只能查看與匯出, 不能新增或修改資料。'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">確定後頁面會重新載入。</p>
          </div>
        }
        confirmLabel="確定切換"
        cancelLabel="取消"
        className="max-w-[550px]"
        onConfirm={handleConfirmSwitch}
      />
    </div>
  );
}

export default AcademicYearSelector;
