// Jalali date utilities for backend
// Simplified version of frontend jalali utils

const jalaali = require('jalaali-js');

function div(a, b) { return ~~(a / b); }
function pad2(n) { return n < 10 ? `0${n}` : String(n); }

function isLeapGregorian(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

function gregorianToJalali(gy, gm, gd) {
    // Use jalaali-js library for accurate conversion
    const result = jalaali.toJalaali(gy, gm, gd);
    return [result.jy, result.jm, result.jd];
}

function jalaliToGregorian(jy, jm, jd) {
    // Use jalaali-js library for accurate conversion
    const result = jalaali.toGregorian(jy, jm, jd);
    return [result.gy, result.gm, result.gd];
}

function formatJalali(date) {
    if (!date) return '-';
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // اگر سال بین 1400-1500 است، احتمالاً تاریخ شمسی است که به اشتباه به عنوان میلادی تفسیر شده
    // در این صورت، مستقیماً از سال/ماه/روز استفاده می‌کنیم
    if (year >= 1400 && year <= 1500) {
        // تاریخ شمسی که به اشتباه به عنوان میلادی تفسیر شده
        return `${year}/${pad2(month)}/${pad2(day)}`;
    }
    
    // در غیر این صورت، تبدیل از میلادی به شمسی
    const [jy, jm, jd] = gregorianToJalali(year, month, day);
    return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

function formatJalaliDateTime(date) {
    if (!date) return '-';
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    
    // اگر سال بین 1400-1500 است، احتمالاً تاریخ شمسی است که به اشتباه به عنوان میلادی تفسیر شده
    if (year >= 1400 && year <= 1500) {
        return `${year}/${pad2(month)}/${pad2(day)} ${hh}:${mm}`;
    }
    
    // در غیر این صورت، تبدیل از میلادی به شمسی
    const [jy, jm, jd] = gregorianToJalali(year, month, day);
    return `${jy}/${pad2(jm)}/${pad2(jd)} ${hh}:${mm}`;
}

function parseJalaliDateString(jalali) {
    // Expect format YYYY/MM/DD
    const m = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalali);
    if (!m) return null;
    const jy = parseInt(m[1], 10), jm = parseInt(m[2], 10), jd = parseInt(m[3], 10);
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    // Use local time instead of UTC to avoid timezone issues
    return new Date(gy, gm - 1, gd);
}

module.exports = {
    formatJalali,
    formatJalaliDateTime,
    parseJalaliDateString,
    gregorianToJalali,
    jalaliToGregorian
};
