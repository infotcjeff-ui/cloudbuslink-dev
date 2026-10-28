'use client';

/** Parents 頁面的類型定義 (only used inside /cbl-admin-setting/[layout]/parents) */

export type ParentTab = 'active' | 'inactive';

/** 家長表單狀態 — 與 ParentFormModal 的 ParentFormState 保持一致 */
export type {
  ParentFormState,
  ParentFormModalProps,
} from '../students/ParentFormModal';

/** 父母與子女關聯資料 (popup 用) */
export interface BoundStudent {
  id: string;
  studentId: string;
  name: string;
  classNumber: string;
  status: 'active' | 'graduated' | 'suspended';
  busPlateNumber?: string | null;
  isPrimaryContact: boolean;
}
