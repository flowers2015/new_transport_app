'use strict';

/**
 * تست قوانین کارتابل اعلام‌بار — بدون دیتابیس (امن برای سرور در حال اجرا)
 */
const {
  normalizeFreightLineTypeKey,
  lineTypeSqlAliases,
  lineTypeMatches,
  formatFreightLineTypeFa,
  isDairyLineTypeValue,
  isDairyOrAmbientLineType,
  isAmbientLineType,
  isIceCreamLineType,
  normalizeFreightAnnouncementStatus,
  statusMatches,
  isPlannerFullEditStatus,
  isTransportIntakeStatus,
  isEnteringTransportIntake,
  resolveAssignmentQueueFromLineType,
  planningEmployeeCanSeeAnnouncement,
  managerRejectReturnsStatus,
  transportReturnStatus,
} = require('../utils/freightEnums');

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

console.log('\n=== لاین: فارسی و انگلیسی یک کلید ===');
assert('بستنی → IceCream', normalizeFreightLineTypeKey('بستنی') === 'IceCream');
assert('IceCream → IceCream', normalizeFreightLineTypeKey('IceCream') === 'IceCream');
assert('پاستوریزه → Dairy', normalizeFreightLineTypeKey('پاستوریزه') === 'Dairy');
assert('Dairy → Dairy', normalizeFreightLineTypeKey('Dairy') === 'Dairy');
assert('لبنیات-فروتلند → Ambient', normalizeFreightLineTypeKey('لبنیات-فروتلند') === 'Ambient');
assert('Ambient → Ambient', normalizeFreightLineTypeKey('Ambient') === 'Ambient');
assert('Basteni → IceCream', normalizeFreightLineTypeKey('Basteni') === 'IceCream');
assert('Pasturized → Dairy', normalizeFreightLineTypeKey('Pasturized') === 'Dairy');
assert('match بستنی/IceCream', lineTypeMatches('بستنی', 'IceCream'));
assert('match لبنیات/Ambient', lineTypeMatches('لبنیات-فروتلند', 'Ambient'));
assert('no match بستنی/Dairy', !lineTypeMatches('بستنی', 'Dairy'));
assert('aliases IceCream شامل هر دو', lineTypeSqlAliases('بستنی').includes('IceCream') && lineTypeSqlAliases('IceCream').includes('بستنی'));
assert('برچسب فارسی Ambient', formatFreightLineTypeFa('Ambient') === 'لبنیات-فروتلند');
assert('isDairy فقط پاستوریزه', isDairyLineTypeValue('Dairy') && !isDairyLineTypeValue('Ambient'));
assert('isDairyOrAmbient لبنیات', isDairyOrAmbientLineType('Ambient') && isDairyOrAmbientLineType('پاستوریزه'));
assert('isAmbient', isAmbientLineType('لبنیات-فروتلند') && !isAmbientLineType('Dairy'));
assert('isIceCream', isIceCreamLineType('بستنی') && !isIceCreamLineType('Ambient'));

console.log('\n=== وضعیت: فارسی و انگلیسی یک کلید ===');
assert('پیش‌نویس → Draft', normalizeFreightAnnouncementStatus('پیش‌نویس') === 'Draft');
assert('Draft → Draft', normalizeFreightAnnouncementStatus('Draft') === 'Draft');
assert('در انتظار تایید مدیر', normalizeFreightAnnouncementStatus('در انتظار تایید مدیر') === 'PendingManagerApproval');
assert('برگشت به اعلام‌کننده', normalizeFreightAnnouncementStatus('برگشت به اعلام‌کننده') === 'ReturnedToCreator');
assert('در انتظار تخصیص شخصی', normalizeFreightAnnouncementStatus('در انتظار تخصیص (شخصی)') === 'PendingPersonalAssignment');
assert('match Draft/پیش‌نویس', statusMatches('Draft', 'پیش‌نویس'));
assert('planner edit Draft', isPlannerFullEditStatus('Draft') && isPlannerFullEditStatus('پیش‌نویس'));
assert('planner edit Returned', isPlannerFullEditStatus('ReturnedToCreator'));
assert('planner NOT PendingManager', !isPlannerFullEditStatus('PendingManagerApproval'));
assert('intake personal EN', isTransportIntakeStatus('PendingPersonalAssignment'));
assert('intake personal FA', isTransportIntakeStatus('در انتظار تخصیص (شخصی)'));
assert('enter intake از Draft', isEnteringTransportIntake('Draft', 'PendingPersonalAssignment'));
assert('enter intake از پیش‌نویس', isEnteringTransportIntake('پیش‌نویس', 'در انتظار تخصیص (شخصی)'));
assert('نه enter اگر قبلا intake', !isEnteringTransportIntake('PendingCompanyAssignment', 'PendingPersonalAssignment'));

