const pool = require('../db');

async function runMigration() {
  const cols = [
    "ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(255)",
    "ADD COLUMN IF NOT EXISTS loading_status VARCHAR(20) DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS loading_ended_at TIMESTAMPTZ DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS loading_started_by VARCHAR(255) DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS loading_ended_by VARCHAR(255) DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS carton_count INTEGER DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12,2) DEFAULT NULL",
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const col of cols) {
      await client.query('ALTER TABLE freight_announcements ' + col);
    }
    await client.query('CREATE INDEX IF NOT EXISTS idx_freight_warehouse_id ON freight_announcements(warehouse_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_freight_loading_status ON freight_announcements(loading_status)');
    await client.query('COMMIT');
    console.log('OK warehouse loading columns added');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (require.main === module) {
  runMigration().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = runMigration;
