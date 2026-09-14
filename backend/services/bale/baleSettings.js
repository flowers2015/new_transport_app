const pool = require('../../db');

const RUNTIME_KEY = 'runtime';

const DEFAULT_RUNTIME = {
  environment: 'production',
};

async function getRuntimeSettings() {
  return { environment: 'production' };
}

async function setRuntimeSettings({ environment } = {}) {
  const env = 'production';
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
