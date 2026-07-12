const pool = require('../db');

/**
 * اعلام‌کننده اصلی هر مقصد — برای برگشت درست بعد از ادغام مقاصد کارشناسان مختلف
 */
async function addDestinationOriginalCreator() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE freight_destinations
      ADD COLUMN IF NOT EXISTS original_created_by_user_id VARCHAR(255) REFERENCES users(id)
    `);

    // پر کردن برای مقاصد موجود از اعلام‌بار فعلی
    const backfill = await client.query(`
      UPDATE freight_destinations d
      SET original_created_by_user_id = fa.created_by_user_id
      FROM freight_announcements fa
      WHERE d.freight_announcement_id = fa.id
        AND d.original_created_by_user_id IS NULL
        AND fa.created_by_user_id IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log(
      `✅ Added freight_destinations.original_created_by_user_id (backfilled ${backfill.rowCount} rows)`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_destination_original_creator migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addDestinationOriginalCreator()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addDestinationOriginalCreator;
