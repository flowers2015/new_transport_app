// Jalali date utilities for backend
// Simplified version of frontend jalali utils

function div(a, b) { return ~~(a / b); }
function pad2(n) { return n < 10 ? `0${n}` : String(n); }

function isLeapGregorian(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

function gregorianToJalali(gy, gm, gd) {
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    const days = 365 * (gy - 621) + div((gy2 - 621), 4) - div((gy2 - 621), 100) + div((gy2 - 621), 400) - 80 + gd + ((gm < 3) ? 0 : (isLeapGregorian(gy) ? 29 : 28));
    const jy = 621 + div(days, 365.2422);
    const r = days - (365 * (jy - 621) + div((jy - 621), 4) - div((jy - 621), 100) + div((jy - 621), 400));
    const jm = (r < 186) ? (1 + div(r, 31)) : (7 + div(r - 186, 30));
    const jd = 1 + ((r < 186) ? (r % 31) : ((r - 186) % 30));
    return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
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

function formatJalali(date) {
    if (!date) return '-';
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

function formatJalaliDateTime(date) {
    if (!date) return '-';
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
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
