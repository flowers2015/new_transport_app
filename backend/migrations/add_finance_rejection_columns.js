/**
 * ستون‌های رد مالی تور و منبع لغو تخصیص
 */
const pool = require('../db');

async function up() {
  console.log('🔄 Adding finance rejection columns...');

  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS finance_disposition VARCHAR(50)
  `);
  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS finance_reject_type VARCHAR(50)
  `);
  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS finance_reject_note TEXT
  `);
  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS finance_rejected_at TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS finance_rejected_by VARCHAR(255)
  `);
  await pool.query(`
    ALTER TABLE freight_announcements
    ADD COLUMN IF NOT EXISTS related_exception_id VARCHAR(255)
  `);
  await pool.query(`
    ALTER TABLE dispatch_assignments
    ADD COLUMN IF NOT EXISTS cancellation_source VARCHAR(50)
  `);

  console.log('✅ Finance rejection columns ready');
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { up };
