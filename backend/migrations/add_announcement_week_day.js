/**
 * روز اعلام‌بار پاستوریزه (شیت عملیاتی: شنبه…جمعه)
 * جدا از تاریخ بارگیری — مثلاً «اعلام بار یکشنبه» از ظهر یکشنبه تا ظهر دوشنبه.
 *
 * دستی:
 *   cd backend && node migrations/add_announcement_week_day.js
 */
const pool = require('../db');

async function addAnnouncementWeekDay() {
  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS announcement_week_day VARCHAR(20)
  `);
  console.log('✅ freight_announcements.announcement_week_day ready');
}

if (require.main === module) {
  addAnnouncementWeekDay()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ add_announcement_week_day failed:', err);
      process.exit(1);
    });
}

module.exports = addAnnouncementWeekDay;
