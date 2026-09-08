const crypto = require('crypto');
const jalaali = require('jalaali-js');
const pool = require('../../db');
const { timestampToJalaliDate, validateJalaliDateString } = require('../../utils/jalali');

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
    .replace(/\u200c/g, '')
    .replace(/^شهر\s+/, '')
    .replace(/\s+/g, ' ');
}

function normalizeProvinceName(value) {
  return normalizePlace(value).replace(/\s+/g, '');
}

function toEnglishDigits(value) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(value || '')
    .trim()
    .replace(/[۰-۹٠-٩]/g, ch => {
      const p = persian.indexOf(ch);
      if (p >= 0) return String(p);
      const a = arabic.indexOf(ch);
      return a >= 0 ? String(a) : ch;
    });
}

function toStoredJalali(value) {
  const raw = toEnglishDigits(value).replace(/-/g, '/');
  if (!raw) return '';
  const jalaliYear = /^(\d{4})\//.exec(raw);
  if (jalaliYear) {
    const year = Number(jalaliYear[1]);
    if (year >= 1200 && year <= 1600) return raw;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) || String(value || '').includes('T')) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : timestampToJalaliDate(d) || '';
  }
  return raw;
}

function jalaliKey(value) {
  const m = String(value || '')
    .replace(/-/g, '/')
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}${pad2(Number(m[2]))}${pad2(Number(m[3]))}`;
}

function tehranJalaliToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const gy = Number(parts.find(p => p.type === 'year')?.value);
  const gm = Number(parts.find(p => p.type === 'month')?.value);
  const gd = Number(parts.find(p => p.type === 'day')?.value);
  if (!gy || !gm || !gd) return timestampToJalaliDate(date);
  const j = jalaali.toJalaali(gy, gm, gd);
  return `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
}

function announcementJalaliDates(ann) {
  const out = [];
  const push = value => {
    const key = jalaliKey(toStoredJalali(value) || value);
    if (key) out.push(key);
  };
  push(ann?.loadingDate || ann?.loading_date);
  push(ann?.deliveryDate || ann?.delivery_date);
  for (const d of ann?.deliveryDates || []) push(d);
  for (const dest of ann?.allDestinations || ann?.destinations || []) {
    push(dest?.delivery_date || dest?.deliveryDate);
  }
  return out;
}

