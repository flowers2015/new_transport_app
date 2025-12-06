const pool = require('../db');

/**
 * اضافه کردن ستون regulation_id به جدول allowance_regulations_mileage
 */
async function addRegulationIdToMileage() {
  try {
    // بررسی وجود ستون
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'allowance_regulations_mileage' 
      AND column_name = 'regulation_id'
    `);

    if (checkColumn.rows.length === 0) {
      // اضافه کردن ستون
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
    } else {
      console.log('⚠️  ستون regulation_id از قبل وجود دارد');
    }
  } catch (error) {
    // اگر جدول وجود نداشته باشد، خطا نده (جدول بعداً ایجاد می‌شود)
    if (error.message.includes('does not exist')) {
      console.log('⚠️  جدول allowance_regulations_mileage هنوز ایجاد نشده است');
    } else {
      console.error('❌ [addRegulationIdToMileage] خطا:', error.message);
      throw error;
    }
  }
}

module.exports = addRegulationIdToMileage;

