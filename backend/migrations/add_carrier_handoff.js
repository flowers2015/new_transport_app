const pool = require('../db');

async function addCarrierHandoff() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS carriers (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact VARCHAR(100),
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        enabled_lines TEXT[] NOT NULL DEFAULT ARRAY['Ambient'],
        created_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS handoff_carrier_id VARCHAR(255) REFERENCES carriers(id) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS handoff_status VARCHAR(50)
    `);
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS freight_cost_locked_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS carrier_id VARCHAR(255) REFERENCES carriers(id) ON DELETE SET NULL
    `);

    const typeRes = await client.query(`
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'role'
    `);
    if (typeRes.rows.length > 0 && typeRes.rows[0].udt_name === 'user_role_enum') {
      const exists = await client.query(`
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role_enum' AND e.enumlabel = 'carrier_user'
      `);
      if (exists.rows.length === 0) {
        await client.query(`ALTER TYPE user_role_enum ADD VALUE 'carrier_user'`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ carrier handoff schema ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_carrier_handoff:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addCarrierHandoff()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addCarrierHandoff;
