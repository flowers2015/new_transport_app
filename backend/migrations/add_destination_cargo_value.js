const pool = require('../db');

async function addDestinationCargoValue() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'ALTER TABLE freight_destinations ADD COLUMN IF NOT EXISTS cargo_value NUMERIC(18, 2) DEFAULT 0'
    );
    console.log('✅ Added freight_destinations.cargo_value');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_destination_cargo_value migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addDestinationCargoValue()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addDestinationCargoValue;
