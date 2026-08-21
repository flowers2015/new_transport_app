const pool = require('../db');

/**
 * ستون mileage_gps_track + مجاز کردن منبع track در snapshot
 */
async function addMileageGpsTrack() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE gps_tours
      ADD COLUMN IF NOT EXISTS mileage_gps_track NUMERIC(12,1)
    `);

    await client.query(`
      ALTER TABLE gps_tour_snapshots
      ADD COLUMN IF NOT EXISTS mileage_gps_track NUMERIC(12,1)
    `);

    await client.query(`
      ALTER TABLE gps_tour_snapshots
      DROP CONSTRAINT IF EXISTS gps_tour_snapshots_source_chk
    `);

    await client.query(`
      ALTER TABLE gps_tour_snapshots
      ADD CONSTRAINT gps_tour_snapshots_source_chk
      CHECK (selected_source IS NULL OR selected_source IN ('approved', 'can', 'gps', 'track'))
    `);

    await client.query('COMMIT');
    console.log('✅ mileage_gps_track ready');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_mileage_gps_track failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addMileageGpsTrack()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addMileageGpsTrack;
