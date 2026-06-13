const pool = require('../db');

const DISPATCH_LABELS = ['تریلی', 'مینی تریلی', 'ده چرخ'];

async function normalizeQueueVehicleCategory() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Starting normalize_queue_vehicle_category migration...');
    await client.query('BEGIN');

    const categoryMappings = {
      trailer: 'تریلی',
      'mini-trailer': 'مینی تریلی',
      'ten-wheel': 'ده چرخ',
    };

    for (const [key, label] of Object.entries(categoryMappings)) {
      const result = await client.query(
        `UPDATE dispatch_queue_entries
         SET vehicle_category = $1
         WHERE vehicle_category = $2`,
        [label, key]
      );
      console.log(`✅ [Migration] ${result.rowCount} رکورد از "${key}" به "${label}" تبدیل شد`);
    }

    const repairResult = await client.query(
      `UPDATE dispatch_queue_entries q
       SET vehicle_category = sub.vehicle_type
       FROM (
         SELECT DISTINCT ON (da.driver_id)
           da.driver_id,
           fa.vehicle_type
         FROM dispatch_assignments da
         JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
         WHERE fa.vehicle_type = ANY($1::text[])
         ORDER BY da.driver_id, da.created_at DESC
       ) sub
       WHERE q.driver_id = sub.driver_id
         AND (q.vehicle_category IS NULL OR NOT (q.vehicle_category = ANY($1::text[])))`,
      [DISPATCH_LABELS]
    );
    console.log(
      `✅ [Migration] ${repairResult.rowCount} رکورد نوبت با vehicle_type اعلام بار اصلاح شد`
    );

    await client.query('COMMIT');
    console.log('✅ [Migration] normalize_queue_vehicle_category migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in normalize_queue_vehicle_category migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  normalizeQueueVehicleCategory()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { normalizeQueueVehicleCategory };
