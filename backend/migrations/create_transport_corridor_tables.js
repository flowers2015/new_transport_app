const pool = require('../db');

/**
 * جداول مسیریابی/محور — جدا از dispatch_routes
 * dispatch_routes فقط خوانده می‌شود و تغییر نمی‌کند.
 */
async function createTransportCorridorTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS transport_axes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        axis_code VARCHAR(32) NOT NULL UNIQUE,
        axis_name_fa VARCHAR(255) NOT NULL,
        axis_type VARCHAR(40) NOT NULL,
        direction VARCHAR(16),
        origin_hub VARCHAR(64) NOT NULL DEFAULT 'ISLAMSHAHR',
        terminus_city VARCHAR(255),
        terminus_province VARCHAR(255),
        geo_zone VARCHAR(64),
        road_numbers TEXT[],
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transport_hubs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hub_code VARCHAR(64) NOT NULL UNIQUE,
        hub_name_fa VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        province VARCHAR(255) NOT NULL,
        dispatch_route_id UUID,
        km_from_origin NUMERIC(10, 2),
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS axis_hub_chain (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        axis_code VARCHAR(32) NOT NULL REFERENCES transport_axes(axis_code) ON DELETE CASCADE,
        hub_code VARCHAR(64) NOT NULL REFERENCES transport_hubs(hub_code) ON DELETE CASCADE,
        sequence_order INT NOT NULL,
        leg_description TEXT,
        UNIQUE (axis_code, hub_code),
        UNIQUE (axis_code, sequence_order)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS city_geo_zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        zone_code VARCHAR(64) NOT NULL UNIQUE,
        zone_name_fa VARCHAR(255) NOT NULL,
        parent_zone VARCHAR(64),
        notes TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS city_axis_membership (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dispatch_route_id UUID NOT NULL,
        city VARCHAR(255) NOT NULL,
        province VARCHAR(255) NOT NULL,
        axis_code VARCHAR(32) NOT NULL REFERENCES transport_axes(axis_code) ON DELETE CASCADE,
        membership_type VARCHAR(24) NOT NULL DEFAULT 'primary',
        sequence_on_axis INT,
        km_from_origin NUMERIC(10, 2),
        detour_km NUMERIC(10, 2),
        geo_zone VARCHAR(64),
        confidence VARCHAR(16) NOT NULL DEFAULT 'medium',
        source VARCHAR(64) NOT NULL DEFAULT 'province_km_rules',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dispatch_route_id, axis_code, membership_type)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_city_axis_membership_axis
        ON city_axis_membership (axis_code, sequence_on_axis);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_city_axis_membership_city
        ON city_axis_membership (LOWER(TRIM(city)), province);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_city_axis_membership_route
        ON city_axis_membership (dispatch_route_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_city_axis_membership_zone
        ON city_axis_membership (geo_zone);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS axis_combination_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_code VARCHAR(64) NOT NULL UNIQUE,
        rule_name_fa VARCHAR(255) NOT NULL,
        score INT NOT NULL DEFAULT 0,
        max_km_spread NUMERIC(10, 2),
        max_stops INT DEFAULT 4,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);

    await client.query('COMMIT');
    console.log('✅ transport corridor tables created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ create_transport_corridor_tables failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createTransportCorridorTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createTransportCorridorTables;
