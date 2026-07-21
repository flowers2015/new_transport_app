// Jalali date utilities for backend
// Simplified version of frontend jalali utils

const jalaali = require('jalaali-js');

function div(a, b) { return ~~(a / b); }
function pad2(n) { return n < 10 ? `0${n}` : String(n); }

function isLeapGregorian(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

function gregorianToJalali(gy, gm, gd) {
    const result = jalaali.toJalaali(gy, gm, gd);
    return [result.jy, result.jm, result.jd];
}

function jalaliToGregorian(jy, jm, jd) {
    const result = jalaali.toGregorian(jy, jm, jd);
    return [result.gy, result.gm, result.gd];
}

function formatJalali(date) {
    if (!date) return '-';

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (year >= 1400 && year <= 1500) {
        return `${year}/${pad2(month)}/${pad2(day)}`;
    }

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

    if (year >= 1400 && year <= 1500) {
        return `${year}/${pad2(month)}/${pad2(day)} ${hh}:${mm}`;
    }

    const [jy, jm, jd] = gregorianToJalali(year, month, day);
    return `${jy}/${pad2(jm)}/${pad2(jd)} ${hh}:${mm}`;
}

function parseJalaliDateString(jalali) {
    const m = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalali);
    if (!m) return null;
    const jy = parseInt(m[1], 10), jm = parseInt(m[2], 10), jd = parseInt(m[3], 10);
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    return new Date(gy, gm - 1, gd);
}

function daysDifferenceJalali(jalaliDate1, jalaliDate2) {
    const m1 = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalaliDate1);
    const m2 = /^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s*$/.exec(jalaliDate2);

    if (!m1 || !m2) return null;

    const jy1 = parseInt(m1[1], 10), jm1 = parseInt(m1[2], 10), jd1 = parseInt(m1[3], 10);
    const jy2 = parseInt(m2[1], 10), jm2 = parseInt(m2[2], 10), jd2 = parseInt(m2[3], 10);

    const [gy1, gm1, gd1] = jalaliToGregorian(jy1, jm1, jd1);
    const [gy2, gm2, gd2] = jalaliToGregorian(jy2, jm2, jd2);

    const date1 = new Date(gy1, gm1 - 1, gd1);
    const date2 = new Date(gy2, gm2 - 1, gd2);

    const diffMs = date2.getTime() - date1.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function timestampToJalaliDate(timestamp) {
    if (!timestamp) return null;

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const localYear = date.getFullYear();
    const localMonth = date.getMonth() + 1;
    const localDay = date.getDate();

    const [jy, jm, jd] = gregorianToJalali(localYear, localMonth, localDay);
    return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

function jalaliDateToDate(jalaliDate) {
    const parsed = parseJalaliDateString(jalaliDate);
    if (!parsed) return null;
    return parsed;
}

/**
 * اعتبارسنجی تاریخ شمسی YYYY/MM/DD
 */
function validateJalaliDateString(jalali) {
    if (!jalali || typeof jalali !== 'string') {
        return { ok: false, message: 'تاریخ نامعتبر است.' };
    }
    const normalized = jalali.trim().replace(/-/g, '/');
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
    if (!m) {
        return { ok: false, message: 'فرمت تاریخ باید YYYY/MM/DD باشد (مثلاً 1405/04/15).' };
    }
    const jy = parseInt(m[1], 10);
    const jm = parseInt(m[2], 10);
    const jd = parseInt(m[3], 10);
    if (jm < 1 || jm > 12) {
        return { ok: false, message: 'ماه تاریخ نامعتبر است.' };
    }
    const maxDay = jalaali.jalaaliMonthLength(jy, jm);
    if (jd < 1 || jd > maxDay) {
        return {
            ok: false,
            message: `روز ${jd} برای ماه ${jm} سال ${jy} معتبر نیست (حداکثر ${maxDay} روز).`,
        };
    }
    return { ok: true, jy, jm, jd, normalized: `${jy}/${pad2(jm)}/${pad2(jd)}` };
}

function shiftJalaliMonth(jy, jm, monthsToShift) {
    let newYear = jy;
    let newMonth = jm + monthsToShift;

    while (newMonth > 12) {
        newMonth -= 12;
        newYear += 1;
    }

    while (newMonth < 1) {
        newMonth += 12;
        newYear -= 1;
    }

    return { year: newYear, month: newMonth };
}

function getJalaliMonthRange(jy, jm) {
    const daysInMonth = jalaali.jalaaliMonthLength(jy, jm);
    const startDate = `${jy}/${pad2(jm)}/01`;
    const endDate = `${jy}/${pad2(jm)}/${pad2(daysInMonth)}`;
    return { startDate, endDate };
}

module.exports = {
    formatJalali,
    formatJalaliDateTime,
    parseJalaliDateString,
    gregorianToJalali,
    jalaliToGregorian,
    daysDifferenceJalali,
    timestampToJalaliDate,
    jalaliDateToDate,
    shiftJalaliMonth,
    getJalaliMonthRange,
    validateJalaliDateString,
};
