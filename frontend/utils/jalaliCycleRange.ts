/**
 * دوره نوبت/گزارش: از ۲۶ ماه شمسی تا ۲۵ ماه بعد.
 */
import { gregorianToJalali } from './jalali';

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

export function getDefaultJalaliCycleRange(referenceDate: Date = new Date()): {
  from: string;
  to: string;
  fromSlash: string;
  toSlash: string;
} {
  const [jy, jm, jd] = gregorianToJalali(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate()
  );

  let fromYear: number;
  let fromMonth: number;
  let toYear: number;
  let toMonth: number;

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

  const fromSlash = `${fromYear}/${pad2(fromMonth)}/26`;
  const toSlash = `${toYear}/${pad2(toMonth)}/25`;
  return {
    from: fromSlash.replace(/\//g, '-'),
    to: toSlash.replace(/\//g, '-'),
    fromSlash,
    toSlash,
  };
}
