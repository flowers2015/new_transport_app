const pool = require('../db');

/**
 * جداول منابع GPS — کاملاً جدا از vehicles / مدیریت منابع
 * خاموش‌سازی سریع: GPS_ADMIN_ENABLED=false در .env
 * برگشت کامل: DROP TABLE gps_resources; DROP TABLE gps_device_models;
 */
const DEFAULT_MODELS = [
  'A4',
  'BCE FM Blue+',
  'Teltonika FM1100',
  'Teltonika FM1110',
  'Teltonika FMA202',
  'Teltonika FMB 640',
  'Teltonika FMB 641',
  'Teltonika FMB 920',
  'Teltonika FMB202',
];

async function createGpsResourcesTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_device_models (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gps_resources (
        id VARCHAR(255) PRIMARY KEY,
        vehicle_code VARCHAR(100) NOT NULL,
        plate_number VARCHAR(100),
        asset_kind VARCHAR(50) NOT NULL DEFAULT 'tractor',
        imei VARCHAR(32) NOT NULL,
        gps_model_id VARCHAR(255) REFERENCES gps_device_models(id) ON DELETE SET NULL,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT gps_resources_imei_digits CHECK (imei ~ '^[0-9]+$'),
        CONSTRAINT gps_resources_asset_kind_chk CHECK (asset_kind IN ('tractor', 'semi_trailer'))
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gps_resources_imei_uidx
      ON gps_resources (imei)
      WHERE is_active = TRUE
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gps_resources_code_kind_uidx
      ON gps_resources (vehicle_code, asset_kind)
      WHERE is_active = TRUE
    `);

    for (const name of DEFAULT_MODELS) {
      await client.query(
        `
          INSERT INTO gps_device_models (id, name, is_active)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (name) DO NOTHING
        `,
        [require('crypto').randomUUID(), name]
      );
    }

    await client.query('COMMIT');
    console.log('✅ gps_device_models + gps_resources ready');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ create_gps_resources_tables failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createGpsResourcesTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createGpsResourcesTables;
