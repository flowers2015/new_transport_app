const pool = require('../db');

async function fixFuelConsumptionPrecision() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Starting fix_fuel_consumption_precision migration...');
    await client.query('BEGIN');

    // بررسی نوع فعلی ستون
    const checkColumn = await client.query(`
      SELECT data_type, numeric_precision, numeric_scale
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_specifications' AND column_name = 'fuel_consumption_percentage'
    `);

    if (checkColumn.rows.length > 0) {
      const currentType = checkColumn.rows[0];
      console.log(`📝 [Migration] Current type: ${currentType.data_type}(${currentType.numeric_precision},${currentType.numeric_scale})`);
      
      // اگر precision کمتر از 10 باشد، آن را تغییر می‌دهیم
      if (parseInt(currentType.numeric_precision) < 10) {
        console.log('📝 [Migration] Altering fuel_consumption_percentage column to DECIMAL(10,2)...');
        await client.query(`
          ALTER TABLE vehicle_specifications 
          ALTER COLUMN fuel_consumption_percentage TYPE DECIMAL(10,2)
        `);
        console.log('✅ [Migration] fuel_consumption_percentage column altered successfully');
      } else {
        console.log('ℹ️  [Migration] fuel_consumption_percentage already has sufficient precision, skipping...');
      }
    } else {
      console.log('⚠️  [Migration] fuel_consumption_percentage column does not exist, skipping...');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] fix_fuel_consumption_precision migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in fix_fuel_consumption_precision migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  fixFuelConsumptionPrecision()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { fixFuelConsumptionPrecision };

