const pool = require('../db');

/**
 * Migration: اضافه کردن فیلد شماره حساب به جدول drivers
 * این migration فیلد account_number را به جدول drivers اضافه می‌کند
 */
async function addAccountNumberToDrivers() {
  try {
    console.log('🔄 شروع migration: اضافه کردن account_number به جدول drivers...');
    
    // بررسی وجود ستون
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'drivers' AND column_name = 'account_number'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ ستون account_number از قبل وجود دارد.');
      return;
    }
    
    // اضافه کردن ستون account_number به جدول drivers
    await pool.query(`
      ALTER TABLE drivers 
      ADD COLUMN account_number VARCHAR(255)
    `);
    
    console.log('✅ Migration موفق: ستون account_number به جدول drivers اضافه شد.');
    
  } catch (error) {
    console.error('❌ خطا در اجرای migration:', error);
    throw error;
  }
}

// اجرای migration اگر فایل مستقیماً اجرا شود
if (require.main === module) {
  addAccountNumberToDrivers()
    .then(() => {
      console.log('✅ Migration با موفقیت تکمیل شد.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration با خطا مواجه شد:', error);
      process.exit(1);
    });
}

module.exports = addAccountNumberToDrivers;

