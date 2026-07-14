const pool = require('../db');

/**
 * قفل پذیرش اعلام‌بار جدید به ازای هر خط (تب ترابری)
 */
async function createFreightIntakeLocksTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS freight_intake_locks (
        line_type VARCHAR(64) PRIMARY KEY,
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        updated_by_user_id VARCHAR(255),
        updated_by_user_name VARCHAR(255),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const lineType of ['IceCream', 'Dairy', 'Ambient']) {
      await client.query(
        `
          INSERT INTO freight_intake_locks (line_type, is_locked)
          VALUES ($1, FALSE)
          ON CONFLICT (line_type) DO NOTHING
        `,
        [lineType]
      );
    }

    console.log('✅ freight_intake_locks table ready');
  } catch (error) {
    console.error('❌ create_freight_intake_locks migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createFreightIntakeLocksTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createFreightIntakeLocksTable;
