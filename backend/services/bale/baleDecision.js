/**
 * تصمیم‌گیری بدون «امتیاز» — فقط قانون + نوبت + ترجیحات (یکتایی / شکست تساوی ثابت).
 */

const { isVeryFarAnnouncement } = require('../dispatch/dispatchRouteRules');
const { vehicleMatchesCategory } = require('../dispatch/dispatchVehicleCategory');
const { isLegacyTransportQueueLaw } = require('../dispatch/queueAnnouncementLaw');

function driverHasVeryFarHistory(driverEntry) {
  if (driverEntry?.hasVeryFarHistory) return true;
  if (driverEntry?.blockedStage1 && (driverEntry?.queueType || driverEntry?.queue_type) === 'far') {
    return true;
  }
  return (driverEntry?.longRouteHistory || []).length > 0;
}

/** سابقه خیلی‌دور دوره جاری — بدون blockedStage1 تا نوبت نزدیک در مرحله ۱ غلط علامت نخورد */
function driverWentVeryFarThisCycle(driverEntry) {
  if (driverEntry?.hasVeryFarHistory) return true;
  return (Array.isArray(driverEntry?.longRouteHistory) && driverEntry.longRouteHistory.length > 0);
}

/**
 * none_went: هیچ‌کس خیلی‌دور نرفته | all_went: همه رفته‌اند | mixed | empty
 * در دو حالت یکنواخت اعلام بار دو مرحله‌ای نباید اجرا شود.
 */
function classifyCategoryQueueVeryFar(queue) {
  const drivers = (queue || []).filter(q => {
    const qt = q.queueType || q.queue_type;
    return qt === 'far' || qt === 'near';
  });
  if (drivers.length === 0) return 'empty';
  let went = 0;
  for (const d of drivers) {
    if (driverWentVeryFarThisCycle(d)) went += 1;
  }
  if (went === 0) return 'none_went';
  if (went === drivers.length) return 'all_went';
  return 'mixed';
}

function shouldSkipTwoStageAnnouncement(queue) {
  const kind = classifyCategoryQueueVeryFar(queue);
  return kind === 'none_went' || kind === 'all_went';
}

function filterEligibleForDriver(announcements, driverEntry, stage, rejectedAnnouncementIds = []) {
  const rejected = new Set(rejectedAnnouncementIds || []);
  const category = driverEntry?.vehicleCategory || driverEntry?.vehicle_category;
  const queueType = driverEntry?.queueType || driverEntry?.queue_type;
  const hasVfHistory = driverHasVeryFarHistory(driverEntry);

  return (announcements || []).filter(ann => {
    if (rejected.has(ann.id)) return false;

    if (category && ann.vehicleType && !vehicleMatchesCategory(ann.vehicleType, category)) {
      return false;
    }

    if (stage === 'stage1') {
      if (isLegacyTransportQueueLaw()) {
        if (queueType !== 'far') return false;
      } else if (queueType !== 'far' && queueType !== 'near') {
        return false;
      }
      if (driverEntry?.blockedStage1 || hasVfHistory) return false;
      return isVeryFarAnnouncement(ann);
    }

    if (stage === 'stage2_far' || stage === 'stage2') {
      if (queueType !== 'far') return false;
      return true;
    }

    if (stage === 'stage2_near_vf') {
      if (queueType !== 'near') return false;
      if (hasVfHistory) return false;
      return isVeryFarAnnouncement(ann);
    }

    if (stage === 'stage2_near_all') {
      if (queueType !== 'near') return false;
      return true;
    }

    if (stage === 'stage2_all') {
      return queueType === 'far' || queueType === 'near';
    }

    return true;
  });
}

function pickMaxRemainingKm(eligible) {
  if (!eligible || eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    const kmA = Number(a?.route?.round_trip_km ?? a?.roundTripKm ?? 0) || 0;
    const kmB = Number(b?.route?.round_trip_km ?? b?.roundTripKm ?? 0) || 0;
    if (kmB !== kmA) return kmB - kmA;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  })[0];
}

function pickAutoAnnouncement(eligible, _recentTaken = []) {
  return pickMaxRemainingKm(eligible);
}

function canSemiAutoAssign(eligible) {
  return eligible.length === 1;
}

module.exports = {
  filterEligibleForDriver,
  pickAutoAnnouncement,
  pickMaxRemainingKm,
  canSemiAutoAssign,
  driverHasVeryFarHistory,
  driverWentVeryFarThisCycle,
  classifyCategoryQueueVeryFar,
  shouldSkipTwoStageAnnouncement,
};
