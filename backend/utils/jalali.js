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

/**
 * محاسبه تفاوت روز بین دو تاریخ شمسی (به صورت عدد صحیح)
 * @param {string} jalaliDate1 - تاریخ شمسی اول (فرمت YYYY/MM/DD یا YYYY-MM-DD)
 * @param {string} jalaliDate2 - تاریخ شمسی دوم (فرمت YYYY/MM/DD یا YYYY-MM-DD)
 * @returns {number} - تفاوت روز (اگر date2 > date1 مثبت، وگرنه منفی)
 */
function daysDifferenceJalali(jalaliDate1, jalaliDate2) {
    // Parse both dates
    const m1 = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalaliDate1);
    const m2 = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalaliDate2);
    
    if (!m1 || !m2) return null;
    
    const jy1 = parseInt(m1[1], 10), jm1 = parseInt(m1[2], 10), jd1 = parseInt(m1[3], 10);
    const jy2 = parseInt(m2[1], 10), jm2 = parseInt(m2[2], 10), jd2 = parseInt(m2[3], 10);
    
    // Convert to Gregorian
    const [gy1, gm1, gd1] = jalaliToGregorian(jy1, jm1, jd1);
    const [gy2, gm2, gd2] = jalaliToGregorian(jy2, jm2, jd2);
    
    // Create Date objects
    const date1 = new Date(gy1, gm1 - 1, gd1);
    const date2 = new Date(gy2, gm2 - 1, gd2);
    
    // Calculate difference in milliseconds, then convert to days
    const diffMs = date2.getTime() - date1.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * تبدیل TIMESTAMPTZ به تاریخ شمسی (فقط تاریخ، بدون زمان)
 * @param {Date|string} timestamp - تاریخ میلادی
 * @returns {string} - تاریخ شمسی به فرمت YYYY/MM/DD
 */
function timestampToJalaliDate(timestamp) {
    if (!timestamp) return null;
    
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    // استفاده از timezone محلی برای محاسبه دقیق تاریخ
    // این باعث می‌شود که اگر تخصیص در همان روز انجام شده باشد، daysDiff === 0 شود
    const localYear = date.getFullYear();
    const localMonth = date.getMonth() + 1;
    const localDay = date.getDate();
    
    const [jy, jm, jd] = gregorianToJalali(localYear, localMonth, localDay);
    return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

module.exports = {
    formatJalali,
    formatJalaliDateTime,
    parseJalaliDateString,
    gregorianToJalali,
    jalaliToGregorian,
    daysDifferenceJalali,
    timestampToJalaliDate
};
