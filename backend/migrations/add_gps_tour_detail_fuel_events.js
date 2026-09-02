const pool = require('../db');

async function addGpsTourDetailFuelEvents() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE gps_tour_details
      ADD COLUMN IF NOT EXISTS overspeed_details_json JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await client.query(`
      ALTER TABLE gps_tour_details
      ADD COLUMN IF NOT EXISTS fuel_events_json JSONB
    `);
    await client.query('COMMIT');
    console.log('✅ gps_tour_details fuel/overspeed json ready');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_gps_tour_detail_fuel_events failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addGpsTourDetailFuelEvents()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addGpsTourDetailFuelEvents;
