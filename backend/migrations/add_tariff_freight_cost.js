const pool = require('../db');

async function addTariffFreightCostColumn() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS tariff_freight_cost DECIMAL(15, 2)
    `);
    await client.query('COMMIT');
    console.log('✅ tariff_freight_cost column ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_tariff_freight_cost:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addTariffFreightCostColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addTariffFreightCostColumn;
