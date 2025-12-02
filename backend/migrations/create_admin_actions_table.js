/**
 * Migration: ایجاد جدول admin_actions برای ردیابی تغییرات ادمین
 * این جدول تمام تغییرات دستی ادمین را ثبت می‌کند
 */

const pool = require('../db');
const crypto = require('crypto');

// Helper function برای تولید UUID
function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

async function createAdminActionsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        user_name VARCHAR(255),
        user_role VARCHAR(255),
        action_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'activate', 'deactivate'
        table_name VARCHAR(255) NOT NULL, -- نام جدول (مثلاً 'users', 'freight_announcements')
        record_id VARCHAR(255) NOT NULL, -- ID رکورد تغییر یافته
        old_value JSONB, -- داده قبلی (برای update و delete)
        new_value JSONB, -- داده جدید (برای create و update)
        reason TEXT, -- دلیل تغییر (اجباری برای تغییرات دستی)
        ip_address VARCHAR(45), -- IP آدرس کاربر
        user_agent TEXT, -- User Agent مرورگر
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ایجاد ایندکس برای جستجوی سریع‌تر
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_actions_user_id ON admin_actions(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_actions_table_record ON admin_actions(table_name, record_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC)
    `);

    console.log('✅ [createAdminActionsTable] جدول admin_actions ایجاد شد');
  } catch (error) {
    console.error('❌ [createAdminActionsTable] خطا:', error);
    throw error;
  }
}

module.exports = {
  createAdminActionsTable
};

