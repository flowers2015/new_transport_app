const pool = require('../../db');
const { fetchDriverPreferences } = require('./baleDispatchBridge');

function formatTakenLine(item) {
  const parts = [
    item.announcementCode || '—',
    item.lineType ? `لاین ${item.lineType}` : null,
    item.originCity && item.destinationCity
      ? `${item.originCity}→${item.destinationCity}`
      : item.destinationCity || item.originCity,
    item.roundTripKm ? `~${Math.round(item.roundTripKm)}km` : null,
  ].filter(Boolean);
  return parts.join(' | ');
}

async function getAutoAssignStats(driverId) {
  const { rows } = await pool.query(
    `SELECT auto_assign_count, last_auto_assigned_at
     FROM bale_auto_assign_stats WHERE driver_id = $1`,
    [driverId]
  );
  return {
    autoAssignCount: rows[0]?.auto_assign_count || 0,
    lastAutoAssignedAt: rows[0]?.last_auto_assigned_at || null,
  };
}

async function incrementAutoAssignStats(driverId) {
  await pool.query(
    `INSERT INTO bale_auto_assign_stats (driver_id, auto_assign_count, last_auto_assigned_at, updated_at)
     VALUES ($1, 1, NOW(), NOW())
     ON CONFLICT (driver_id)
     DO UPDATE SET
       auto_assign_count = bale_auto_assign_stats.auto_assign_count + 1,
       last_auto_assigned_at = NOW(),
       updated_at = NOW()`,
    [driverId]
  );
}

/**
 * خلاصه ترجیحات برای اپراتور (وب) و متن PV راننده (تخصیص خودکار).
 */
async function buildPreferenceBrief(driverId, options = {}) {
  const { category, announcement } = options;
  const prefs = await fetchDriverPreferences({ driverId, category });
  const autoStats = await getAutoAssignStats(driverId);

  const taken = (prefs.taken || []).filter(t => !t.isCancelled);
  const recentTaken = taken.slice(0, 5);
  const peerCount = (prefs.peerAssignments || []).length;

  const lines = [];
  lines.push(`راننده: ${prefs.driver?.name || '—'} (کد ${prefs.driver?.employeeId || '—'})`);
  lines.push(`چرخه: ${prefs.fromJalali || '—'} تا ${prefs.toJalali || '—'}`);
  lines.push(`تورهای گرفته‌شده در بازه: ${taken.length}`);
  if (recentTaken.length > 0) {
    lines.push('آخرین تورها:');
    recentTaken.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${formatTakenLine(t)}`);
    });
  }
  lines.push(`تخصیص‌های هم‌رده در بازه: ${peerCount}`);
  lines.push(`تعداد تخصیص خودکار سیستم (بله): ${autoStats.autoAssignCount}`);

  if (announcement) {
    const annLine = [
      announcement.announcementCode || announcement.code,
      announcement.lineType ? `لاین ${announcement.lineType}` : null,
      announcement.originCity,
      announcement.destination?.city || announcement.destinationCity,
    ]
      .filter(Boolean)
      .join(' | ');
    lines.push(`بار پیشنهادی: ${annLine}`);
  }

  const operatorHtml = lines.join('\n');

  const driverAutoPv =
    `🤖 تخصیص خودکار (سیستم بله)\n` +
    `شما این بار را انتخاب نکردید؛ طبق نوبت و آمار ترجیحات انتخاب شد.\n` +
    `تعداد دفعاتی که سیستم برای شما خودکار تخصیص داده: ${autoStats.autoAssignCount}\n` +
    (announcement
      ? `بار: ${announcement.announcementCode || ''} | لاین: ${announcement.lineType || '—'} | ` +
        `${announcement.originCity || '—'} → ${announcement.destination?.city || announcement.destinationCity || '—'}`
      : '');

  return {
    driver: prefs.driver,
    takenCount: taken.length,
    peerCount,
    autoAssignCount: autoStats.autoAssignCount,
    operatorText: operatorHtml,
    driverAutoPvText: driverAutoPv,
    recentTaken,
    fromJalali: prefs.fromJalali,
    toJalali: prefs.toJalali,
  };
}

module.exports = {
  buildPreferenceBrief,
  getAutoAssignStats,
  incrementAutoAssignStats,
  formatTakenLine,
};
