const pool = require('../db');

async function normalizeQueueVehicleCategory() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Starting normalize_queue_vehicle_category migration...');
    await client.query('BEGIN');

    // تبدیل vehicleCategory از key انگلیسی به label فارسی
    const categoryMappings = {
      'trailer': 'تریلی',
      'mini-trailer': 'مینی تریلی',
      'ten-wheel': 'ده چرخ'
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