console.log('\n=== صف ترابری از روی لاین ===');
assert('بستنی → شرکتی', resolveAssignmentQueueFromLineType('بستنی').assignmentType === 'company');
assert('IceCream → شرکتی', resolveAssignmentQueueFromLineType('IceCream').status === 'PendingCompanyAssignment');
assert('پاستوریزه → شخصی', resolveAssignmentQueueFromLineType('پاستوریزه').assignmentType === 'personal');
assert('Dairy → شخصی', resolveAssignmentQueueFromLineType('Dairy').status === 'PendingPersonalAssignment');
assert('Ambient → شخصی', resolveAssignmentQueueFromLineType('Ambient').assignmentType === 'personal');
assert('لبنیات → شخصی', resolveAssignmentQueueFromLineType('لبنیات-فروتلند').queueLabel === 'شخصی');

console.log('\n=== کارتابل کارمند/کارشناس ===');
const emp = 'user-emp';
const other = 'user-other';
assert(
  'پاستوریزه را همه می‌بینند',
  planningEmployeeCanSeeAnnouncement({ lineType: 'Dairy', createdByUserId: other, destOwnerUserIds: [], viewerUserId: emp })
);
assert(
  'پاستوریزه فارسی را همه می‌بینند',
  planningEmployeeCanSeeAnnouncement({ lineType: 'پاستوریزه', createdByUserId: other, destOwnerUserIds: [], viewerUserId: emp })
);
assert(
  'بستنی فقط مالک',
  planningEmployeeCanSeeAnnouncement({ lineType: 'IceCream', createdByUserId: emp, destOwnerUserIds: [], viewerUserId: emp }) &&
    !planningEmployeeCanSeeAnnouncement({ lineType: 'بستنی', createdByUserId: other, destOwnerUserIds: [], viewerUserId: emp })
);
assert(
  'لبنیات فقط مالک',
  !planningEmployeeCanSeeAnnouncement({ lineType: 'Ambient', createdByUserId: other, destOwnerUserIds: [], viewerUserId: emp })
);
assert(
  'لبنیات با مالک مقصد دیده می‌شود',
  planningEmployeeCanSeeAnnouncement({ lineType: 'لبنیات-فروتلند', createdByUserId: other, destOwnerUserIds: [emp], viewerUserId: emp })
);

console.log('\n=== رد مدیر و برگشت ترابری ===');
assert('رد مدیر → Draft (قابل اصلاح کارمند)', managerRejectReturnsStatus() === 'Draft');
assert('برگشت ترابری → ReturnedToCreator', transportReturnStatus() === 'ReturnedToCreator');
assert('بعد از رد، کارمند ویرایش کامل دارد', isPlannerFullEditStatus(managerRejectReturnsStatus()));
assert('بعد از برگشت ترابری هم ویرایش کامل', isPlannerFullEditStatus(transportReturnStatus()));
assert('صف ترابری ویرایش کامل کارمند ندارد', !isPlannerFullEditStatus('PendingPersonalAssignment'));

console.log('\n=== ادمین/گزارش: برچسب فارسی از کلید انگلیسی ===');
assert('گزارش IceCream', formatFreightLineTypeFa('IceCream') === 'بستنی');
assert('گزارش Dairy', formatFreightLineTypeFa('Dairy') === 'پاستوریزه');
assert('گزارش Ambient', formatFreightLineTypeFa('Ambient') === 'لبنیات-فروتلند');

console.log('\n=== تغییر نوع خودرو مجاز ===');
assert('مجاز پاستوریزه و لبنیات', isDairyOrAmbientLineType('Dairy') && isDairyOrAmbientLineType('Ambient'));
assert('غیرمجاز بستنی', !isDairyOrAmbientLineType('IceCream'));

console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
process.exit(failed ? 1 : 0);
