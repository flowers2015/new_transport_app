/**
 * Migration: اضافه کردن جدول تاریخچه اعلام بار
 * 
 * این migration جدول freight_announcement_history را ایجاد می‌کند
 * که برای ثبت تمام تغییرات اعلام بار استفاده می‌شود.
 * 
 * استفاده:
 *   node backend/migrations/add_freight_history.js
 */

const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 شروع migration جدول تاریخچه اعلام بار...');
    
    await client.query('BEGIN');
    
    // خواندن schema از فایل
    const schemaPath = path.join(__dirname, '../models/freight_history_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // اجرای schema
    await client.query(schema);
    
    console.log('✅ جدول freight_announcement_history با موفقیت ایجاد شد');
    
    // بررسی تعداد ستون‌ها
    const checkResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'freight_announcement_history'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 ستون‌های جدول:');
    checkResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    await client.query('COMMIT');
    
    console.log('✨ Migration با موفقیت انجام شد!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ خطا در اجرای migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// اجرای migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ تمام شد');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ خطا:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };

