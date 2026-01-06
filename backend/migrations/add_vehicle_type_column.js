/**
 * Migration: اضافه کردن ستون vehicle_type به جدول vehicle_specifications
 * این migration ستون vehicle_type را اضافه می‌کند و داده‌های موجود را migrate می‌کند
 */

const pool = require('../db');

async function addVehicleTypeColumn() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 [Migration] Starting add_vehicle_type_column migration...');
    
    await client.query('BEGIN');

    // بررسی وجود ستون vehicle_type
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_specifications' AND column_name = 'vehicle_type'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('📝 [Migration] Adding vehicle_type column...');
      await client.query(`
        ALTER TABLE vehicle_specifications 
        ADD COLUMN vehicle_type VARCHAR(200)
      `);
      console.log('✅ [Migration] vehicle_type column added successfully');
    } else {
      console.log('ℹ️  [Migration] vehicle_type column already exists, skipping...');
    }

    // Migration داده‌های موجود بر اساس tip و description
    console.log('📝 [Migration] Migrating existing data...');
    
    // الگوهای تشخیص نوع خودرو بر اساس tip و description
    const updateQueries = [
      // کشنده‌ها (Tractor/Trailer)
      {
        condition: `(tip ILIKE '%G%' OR tip ILIKE '%R%' OR tip ILIKE '%S%' OR tip ILIKE '%FH%' OR tip ILIKE '%آکتروس%' OR tip ILIKE '%آکسور%' OR tip ILIKE '%TGX%' OR tip ILIKE '%TGS%' OR tip ILIKE '%T%' OR tip ILIKE '%XF%' OR tip ILIKE '%U%' OR description ILIKE '%کشنده%') 
                    AND (tip NOT ILIKE '%P%' AND tip NOT ILIKE '%FM%' AND tip NOT ILIKE '%FMX%' AND tip NOT ILIKE '%اتکو%' AND tip NOT ILIKE '%K%' AND description NOT ILIKE '%ده چرخ%' AND description NOT ILIKE '%کامیون%')`,
        value: 'کشنده'
      },
      // ده چرخ‌ها (10-wheel trucks)
      {
        condition: `(tip ILIKE '%P%' OR tip ILIKE '%FM%' OR tip ILIKE '%FMX%' OR tip ILIKE '%اتکو%' OR tip ILIKE '%K%' OR description ILIKE '%ده چرخ%' OR description ILIKE '%کامیون%' OR wheel_count = 10)`,
        value: 'ده چرخ'
      },
      // کامیونت‌ها (Light trucks)
      {
        condition: `(vehicle_category = 'خودرو نیمه سنگین' OR tip ILIKE '%NKR%' OR tip ILIKE '%NPR%' OR tip ILIKE '%NQR%' OR tip ILIKE '%FK%' OR tip ILIKE '%HD%' OR description ILIKE '%کامیونت%')`,
        value: 'کامیونت'
      },
      // کامیون‌های کوچک (خاور)
      {
        condition: `(brand = 'خاور' OR tip ILIKE '%813%' OR tip ILIKE '%608%')`,
        value: 'کامیون'
      }
    ];

    // به‌روزرسانی رکوردهایی که vehicle_type ندارند
    for (const updateQuery of updateQueries) {
      const result = await client.query(`
        UPDATE vehicle_specifications 
        SET vehicle_type = $1
        WHERE vehicle_type IS NULL 
          AND (${updateQuery.condition})
      `, [updateQuery.value]);
      
      if (result.rowCount > 0) {
        console.log(`✅ [Migration] Updated ${result.rowCount} records to vehicle_type: ${updateQuery.value}`);
      }
    }

    // برای رکوردهای باقی‌مانده که vehicle_type ندارند، بر اساس vehicle_category مقدار پیش‌فرض بگذار
    const defaultUpdate = await client.query(`
      UPDATE vehicle_specifications 
      SET vehicle_type = CASE 
        WHEN vehicle_category = 'خودرو سنگین' THEN 'کشنده'
        WHEN vehicle_category = 'خودرو نیمه سنگین' THEN 'کامیونت'
        ELSE 'کشنده'
      END
      WHERE vehicle_type IS NULL
    `);
    
    if (defaultUpdate.rowCount > 0) {
      console.log(`✅ [Migration] Set default vehicle_type for ${defaultUpdate.rowCount} records`);
    }

    // اضافه کردن NOT NULL constraint بعد از migration
    const checkNulls = await client.query(`
      SELECT COUNT(*) as null_count 
      FROM vehicle_specifications 
      WHERE vehicle_type IS NULL
    `);
    
    if (parseInt(checkNulls.rows[0].null_count) === 0) {
      console.log('📝 [Migration] Adding NOT NULL constraint to vehicle_type...');
      await client.query(`
        ALTER TABLE vehicle_specifications 
        ALTER COLUMN vehicle_type SET NOT NULL
      `);
      console.log('✅ [Migration] NOT NULL constraint added');
    } else {
      console.log(`⚠️  [Migration] Warning: ${checkNulls.rows[0].null_count} records still have NULL vehicle_type`);
    }

    // به‌روزرسانی UNIQUE constraint برای شامل کردن vehicle_type
    // ابتدا constraint قدیمی را حذف می‌کنیم (اگر وجود دارد)
    try {
      await client.query(`
        ALTER TABLE vehicle_specifications 
        DROP CONSTRAINT IF EXISTS vehicle_specifications_vehicle_category_brand_model_tip_key
      `);
      console.log('✅ [Migration] Old unique constraint removed');
    } catch (e) {
      console.log('ℹ️  [Migration] Old unique constraint not found or already removed');
    }

    // اضافه کردن constraint جدید
    try {
      await client.query(`
        ALTER TABLE vehicle_specifications 
        ADD CONSTRAINT vehicle_specifications_unique 
        UNIQUE (vehicle_type, vehicle_category, brand, model, tip)
      `);
      console.log('✅ [Migration] New unique constraint added (including vehicle_type)');
    } catch (e) {
      console.log('⚠️  [Migration] Could not add unique constraint:', e.message);
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] add_vehicle_type_column migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in add_vehicle_type_column migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// اجرای migration
if (require.main === module) {
  addVehicleTypeColumn()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addVehicleTypeColumn };

