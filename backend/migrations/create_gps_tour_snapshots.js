const pool = require('../db');

/**
 * Snapshot تور GPS — جدول جدا؛ ستون‌های driver_calculations دست نخورده می‌مانند
 * فقط mileage_source اختیاری و nullable اضافه می‌شود.
 * خاموشی: GPS_FINANCE_ENABLED=false
 * برگشت: DROP TABLE gps_tour_snapshots; ALTER TABLE ... DROP COLUMN IF EXISTS mileage_source;
 */
async function createGpsTourSnapshots() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_tour_snapshots (
        id VARCHAR(255) PRIMARY KEY,
        announcement_id VARCHAR(255),
        driver_calculation_id VARCHAR(255),
        vehicle_code VARCHAR(100),
        imei VARCHAR(32) NOT NULL,
        search_from TIMESTAMPTZ NOT NULL,
        search_to TIMESTAMPTZ NOT NULL,
        tour_start TIMESTAMPTZ NOT NULL,
        tour_end TIMESTAMPTZ NOT NULL,
        start_hub VARCHAR(255),
        end_hub VARCHAR(255),
        mileage_can NUMERIC(12,1),
        mileage_gps NUMERIC(12,1),
        selected_source VARCHAR(20),
        selected_mileage NUMERIC(12,1),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT gps_tour_snapshots_source_chk
          CHECK (selected_source IS NULL OR selected_source IN ('approved', 'can', 'gps', 'track'))
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_tour_snapshots_vehicle_time_idx
      ON gps_tour_snapshots (vehicle_code, tour_start, tour_end)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS gps_tour_snapshots_announcement_idx
      ON gps_tour_snapshots (announcement_id)
    `);

    // ستون اختیاری روی ثبت محاسبات — بدون تغییر نام ستون‌های موجود
    const tableExists = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'driver_calculations' LIMIT 1
    `);
    if (tableExists.rows.length) {
      await client.query(`
        ALTER TABLE driver_calculations
        ADD COLUMN IF NOT EXISTS mileage_source VARCHAR(20)
      `);
    }

    await client.query('COMMIT');
    console.log('✅ gps_tour_snapshots ready (+ mileage_source nullable if table exists)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ create_gps_tour_snapshots failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createGpsTourSnapshots()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createGpsTourSnapshots;
