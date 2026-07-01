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
       pv.vehicle_type AS personal_vehicle_type
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

function mapSnapshotToAnn(snapshot) {
  if (!snapshot) return null;
  return {
    announcement_code: snapshot.announcement_code,
    line_type: snapshot.line_type,
    vehicle_type: snapshot.vehicle_type,
    brand: snapshot.brand,
    origin_city: snapshot.origin_city,
    cargo_value: snapshot.cargo_value,
    total_freight_cost: snapshot.total_freight_cost,
    carrier_name: snapshot.carrier_name,
    assigned_driver_name: snapshot.assigned_driver_name,
    bill_of_lading_number: snapshot.bill_of_lading_number,
    vehicle_plate: snapshot.vehicle_plate,
    personal_driver_name: snapshot.personal_driver_name,
    personal_driver_mobile: snapshot.personal_driver_mobile,
    destination_cities: snapshot.destination_cities,
  };
}

function getVehicleType(ann) {
  return dash(ann.vehicle_type || ann.personal_vehicle_type);
}

function getCarrierName(ann) {
  return dash(ann.carrier_name || ann.assigned_driver_name || ann.personal_driver_name);
}

function getDriverName(ann) {
  return dash(ann.assigned_driver_name || ann.personal_driver_name);
}

function getDriverContact(ann) {
  return dash(ann.personal_driver_mobile);
}

function buildCommonLines(ann) {
  return [
    `خودرو: ${getVehicleType(ann)}`,
    `مقصد: ${dash(ann.destination_cities)}`,
    `برند: ${dash(ann.brand)}`,
    `بارگیری از: ${dash(ann.origin_city)}`,
    `ارزش بار: ${formatRial(ann.cargo_value)}`,
    `کرایه: ${formatRial(ann.total_freight_cost)}`,
  ];
}

function buildPersonalAssignMessage(ann) {
  const lines = [
    '✅ تخصیص — ترابری شخصی (لبنیات-فروتلند)',
    '',
    ...buildCommonLines(ann),
    `باربری: ${getCarrierName(ann)}`,
  ];
  return lines.join('\n');
}

function buildCarrierAssignMessage(ann) {
  const lines = [
    '✅ تخصیص — باربری (لبنیات-فروتلند)',
    '',
    ...buildCommonLines(ann),
    `باربری: ${getCarrierName(ann)}`,
    `راننده: ${getDriverName(ann)}`,
    `تماس: ${getDriverContact(ann)}`,
    `بارنامه: ${dash(ann.bill_of_lading_number)}`,
    `پلاک: ${dash(ann.vehicle_plate)}`,
  ];
  return lines.join('\n');
}

function buildCancelMessage(ann) {
  const lines = [
    '❌ لغو تخصیص — لبنیات-فروتلند',
    '',
    ...buildCommonLines(ann),
    `باربری: ${getCarrierName(ann)}`,
  ];
  const driverName = getDriverName(ann);
  const driverContact = getDriverContact(ann);
  const bol = dash(ann.bill_of_lading_number);
  const plate = dash(ann.vehicle_plate);
  if (driverName !== '—' || driverContact !== '—' || bol !== '—' || plate !== '—') {
    lines.push(`راننده: ${driverName}`);
    lines.push(`تماس: ${driverContact}`);
    lines.push(`بارنامه: ${bol}`);
    lines.push(`پلاک: ${plate}`);
  }
  return lines.join('\n');
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
      ? buildCarrierAssignMessage(ann)
      : buildPersonalAssignMessage(ann);
    const result = await sendAmbientMessage(text);
    if (result.sent) {
      console.log(`✅ [bale-ambient] assignment notify sent for ${announcementId}`);
    }
  } catch (err) {
    console.error('⚠️ [bale-ambient] assignment notify failed (non-blocking):', err.message);
  }
}

async function notifyCancelAfterCommit(announcementId, snapshot) {
  try {
    const ann = mapSnapshotToAnn(snapshot) || await loadAnnouncementContext(announcementId);
    if (!ann || !isFrotlandAmbientLineType(ann.line_type)) return;
    if (!snapshot?.had_assignment) return;

    const text = buildCancelMessage(ann);
    const result = await sendAmbientMessage(text);
    if (result.sent) {
      console.log(`✅ [bale-ambient] cancel notify sent for ${announcementId}`);
    }
  } catch (err) {
    console.error('⚠️ [bale-ambient] cancel notify failed (non-blocking):', err.message);
  }
}

async function sendTestAmbientMessage() {
  const text = [
    '🔔 تست اعلان تخصیص لبنیات-فروتلند',
    '',
    'اگر این پیام را می‌بینید، ربات به گروه دسترسی دارد و تنظیمات chat_id درست است.',
  ].join('\n');
  return sendAmbientMessage(text);
}

module.exports = {
  notifyAssignmentAfterCommit,
  notifyCancelAfterCommit,
  sendTestAmbientMessage,
  buildPersonalAssignMessage,
  buildCarrierAssignMessage,
  buildCancelMessage,
  loadAnnouncementContext,
};
