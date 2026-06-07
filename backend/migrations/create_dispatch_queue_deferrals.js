require('dotenv').config();
const pool = require('../db');

async function up() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS dispatch_queue_deferrals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        queue_entry_id UUID NOT NULL REFERENCES dispatch_queue_entries(id) ON DELETE CASCADE,
        driver_id VARCHAR(255) NOT NULL,
        vehicle_category VARCHAR(100),
        dispatch_phase VARCHAR(40) NOT NULL,
        cycle_start TIMESTAMPTZ NOT NULL,
        cycle_end TIMESTAMPTZ NOT NULL,
        deferred_by_user_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_dispatch_queue_deferral_cycle
      ON dispatch_queue_deferrals(queue_entry_id, dispatch_phase, cycle_start)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dispatch_queue_deferrals_driver
      ON dispatch_queue_deferrals(driver_id, cycle_start DESC)
    `);
    console.log('✅ dispatch_queue_deferrals ensured');
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(err => {
  console.error(err);
  process.exit(1);
});
