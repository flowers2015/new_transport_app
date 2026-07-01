const pool = require('../../db');
const baleApi = require('./baleApi');
const { formatRial } = require('./baleFormat');
const {
  getAmbientNotifySettings,
  isFrotlandAmbientLineType,
} = require('./baleAmbientNotifySettings');

function dash(value) {
  const s = String(value ?? '').trim();
  return s || '—';
}

async function loadAnnouncementContext(announcementId) {
  const { rows } = await pool.query(
    `SELECT
       fa.id,
       fa.announcement_code,
       fa.line_type,
       fa.vehicle_type,
       fa.brand,
       fa.origin_city,
       fa.cargo_value,
       fa.total_freight_cost,
       fa.carrier_name,
       fa.assigned_driver_name,
       fa.bill_of_lading_number,
       fa.vehicle_plate,
       pd.name AS personal_driver_name,
       pd.mobile AS personal_driver_mobile,
       pv.vehicle_type AS personal_vehicle_type,
       (
         SELECT COALESCE(SUM(fd.tonnage), 0)
         FROM freight_destinations fd
         WHERE fd.freight_announcement_id = fa.id
       ) AS total_tonnage_kg
     FROM freight_announcements fa
     LEFT JOIN personal_drivers pd ON fa.assigned_driver_id = pd.id
     LEFT JOIN personal_vehicles pv ON fa.assigned_vehicle_id = pv.id
     WHERE fa.id = $1`,
    [announcementId]
  );
  if (!rows[0]) return null;

  const ann = rows[0];
  const destRes = await pool.query(
    `SELECT city FROM freight_destinations
     WHERE freight_announcement_id = $1
     ORDER BY created_at ASC`,
    [announcementId]
  );
  ann.destination_cities = destRes.rows.map((r) => r.city).filter(Boolean).join('، ') || '—';
  return ann;
}

function getVehicleType(ann) {
  return dash(ann.vehicle_type || ann.personal_vehicle_type);
}

function getCarrierName(ann) {
  return dash(ann.carrier_name || ann.assigned_driver_name || ann.personal_driver_name);
}

function formatTonnage(ann) {
  const kg = Number(ann.total_tonnage_kg);
  if (!Number.isFinite(kg) || kg <= 0) return '—';
  return `${kg.toLocaleString('en-US')} کیلوگرم`;
}

function buildFreightLines(ann) {
  return [
    `خودرو: ${getVehicleType(ann)}`,
    `مقصد: ${dash(ann.destination_cities)}`,
    `برند: ${dash(ann.brand)}`,
    `بارگیری از: ${dash(ann.origin_city)}`,
    `وزن بار: ${formatTonnage(ann)}`,
    `ارزش بار: ${formatRial(ann.cargo_value)}`,
    `کرایه: ${formatRial(ann.total_freight_cost)}`,
    `باربری: ${getCarrierName(ann)}`,
  ];
}

function buildCarrierDriverLines(ann) {
  return [
    `راننده: ${dash(ann.assigned_driver_name || ann.personal_driver_name)}`,
    `تماس: ${dash(ann.personal_driver_mobile)}`,
    `بارنامه: ${dash(ann.bill_of_lading_number)}`,
    `پلاک: ${dash(ann.vehicle_plate)}`,
  ];
}

function buildMessage(headline, ann, { includeDriver = false } = {}) {
  const lines = [headline, '', ...buildFreightLines(ann)];
  if (includeDriver) {
    lines.push(...buildCarrierDriverLines(ann));
  }
  return lines.join('\n');
}

function buildVehicleAssignedMessage(ann) {
  return buildMessage('خودرو تخصیص داده شد', ann);
}

function buildCarrierChangedMessage(ann) {
  return buildMessage('اصلاحیه: باربری عوض شد', ann);
}

function buildCarrierAssignmentCorrectionMessage(ann) {
  return buildMessage('اصلاحیه: خودرو تخصیص داده شد', ann, { includeDriver: true });
}

async function sendAmbientMessage(text) {
  const settings = await getAmbientNotifySettings();
  if (!settings.enabled || !settings.chatId) {
    return { skipped: true, reason: 'disabled_or_no_chat' };
  }
  if (!baleApi.isConfigured()) {
    return { skipped: true, reason: 'bot_not_configured' };
  }
  await baleApi.sendMessage(settings.chatId, text);
  return { sent: true, chatId: settings.chatId };
}

