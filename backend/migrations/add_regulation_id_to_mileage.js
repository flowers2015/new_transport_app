const pool = require('../db');

/**
 * اضافه کردن ستون regulation_id به جدول allowance_regulations_mileage
 */
async function addRegulationIdToMileage() {
  try {
    // بررسی وجود جدول
    const checkTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'allowance_regulations_mileage'
    `);

    if (checkTable.rows.length === 0) {
      console.log('⚠️  جدول allowance_regulations_mileage هنوز ایجاد نشده است');
      return;
    }

    // سعی کن ستون را اضافه کن - اگر وجود داشته باشد، خطا می‌دهد که catch می‌کنیم
    try {
      await pool.query(`
        ALTER TABLE allowance_regulations_mileage 
        ADD COLUMN regulation_id VARCHAR(255)
      `);
      console.log('✅ ستون regulation_id به جدول allowance_regulations_mileage اضافه شد');
      
      // برای رکوردهای موجود، regulation_id را برابر id قرار بده
      await pool.query(`
        UPDATE allowance_regulations_mileage 
        SET regulation_id = id 
        WHERE regulation_id IS NULL
      `);
      console.log('✅ مقادیر regulation_id برای رکوردهای موجود تنظیم شد');
    } catch (alterError) {
      // اگر ستون از قبل وجود داشته باشد، خطا می‌دهد
      if (alterError.message.includes('already exists') || alterError.message.includes('duplicate column')) {
        console.log('⚠️  ستون regulation_id از قبل وجود دارد');
        
        // برای رکوردهای موجود که regulation_id ندارند، آن را برابر id قرار بده
        try {
          await pool.query(`
            UPDATE allowance_regulations_mileage 
            SET regulation_id = id 
            WHERE regulation_id IS NULL
          `);
          console.log('✅ مقادیر regulation_id برای رکوردهای موجود تنظیم شد');
        } catch (updateError) {
          console.log('⚠️  خطا در تنظیم مقادیر regulation_id:', updateError.message);
        }
      } else {
        throw alterError; // خطای دیگری است، throw کن
      }
    }
  } catch (error) {
    // اگر جدول وجود نداشته باشد، خطا نده (جدول بعداً ایجاد می‌شود)
    if (error.message.includes('does not exist')) {
      console.log('⚠️  جدول allowance_regulations_mileage هنوز ایجاد نشده است');
    } else {
      console.error('❌ [addRegulationIdToMileage] خطا:', error.message);
      // خطا را throw نکن - فقط log کن تا سرور crash نشود
    }
  }
}

module.exports = addRegulationIdToMileage;

