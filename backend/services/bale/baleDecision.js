/**
 * تصمیم‌گیری بدون «امتیاز» — فقط قانون + نوبت + ترجیحات (یکتایی / شکست تساوی ثابت).
 */

const { isVeryFarAnnouncement } = require('../dispatch/dispatchRouteRules');
const { vehicleMatchesCategory } = require('../dispatch/dispatchVehicleCategory');

function driverHasVeryFarHistory(driverEntry) {
  if (driverEntry?.hasVeryFarHistory) return true;
  if (driverEntry?.blockedStage1 && (driverEntry?.queueType || driverEntry?.queue_type) === 'far') {
    return true;
  }
  return (driverEntry?.longRouteHistory || []).length > 0;
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
      if (queueType !== 'far') return false;
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
};
