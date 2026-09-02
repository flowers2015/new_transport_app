/**
 * تحلیل تور GPS — منطق سازگار با new.py، بازنویسی برای Node
 */
const HUB_KEYWORDS = [
  'شهر نوشیدنی', 'فروتلند', 'شهرلبنیات', 'شهر لبنیات',
  'امین زاده', 'کارخانه میهن', 'گلفام',
  'انبار مرکزی', 'پخش تهران', 'پاندا', 'کارخانه پاندا',
];

const BASE_COMPLEX_KEYWORDS = [
  'شهر نوشیدنی', 'فروتلند', 'شهرلبنیات', 'شهر لبنیات',
  'انبار مرکزی', 'پاندا', 'کارخانه پاندا',
  'امین زاده', 'گلفام', 'پخش تهران', 'کارخانه میهن',
];

const MIN_UNLOAD_HOURS = 0.5;
const MIN_STOP_MINUTES = 15;
/** توقف فقط وقتی سرعت دقیقاً صفر باشد (رانندگی همچنان آستانه ۵ دارد) */
const STOP_SPEED_MAX = 0;
const OVERSPEED_LIMIT = 105;
const OVERSPEED_DURATION_SECONDS = 60;
/** نویز GPS: ورود فوری به Hub بعد از خروج (گاهی همان ثانیه) نباید تور را باطل کند */
const HUB_FLICKER_SECONDS = 180;
const ODO_PRIORITY = ['can_odo', 'odo', 'io16', 'io12', 'odor'];
/** ساعت خواب اجباری شرکت — به وقت تهران */
const TEHRAN_TZ = 'Asia/Tehran';
const LEGAL_SLEEP_START_MIN = 23 * 60 + 30; // 23:30
const LEGAL_SLEEP_END_MIN = 5 * 60 + 30; // 05:30

