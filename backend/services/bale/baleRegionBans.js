const crypto = require('crypto');
const pool = require('../../db');
const { timestampToJalaliDate } = require('../../utils/jalali');

let tableReady = false;
let geoCache = { at: 0, provinces: [], citiesByProvince: {}, cityToProvince: {} };

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function normalizePlace(value) {
  return String(value || '')
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');
}

function toStoredJalali(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.includes('T')) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : timestampToJalaliDate(d) || '';
  }
  return raw.replace(/-/g, '/');
}

function jalaliKey(value) {
  const m = String(value || '')
    .replace(/-/g, '/')
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}${pad2(Number(m[2]))}${pad2(Number(m[3]))}`;
}

function isBanActiveOn(ban, jalaliDate) {
  const today = jalaliKey(jalaliDate);
  const start = jalaliKey(ban.startDate || ban.start_date);
  const end = jalaliKey(ban.endDate || ban.end_date);
  return Boolean(today && start && end && today >= start && today <= end);
}

async function ensureRegionBanTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bale_driver_region_bans (
      id VARCHAR(255) PRIMARY KEY,
      driver_id VARCHAR(255) NOT NULL,
      forbidden_provinces JSONB NOT NULL DEFAULT '[]',
      exception_cities JSONB NOT NULL DEFAULT '[]',
      start_date VARCHAR(16) NOT NULL,
      end_date VARCHAR(16) NOT NULL,
      created_by_user_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_bale_region_bans_driver ON bale_driver_region_bans (driver_id)`
  );
  tableReady = true;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value.map(normalizePlace).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(normalizePlace).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapBanRow(row) {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name || null,
    employeeId: row.employee_id || null,
    forbiddenProvinces: parseJsonList(row.forbidden_provinces),
    exceptionCities: parseJsonList(row.exception_cities),
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

async function listRegionBans() {
  await ensureRegionBanTable();
  const { rows } = await pool.query(
    `
      SELECT
        b.id,
        b.driver_id,
        d.name AS driver_name,
        d.employee_id,
        b.forbidden_provinces,
        b.exception_cities,
        b.start_date,
        b.end_date,
        b.created_at
      FROM bale_driver_region_bans b
      LEFT JOIN drivers d ON d.id = b.driver_id
      ORDER BY b.created_at DESC
    `
  );
  return rows.map(mapBanRow);
}

async function createRegionBan({
  driverId,
  forbiddenProvinces,
  exceptionCities,
  startDate,
  endDate,
  userId,
}) {
  await ensureRegionBanTable();
  const provinces = parseJsonList(forbiddenProvinces);
  const cities = parseJsonList(exceptionCities);
  const start = toStoredJalali(startDate);
  const end = toStoredJalali(endDate);
  if (!driverId) throw new Error('راننده را انتخاب کنید.');
  if (!provinces.length) throw new Error('حداقل یک استان غیرمجاز انتخاب کنید.');
  if (!jalaliKey(start) || !jalaliKey(end)) throw new Error('بازه زمانی شمسی معتبر نیست.');
  if (jalaliKey(start) > jalaliKey(end)) throw new Error('تاریخ شروع نباید بعد از پایان باشد.');

  const id = crypto.randomUUID();
  await pool.query(
    `
      INSERT INTO bale_driver_region_bans
        (id, driver_id, forbidden_provinces, exception_cities, start_date, end_date, created_by_user_id)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
    `,
    [id, driverId, JSON.stringify(provinces), JSON.stringify(cities), start, end, userId || null]
  );
  const { rows } = await pool.query(
    `
      SELECT
        b.id, b.driver_id, d.name AS driver_name, d.employee_id,
        b.forbidden_provinces, b.exception_cities, b.start_date, b.end_date, b.created_at
      FROM bale_driver_region_bans b
      LEFT JOIN drivers d ON d.id = b.driver_id
      WHERE b.id = $1
    `,
    [id]
  );
  return mapBanRow(rows[0]);
}

async function deleteRegionBan(id) {
  await ensureRegionBanTable();
  const result = await pool.query(`DELETE FROM bale_driver_region_bans WHERE id = $1`, [id]);
  return (result.rowCount || 0) > 0;
}

async function loadGeoCatalog() {
  if (geoCache.at && Date.now() - geoCache.at < 5 * 60 * 1000) return geoCache;
  const citiesByProvince = {};
  const cityToProvince = {};
  try {
    const { rows } = await pool.query(
      `
        SELECT DISTINCT TRIM(province) AS province, TRIM(city) AS city
        FROM dispatch_routes
        WHERE is_active = TRUE
          AND province IS NOT NULL AND TRIM(province) <> ''
          AND city IS NOT NULL AND TRIM(city) <> ''
      `
    );
    for (const row of rows) {
      const province = normalizePlace(row.province);
      const city = normalizePlace(row.city);
      if (!province || !city) continue;
      if (!citiesByProvince[province]) citiesByProvince[province] = [];
      if (!citiesByProvince[province].includes(city)) citiesByProvince[province].push(city);
      if (!cityToProvince[city]) cityToProvince[city] = province;
    }
  } catch (err) {
    console.warn('⚠️ [bale] region geo from dispatch_routes:', err.message);
  }
  const provinces = Object.keys(citiesByProvince).sort((a, b) => a.localeCompare(b, 'fa'));
  for (const province of provinces) {
    citiesByProvince[province].sort((a, b) => a.localeCompare(b, 'fa'));
  }
  geoCache = { at: Date.now(), provinces, citiesByProvince, cityToProvince };
  return geoCache;
}

async function getActiveBansForDriver(driverId) {
  if (!driverId) return [];
  await ensureRegionBanTable();
  const today = timestampToJalaliDate(new Date());
  const { rows } = await pool.query(
    `
      SELECT forbidden_provinces, exception_cities, start_date, end_date
      FROM bale_driver_region_bans
      WHERE driver_id = $1
    `,
    [driverId]
  );
  return rows.map(mapBanRow).filter(ban => isBanActiveOn(ban, today));
}

function extractAnnouncementCities(ann) {
  const cities = [];
  const joined = String(ann?.destinationCities || ann?.destination_cities || '');
  if (joined) {
    cities.push(...joined.split(/\s*و\s*|[,،]/));
  }
  const list = ann?.allDestinations || ann?.destinations || [];
  for (const dest of list) {
    if (dest?.city) cities.push(dest.city);
  }
  if (ann?.destination?.city) cities.push(ann.destination.city);
  if (ann?.destinationCity) cities.push(ann.destinationCity);
  if (ann?.destination_city) cities.push(ann.destination_city);
  return [...new Set(cities.map(normalizePlace).filter(Boolean))];
}

function announcementBlockedByBans(ann, bans, cityToProvince) {
  if (!bans?.length) return false;
  const cities = extractAnnouncementCities(ann);
  if (!cities.length) return false;
  return cities.some(city => {
    return bans.some(ban => {
      const exceptions = new Set((ban.exceptionCities || []).map(normalizePlace));
      if (exceptions.has(city)) return false;
      const province = cityToProvince[city];
      if (!province) return false;
      const forbidden = new Set((ban.forbiddenProvinces || []).map(normalizePlace));
      return forbidden.has(province);
    });
  });
}

async function filterAnnouncementsByRegionBans(announcements, driverId) {
  const list = announcements || [];
  if (!list.length || !driverId) return list;
  const [bans, geo] = await Promise.all([getActiveBansForDriver(driverId), loadGeoCatalog()]);
  if (!bans.length) return list;
  return list.filter(ann => !announcementBlockedByBans(ann, bans, geo.cityToProvince));
}

async function assertAnnouncementAllowedForDriver(driverId, announcement) {
  const kept = await filterAnnouncementsByRegionBans([announcement], driverId);
  if (!kept.length) {
    throw new Error('این بار به‌خاطر محدودیت استان/شهر برای این راننده مجاز نیست.');
  }
}

module.exports = {
  normalizePlace,
  listRegionBans,
  createRegionBan,
  deleteRegionBan,
  loadGeoCatalog,
  filterAnnouncementsByRegionBans,
  assertAnnouncementAllowedForDriver,
};