function banCoversAnnouncement(ban, todayJalali, ann) {
  const start = jalaliKey(ban.startDate || ban.start_date);
  const end = jalaliKey(ban.endDate || ban.end_date);
  const today = jalaliKey(todayJalali);
  if (!start || !end || !today) return false;
  if (today > end) return false;
  if (today >= start && today <= end) return true;
  return announcementJalaliDates(ann).some(d => d >= start && d <= end);
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
  await pool.query(
    `ALTER TABLE bale_driver_region_bans ADD COLUMN IF NOT EXISTS hold_reason TEXT`
  );
  await pool.query(
    `ALTER TABLE bale_driver_region_bans ADD COLUMN IF NOT EXISTS title VARCHAR(120)`
  );
  await pool.query(
    `ALTER TABLE bale_driver_region_bans ADD COLUMN IF NOT EXISTS template_id VARCHAR(255)`
  );
  await pool.query(
    `ALTER TABLE bale_driver_region_bans ADD COLUMN IF NOT EXISTS cash_fine NUMERIC(14,0)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bale_region_ban_templates (
      id VARCHAR(255) PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      forbidden_provinces JSONB NOT NULL DEFAULT '[]',
      exception_cities JSONB NOT NULL DEFAULT '[]',
      start_date VARCHAR(16) NOT NULL,
      end_date VARCHAR(16) NOT NULL,
      hold_reason TEXT,
      created_by_user_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tableReady = true;
}

function normalizeTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeCashFine(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error('جریمه نقدی نامعتبر است.');
  return Math.round(n);
}

function normalizeHoldReason(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 400);
}

const BAN_LIST_SELECT = `
  b.id,
  b.driver_id,
  d.name AS driver_name,
  d.employee_id,
  b.forbidden_provinces,
  b.exception_cities,
  b.start_date,
  b.end_date,
  b.hold_reason,
  b.title,
  b.template_id,
  b.cash_fine,
  b.created_at
`;

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
    holdReason: row.hold_reason || '',
    title: row.title || '',
    templateId: row.template_id || null,
    cashFine: row.cash_fine != null && row.cash_fine !== '' ? Number(row.cash_fine) : null,
    createdAt: row.created_at,
    appliedAtJalali: timestampToJalaliDate(row.created_at) || '',
  };
}

function mapTemplateRow(row) {
  return {
    id: row.id,
    title: row.title || '',
    forbiddenProvinces: parseJsonList(row.forbidden_provinces),
    exceptionCities: parseJsonList(row.exception_cities),
    startDate: row.start_date,
    endDate: row.end_date,
    holdReason: row.hold_reason || '',
    createdAt: row.created_at,
    createdAtJalali: timestampToJalaliDate(row.created_at) || '',
  };
}

function validateTemplateFields({ forbiddenProvinces, exceptionCities, holdReason, title }) {
  const provinces = parseJsonList(forbiddenProvinces);
  const cities = parseJsonList(exceptionCities);
  const reason = normalizeHoldReason(holdReason);
  const name = normalizeTitle(title);
  if (!name) throw new Error('عنوان اعمال محدودیت را وارد کنید.');
  if (!provinces.length) throw new Error('حداقل یک استان غیرمجاز انتخاب کنید.');
  if (!reason) throw new Error('توضیحات را وارد کنید.');
  return { provinces, cities, reason, title: name };
}

function validateDriverDateRange(startDate, endDate) {
  const startRaw = toStoredJalali(startDate) || toEnglishDigits(startDate).replace(/-/g, '/');
  const endRaw = toStoredJalali(endDate) || toEnglishDigits(endDate).replace(/-/g, '/');
  const startCheck = validateJalaliDateString(startRaw);
  if (!startCheck.ok) {
    throw new Error(`تاریخ شروع معتبر نیست. ${startCheck.message}`);
  }
  const endCheck = validateJalaliDateString(endRaw);
  if (!endCheck.ok) {
    throw new Error(`تاریخ پایان معتبر نیست. ${endCheck.message}`);
  }
  const start = startCheck.normalized;
  const end = endCheck.normalized;
  if (jalaliKey(start) > jalaliKey(end)) {
    throw new Error('تاریخ شروع نباید بعد از پایان باشد.');
  }
  return { start, end };
}

async function listRegionBans() {
  await ensureRegionBanTable();
  const { rows } = await pool.query(
    `
      SELECT ${BAN_LIST_SELECT}
      FROM bale_driver_region_bans b
      LEFT JOIN drivers d ON d.id = b.driver_id
      ORDER BY b.created_at DESC
    `
  );
  return rows.map(mapBanRow);
}

async function resolveBanSource(input) {
  const dates = validateDriverDateRange(input.startDate, input.endDate);
  if (input.templateId) {
    const template = await fetchTemplateById(input.templateId);
    if (!template) throw new Error('اعمال محدودیت انتخاب‌شده پیدا نشد.');
    return {
      ...validateTemplateFields(template),
      ...dates,
      templateId: template.id,
    };
  }
  return {
    ...validateTemplateFields(input),
    ...dates,
    templateId: null,
  };
}

async function createRegionBan({
  driverId,
  templateId,
  title,
  forbiddenProvinces,
  exceptionCities,
  startDate,
  endDate,
  holdReason,
  cashFine,
  userId,
}) {
  await ensureRegionBanTable();
  if (!driverId) throw new Error('راننده را انتخاب کنید.');
  const source = await resolveBanSource({
    templateId,
    title,
    forbiddenProvinces,
    exceptionCities,
    startDate,
    endDate,
    holdReason,
  });
  const fine = normalizeCashFine(cashFine);

  const id = crypto.randomUUID();
  await pool.query(
    `
      INSERT INTO bale_driver_region_bans
        (id, driver_id, forbidden_provinces, exception_cities, start_date, end_date, hold_reason, title, template_id, cash_fine, created_by_user_id)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      id,
      driverId,
      JSON.stringify(source.provinces),
      JSON.stringify(source.cities),
      source.start,
      source.end,
      source.reason,
      source.title,
      source.templateId,
      fine,
      userId || null,
    ]
  );
  return fetchBanById(id);
}

async function fetchBanById(id) {
  const { rows } = await pool.query(
    `
      SELECT ${BAN_LIST_SELECT}
      FROM bale_driver_region_bans b
      LEFT JOIN drivers d ON d.id = b.driver_id
      WHERE b.id = $1
    `,
    [id]
  );
  return rows[0] ? mapBanRow(rows[0]) : null;
}

async function updateRegionBan(id, {
  driverId,
  templateId,
  title,
  forbiddenProvinces,
  exceptionCities,
  startDate,
  endDate,
  holdReason,
  cashFine,
}) {
  await ensureRegionBanTable();
  if (!driverId) throw new Error('راننده را انتخاب کنید.');
  const source = await resolveBanSource({
    templateId,
    title,
    forbiddenProvinces,
    exceptionCities,
    startDate,
    endDate,
    holdReason,
  });
  const fine = normalizeCashFine(cashFine);

  const result = await pool.query(
    `
      UPDATE bale_driver_region_bans
      SET driver_id = $2,
          forbidden_provinces = $3::jsonb,
          exception_cities = $4::jsonb,
          start_date = $5,
          end_date = $6,
          hold_reason = $7,
          title = $8,
          template_id = $9,
          cash_fine = $10
      WHERE id = $1
    `,
    [
      id,
      driverId,
      JSON.stringify(source.provinces),
      JSON.stringify(source.cities),
      source.start,
      source.end,
      source.reason,
      source.title,
      source.templateId,
      fine,
    ]
  );
  if ((result.rowCount || 0) === 0) throw new Error('محدودیت پیدا نشد.');
  const ban = await fetchBanById(id);
  if (!ban) throw new Error('محدودیت پیدا نشد.');
  return ban;
}

async function deleteRegionBan(id) {
  await ensureRegionBanTable();
  const result = await pool.query(`DELETE FROM bale_driver_region_bans WHERE id = $1`, [id]);
  return (result.rowCount || 0) > 0;
}

async function listRegionBanTemplates() {
  await ensureRegionBanTable();
  const { rows } = await pool.query(
    `
      SELECT id, title, forbidden_provinces, exception_cities, start_date, end_date, hold_reason, created_at
      FROM bale_region_ban_templates
      ORDER BY created_at DESC
    `
  );
  return rows.map(mapTemplateRow);
}

async function fetchTemplateById(id) {
  await ensureRegionBanTable();
  const { rows } = await pool.query(
    `
      SELECT id, title, forbidden_provinces, exception_cities, start_date, end_date, hold_reason, created_at
      FROM bale_region_ban_templates
      WHERE id = $1
    `,
    [id]
  );
  return rows[0] ? mapTemplateRow(rows[0]) : null;
}

async function createRegionBanTemplate(input) {
  await ensureRegionBanTable();
  const fields = validateTemplateFields(input);
  const id = crypto.randomUUID();
  await pool.query(
    `
      INSERT INTO bale_region_ban_templates
        (id, title, forbidden_provinces, exception_cities, start_date, end_date, hold_reason, created_by_user_id)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
    `,
    [
      id,
      fields.title,
      JSON.stringify(fields.provinces),
      JSON.stringify(fields.cities),
      '',
      '',
      fields.reason,
      input.userId || null,
    ]
  );
  return fetchTemplateById(id);
}

