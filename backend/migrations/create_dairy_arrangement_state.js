const pool = require('../db');

/**
 * چیدمان مشترک پاستوریزه + قفل ردیف برای کار تیمی آنلاین
 */
async function createDairyArrangementStateTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS dairy_arrangement_state (
        id VARCHAR(64) PRIMARY KEY,
        routes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        locks_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        version BIGINT NOT NULL DEFAULT 1,
        updated_by_user_id VARCHAR(255),
        updated_by_user_name VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO dairy_arrangement_state (id, routes_json, locks_json, version)
      VALUES ('Dairy', '[]'::jsonb, '{}'::jsonb, 1)
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('✅ dairy_arrangement_state table ready');
  } catch (error) {
    console.error('❌ create_dairy_arrangement_state migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createDairyArrangementStateTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createDairyArrangementStateTable;
