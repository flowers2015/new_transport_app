require('dotenv').config();
const pool = require('../db');

/**
 * اضافه کردن ستون regulation_id به جدول allowance_regulations_mileage
 * این script مستقیماً ستون را اضافه می‌کند بدون چک کردن
 */
async function fixRegulationIdColumn() {
  try {
    console.log('🔧 شروع اضافه کردن ستون regulation_id...');
    
    // بررسی وجود جدول
    const checkTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'allowance_regulations_mileage'
    `);

    if (checkTable.rows.length === 0) {
      console.log('⚠️  جدول allowance_regulations_mileage هنوز ایجاد نشده است');
      process.exit(0);
    }

    console.log('✅ جدول allowance_regulations_mileage پیدا شد');

    // بررسی وجود ستون در همه schemaها
    const checkColumn = await pool.query(`
      SELECT column_name, table_schema
      FROM information_schema.columns 
      WHERE table_name = 'allowance_regulations_mileage' 
      AND column_name = 'regulation_id'
    `);

    console.log('🔍 بررسی ستون‌ها:', JSON.stringify(checkColumn.rows, null, 2));

    // مستقیماً سعی کن ستون را اضافه کن - اگر وجود داشته باشد خطا می‌دهد که catch می‌کنیم
    console.log('➕ اضافه کردن ستون regulation_id...');
    let columnAdded = false;
    try {
      await pool.query(`
        ALTER TABLE allowance_regulations_mileage 
        ADD COLUMN regulation_id VARCHAR(255)
      `);
      console.log('✅ ستون regulation_id به جدول allowance_regulations_mileage اضافه شد');
      columnAdded = true;
    } catch (alterError) {
      if (alterError.message.includes('already exists') || alterError.message.includes('duplicate column')) {
        console.log('⚠️  ستون regulation_id از قبل وجود دارد');
        columnAdded = true; // ستون وجود دارد
      } else {
        console.error('❌ خطا در اضافه کردن ستون:', alterError.message);
        throw alterError; // خطای دیگری است
      }
    }

    // تست: سعی کن یک SELECT ساده انجام بده تا ببینیم ستون واقعاً وجود دارد
    if (columnAdded) {
      try {
        const testQuery = await pool.query(`
          SELECT regulation_id FROM allowance_regulations_mileage LIMIT 1
        `);
        console.log('✅ تست SELECT موفق بود - ستون regulation_id واقعاً وجود دارد');
      } catch (testError) {
        console.error('❌ تست SELECT ناموفق بود - ستون regulation_id وجود ندارد:', testError.message);
        console.log('🔄 تلاش مجدد برای اضافه کردن ستون...');
        // دوباره سعی کن اضافه کن
        try {
          await pool.query(`
            ALTER TABLE allowance_regulations_mileage 
            ADD COLUMN regulation_id VARCHAR(255)
          `);
          console.log('✅ ستون regulation_id در تلاش دوم اضافه شد');
        } catch (retryError) {
          console.error('❌ خطا در تلاش دوم:', retryError.message);
        }
      }
    }
    
    // برای رکوردهای موجود، regulation_id را برابر id قرار بده
    const updateResult = await pool.query(`
      UPDATE allowance_regulations_mileage 
      SET regulation_id = id 
      WHERE regulation_id IS NULL
    `);
    console.log(`✅ ${updateResult.rowCount} رکورد به‌روزرسانی شد`);
    
    console.log('✅ تمام! ستون regulation_id با موفقیت اضافه شد.');
    process.exit(0);
  } catch (error) {
    console.error('❌ خطا:', error.message);
    console.error('❌ Stack:', error.stack);
    
    // اگر خطا در ALTER TABLE باشد، ممکن است ستون از قبل وجود داشته باشد
    if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
      console.log('⚠️  ستون regulation_id از قبل وجود دارد (از طریق خطا تشخیص داده شد)');
      
      // برای رکوردهای موجود که regulation_id ندارند، آن را برابر id قرار بده
      try {
        const updateResult = await pool.query(`
          UPDATE allowance_regulations_mileage 
          SET regulation_id = id 
          WHERE regulation_id IS NULL
        `);
        console.log(`✅ ${updateResult.rowCount} رکورد به‌روزرسانی شد`);
        process.exit(0);
      } catch (updateError) {
        console.error('❌ خطا در به‌روزرسانی:', updateError.message);
        process.exit(1);
      }
    } else {
      console.error('❌ خطای غیرمنتظره');
      process.exit(1);
    }
  }
}

// اجرای script
fixRegulationIdColumn();

