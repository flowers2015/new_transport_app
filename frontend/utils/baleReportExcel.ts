import ExcelJS from 'exceljs';
import {
  BaleCompanyReportRow,
  COMPANY_BALE_REPORT_HEADERS,
} from './baleCompanyReport';

const COLUMN_WIDTHS = [6, 10, 26, 16, 9, 10, 20, 14, 9, 16, 14];

const DAIRY_ROW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF9C3' },
};

export async function downloadCompanyBaleReportExcel(rows: BaleCompanyReportRow[], filename?: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.views = [{ rightToLeft: true }];
  const sheet = workbook.addWorksheet('تخصیص شرکتی', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  const headerRow = sheet.addRow([...COMPANY_BALE_REPORT_HEADERS]);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  rows.forEach((r) => {
    const dataRow = sheet.addRow([
      r.row,
      r.vehicleType,
      r.destinations,
      r.origin,
      r.brand,
      r.representativeType,
      r.representativeName,
      r.products,
      r.vehicleCode,
      r.driverName,
      r.driverContact,
    ]);
    dataRow.height = 20;
    dataRow.eachCell((cell, colNumber) => {
      cell.alignment = {
        horizontal: colNumber === 1 || colNumber === 2 || colNumber >= 9 ? 'center' : 'right',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (r.isDairy) {
        cell.fill = DAIRY_ROW_FILL;
      }
    });
  });

  COLUMN_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `company-report-${Date.now()}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}
