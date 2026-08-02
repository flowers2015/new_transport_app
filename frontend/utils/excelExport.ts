import ExcelJS from 'exceljs';
import { localizeExcelValue } from './freightDisplay';

const HEADER_FILL = 'FF4472C4';
const HEADER_FONT = 'FFFFFFFF';
const ZEBRA_FILL = 'FFF2F2F2';
/** ردیف زوج نمونه اکسل (آبی خیلی روشن) */
const ZEBRA_FILL_LIGHT_BLUE = 'FFDDEBF7';

export type ExcelCellValue = string | number | boolean | null | undefined;

export type ExcelBorderWeight = 'thin' | 'medium';

export interface StyledExcelExportOptions {
    sheetName: string;
    fileName: string;
    headers: string[];
    rows: ExcelCellValue[][];
    numericColumnMatchers?: string[];
    /** ستون ردیف در ابتدای جدول — پیش‌فرض true */
    includeRowNumber?: boolean;
    /** رنگ پس‌زمینه ردیف‌های فرد (۱، ۳، …) — پیش‌فرض خاکستری روشن */
    zebraFill?: string;
    /** ضخامت کادر — برای خروجی‌های رسمی medium */
    borderStyle?: ExcelBorderWeight;
    borderColor?: string;
}

const ROW_HEADER = 'ردیف';

function isNumericHeader(header: string, matchers: string[]): boolean {
    return matchers.some(m => header.includes(m));
}

function normalizeCellValue(value: ExcelCellValue, asNumeric: boolean): string | number {
    if (value === null || value === undefined || value === '') return '';
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

export interface StyledExcelSheet {
    sheetName: string;
    headers: string[];
    rows: ExcelCellValue[][];
    includeRowNumber?: boolean;
}

export interface StyledExcelWorkbookOptions {
    fileName: string;
    sheets: StyledExcelSheet[];
    numericColumnMatchers?: string[];
}

type SheetStyleOpts = {
    zebraFill?: string;
    borderStyle?: ExcelBorderWeight;
    borderColor?: string;
};

function cellBorder(style: ExcelBorderWeight, color: string) {
    const edge = { style, color: { argb: color } };
    return { top: edge, bottom: edge, left: edge, right: edge };
}

function applyStyledSheet(
    workbook: ExcelJS.Workbook,
    sheetOpts: StyledExcelSheet,
    matchers: string[],
    styleOpts: SheetStyleOpts = {}
): void {
    const includeRowNumber = sheetOpts.includeRowNumber !== false;
    const { headers, rows } = withRowNumberColumn(sheetOpts.headers, sheetOpts.rows, includeRowNumber);
    const zebraFill = styleOpts.zebraFill || ZEBRA_FILL;
    const borderStyle = styleOpts.borderStyle || 'thin';
    const borderColor = styleOpts.borderColor || (borderStyle === 'medium' ? 'FF000000' : 'FFE0E0E0');
    const dataBorder = cellBorder(borderStyle, borderColor);
    const headerBorder = cellBorder(borderStyle === 'medium' ? 'medium' : 'thin', 'FF000000');

    const worksheet = workbook.addWorksheet(sheetOpts.sheetName);
    worksheet.views = [{ rightToLeft: true }];

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 22;
    for (let colNumber = 1; colNumber <= headers.length; colNumber++) {
        const cell = headerRow.getCell(colNumber);
        if (headers[colNumber - 1] != null) cell.value = headers[colNumber - 1];
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = headerBorder;
    }

    rows.forEach((row, rowIndex) => {
        const excelRow = worksheet.addRow(
            row.map((cell, colIndex) =>
                normalizeCellValue(cell, isNumericHeader(headers[colIndex] || '', matchers))
            )
        );
        const fill = rowIndex % 2 === 0 ? zebraFill : 'FFFFFFFF';
        for (let colNumber = 1; colNumber <= headers.length; colNumber++) {
            const cell = excelRow.getCell(colNumber);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = dataBorder;
            if (typeof cell.value === 'number') {
                cell.numFmt = '#,##0';
            }
        }
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
}

export async function downloadStyledExcelWorkbook(opts: StyledExcelWorkbookOptions): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const matchers = opts.numericColumnMatchers ?? [
        'تناژ', 'کرایه', 'ارزش', 'مبلغ', 'کارتن', 'تعداد', 'ریال', 'کیلو', 'پیمایش', 'اجرت', 'تور',
    ];
    opts.sheets.forEach(sheet => applyStyledSheet(workbook, sheet, matchers));

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

export async function downloadStyledExcel(opts: StyledExcelExportOptions): Promise<void> {
    const includeRowNumber = opts.includeRowNumber !== false;
    const { headers, rows } = withRowNumberColumn(opts.headers, opts.rows, includeRowNumber);

    const workbook = new ExcelJS.Workbook();
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

    applyStyledSheet(
        workbook,
        { sheetName: opts.sheetName, headers, rows, includeRowNumber: false },
        matchers,
        {
            zebraFill: opts.zebraFill,
            borderStyle: opts.borderStyle,
            borderColor: opts.borderColor,
        }
    );

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

/** استایل نمونه اکسل پاستوریزه: هدر آبی، ردیف آبی روشن، کادر مشکی پررنگ */
export const DAIRY_FULL_EXCEL_STYLE = {
    zebraFill: ZEBRA_FILL_LIGHT_BLUE,
    borderStyle: 'medium' as ExcelBorderWeight,
    borderColor: 'FF000000',
};

export function buildExcelFileName(prefix: string, suffix: string, mode?: string): string {
    const dateStr = new Date().toISOString().split('T')[0];
    const parts = [prefix, suffix, mode, dateStr].filter(Boolean);
    return `${parts.join('_')}.xlsx`;
}
