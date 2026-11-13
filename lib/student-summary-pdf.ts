/**
 * Student Summary PDF 產生器
 *
 * 與 Excel 匯出共用 lib/student-summary.ts 的欄位定義,
 * 輸出為橫向 A4 的真 PDF 下載檔 (jspdf + jspdf-autotable)。
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  SUMMARY_HEADERS,
  rowToCells,
  type StudentSummaryRow,
} from './student-summary';

export interface PdfOptions {
  /** 檔名 (不含 .pdf) */
  fileName: string;
  /** 標題列上方顯示的副標 (日期 / 學年 / 班次數) */
  subtitle?: string;
}

/**
 * 產生並下載學生摘要 PDF。
 */
export async function downloadSummaryPdf(
  rows: StudentSummaryRow[],
  options: PdfOptions,
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // 標題
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Student Summary — 學生摘要', 20, 26);

  if (options.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(options.subtitle, 20, 40);
  }

  // 表格
  autoTable(doc, {
    startY: options.subtitle ? 50 : 38,
    head: [Array.from(SUMMARY_HEADERS)],
    body: rows.map((r) => rowToCells(r).map((c) => (c === null ? '' : String(c)))),
    styles: {
      fontSize: 5.5,
      cellPadding: 1.6,
      overflow: 'linebreak',
      lineColor: [203, 213, 225],
      lineWidth: 0.4,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fontSize: 5.5,
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineWidth: 0.4,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 46 },
      2: { cellWidth: 62 },
      3: { cellWidth: 12 },
      4: { cellWidth: 34 },
      5: { cellWidth: 56 },
      6: { cellWidth: 66 },
      7: { cellWidth: 74 },
      8: { cellWidth: 86 },
      9: { cellWidth: 24 },
      10: { cellWidth: 24 },
      11: { cellWidth: 32 },
      12: { cellWidth: 32 },
      13: { cellWidth: 74 },
      14: { cellWidth: 86 },
      15: { cellWidth: 24 },
      16: { cellWidth: 24 },
      17: { cellWidth: 32 },
      18: { cellWidth: 32 },
    },
    margin: { left: 20, right: 20, top: 20, bottom: 28 },
    didDrawPage: () => {
      // 頁碼
      const pageCount = doc.getNumberOfPages();
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `第 ${page} / ${pageCount} 頁`,
        pageWidth - 20,
        doc.internal.pageSize.getHeight() - 12,
        { align: 'right' },
      );
    },
  });

  doc.save(`${options.fileName}.pdf`);
}