async function notifyAssignmentAfterCommit(announcementId, { isCarrierUser, isReassignment }) {
  if (isReassignment) return;
  try {
    const ann = await loadAnnouncementContext(announcementId);
    if (!ann || !isFrotlandAmbientLineType(ann.line_type)) return;

    const text = isCarrierUser
      ? buildCarrierAssignmentCorrectionMessage(ann)
      : buildVehicleAssignedMessage(ann);
    const result = await sendAmbientMessage(text);
    if (result.sent) {
      console.log(`✅ [bale-ambient] assignment notify sent for ${announcementId}`);
    }
  } catch (err) {
    console.error('⚠️ [bale-ambient] assignment notify failed (non-blocking):', err.message);
  }
}

async function notifyReferToCarrierAfterCommit(announcementId, { carrierChanged = false } = {}) {
  try {
    const ann = await loadAnnouncementContext(announcementId);
    if (!ann || !isFrotlandAmbientLineType(ann.line_type)) return;

    const text = carrierChanged
      ? buildCarrierChangedMessage(ann)
      : buildVehicleAssignedMessage(ann);
    const result = await sendAmbientMessage(text);
    if (result.sent) {
      console.log(`✅ [bale-ambient] carrier refer notify sent for ${announcementId}`);
    }
  } catch (err) {
    console.error('⚠️ [bale-ambient] carrier refer notify failed (non-blocking):', err.message);
  }
}

async function sendTestAmbientMessage(chatIdOverride) {
  const baleApiRef = require('./baleApi');
  if (!baleApiRef.isConfigured()) {
    return { skipped: true, reason: 'bot_not_configured' };
  }

  let bot = null;
  try {
    bot = await baleApiRef.getMe();
  } catch (err) {
    return {
      skipped: true,
      reason: 'bot_token_invalid',
      error: err.message,
    };
  }

  const settings = await getAmbientNotifySettings();
  const chatId = baleApiRef.normalizeChatId(chatIdOverride ?? settings.chatId);
  if (!chatId) {
    return { skipped: true, reason: 'no_chat_id' };
  }

  const text = [
    'خودرو تخصیص داده شد',
    '',
    '(پیام تست — اگر این را می‌بینید ربات و chat_id درست است)',
  ].join('\n');

  try {
    await baleApiRef.sendMessage(chatId, text);
    return { sent: true, chatId, bot };
  } catch (err) {
    const hint = buildSendFailureHint(err.message, chatId);
    const wrapped = new Error(hint ? `${err.message}\n${hint}` : err.message);
    wrapped.cause = err;
    throw wrapped;
  }
}

function buildSendFailureHint(message, chatId) {
  const msg = String(message || '');
  if (/internal server error/i.test(msg)) {
    return [
      'راهنمای عیب‌یابی:',
      '۱) همان BALE_BOT_TOKEN لوکال را روی سرور گذاشته‌اید؟ (pm2 restart transport-backend --update-env)',
      '۲) ربات عضو همان گروه فروتلند روی سرور است؟',
      `۳) chat_id را دقیق از فوروارد پیام به همان ربات بگیرید (فعلی: ${chatId}).`,
      '۴) برای بعضی گروه‌ها chat_id منفی است (مثلاً -100...).',
    ].join('\n');
  }
  if (/chat not found|group chat was upgraded|peer id invalid/i.test(msg)) {
    return 'chat_id اشتباه است — یک پیام از گروه را به ربات فوروارد کنید و عدد دقیق را وارد کنید.';
  }
  if (/bot was kicked|not enough rights|have no rights/i.test(msg)) {
    return 'ربات عضو گروه نیست یا اجازه ارسال پیام ندارد.';
  }
  if (/unauthorized|token/i.test(msg)) {
    return 'توکن ربات روی سرور نامعتبر است — BALE_BOT_TOKEN را در .env سرور بررسی کنید.';
  }
  return null;
}

module.exports = {
  notifyAssignmentAfterCommit,
  notifyReferToCarrierAfterCommit,
  sendTestAmbientMessage,
  buildVehicleAssignedMessage,
  buildCarrierChangedMessage,
  buildCarrierAssignmentCorrectionMessage,
  loadAnnouncementContext,
};
