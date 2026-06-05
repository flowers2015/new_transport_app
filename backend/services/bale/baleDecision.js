/**
 * تصمیم‌گیری بدون «امتیاز» — فقط قانون + نوبت + ترجیحات (یکتایی / شکست تساوی ثابت).
 */

function filterEligibleForDriver(announcements, driverEntry, stage, rejectedAnnouncementIds = []) {
  const rejected = new Set(rejectedAnnouncementIds || []);
  const category = driverEntry?.vehicleCategory || driverEntry?.vehicle_category;

  return (announcements || []).filter(ann => {
    if (rejected.has(ann.id)) return false;
    if (stage === 'stage1' && driverEntry?.blockedStage1) return false;
    if (category && ann.vehicleType) {
      const vt = ann.vehicleType;
      if (category === 'تریلی' || category === 'مینی تریلی') {
        if (vt !== 'تریلی' && vt !== 'مینی تریلی') return false;
      } else if (category && vt !== category) {
        return false;
      }
    }
    return true;
  });
}

function pickAutoAnnouncement(eligible, recentTaken = []) {
  if (!eligible || eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  const lastLine = recentTaken[0]?.lineType || null;
  if (lastLine) {
    const lineMatches = eligible.filter(a => a.lineType === lastLine);
    if (lineMatches.length === 1) return lineMatches[0];
  }

  const withPriority = eligible.filter(a => {
    const p = (a.priority || '').toString().toLowerCase();
    return p === 'high' || p === 'بالا';
  });
  if (withPriority.length === 1) return withPriority[0];

  const sorted = [...eligible].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  return sorted[0];
}

function canSemiAutoAssign(eligible) {
  return eligible.length === 1;
}

module.exports = {
  filterEligibleForDriver,
  pickAutoAnnouncement,
  canSemiAutoAssign,
};
