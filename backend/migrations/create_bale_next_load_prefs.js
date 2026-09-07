const pool = require('../db');

async function createBaleNextLoadPrefs() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bale_next_load_prefs (
      driver_id VARCHAR(255) PRIMARY KEY,
      follow_turn BOOLEAN NOT NULL DEFAULT FALSE,
      reject_line VARCHAR(32),
      reject_distance VARCHAR(32),
      reject_provinces JSONB NOT NULL DEFAULT '[]'::jsonb,
      prefer_provinces JSONB NOT NULL DEFAULT '[]'::jsonb,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bale_next_load_surveys (
      id VARCHAR(16) PRIMARY KEY,
      driver_id VARCHAR(255) NOT NULL,
      chat_id BIGINT NOT NULL,
      message_id BIGINT,
      step VARCHAR(40) NOT NULL,
      draft JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_bale_next_load_surveys_driver ON bale_next_load_surveys (driver_id)`
  );
}

module.exports = createBaleNextLoadPrefs;

if (require.main === module) {
  createBaleNextLoadPrefs()
    .then(() => {
      console.log('✅ bale_next_load_prefs ready');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
