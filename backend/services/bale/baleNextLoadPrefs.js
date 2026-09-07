const crypto = require('crypto');
const pool = require('../../db');
const { classifyRouteDistanceBucket } = require('../dispatch/dispatchRouteRules');
const { loadGeoCatalog, extractAnnouncementCities } = require('./baleRegionBans');
const { pickMaxRemainingKm } = require('./baleDecision');
const { formatAnnouncementRowMarkdown, mdBold } = require('./baleFormat');

const MAX_REJECT_PROVINCES = 2;
const MAX_PREFER_PROVINCES = 3;
const LINE_LABELS = { ice: 'بستنی', dairy: 'پاستوریزه' };
const DIST_LABELS = { near: 'نزدیک', far: 'دور', veryFar: 'خیلی‌دور' };

let tableReady = false;

async function ensureTables() {
  if (tableReady) return;
  await require('../../migrations/create_bale_next_load_prefs')();
  tableReady = true;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeLineKey(lineType) {
  const t = String(lineType || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-‌]/g, '')
    .toLowerCase();
  if (!t) return 'other';
  if (t.includes('بستنی') || t.includes('ice')) return 'ice';
  if (t.includes('پاستوریزه') || t.includes('dairy') || t.includes('pasteur')) return 'dairy';
  return 'other';
}

function announcementDistanceKey(ann) {
  const bucket = classifyRouteDistanceBucket(ann?.route || ann || {});
  return bucket === 'near' || bucket === 'far' || bucket === 'veryFar' ? bucket : null;
}

function announcementProvinceSet(ann, cityToProvince) {
  const cities = extractAnnouncementCities(ann);
  const set = new Set();
  for (const city of cities) {
    const province = cityToProvince[city];
    if (province) set.add(province);
  }
  return set;
}

function tehranDayEnd(from = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return new Date(`${y}-${m}-${d}T23:59:59.999+03:30`);
}

function emptyDraft() {
  return {
    rejectLine: null,
    rejectDistance: null,
    rejectProvinces: [],
    preferProvinces: [],
  };
}

function mapPrefRow(row) {
  if (!row) return null;
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) return null;
  if (!row.completed_at) return null;
  return {
    driverId: row.driver_id,
    followTurn: Boolean(row.follow_turn),
    rejectLine: row.reject_line || null,
    rejectDistance: row.reject_distance || null,
    rejectProvinces: parseJsonList(row.reject_provinces),
    preferProvinces: parseJsonList(row.prefer_provinces),
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}

async function getActivePref(driverId) {
  if (!driverId) return null;
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM bale_next_load_prefs WHERE driver_id = $1`,
    [driverId]
  );
  return mapPrefRow(rows[0]);
}

async function getActivePrefsForDrivers(driverIds) {
  const ids = [...new Set((driverIds || []).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM bale_next_load_prefs WHERE driver_id = ANY($1::varchar[])`,
    [ids]
  );
  for (const row of rows) {
    const pref = mapPrefRow(row);
    if (pref) map[pref.driverId] = pref;
  }
  return map;
}

function formatPrefSummary(pref, options = {}) {
  const forDriver = options.audience === 'driver';
  if (!pref) return null;
  if (pref.followTurn) {
    return forDriver ? 'طبق نوبت — فیلتری نگفتی' : 'طبق نوبت — فیلتر نگفته';
  }
  const wont = [];
  if (pref.rejectLine && LINE_LABELS[pref.rejectLine]) {
    wont.push(`لاین ${LINE_LABELS[pref.rejectLine]}`);
  }
  if (pref.rejectDistance && DIST_LABELS[pref.rejectDistance]) {
    wont.push(DIST_LABELS[pref.rejectDistance]);
  }
  if (pref.rejectProvinces.length) {
    wont.push(`استان ${pref.rejectProvinces.join('، ')}`);
  }
  const willLabel = forDriver ? 'می‌روی' : 'می‌رود';
  const noLabel = forDriver ? 'نمی‌روی' : 'نمی‌رود';
  const will = pref.preferProvinces.length
    ? `${forDriver ? '✅ ' : ''}${willLabel}: ${pref.preferProvinces.join('، ')}`
    : '';
  const no = wont.length
    ? `${forDriver ? '❌ ' : ''}${noLabel}: ${wont.join(' · ')}`
    : '';
  return [no, will].filter(Boolean).join('\n') || (forDriver ? 'طبق نوبت — فیلتری نگفتی' : 'طبق نوبت — فیلتر نگفته');
}

