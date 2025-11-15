const pool = require('../db');

async function addFreightHistoryDetailsColumn() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE freight_announcement_history
      ADD COLUMN IF NOT EXISTS details JSONB
    `);
    await client.query('COMMIT');
    console.log('✅ Added details column to freight_announcement_history');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add details column:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addFreightHistoryDetailsColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addFreightHistoryDetailsColumn;

