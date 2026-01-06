/**
 * Migration: اضافه کردن ستون‌های درصد مصرف سوخت و مبلغ سوخت به جدول vehicle_specifications
 */

const pool = require('../db');

async function addFuelConsumptionToVehicleSpecs() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 [Migration] Starting add_fuel_consumption_to_vehicle_specs migration...');
    
    await client.query('BEGIN');

    // بررسی وجود ستون fuel_consumption_percentage
    const checkPercentage = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_specifications' AND column_name = 'fuel_consumption_percentage'
    `);
    
    if (checkPercentage.rows.length === 0) {
      console.log('📝 [Migration] Adding fuel_consumption_percentage column...');
      await client.query(`
        ALTER TABLE vehicle_specifications 
        ADD COLUMN fuel_consumption_percentage DECIMAL(5,2)
      `);
      console.log('✅ [Migration] fuel_consumption_percentage column added successfully');
    } else {
      console.log('ℹ️  [Migration] fuel_consumption_percentage column already exists, skipping...');
    }

    // بررسی وجود ستون fuel_price_per_liter
    const checkPrice = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_specifications' AND column_name = 'fuel_price_per_liter'
    `);
    
    if (checkPrice.rows.length === 0) {
      console.log('📝 [Migration] Adding fuel_price_per_liter column...');
      await client.query(`
        ALTER TABLE vehicle_specifications 
        ADD COLUMN fuel_price_per_liter DECIMAL(10,2)
      `);
      console.log('✅ [Migration] fuel_price_per_liter column added successfully');
    } else {
      console.log('ℹ️  [Migration] fuel_price_per_liter column already exists, skipping...');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] add_fuel_consumption_to_vehicle_specs migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in add_fuel_consumption_to_vehicle_specs migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// اجرای migration
if (require.main === module) {
  addFuelConsumptionToVehicleSpecs()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addFuelConsumptionToVehicleSpecs };

