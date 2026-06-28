const pool = require('../db');

/**
 * اعلام مجدد = کارمند برنامه‌ریزی بار «بار مانده» را مجدداً برای تایید مدیر ارسال می‌کند.
 * این فیلد در همان لحظه (Leftover → PendingManagerApproval) ست می‌شود، نه از روی تاریخچه.
 *
 * اجرا: node backend/migrations/add_is_reannouncement_to_freight.js
 */
async function addIsReannouncementToFreight() {
  const client = await pool.connect();
  try {
    const exists = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'freight_announcements' AND column_name = 'is_reannouncement'`
    );
    if (exists.rowCount === 0) {
      await client.query(
        `ALTER TABLE freight_announcements ADD COLUMN is_reannouncement BOOLEAN NOT NULL DEFAULT FALSE`
      );
      console.log('✅ Added column: is_reannouncement');
    } else {
      console.log('⚠️  Column already exists: is_reannouncement');
    }

    // یک‌بار: بارهایی که قبلاً از Leftover دوباره ارسال شده‌اند (فقط برای داده‌های قدیمی)
    const backfill = await client.query(`
      UPDATE freight_announcements fa
      SET is_reannouncement = TRUE
      WHERE fa.is_reannouncement IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM freight_announcement_history h
          WHERE h.freight_announcement_id = fa.id
            AND h.old_status IN ('Leftover', 'بار مانده')
            AND h.new_status = 'PendingManagerApproval'
        )
    `);
    console.log(`✅ Backfilled is_reannouncement for ${backfill.rowCount} existing rows`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addIsReannouncementToFreight()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addIsReannouncementToFreight;
