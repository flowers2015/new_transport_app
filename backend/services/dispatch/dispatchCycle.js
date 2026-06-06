/**
 * دورهٔ نوبت‌دهی: ۲۶ هر ماه شمسی تا ۲۵ ماه بعد.
 * با شروع دورهٔ جدید، سابقهٔ خیلی‌دور دورهٔ قبل در محاسبه لحاظ نمی‌شود.
 */

const { gregorianToJalali, jalaliToGregorian } = require('../../utils/jalali');

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function computeJalaliCycleRange(referenceDate = new Date()) {
  const [jy, jm, jd] = gregorianToJalali(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate()
  );

  let fromYear;
  let fromMonth;
  let toYear;
  let toMonth;

  if (jd >= 26) {
    fromYear = jy;
    fromMonth = jm;
    if (jm === 12) {
      toYear = jy + 1;
      toMonth = 1;
    } else {
      toYear = jy;
      toMonth = jm + 1;
    }
  } else {
    if (jm === 1) {
      fromYear = jy - 1;
      fromMonth = 12;
    } else {
      fromYear = jy;
      fromMonth = jm - 1;
    }
    toYear = jy;
    toMonth = jm;
  }

  const [fromGy, fromGm, fromGd] = jalaliToGregorian(fromYear, fromMonth, 26);
  const [toGy, toGm, toGd] = jalaliToGregorian(toYear, toMonth, 25);

  const start = new Date(fromGy, fromGm - 1, fromGd, 0, 0, 0, 0);
  const end = new Date(toGy, toGm - 1, toGd, 23, 59, 59, 999);
  const fromJalali = `${fromYear}/${pad2(fromMonth)}/26`;
  const toJalali = `${toYear}/${pad2(toMonth)}/25`;

  return { start, end, fromJalali, toJalali };
}

module.exports = {
  computeJalaliCycleRange,
};
