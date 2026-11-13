/**
 * 學年轉換 (Rollover) 純邏輯
 *
 * 為什麼是純函式:
 *   轉換是「批次改寫大量資料」的高風險操作 —— 一旦寫錯,
 *   使用者會看到學生的紀錄消失或重複。
 *   把「算什麼」跟「寫去哪」分開, 讓算的部分可以被獨立檢視/測試,
 *   寫入的部分 (lib/rollover.ts) 只負責照著算好的結果執行。
 *
 * 核心語意 (決策 D3):
 *   - 學生要「複製」而不是「移動」 → 每學年各自一筆, 歷史學年的資料要能查
 *   - 同一個學生在兩個學年是「同一個人」 → 用 person_key 串起來
 *   - 舊學年的學生標成 'graduated' (非在學), 新學年的標成 'active'
 *   - student_id 要換新的 (stu-{新學年}{序號}), 因為 DB 有
 *     unique(client_id, student_id) 約束, 同 id 不能在兩個學年重複
 *   - 校巴 / 司機 / 保姆 / 家長是「跨學年共用」的主檔 → 不複製
 *   - 路線 / 班次 / 公告通常是「每學年重新設定」→ 預設不複製, 但可選擇性複製
 */

import type { Student } from './types';
import { nextAcademicYear, generatePersonKey } from './academic-year';

/* -------------------------------------------------------------------------- */
/*  型別                                                                      */
/* -------------------------------------------------------------------------- */

/** 轉換選項 */
export interface RolloverOptions {
  /** 來源學年 */
  fromYear: string;
  /** 目標學年 */
  toYear: string;
  /** client id */
  clientId: string;
  /**
   * 要複製的學生篩選器。
   * 預設: 只複製 status === 'active' 的 (在學學生)。
   * 已畢業 (graduated) 的不複製 —— 他們不會繼續升級。
   */
  shouldCloneStudent?: (s: Student) => boolean;
  /**
   * 產生新 student_id。
   * 預設: stu-{toYear}{序號}, 序號由 001 開始遞增。
   *
   * ⚠️ 為什麼不用 STORAGE.students.generateStudentId():
   *    那個函式是「看現有資料的最大序號 + 1」, 但轉換時新學年可能已經有
   *    零星資料 (例如老師先手動建了幾個) → 直接用它會跳號。
   *    這裡改成「從 001 開始找沒被占用的號碼」, 比較不會產生奇怪的編號。
   */
  generateStudentId?: (toYear: string, seq: number) => string;
}

export interface RolloverStudentPlan {
  /** 來源學生 (原本的記錄) */
  source: Student;
  /** 要建立的新學生 (新 id / 新 student_id / 新學年 / status=active) */
  clone: Student;
  /** 來源學生轉換後應有的狀態 */
  sourceStatusAfter: Student['status'];
}