async function updateRegionBanTemplate(id, input) {
  await ensureRegionBanTable();
  const fields = validateTemplateFields(input);
  const result = await pool.query(
    `
      UPDATE bale_region_ban_templates
      SET title = $2,
          forbidden_provinces = $3::jsonb,
          exception_cities = $4::jsonb,
          start_date = '',
          end_date = '',
          hold_reason = $5
      WHERE id = $1
    `,
    [
      id,
      fields.title,
      JSON.stringify(fields.provinces),
      JSON.stringify(fields.cities),
      fields.reason,
    ]
  );
  if ((result.rowCount || 0) === 0) throw new Error('اعمال محدودیت پیدا نشد.');
  return fetchTemplateById(id);
}

async function deleteRegionBanTemplate(id) {
  await ensureRegionBanTable();
  const result = await pool.query(`DELETE FROM bale_region_ban_templates WHERE id = $1`, [id]);
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
  const today = tehranJalaliToday();
  const { rows } = await pool.query(
    `
      SELECT forbidden_provinces, exception_cities, start_date, end_date
      FROM bale_driver_region_bans
      WHERE driver_id = $1
    `,
    [driverId]
  );
  return rows.map(mapBanRow).filter(ban => {
    const end = jalaliKey(ban.endDate);
    const todayKey = jalaliKey(today);
    return Boolean(end && todayKey && todayKey <= end);
  });
}

function isDairyLine(ann) {
  const t = String(ann?.lineType || ann?.line_type || '').toLowerCase();
  return (
    t.includes('پاستوریزه') ||
    t.includes('dairy') ||
    t.includes('pasteur') ||
    t.includes('لبن')
  );
}

function splitCityBlob(value) {
  return String(value || '')
    .split(/\s*(?:و|,|،|-|–|\/)\s*/)
    .map(normalizePlace)
    .filter(Boolean);
}

function orderedDestinationCities(ann) {
  const fromList = (ann?.allDestinations || ann?.destinations || [])
    .map(d => normalizePlace(d?.city))
    .filter(Boolean)
    .flatMap(city => (city.includes('-') || city.includes(' و ') ? splitCityBlob(city) : [city]));
  if (fromList.length) return fromList;
  const blobs = [
    ann?.destinationCities,
    ann?.destination_cities,
    ann?.destination?.city,
    ann?.destinationCity,
    ann?.destination_city,
  ];
  const cities = [];
  for (const blob of blobs) {
    cities.push(...splitCityBlob(blob));
  }
  return [...new Set(cities)];
}

function citiesToCheckForBan(ann) {
  const ordered = orderedDestinationCities(ann);
  if (!ordered.length) return [];
  if (isDairyLine(ann)) return [ordered[ordered.length - 1]];
  return [...new Set(ordered)];
}

function resolveProvince(city, cityToProvince) {
  const n = normalizePlace(city);
  if (!n || !cityToProvince) return null;
  if (cityToProvince[n]) return cityToProvince[n];
  const keys = Object.keys(cityToProvince);
  const hit = keys.find(k => k === n || n.includes(k) || k.includes(n));
  return hit ? cityToProvince[hit] : null;
}

function placeInSet(city, set) {
  const n = normalizePlace(city);
  if (!n) return false;
  if (set.has(n)) return true;
  for (const item of set) {
    if (item && (n.includes(item) || item.includes(n))) return true;
  }
  return false;
}

function provinceIsForbidden(province, forbiddenSet) {
  const n = normalizeProvinceName(province);
  if (!n) return false;
  for (const item of forbiddenSet) {
    const f = normalizeProvinceName(item);
    if (f && (n === f || n.includes(f) || f.includes(n))) return true;
  }
  return false;
}

function extractAnnouncementCities(ann) {
  return orderedDestinationCities(ann);
}

