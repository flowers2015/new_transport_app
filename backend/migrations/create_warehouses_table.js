const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS warehouses (id VARCHAR(255) PRIMARY KEY, line_type VARCHAR(50) NOT NULL, name VARCHAR(255) NOT NULL, city VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_warehouses_line_type ON warehouses(line_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_warehouses_city ON warehouses(city)');
    await client.query('COMMIT');
    console.log('OK warehouses table created');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (require.main === module) {
  runMigration().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = runMigration;
