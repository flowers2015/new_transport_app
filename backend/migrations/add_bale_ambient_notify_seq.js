const pool = require('../db');

async function addBaleAmbientNotifySeqColumn() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS bale_ambient_notify_seq INTEGER
    `);
    await client.query('COMMIT');
    console.log('✅ bale_ambient_notify_seq column ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_bale_ambient_notify_seq:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addBaleAmbientNotifySeqColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addBaleAmbientNotifySeqColumn;
