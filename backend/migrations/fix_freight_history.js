/**
 * Migration: اصلاح جدول تاریخچه اعلام بار
 * 
 * این migration جدول موجود رو حذف و دوباره می‌سازه
 */

const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 شروع اصلاح جدول تاریخچه...');
    
    await client.query('BEGIN');
    
    // 1. حذف جدول قدیمی (اگه وجود داره)
    console.log('🗑️  حذف جدول قدیمی...');
    await client.query('DROP TABLE IF EXISTS freight_announcement_history CASCADE');
    
    // 2. ایجاد جدول جدید
    console.log('📦 ایجاد جدول جدید...');
    await client.query(`
      CREATE TABLE freight_announcement_history (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
          freight_announcement_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255),
          user_name VARCHAR(255) NOT NULL,
          action VARCHAR(100) NOT NULL,
          old_status VARCHAR(100),
          new_status VARCHAR(100),
          field_changes JSONB,
          description TEXT NOT NULL,
          ip_address VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          
          CONSTRAINT fk_freight_announcement 
              FOREIGN KEY (freight_announcement_id) 
              REFERENCES freight_announcements(id) 
              ON DELETE CASCADE,
          
          CONSTRAINT fk_user 
              FOREIGN KEY (user_id) 
              REFERENCES users(id) 
              ON DELETE SET NULL
      )
    `);
    
    // 3. ایجاد ایندکس‌ها
    console.log('🔍 ایجاد ایندکس‌ها...');
    
    await client.query(`
      CREATE INDEX idx_freight_history_announcement 
          ON freight_announcement_history(freight_announcement_id, created_at DESC)
    `);
    
    await client.query(`
      CREATE INDEX idx_freight_history_user 
          ON freight_announcement_history(user_id)
    `);
    
    await client.query(`
      CREATE INDEX idx_freight_history_action 
          ON freight_announcement_history(action)
    `);
    
    await client.query(`
      CREATE INDEX idx_freight_history_created 
          ON freight_announcement_history(created_at DESC)
    `);
    
    await client.query(`
      CREATE INDEX idx_freight_history_field_changes 
          ON freight_announcement_history USING gin(field_changes)
    `);
    
    // 4. اضافه کردن کامنت‌ها
    console.log('📝 اضافه کردن توضیحات...');
    
    await client.query(`
      COMMENT ON TABLE freight_announcement_history IS 'ثبت کامل تاریخچه تغییرات اعلام بار از زمان ایجاد تا نهایی شدن'
    `);
    
    await client.query(`
      COMMENT ON COLUMN freight_announcement_history.action IS 'نوع عملیات: CREATED, EDITED, STATUS_CHANGED, ASSIGNED, REASSIGNED, QUEUE_CHANGED, APPROVED, REJECTED, DESTINATIONS_CHANGED, PAYMENT_RECORDED, PAYMENT_CONFIRMED, DELETED, REANNOUNCED'
    `);
    
    await client.query(`
      COMMENT ON COLUMN freight_announcement_history.field_changes IS 'تغییرات دقیق فیلدها به فرمت JSON: {"fieldName": {"old": value, "new": value}}'
    `);
    
    await client.query(`
      COMMENT ON COLUMN freight_announcement_history.description IS 'شرح کامل تغییر به زبان فارسی برای نمایش به کاربر'
    `);
    
    await client.query('COMMIT');
    
    console.log('✅ جدول با موفقیت ایجاد شد!');
    
    // بررسی ساختار جدول
    const checkResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'freight_announcement_history'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 ستون‌های جدول:');
    checkResult.rows.forEach(row => {
      console.log(`   ✓ ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n✨ Migration با موفقیت کامل شد!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ خطا در اجرای migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// اجرا
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n🎉 تمام شد!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ خطا:', error.message);
      process.exit(1);
    });
}

module.exports = { runMigration };

