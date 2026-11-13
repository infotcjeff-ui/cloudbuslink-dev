'use client';

import type { Student, Parent, Bus, Driver, StudentGender } from '@/lib/types';

/** Students 頁面的全域類型 (only used inside /cbl-admin-setting/[layout]/students) */

export type StudentTab = 'active' | 'unassigned' | 'graduated';

export interface StudentFormState {
  name: string;
  /** 英文姓名 — 學生摘要 Student Summary 報表用; '' 表示未填 */
  nameEn: string;
  classNumber: string;
  phone: string;
  gender: StudentGender;
  dateOfBirth: string;          // yyyy-mm-dd, '' 表示未填
  /** 就讀學校類型 — 'primary' (小學) / 'secondary' (中學), '' 表示未填 */
  schoolType: string;
  /** 就讀學校所在區域 (18 區之一), '' 表示未填 */
  schoolDistrict: string;
  /** 就讀學校名稱, '' 表示未填 */
  schoolName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  /** 緊急聯絡人與學生關係 — ParentRelationship 或 '' 表示未指定 */
  emergencyContactRelationship: string;
  busId: string;
  parentIds: string[];
  /** 該學生的主要聯繫人 parent id; '' 表示未指定 (必須在 parentIds 之內, 但表單內可暫時為空) */
  primaryParentId: string;
}

export const EMPTY_STUDENT_FORM: StudentFormState = {
  name: '',
  nameEn: '',
  classNumber: '',
  phone: '',
  gender: 'male',
  dateOfBirth: '',
  schoolType: '',
  schoolDistrict: '',
  schoolName: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  busId: '',
  parentIds: [],
  primaryParentId: '',
};

export interface StudentsPageContext {
  students: Student[];
  parents: Parent[];
  buses: Bus[];
  /** 司機清單 — 用於右欄「已選校巴」卡片顯示司機姓名/電話 */
  drivers: Driver[];
}