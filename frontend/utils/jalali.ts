import { PlateNumber } from '../types';

export const formatJalali = (date: Date | string | null | undefined): string => {
    if (!date) return '-';
    // اگر date یک رشته شمسی است (فرمت YYYY/MM/DD یا YYYY-MM-DD)، `-` را به `/` تبدیل کن و برگردان
    if (typeof date === 'string' && /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(date)) {
        return date.replace(/-/g, '/');
    }
    // در غیر این صورت، آن را به عنوان Date در نظر بگیر و به شمسی تبدیل کن
    if (date instanceof Date) {
        const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
        return `${jy}/${pad2(jm)}/${pad2(jd)}`;
    }
    return '-';
};

export const formatJalaliDateTime = (date: Date | null | undefined): string => {
    if (!date) return '-';
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    return `${jy}/${pad2(jm)}/${pad2(jd)} ${hh}:${mm}`;
}

export const formatPlateNumber = (plate?: PlateNumber): string => {
    if (!plate) return '';
    // Prepending a Left-to-Right Mark (LRM) to ensure the browser renders
    // the mixed-direction string in the correct visual order.
    // The desired order is: part1 letter part2 - cityCode.
    return `\u200E${plate.part1} ${plate.letter} ${plate.part2} - ${plate.cityCode}`;
};

// --- Minimal Jalali <-> Gregorian conversion utilities ---
// Algorithms adapted from open sources (e.g., jalaali-js) with simplifications.

function div(a: number, b: number): number { return ~~(a / b); }
function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
    // Corrected algorithm for Jalali to Gregorian conversion
    const gy = jy + 621;
    const leap = (((jy + 38) * 682) % 2816) < 682;
    const march = 20 + leap;
    
    // Calculate days from start of year
    let days = 0;
    if (jm <= 6) {
        days = (jm - 1) * 31 + jd;
    } else {
        days = 186 + (jm - 7) * 30 + jd;
    }
    
    // Convert to Gregorian
    const gYear = gy;
    const gMonth = 3; // March
    let gDay = march + days - 1;
    
    // Adjust for Gregorian months
    const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (isLeapGregorian(gYear)) monthDays[1] = 29;
    
    let currentMonth = 2; // March (0-indexed)
    while (gDay > monthDays[currentMonth]) {
        gDay -= monthDays[currentMonth];
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            break;
        }
    }
    
    return [gYear, currentMonth + 1, gDay];
}

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
    const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = 355666 + (365 * gy) + div((gy2 + 3),4) - div((gy2 + 99),100) + div((gy2 + 399),400) + gd + g_d_m[gm - 1];
    let jy = -1595 + (33 * div(days, 12053));
    days %= 12053;
    jy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) { jy += div((days - 1), 365); days = (days - 1) % 365; }
    const jm = (days < 186) ? 1 + div(days, 31) : 7 + div(days - 186, 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
}

function isLeapGregorian(y: number): boolean { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

export function parseJalaliDateString(jalali: string): Date | null {
    // Expect format YYYY/MM/DD
    const m = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalali);
    if (!m) return null;
    const jy = parseInt(m[1], 10), jm = parseInt(m[2], 10), jd = parseInt(m[3], 10);
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    // Use local time instead of UTC to avoid timezone issues
    return new Date(gy, gm - 1, gd);
}
