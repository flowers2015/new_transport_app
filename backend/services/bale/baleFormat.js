function formatCountdown(deadlineAt) {
  if (!deadlineAt) return '—';
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (ms <= 0) return '۰:۰۰';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  return `${fa(min)}:${fa(sec).padStart(2, '0')}`;
}

function formatRial(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toLocaleString('en-US')} ریال`;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getOriginDisplay(ann) {
  const origin = ann.originCity || ann.origin_city;
  if (!origin) return '—';
  return String(origin).trim() || '—';
}

function getDestinationDisplay(ann) {
  if (ann.destinationCities) return String(ann.destinationCities).trim();
  const city = ann.destination?.city;
  if (!city) return '—';
  const raw = String(city).trim();
  if (raw.includes(' و ')) return raw;
  if (raw.includes('-')) {
    return raw
      .split('-')
      .map(s => s.trim())
      .filter(Boolean)
      .join(' و ');
  }
  return raw;
}

function formatRouteKm(ann) {
  const km = ann.route?.round_trip_km;
  if (km) return `${Math.round(Number(km))} کیلومتر`;
  const dist = ann.route?.distance_category || ann.route?.route_category;
  if (dist) return String(dist);
  return '—';
}

function formatRouteHint(ann) {
  return formatRouteKm(ann);
}

function formatDeliveryDate(ann) {
  return (
    ann.deliveryDate ||
    (ann.deliveryDates && ann.deliveryDates.length > 1
      ? ann.deliveryDates.join(' و ')
      : ann.deliveryDates?.[0]) ||
    '—'
  );
}

function formatAnnouncementRow(index, ann) {
  const line = ann.lineType || '—';
  const dest = getDestinationDisplay(ann);
  const km = formatRouteKm(ann);
  const origin = getOriginDisplay(ann);
  const brand = ann.brand || '—';
  const cargo = formatRial(ann.cargoValue);
  const delivery = formatDeliveryDate(ann);
  const note =
    ann.notes && String(ann.notes).trim() && String(ann.notes).trim() !== km
      ? String(ann.notes).trim()
      : null;

  let text =
    `${index}. بار ${line}\n` +
    `   📍 ${dest}  |  📏 ${km}\n` +
    `   🏭 بارگیری از ${origin}\n` +
    `   برند ${brand} | ارزش ${cargo} | تحویل ${delivery}`;
  if (note) text += `\n   ${note}`;
  return text;
}

function formatAnnouncementRowHtml(index, ann) {
  const line = escapeHtml(ann.lineType || '—');
  const dest = escapeHtml(getDestinationDisplay(ann));
  const km = escapeHtml(formatRouteKm(ann));
  const origin = escapeHtml(getOriginDisplay(ann));
  const brand = escapeHtml(ann.brand || '—');
  const cargo = escapeHtml(formatRial(ann.cargoValue));
  const delivery = escapeHtml(formatDeliveryDate(ann));
  const note =
    ann.notes && String(ann.notes).trim() && String(ann.notes).trim() !== formatRouteKm(ann)
      ? escapeHtml(String(ann.notes).trim())
      : null;

  let text =
    `<b>${index}.</b> بار ${line}\n` +
    `   📍 <b>${dest}</b>  |  📏 <b>${km}</b>\n` +
    `   🏭 بارگیری از <b>${origin}</b>\n` +
    `   برند ${brand} | ارزش ${cargo} | تحویل ${delivery}`;
  if (note) text += `\n   ${note}`;
  return text;
}

function formatAssignmentGroupMessage(driverName, rowNumber, ann) {
  const name = escapeHtml(driverName || '—');
  const barLine = formatAnnouncementRowHtml(rowNumber || 1, ann);
  return `✅ <b>${name}</b> انتخاب کرد\n\n${barLine}`;
}

function formatAnnouncementList(announcements, max = 30) {
  const list = (announcements || []).slice(0, max);
  if (list.length === 0) return 'بار مجازی برای این نوبت موجود نیست.';
  return list.map((ann, i) => formatAnnouncementRow(i + 1, ann)).join('\n\n');
}

function formatAnnouncementListHtml(announcements, max = 30) {
  const list = (announcements || []).slice(0, max);
  if (list.length === 0) return 'بار مجازی برای این نوبت موجود نیست.';
  return list.map((ann, i) => formatAnnouncementRowHtml(i + 1, ann)).join('\n\n');
}

function formatGroupStageTitle(stage, vehicleCategory) {
  const stagePart =
    stage === 'stage1'
      ? 'اعلام بار مرحله اول — دور و نزدیک'
      : 'اعلام بار مرحله دوم — بارهای باقی‌مانده';
  const categoryPart = vehicleCategory ? `\nدسته: ${escapeHtml(vehicleCategory)}` : '';
  return `<b>${stagePart}</b>${categoryPart}`;
}

const QUEUE_TYPE_FA = {
  far: 'دور',
  near: 'نزدیک',
  workshop: 'تعمیرگاه',
  external: 'خارجی',
  leave: 'مرخصی',
  other: 'سایر',
};

function formatQueueLine(item, index) {
  const name = item.driver?.name || item.driver_name || '—';
  return `${index}. ${name}`;
}

function formatQueueSnapshot(queue) {
  if (!queue || queue.length === 0) return 'صف خالی است.';
  const far = queue.filter(q => (q.queueType || q.queue_type) === 'far');
  const near = queue.filter(q => (q.queueType || q.queue_type) === 'near');
  const other = queue.filter(q => {
    const t = q.queueType || q.queue_type;
    return t && t !== 'far' && t !== 'near';
  });

  const parts = [];

  if (far.length) {
    parts.push('🟢 <b>دور</b>');
    far.forEach((item, i) => parts.push(formatQueueLine(item, i + 1)));
  }

  if (far.length && near.length) {
    parts.push('────────────────');
  }

  if (near.length) {
    parts.push('🟠 <b>نزدیک</b>');
    near.forEach((item, i) => parts.push(formatQueueLine(item, i + 1)));
  }

  if (other.length) {
    if (parts.length) parts.push('────────────────');
    parts.push('<b>سایر</b>');
    other.forEach((item, i) => {
      const t = QUEUE_TYPE_FA[item.queueType || item.queue_type] || item.queue_type;
      parts.push(`${formatQueueLine(item, i + 1)} — ${t}`);
    });
  }

  return parts.join('\n');
}

function stageLabel(stage) {
  return stage === 'stage1' ? 'مرحله اول (مسیرهای دور)' : 'مرحله دوم';
}

function modeLabel(mode) {
  const map = {
    manual: 'دستی',
    hybrid: 'هیبرید',
    semi_auto: 'نیمه‌خودکار',
    auto: 'خودکار',
  };
  return map[mode] || mode;
}

function toAsciiDigits(text) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(text || '')
    .trim()
    .replace(/[۰-۹]/g, c => String(persian.indexOf(c)));
}

/** فقط ۱–۲ رقم (یا کد پرسنلی + ۱–۲ رقم) — نه شماره‌های بلند گروه */
function parseRowNumber(text) {
  const ascii = toAsciiDigits(text);
  const withEmp = ascii.match(/^(\d{1,10})\s+(\d{1,2})$/);
  if (withEmp) return parseInt(withEmp[2], 10);
  const plain = ascii.match(/^(\d{1,2})$/);
  if (plain) return parseInt(plain[1], 10);
  return NaN;
}

function looksLikeDriverSelectionAttempt(text) {
  const ascii = toAsciiDigits(text);
  if (!ascii) return false;
  return /^\d{1,2}$/.test(ascii) || /^\d{1,10}\s+\d{1,2}$/.test(ascii);
}

module.exports = {
  formatCountdown,
  formatAnnouncementRow,
  formatAnnouncementRowHtml,
  formatAnnouncementList,
  formatAnnouncementListHtml,
  formatAssignmentGroupMessage,
  formatRouteKm,
  getOriginDisplay,
  formatQueueSnapshot,
  formatGroupStageTitle,
  stageLabel,
  modeLabel,
  parseRowNumber,
  looksLikeDriverSelectionAttempt,
  formatRial,
  getDestinationDisplay,
};