function announcementBlockedByBans(ann, bans, cityToProvince) {
  if (!bans?.length) return false;
  const cities = citiesToCheckForBan(ann);
  const routeProvince = normalizePlace(ann?.route?.province);
  const checkCities = cities.length ? cities : [];

  return bans.some(ban => {
    const exceptions = new Set((ban.exceptionCities || []).map(normalizePlace).filter(Boolean));
    const forbidden = new Set((ban.forbiddenProvinces || []).map(normalizePlace).filter(Boolean));
    if (!forbidden.size) return false;

    if (checkCities.length) {
      return checkCities.some(city => {
        if (placeInSet(city, exceptions)) return false;
        const province = resolveProvince(city, cityToProvince) || routeProvince;
        if (!province) return false;
        return provinceIsForbidden(province, forbidden);
      });
    }

    if (!routeProvince) return false;
    return provinceIsForbidden(routeProvince, forbidden);
  });
}

async function filterAnnouncementsByRegionBans(announcements, driverId) {
  const list = announcements || [];
  if (!list.length || !driverId) return list;
  const [bans, geo] = await Promise.all([getActiveBansForDriver(driverId), loadGeoCatalog()]);
  if (!bans.length) return list;
  const today = tehranJalaliToday();
  return list.filter(ann => {
    const applicable = bans.filter(ban => banCoversAnnouncement(ban, today, ann));
    if (!applicable.length) return true;
    return !announcementBlockedByBans(ann, applicable, geo.cityToProvince);
  });
}

async function assertAnnouncementAllowedForDriver(driverId, announcement) {
  const kept = await filterAnnouncementsByRegionBans([announcement], driverId);
  if (!kept.length) {
    throw new Error('این بار به‌خاطر محدودیت استان/شهر برای این راننده مجاز نیست.');
  }
}

async function listRegionBansForDriver(driverId) {
  if (!driverId) return [];
  await ensureRegionBanTable();
  const { rows } = await pool.query(
    `
      SELECT ${BAN_LIST_SELECT}
      FROM bale_driver_region_bans b
      LEFT JOIN drivers d ON d.id = b.driver_id
      WHERE b.driver_id = $1
      ORDER BY b.created_at DESC
    `,
    [driverId]
  );
  return rows.map(mapBanRow);
}

function rangesOverlapJalali(startA, endA, startB, endB) {
  const a0 = jalaliKey(startA);
  const a1 = jalaliKey(endA);
  const b0 = jalaliKey(startB);
  const b1 = jalaliKey(endB);
  if (!a0 || !a1 || !b0 || !b1) return false;
  return a0 <= b1 && a1 >= b0;
}

function summarizeRegionRestrictions(bans, fromJalali, toJalali) {
  const periods = (bans || []).map(ban => ({
    id: ban.id,
    holdReason: ban.holdReason || '',
    title: ban.title || '',
    cashFine: ban.cashFine ?? null,
    startDate: ban.startDate,
    endDate: ban.endDate,
    appliedAtJalali: ban.appliedAtJalali || '',
    forbiddenProvinces: ban.forbiddenProvinces || [],
    exceptionCities: ban.exceptionCities || [],
    inSelectedRange: rangesOverlapJalali(ban.startDate, ban.endDate, fromJalali, toJalali),
  }));
  return {
    periodCount: periods.length,
    periodsInRangeCount: periods.filter(p => p.inSelectedRange).length,
    periods,
  };
}

module.exports = {
  normalizePlace,
  listRegionBans,
  listRegionBansForDriver,
  listRegionBanTemplates,
  createRegionBanTemplate,
  updateRegionBanTemplate,
  deleteRegionBanTemplate,
  summarizeRegionRestrictions,
  createRegionBan,
  updateRegionBan,
  deleteRegionBan,
  loadGeoCatalog,
  extractAnnouncementCities,
  filterAnnouncementsByRegionBans,
  assertAnnouncementAllowedForDriver,
};
