const pool = require('../../db');
const { vehicleMatchesCategory } = require('../dispatch/dispatchVehicleCategory');

const DISPATCH_CATEGORIES = ['تریلی', 'مینی تریلی', 'ده چرخ'];

const DEFAULT_SLOT_BY_CATEGORY = {
  تریلی: 2,
  'مینی تریلی': 3,
  'ده چرخ': 4,
};

async function loadChannelRows() {
  const { rows } = await pool.query(
    `SELECT slot_number, vehicle_category, chat_id, is_active, label
     FROM bale_channels ORDER BY slot_number`
  );
  return rows;
}

function isUsableChannel(row) {
  return row && row.chat_id != null && row.is_active !== false;
}

function buildPlansFromRows(rows) {
  const fallback =
    rows.find(r => r.vehicle_category === 'تریلی' && isUsableChannel(r)) ||
    rows.find(r => r.slot_number === 2 && isUsableChannel(r)) ||
    rows.find(r => isUsableChannel(r) && r.slot_number !== 1);

  const plans = [];
  for (const category of DISPATCH_CATEGORIES) {
    const dedicated = rows.find(r => r.vehicle_category === category && isUsableChannel(r));
    const row = dedicated || fallback;
    if (!row) continue;
    plans.push({
      category,
      slot: row.slot_number,
      chatId: String(row.chat_id),
      pilotCombined: false,
      sharedChannel: !dedicated,
    });
  }
  return plans;
}

async function getDispatchChannelPlans() {
  const rows = await loadChannelRows();
  return buildPlansFromRows(rows);
}

function describeChannelBlocker(rows, { vehicleCategory, slot } = {}) {
  const slotNum = slot != null ? Number(slot) : DEFAULT_SLOT_BY_CATEGORY[vehicleCategory];
  const ch =
    slotNum != null
      ? rows.find(r => r.slot_number === slotNum)
      : rows.find(r => r.vehicle_category === vehicleCategory);

  if (ch?.chat_id != null && ch.is_active === false) {
    const label = vehicleCategory || ch.vehicle_category || `اسلات ${slotNum}`;
    return `کانال «${label}» chat_id دارد ولی غیرفعال است — از تنظیمات بله (ادمین) دوباره «ذخیره» بزنید.`;
  }
  if (ch?.chat_id == null) {
    const label = vehicleCategory || ch?.vehicle_category || `اسلات ${slotNum}`;
    return `کانال «${label}» chat_id ندارد — از پنل ادمین (تنظیمات بله) شناسه گروه را ذخیره کنید.`;
  }
  if (vehicleCategory) {
    return `کانال فعالی برای «${vehicleCategory}» تنظیم نشده.`;
  }
  return `اسلات ${slot} فعال نیست یا chat_id ندارد.`;
}

async function getCategoryQueueCounts() {
  const { rows } = await pool.query(
    `SELECT vehicle_category, COUNT(*)::int AS c
     FROM dispatch_queue_entries
     WHERE queue_type IN ('far', 'near')
     GROUP BY vehicle_category`
  );
  const counts = Object.fromEntries(rows.map(r => [r.vehicle_category, r.c]));
  return DISPATCH_CATEGORIES.map(category => ({
    category,
    queueCount: counts[category] || 0,
  }));
}

function announcementMatchesCategory(vehicleType, category) {
  if (!category || !vehicleType) return true;
  return vehicleMatchesCategory(vehicleType, category);
}

module.exports = {
  DISPATCH_CATEGORIES,
  DEFAULT_SLOT_BY_CATEGORY,
  loadChannelRows,
  getDispatchChannelPlans,
  describeChannelBlocker,
  getCategoryQueueCounts,
  announcementMatchesCategory,
};
