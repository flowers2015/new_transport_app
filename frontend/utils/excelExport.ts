import ExcelJS from 'exceljs';
import { localizeExcelValue } from './freightDisplay';

const HEADER_FILL = 'FF4472C4';
const HEADER_FONT = 'FFFFFFFF';
const ZEBRA_FILL = 'FFF2F2F2';

export type ExcelCellValue = string | number | boolean | null | undefined;

export interface StyledExcelExportOptions {
    sheetName: string;
    fileName: string;
    headers: string[];
    rows: ExcelCellValue[][];
    numericColumnMatchers?: string[];
    /** ستون ردیف در ابتدای جدول — پیش‌فرض true */
    includeRowNumber?: boolean;
}

const ROW_HEADER = 'ردیف';

function isNumericHeader(header: string, matchers: string[]): boolean {
    return matchers.some(m => header.includes(m));
}

function normalizeCellValue(value: ExcelCellValue, asNumeric: boolean): string | number {
    if (value === null || value === undefined || value === '') return asNumeric ? 0 : '';
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const str = String(value).replace(/[^\d.-]/g, '');
    if (asNumeric && str !== '' && !Number.isNaN(Number(str))) {
        const num = Number(str);
        if (Math.abs(num) > 1e15) return String(value);
        return num;
    }
    const localized = localizeExcelValue(value);
    if (typeof localized === 'number') return localized;
    return localized;
}

export function withRowNumberColumn(
    headers: string[],
    rows: ExcelCellValue[][],
    includeRowNumber = true
): { headers: string[]; rows: ExcelCellValue[][] } {
    if (!includeRowNumber) return { headers, rows };
    if (headers[0] === ROW_HEADER || headers.includes(ROW_HEADER)) {
        return { headers, rows };
    }
    return {
        headers: [ROW_HEADER, ...headers],
        rows: rows.map((row, i) => [i + 1, ...row]),
    };
}

export async function downloadStyledExcel(opts: StyledExcelExportOptions): Promise<void> {
    const includeRowNumber = opts.includeRowNumber !== false;
    const { headers, rows } = withRowNumberColumn(opts.headers, opts.rows, includeRowNumber);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(opts.sheetName);
    worksheet.views = [{ rightToLeft: true }];

    const matchers = opts.numericColumnMatchers ?? [
        'تناژ',
        'کرایه',
        'ارزش',
        'مبلغ',
        'کارتن',
        'تعداد',
        'ریال',
        'کیلو',
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } },
        };
    });

    rows.forEach((row, rowIndex) => {
        const excelRow = worksheet.addRow(
            row.map((cell, colIndex) =>
                normalizeCellValue(cell, isNumericHeader(headers[colIndex] || '', matchers))
            )
        );
        const fill = rowIndex % 2 === 0 ? ZEBRA_FILL : 'FFFFFFFF';
        excelRow.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1] || '';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            };
            if (typeof cell.value === 'number') {
                cell.numFmt = '#,##0';
            }
        });
    });

    worksheet.columns.forEach((col, i) => {
        const header = headers[i] || '';
        let maxLen = header.length;
        col.eachCell?.({ includeEmpty: false }, cell => {
            const len = String(cell.value ?? '').length;
            if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(50, Math.max(10, maxLen + 2));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = opts.fileName.endsWith('.xlsx') ? opts.fileName : `${opts.fileName}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
}

export function buildExcelFileName(prefix: string, suffix: string, mode?: string): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const parts = [prefix, suffix, mode, dateStr].filter(Boolean);
    return `${parts.join('_')}.xlsx`;
}
