/**
 * Migration: must_change_password on users
 * true = user must set a new password after next login (new account or admin reset)
 */

const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'must_change_password'
    `);

    if (check.rows.length === 0) {
      console.log('📝 [Migration] Adding must_change_password column...');
      await client.query(`
        ALTER TABLE users
        ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE
      `);
      console.log('✅ [Migration] must_change_password column added');
    } else {
      console.log('ℹ️  [Migration] must_change_password already exists, skipping');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] add_must_change_password failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };
