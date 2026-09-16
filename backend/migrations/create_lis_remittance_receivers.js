const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lis_remittance_receivers (
        id VARCHAR(255) PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS lis_remittance_receivers_employee_active_uidx
      ON lis_remittance_receivers (employee_id)
      WHERE is_active = TRUE
    `);
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS dock_number INTEGER
    `);
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS remittance_receiver_id VARCHAR(255)
    `);
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS remittance_receiver_name VARCHAR(255)
    `);
    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS remittance_referred_to_picker BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await client.query('COMMIT');
    console.log('OK lis remittance receivers + dock columns');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}

module.exports = runMigration;
