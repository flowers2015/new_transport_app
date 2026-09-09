const pool = require('../../db');
const { classifyRouteDistanceBucket } = require('../dispatch/dispatchRouteRules');
const { lookupActiveRouteForCity } = require('../dispatch/multiDestinationAssignments');
const { extractAnnouncementCities, loadGeoCatalog } = require('./baleRegionBans');
const { getActivePref, getActivePrefsForDrivers, formatPrefSummary } = require('./baleNextLoadPrefs');

const DIST_LABELS = { near: 'نزدیک', far: 'دور', veryFar: 'خیلی‌دور' };
const LINE_LABELS = { ice: 'بستنی', dairy: 'پاستوریزه' };
const QUEUE_TYPE_LABELS = { far: 'نوبت مسیر دور', near: 'نوبت مسیر نزدیک' };

const CATEGORY_ALIASES = {
  تریلی: ['تریلی', 'trailer'],
  'مینی تریلی': ['مینی تریلی', 'mini-trailer'],
  'ده چرخ': ['ده چرخ', 'ten-wheel'],
};

function categoryNames(category) {
  return CATEGORY_ALIASES[category] || [category];
}

function lineLabel(lineType) {
  const t = String(lineType || '');
  if (/بستنی|ice/i.test(t.replace(/[\s_\-‌]/g, ''))) return 'بستنی';
  if (/پاستوریزه|dairy|pasteur/i.test(t.replace(/[\s_\-‌]/g, ''))) return 'پاستوریزه';
  return t || null;
}

function mapPrefForApi(pref) {
  if (!pref) {
    return {
      present: false,
      followTurn: false,
      rejectLine: null,
      rejectLineLabel: null,
      rejectDistance: null,
      rejectDistanceLabel: null,
      rejectProvinces: [],
      preferProvinces: [],
      summary: 'ترجیحی برای اعلام بار بعدی ثبت نشده',
      completedAt: null,
      expiresAt: null,
    };
  }
  return {
    present: true,
    followTurn: Boolean(pref.followTurn),
    rejectLine: pref.rejectLine || null,
    rejectLineLabel: pref.rejectLine ? LINE_LABELS[pref.rejectLine] || pref.rejectLine : null,
    rejectDistance: pref.rejectDistance || null,
    rejectDistanceLabel: pref.rejectDistance
      ? DIST_LABELS[pref.rejectDistance] || pref.rejectDistance
      : null,
    rejectProvinces: pref.rejectProvinces || [],
    preferProvinces: pref.preferProvinces || [],
    summary: formatPrefSummary(pref),
    completedAt: pref.completedAt || null,
    expiresAt: pref.expiresAt || null,
  };
}

async function loadDestinations(announcementId) {
  if (!announcementId) return [];
  try {
    const destRes = await pool.query(
      `
        SELECT city, sort_order, created_at
        FROM freight_destinations
        WHERE freight_announcement_id = $1
        ORDER BY sort_order ASC NULLS LAST, created_at ASC
      `,
      [announcementId]
    );
    return destRes.rows;
  } catch {
    const destRes = await pool.query(
      `
        SELECT city, created_at
        FROM freight_destinations
        WHERE freight_announcement_id = $1
        ORDER BY created_at ASC
      `,
      [announcementId]
    );
    return destRes.rows;
  }
}

async function enrichLastAnnouncement(row) {
  if (!row?.freight_announcement_id) return null;
  const destRows = await loadDestinations(row.freight_announcement_id);
  const destinationCities = destRows.map(d => String(d.city || '').trim()).filter(Boolean);
  const destinationCity = destinationCities[destinationCities.length - 1] || null;
  const route = destinationCity ? await lookupActiveRouteForCity(pool, destinationCity) : null;
  const distanceKey = classifyRouteDistanceBucket(route || {});
  const safeDistance =
    distanceKey === 'near' || distanceKey === 'far' || distanceKey === 'veryFar' ? distanceKey : null;
  return {
    found: true,
    announcementId: row.freight_announcement_id,
    announcementCode: row.announcement_code || null,
    lineType: row.line_type || null,
    lineLabel: lineLabel(row.line_type),
    brand: row.brand || null,
    originCity: row.origin_city || null,
    destinationCity,
    destinationCities,
    distanceKey: safeDistance,
    distanceLabel: safeDistance ? DIST_LABELS[safeDistance] : null,
    assignedAt: row.created_at || null,
    routeText: [row.origin_city || '—', destinationCities.join('، ') || '—']
      .filter(Boolean)
      .join(' → '),
  };
}

async function getLastAnnouncementForDriver(driverId) {
  if (!driverId) return null;
  const { rows } = await pool.query(
    `
      SELECT
        da.created_at,
        da.freight_announcement_id,
        fa.origin_city,
        fa.line_type,
        fa.announcement_code,
        fa.brand
      FROM dispatch_assignments da
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      WHERE da.driver_id = $1
        AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
        AND da.freight_announcement_id IS NOT NULL
      ORDER BY da.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [driverId]
  );
  return enrichLastAnnouncement(rows[0]);
}

async function getLastAnnouncementsForDrivers(driverIds) {
  const ids = [...new Set((driverIds || []).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;
  const { rows } = await pool.query(
    `
      SELECT DISTINCT ON (da.driver_id)
        da.driver_id,
        da.created_at,
        da.freight_announcement_id,
        fa.origin_city,
        fa.line_type,
        fa.announcement_code,
        fa.brand
      FROM dispatch_assignments da
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      WHERE da.driver_id = ANY($1::varchar[])
        AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
        AND da.freight_announcement_id IS NOT NULL
      ORDER BY da.driver_id, da.created_at DESC NULLS LAST
    `,
    [ids]
  );
  for (const row of rows) {
    map[row.driver_id] = await enrichLastAnnouncement(row);
  }
  return map;
}

function lastAnnouncementProvinces(last, cityToProvince) {
  const cities = extractAnnouncementCities({
    originCity: last.originCity,
    destinationCities: (last.destinationCities || []).join('-'),
    destination: { city: last.destinationCity },
  });
  const set = new Set();
  for (const city of cities) {
    const province = cityToProvince[city];
    if (province) set.add(province);
  }
  return [...set];
}

function lastLineKey(lineType) {
  const t = String(lineType || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-‌]/g, '')
    .toLowerCase();
  if (t.includes('بستنی') || t.includes('ice')) return 'ice';
  if (t.includes('پاستوریزه') || t.includes('dairy') || t.includes('pasteur')) return 'dairy';
  return null;
}

function compareLastToPref(last, pref, cityToProvince) {
  if (!last) {
    return { notes: ['آخرین اعلام بار تخصیص‌شده پیدا نشد.'] };
  }
  const notes = [];
  notes.push(
    `آخرین مسیر: ${last.routeText}${last.distanceLabel ? ` (${last.distanceLabel})` : ''}${
      last.lineLabel ? ` — ${last.lineLabel}` : ''
    }`
  );
  if (!pref || pref.followTurn) {
    notes.push('ترجیح فعلی: طبق نوبت / فیلتر نگفته.');
    return { lastBrokeRejects: [], lastMatchedPrefer: false, notes };
  }
  const broken = [];
  if (pref.rejectLine && lastLineKey(last.lineType) === pref.rejectLine) broken.push('line');
  if (pref.rejectDistance && last.distanceKey && last.distanceKey === pref.rejectDistance) {
    broken.push('distance');
  }
  const provinces = lastAnnouncementProvinces(last, cityToProvince);
  if (pref.rejectProvinces?.length && provinces.some(p => pref.rejectProvinces.includes(p))) {
    broken.push('province');
  }
  if (!broken.length) {
    notes.push('آخرین مسیر با ردهای فعلی جور است (همان فیلتر را نشکسته).');
  } else {
    const labels = {
      line: `لاین ${LINE_LABELS[pref.rejectLine] || pref.rejectLine}`,
      distance: DIST_LABELS[pref.rejectDistance] || pref.rejectDistance,
      province: `استان ${(pref.rejectProvinces || []).join('، ')}`,
    };
    notes.push(`آخرین مسیر با این ردها جور نبود: ${broken.map(k => labels[k] || k).join(' · ')}`);
  }
  const matchedPrefer = Boolean(
    pref.preferProvinces?.length && provinces.some(p => pref.preferProvinces.includes(p))
  );
  if (pref.preferProvinces?.length) {
    notes.push(
      matchedPrefer
        ? `آخرین مسیر در استان ترجیحی بود: ${pref.preferProvinces.join('، ')}`
        : `آخرین مسیر در استان ترجیحی (${pref.preferProvinces.join('، ')}) نبود.`
    );
  }
  return { lastBrokeRejects: broken, lastMatchedPrefer: matchedPrefer, notes };
}

async function getDriverInsight(driverId) {
  const { rows } = await pool.query(
    `
      SELECT id, name, employee_id, mobile
      FROM drivers
      WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)
    `,
    [driverId]
  );
  const driver = rows[0];
  if (!driver) return null;
  const [pref, lastAnnouncement, geo] = await Promise.all([
    getActivePref(driverId),
    getLastAnnouncementForDriver(driverId),
    loadGeoCatalog(),
  ]);
  return {
    driver: {
      id: driver.id,
      name: driver.name,
      employeeId: driver.employee_id,
      mobile: driver.mobile,
    },
    lastAnnouncement,
    prefs: mapPrefForApi(pref),
    comparison: compareLastToPref(lastAnnouncement, pref, geo.cityToProvince || {}),
  };
}

function sortQueue(entries) {
  return [...entries].sort(
    (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
  );
}

async function getCategoryQueueInsight(category) {
  if (!category || !CATEGORY_ALIASES[category]) {
    const err = new Error('دسته نامعتبر است.');
    err.statusCode = 400;
    throw err;
  }
  const names = categoryNames(category);
  const { rows } = await pool.query(
    `
      SELECT
        q.id,
        q.driver_id,
        q.queue_type,
        q.position,
        q.notes,
        v.vehicle_code,
        d.name AS driver_name,
        d.employee_id
      FROM dispatch_queue_entries q
      LEFT JOIN vehicles v ON v.id = q.vehicle_id
      LEFT JOIN drivers d ON d.id = q.driver_id
      WHERE q.queue_type IN ('far', 'near')
        AND q.vehicle_category = ANY($1::varchar[])
      ORDER BY q.queue_type, q.position, q.created_at
    `,
    [names]
  );
  const driverIds = rows.map(r => r.driver_id).filter(Boolean);
  const [prefMap, lastMap] = await Promise.all([
    getActivePrefsForDrivers(driverIds),
    getLastAnnouncementsForDrivers(driverIds),
  ]);
  const mapped = rows.map(row => {
    const pref = prefMap[row.driver_id] || null;
    const last = lastMap[row.driver_id] || null;
    return {
      id: row.id,
      position: row.position,
      queueType: row.queue_type,
      queueTypeLabel: QUEUE_TYPE_LABELS[row.queue_type] || row.queue_type,
      notes: row.notes,
      vehicleCode: row.vehicle_code || null,
      driverId: row.driver_id,
      driverName: row.driver_name || '—',
      employeeId: row.employee_id || null,
      lastAnnouncement: last,
      prefs: mapPrefForApi(pref),
    };
  });
  return {
    category,
    far: sortQueue(mapped.filter(e => e.queueType === 'far')),
    near: sortQueue(mapped.filter(e => e.queueType === 'near')),
  };
}

module.exports = {
  getDriverInsight,
  getCategoryQueueInsight,
  mapPrefForApi,
};
