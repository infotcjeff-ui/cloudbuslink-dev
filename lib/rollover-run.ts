/**
 * 學年轉換 (Rollover) 執行器
 *
 * 與 lib/rollover.ts 的分工:
 *   - rollover.ts     → 純邏輯: 「該複製哪些學生、複製成什麼樣」
 *   - rollover-run.ts → 執行: 「把計畫寫進本機 + 雲端」
 *
 * ⚠️ 執行順序很重要 (先本機後雲端):
 *    localStorage 是這個 app 的 source of truth cache。
 *    先寫本機 → 即使雲端寫入失敗, 使用者馬上看得到資料,
 *    雲端失敗會回報並保留 pending patch 等下次 sync 補。
 *
 * ⚠️ 整批是「可重入」的:
 *    planStudentRollover 會用 person_key 檢查「目標學年是否已有同一學生」,
 *    所以就算使用者按了兩次, 第二次也不會重複複製。
 */

import { STORAGE } from './storage';
import { planStudentRollover, validateRollover, type RolloverPlan } from './rollover';
import type { Student } from './types';

/* -------------------------------------------------------------------------- */
/*  型別                                                                      */
/* -------------------------------------------------------------------------- */

export interface RolloverResult {
  success: boolean;
  /** 本機成功複製的學生數 */
  cloned: number;
  /** 來源學年被標成畢業的學生數 */
  graduated: number;
  /** 雲端寫入失敗的學生 id (本機已寫入, 等下次 sync 補) */
  cloudFailed: string[];
  /** 錯誤訊息 */
  errors: string[];
  /** 警告 */
  warnings: string[];
  /** 被跳過的學生 */
  skipped: RolloverPlan['skipped'];
}

export interface RolloverExecutionOptions {
  clientId: string;
  fromYear: string;
  toYear: string;
  /** 目標學年是否已建立 (用來擋掉「往不存在的學年轉換」) */
  targetYearExists: boolean;
  /** 自訂學生篩選器 (預設只複製在學學生) */
  shouldCloneStudent?: (s: Student) => boolean;
  /**
   * 是否也要把來源學年的學生標成 'graduated'。
   * 預設 true — 這是「學年結束」的語意。
   */
  markSourceGraduated?: boolean;
  /**
   * 是否同步到雲端。
   * 預設 true。設 false 可做「先本機驗證, 確認 OK 再上雲端」的工作流程。
   */
  pushToCloud?: boolean;
  /** 進度回呼 (每複製一個學生回報一次, 讓 UI 顯示進度) */
  onProgress?: (done: number, total: number) => void;
}

/* -------------------------------------------------------------------------- */
/*  執行                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 執行學年轉換。
 *
 * ⚠️ 這個函式會「批次寫入」大量資料 ——
 *    呼叫端應該先讓使用者確認 (確認對話框), 再呼叫。
 */
export async function executeRollover(
  options: RolloverExecutionOptions,
): Promise<RolloverResult> {
  const {
    clientId,
    fromYear,
    toYear,
    targetYearExists,
    shouldCloneStudent,
    markSourceGraduated = true,
    pushToCloud = true,
    onProgress,
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const cloudFailed: string[] = [];

  if (!clientId) {
    return {
      success: false,
      cloned: 0,
      graduated: 0,
      cloudFailed: [],
      errors: ['找不到 client id — 無法執行轉換。'],
      warnings: [],
      skipped: [],
    };
  }

  // ---- 1. 產生計畫 (純邏輯, 不寫入) ----
  const allStudents = STORAGE.students.getAll();
  const plan = planStudentRollover(allStudents, {
    fromYear,
    toYear,
    clientId,
    shouldCloneStudent,
  });
  warnings.push(...plan.warnings);

  // ---- 2. 前置條件檢查 ----
  const validationErrors = validateRollover(plan, targetYearExists);
  if (validationErrors.length > 0) {
    return {
      success: false,
      cloned: 0,
      graduated: 0,
      cloudFailed: [],
      errors: validationErrors,
      warnings,
      skipped: plan.skipped,
    };
  }

  // ---- 3. 寫入本機 ----
  const currentStudents = STORAGE.students.getAll();
  const nextStudents: Student[] = [...currentStudents];
  const indexById = new Map(nextStudents.map((s, i) => [s.id, i]));

  let cloned = 0;
  let graduated = 0;

  plan.students.forEach((step, i) => {
    // 3a) 來源學生 → graduated
    if (markSourceGraduated) {
      const srcIdx = indexById.get(step.source.id);
      if (srcIdx !== undefined) {
        nextStudents[srcIdx] = {
          ...nextStudents[srcIdx],
          status: step.sourceStatusAfter,
        };
        graduated += 1;
      }
    }

    // 3b) 新學年的複製列
    nextStudents.push(step.clone);
    cloned += 1;

    onProgress?.(i + 1, plan.students.length);
  });

  // 一次寫回 (比逐筆 setAll 快很多, 也避免中途失敗留下半套資料)
  STORAGE.students.setAll(nextStudents);

  // 通知各頁面重載
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cbl-students-refresh'));
  }

  // ---- 4. 同步到雲端 ----
  if (pushToCloud) {
    try {
      const { supabaseStudents } = await import('./supabase-entities');

      // 4a) 先更新來源學生的狀態 (graduated)
      if (markSourceGraduated) {
        for (const step of plan.students) {
          const res = await supabaseStudents.update(step.source.id, {
            status: step.sourceStatusAfter,
          });
          if (!res.success) {
            errors.push(
              `更新來源學生 ${step.source.name} (${step.source.studentId}) 的狀態失敗: ${res.error ?? '未知錯誤'}`,
            );
          }
        }
      }

      // 4b) 再新增新學年的學生
      for (const step of plan.students) {
        const res = await supabaseStudents.add(step.clone);
        if (!res.success) {
          cloudFailed.push(step.clone.id);
          errors.push(
            `新增學生 ${step.clone.name} (${step.clone.studentId}) 到雲端失敗: ${res.error ?? '未知錯誤'}`,
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`雲端同步發生例外: ${msg}`);
      // 全部標記為待補 (本機已寫入, 雲端沒有的)
      plan.students.forEach((s) => cloudFailed.push(s.clone.id));
    }
  }

  const success = errors.length === 0;

  if (cloudFailed.length > 0) {
    warnings.push(
      `有 ${cloudFailed.length} 筆學生已存入本機但尚未同步到雲端 — 下次同步時會自動補上, 或請檢查網絡／權限設定。`,
    );
  }

  return {
    success,
    cloned,
    graduated,
    cloudFailed,
    errors,
    warnings,
    skipped: plan.skipped,
  };
}

/**
 * 預覽轉換計畫 (不寫入任何資料) — 給 UI 的「預覽」按鈕用。
 */
export function previewRollover(
  clientId: string,
  fromYear: string,
  toYear: string,
  shouldCloneStudent?: (s: Student) => boolean,
): RolloverPlan {
  return planStudentRollover(STORAGE.students.getAll(), {
    fromYear,
    toYear,
    clientId,
    shouldCloneStudent,
  });
}
