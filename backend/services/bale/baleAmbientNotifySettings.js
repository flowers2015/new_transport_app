const pool = require('../../db');

const SETTINGS_KEY = 'ambient_assignment_notify';

const DEFAULT_SETTINGS = {
  enabled: false,
  chatId: null,
  updatedBy: null,
  updatedAt: null,
};

const FROTland_AMBIENT_LINE_TYPES = new Set(['Ambient', 'لبنیات-فروتلند', 'لبنیات فروتلند']);

function isFrotlandAmbientLineType(lineType) {
  const lt = String(lineType || '').trim();
  if (FROTland_AMBIENT_LINE_TYPES.has(lt)) return true;
  if (lt.toLowerCase() === 'ambient') return true;
  return false;
}

function normalizeSettings(raw = {}) {
  const chatIdRaw = raw.chatId ?? raw.chat_id;
  const chatIdStr =
    chatIdRaw === null || chatIdRaw === undefined || chatIdRaw === ''
      ? null
      : String(chatIdRaw).trim() || null;
  return {
    enabled: raw.enabled === true,
    chatId: chatIdStr,
    updatedBy: raw.updatedBy || raw.updated_by || null,
    updatedAt: raw.updatedAt || raw.updated_at || null,
  };
}

async function getAmbientNotifySettings() {
  const { rows } = await pool.query(
    `SELECT value FROM bale_settings WHERE key = $1`,
    [SETTINGS_KEY]
  );
  if (!rows[0]?.value) {
    return { ...DEFAULT_SETTINGS };
  }
  return normalizeSettings(rows[0].value);
}

async function setAmbientNotifySettings({ enabled, chatId, updatedBy }) {
  const current = await getAmbientNotifySettings();
  const next = normalizeSettings({
    enabled: enabled === undefined ? current.enabled : enabled === true,
    chatId: chatId === undefined ? current.chatId : chatId,
    updatedBy: updatedBy || null,
    updatedAt: new Date().toISOString(),
  });
  await pool.query(
    `INSERT INTO bale_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(next)]
  );
  return getAmbientNotifySettings();
}

module.exports = {
  SETTINGS_KEY,
  isFrotlandAmbientLineType,
  getAmbientNotifySettings,
  setAmbientNotifySettings,
};
