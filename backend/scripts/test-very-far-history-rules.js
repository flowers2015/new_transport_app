'use strict';

/**
 * تست قواعد سابقه خیلی‌دور (بدون دیتابیس — امن برای سرور در حال اجرا)
 *
 * قواعد:
 *  - معیار «رفته» همان اتمام تخصیص است.
 *  - لغو تخصیص تاریخ اتمام را پاک می‌کند، پس سفر لغوشده در سابقه نمی‌ماند.
 *  - رد مالی «اجرا نشده» = نرفته؛ رد مالی «ناقص» = رفته.
 *  - تور استثنایی مالی یک سفر واقعی است و در دوره تاریخ بارنامه/بارگیری شمرده می‌شود.
 */
const {
  resolveAssignmentCertainty,
  isTripNotExecuted,
  isFinanceRejected,
  mapAssignmentRow,
  buildCycleSummary,
  buildStats,
  buildBehaviorAnalysis,
  aggregateCycleTripStats,
  financeExceptionTripDate,
  FINANCE_REJECT_NOT_EXECUTED,
} = require('../services/dispatch/driverPreferences');

const { timestampToJalaliDate } = require('../utils/jalali');

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

const FINALIZED_AT = new Date('2026-09-10T08:00:00Z');

function baseRow(extra = {}) {
  return {
    id: extra.id || 'da-1',
    freight_announcement_id: extra.announcementId || 'fa-1',
    announcement_code: 'FA-100',
    stage: 'stage1',
    created_at: new Date('2026-09-10T05:00:00Z'),
    queue_type: 'far',
    queue_position: 1,
    distance_category: 'خیلی‌دور',
    route_category: 'خیلی‌دور',
    round_trip_km: 2400,
    vehicle_type: 'تریلی',
    freight_status: 'Finalized',
    assignment_finalized_at: FINALIZED_AT,
    is_cancelled: false,
    ...extra,
  };
}

console.log('\n=== تشخیص رد مالی ===');
assert(
  'اجرا نشده = نرفته',
  isTripNotExecuted({ finance_disposition: 'rejected', finance_reject_type: 'not_executed' })
);
assert(
  'ناقص = نرفته نیست',
  !isTripNotExecuted({ finance_disposition: 'rejected', finance_reject_type: 'partial' })
);
assert('بدون رد مالی', !isFinanceRejected({}));
assert('ثابت نوع رد', FINANCE_REJECT_NOT_EXECUTED === 'not_executed');

console.log('\n=== وضعیت تخصیص ===');
assert(
  'تخصیص نهایی‌شده = نهایی',
  resolveAssignmentCertainty(baseRow()).certainty === 'finalized'
);
assert(
  'رد مالی اجرا نشده = finance_rejected',
  resolveAssignmentCertainty(
    baseRow({ finance_disposition: 'rejected', finance_reject_type: 'not_executed', is_cancelled: true })
  ).certainty === 'finance_rejected'
);
assert(
  'رد مالی ناقص همچنان نهایی',
  resolveAssignmentCertainty(
    baseRow({ finance_disposition: 'rejected', finance_reject_type: 'partial', is_cancelled: true })
  ).certainty === 'finalized'
);
assert(
  'لغو قبل از نهایی = لغو',
  resolveAssignmentCertainty(
    baseRow({ assignment_finalized_at: null, freight_status: 'PendingCompanyAssignment', is_cancelled: true })
  ).certainty === 'cancelled'
);
assert(
  'لغو بعد از نهایی (تاریخ پاک شده) = لغو',
  resolveAssignmentCertainty(
    baseRow({ assignment_finalized_at: null, freight_status: 'PendingCompanyAssignment', is_cancelled: true })
  ).certainty === 'cancelled'
);

console.log('\n=== خلاصه دوره: چه چیزی خیلی‌دور شمرده می‌شود ===');
const takenFinalized = [mapAssignmentRow(baseRow(), timestampToJalaliDate)];
assert('سفر نهایی در خیلی‌دور می‌آید', buildCycleSummary(takenFinalized).veryFar.length === 1);

const takenRejected = [
  mapAssignmentRow(
    baseRow({ finance_disposition: 'rejected', finance_reject_type: 'not_executed', is_cancelled: true }),
    timestampToJalaliDate
  ),
];
assert('رد مالی اجرا نشده در خیلی‌دور نمی‌آید', buildCycleSummary(takenRejected).veryFar.length === 0);
assert('و در شمارش نهایی هم نیست', buildStats(takenRejected).finalizedCount === 0);
assert('ولی جدا شمرده می‌شود', buildStats(takenRejected).financeRejectedCount === 1);

