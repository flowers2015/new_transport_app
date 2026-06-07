const pool = require('../../db');

const RUNTIME_KEY = 'runtime';

const DEFAULT_RUNTIME = {
  environment: 'test',
};

async function getRuntimeSettings() {
  const { rows } = await pool.query(
    `SELECT value FROM bale_settings WHERE key = $1`,
    [RUNTIME_KEY]
  );
  const raw = rows[0]?.value || {};
  return {
    environment: raw.environment === 'production' ? 'production' : 'test',
  };
}

async function setRuntimeSettings({ environment }) {
  const env = environment === 'production' ? 'production' : 'test';
  await pool.query(
    `INSERT INTO bale_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [RUNTIME_KEY, JSON.stringify({ environment: env })]
  );
  return getRuntimeSettings();
}

function isProductionEnvironment(settings) {
  return settings?.environment === 'production';
}

module.exports = {
  getRuntimeSettings,
  setRuntimeSettings,
  isProductionEnvironment,
};