export interface RolloverPlan {
  fromYear: string;
  toYear: string;
  clientId: string;
  /** 學生複製計畫 */
  students: RolloverStudentPlan[];
  /** 被跳過的學生 (附原因) — 讓 UI 可以解釋「為什麼少了幾個」 */
  skipped: { student: Student; reason: string }[];
  /** 警告訊息 (不阻擋, 但要讓管理者知道) */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*  主邏輯                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 產生學生複製計畫 (不寫入任何資料)。
 *
 * @param students 該 client 的全部學生 (含各學年)
 * @param options  轉換選項
 */
export function planStudentRollover(
  students: Student[],
  options: RolloverOptions,
): RolloverPlan {
  const { fromYear, toYear, clientId } = options;

  const warnings: string[] = [];
  const skipped: { student: Student; reason: string }[] = [];
  const studentsPlan: RolloverStudentPlan[] = [];

  // 1) 找出來源學年的學生
  const sourceStudents = students.filter(
    (s) => s.clientId === clientId && s.academicYear === fromYear,
  );

  if (sourceStudents.length === 0) {
    warnings.push(
      `學年 ${fromYear} 找不到任何學生 — 確認該學年是否已經建立資料, 或 client id 是否正確。`,
    );
  }

  // 2) 找出目標學年「已經存在」的學生 (用 person_key 比對)
  //    → 這些代表已經轉換過, 不能重複複製。
  const targetPersonKeys = new Set(
    students
      .filter((s) => s.clientId === clientId && s.academicYear === toYear)
      .map((s) => s.personKey)
      .filter((k): k is string => !!k),
  );

  // 3) 目標學年已占用的 student_id 序號 → 產生新 id 時要避開
  const usedStudentIds = new Set(
    students
      .filter((s) => s.clientId === clientId && s.academicYear === toYear)
      .map((s) => s.studentId),
  );

  const defaultShouldClone = (s: Student) => s.status === 'active';
  const shouldClone = options.shouldCloneStudent ?? defaultShouldClone;

  let seq = 0;
  const nextStudentId = options.generateStudentId ?? defaultStudentId;

  for (const s of sourceStudents) {
    // 3a) 篩選: 只有「應該複製」的才複製
    if (!shouldClone(s)) {
      skipped.push({
        student: s,
        reason:
          s.status === 'active'
            ? '不符合複製條件'
            : `學生狀態為「${s.status}」— 非在學學生不複製`,
      });
      continue;
    }

    // 3b) 已經轉換過 → 跳過 (避免重複)
    if (s.personKey && targetPersonKeys.has(s.personKey)) {
      skipped.push({
        student: s,
        reason: `目標學年已有同一學生 (person_key: ${s.personKey}) — 已轉換過, 跳過`,
      });
      continue;
    }

    // 3c) 產生新的 student_id (避開已占用的)
    let newStudentId = '';
    for (let i = 0; i < 10000; i++) {
      seq += 1;
      const candidate = nextStudentId(toYear, seq);
      if (!usedStudentIds.has(candidate)) {
        newStudentId = candidate;
        break;
      }
    }
    if (!newStudentId) {
      skipped.push({
        student: s,
        reason: `無法為目標學年 ${toYear} 產生唯一的學生編號 (已嘗試 10000 個序號)`,
      });
      continue;
    }
    usedStudentIds.add(newStudentId);

    // 3d) 沿用 person_key (這就是「同一個人」的串接鍵)
    //    ⚠️ 舊資料可能沒有 person_key (migration 0018 還沒跑過的部分)
    //    → 那就在這裡補一個, 這樣下一次轉換才有連續性。
    const personKey = s.personKey || generatePersonKey(clientId);

    const now = new Date().toISOString();

    studentsPlan.push({
      source: s,
      sourceStatusAfter: 'graduated',
      clone: {
        ...s,
        // 新 id (不是沿用舊的 — 兩個學年是不同的列)
        id: `stu_${clientId.slice(0, 6)}_${toYear}_${newStudentId.split('-')[2]}_${Date.now().toString(36)}`,
        // 新 student_id (DB unique(client_id, student_id) 不允許重複)
        studentId: newStudentId,
        // 新學年
        academicYear: toYear,
        // 同一個人
        personKey,
        // 新學年 → 在學
        status: 'active',
        // ⚠️ Student 沒有 updatedAt 欄位 (只有 createdAt) ——
        //    複製出來的新列 createdAt 就是現在。
        createdAt: now,
      },
    });

    // 把新 person_key 加進 set → 同一批裡不會重複複製同一個人
    targetPersonKeys.add(personKey);
  }

  // 4) 檢查 person_key 重複 (來源學年內)
  const keyCounts = new Map<string, number>();
  for (const s of sourceStudents) {
    if (!s.personKey) continue;
    keyCounts.set(s.personKey, (keyCounts.get(s.personKey) ?? 0) + 1);
  }
  for (const [key, count] of keyCounts) {
    if (count > 1) {
      warnings.push(
        `來源學年有 ${count} 筆學生共用 person_key (${key}) — 這看起來是重複資料, 只有其中一筆會被複製。`,
      );
    }
  }

  return {
    fromYear,
    toYear,
    clientId,
    students: studentsPlan,
    skipped,
    warnings,
  };
}

/** 預設的 student_id 產生器 */
function defaultStudentId(toYear: string, seq: number): string {
  return `stu-${toYear}${String(seq).padStart(3, '0')}`;
}

/* -------------------------------------------------------------------------- */
/*  輔助                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 計算下一個學年代碼 (包裝 academic-year.ts, 讓 UI 不用另外 import)。
 */
export { nextAcademicYear };

/**
 * 檢查轉換的前置條件。
 *
 * @returns 阻擋轉換的錯誤 (空陣列 = 可以轉換)
 */
export function validateRollover(
  plan: RolloverPlan,
  targetYearExists: boolean,
): string[] {
  const errors: string[] = [];

  if (plan.fromYear === plan.toYear) {
    errors.push('來源學年與目標學年相同 — 請選擇不同的目標學年。');
  }
  if (!targetYearExists) {
    errors.push(
      `目標學年 ${plan.toYear} 尚未建立 — 請先在「學年管理」建立這個學年, 再進行轉換。`,
    );
  }
  if (plan.students.length === 0) {
    errors.push('沒有可轉換的學生 — 請確認來源學年有「在學」學生。');
  }
  return errors;
}
