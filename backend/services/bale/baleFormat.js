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

/** بله/Telegram Markdown — کاراکترهای خاص داخل متن پویا */
function escapeMarkdown(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/`/g, '\\`');
}

function mdBold(text) {
  return `*${escapeMarkdown(text)}*`;
}

function mdItalic(text) {
  return `_${escapeMarkdown(text)}_`;
}

const BALE_PARSE_MODE = 'Markdown';

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

function formatAnnouncementRowMarkdown(index, ann) {
  const line = escapeMarkdown(ann.lineType || '—');
  const dest = escapeMarkdown(getDestinationDisplay(ann));
  const km = escapeMarkdown(formatRouteKm(ann));
  const origin = escapeMarkdown(getOriginDisplay(ann));
  const brand = escapeMarkdown(ann.brand || '—');
  const cargo = escapeMarkdown(formatRial(ann.cargoValue));
  const delivery = escapeMarkdown(formatDeliveryDate(ann));
  const note =
    ann.notes && String(ann.notes).trim() && String(ann.notes).trim() !== formatRouteKm(ann)
      ? escapeMarkdown(String(ann.notes).trim())
      : null;

  let text =
    `${mdBold(`${index}.`)} بار ${line}\n` +
    `   📍 ${mdBold(dest)}  |  📏 ${mdBold(km)}\n` +
    `   🏭 بارگیری از ${mdBold(origin)}\n` +
    `   برند ${brand} | ارزش ${cargo} | تحویل ${delivery}`;
  if (note) text += `\n   ${note}`;
  return text;
}

function formatAssignmentGroupMessage(driverName, rowNumber, ann) {
  const name = mdBold(driverName || '—');
  const barLine = formatAnnouncementRowMarkdown(rowNumber || 1, ann);
  return `✅ ${name} انتخاب کرد\n\n${barLine}`;
}

function formatAnnouncementList(announcements, max = 30) {
  const list = (announcements || []).slice(0, max);
  if (list.length === 0) return 'بار مجازی برای این نوبت موجود نیست.';
  return list.map((ann, i) => formatAnnouncementRow(i + 1, ann)).join('\n\n');
}

function formatAnnouncementListMarkdown(announcements, max = 30) {
  const list = (announcements || []).slice(0, max);
  if (list.length === 0) return 'بار مجازی برای این نوبت موجود نیست.';
  return list.map((ann, i) => formatAnnouncementRowMarkdown(i + 1, ann)).join('\n\n');
}

function formatGroupStageTitle(stage, vehicleCategory) {
  const titles = {
    stage1: 'اعلام بار مرحله اول — مسیرهای خیلی‌دور (نوبت دور)',
    stage2_far: 'مرحله دوم — نوبت دور (همه بارهای باقی‌مانده)',
    stage2_near_vf: 'مرحله دوم — خیلی‌دور برای نوبت نزدیک',
    stage2_near_all: 'مرحله دوم — نوبت نزدیک (بارهای باقی‌مانده)',
    stage2: 'اعلام بار مرحله دوم — بارهای باقی‌مانده',
  };
  const stagePart = titles[stage] || titles.stage2;
  const categoryPart = vehicleCategory
    ? `\nدسته: ${escapeMarkdown(vehicleCategory)}`
    : '';
  return `${mdBold(stagePart)}${categoryPart}`;
}

const QUEUE_TYPE_FA = {
  far: 'دور',
  near: 'نزدیک',
  workshop: 'تعمیرگاه',
  external: 'خارجی',
  leave: 'مرخصی',
  other: 'سایر',
};

const { computeJalaliCycleRange } = require('../dispatch/dispatchCycle');

function veryFarHistorySuffix(item) {
  const jalali =
    item.lastVeryFarAtJalali || item.longRouteHistory?.[0]?.atJalali || null;
  if (!jalali) return '';
  const city = item.longRouteHistory?.[0]?.city;
  const destPart = city ? ` — ${escapeMarkdown(city)}` : '';
  return ` ${mdItalic(`خیلی‌دور: ${jalali}${destPart}`)}`;
}

function formatQueueLine(item, index) {
  const name = escapeMarkdown(item.driver?.name || item.driver_name || '—');
  return `${index}. ${name}${veryFarHistorySuffix(item)}`;
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
    parts.push(`🟢 ${mdBold('دور')}`);
    far.forEach((item, i) => parts.push(formatQueueLine(item, i + 1)));
  }

  if (far.length && near.length) {
    parts.push('────────────────');
  }

  if (near.length) {
    parts.push(`🟠 ${mdBold('نزدیک')}`);
    near.forEach((item, i) => parts.push(formatQueueLine(item, i + 1)));
  }

  if (other.length) {
    if (parts.length) parts.push('────────────────');
    parts.push(mdBold('سایر'));
    other.forEach((item, i) => {
      const t = QUEUE_TYPE_FA[item.queueType || item.queue_type] || item.queue_type;
      parts.push(`${formatQueueLine(item, i + 1)} — ${escapeMarkdown(t)}`);
    });
  }

  const { fromJalali, toJalali } = computeJalaliCycleRange();
  if (parts.length) parts.push('────────────────');
  parts.push(
    `📅 ${mdItalic(`دوره جاری: ${fromJalali} تا ${toJalali}`)}`
  );

  return parts.join('\n');
}

function stageLabel(stage) {
  const labels = {
    stage1: 'مرحله اول (خیلی‌دور — نوبت دور)',
    stage2_far: 'مرحله دوم — نوبت دور',
    stage2_near_vf: 'مرحله دوم — خیلی‌دور (نوبت نزدیک)',
    stage2_near_all: 'مرحله دوم — نوبت نزدیک',
    stage2: 'مرحله دوم',
  };
  return labels[stage] || labels.stage2;
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

/** حذف نشانه‌گذاری Markdown برای fallback بدون parse_mode */
function stripMarkdown(text) {
  return String(text || '')
    .replace(/\\([*_`\[])/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}

module.exports = {
  BALE_PARSE_MODE,
  formatCountdown,
  formatAnnouncementRow,
  formatAnnouncementRowMarkdown,
  formatAnnouncementList,
  formatAnnouncementListMarkdown,
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
  stripMarkdown,
  mdBold,
};
