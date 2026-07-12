const pool = require('../db');

/**
 * اعلام‌کننده اصلی هر مقصد — برای برگشت درست بعد از ادغام مقاصد کارشناسان مختلف
 */
async function addDestinationOriginalCreator() {
  const client = await pool.connect();
  try {
    // ستون را جدا از backfill اضافه کن تا شکست FK کل migration را rollback نکند
    await client.query(`
      ALTER TABLE freight_destinations
      ADD COLUMN IF NOT EXISTS original_created_by_user_id VARCHAR(255)
    `);

    // فقط وقتی user واقعاً وجود دارد پر کن (جلوگیری از خطای FK یتیم)
    const backfill = await client.query(`
      UPDATE freight_destinations d
      SET original_created_by_user_id = fa.created_by_user_id
      FROM freight_announcements fa
      WHERE d.freight_announcement_id = fa.id
        AND d.original_created_by_user_id IS NULL
        AND fa.created_by_user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = fa.created_by_user_id)
    `);

    // ایندکس سبک برای فیلتر کارتابل
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_freight_destinations_original_creator
      ON freight_destinations (original_created_by_user_id)
    `);

    console.log(
      `✅ Added freight_destinations.original_created_by_user_id (backfilled ${backfill.rowCount} rows)`
    );
  } catch (error) {
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
