/**
 * Migration: اضافه کردن ستون current_vehicle_type به جدول vehicles
 * این migration ستون current_vehicle_type را اضافه می‌کند
 */

const pool = require('../db');

async function addCurrentVehicleTypeToVehicles() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 [Migration] Starting add_current_vehicle_type_to_vehicles migration...');
    
    await client.query('BEGIN');

    // بررسی وجود ستون current_vehicle_type
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicles' AND column_name = 'current_vehicle_type'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('📝 [Migration] Adding current_vehicle_type column...');
      await client.query(`
        ALTER TABLE vehicles 
        ADD COLUMN current_vehicle_type VARCHAR(200)
      `);
      console.log('✅ [Migration] current_vehicle_type column added successfully');
      
      // تلاش برای پر کردن ستون بر اساس vehicle_tip یا vehicle_category
      console.log('📝 [Migration] Attempting to populate current_vehicle_type from existing data...');
      
      // برای خودروهای سنگین، اگر vehicle_tip شامل الگوهای خاصی است، نوع را تعیین کن
      const updateQueries = [
        // کشنده‌ها
        {
          condition: `vehicle_category = 'خودرو سنگین' AND (vehicle_tip ILIKE '%G%' OR vehicle_tip ILIKE '%R%' OR vehicle_tip ILIKE '%S%' OR vehicle_tip ILIKE '%FH%' OR vehicle_tip ILIKE '%آکتروس%' OR vehicle_tip ILIKE '%آکسور%' OR vehicle_tip ILIKE '%TGX%' OR vehicle_tip ILIKE '%TGS%' OR vehicle_tip ILIKE '%T%' OR vehicle_tip ILIKE '%XF%' OR vehicle_tip ILIKE '%U%') 
                      AND (vehicle_tip NOT ILIKE '%P%' AND vehicle_tip NOT ILIKE '%FM%' AND vehicle_tip NOT ILIKE '%FMX%' AND vehicle_tip NOT ILIKE '%اتکو%' AND vehicle_tip NOT ILIKE '%K%')`,
          value: 'کشنده'
        },
        // ده چرخ‌ها
        {
          condition: `vehicle_category = 'خودرو سنگین' AND (vehicle_tip ILIKE '%P%' OR vehicle_tip ILIKE '%FM%' OR vehicle_tip ILIKE '%FMX%' OR vehicle_tip ILIKE '%اتکو%' OR vehicle_tip ILIKE '%K%' OR wheel_count = 10)`,
          value: 'ده چرخ'
        },
        // کامیونت‌ها
        {
          condition: `vehicle_category = 'خودرو نیمه سنگین' OR vehicle_tip ILIKE '%NKR%' OR vehicle_tip ILIKE '%NPR%' OR vehicle_tip ILIKE '%NQR%' OR vehicle_tip ILIKE '%FK%' OR vehicle_tip ILIKE '%HD%'`,
          value: 'کامیونت'
        },
        // کامیون‌های کوچک
        {
          condition: `brand = 'خاور' OR vehicle_tip ILIKE '%813%' OR vehicle_tip ILIKE '%608%'`,
          value: 'کامیون'
        }
      ];

      // به‌روزرسانی رکوردهایی که current_vehicle_type ندارند
      for (const updateQuery of updateQueries) {
        const result = await client.query(`
          UPDATE vehicles 
          SET current_vehicle_type = $1
          WHERE current_vehicle_type IS NULL 
            AND (${updateQuery.condition})
        `, [updateQuery.value]);
        
        if (result.rowCount > 0) {
          console.log(`✅ [Migration] Updated ${result.rowCount} records to current_vehicle_type: ${updateQuery.value}`);
        }
      }

      // برای رکوردهای باقی‌مانده که current_vehicle_type ندارند، بر اساس vehicle_category مقدار پیش‌فرض بگذار
      const defaultUpdate = await client.query(`
        UPDATE vehicles 
        SET current_vehicle_type = CASE 
          WHEN vehicle_category = 'خودرو سنگین' THEN 'کشنده'
          WHEN vehicle_category = 'خودرو نیمه سنگین' THEN 'کامیونت'
          ELSE 'کشنده'
        END
        WHERE current_vehicle_type IS NULL
      `);
      
      if (defaultUpdate.rowCount > 0) {
        console.log(`✅ [Migration] Set default current_vehicle_type for ${defaultUpdate.rowCount} records`);
      }
      
    } else {
      console.log('ℹ️  [Migration] current_vehicle_type column already exists, skipping...');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] add_current_vehicle_type_to_vehicles migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in add_current_vehicle_type_to_vehicles migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// اجرای migration
if (require.main === module) {
  addCurrentVehicleTypeToVehicles()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addCurrentVehicleTypeToVehicles };