function prefHasFilters(pref) {
  if (!pref || pref.followTurn) return false;
  return Boolean(
    pref.rejectLine ||
      pref.rejectDistance ||
      (pref.rejectProvinces && pref.rejectProvinces.length) ||
      (pref.preferProvinces && pref.preferProvinces.length)
  );
}

function followTurnMaxKmText() {
  return `${mdBold('طبق نوبت')} بیشترین کیلومتر باقی‌مانده داده شد.`;
}

function honorsReject(ann, pref, cityToProvince) {
  if (!pref || pref.followTurn) return { ok: true, broken: [] };
  const broken = [];
  if (pref.rejectLine && normalizeLineKey(ann.lineType) === pref.rejectLine) {
    broken.push('line');
  }
  const dist = announcementDistanceKey(ann);
  if (pref.rejectDistance && dist && dist === pref.rejectDistance) {
    broken.push('distance');
  }
  if (pref.rejectProvinces.length) {
    const provinces = announcementProvinceSet(ann, cityToProvince);
    const rejected = new Set(pref.rejectProvinces);
    if ([...provinces].some(p => rejected.has(p))) broken.push('province');
  }
  return { ok: broken.length === 0, broken };
}

function matchesPreferProvince(ann, pref, cityToProvince) {
  if (!pref?.preferProvinces?.length) return false;
  const provinces = announcementProvinceSet(ann, cityToProvince);
  return pref.preferProvinces.some(p => provinces.has(p));
}

function applyRejectFilter(list, pref, cityToProvince, kinds) {
  return list.filter(ann => {
    const { broken } = honorsReject(ann, pref, cityToProvince);
    return !broken.some(k => kinds.includes(k));
  });
}

async function pickWithNextLoadPrefs(eligible, pref) {
  const list = eligible || [];
  if (!list.length) {
    return { announcement: null, reasonCode: 'empty', reasonText: null, summary: formatPrefSummary(pref) };
  }

  if (!prefHasFilters(pref)) {
    return {
      announcement: pickMaxRemainingKm(list),
      reasonCode: 'follow_turn',
      reasonText: followTurnMaxKmText(),
      summary: formatPrefSummary(pref),
    };
  }

  const geo = await loadGeoCatalog();
  const cityToProvince = geo.cityToProvince || {};
  const rejectKinds = [];
  if (pref.rejectLine) rejectKinds.push('line');
  if (pref.rejectDistance) rejectKinds.push('distance');
  if (pref.rejectProvinces.length) rejectKinds.push('province');

  const honored = rejectKinds.length
    ? applyRejectFilter(list, pref, cityToProvince, rejectKinds)
    : list;

  if (honored.length === 0) {
    return {
      announcement: pickMaxRemainingKm(list),
      reasonCode: 'rejects_relaxed',
      reasonText:
        `${mdBold('در این نوبت اعلام بار')} خواسته‌های ثبت‌شده شما را نمی‌شد رعایت کرد.\n` +
        followTurnMaxKmText(),
      summary: formatPrefSummary(pref),
    };
  }

  const preferred = honored.filter(ann => matchesPreferProvince(ann, pref, cityToProvince));
  const usedPrefer = preferred.length > 0;
  const chosenFrom = usedPrefer ? preferred : honored;
  const announcement = pickMaxRemainingKm(chosenFrom);
  const review = formatPrefSummary(pref, { audience: 'driver' });

  let reasonText = `${mdBold('خواستهٔ ثبت‌شده شما')}\n${review}\n\n${mdBold('طبق همین خواسته')} این بار انتخاب شد.`;
  let reasonCode = usedPrefer ? 'prefer_matched' : 'rejects_ok';
  if (!usedPrefer && pref.preferProvinces.length) {
    reasonCode = 'prefer_unavailable';
    reasonText =
      `${mdBold('خواستهٔ ثبت‌شده شما')}\n${review}\n\n` +
      `${mdBold('طبق نوبت')} بیشترین کیلومتر بین بارهای مجاز داده شد.`;
  }

  return {
    announcement,
    reasonCode,
    reasonText,
    summary: formatPrefSummary(pref),
    usedPrefer,
  };
}

