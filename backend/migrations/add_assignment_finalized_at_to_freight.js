const pool = require('../db');

async function runMigration() {
  try {
    console.log('🔄 Adding assignment_finalized_at column to freight_announcements...');
    await pool.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS assignment_finalized_at TIMESTAMPTZ
    `);
    console.log('✅ Migration successful: assignment_finalized_at column added to freight_announcements');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

