const pool = require('../../db');

const DISPATCH_CATEGORIES = ['تریلی', 'مینی تریلی', 'ده چرخ'];

const DEFAULT_SLOT_BY_CATEGORY = {
  تریلی: 2,
  'مینی تریلی': 3,
  'ده چرخ': 4,
};

async function getDispatchChannelPlans() {
  const { rows } = await pool.query(
    `SELECT slot_number, vehicle_category, chat_id, is_active, label
     FROM bale_channels ORDER BY slot_number`
  );

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

function announcementMatchesCategory(vehicleType, category) {
  if (!category || !vehicleType) return true;
  if (category === 'تریلی') return vehicleType === 'تریلی' || vehicleType === 'مینی تریلی';
  if (category === 'مینی تریلی') return vehicleType === 'مینی تریلی' || vehicleType === 'تریلی';
  return vehicleType === category;
}

module.exports = {
  DISPATCH_CATEGORIES,
  DEFAULT_SLOT_BY_CATEGORY,
  getDispatchChannelPlans,
  announcementMatchesCategory,
};
