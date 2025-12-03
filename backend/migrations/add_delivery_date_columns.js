/**
 * Migration: اضافه کردن ستون تاریخ تحویل بار و نوع نماینده
 */

const pool = require('../db');

async function addDeliveryDateColumns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // اضافه کردن ستون تاریخ تحویل به freight_announcements (برای بستنی)
    try {
      await client.query(`ALTER TABLE freight_announcements ADD COLUMN IF NOT EXISTS delivery_date VARCHAR(20)`);
      console.log('✅ ستون delivery_date به freight_announcements اضافه شد');
    } catch (e) {
      console.log('ℹ️ ستون delivery_date قبلاً وجود دارد');
    }
    
    // اضافه کردن ستون‌ها به freight_destinations
    try {
      await client.query(`ALTER TABLE freight_destinations ADD COLUMN IF NOT EXISTS delivery_date VARCHAR(20)`);
      console.log('✅ ستون delivery_date به freight_destinations اضافه شد');
    } catch (e) {
      console.log('ℹ️ ستون delivery_date در destinations قبلاً وجود دارد');
    }
    
    try {
      await client.query(`ALTER TABLE freight_destinations ADD COLUMN IF NOT EXISTS representative_type VARCHAR(20) DEFAULT 'agent'`);
      console.log('✅ ستون representative_type به freight_destinations اضافه شد');
    } catch (e) {
      console.log('ℹ️ ستون representative_type قبلاً وجود دارد');
    }
    
    await client.query('COMMIT');
    console.log('✅ Migration delivery_date با موفقیت اجرا شد');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ خطا در migration delivery_date:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addDeliveryDateColumns;

