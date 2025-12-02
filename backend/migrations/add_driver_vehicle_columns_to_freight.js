const pool = require('../db');

/**
 * Migration to add denormalized driver/vehicle columns to freight_announcements table
 * This allows admin to directly override driver/vehicle info without changing IDs
 */
async function addDriverVehicleColumnsToFreight() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add missing columns to freight_announcements table
    const columns = [
      'assigned_driver_name VARCHAR(255)',
      'assigned_driver_employee_id VARCHAR(255)',
      'assigned_vehicle_model VARCHAR(255)',
      'assigned_vehicle_brand VARCHAR(255)',
      'vehicle_plate VARCHAR(255)',
    ];

    for (const column of columns) {
      try {
        await client.query(`ALTER TABLE freight_announcements ADD COLUMN IF NOT EXISTS ${column}`);
        console.log(`✅ Added column: ${column.split(' ')[0]}`);
      } catch (error) {
        if (error.code === '42701') { // Column already exists
          console.log(`⚠️  Column already exists: ${column.split(' ')[0]}`);
        } else {
          console.log(`❌ Failed to add column ${column.split(' ')[0]}:`, error.message);
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed: driver/vehicle columns added to freight_announcements');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  addDriverVehicleColumnsToFreight()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addDriverVehicleColumnsToFreight;

