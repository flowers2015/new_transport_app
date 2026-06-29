const pool = require('../db');

async function addBaleReportRecipients() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_report_recipients (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        label VARCHAR(255) NOT NULL,
        chat_id BIGINT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, chat_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bale_report_recipients_user
      ON bale_report_recipients(user_id)
    `);

    await client.query('COMMIT');
    console.log('✅ bale_report_recipients table ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_bale_report_recipients:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addBaleReportRecipients()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addBaleReportRecipients;
