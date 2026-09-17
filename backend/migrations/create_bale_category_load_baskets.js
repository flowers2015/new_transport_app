const pool = require('../db');

async function runMigration() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bale_category_load_baskets (
      vehicle_category VARCHAR(100) PRIMARY KEY,
      selected_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      allow_extra BOOLEAN NOT NULL DEFAULT FALSE,
      confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      queue_count INTEGER NOT NULL DEFAULT 0,
      load_count INTEGER NOT NULL DEFAULT 0,
      stage VARCHAR(50),
      updated_by VARCHAR(255),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('OK bale_category_load_baskets');
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
