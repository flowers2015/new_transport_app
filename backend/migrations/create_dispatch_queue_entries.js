const pool = require('../db');

async function createDispatchQueueEntriesTable() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dispatch_queue_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
        driver_id VARCHAR(255) NOT NULL REFERENCES drivers(id),
        vehicle_category VARCHAR(100),
        queue_type VARCHAR(50) NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_by_user_id VARCHAR(255) REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dispatch_queue_entries_driver
      ON dispatch_queue_entries(driver_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dispatch_queue_entries_queue_type
      ON dispatch_queue_entries(queue_type, vehicle_category)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_dispatch_queue_driver_active
      ON dispatch_queue_entries(driver_id)
    `);

    await client.query('COMMIT');
    console.log('✅ dispatch_queue_entries table ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create dispatch_queue_entries table:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createDispatchQueueEntriesTable()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = createDispatchQueueEntriesTable;


