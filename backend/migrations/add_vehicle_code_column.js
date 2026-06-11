/**
 * Migration: اضافه کردن ستون vehicle_code به جدول vehicles
 */

const pool = require('../db');

async function addVehicleCodeColumn() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Starting add_vehicle_code_column migration...');

    await client.query('BEGIN');

    const columnExists = await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vehicles'
        AND column_name = 'vehicle_code'
    `);

    if (columnExists.rowCount > 0) {
      console.log('ℹ️  [Migration] vehicle_code column already exists, skipping ALTER');
    } else {
      await client.query(`
        ALTER TABLE vehicles
        ADD COLUMN vehicle_code VARCHAR(50) UNIQUE
      `);
      await client.query(`
        COMMENT ON COLUMN vehicles.vehicle_code IS
          'کد خودرو برای سنگین/نیمه یدک - پل ارتباطی بین جستجو و تخصیص'
      `);
      console.log('✅ [Migration] vehicle_code column added');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] add_vehicle_code_column completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] add_vehicle_code_column failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addVehicleCodeColumn()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = addVehicleCodeColumn;