function safeFloat(value, defaultValue = null) {
  if (value === null || value === undefined || value === '') return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function ioToKm(raw) {
  if (raw == null) return null;
  return raw > 100000 ? raw / 1000 : raw;
}

function extractOdometerCan(params) {
  if (!params || typeof params !== 'object') return null;
  const v = safeFloat(params.can_odo);
  if (v != null && v > 0 && v < 10_000_000) return v;
  return null;
}

function extractOdometerGpsLike(params) {
  if (!params || typeof params !== 'object') return null;
  for (const key of ['odo', 'io16', 'io12', 'odor']) {
    const v = safeFloat(params[key]);
    if (v != null && v > 0) return key.startsWith('io') ? ioToKm(v) : v;
  }
  return null;
}

function extractOdometer(params) {
  if (!params || typeof params !== 'object') return { value: null, source: null };
  for (const key of ODO_PRIORITY) {
    const v = safeFloat(params[key]);
    if (v != null && v > 0) {
      return { value: key.startsWith('io') ? ioToKm(v) : v, source: key };
    }
  }
  return { value: null, source: null };
}

/** برچسب منبع کیلومترشمار برای UI */
function odometerSourceLabel(source) {
  if (!source) return 'ندارد';
  if (source === 'can_odo') return 'CAN';
  if (source === 'odo' || source === 'odor') return 'GPS-ODO';
  if (source === 'io16') return 'IO16';
  if (source === 'io12') return 'IO12';
  return String(source).toUpperCase();
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * مسافت مسیر از نقاط Messages (جایگزین odo نیست — منبع جدا: mileage_gps_track)
 * msg: [time, ..., lat@3, lng@4, speed@5, ...]
 * فاصله‌های با سرعت ضمنی غیرواقعی (پرش GPS) حذف می‌شوند؛ گپ زمانی بلند حذف نمی‌شود
 * مگر اینکه پرش مختصات/دریفت توقف باشد.
 */
function normalizeMsgLatLng(rawLat, rawLng) {
  let lat = safeFloat(rawLat);
  let lng = safeFloat(rawLng);
  if (lat == null || lng == null) return null;
  // بعضی خروجی‌ها lng/lat جابه‌جا دارند (ایران: lat≈۲۵–۴۰ ، lng≈۴۴–۶۳)
  if (Math.abs(lat) > 42 && Math.abs(lat) <= 180 && Math.abs(lng) <= 42) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function calculateTrackMileage(messages, tourStart, tourEnd) {
  const startT = parseTime(tourStart);
  const endT = parseTime(tourEnd);
  if (!startT || !endT) return null;

  const points = [];
  for (const msg of messages || []) {
    if (!Array.isArray(msg) || !msg[0]) continue;
    const ts = parseTime(msg[0]);
    if (!ts || ts < startT || ts > endT) continue;
    const ll = normalizeMsgLatLng(msg[3], msg[4]);
    if (!ll) continue;
    points.push({ ts, lat: ll.lat, lng: ll.lng, speed: safeFloat(msg[5], 0) || 0 });
  }
  if (points.length < 2) return null;

  points.sort((a, b) => a.ts - b.ts);
  let total = 0;
  let usedSegments = 0;
  const MAX_IMPLIED_KMH = 160;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const dtSec = (cur.ts - prev.ts) / 1000;
    if (dtSec <= 0) continue;

    const dist = haversineKm(prev.lat, prev.lng, cur.lat, cur.lng);
    if (!(dist > 0)) continue;

    // نویز GPS هنگام توقف
    if (prev.speed <= 2 && cur.speed <= 2 && dist < 0.15) continue;

    const impliedKmh = (dist / dtSec) * 3600;
    // پرش غیرواقعی (تلپورت) — نه گپ زمانی به‌تنهایی
    if (impliedKmh > MAX_IMPLIED_KMH) continue;

    // دریفت طولانی توقف (مثلاً ۸ ساعت و ۲ کیلومتر نویز)
    if (prev.speed <= 2 && cur.speed <= 2 && impliedKmh < 3 && dist < 5) continue;

    total += dist;
    usedSegments += 1;
  }
  if (usedSegments < 1 || total <= 0) return null;
  return Math.round(total * 10) / 10;
}

function extractFuelTotal(params) {
  if (!params || typeof params !== 'object') return null;
  for (const key of ['total_fuel', 'can_total_fuel', 'fuel_total']) {
    const v = safeFloat(params[key]);
    if (v != null && v >= 0) return Math.round(v * 100) / 100;
  }
  return null;
}

function extractFuelRemainLiters(params) {
  if (!params || typeof params !== 'object') return null;
  for (const key of ['fuel_liters', 'can_fuel', 'fuel_level_l', 'remaining_fuel']) {
    const v = safeFloat(params[key]);
    if (v != null && v > 100 && v <= 2000) return Math.round(v * 10) / 10;
  }
  return null;
}

function extractMessageParams(msg) {
  if (!Array.isArray(msg)) return {};
  for (let i = msg.length - 1; i >= 6; i--) {
    if (msg[i] && typeof msg[i] === 'object' && !Array.isArray(msg[i])) return msg[i];
  }
  return {};
}

const FUEL_STOP_KMH = Number(process.env.GPS_FUEL_STOP_KMH || 5);
const FUEL_MIN_LITERS = Number(process.env.GPS_FUEL_EVENT_MIN_LITERS || 30);
const FUEL_MIN_PERCENT = Number(process.env.GPS_FUEL_EVENT_MIN_PERCENT || 6);
const FUEL_GAP_MS = 30 * 60 * 1000;

/**
 * پر/خالی شدن ناگهانی باک در توقف (سرعت ≈ ۰) بیش از ۳۰ لیتر
 * kind: refuel | drain — نامزد سوختگیری / تخلیه مشکوک (نه حکم قطعی)
 */
function detectFuelAnomalies(messages, tourStart, tourEnd) {
  const startT = parseTime(tourStart);
  const endT = parseTime(tourEnd);
  if (!startT || !endT) return [];

  const series = [];
  for (const msg of messages || []) {
    if (!Array.isArray(msg) || !msg[0]) continue;
    const ts = parseTime(msg[0]);
    if (!ts || ts < startT || ts > endT) continue;
    const params = extractMessageParams(msg);
    const tankPct = extractTankLevel(params);
    const fuelRemainL = extractFuelRemainLiters(params);
    if (tankPct == null && fuelRemainL == null) continue;
    const ll = normalizeMsgLatLng(msg[3], msg[4]);
    series.push({
      ts,
      speed: safeFloat(msg[5], 0) || 0,
      tankPct,
      fuelRemainL,
      lat: ll?.lat ?? null,
      lng: ll?.lng ?? null,
    });
  }
  series.sort((a, b) => a.ts - b.ts);
  if (series.length < 2) return [];

  const events = [];
  let stretch = [];

  const flushStretch = () => {
    if (stretch.length < 2) {
      stretch = [];
      return;
    }
    let anchor = stretch[0];
    for (let i = 1; i < stretch.length; i++) {
      const p = stretch[i];
      if (p.ts - stretch[i - 1].ts > FUEL_GAP_MS) {
        anchor = p;
        continue;
      }
      const dL =
        p.fuelRemainL != null && anchor.fuelRemainL != null
          ? Math.round((p.fuelRemainL - anchor.fuelRemainL) * 10) / 10
          : null;
      const dPct =
        p.tankPct != null && anchor.tankPct != null
          ? Math.round((p.tankPct - anchor.tankPct) * 10) / 10
          : null;
      const hitLiters = dL != null && Math.abs(dL) >= FUEL_MIN_LITERS;
      const hitPercent = dL == null && dPct != null && Math.abs(dPct) >= FUEL_MIN_PERCENT;
      if (!hitLiters && !hitPercent) continue;
      const signed = dL != null ? dL : dPct;
      const minutes = Math.max((p.ts - anchor.ts) / 60000, 0.1);
      events.push({
        kind: signed > 0 ? 'refuel' : 'drain',
        labelFa: signed > 0 ? 'سوختگیری محتمل' : 'تخلیه مشکوک',
        liters: dL != null ? Math.abs(dL) : null,
        deltaPercent: dPct != null ? Math.abs(dPct) : null,
        fromLiters: anchor.fuelRemainL ?? null,
        toLiters: p.fuelRemainL ?? null,
        tankPctFrom: anchor.tankPct,
        tankPctTo: p.tankPct,
        speedKmh: Math.max(anchor.speed, p.speed),
        durationMin: Math.round(minutes * 10) / 10,
        startIso: anchor.ts.toISOString(),
        atIso: p.ts.toISOString(),
        lat: p.lat,
        lng: p.lng,
      });
      anchor = p;
    }
    stretch = [];
  };

  for (const p of series) {
    if (p.speed <= FUEL_STOP_KMH) {
      stretch.push(p);
    } else {
      flushStretch();
    }
  }
  flushStretch();
  return events;
}

function extractTankLevel(params) {
  if (!params || typeof params !== 'object') return null;
  for (const key of ['can_fls', 'fls', 'fuel_level']) {
    const v = safeFloat(params[key]);
    if (v != null && v >= 0 && v <= 100) return Math.round(v * 10) / 10;
  }
  return null;
}

function normalizeTemperature(value) {
  const v = safeFloat(value);
  if (v == null) return { value: null, source: null };
  if (v >= 60 && v <= 120) return { value: Math.round(v * 10) / 10, source: 'c' };
  if (v >= 140 && v <= 260) {
    return { value: Math.round((((v - 32) / 1.8) * 10)) / 10, source: 'f_to_c' };
  }
  return { value: null, source: 'out_of_range' };
}

function extractEngineTemp(params) {
  if (!params || typeof params !== 'object') return { value: null, source: null };
  for (const key of ['eng_temp', 'engine_temp', 'can_eng_temp']) {
    const out = normalizeTemperature(params[key]);
    if (out.value != null) return out;
  }
  return { value: null, source: null };
}

function extractAirTemp(params) {
  if (!params || typeof params !== 'object') return { value: null, source: null };
  for (const key of ['air_temp', 'ambient_temp', 'outside_temp']) {
    const out = normalizeTemperature(params[key]);
    if (out.value != null) return out;
  }
  return { value: null, source: null };
}

function isHub(zoneName) {
  const name = String(zoneName || '').toLowerCase();
  return HUB_KEYWORDS.some((h) => name.includes(h.toLowerCase()));
}

function isBaseComplex(zoneName) {
  const name = String(zoneName || '').toLowerCase();
  return BASE_COMPLEX_KEYWORDS.some((h) => name.includes(h.toLowerCase()));
}

function cleanZoneName(desc) {
  let name = String(desc || '');
  for (const bad of ['ورود به (', 'ورود (', 'خروج از (', 'خروج (', 'ورود به ', 'خروج از ', '(', ')']) {
    name = name.split(bad).join('');
  }
  return name.trim();
}

function parseTime(t) {
  if (!t) return null;
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t;
  const s = String(t).trim();
  if (!s) return null;
  // اگر zone دارد (Z یا +03:30) همان را بگیر
  const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  // King GPS زمان بدون zone را UTC می‌فرستد (نه تهران)
  const d = new Date(hasTz ? normalized : `${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeDelta(start, end, maxOk = 500000) {
  if (start == null || end == null) return null;
  const d = end - start;
  if (d < 0 || d > maxOk) return null;
  return Math.round(d * 10) / 10;
}

function parseZoneEvents(eventsRaw) {
  const zoneEvents = [];
  if (!Array.isArray(eventsRaw)) return zoneEvents;
  for (const e of eventsRaw) {
    if (!Array.isArray(e) || e.length < 5) continue;
    const typ = String(e[0] || '').toLowerCase();
    const desc = String(e[1] || '');
    let eventType = null;
    if (typ.includes('zone_in') || desc.includes('ورود')) eventType = 'ورود';
    else if (typ.includes('zone_out') || desc.includes('خروج')) eventType = 'خروج';
    else continue;
    const zoneName = cleanZoneName(desc);
    let odo = null;
    let odoSrc = null;
    let odoCan = null;
    if (e.length > 10 && e[10] && typeof e[10] === 'object') {
      const ex = extractOdometer(e[10]);
      odo = ex.value;
      odoSrc = ex.source;
      odoCan = extractOdometerCan(e[10]);
    }
    zoneEvents.push({
      type: eventType,
      zone: zoneName,
      time: e[4],
      odometer: odo != null ? Math.round(odo * 10) / 10 : null,
      odometerSource: odoSrc,
      odometerCan: odoCan != null ? Math.round(odoCan * 10) / 10 : null,
      isHub: isHub(zoneName),
      isBase: isBaseComplex(zoneName),
    });
  }
  zoneEvents.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return cleanZoneNoise(zoneEvents);
}

function parseRawEvents(eventsRaw) {
  const events = [];
  for (const e of eventsRaw || []) {
    if (!Array.isArray(e) || e.length < 5) continue;
    const params = e.length > 10 && e[10] && typeof e[10] === 'object' ? e[10] : {};
    const odo = extractOdometer(params);
    const engTemp = extractEngineTemp(params);
    const airTemp = extractAirTemp(params);
    events.push({
      rawType: String(e[0] || '').toLowerCase(),
      desc: String(e[1] || ''),
      imei: e[2] || null,
      name: e[3] || null,
      time: e[4] || null,
      lat: safeFloat(e[5]),
      lng: safeFloat(e[6]),
      alt: safeFloat(e[7]),
      angle: safeFloat(e[8]),
      speed: safeFloat(e[9], 0) || 0,
      params,
      zone: cleanZoneName(e[1]),
      odometer: odo.value != null ? Math.round(odo.value * 10) / 10 : null,
      odometerSource: odo.source,
      odometerCan: extractOdometerCan(params),
      fuelTotal: extractFuelTotal(params),
      tankLevel: extractTankLevel(params),
      engineTemp: engTemp.value,
      engineTempSource: engTemp.source,
      airTemp: airTemp.value,
      airTempSource: airTemp.source,
      isZoneIn: String(e[0] || '').toLowerCase().includes('zone_in') || String(e[1] || '').includes('ورود'),
      isZoneOut: String(e[0] || '').toLowerCase().includes('zone_out') || String(e[1] || '').includes('خروج'),
      isOverspeed: String(e[0] || '').toLowerCase().includes('overspeed'),
      isStopped: String(e[0] || '').toLowerCase().includes('stopped'),
      isHub: isHub(cleanZoneName(e[1])),
      isBase: isBaseComplex(cleanZoneName(e[1])),
    });
  }
  events.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return events;
}

function cleanZoneNoise(events) {
  if (!events.length) return [];
  const compact = [];
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    let j = i + 1;
    while (j < events.length && events[j].zone === ev.zone && events[j].type === ev.type) j += 1;
    compact.push(ev.type === 'ورود' ? events[i] : events[j - 1]);
    i = j;
  }
  const final = [];
  i = 0;
  while (i < compact.length) {
    const ev = compact[i];
    if (ev.type === 'ورود') {
      const zone = ev.zone;
      const firstIn = ev;
      let lastOut = null;
      let k = i + 1;
      while (k < compact.length && compact[k].zone === zone) {
        if (compact[k].type === 'خروج') lastOut = compact[k];
        k += 1;
      }
      final.push(firstIn);
      if (lastOut) {
        final.push(lastOut);
        i = k;
      } else i += 1;
    } else {
      final.push(ev);
      i += 1;
    }
  }
  return final;
}

function calculateDrivingTime(messages, tourStart, tourEnd) {
  const sorted = [];
  for (const msg of messages || []) {
    if (!Array.isArray(msg) || msg.length < 6) continue;
    const ts = parseTime(msg[0]);
    if (!ts || ts < tourStart || ts > tourEnd) continue;
    sorted.push([ts, safeFloat(msg[5], 0) || 0]);
  }
  if (sorted.length < 2) return 0;
  sorted.sort((a, b) => a[0] - b[0]);
  let drivingSeconds = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const [t0, s0] = sorted[i];
    const [t1, s1] = sorted[i + 1];
    const interval = (t1 - t0) / 1000;
    if (interval <= 0) continue;
    if (s0 > 5 || s1 > 5) drivingSeconds += interval <= 300 ? interval : interval * 0.5;
  }
  return Math.round((drivingSeconds / 3600) * 100) / 100;
}

function countOverspeed(messages) {
  const events = [];
  let current = null;
  for (const msg of messages || []) {
    if (!Array.isArray(msg) || msg.length < 6) continue;
    const ts = parseTime(msg[0]);
    if (!ts) continue;
    const speed = safeFloat(msg[5], 0) || 0;
    if (speed > OVERSPEED_LIMIT) {
      if (!current) {
        current = { startTime: ts, maxSpeed: speed, points: [[ts, speed]] };
      } else {
        current.maxSpeed = Math.max(current.maxSpeed, speed);
        current.points.push([ts, speed]);
      }
    } else if (current) {
      const duration = (current.points[current.points.length - 1][0] - current.points[0][0]) / 1000;
      if (duration >= OVERSPEED_DURATION_SECONDS) {
        events.push({
          startTime: current.points[0][0].toISOString(),
          endTime: current.points[current.points.length - 1][0].toISOString(),
          maxSpeed: current.maxSpeed,
          durationSec: Math.round(duration),
        });
      }
      current = null;
    }
  }
  if (current) {
    const duration = (current.points[current.points.length - 1][0] - current.points[0][0]) / 1000;
    if (duration >= OVERSPEED_DURATION_SECONDS) {
      events.push({
        startTime: current.points[0][0].toISOString(),
        endTime: current.points[current.points.length - 1][0].toISOString(),
        maxSpeed: current.maxSpeed,
        durationSec: Math.round(duration),
      });
    }
  }
  return {
    totalEvents: events.length,
    maxSpeed: events.reduce((m, e) => Math.max(m, e.maxSpeed), 0),
    details: events,
  };
}

function detectRawStops(messages, tourStart, tourEnd) {
  const points = [];
  for (const msg of messages || []) {
    if (!Array.isArray(msg) || msg.length < 6) continue;
    const ts = parseTime(msg[0]);
    if (!ts || ts < tourStart || ts > tourEnd) continue;
    points.push([ts, safeFloat(msg[5], 0) || 0]);
  }
  points.sort((a, b) => a[0] - b[0]);
  const stops = [];
  let i = 0;
  while (i < points.length) {
    if (points[i][1] > STOP_SPEED_MAX) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < points.length && points[j][1] <= STOP_SPEED_MAX) j += 1;
    const startTs = points[i][0];
    const endTs = points[j - 1][0];
    if ((endTs - startTs) / 60000 >= MIN_STOP_MINUTES) {
      stops.push({ start: startTs, end: endTs });
    }
    i = Math.max(j, i + 1);
  }
  return stops;
}

function tehranParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => {
    const v = parts.find((p) => p.type === type)?.value;
    return v != null ? Number(v) : 0;
  };
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** لحظه‌ای که در تهران برابر Y-M-D HH:MM:SS است */
function tehranLocalToUtc(year, month, day, hour, minute, second = 0) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TEHRAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const parts = dtf.formatToParts(new Date(guess));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    let ph = get('hour');
    if (ph === 24) ph = 0;
    const shown = Date.UTC(get('year'), get('month') - 1, get('day'), ph, get('minute'), get('second'));
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = wanted - shown;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

function addTehranDays(year, month, day, deltaDays) {
  const base = tehranLocalToUtc(year, month, day, 12, 0, 0);
  const shifted = new Date(base.getTime() + deltaDays * 86400000);
  const p = tehranParts(shifted);
  return { year: p.year, month: p.month, day: p.day };
}

function isTehranLegalSleepInstant(date) {
  const p = tehranParts(date);
  const mins = p.hour * 60 + p.minute;
  return mins >= LEGAL_SLEEP_START_MIN || mins < LEGAL_SLEEP_END_MIN;
}

/** مرز بعدی مهم در ساعت تهران: 05:30 یا 23:30 */
function nextTehranSleepBoundary(fromDate) {
  const p = tehranParts(fromDate);
  const mins = p.hour * 60 + p.minute + p.second / 60;
  const candidates = [];
  if (mins < LEGAL_SLEEP_END_MIN) {
    candidates.push(tehranLocalToUtc(p.year, p.month, p.day, 5, 30, 0));
  }
  if (mins < LEGAL_SLEEP_START_MIN) {
    candidates.push(tehranLocalToUtc(p.year, p.month, p.day, 23, 30, 0));
  }
  const tomorrow = addTehranDays(p.year, p.month, p.day, 1);
  candidates.push(tehranLocalToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 5, 30, 0));
  candidates.push(tehranLocalToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 23, 30, 0));
  const fromMs = fromDate.getTime();
  const next = candidates
    .map((d) => d.getTime())
    .filter((ms) => ms > fromMs)
    .sort((a, b) => a - b)[0];
  return next != null ? new Date(next) : new Date(fromMs + 3600000);
}

function legalSleepOverlapMs(stopStart, stopEnd) {
  const startMs = stopStart instanceof Date ? stopStart.getTime() : Number(stopStart);
  const endMs = stopEnd instanceof Date ? stopEnd.getTime() : Number(stopEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  let legal = 0;
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 5000) {
    guard += 1;
    const boundary = nextTehranSleepBoundary(new Date(cursor)).getTime();
    const next = Math.min(endMs, boundary);
    if (next <= cursor) break;
    const mid = new Date(cursor + (next - cursor) / 2);
    if (isTehranLegalSleepInstant(mid)) legal += next - cursor;
    cursor = next;
  }
  return legal;
}

/**
 * توقف کل / قانونی (۲۳:۳۰–۰۵:۳۰ تهران) / بین راهی
 */
function splitStopHoursByLegalSleep(stops) {
  let totalMs = 0;
  let legalMs = 0;
  for (const st of stops || []) {
    const start = st.start instanceof Date ? st.start : new Date(st.start);
    const end = st.end instanceof Date ? st.end : new Date(st.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    const dur = end.getTime() - start.getTime();
    totalMs += dur;
    legalMs += legalSleepOverlapMs(start, end);
  }
  const enRouteMs = Math.max(0, totalMs - legalMs);
  return {
    stopTotalHours: Math.round((totalMs / 3600000) * 100) / 100,
    stopLegalHours: Math.round((legalMs / 3600000) * 100) / 100,
    stopEnRouteHours: Math.round((enRouteMs / 3600000) * 100) / 100,
  };
}

function roundHours(ms) {
  return Math.round((ms / 3600000) * 100) / 100;
}

function formatTehranJalaliLabel(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = Number(get('year'));
    const mo = Number(get('month'));
    const da = Number(get('day'));
    const { gregorianToJalali } = require('../utils/jalali');
    const [jy, jm, jd] = gregorianToJalali(y, mo, da);
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return date.toISOString();
  }
}

/** بازه‌های خواب قانونی داخل [start,end] با شروع/پایان */
function extractLegalSleepSegments(stopStart, stopEnd) {
  const startMs = stopStart instanceof Date ? stopStart.getTime() : Number(stopStart);
  const endMs = stopEnd instanceof Date ? stopEnd.getTime() : Number(stopEnd);
  const out = [];
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return out;
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 5000) {
    guard += 1;
    const boundary = nextTehranSleepBoundary(new Date(cursor)).getTime();
    const next = Math.min(endMs, boundary);
    if (next <= cursor) break;
    const mid = new Date(cursor + (next - cursor) / 2);
    if (isTehranLegalSleepInstant(mid)) {
      const s = new Date(cursor);
      const e = new Date(next);
      out.push({
        start: s.toISOString(),
        end: e.toISOString(),
        startJalali: formatTehranJalaliLabel(s),
        endJalali: formatTehranJalaliLabel(e),
        hours: roundHours(next - cursor),
      });
    }
    cursor = next;
  }
  return out;
}

function subtractTimeRanges(start, end, cutters) {
  let segments = [{ start, end }];
  for (const c of cutters || []) {
    const c0 = c.start.getTime();
    const c1 = c.end.getTime();
    const next = [];
    for (const seg of segments) {
      const s0 = seg.start.getTime();
      const s1 = seg.end.getTime();
      if (c1 <= s0 || c0 >= s1) {
        next.push(seg);
        continue;
      }
      if (c0 > s0) next.push({ start: new Date(s0), end: new Date(Math.min(c0, s1)) });
      if (c1 < s1) next.push({ start: new Date(Math.max(c1, s0)), end: new Date(s1) });
    }
    segments = next.filter((s) => s.end > s.start);
  }
  return segments;
}

/**
 * تفکیک توقف:
 * - تخلیه: از ورود/خروج حصار (unloadDetails)
 * - قانونی: خواب ۲۳:۳۰–۰۵:۳۰ تهران (از نقاط سرعت؛ ممکن است داخل حصار باشد)
 * - بین راهی: توقف سرعتی خارج از حصار تخلیه و خارج از ساعت خواب
 */
function buildStopBreakdown(rawStops, unloadDetails) {
  const unloadStops = [];
  const unloadCutters = [];
  let stopUnloadHours = 0;
  let legalInsideUnloadHours = 0;

  for (const u of unloadDetails || []) {
    const from = parseTime(u.from);
    const to = parseTime(u.to);
    if (!from || !to || to <= from) continue;
    const hours =
      u.hours != null && Number.isFinite(Number(u.hours))
        ? Math.round(Number(u.hours) * 100) / 100
        : roundHours(to - from);
    const legalSegs = extractLegalSleepSegments(from, to);
    const legalHours = Math.round(legalSegs.reduce((s, x) => s + x.hours, 0) * 100) / 100;
    legalInsideUnloadHours += legalHours;
    stopUnloadHours += hours;
    unloadCutters.push({ start: from, end: to, zone: u.zone });
    unloadStops.push({
      zone: u.zone || '—',
      from: from.toISOString(),
      to: to.toISOString(),
      fromJalali: formatTehranJalaliLabel(from),
      toJalali: formatTehranJalaliLabel(to),
      hours,
      legalHours,
      legalIntervals: legalSegs.map((x) => ({ ...x, insideZone: u.zone || null })),
    });
  }
  stopUnloadHours = Math.round(stopUnloadHours * 100) / 100;
  legalInsideUnloadHours = Math.round(legalInsideUnloadHours * 100) / 100;

  let totalSpeedMs = 0;
  let legalOutsideMs = 0;
  let enRouteMs = 0;
  const legalIntervals = [];

  for (const st of rawStops || []) {
    const start = st.start instanceof Date ? st.start : new Date(st.start);
    const end = st.end instanceof Date ? st.end : new Date(st.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    totalSpeedMs += end.getTime() - start.getTime();
    const remainders = subtractTimeRanges(start, end, unloadCutters);
    for (const seg of remainders) {
      const legalSegs = extractLegalSleepSegments(seg.start, seg.end);
      let legalMs = 0;
      for (const ls of legalSegs) {
        legalMs += new Date(ls.end).getTime() - new Date(ls.start).getTime();
        legalIntervals.push({ ...ls, insideZone: null });
      }
      legalOutsideMs += legalMs;
      enRouteMs += Math.max(0, seg.end.getTime() - seg.start.getTime() - legalMs);
    }
  }

  // بازه‌های قانونی داخل حصار تخلیه — برای نمایش شروع/پایان
  for (const u of unloadStops) {
    for (const ls of u.legalIntervals || []) {
      legalIntervals.push(ls);
    }
  }
  legalIntervals.sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const stopLegalOutsideHours = roundHours(legalOutsideMs);
  const stopLegalHours = Math.round((stopLegalOutsideHours + legalInsideUnloadHours) * 100) / 100;
  const stopEnRouteHours = roundHours(enRouteMs);
  const stopTotalHours = roundHours(totalSpeedMs);

  return {
    stopTotalHours,
    stopUnloadHours,
    stopLegalHours,
    stopLegalOutsideUnloadHours: stopLegalOutsideHours,
    stopLegalInsideUnloadHours: legalInsideUnloadHours,
    stopEnRouteHours,
    unloadStops,
    legalIntervals,
  };
}

function finalizeTour(current, messages) {
  const startT = parseTime(current.startTime);
  const endT = parseTime(current.endTime);
  const mileageGps = safeDelta(current.startOdo, current.endOdo);
  const mileageCan = safeDelta(current.startOdoCan, current.endOdoCan, 100000);

  const unloadMap = {};
  for (const u of current.unloadStations || []) {
    if (!unloadMap[u.zone]) unloadMap[u.zone] = { ...u };
    else unloadMap[u.zone].hours = Math.round((unloadMap[u.zone].hours + u.hours) * 100) / 100;
  }
  const unloadList = Object.values(unloadMap);

  let lastDestTime = null;
  let lastDestOdo = null;
  if (unloadList.length) {
    const lastName = unloadList[unloadList.length - 1].zone;
    for (let i = current.events.length - 1; i >= 0; i--) {
      const e = current.events[i];
      if (e.zone === lastName && e.type === 'ورود') {
        lastDestTime = e.time;
        lastDestOdo = e.odometer;
        break;
      }
    }
  }

  const goMileage = safeDelta(current.startOdo, lastDestOdo);
  const backMileage = safeDelta(lastDestOdo, current.endOdo);
  let totalHours = null;
  let timeToDest = null;
  let timeBack = null;
  if (startT && endT) totalHours = Math.round(((endT - startT) / 3600000) * 10) / 10;
  if (startT && lastDestTime) {
    const ld = parseTime(lastDestTime);
    if (ld) timeToDest = Math.round(((ld - startT) / 3600000) * 10) / 10;
  }
  if (lastDestTime && endT) {
    const ld = parseTime(lastDestTime);
    if (ld) timeBack = Math.round(((endT - ld) / 3600000) * 10) / 10;
  }

  const driving = startT && endT ? calculateDrivingTime(messages, startT, endT) : 0;
  const overspeed = countOverspeed(
    (messages || []).filter((msg) => {
      if (!Array.isArray(msg) || !msg[0]) return false;
      const ts = parseTime(msg[0]);
      return ts && startT && endT && ts >= startT && ts <= endT;
    })
  );
  const rawStops = startT && endT ? detectRawStops(messages, startT, endT) : [];
  const stopBreakdown = buildStopBreakdown(rawStops, unloadList);
  const stopHours = stopBreakdown.stopTotalHours;
  const mileageGpsTrack =
    startT && endT && messages?.length ? calculateTrackMileage(messages, startT, endT) : null;

  const zoneEventsInTour = (current.events || [])
    .filter((ev) => {
      const ts = parseTime(ev.time);
      return ts && startT && endT && ts >= startT && ts <= endT;
    })
    .map((ev) => ({
      type: ev.type,
      zone: ev.zone,
      time: ev.time,
      odometer: ev.odometer,
      odometerCan: ev.odometerCan,
      isHub: ev.isHub,
      isBase: ev.isBase,
    }));

  return {
    startHub: current.startZone,
    startTime: current.startTime,
    endHub: current.endZone,
    endTime: current.endTime,
    startOdo: current.startOdo ?? null,
    endOdo: current.endOdo ?? null,
    startOdoCan: current.startOdoCan ?? null,
    endOdoCan: current.endOdoCan ?? null,
    unloadStations: unloadList.map((u) => u.zone).join(' - ') || '-',
    unloadCount: unloadList.length,
    mileageGps,
    mileageCan,
    mileageGpsTrack,
    diffCanMinusGps:
      mileageCan != null && mileageGps != null ? Math.round((mileageCan - mileageGps) * 10) / 10 : null,
    mileageGo: goMileage,
    mileageBack: backMileage,
    hoursToDest: timeToDest,
    hoursBack: timeBack,
    hoursTotal: totalHours,
    drivingHours: driving,
    stopHours,
    overspeedCount: overspeed.totalEvents,
    maxSpeed: overspeed.maxSpeed,
    zoneEvents: zoneEventsInTour,
    overspeedDetails: overspeed.details,
    unloadDetails: unloadList,
  };
}

function detectTours(zoneEvents, messages) {
  if (!zoneEvents?.length) return [];
  const tours = [];
  let current = null;
  let pendingExit = null;

  const appendUnload = (bag, ev, i) => {
    let exitEv = null;
    for (let j = i + 1; j < zoneEvents.length; j++) {
      if (zoneEvents[j].zone === ev.zone && zoneEvents[j].type === 'خروج') {
        exitEv = zoneEvents[j];
        break;
      }
    }
    const t1 = parseTime(ev.time);
    if (exitEv && t1) {
      const t2 = parseTime(exitEv.time);
      if (t2) {
        const hours = (t2 - t1) / 3600000;
        if (hours >= MIN_UNLOAD_HOURS) {
          bag.unloadStations.push({
            zone: ev.zone,
            hours: Math.round(hours * 100) / 100,
            from: ev.time,
            to: exitEv.time,
          });
        }
      }
    }
  };

  const isHubFlicker = (exitBag, inEv) => {
    const exitT = parseTime(exitBag.startTime);
    const inT = parseTime(inEv.time);
    if (!exitT || !inT) return false;
    return Math.abs(inT - exitT) / 1000 <= HUB_FLICKER_SECONDS;
  };

  /** اگر خروج Hub به‌خاطر نویز از دست رفت، از آخرین خروج پایه قبل از مقصد بازیابی کن */
  const recoverFromLastBaseExit = (atIndex) => {
    for (let k = atIndex - 1; k >= 0; k--) {
      const prev = zoneEvents[k];
      if (prev.type === 'خروج' && prev.isBase) {
        const bag = {
          startZone: prev.zone,
          startTime: prev.time,
          startOdo: prev.odometer,
          startOdoSrc: prev.odometerSource,
          startOdoCan: prev.odometerCan,
          events: zoneEvents.slice(k, atIndex + 1),
          unloadStations: [],
          leftBase: true,
        };
        return bag;
      }
    }
    return null;
  };

  for (let i = 0; i < zoneEvents.length; i++) {
    const ev = zoneEvents[i];
    const isBase = ev.isBase;
    if (ev.type === 'خروج' && isBase) {
      if (!current) {
        pendingExit = {
          startZone: ev.zone,
          startTime: ev.time,
          startOdo: ev.odometer,
          startOdoSrc: ev.odometerSource,
          startOdoCan: ev.odometerCan,
          events: [ev],
          unloadStations: [],
          leftBase: false,
        };
      } else {
        current.events.push(ev);
      }
      continue;
    }
    if (current) {
      current.events.push(ev);
      if (ev.type === 'ورود' && !isBase) {
        current.leftBase = true;
        appendUnload(current, ev, i);
      }
      if (ev.type === 'ورود' && isBase) {
        if (current.leftBase) {
          // نویز: برگشت لحظه‌ای به Hub وسط تور را پایان نده
          const startT = parseTime(current.startTime);
          const inT = parseTime(ev.time);
          const fromStartSec = startT && inT ? (inT - startT) / 1000 : Infinity;
          if (fromStartSec <= HUB_FLICKER_SECONDS) {
            continue;
          }
          current.endZone = ev.zone;
          current.endTime = ev.time;
          current.endOdo = ev.odometer;
          current.endOdoSrc = ev.odometerSource;
          current.endOdoCan = ev.odometerCan;
          tours.push(finalizeTour(current, messages));
        }
        current = null;
        pendingExit = null;
      }
      continue;
    }
    if (pendingExit) {
      if (ev.type === 'ورود' && !isBase) {
        pendingExit.events.push(ev);
        pendingExit.leftBase = true;
        current = pendingExit;
        pendingExit = null;
        appendUnload(current, ev, i);
      } else if (ev.type === 'ورود' && isBase) {
        if (isHubFlicker(pendingExit, ev)) {
          // ورود فوری بعد از خروج (مثل 04:44:52 خروج+ورود) — نادیده بگیر
          continue;
        }
        pendingExit.events.push(ev);
        pendingExit = null;
      } else {
        pendingExit.events.push(ev);
      }
      continue;
    }

    // بازیابی: ورود به مقصد بدون pendingExit (به‌خاطر نویز Hub)
    if (ev.type === 'ورود' && !isBase) {
      const recovered = recoverFromLastBaseExit(i);
      if (recovered) {
        appendUnload(recovered, ev, i);
        current = recovered;
      }
    }
  }
  return tours;
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** فقط آمار رانندگی/توقف/سرعت از روی پیام‌ها — بدون recalculate کل تور */
function enrichTourDrivingStats(tour, messages) {
  const startT = parseTime(tour.startTime);
  const endT = parseTime(tour.endTime);
  if (!startT || !endT) {
    return {
      drivingHours: 0,
      stopHours: 0,
      stopTotalHours: 0,
      stopUnloadHours: 0,
      stopLegalHours: 0,
      stopEnRouteHours: 0,
      unloadStops: [],
      legalIntervals: [],
      stopBreakdown: null,
      overspeedCount: 0,
      maxSpeed: 0,
      overspeedDetails: [],
      fuelEvents: [],
    };
  }
  const inRange = (messages || []).filter((msg) => {
    if (!Array.isArray(msg) || !msg[0]) return false;
    const ts = parseTime(msg[0]);
    return ts && ts >= startT && ts <= endT;
  });
  const driving = calculateDrivingTime(messages, startT, endT);
  const overspeed = countOverspeed(inRange);
  const rawStops = detectRawStops(messages, startT, endT);
  const unloadDetails = tour.unloadDetails || tour.unload_stations_json || [];
  const breakdown = buildStopBreakdown(rawStops, unloadDetails);
  const mileageGpsTrack = calculateTrackMileage(messages, startT, endT);
  const fuelEvents = detectFuelAnomalies(messages, startT, endT);
  return {
    drivingHours: driving,
    stopHours: breakdown.stopTotalHours,
    stopTotalHours: breakdown.stopTotalHours,
    stopUnloadHours: breakdown.stopUnloadHours,
    stopLegalHours: breakdown.stopLegalHours,
    stopLegalOutsideUnloadHours: breakdown.stopLegalOutsideUnloadHours,
    stopLegalInsideUnloadHours: breakdown.stopLegalInsideUnloadHours,
    stopEnRouteHours: breakdown.stopEnRouteHours,
    unloadStops: breakdown.unloadStops,
    legalIntervals: breakdown.legalIntervals,
    stopBreakdown: breakdown,
    overspeedCount: overspeed.totalEvents,
    maxSpeed: overspeed.maxSpeed,
    overspeedDetails: overspeed.details,
    mileageGpsTrack,
    fuelEvents,
  };
}

function takeSamplePoints(messages, sampleCount = 6) {
  const valid = (messages || []).filter(
    (msg) => Array.isArray(msg) && msg[0] && Number.isFinite(safeFloat(msg[3])) && Number.isFinite(safeFloat(msg[4]))
  );
  if (!valid.length) return [];
  const idxs = new Set([0, valid.length - 1, Math.floor(valid.length * 0.25), Math.floor(valid.length * 0.5), Math.floor(valid.length * 0.75)]);
  let maxSpeedIdx = 0;
  let maxSpeed = -1;
  valid.forEach((msg, idx) => {
    const speed = safeFloat(msg[5], 0) || 0;
    if (speed > maxSpeed) {
      maxSpeed = speed;
      maxSpeedIdx = idx;
    }
  });
  idxs.add(maxSpeedIdx);
  return [...idxs]
    .sort((a, b) => a - b)
    .slice(0, sampleCount)
    .map((idx) => {
      const msg = valid[idx];
      return {
        time: msg[0],
        lat: safeFloat(msg[3]),
        lng: safeFloat(msg[4]),
        speed: safeFloat(msg[5], 0) || 0,
      };
    });
}

function summarizeEventOnlyTour(tour, rawEvents) {
  const startT = parseTime(tour.startTime);
  const endT = parseTime(tour.endTime);
  const inRange = (rawEvents || []).filter((ev) => {
    const ts = parseTime(ev.time);
    return ts && startT && endT && ts >= startT && ts <= endT;
  });
  const first = inRange[0] || null;
  const last = inRange[inRange.length - 1] || null;
  const overspeedCountEvents = inRange.filter((ev) => ev.isOverspeed).length;
  const stoppedCountEvents = inRange.filter((ev) => ev.isStopped).length;
  const fuelStart = first?.fuelTotal ?? null;
  const fuelEnd = last?.fuelTotal ?? null;
  const fuelUsed =
    fuelStart != null && fuelEnd != null && fuelEnd >= fuelStart
      ? Math.round((fuelEnd - fuelStart) * 100) / 100
      : null;
  const tankStart = first?.tankLevel ?? null;
  const tankEnd = last?.tankLevel ?? null;
  const zoneMarkers = inRange
    .filter((ev) => ev.isZoneIn || ev.isZoneOut)
    .slice(0, 8)
    .map((ev) => ({
      type: ev.rawType,
      zone: ev.zone || null,
      time: ev.time,
      tankLevel: ev.tankLevel,
      odometer: ev.odometer,
      odometerCan: ev.odometerCan,
    }));

  const rawFlags = {
    odoMismatch:
      tour.mileageCan != null &&
      tour.mileageGps != null &&
      Math.abs(Number(tour.mileageCan) - Number(tour.mileageGps)) > 200,
    mileageInvalid:
      (tour.mileageCan != null && Number(tour.mileageCan) < 0) ||
      (tour.mileageGps != null && Number(tour.mileageGps) < 0),
    refueledLikely: tankStart != null && tankEnd != null && tankEnd > tankStart + 3,
  };

  return {
    fuelStartTotal: fuelStart,
    fuelEndTotal: fuelEnd,
    fuelUsedTotal: fuelUsed,
    tankLevelStart: tankStart,
    tankLevelEnd: tankEnd,
    engineTempStart: first?.engineTemp ?? null,
    engineTempEnd: last?.engineTemp ?? null,
    engineTempStartSource: first?.engineTempSource ?? null,
    engineTempEndSource: last?.engineTempSource ?? null,
    airTempStart: first?.airTemp ?? null,
    airTempEnd: last?.airTemp ?? null,
    airTempStartSource: first?.airTempSource ?? null,
    airTempEndSource: last?.airTempSource ?? null,
    overspeedCountEvents,
    stoppedCountEvents,
    zoneMarkers,
    rawFlags,
  };
}

/**
 * خلاصه دیباگ برای UI — چرا تور ساخته شد / نشد
 */
function buildZoneDebug(eventsRaw, zoneEvents, tours) {
  const list = Array.isArray(eventsRaw) ? eventsRaw : [];
  const rawCount = list.length;
  const typeCounts = {};
  const sampleRaw = [];
  for (const e of list) {
    if (!Array.isArray(e) || e.length < 2) continue;
    const typ = String(e[0] || '');
    typeCounts[typ] = (typeCounts[typ] || 0) + 1;
    if (sampleRaw.length < 8) {
      sampleRaw.push({ type: typ, desc: String(e[1] || '').slice(0, 120), time: e[4] || null });
    }
  }

  const zoneCounts = {};
  let hubOut = 0;
  let hubIn = 0;
  let baseOut = 0;
  let baseIn = 0;
  let nonBaseIn = 0;
  for (const ev of zoneEvents || []) {
    const key = `${ev.type}|${ev.zone}`;
    zoneCounts[key] = (zoneCounts[key] || 0) + 1;
    if (ev.isHub && ev.type === 'خروج') hubOut += 1;
    if (ev.isHub && ev.type === 'ورود') hubIn += 1;
    if (ev.isBase && ev.type === 'خروج') baseOut += 1;
    if (ev.isBase && ev.type === 'ورود') baseIn += 1;
    if (!ev.isBase && ev.type === 'ورود') nonBaseIn += 1;
  }

  const uniqueZones = [...new Set((zoneEvents || []).map((e) => e.zone).filter(Boolean))];
  const unmatchedZones = uniqueZones.filter((z) => !isHub(z) && !isBaseComplex(z));
  const hubLikeZones = uniqueZones.filter((z) => isHub(z) || isBaseComplex(z));

  let hint = null;
  if (rawCount === 0) {
    hint = 'هیچ رویدادی از King GPS در این بازه برنگشت (IMEI یا بازه را چک کنید).';
  } else if (!(zoneEvents || []).length) {
    hint =
      'رویداد خام هست ولی ورود/خروج حصار parse نشد — نام type/desc با zone_in/ورود یا zone_out/خروج جور نیست.';
  } else if (baseOut === 0) {
    hint =
      'خروج از Hub/مجتمع پایه دیده نشد. نام حصارها با کلمات کلیدی (انبار مرکزی، شهر لبنیات، …) مطابقت ندارد یا در بازه خروج ثبت نشده.';
  } else if ((tours || []).length === 0 && baseOut > 0 && nonBaseIn === 0) {
    hint =
      'خروج از Hub هست ولی ورود به مقصد غیرپایه دیده نشد — تور ناقص (فقط جابه‌جایی داخل مجتمع؟).';
  } else if ((tours || []).length === 0 && baseOut > 0) {
    hint =
      'خروج از Hub و حرکت به مقصد دیده شد ولی برگشت ورود به Hub در همین بازه کامل نشده — بازه را بلندتر کنید.';
  }

  return {
    rawEventCount: rawCount,
    zoneEventCount: (zoneEvents || []).length,
    tourCount: (tours || []).length,
    eventTypeCounts: typeCounts,
    baseOutCount: baseOut,
    baseInCount: baseIn,
    hubOutCount: hubOut,
    hubInCount: hubIn,
    nonBaseInCount: nonBaseIn,
    uniqueZones: uniqueZones.slice(0, 40),
    hubLikeZones,
    unmatchedZones: unmatchedZones.slice(0, 30),
    sampleRaw,
    sampleZones: (zoneEvents || []).slice(0, 25).map((ev) => ({
      type: ev.type,
      zone: ev.zone,
      time: ev.time,
      isHub: ev.isHub,
      isBase: ev.isBase,
      odo: ev.odometer,
      odoCan: ev.odometerCan,
    })),
    hint,
  };
}

module.exports = {
  parseZoneEvents,
  parseRawEvents,
  detectTours,
  intervalsOverlap,
  parseTime,
  buildZoneDebug,
  enrichTourDrivingStats,
  summarizeEventOnlyTour,
  takeSamplePoints,
  splitStopHoursByLegalSleep,
  buildStopBreakdown,
  calculateTrackMileage,
  detectFuelAnomalies,
  extractOdometer,
  extractOdometerCan,
  extractOdometerGpsLike,
  extractFuelTotal,
  extractTankLevel,
  extractEngineTemp,
  extractAirTemp,
  odometerSourceLabel,
  safeFloat,
  ioToKm,
  HUB_KEYWORDS,
  BASE_COMPLEX_KEYWORDS,
  ODO_PRIORITY,
};
