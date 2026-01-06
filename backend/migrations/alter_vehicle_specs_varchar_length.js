/**
 * Migration: افزایش طول ستون‌های tip, engine_type, vehicle_type در جدول vehicle_specifications
 * این migration طول ستون‌ها را از VARCHAR(100) به VARCHAR(200) تغییر می‌دهد
 */

const pool = require('../db');

async function alterVehicleSpecsVarcharLength() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 [Migration] Starting alter_vehicle_specs_varchar_length migration...');
    
    await client.query('BEGIN');

    // تغییر طول ستون tip
    console.log('📝 [Migration] Altering tip column...');
    await client.query(`
      ALTER TABLE vehicle_specifications 
      ALTER COLUMN tip TYPE VARCHAR(200)
    `);
    console.log('✅ [Migration] tip column altered successfully');

    // تغییر طول ستون engine_type
    console.log('📝 [Migration] Altering engine_type column...');
    await client.query(`
      ALTER TABLE vehicle_specifications 
      ALTER COLUMN engine_type TYPE VARCHAR(200)
    `);
    console.log('✅ [Migration] engine_type column altered successfully');

    // بررسی وجود ستون vehicle_type و تغییر آن در صورت وجود
    const checkVehicleType = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_specifications' AND column_name = 'vehicle_type'
    `);
    
    if (checkVehicleType.rows.length > 0) {
      console.log('📝 [Migration] Altering vehicle_type column...');
      await client.query(`
        ALTER TABLE vehicle_specifications 
        ALTER COLUMN vehicle_type TYPE VARCHAR(200)
      `);
      console.log('✅ [Migration] vehicle_type column altered successfully');
    } else {
      console.log('ℹ️  [Migration] vehicle_type column does not exist, skipping...');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] alter_vehicle_specs_varchar_length migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in alter_vehicle_specs_varchar_length migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// اجرای migration
if (require.main === module) {
  alterVehicleSpecsVarcharLength()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { alterVehicleSpecsVarcharLength };

