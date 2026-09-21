'use strict';

/**
 * تست قانون اعلام بار نوبت (بدون دیتابیس — امن برای سرور در حال اجرا)
 *
 * قانون جاری:
 *  مرحله ۱ = فقط بار خیلی‌دور برای همه نفرات نرفته (نوبت دور و نزدیک) + «بمانم»
 *  مرحله بعد = همه بارهای باقی‌مانده از ابتدای نوبت دور تا ته صف
 */
const {
  QUEUE_ANNOUNCEMENT_LAW,
  ACTIVE_QUEUE_ANNOUNCEMENT_LAW,
  LEGACY_TRANSPORT_PHASE_CHAIN,
  CURRENT_PHASE_CHAIN,
  isLegacyTransportQueueLaw,
  isCurrentQueueAnnouncementLaw,
  getDispatchPhaseChain,
  getInitialPromotePhases,
} = require('../services/dispatch/queueAnnouncementLaw');

const {
  filterEligibleForDriver,
  classifyCategoryQueueVeryFar,
  shouldSkipTwoStageAnnouncement,
} = require('../services/bale/baleDecision');

const { formatFreightLineTypeFa } = require('../utils/freightEnums');
const { announcementLineLabel } = require('../services/bale/baleFormat');

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

const vfLoad = id => ({
  id,
  vehicleType: 'تریلی',
  route: { distance_category: 'خیلی‌دور', round_trip_km: 2400 },
});
const nearLoad = id => ({
  id,
  vehicleType: 'تریلی',
  route: { distance_category: 'نزدیک', round_trip_km: 300 },
});

const farNotGone = { id: 'q1', queueType: 'far', longRouteHistory: [], vehicleCategory: 'تریلی' };
const farGone = {
  id: 'q2',
  queueType: 'far',
  hasVeryFarHistory: true,
  longRouteHistory: [{ city: 'زاهدان' }],
  vehicleCategory: 'تریلی',
};
const nearNotGone = { id: 'q3', queueType: 'near', longRouteHistory: [], vehicleCategory: 'تریلی' };
const nearGone = {
  id: 'q4',
  queueType: 'near',
  hasVeryFarHistory: true,
  longRouteHistory: [{ city: 'چابهار' }],
  vehicleCategory: 'تریلی',
};

const loads = [vfLoad('A'), vfLoad('B'), nearLoad('C'), nearLoad('D')];

console.log('\n=== قانون فعال ===');
assert('قانون جاری فعال است', ACTIVE_QUEUE_ANNOUNCEMENT_LAW === QUEUE_ANNOUNCEMENT_LAW.CURRENT);
assert('قانون قدیم ترابری فعال نیست', isLegacyTransportQueueLaw() === false);
assert('isCurrentQueueAnnouncementLaw صحیح', isCurrentQueueAnnouncementLaw() === true);

console.log('\n=== قانون قدیم ترابری حذف نشده ===');
assert('زنجیره قدیم موجود است', Boolean(LEGACY_TRANSPORT_PHASE_CHAIN.stage1));
assert(
  'قدیم: stage1 → stage2_far',
  LEGACY_TRANSPORT_PHASE_CHAIN.stage1[0][0] === 'stage2_far'
);
assert(
  'قدیم: stage2_far → stage2_near_vf سپس stage2_near_all',
  LEGACY_TRANSPORT_PHASE_CHAIN.stage2_far[0][0] === 'stage2_near_vf' &&
    LEGACY_TRANSPORT_PHASE_CHAIN.stage2_far[1][0] === 'stage2_near_all'
);
assert(
  'قدیم: stage2_near_vf → stage2_near_all',
  LEGACY_TRANSPORT_PHASE_CHAIN.stage2_near_vf[0][0] === 'stage2_near_all'
);

console.log('\n=== زنجیره فاز قانون جاری ===');
assert('جاری: stage1 → stage2_all', CURRENT_PHASE_CHAIN.stage1[0][0] === 'stage2_all');
assert('زنجیره فعال = جاری', getDispatchPhaseChain() === CURRENT_PHASE_CHAIN);
assert('بدون فاز میانی نزدیک/دور', !getDispatchPhaseChain().stage2_far);
assert(
  'ارتقای اولیه فقط stage2_all',
  getInitialPromotePhases().length === 1 && getInitialPromotePhases()[0] === 'stage2_all'
);

console.log('\n=== مرحله ۱: خیلی‌دور برای دور و نزدیکِ نرفته ===');
const s1Far = filterEligibleForDriver(loads, farNotGone, 'stage1');
assert('دورِ نرفته فقط خیلی‌دور می‌بیند', s1Far.length === 2 && s1Far.every(a => ['A', 'B'].includes(a.id)));