function buildAutoAssignPvText(pick, announcement) {
  const loadBlock = announcement
    ? `${mdBold('این بار انتخاب شد')}\n${formatAnnouncementRowMarkdown(null, announcement)}`
    : '';
  return [`🤖 ${mdBold('تخصیص خودکار')}`, pick.reasonText, loadBlock]
    .filter(Boolean)
    .join('\n\n');
}

async function saveCompletedPref(driverId, payload) {
  await ensureTables();
  const followTurn = Boolean(payload.followTurn);
  const rejectLine = followTurn ? null : payload.rejectLine || null;
  const rejectDistance = followTurn ? null : payload.rejectDistance || null;
  let rejectProvinces = followTurn
    ? []
    : [...new Set(payload.rejectProvinces || [])].slice(0, MAX_REJECT_PROVINCES);
  let preferProvinces = followTurn
    ? []
    : [...new Set(payload.preferProvinces || [])].slice(0, MAX_PREFER_PROVINCES);
  const rejectSet = new Set(rejectProvinces);
  preferProvinces = preferProvinces.filter(p => !rejectSet.has(p));
  const expiresAt = tehranDayEnd();
  await pool.query(
    `INSERT INTO bale_next_load_prefs (
       driver_id, follow_turn, reject_line, reject_distance, reject_provinces, prefer_provinces,
       completed_at, expires_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb, NOW(), $7, NOW())
     ON CONFLICT (driver_id) DO UPDATE SET
       follow_turn = EXCLUDED.follow_turn,
       reject_line = EXCLUDED.reject_line,
       reject_distance = EXCLUDED.reject_distance,
       reject_provinces = EXCLUDED.reject_provinces,
       prefer_provinces = EXCLUDED.prefer_provinces,
       completed_at = NOW(),
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [
      driverId,
      followTurn,
      rejectLine,
      rejectDistance,
      JSON.stringify(rejectProvinces),
      JSON.stringify(preferProvinces),
      expiresAt,
    ]
  );
}

function newSurveyId() {
  return crypto.randomBytes(4).toString('hex');
}

async function createSurvey(driverId, chatId) {
  await ensureTables();
  await pool.query(`DELETE FROM bale_next_load_surveys WHERE driver_id = $1`, [driverId]);
  const id = newSurveyId();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await pool.query(
    `INSERT INTO bale_next_load_surveys (id, driver_id, chat_id, step, draft, expires_at)
     VALUES ($1,$2,$3,'intro',$4::jsonb,$5)`,
    [id, driverId, chatId, JSON.stringify(emptyDraft()), expiresAt]
  );
  return loadSurvey(id);
}

async function loadSurvey(id) {
  if (!id) return null;
  await ensureTables();
  const { rows } = await pool.query(`SELECT * FROM bale_next_load_surveys WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`DELETE FROM bale_next_load_surveys WHERE id = $1`, [id]);
    return null;
  }
  return {
    id: row.id,
    driverId: row.driver_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    step: row.step,
    draft: { ...emptyDraft(), ...(row.draft || {}) },
    expiresAt: row.expires_at,
  };
}

async function updateSurvey(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  if (fields.step != null) {
    sets.push(`step = $${i++}`);
    values.push(fields.step);
  }
  if (fields.draft != null) {
    sets.push(`draft = $${i++}::jsonb`);
    values.push(JSON.stringify(fields.draft));
  }
  if (fields.messageId != null) {
    sets.push(`message_id = $${i++}`);
    values.push(fields.messageId);
  }
  if (!sets.length) return loadSurvey(id);
  values.push(id);
  await pool.query(
    `UPDATE bale_next_load_surveys SET ${sets.join(', ')} WHERE id = $${i}`,
    values
  );
  return loadSurvey(id);
}

async function deleteSurvey(id) {
  await pool.query(`DELETE FROM bale_next_load_surveys WHERE id = $1`, [id]);
}

module.exports = {
  MAX_REJECT_PROVINCES,
  MAX_PREFER_PROVINCES,
  LINE_LABELS,
  DIST_LABELS,
  ensureTables,
  getActivePref,
  getActivePrefsForDrivers,
  formatPrefSummary,
  pickWithNextLoadPrefs,
  buildAutoAssignPvText,
  saveCompletedPref,
  createSurvey,
  loadSurvey,
  updateSurvey,
  deleteSurvey,
  emptyDraft,
};
