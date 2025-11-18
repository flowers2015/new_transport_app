const pool = require('../db');

async function runMigration() {
  try {
    console.log('🔄 Adding assignment_finalized_at column to dispatch_assignments...');
    await pool.query(`
      ALTER TABLE dispatch_assignments
      ADD COLUMN IF NOT EXISTS assignment_finalized_at TIMESTAMPTZ
    `);
    console.log('✅ Migration successful: assignment_finalized_at column added');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

