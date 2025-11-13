const pool = require('../db');

async function addDispatchQueueUpdates() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE dispatch_queue_entries
      ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(255) REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
    `);

    await client.query('COMMIT');
    console.log('✅ dispatch_queue_entries update tracking columns ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to alter dispatch_queue_entries:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addDispatchQueueUpdates()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = addDispatchQueueUpdates;


