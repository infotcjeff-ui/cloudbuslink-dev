/**
 * 學年轉換純邏輯的快速驗證腳本 (用 node --experimental-strip-types 跑)
 *
 * 用途: 在真的按「執行轉換」之前, 先確認 planStudentRollover 的行為正確。
 * 這是「高風險批次操作」的安全網 —— 邏輯錯了會讓學生的資料不見。
 */

import { planStudentRollover, validateRollover } from '../lib/rollover';
import type { Student } from '../lib/types';

const clientId = 'client-test';

function mkStudent(
  id: string,
  name: string,
  academicYear: string,
  status: Student['status'],
  personKey?: string,
): Student {
  return {
    id,
    clientId,
    studentId: `stu-${academicYear}${id.slice(-3)}`,
    academicYear,
    personKey: personKey ?? null,
    name,
    classNumber: 'P1',
    phone: null,
    photo: null,
    gender: 'male',
    dateOfBirth: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    status,
    parentIds: [],
    primaryParentId: null,
    busId: null,
    pickupLocation: null,
    dropoffLocation: null,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

const students: Student[] = [
  mkStudent('s1', '小明', '2627', 'active', 'pk-a'),
  mkStudent('s2', '小美', '2627', 'active', 'pk-b'),
  mkStudent('s3', '小強', '2627', 'graduated', 'pk-c'),
  mkStudent('s4', '小紅', '2627', 'suspended', 'pk-d'),
  mkStudent('s5', '小英', '2627', 'active', 'pk-e'),
  // 目標學年已有一個 (應該被跳過)
  mkStudent('s6', '小明', '2728', 'active', 'pk-a'),
  // 另一間學校 (不應被碰到)
  { ...mkStudent('s7', '外人', '2627', 'active', 'pk-z'), clientId: 'client-other' },
];

console.log('=== 測試 1: 基本轉換 ===');
const plan = planStudentRollover(students, {
  fromYear: '2627',
  toYear: '2728',
  clientId,
});

console.log('複製數:', plan.students.length);
console.log(
  '複製的人:',
  plan.students.map((s) => `${s.source.name}→${s.clone.studentId}`),
);
console.log(
  '跳過:',
  plan.skipped.map((s) => `${s.student.name}: ${s.reason}`),
);
console.log('警告:', plan.warnings);

// 斷言
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('✅', msg);
  }
};

assert(plan.students.length === 2, '只複製 2 位在學學生 (小美/小英 — 小明已在 2728)');
assert(
  plan.students.every((s) => s.clone.academicYear === '2728'),
  '所有複製出來的學生都是 2728 學年',
);
assert(
  plan.students.every((s) => s.clone.status === 'active'),
  '所有複製出來的學生 status = active',
);
assert(
  plan.students.every((s) => s.sourceStatusAfter === 'graduated'),
  '所有來源學年學生轉換後 = graduated',
);
assert(
  plan.students.every((s) => s.clone.personKey === s.source.personKey),
  'person_key 沿用 (同一個人)',
);
assert(
  plan.students.every((s) => s.clone.studentId !== s.source.studentId),
  'student_id 換新 (DB unique 約束)',
);
assert(
  plan.students.every((s) => s.clone.studentId.startsWith('stu-2728')),
  '新 student_id 用新學年前綴',
);
assert(
  plan.students.every((s) => s.clone.id !== s.source.id),
  '新列有新的 id',
);
assert(
  plan.students.every((s) => s.clone.parentIds.join() === s.source.parentIds.join()),
  '家長關聯沿用',
);
assert(
  !plan.students.some((s) => s.source.name === '外人'),
  '不會碰到其他 client 的學生',
);
assert(
  plan.skipped.some((s) => s.student.name === '小強' && s.reason.includes('graduated')),
  '已畢業的學生被跳過 (附原因)',
);
assert(
  plan.skipped.some((s) => s.student.name === '小紅'),
  'suspended 的學生被跳過',
);
assert(
  plan.skipped.some((s) => s.student.name === '小明' && s.reason.includes('已轉換過')),
  '已經轉換過的學生被跳過 (person_key 檢查)',
);

console.log('\n=== 測試 2: 學年 student_id 序號不衝突 ===');
const plan2 = planStudentRollover(
  [
    mkStudent('a1', '甲', '2627', 'active', 'pk-1'),
    mkStudent('a2', '乙', '2627', 'active', 'pk-2'),
    // 目標學年已經手動建了 stu-2728001
    { ...mkStudent('a3', '丙', '2728', 'active', 'pk-3'), studentId: 'stu-2728001' },
  ],
  { fromYear: '2627', toYear: '2728', clientId },
);
console.log(
  '新 student_id:',
  plan2.students.map((s) => s.clone.studentId),
);
assert(
  plan2.students.every((s) => s.clone.studentId !== 'stu-2728001'),
  '避開目標學年已占用的 student_id',
);
assert(
  new Set(plan2.students.map((s) => s.clone.studentId)).size === plan2.students.length,
  '複製出來的 student_id 彼此不重複',
);

console.log('\n=== 測試 3: 目標學年不存在 → 阻擋 ===');
const plan3 = planStudentRollover(students, {
  fromYear: '2627',
  toYear: '2829',
  clientId,
});
const errs = validateRollover(plan3, false);
console.log('錯誤:', errs);
assert(errs.length > 0, '目標學年不存在時擋下');

console.log('\n=== 測試 4: 來源無學生 → 阻擋 ===');
const plan4 = planStudentRollover(students, {
  fromYear: '9999',
  toYear: '2728',
  clientId,
});
const errs4 = validateRollover(plan4, true);
console.log('錯誤:', errs4);
assert(errs4.length > 0, '沒有可轉換學生時擋下');

console.log('\n=== 測試 5: 同學年 → 阻擋 ===');
const plan5 = planStudentRollover(students, {
  fromYear: '2627',
  toYear: '2627',
  clientId,
});
const errs5 = validateRollover(plan5, true);
console.log('錯誤:', errs5);
assert(errs5.some((e) => e.includes('相同')), '來源=目標時擋下');

console.log(
  process.exitCode ? '\n❌ 有測試失敗' : '\n✅ 全部測試通過',
);
