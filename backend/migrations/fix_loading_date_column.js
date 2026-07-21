const pool = require('../db');

/**
 * loading_date باید VARCHAR باشد تا تاریخ شمسی (مثلاً 1405/04/31) ذخیره شود.
 * اگر DATE بماند Postgres آن را میلادی تفسیر می‌کند و خطای out of range می‌دهد.
 */
async function fixLoadingDateColumn() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'freight_announcements'
        AND column_name = 'loading_date'
      LIMIT 1
    `);

    if (!rows[0]) {
      console.log('ℹ️ [fix_loading_date] loading_date column not found — skipped');
      return;
    }

    const type = String(rows[0].data_type || '').toLowerCase();
    if (type.includes('character') || type === 'text') {
      console.log('ℹ️ [fix_loading_date] loading_date already text — skipped');
      return;
    }

    await client.query(`
      ALTER TABLE freight_announcements
      ALTER COLUMN loading_date TYPE VARCHAR(255)
      USING loading_date::text
    `);
    console.log('✅ [fix_loading_date] loading_date changed to VARCHAR(255)');
  } catch (error) {
    console.error('❌ [fix_loading_date] migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  fixLoadingDateColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = fixLoadingDateColumn;
