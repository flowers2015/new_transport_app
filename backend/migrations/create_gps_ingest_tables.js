const pool = require('../db');

async function createGpsIngestTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_ingest_runs (
        id VARCHAR(255) PRIMARY KEY,
        tehran_date DATE NOT NULL,
        slot VARCHAR(8) NOT NULL,
        trigger_source VARCHAR(40) NOT NULL DEFAULT 'schedule',
        lookback_days INTEGER NOT NULL DEFAULT 4,
        window_from TIMESTAMPTZ NOT NULL,
        window_to TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        vehicle_total INTEGER NOT NULL DEFAULT 0,
        vehicle_ok INTEGER NOT NULL DEFAULT 0,
        vehicle_failed INTEGER NOT NULL DEFAULT 0,
        tours_upserted INTEGER NOT NULL DEFAULT 0,
        error_summary TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_ingest_runs_started_idx
      ON gps_ingest_runs (started_at DESC)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gps_ingest_runs_slot_active_uq
      ON gps_ingest_runs (tehran_date, slot)
      WHERE status IN ('running', 'success') AND trigger_source = 'schedule'
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_ingest_vehicle_runs (
        id VARCHAR(255) PRIMARY KEY,
        run_id VARCHAR(255) NOT NULL REFERENCES gps_ingest_runs(id) ON DELETE CASCADE,
        vehicle_code VARCHAR(100),
        imei VARCHAR(32) NOT NULL,
        status VARCHAR(20) NOT NULL,
        tours_count INTEGER NOT NULL DEFAULT 0,
        raw_event_count INTEGER NOT NULL DEFAULT 0,
        events_ms INTEGER,
        error_text TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_ingest_vehicle_runs_run_idx
      ON gps_ingest_vehicle_runs (run_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_ingest_vehicle_runs_imei_idx
      ON gps_ingest_vehicle_runs (imei, finished_at DESC)
    `);

    await client.query('COMMIT');
    console.log('✅ gps_ingest_runs tables ready');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ create_gps_ingest_tables failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createGpsIngestTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createGpsIngestTables;