const takenPartial = [
  mapAssignmentRow(
    baseRow({ finance_disposition: 'rejected', finance_reject_type: 'partial', is_cancelled: true }),
    timestampToJalaliDate
  ),
];
assert('رد مالی ناقص در خیلی‌دور می‌ماند', buildCycleSummary(takenPartial).veryFar.length === 1);
assert('نوع رد مالی روی آیتم می‌آید', takenPartial[0].financeRejectType === 'partial');

const takenCancelled = [
  mapAssignmentRow(
    baseRow({ assignment_finalized_at: null, freight_status: 'PendingCompanyAssignment', is_cancelled: true }),
    timestampToJalaliDate
  ),
];
assert('سفر لغوشده در خیلی‌دور نمی‌آید', buildCycleSummary(takenCancelled).veryFar.length === 0);

console.log('\n=== تحلیل رفتار: سفرهای انجام‌نشده کنار گذاشته می‌شوند ===');
const mixed = [...takenFinalized, ...takenRejected, ...takenCancelled];
assert('فقط یک سفر واقعی', buildBehaviorAnalysis(mixed, {}).tripCount === 1);

console.log('\n=== تور استثنایی: یک سفر = یک شمارش ===');
const originalTrip = {
  id: 'da-1',
  driverId: 'drv-1',
  announcementId: 'fa-1',
  km: 2400,
  bucket: 'veryFar',
  isVeryFar: true,
  createdAt: FINALIZED_AT,
};
const exceptionTrip = {
  id: 'exc-1',
  driverId: 'drv-1',
  announcementId: 'exc-1',
  km: 2400,
  bucket: 'veryFar',
  isVeryFar: true,
  createdAt: FINALIZED_AT,
  stage: 'finance_exception',
};
assert(
  'اجرا نشده + تور استثنایی = یک خیلی‌دور',
  aggregateCycleTripStats([exceptionTrip]).vfMap.get('drv-1') === 1
);
assert(
  'ناقص (تور اصلی می‌ماند، استثنایی شمرده نمی‌شود) = یک خیلی‌دور',
  aggregateCycleTripStats([originalTrip]).vfMap.get('drv-1') === 1
);
assert(
  'اگر هر دو بیایند دو تا می‌شد — پس فیلتر لینک لازم است',
  aggregateCycleTripStats([originalTrip, exceptionTrip]).vfMap.get('drv-1') === 2
);

console.log('\n=== دوره تور استثنایی: مرجع، تاریخ صدور بارنامه است ===');
const REGISTERED_AT = new Date('2026-10-05T09:00:00Z'); // زمان ثبت مالی، دوره بعد
const jalaliDay = date => timestampToJalaliDate(date);

assert(
  'تاریخ بارنامه روی اعلام‌بار بر همه مقدم است',
  jalaliDay(
    financeExceptionTripDate({
      bill_of_lading_date: '1405/06/20',
      calc_bill_of_lading_date: '1405/07/02',
      loading_date: '1405/06/18',
      created_at: REGISTERED_AT,
    })
  ) === '1405/06/20'
);
assert(
  'اگر روی اعلام‌بار نبود، از محاسبه راننده',
  jalaliDay(
    financeExceptionTripDate({
      bill_of_lading_date: '',
      calc_bill_of_lading_date: '1405/06/21',
      loading_date: '1405/06/18',
      created_at: REGISTERED_AT,
    })
  ) === '1405/06/21'
);
assert(
  'بعد از آن، تاریخ تراکنش بارنامه (میلادی)',
  jalaliDay(
    financeExceptionTripDate({
      txn_bill_of_lading_at: '2026-09-12',
      loading_date: '1405/06/18',
      created_at: REGISTERED_AT,
    })
  ) === jalaliDay(new Date('2026-09-12'))
);
assert(
  'تاریخ بارگیری فقط وقتی بارنامه هیچ‌جا نیست',
  jalaliDay(
    financeExceptionTripDate({ loading_date: '1405/06/18', created_at: REGISTERED_AT })
  ) === '1405/06/18'
);
assert(
  'هیچ‌کدام نبود، زمان ثبت',
  financeExceptionTripDate({ created_at: REGISTERED_AT }).getTime() === REGISTERED_AT.getTime()
);
assert('ردیف خالی تاریخ ندارد', financeExceptionTripDate({}) === null);
assert(
  'قالب خط‌تیره هم خوانده می‌شود',
  jalaliDay(financeExceptionTripDate({ bill_of_lading_date: '1405-06-20' })) === '1405/06/20'
);

console.log(`\n=== نتیجه: ${passed} موفق، ${failed} ناموفق ===\n`);
process.exit(failed === 0 ? 0 : 1);
