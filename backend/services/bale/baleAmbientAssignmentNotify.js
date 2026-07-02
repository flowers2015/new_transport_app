const pool = require('../../db');
const baleApi = require('./baleApi');
const { formatRial } = require('./baleFormat');
const {
  getAmbientNotifySettings,
  isFrotlandAmbientLineType,
} = require('./baleAmbientNotifySettings');

const REFER_ACTIONS = ['REFERRED_TO_CARRIER', 'CARRIER_REFERRAL_CHANGED', 'CARRIER_REFERRAL_CANCELLED'];
const ASSIGN_ACTIONS = ['ASSIGNED', 'REASSIGNED'];
const RESET_ACTIONS = ['CANCELLED', 'CARRIER_REFERRAL_CANCELLED'];

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

async function loadRecentHistoryActions(announcementId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT action, created_at
     FROM freight_announcement_history
     WHERE freight_announcement_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [announcementId, limit]
  );
  return rows.map((r) => r.action);
}

/** ارجاع مجدد پس از لغو ارجاع یا تغییر باربری */
async function isRepeatCarrierReferral(announcementId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM freight_announcement_history
     WHERE freight_announcement_id = $1
       AND action = ANY($2::text[])`,
    [announcementId, REFER_ACTIONS]
  );
  return (rows[0]?.cnt || 0) > 1;
}

/** تخصیص پس از لغو تخصیص یا لغو ارجاع — پیام اصلاحیه */
async function shouldUseAssignmentCorrectionMessage(announcementId) {
  const actions = await loadRecentHistoryActions(announcementId);
  if (actions.length === 0) return false;
  // اولین رکورد همان assign فعلی است
  const prior = actions.slice(1);
  return prior.some((a) => RESET_ACTIONS.includes(a));
}

/** ویرایش مجدد بدون لغو — بدون پیام */
function isEditWithoutReset(actions) {
  if (actions.length < 2) return false;
  const current = actions[0];
  const prior = actions[1];
  return ASSIGN_ACTIONS.includes(current) && ASSIGN_ACTIONS.includes(prior);
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

/**
 * اعلان گروه بله — لبنیات-فروتلند
 *
 * پیام می‌رود:
 * - ثبت نام باربری در دیالوگ تخصیص (فاز placeholder): «خودرو تخصیص داده شد»
 * - ارجاع اول به باربری: «خودرو تخصیص داده شد»
 * - ارجاع مجدد / تغییر باربری: «اصلاحیه: باربری عوض شد»
 * - تخصیص واقعی راننده توسط ترابری شخصی: «خودرو تخصیص داده شد»
 * - تخصیص پس از لغو تخصیص یا لغو ارجاع: «اصلاحیه: خودرو تخصیص داده شد»
 *
 * پیام نمی‌رود:
 * - عملیات سمت کاربر باربری
 * - ویرایش مجدد بدون لغو قبلی
 */
async function notifyAssignmentAfterCommit(
  announcementId,
  {
    isCarrierUser,
    isReassignment,
    isCarrierOnlySave,
    isRealDriverAssignment = true,
    oldAssignmentWasPlaceholder = false,
  } = {}
) {
  if (isCarrierUser) {
    return;
  }

  const shouldNotify =
    isCarrierOnlySave || (isRealDriverAssignment && (!isReassignment || oldAssignmentWasPlaceholder));
  if (!shouldNotify) {
    return;
  }

  try {
    const ann = await loadAnnouncementContext(announcementId);
    if (!ann || !isFrotlandAmbientLineType(ann.line_type)) return;

    const actions = await loadRecentHistoryActions(announcementId);
    if (!isCarrierOnlySave && isEditWithoutReset(actions)) {
      console.log(`ℹ️ [bale-ambient] assignment notify skipped (edit without reset) for ${announcementId}`);
      return;
    }

    let text;
    if (isCarrierOnlySave) {
      text = buildVehicleAssignedMessage(ann);
    } else if (await shouldUseAssignmentCorrectionMessage(announcementId)) {
      text = buildCarrierAssignmentCorrectionMessage(ann);
    } else {
      text = buildVehicleAssignedMessage(ann);
    }

    const result = await sendAmbientMessage(text);
    if (result.sent) {
      console.log(`✅ [bale-ambient] personal assignment notify sent for ${announcementId}`);
    } else if (result.skipped) {
      console.log(`ℹ️ [bale-ambient] personal assignment notify skipped (${result.reason}) for ${announcementId}`);
    }
  } catch (err) {
    console.error('⚠️ [bale-ambient] assignment notify failed (non-blocking):', err.message);
  }
}

async function notifyReferToCarrierAfterCommit(announcementId, { carrierChanged = false } = {}) {
  try {
    const ann = await loadAnnouncementContext(announcementId);
    if (!ann || !isFrotlandAmbientLineType(ann.line_type)) {
      console.log(
        `ℹ️ [bale-ambient] refer notify skipped (line_type=${ann?.line_type || 'n/a'}) for ${announcementId}`
      );
      return;
    }

    const repeatRefer = carrierChanged || (await isRepeatCarrierReferral(announcementId));
    const text = repeatRefer ? buildCarrierChangedMessage(ann) : buildVehicleAssignedMessage(ann);
    const result = await sendAmbientMessage(text);
    if (result.sent) {
      console.log(
        `✅ [bale-ambient] carrier refer notify sent for ${announcementId} (${repeatRefer ? 'correction' : 'first'})`
      );
    } else if (result.skipped) {
      console.log(`ℹ️ [bale-ambient] carrier refer notify skipped (${result.reason}) for ${announcementId}`);
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