const s1Near = filterEligibleForDriver(loads, nearNotGone, 'stage1');
assert('نزدیکِ نرفته هم در مرحله ۱ خیلی‌دور می‌بیند', s1Near.length === 2);
assert('نزدیکِ نرفته بار نزدیک نمی‌بیند', s1Near.every(a => a.id === 'A' || a.id === 'B'));

assert('دورِ رفته در مرحله ۱ نیست', filterEligibleForDriver(loads, farGone, 'stage1').length === 0);
assert('نزدیکِ رفته در مرحله ۱ نیست', filterEligibleForDriver(loads, nearGone, 'stage1').length === 0);

console.log('\n=== مرحله بعد: همه بارها از ابتدای نوبت دور تا ته صف ===');
assert('دورِ نرفته همه بارها', filterEligibleForDriver(loads, farNotGone, 'stage2_all').length === 4);
assert('دورِ رفته همه بارها', filterEligibleForDriver(loads, farGone, 'stage2_all').length === 4);
assert('نزدیکِ نرفته همه بارها', filterEligibleForDriver(loads, nearNotGone, 'stage2_all').length === 4);
assert('نزدیکِ رفته همه بارها', filterEligibleForDriver(loads, nearGone, 'stage2_all').length === 4);

console.log('\n=== سناریوی کاربر: ۳ دور / ۳ نزدیک، یک دور نرفته ===');
const scenarioQueue = [
  { id: 'f1', queueType: 'far', hasVeryFarHistory: true, longRouteHistory: [{ city: 'زاهدان' }] },
  { id: 'f2', queueType: 'far', longRouteHistory: [] },
  { id: 'f3', queueType: 'far', hasVeryFarHistory: true, longRouteHistory: [{ city: 'ایرانشهر' }] },
  { id: 'n1', queueType: 'near', longRouteHistory: [] },
  { id: 'n2', queueType: 'near', longRouteHistory: [] },
  { id: 'n3', queueType: 'near', longRouteHistory: [] },
];
assert('صف mixed است', classifyCategoryQueueVeryFar(scenarioQueue) === 'mixed');
assert('mixed یعنی دو مرحله اجرا می‌شود', shouldSkipTwoStageAnnouncement(scenarioQueue) === false);

const stage1Eligible = scenarioQueue.filter(
  q => filterEligibleForDriver(loads, q, 'stage1').length > 0
);
assert('۴ نفر در مرحله ۱ (۱ دور + ۳ نزدیک)', stage1Eligible.length === 4);
assert('f2 در مرحله ۱ هست', stage1Eligible.some(q => q.id === 'f2'));
assert(
  'هر سه نزدیکِ نرفته در مرحله ۱ هستند',
  ['n1', 'n2', 'n3'].every(id => stage1Eligible.some(q => q.id === id))
);
assert('دورهای رفته در مرحله ۱ نیستند', !stage1Eligible.some(q => q.id === 'f1' || q.id === 'f3'));

console.log('\n=== حالت‌های یکنواخت (بدون تغییر) ===');
assert(
  'none_went → یک مرحله‌ای',
  shouldSkipTwoStageAnnouncement([
    { queueType: 'far', longRouteHistory: [] },
    { queueType: 'near', longRouteHistory: [] },
  ]) === true
);
assert(
  'all_went → یک مرحله‌ای',
  shouldSkipTwoStageAnnouncement([
    { queueType: 'far', hasVeryFarHistory: true },
    { queueType: 'near', hasVeryFarHistory: true },
  ]) === true
);

console.log('\n=== نام لاین در پیام بله فارسی است ===');
assert('IceCream → بستنی', formatFreightLineTypeFa('IceCream') === 'بستنی');
assert('Dairy → پاستوریزه', formatFreightLineTypeFa('Dairy') === 'پاستوریزه');
assert('Ambient → لبنیات-فروتلند', formatFreightLineTypeFa('Ambient') === 'لبنیات-فروتلند');
assert('ردیف بار: IceCream فارسی', announcementLineLabel({ lineType: 'IceCream' }) === 'بستنی');
assert('ردیف بار: Dairy فارسی', announcementLineLabel({ line_type: 'Dairy' }) === 'پاستوریزه');
assert('ردیف بار: فارسی بدون تغییر', announcementLineLabel({ lineType: 'بستنی' }) === 'بستنی');
assert('ردیف بار: خالی → —', announcementLineLabel({}) === '—');

console.log(`\n=== نتیجه: ${passed} موفق، ${failed} ناموفق ===\n`);
process.exit(failed === 0 ? 0 : 1);
