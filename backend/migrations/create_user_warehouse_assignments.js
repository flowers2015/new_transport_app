const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS user_warehouse_assignments (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, warehouse_id VARCHAR(255) NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, warehouse_id))`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_uwa_user_id ON user_warehouse_assignments(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_uwa_warehouse_id ON user_warehouse_assignments(warehouse_id)');
    await client.query('COMMIT');
    console.log('OK user_warehouse_assignments table created');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (require.main === module) {
  runMigration().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = runMigration;
