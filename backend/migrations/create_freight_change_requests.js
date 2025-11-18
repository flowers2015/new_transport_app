/**
 * Migration: ایجاد جدول درخواست‌های تغییر/تقسیم اعلام بار
 * اجرا: node backend/migrations/create_freight_change_requests.js
 */

const pool = require('../db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS freight_change_requests (
        id VARCHAR(255) PRIMARY KEY,
        freight_announcement_id VARCHAR(255) NOT NULL REFERENCES freight_announcements(id) ON DELETE CASCADE,
        requester_user_id VARCHAR(255) REFERENCES users(id),
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        type VARCHAR(50) NOT NULL, -- 'change' | 'split' | 'merge'
        target_queue VARCHAR(50),   -- 'company' | 'personal'
        payload JSONB,              -- توضیحات/پیشنهادات ترابری (نوع/تعداد/تناژ/کارتن/توضیحات)
        status VARCHAR(50) DEFAULT 'requested', -- requested | approved | rejected | cancelled
        reviewed_by VARCHAR(255),
        reviewed_at TIMESTAMPTZ,
        review_note TEXT
      );
    `);
    await client.query('COMMIT');
    console.log('✅ Table freight_change_requests created/ensured.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed (create_freight_change_requests):', e);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  run().then(() => process.exit(0));
}

module.exports = run;


