const pool = require('../db');

async function convertTrailerToKeshdehInRegulations() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Starting convert_trailer_to_keshdeh_in_regulations migration...');
    await client.query('BEGIN');

    // تبدیل در جدول allowance_regulations_mileage
    const checkMileageTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'allowance_regulations_mileage'
      )
    `);
    
    if (checkMileageTable.rows[0]?.exists) {
      const mileageResult = await client.query(`
        UPDATE allowance_regulations_mileage 
        SET vehicle_type = 'کشنده'
        WHERE vehicle_type = 'تریلی'
      `);
      console.log(`✅ [Migration] ${mileageResult.rowCount} رکورد در allowance_regulations_mileage تبدیل شد`);
    } else {
      console.log('ℹ️  [Migration] جدول allowance_regulations_mileage وجود ندارد، رد می‌شود...');
    }

    // تبدیل در جدول allowance_regulations_fixed_allowance
    const checkFixedAllowanceTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'allowance_regulations_fixed_allowance'
      )
    `);
    
    if (checkFixedAllowanceTable.rows[0]?.exists) {
      const fixedAllowanceResult = await client.query(`
        UPDATE allowance_regulations_fixed_allowance 
        SET vehicle_type = 'کشنده'
        WHERE vehicle_type = 'تریلی'
      `);
      console.log(`✅ [Migration] ${fixedAllowanceResult.rowCount} رکورد در allowance_regulations_fixed_allowance تبدیل شد`);
    } else {
      console.log('ℹ️  [Migration] جدول allowance_regulations_fixed_allowance وجود ندارد، رد می‌شود...');
    }

    // تبدیل در جدول allowance_regulations_return_cargo
    const checkReturnCargoTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'allowance_regulations_return_cargo'
      )
    `);
    
    if (checkReturnCargoTable.rows[0]?.exists) {
      const returnCargoResult = await client.query(`
        UPDATE allowance_regulations_return_cargo 
        SET vehicle_type = 'کشنده'
        WHERE vehicle_type = 'تریلی'
      `);
      console.log(`✅ [Migration] ${returnCargoResult.rowCount} رکورد در allowance_regulations_return_cargo تبدیل شد`);
    } else {
      console.log('ℹ️  [Migration] جدول allowance_regulations_return_cargo وجود ندارد، رد می‌شود...');
    }

    // تبدیل در جدول allowance_regulations_fuel_consumption (اختیاری - اگر vehicle_type = 'تریلی' باشد)
    const checkFuelConsumptionTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'allowance_regulations_fuel_consumption'
      )
    `);
    
    if (checkFuelConsumptionTable.rows[0]?.exists) {
      const fuelConsumptionResult = await client.query(`
        UPDATE allowance_regulations_fuel_consumption 
        SET vehicle_type = 'کشنده'
        WHERE vehicle_type = 'تریلی'
      `);
      console.log(`✅ [Migration] ${fuelConsumptionResult.rowCount} رکورد در allowance_regulations_fuel_consumption تبدیل شد`);
    } else {
      console.log('ℹ️  [Migration] جدول allowance_regulations_fuel_consumption وجود ندارد، رد می‌شود...');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] convert_trailer_to_keshdeh_in_regulations migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in convert_trailer_to_keshdeh_in_regulations migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  convertTrailerToKeshdehInRegulations()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { convertTrailerToKeshdehInRegulations };

