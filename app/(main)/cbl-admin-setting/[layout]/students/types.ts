'use client';

import type { Student, Parent, Bus, StudentGender } from '@/lib/types';

/** Students 頁面的全域類型 (only used inside /cbl-admin-setting/[layout]/students) */

export type StudentTab = 'active' | 'unassigned' | 'graduated';

export interface StudentFormState {
  name: string;
  classNumber: string;
  phone: string;
  gender: StudentGender;
  dateOfBirth: string;          // yyyy-mm-dd, '' 表示未填
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
  classNumber: '',
  phone: '',
  gender: 'male',
  dateOfBirth: '',
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
}