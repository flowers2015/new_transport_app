const pool = require('../../db');

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

function buildPlansFromRows(rows) {
  const plans = [];
  for (const category of DISPATCH_CATEGORIES) {
    const dedicated = rows.find(
      r =>
        r.vehicle_category === category &&
        r.chat_id != null &&
        r.is_active !== false
    );
    if (dedicated) {
      plans.push({
        category,
        slot: dedicated.slot_number,
        chatId: String(dedicated.chat_id),
        pilotCombined: false,
      });
    }
  }

  if (plans.length > 0) return plans;

  const pilot = rows.find(r => r.slot_number === 1 && r.chat_id != null && r.is_active !== false);
  if (pilot) {
    return DISPATCH_CATEGORIES.map(category => ({
      category,
      slot: 1,
      chatId: String(pilot.chat_id),
      pilotCombined: true,
    }));
  }

  return [];
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
  if (category === 'تریلی') return vehicleType === 'تریلی' || vehicleType === 'مینی تریلی';
  if (category === 'مینی تریلی') return vehicleType === 'مینی تریلی' || vehicleType === 'تریلی';
  return vehicleType === category;
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
