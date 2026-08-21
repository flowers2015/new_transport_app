const pool = require('../db');

async function createGpsToursSummaryTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_tours (
        id VARCHAR(255) PRIMARY KEY,
        tour_key TEXT NOT NULL UNIQUE,
        vehicle_code VARCHAR(100),
        imei VARCHAR(32) NOT NULL,
        start_hub VARCHAR(255),
        end_hub VARCHAR(255),
        tour_start TIMESTAMPTZ NOT NULL,
        tour_end TIMESTAMPTZ NOT NULL,
        unload_stations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        zone_markers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        odo_start_can NUMERIC(12,1),
        odo_end_can NUMERIC(12,1),
        odo_start_gps NUMERIC(12,1),
        odo_end_gps NUMERIC(12,1),
        mileage_can NUMERIC(12,1),
        mileage_gps NUMERIC(12,1),
        mileage_go NUMERIC(12,1),
        mileage_back NUMERIC(12,1),
        hours_to_dest NUMERIC(12,1),
        hours_back NUMERIC(12,1),
        hours_total NUMERIC(12,1),
        fuel_start_total NUMERIC(14,2),
        fuel_end_total NUMERIC(14,2),
        fuel_used_total NUMERIC(14,2),
        tank_level_start NUMERIC(8,2),
        tank_level_end NUMERIC(8,2),
        engine_temp_start NUMERIC(8,2),
        engine_temp_end NUMERIC(8,2),
        engine_temp_start_source VARCHAR(40),
        engine_temp_end_source VARCHAR(40),
        air_temp_start NUMERIC(8,2),
        air_temp_end NUMERIC(8,2),
        air_temp_start_source VARCHAR(40),
        air_temp_end_source VARCHAR(40),
        overspeed_count_events INTEGER NOT NULL DEFAULT 0,
        stopped_count_events INTEGER NOT NULL DEFAULT 0,
        raw_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_tours_imei_time_idx
      ON gps_tours (imei, tour_start, tour_end)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_tours_vehicle_time_idx
      ON gps_tours (vehicle_code, tour_start DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_tour_details (
        id VARCHAR(255) PRIMARY KEY,
        tour_id VARCHAR(255) NOT NULL UNIQUE,
        driving_hours NUMERIC(12,2),
        driving_percent NUMERIC(8,2),
        total_duration_hours NUMERIC(12,2),
        stop_inside_h NUMERIC(12,2),
        stop_outside_h NUMERIC(12,2),
        stop_legal_h NUMERIC(12,2),
        overspeed_rule_count INTEGER NOT NULL DEFAULT 0,
        max_speed NUMERIC(8,2),
        fuel_l_per_100km NUMERIC(12,2),
        sample_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_tour_details_computed_idx
      ON gps_tour_details (computed_at DESC)
    `);

    await client.query(`
      ALTER TABLE gps_tour_details
      ADD COLUMN IF NOT EXISTS stop_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

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

    await client.query(`
      ALTER TABLE gps_tour_snapshots
      ADD COLUMN IF NOT EXISTS gps_tour_id VARCHAR(255)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_tour_snapshots_tour_idx
      ON gps_tour_snapshots (gps_tour_id)
    `);

    await client.query('COMMIT');
    console.log('✅ gps_tours + gps_tour_details ready');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ create_gps_tours_summary_tables failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createGpsToursSummaryTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createGpsToursSummaryTables;
