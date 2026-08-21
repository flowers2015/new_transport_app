const pool = require('../db');
const { jalaliToGregorian, formatJalali } = require('../utils/jalali');
const { isKingGpsConfigured, getLocations, formatDt } = require('../services/kingGpsClient');
const {
  extractOdometer,
  extractFuelTotal,
  extractTankLevel,
  extractEngineTemp,
  extractAirTemp,
  odometerSourceLabel,
  safeFloat,
  parseTime,
} = require('../services/gpsTourAnalyzer');

function isGpsLiveEnabled() {
  const v = String(process.env.GPS_LIVE_ENABLED ?? process.env.GPS_FINANCE_ENABLED ?? 'true')
    .trim()
    .toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  return isKingGpsConfigured();
}

function requireGpsLive(req, res, next) {
  if (!isGpsLiveEnabled()) {
    return res.status(503).json({
      enabled: false,
      message: 'داشبورد لحظه‌ای GPS غیرفعال است. GPS_LIVE_ENABLED / KING_GPS_API_KEY را بررسی کنید.',
    });
  }
  next();
}

function parseJalaliOrIsoToDate(input, endOfDay = false) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s) || s.includes('T')) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) d.setHours(23, 59, 59, 999);
    return d;
  }
  const m = s.replace(/-/g, '/').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const [gy, gm, gd] = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
  const d = new Date(gy, gm - 1, gd, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toTehranDisplay(input) {
  const d = input instanceof Date ? input : parseTime(input);
  if (!d) return { jalali: null, time: null, iso: null };
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
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = Number(get('year'));
    const mo = Number(get('month'));
    const da = Number(get('day'));
    const [jy, jm, jd] = require('../utils/jalali').gregorianToJalali
      ? require('../utils/jalali').gregorianToJalali(y, mo, da)
      : [null, null, null];
    const jalali =
      jy != null
        ? `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
        : formatJalali(d);
    return {
      jalali,
      time: `${get('hour')}:${get('minute')}:${get('second')}`,
      iso: d.toISOString(),
    };
  } catch {
    return { jalali: null, time: null, iso: d.toISOString() };
  }
}

function normalizePlate(raw) {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();
}

function normalizeFa(s) {
  return String(s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function faNameExpr(col) {
  return `replace(replace(COALESCE(${col}, ''), 'ي', 'ی'), 'ك', 'ک')`;
}

/** نام راننده: از اعلام‌بار، و اگر خالی بود از drivers / personal_drivers */
const RESOLVED_DRIVER_NAME_SQL = `NULLIF(TRIM(COALESCE(
  NULLIF(TRIM(fa.assigned_driver_name), ''),
  d.name,
  pd.name
)), '')`;

const DRIVER_NAME_JOINS = `
    LEFT JOIN drivers d ON d.id::text = fa.assigned_driver_id::text
    LEFT JOIN personal_drivers pd ON pd.id::text = fa.assigned_driver_id::text`;

function modelCapabilities(modelName) {
  const n = String(modelName || '').toLowerCase();
  const isFmb640 = /fmb\s*640/.test(n) && !/641/.test(n);
  const isIoOdo = /fmb\s*920|fmb\s*202|fmb\s*641|fma202/.test(n);
  const isBce = /bce|fm blue/.test(n);
  return {
    modelName: modelName || null,
    hasCanLikely: isBce,
    hasIoOdoLikely: isIoOdo || isBce,
    hasNoOdoLikely: isFmb640,
    hint: isFmb640
      ? 'این دستگاه معمولاً شمارنده کیلومتر/سوخت CAN ندارد؛ کیلومتر از مسافت مسیر یا مصوب.'
      : isIoOdo
        ? 'کیلومتر اغلب از IO16؛ سوخت/موتور معمولاً ندارد.'
        : isBce
          ? 'با CAN معمولاً کیلومتر و سوخت/موتور کامل است.'
          : null,
  };
}

function mapLiveLocation(imei, loc, resource) {
  const params = loc?.params && typeof loc.params === 'object' ? loc.params : {};
  const speed = safeFloat(loc?.speed, 0) || 0;
  const odo = extractOdometer(params);
  const eng = extractEngineTemp(params);
  const air = extractAirTemp(params);
  const groupName = loc?.group_name || loc?.group || null;
  const name = loc?.name || resource?.vehicle_code || null;
  const noSignal =
    /no\s*signal/i.test(String(groupName || '')) ||
    /حذف|حذف شده|deleted/i.test(String(name || ''));

  const alerts = [];
  if (speed > 105) alerts.push({ type: 'overspeed', label: 'سرعت غیرمجاز', value: speed });
  if (noSignal) alerts.push({ type: 'no_signal', label: 'بدون سیگنال / حذف', value: groupName || name });
  const lastEvent = String(loc?.last_event_desc || loc?.last_event || '').trim();
  if (/overspeed|سرعت|توقف|ورود|خروج/i.test(lastEvent)) {
    alerts.push({ type: 'event', label: 'آخرین رویداد', value: lastEvent });
  }

  return {
    imei: String(imei),
    name: name || 'ندارد',
    groupName: groupName || 'ندارد',
    moving: speed > 5,
    statusLabel: noSignal ? 'آفلاین/بدون سیگنال' : speed > 5 ? 'در حرکت' : 'توقف',
    lastEventDesc: lastEvent || 'ندارد',
    lastEventTime: loc?.dt_server || loc?.dt_tracker || loc?.time || null,
    lastEventDisplay: toTehranDisplay(loc?.dt_server || loc?.dt_tracker || loc?.time),
    address: loc?.address || 'ندارد',
    nearestZoneName: loc?.nearest_zone_name || loc?.nearest_zone || 'ندارد',
    nearestZoneDistance:
      loc?.nearest_zone_distance != null
        ? safeFloat(loc.nearest_zone_distance)
        : loc?.nearest_zone_dist != null
          ? safeFloat(loc.nearest_zone_dist)
          : null,
    lat: safeFloat(loc?.lat ?? loc?.latitude),
    lng: safeFloat(loc?.lng ?? loc?.lon ?? loc?.longitude),
    angle: safeFloat(loc?.angle ?? loc?.course),
    altitude: safeFloat(loc?.altitude),
    speed,
    wheelSpeed: safeFloat(params.wheel_speed),
    gpslev: safeFloat(params.gpslev ?? loc?.gpslev),
    hdop: safeFloat(params.hdop ?? loc?.hdop),
    gsmlev: safeFloat(params.gsmlev ?? loc?.gsmlev),
    odometer: odo.value,
    odometerSource: odo.source,
    odometerSourceLabel: odometerSourceLabel(odo.source),
    tankLevel: extractTankLevel(params),
    fuelTotal: extractFuelTotal(params),
    fuelRate: safeFloat(params.fuel_rate),
    fuelLvl2: safeFloat(params.fuel_lvl2),
    engineTemp: eng.value,
    engineHours: safeFloat(params.engh),
    engineLoad: safeFloat(params.eng_load),
    canTaho: safeFloat(params.can_taho),
    accPedal: safeFloat(params.acc_pedal),
    axleWeight: safeFloat(params.axle_wgt),
    ignitionApprox: safeFloat(params.di1 ?? params.io239),
    airTemp: air.value,
    temp1: safeFloat(params.temp1),
    alerts,
    rawParamsKeys: Object.keys(params).slice(0, 40),
  };
}

async function resolveGpsResource(query) {
  const q = String(query || '').trim();
  if (!q) return { error: 'کد خودرو یا پلاک الزامی است.' };

  const byCode = await pool.query(
    `SELECT r.*, m.name AS gps_model_name
     FROM gps_resources r
     LEFT JOIN gps_device_models m ON m.id = r.gps_model_id
     WHERE r.is_active = TRUE AND r.vehicle_code ILIKE $1
     ORDER BY CASE WHEN r.asset_kind = 'tractor' THEN 0 ELSE 1 END
     LIMIT 8`,
    [q]
  );
  if (byCode.rows.length === 1) return { resource: byCode.rows[0] };
  if (byCode.rows.length > 1) return { multiple: byCode.rows };

  const likeCode = await pool.query(
    `SELECT r.*, m.name AS gps_model_name
     FROM gps_resources r
     LEFT JOIN gps_device_models m ON m.id = r.gps_model_id
     WHERE r.is_active = TRUE AND r.vehicle_code ILIKE $1
     ORDER BY r.vehicle_code ASC
     LIMIT 10`,
    [`%${q}%`]
  );
  if (likeCode.rows.length === 1) return { resource: likeCode.rows[0] };
  if (likeCode.rows.length > 1) return { multiple: likeCode.rows };

  const plateNorm = normalizePlate(q);
  const byPlate = await pool.query(
    `SELECT r.*, m.name AS gps_model_name
     FROM gps_resources r
     LEFT JOIN gps_device_models m ON m.id = r.gps_model_id
     WHERE r.is_active = TRUE AND r.plate_number IS NOT NULL AND r.plate_number <> ''
     ORDER BY r.vehicle_code ASC
     LIMIT 200`
  );
  const plateHits = byPlate.rows.filter((r) => normalizePlate(r.plate_number).includes(plateNorm));
  if (plateHits.length === 1) return { resource: plateHits[0] };
  if (plateHits.length > 1) return { multiple: plateHits.slice(0, 10) };

  return { error: 'منبع GPS برای این کد/پلاک پیدا نشد.' };
}

async function fetchAssignmentsForVehicle(vehicleCode, plate, fromDt, toDt) {
  const params = [];
  const ors = [];
  if (vehicleCode) {
    params.push(String(vehicleCode).trim());
    ors.push(`v.vehicle_code ILIKE $${params.length}`);
    params.push(String(vehicleCode).trim());
    ors.push(`EXISTS (
      SELECT 1 FROM driver_calculations dc2
      WHERE dc2.announcement_id = fa.id AND dc2.vehicle_code ILIKE $${params.length}
    )`);
  }
  if (plate) {
    params.push(`%${String(plate).replace(/\s+/g, '%')}%`);
    ors.push(`fa.vehicle_plate ILIKE $${params.length}`);
  }
  if (!ors.length) return [];

  let where = `(${ors.join(' OR ')})`;
  // ترجیح با تخصیص‌شده‌ها؛ ولی بدون assigned_vehicle_id هم پلاک کافی است
  if (fromDt) {
    params.push(fromDt.toISOString());
    where += ` AND COALESCE(fa.updated_at, fa.created_at) >= $${params.length}`;
  }
  if (toDt) {
    params.push(toDt.toISOString());
    where += ` AND COALESCE(fa.updated_at, fa.created_at) <= $${params.length}`;
  }

  const { rows } = await pool.query(
    `
    SELECT
      fa.id,
      fa.line_type,
      fa.status,
      fa.assignment_type,
      ${RESOLVED_DRIVER_NAME_SQL} AS assigned_driver_name,
      fa.assigned_driver_id,
      fa.vehicle_plate,
      v.vehicle_code AS v_code,
      fa.created_at,
      fa.updated_at,
      dc.id AS calculation_id,
      dc.approved_kilometers,
      dc.mileage_source,
      dc.total_kilometers,
      s.id AS snapshot_id,
      s.selected_source,
      s.selected_mileage,
      s.mileage_can,
      s.mileage_gps,
      s.mileage_gps_track,
      s.tour_start,
      s.tour_end,
      s.gps_tour_id,
      d_detail.driving_hours,
      d_detail.stop_inside_h AS stop_total_hours,
      d_detail.stop_outside_h AS stop_en_route_hours,
      d_detail.stop_legal_h AS stop_legal_hours,
      d_detail.fuel_l_per_100km,
      d_detail.max_speed,
      d_detail.overspeed_rule_count,
      t.fuel_used_total,
      t.hours_total
    FROM freight_announcements fa
    LEFT JOIN vehicles v ON v.id = fa.assigned_vehicle_id
    ${DRIVER_NAME_JOINS}
    LEFT JOIN driver_calculations dc ON dc.announcement_id = fa.id
    LEFT JOIN LATERAL (
      SELECT *
      FROM gps_tour_snapshots gs
      WHERE gs.announcement_id = fa.id
      ORDER BY gs.created_at DESC
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN gps_tours t ON t.id = s.gps_tour_id
    LEFT JOIN gps_tour_details d_detail ON d_detail.tour_id = t.id
    WHERE ${where}
    ORDER BY COALESCE(fa.updated_at, fa.created_at) DESC
    LIMIT 50
    `,
    params
  );

  return rows.map((row) => ({
    announcementId: row.id,
    lineType: row.line_type,
    status: row.status,
    assignmentType: row.assignment_type,
    driverName: row.assigned_driver_name,
    driverId: row.assigned_driver_id,
    vehiclePlate: row.vehicle_plate,
    vehicleCode: row.v_code,
    assignmentDate: row.updated_at || row.created_at,
    assignmentDisplay: toTehranDisplay(row.updated_at || row.created_at),
    finance: row.calculation_id
      ? {
          calculationId: row.calculation_id,
          approvedKilometers: row.approved_kilometers != null ? Number(row.approved_kilometers) : null,
          mileageSource: row.mileage_source || null,
          totalKilometers: row.total_kilometers != null ? Number(row.total_kilometers) : null,
        }
      : null,
    gpsTour: row.snapshot_id
      ? {
          snapshotId: row.snapshot_id,
          selectedSource: row.selected_source,
          selectedMileage: row.selected_mileage != null ? Number(row.selected_mileage) : null,
          mileageCan: row.mileage_can != null ? Number(row.mileage_can) : null,
          mileageGps: row.mileage_gps != null ? Number(row.mileage_gps) : null,
          mileageGpsTrack: row.mileage_gps_track != null ? Number(row.mileage_gps_track) : null,
          tourStart: row.tour_start,
          tourEnd: row.tour_end,
          drivingHours: row.driving_hours != null ? Number(row.driving_hours) : null,
          stopTotalHours: row.stop_total_hours != null ? Number(row.stop_total_hours) : null,
          stopEnRouteHours: row.stop_en_route_hours != null ? Number(row.stop_en_route_hours) : null,
          stopLegalHours: row.stop_legal_hours != null ? Number(row.stop_legal_hours) : null,
          fuelUsedTotal: row.fuel_used_total != null ? Number(row.fuel_used_total) : null,
          fuelLPer100Km: row.fuel_l_per_100km != null ? Number(row.fuel_l_per_100km) : null,
          maxSpeed: row.max_speed != null ? Number(row.max_speed) : null,
          overspeedRuleCount: row.overspeed_rule_count != null ? Number(row.overspeed_rule_count) : null,
          hoursTotal: row.hours_total != null ? Number(row.hours_total) : null,
        }
      : null,
  }));
}

async function searchDrivers(req, res) {
  try {
    const qRaw = String(req.query?.q || req.body?.query || '').trim();
    if (!qRaw || qRaw.length < 2) {
      return res.json({ drivers: [] });
    }
    const q = normalizeFa(qRaw);
    const like = `%${q}%`;
    const likeRaw = `%${qRaw}%`;
    const tokens = q.split(/\s+/).filter((t) => t.length >= 1).slice(0, 4);

    const safeQuery = async (sql, params) => {
      try {
        return (await pool.query(sql, params)).rows;
      } catch (e) {
        console.warn('⚠️ [gps-live] searchDrivers partial:', e.message);
        return [];
      }
    };

    const tokenAnd = (colExpr, startIdx) => {
      if (!tokens.length) return { sql: `${colExpr} ILIKE $${startIdx}`, params: [like] };
      const parts = [];
      const params = [];
      tokens.forEach((t, i) => {
        parts.push(`${colExpr} ILIKE $${startIdx + i}`);
        params.push(`%${t}%`);
      });
      return { sql: parts.join(' AND '), params };
    };

    const companyName = faNameExpr('name');
    const companyTok = tokenAnd(companyName, 1);
    const company = await safeQuery(
      `SELECT id, name, employee_id AS code, 'company' AS kind
       FROM drivers
       WHERE COALESCE(is_deleted, false) = false
         AND (
           (${companyTok.sql})
           OR name ILIKE $${companyTok.params.length + 1}
           OR name ILIKE $${companyTok.params.length + 2}
           OR COALESCE(employee_id, '') ILIKE $${companyTok.params.length + 1}
           OR COALESCE(employee_id, '') ILIKE $${companyTok.params.length + 2}
         )
       ORDER BY name ASC LIMIT 25`,
      [...companyTok.params, like, likeRaw]
    );

    const personalName = faNameExpr('name');
    const personalTok = tokenAnd(personalName, 1);
    const personal = await safeQuery(
      `SELECT id, name, driver_smart_id AS code, 'personal' AS kind
       FROM personal_drivers
       WHERE (
           (${personalTok.sql})
           OR name ILIKE $${personalTok.params.length + 1}
           OR name ILIKE $${personalTok.params.length + 2}
           OR COALESCE(driver_smart_id, '') ILIKE $${personalTok.params.length + 1}
           OR COALESCE(driver_smart_id, '') ILIKE $${personalTok.params.length + 2}
         )
       ORDER BY name ASC LIMIT 25`,
      [...personalTok.params, like, likeRaw]
    );

    const faName = faNameExpr(RESOLVED_DRIVER_NAME_SQL);
    const faTok = tokenAnd(faName, 1);
    const fromFa = await safeQuery(
      `SELECT DISTINCT ON (${RESOLVED_DRIVER_NAME_SQL})
         fa.assigned_driver_id AS id,
         ${RESOLVED_DRIVER_NAME_SQL} AS name,
         COALESCE(d.employee_id, pd.driver_smart_id)::text AS code,
         CASE
           WHEN d.id IS NOT NULL THEN 'company'
           WHEN pd.id IS NOT NULL THEN 'personal'
           ELSE 'announcement'
         END AS kind
       FROM freight_announcements fa
       ${DRIVER_NAME_JOINS}
       WHERE ${RESOLVED_DRIVER_NAME_SQL} IS NOT NULL
         AND (
           (${faTok.sql})
           OR ${RESOLVED_DRIVER_NAME_SQL} ILIKE $${faTok.params.length + 1}
           OR ${RESOLVED_DRIVER_NAME_SQL} ILIKE $${faTok.params.length + 2}
         )
       ORDER BY ${RESOLVED_DRIVER_NAME_SQL}, fa.updated_at DESC NULLS LAST
       LIMIT 25`,
      [...faTok.params, like, likeRaw]
    );

    const seen = new Set();
    const drivers = [];
    // اول شرکتی، بعد شخصی، بعد اعلام‌بار — برای اسم تکراری اولویت با شرکتی
    for (const r of [...company, ...personal, ...fromFa]) {
      if (!r?.name) continue;
      const nameKey = normalizeFa(r.name);
      const key = r.id ? `id:${r.id}` : `name:${nameKey}:${r.kind}`;
      if (seen.has(key)) continue;
      // اگر همین اسم با id شرکتی قبلاً آمده، شخصی همنام را رد کن
      if (r.kind !== 'company' && drivers.some((x) => normalizeFa(x.name) === nameKey && x.kind === 'company')) {
        continue;
      }
      seen.add(key);
      drivers.push({
        id: r.id,
        name: r.name,
        code: r.code || null,
        kind: r.kind,
        label: r.code ? `${r.name} (${r.code})` : r.name,
      });
    }
    return res.json({ drivers, query: qRaw });
  } catch (err) {
    console.error('❌ [gps-live] searchDrivers', err);
    return res.status(500).json({ message: err?.message || 'خطا در جستجوی راننده' });
  }
}

async function fetchStoredTours(vehicleCode, imei, fromDt, toDt) {
  const params = [];
  const wh = [];
  if (imei) {
    params.push(String(imei));
    wh.push(`t.imei = $${params.length}`);
  }
  if (vehicleCode) {
    params.push(String(vehicleCode));
    wh.push(`t.vehicle_code ILIKE $${params.length}`);
  }
  if (!wh.length) return [];
  let where = `(${wh.join(' OR ')})`;
  if (fromDt) {
    params.push(fromDt.toISOString());
    where += ` AND t.tour_end >= $${params.length}`;
  }
  if (toDt) {
    params.push(toDt.toISOString());
    where += ` AND t.tour_start <= $${params.length}`;
  }

  const { rows } = await pool.query(
    `
    SELECT
      t.id,
      t.vehicle_code,
      t.imei,
      t.start_hub,
      t.end_hub,
      t.tour_start,
      t.tour_end,
      t.unload_stations_json,
      t.zone_markers_json,
      t.mileage_can,
      t.mileage_gps,
      t.mileage_gps_track,
      t.hours_total,
      t.fuel_used_total,
      d.driving_hours,
      d.stop_inside_h AS stop_total_hours,
      d.stop_outside_h AS stop_en_route_hours,
      d.stop_legal_h AS stop_legal_hours,
      d.fuel_l_per_100km,
      d.max_speed,
      d.overspeed_rule_count,
      d.stop_breakdown_json,
      s.id AS snapshot_id,
      s.announcement_id,
      s.selected_source,
      s.selected_mileage,
      s.vehicle_code AS snap_vehicle_code
    FROM gps_tours t
    LEFT JOIN gps_tour_details d ON d.tour_id = t.id
    LEFT JOIN LATERAL (
      SELECT gs.*
      FROM gps_tour_snapshots gs
      WHERE gs.gps_tour_id = t.id OR (
        gs.imei = t.imei
        AND ABS(EXTRACT(EPOCH FROM (gs.tour_start - t.tour_start))) < 120
        AND ABS(EXTRACT(EPOCH FROM (gs.tour_end - t.tour_end))) < 120
      )
      ORDER BY
        CASE WHEN gs.announcement_id IS NOT NULL THEN 0 ELSE 1 END,
        gs.created_at DESC
      LIMIT 1
    ) s ON TRUE
    WHERE ${where}
    ORDER BY t.tour_start DESC
    LIMIT 40
    `,
    params
  );

  return rows.map((row) => {
    const unloadRaw = (() => {
      try {
        const j = row.unload_stations_json;
        const arr = typeof j === 'string' ? JSON.parse(j) : j;
        return Array.isArray(arr) ? arr : [];
      } catch (_) {
        return [];
      }
    })();
    const breakdown = (() => {
      try {
        const j = row.stop_breakdown_json;
        const obj = typeof j === 'string' ? JSON.parse(j) : j;
        return obj && typeof obj === 'object' ? obj : null;
      } catch (_) {
        return null;
      }
    })();
    const unloadStops = mapUnloadStops(unloadRaw, breakdown);

    const stopStats = normalizeTourStopFields({
      stopTotalHours: row.stop_total_hours != null ? Number(row.stop_total_hours) : null,
      stopEnRouteHours: row.stop_en_route_hours != null ? Number(row.stop_en_route_hours) : null,
      stopLegalHours: row.stop_legal_hours != null ? Number(row.stop_legal_hours) : null,
      stopUnloadHours:
        breakdown?.stopUnloadHours != null
          ? Number(breakdown.stopUnloadHours)
          : unloadStops.reduce((s, u) => s + (u.hours || 0), 0) || null,
      breakdown,
    });

    return {
      tourId: row.id,
      vehicleCode: row.vehicle_code,
      imei: row.imei,
      startHub: row.start_hub,
      endHub: row.end_hub,
      unloadStations: unloadStops.map((u) => u.zone).join(' - ') || '-',
      unloadStops,
      tourStart: row.tour_start,
      tourEnd: row.tour_end,
      startDisplay: toTehranDisplay(row.tour_start),
      endDisplay: toTehranDisplay(row.tour_end),
      mileageCan: row.mileage_can != null ? Number(row.mileage_can) : null,
      mileageGps: row.mileage_gps != null ? Number(row.mileage_gps) : null,
      mileageGpsTrack: row.mileage_gps_track != null ? Number(row.mileage_gps_track) : null,
      hoursTotal: row.hours_total != null ? Number(row.hours_total) : null,
      drivingHours: row.driving_hours != null ? Number(row.driving_hours) : null,
      stopTotalHours: stopStats.stopTotalHours,
      stopEnRouteHours: stopStats.stopEnRouteHours,
      stopLegalHours: stopStats.stopLegalHours,
      stopLegalOutsideHours: stopStats.stopLegalOutsideHours,
      stopSpeedInsideFenceHours: stopStats.stopSpeedInsideFenceHours,
      stopUnloadHours: stopStats.stopUnloadHours,
      fuelUsedTotal: row.fuel_used_total != null ? Number(row.fuel_used_total) : null,
      fuelLPer100Km: row.fuel_l_per_100km != null ? Number(row.fuel_l_per_100km) : null,
      maxSpeed: row.max_speed != null ? Number(row.max_speed) : null,
      overspeedRuleCount: row.overspeed_rule_count != null ? Number(row.overspeed_rule_count) : null,
      snapshotId: row.snapshot_id || null,
      announcementId: row.announcement_id || null,
      selectedSource: row.selected_source || null,
      selectedMileage: row.selected_mileage != null ? Number(row.selected_mileage) : null,
    };
  });
}

function dwellHoursFromRange(fromRaw, toRaw, fallbackHours = null) {
  const from = parseTime(fromRaw);
  const to = parseTime(toRaw);
  if (from && to && to > from) {
    return Math.round(((to - from) / 3600000) * 100) / 100;
  }
  return fallbackHours != null && Number.isFinite(Number(fallbackHours))
    ? Math.round(Number(fallbackHours) * 100) / 100
    : null;
}

/**
 * نرمال‌سازی فیلدهای توقف:
 * - بعضی تورهای قدیمی فقط stop_outside_h دارند و stop_inside_h خالی است
 * - بین‌راهی و خواب قانونیِ خارج‌حصار زیرمجموعه توقف سرعتی‌اند؛ خواب داخل حصار جداست
 */
function normalizeTourStopFields({
  stopTotalHours,
  stopEnRouteHours,
  stopLegalHours,
  stopUnloadHours,
  breakdown,
}) {
  const br = breakdown && typeof breakdown === 'object' ? breakdown : null;
  let stopTotal =
    stopTotalHours != null && Number.isFinite(Number(stopTotalHours))
      ? Number(stopTotalHours)
      : br?.stopTotalHours != null && Number.isFinite(Number(br.stopTotalHours))
        ? Number(br.stopTotalHours)
        : null;
  let stopEnRoute =
    br?.stopEnRouteHours != null && Number.isFinite(Number(br.stopEnRouteHours))
      ? Number(br.stopEnRouteHours)
      : stopEnRouteHours != null && Number.isFinite(Number(stopEnRouteHours))
        ? Number(stopEnRouteHours)
        : null;
  let stopLegal =
    br?.stopLegalHours != null && Number.isFinite(Number(br.stopLegalHours))
      ? Number(br.stopLegalHours)
      : stopLegalHours != null && Number.isFinite(Number(stopLegalHours))
        ? Number(stopLegalHours)
        : null;
  let stopLegalOutside =
    br?.stopLegalOutsideUnloadHours != null &&
    Number.isFinite(Number(br.stopLegalOutsideUnloadHours))
      ? Number(br.stopLegalOutsideUnloadHours)
      : null;
  let stopUnload =
    stopUnloadHours != null && Number.isFinite(Number(stopUnloadHours))
      ? Number(stopUnloadHours)
      : br?.stopUnloadHours != null && Number.isFinite(Number(br.stopUnloadHours))
        ? Number(br.stopUnloadHours)
        : null;

  // داده ناقص: فقط outside پر است → آن را توقف کل فرض کن (نه بین‌راهی)
  if (stopTotal == null && stopEnRoute != null) {
    stopTotal = stopEnRoute;
    stopEnRoute = null;
  }

  // اگر breakdown کامل نیست و outside از total بزرگ‌تر است، outside را بی‌اعتبار کن
  if (stopTotal != null && stopEnRoute != null && stopEnRoute > stopTotal + 0.05) {
    stopEnRoute = null;
  }
  if (stopTotal != null && stopLegalOutside != null && stopLegalOutside > stopTotal + 0.05) {
    stopLegalOutside = null;
  }

  // اگر فقط legal کل داریم و outside مشخص نیست، برای زیرمجموعه از legal کل استفاده نکن
  const legalForSubset = stopLegalOutside != null ? stopLegalOutside : null;

  let stopSpeedInsideFence = null;
  if (stopTotal != null && stopEnRoute != null && legalForSubset != null) {
    stopSpeedInsideFence =
      Math.round((stopTotal - stopEnRoute - legalForSubset) * 100) / 100;
    if (stopSpeedInsideFence < 0) stopSpeedInsideFence = 0;
  } else if (stopTotal != null && stopEnRoute != null) {
    stopSpeedInsideFence = Math.round((stopTotal - stopEnRoute) * 100) / 100;
    if (stopSpeedInsideFence < 0) stopSpeedInsideFence = 0;
  }

  return {
    stopTotalHours: stopTotal,
    stopEnRouteHours: stopEnRoute,
    stopLegalHours: stopLegal,
    stopLegalOutsideHours: legalForSubset,
    stopUnloadHours: stopUnload,
    stopSpeedInsideFenceHours: stopSpeedInsideFence,
  };
}

function mapUnloadStops(unloadRaw, breakdown) {
  const fromBreakdown =
    Array.isArray(breakdown?.unloadStops) && breakdown.unloadStops.length
      ? breakdown.unloadStops
      : null;

  const source = fromBreakdown || (Array.isArray(unloadRaw) ? unloadRaw : []);
  return source
    .map((u) => {
      if (typeof u === 'string') {
        return { zone: u, fromJalali: null, toJalali: null, hours: null, legalHours: null };
      }
      const fromRaw = u.from || u.fromTime || u.start || null;
      const toRaw = u.to || u.toTime || u.end || null;
      const fromDisp = fromRaw ? toTehranDisplay(fromRaw) : null;
      const toDisp = toRaw ? toTehranDisplay(toRaw) : null;
      // اگر fromJalali ذخیره‌شده بدون تبدیل تهران است، از ISO دوباره بساز
      const fromJalali = fromDisp?.jalali || u.fromJalali || null;
      const toJalali = toDisp?.jalali || u.toJalali || null;
      const fromTime = fromDisp?.time || null;
      const toTime = toDisp?.time || null;
      const hours = dwellHoursFromRange(fromRaw, toRaw, u.hours);
      return {
        zone: u.zone || u.name || '—',
        from: fromRaw,
        to: toRaw,
        fromJalali,
        toJalali,
        fromTime,
        toTime,
        hours,
        legalHours: u.legalHours != null ? Number(u.legalHours) : null,
      };
    })
    .filter((u) => u.zone);
}

async function fetchAnnouncementSummaries(announcementIds) {
  const ids = [...new Set((announcementIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `
    SELECT
      fa.id,
      fa.line_type,
      fa.status,
      fa.assignment_type,
      ${RESOLVED_DRIVER_NAME_SQL} AS assigned_driver_name,
      fa.assigned_driver_id,
      fa.vehicle_plate,
      v.vehicle_code AS v_code,
      fa.created_at,
      fa.updated_at,
      dc.id AS calculation_id,
      dc.approved_kilometers,
      dc.mileage_source,
      dc.total_kilometers
    FROM freight_announcements fa
    LEFT JOIN vehicles v ON v.id = fa.assigned_vehicle_id
    ${DRIVER_NAME_JOINS}
    LEFT JOIN driver_calculations dc ON dc.announcement_id = fa.id
    WHERE fa.id = ANY($1::varchar[])
    `,
    [ids]
  );
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.id), {
      announcementId: row.id,
      lineType: row.line_type,
      status: row.status,
      assignmentType: row.assignment_type,
      driverName: row.assigned_driver_name,
      driverId: row.assigned_driver_id,
      vehiclePlate: row.vehicle_plate,
      vehicleCode: row.v_code,
      assignmentDate: row.updated_at || row.created_at,
      assignmentDisplay: toTehranDisplay(row.updated_at || row.created_at),
      finance: row.calculation_id
        ? {
            calculationId: row.calculation_id,
            approvedKilometers:
              row.approved_kilometers != null ? Number(row.approved_kilometers) : null,
            mileageSource: row.mileage_source || null,
            totalKilometers: row.total_kilometers != null ? Number(row.total_kilometers) : null,
          }
        : null,
    });
  }
  return map;
}

async function fetchDestinationsForAnnouncements(announcementIds) {
  const ids = [...new Set((announcementIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `
    SELECT
      freight_announcement_id,
      city,
      representative_name,
      representative_type,
      delivery_date,
      tonnage
    FROM freight_destinations
    WHERE freight_announcement_id = ANY($1::varchar[])
    ORDER BY freight_announcement_id, created_at NULLS LAST
    `,
    [ids]
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.freight_announcement_id);
    const list = map.get(key) || [];
    list.push({
      city: r.city,
      representativeName: r.representative_name,
      representativeType: r.representative_type,
      deliveryDate: r.delivery_date,
      tonnageKg: r.tonnage != null ? Number(r.tonnage) : null,
    });
    map.set(key, list);
  }
  return map;
}

/**
 * تورمحور: هر تور GPS ذخیره‌شده + تخصیص متناظر (راننده/لاین/مقاصد)
 */
async function buildTourLinkedAssignments(vehicleCode, plate, imei, fromDt, toDt) {
  const tours = await fetchStoredTours(vehicleCode, imei, fromDt, toDt);

  let assignFrom = fromDt;
  let assignTo = toDt;
  if (tours.length) {
    const starts = tours.map((t) => new Date(t.tourStart).getTime()).filter(Number.isFinite);
    const ends = tours.map((t) => new Date(t.tourEnd).getTime()).filter(Number.isFinite);
    if (starts.length) assignFrom = new Date(Math.min(...starts) - 10 * 86400000);
    if (ends.length) assignTo = new Date(Math.max(...ends) + 2 * 86400000);
  }

  let baseAssignments = await fetchAssignmentsForVehicle(vehicleCode, plate, assignFrom, assignTo);

  // اگر join خودرو چیزی نداد، با پلاک (نرمال) دوباره جستجو کن
  if (!baseAssignments.length && (vehicleCode || plate)) {
    const params = [assignFrom.toISOString(), assignTo.toISOString()];
    const ors = [];
    if (vehicleCode) {
      params.push(String(vehicleCode).trim());
      ors.push(`v.vehicle_code ILIKE $${params.length}`);
    }
    if (plate) {
      const compact = normalizePlate(plate);
      params.push(`%${String(plate).replace(/\s+/g, '%')}%`);
      ors.push(`fa.vehicle_plate ILIKE $${params.length}`);
      params.push(`%${compact}%`);
      ors.push(
        `regexp_replace(lower(replace(replace(fa.vehicle_plate, '-', ''), ' ', '')), '[^0-9a-zآ-ی]', '', 'g') LIKE $${params.length}`
      );
    }
    if (ors.length) {
      try {
        const { rows } = await pool.query(
          `
          SELECT
            fa.id,
            fa.line_type,
            fa.status,
            fa.assignment_type,
            ${RESOLVED_DRIVER_NAME_SQL} AS assigned_driver_name,
            fa.assigned_driver_id,
            fa.vehicle_plate,
            v.vehicle_code AS v_code,
            fa.created_at,
            fa.updated_at,
            dc.id AS calculation_id,
            dc.approved_kilometers,
            dc.mileage_source,
            dc.total_kilometers
          FROM freight_announcements fa
          LEFT JOIN vehicles v ON v.id = fa.assigned_vehicle_id
          ${DRIVER_NAME_JOINS}
          LEFT JOIN driver_calculations dc ON dc.announcement_id = fa.id
          WHERE fa.assigned_driver_id IS NOT NULL
            AND (${ors.join(' OR ')})
            AND COALESCE(fa.updated_at, fa.created_at) >= $1
            AND COALESCE(fa.updated_at, fa.created_at) <= $2
          ORDER BY COALESCE(fa.updated_at, fa.created_at) DESC
          LIMIT 80
          `,
          params
        );
        baseAssignments = rows.map((row) => ({
          announcementId: row.id,
          lineType: row.line_type,
          status: row.status,
          assignmentType: row.assignment_type,
          driverName: row.assigned_driver_name,
          driverId: row.assigned_driver_id,
          vehiclePlate: row.vehicle_plate,
          vehicleCode: row.v_code || vehicleCode,
          assignmentDate: row.updated_at || row.created_at,
          assignmentDisplay: toTehranDisplay(row.updated_at || row.created_at),
          finance: row.calculation_id
            ? {
                calculationId: row.calculation_id,
                approvedKilometers:
                  row.approved_kilometers != null ? Number(row.approved_kilometers) : null,
                mileageSource: row.mileage_source || null,
                totalKilometers: row.total_kilometers != null ? Number(row.total_kilometers) : null,
              }
            : null,
          gpsTour: null,
        }));
      } catch (e) {
        console.warn('⚠️ [gps-live] fallback assignment query:', e.message);
      }
    }
  }

  const byAnnId = new Map(baseAssignments.map((a) => [String(a.announcementId), a]));

  // announcement_id روی اسنپ‌شات تور — حتی اگر در فیلتر زمانی base نبود، مستقیم بخوان
  const snapAnnIds = tours.map((t) => t.announcementId).filter(Boolean);
  const missingSnapIds = snapAnnIds.filter((id) => !byAnnId.has(String(id)));
  if (missingSnapIds.length) {
    const extra = await fetchAnnouncementSummaries(missingSnapIds);
    for (const [id, a] of extra.entries()) {
      byAnnId.set(id, a);
      baseAssignments.push(a);
    }
  }

  const scoreDestinationOverlap = (tour, annId, destMap) => {
    const dests = destMap.get(String(annId)) || [];
    if (!dests.length || !tour.unloadStops?.length) return 0;
    const destCities = dests.map((d) => String(d.city || '').trim()).filter(Boolean);
    let hits = 0;
    for (const u of tour.unloadStops) {
      const zone = String(u.zone || '');
      if (destCities.some((c) => zone.includes(c) || c.includes(zone.replace(/^شعبه\s*/, '')))) {
        hits += 1;
      }
    }
    return hits;
  };

  const findAssignmentForTour = (tour, destMap) => {
    if (tour.announcementId && byAnnId.has(String(tour.announcementId))) {
      return byAnnId.get(String(tour.announcementId));
    }
    const t0 = tour.tourStart ? new Date(tour.tourStart).getTime() : null;
    const t1 = tour.tourEnd ? new Date(tour.tourEnd).getTime() : null;
    if (!t0 || !t1) return null;

    let best = null;
    let bestScore = -Infinity;
    for (const a of baseAssignments) {
      const aTime = a.assignmentDate ? new Date(a.assignmentDate).getTime() : null;
      if (!aTime) continue;
      const overlaps = aTime <= t1 + 2 * 86400000 && aTime >= t0 - 14 * 86400000;
      if (!overlaps) continue;
      const timeScore = 1 / (1 + Math.abs(aTime - t0) / 3600000);
      const destScore = scoreDestinationOverlap(tour, a.announcementId, destMap) * 3;
      const score = timeScore + destScore;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    // اگر فقط زمان نزدیک بود ولی مقصد هیچ هم‌پوشانی نداشت و گزینه بهتری با مقصد هست
    return best;
  };

  const annIds = [
    ...tours.map((t) => t.announcementId).filter(Boolean),
    ...baseAssignments.map((a) => a.announcementId),
  ];
  const destMap = await fetchDestinationsForAnnouncements(annIds);

  if (!tours.length) {
    return {
      assignments: baseAssignments.map((a) => {
        const dests = destMap.get(String(a.announcementId)) || [];
        return {
          ...a,
          assignedDestinations: dests,
          assignedDestinationsLabel: dests.map((d) => d.city).filter(Boolean).join('، '),
        };
      }),
      storedTours: tours,
    };
  }

  const usedAnn = new Set();
  const vehicleFallbackDriver =
    baseAssignments.find((a) => a.driverName) ||
    baseAssignments.find((a) => a.driverId) ||
    null;
  const rowsOut = tours.map((tour) => {
    const matched = findAssignmentForTour(tour, destMap);
    if (matched?.announcementId) usedAnn.add(String(matched.announcementId));
    const annId = matched?.announcementId || tour.announcementId || null;
    const dests = annId ? destMap.get(String(annId)) || [] : [];
    // اگر مقصد هیچ ربطی به حصارها ندارد و match فقط از announcement_id اشتباه اسنپ‌شات است، dest را خالی نکن ولی هشدار بده
    const destHits = annId ? scoreDestinationOverlap(tour, annId, destMap) : 0;
    return {
      announcementId: annId || tour.tourId,
      lineType: matched?.lineType || null,
      status: matched?.status || 'تور GPS (بدون تخصیص متصل)',
      assignmentType: matched?.assignmentType || null,
      driverName: matched?.driverName || vehicleFallbackDriver?.driverName || null,
      driverId: matched?.driverId || vehicleFallbackDriver?.driverId || null,
      vehiclePlate: matched?.vehiclePlate || plate || null,
      vehicleCode: matched?.vehicleCode || vehicleCode || tour.vehicleCode,
      assignmentDate: matched?.assignmentDate || tour.tourStart,
      assignmentDisplay: matched?.assignmentDisplay || tour.startDisplay,
      finance: matched?.finance || null,
      assignedDestinations: dests,
      assignedDestinationsLabel: dests.map((d) => d.city).filter(Boolean).join('، '),
      destinationMatchWeak: Boolean(annId && dests.length && destHits === 0 && tour.unloadStops?.length),
      gpsTour: {
        snapshotId: tour.snapshotId,
        selectedSource: tour.selectedSource,
        selectedMileage: tour.selectedMileage,
        mileageCan: tour.mileageCan,
        mileageGps: tour.mileageGps,
        mileageGpsTrack: tour.mileageGpsTrack,
        tourStart: tour.tourStart,
        tourEnd: tour.tourEnd,
        startDisplay: tour.startDisplay,
        endDisplay: tour.endDisplay,
        drivingHours: tour.drivingHours,
        stopTotalHours: tour.stopTotalHours,
        stopEnRouteHours: tour.stopEnRouteHours,
        stopLegalHours: tour.stopLegalHours,
        stopUnloadHours: tour.stopUnloadHours,
        fuelUsedTotal: tour.fuelUsedTotal,
        fuelLPer100Km: tour.fuelLPer100Km,
        maxSpeed: tour.maxSpeed,
        overspeedRuleCount: tour.overspeedRuleCount,
        hoursTotal: tour.hoursTotal,
        startHub: tour.startHub,
        endHub: tour.endHub,
        unloadStations: tour.unloadStations,
        unloadStops: tour.unloadStops || [],
      },
    };
  });

  for (const a of baseAssignments) {
    if (usedAnn.has(String(a.announcementId))) continue;
    const dests = destMap.get(String(a.announcementId)) || [];
    rowsOut.push({
      ...a,
      assignedDestinations: dests,
      assignedDestinationsLabel: dests.map((d) => d.city).filter(Boolean).join('، '),
      gpsTour: a.gpsTour || null,
    });
  }

  return { assignments: rowsOut, storedTours: tours };
}

async function matchAssignmentsToTours(assignments, tours) {
  if (!assignments?.length || !tours?.length) return assignments || [];
  return assignments.map((a) => {
    const aTime = a.assignmentDate ? new Date(a.assignmentDate).getTime() : null;
    let best = a.gpsTour || null;
    if (!best && aTime) {
      // تورهایی که حوالی تخصیص شروع شده‌اند
      const candidates = tours.filter((t) => {
        const s = t.tourStart ? new Date(t.tourStart).getTime() : null;
        const e = t.tourEnd ? new Date(t.tourEnd).getTime() : null;
        if (!s || !e) return false;
        // همپوشانی یا شروع تور تا ۷ روز بعد از تخصیص
        return (s <= aTime && e >= aTime) || (s >= aTime && s <= aTime + 7 * 86400000);
      });
      if (candidates.length) {
        const t = candidates[0];
        best = {
          snapshotId: t.snapshotId,
          selectedSource: t.selectedSource,
          selectedMileage: t.selectedMileage,
          mileageCan: t.mileageCan,
          mileageGps: t.mileageGps,
          mileageGpsTrack: t.mileageGpsTrack,
          tourStart: t.tourStart,
          tourEnd: t.tourEnd,
          drivingHours: t.drivingHours,
          stopTotalHours: t.stopTotalHours,
          stopEnRouteHours: t.stopEnRouteHours,
          stopLegalHours: t.stopLegalHours,
          fuelUsedTotal: t.fuelUsedTotal,
          fuelLPer100Km: t.fuelLPer100Km,
          maxSpeed: t.maxSpeed,
          overspeedRuleCount: t.overspeedRuleCount,
          hoursTotal: t.hoursTotal,
          startHub: t.startHub,
          endHub: t.endHub,
          unloadStations: t.unloadStations,
        };
      }
    }
    return { ...a, gpsTour: best };
  });
}

async function getStatus(req, res) {
  return res.json({ enabled: isGpsLiveEnabled(), kingConfigured: isKingGpsConfigured() });
}

async function lookupVehicle(req, res) {
  try {
    const query = req.body?.query || req.body?.vehicleCode || req.body?.plate || '';
    const fromJalali = req.body?.fromDate;
    const toJalali = req.body?.toDate;
    let fromDt = parseJalaliOrIsoToDate(fromJalali, false);
    let toDt = parseJalaliOrIsoToDate(toJalali, true);
    if (!fromDt) {
      fromDt = new Date(Date.now() - 30 * 86400000);
    }
    if (!toDt) {
      toDt = new Date();
      toDt.setHours(23, 59, 59, 999);
    }

    const resolved = await resolveGpsResource(query);
    if (resolved.error) return res.status(404).json({ message: resolved.error });
    if (resolved.multiple) {
      return res.status(409).json({
        message: 'چند منبع GPS پیدا شد؛ یکی را دقیق‌تر انتخاب کنید.',
        options: resolved.multiple.map((r) => ({
          vehicleCode: r.vehicle_code,
          plateNumber: r.plate_number,
          assetKind: r.asset_kind,
          imei: r.imei,
          gpsModelName: r.gps_model_name,
        })),
      });
    }

    const resource = resolved.resource;
    let live = null;
    try {
      const locMap = await getLocations(resource.imei);
      if (locMap && !locMap.error) {
        const loc =
          locMap[resource.imei] || Object.values(locMap)[0] || null;
        live = loc ? mapLiveLocation(resource.imei, loc, resource) : null;
      }
    } catch (e) {
      console.warn('⚠️ [gps-live] locations skip:', e.message);
    }

    const capabilities = modelCapabilities(resource.gps_model_name);
    const linked = await buildTourLinkedAssignments(
      resource.vehicle_code,
      resource.plate_number,
      resource.imei,
      fromDt,
      toDt
    );

    const latestWithDriver =
      linked.assignments.find((a) => a.driverName) || linked.assignments[0] || null;

    return res.json({
      enabled: true,
      resource: {
        vehicleCode: resource.vehicle_code,
        plateNumber: resource.plate_number,
        assetKind: resource.asset_kind,
        imei: resource.imei,
        gpsModelName: resource.gps_model_name,
      },
      capabilities,
      live,
      storedTours: linked.storedTours,
      assignments: linked.assignments,
      latestAssignment: latestWithDriver
        ? {
            announcementId: latestWithDriver.announcementId,
            driverName: latestWithDriver.driverName,
            driverId: latestWithDriver.driverId,
            lineType: latestWithDriver.lineType,
            vehicleCode: latestWithDriver.vehicleCode,
            vehiclePlate: latestWithDriver.vehiclePlate,
            assignmentDisplay: latestWithDriver.assignmentDisplay,
          }
        : null,
      range: {
        from: formatDt(fromDt),
        to: formatDt(toDt),
        fromDisplay: toTehranDisplay(fromDt),
        toDisplay: toTehranDisplay(toDt),
      },
    });
  } catch (err) {
    console.error('❌ [gps-live] lookupVehicle', err);
    return res.status(500).json({ message: err?.message || 'خطا در داشبورد لحظه‌ای' });
  }
}

async function lookupDriver(req, res) {
  try {
    const query = String(req.body?.query || req.body?.driverName || '').trim();
    const driverId = req.body?.driverId ? String(req.body.driverId).trim() : null;
    const fromJalali = req.body?.fromDate;
    const toJalali = req.body?.toDate;
    let fromDt = parseJalaliOrIsoToDate(fromJalali, false);
    let toDt = parseJalaliOrIsoToDate(toJalali, true);
    if (!fromDt) {
      fromDt = new Date(Date.now() - 60 * 86400000);
    }
    if (!toDt) {
      toDt = new Date();
      toDt.setHours(23, 59, 59, 999);
    }
    if (!query && !driverId) {
      return res.status(400).json({ message: 'نام یا کد راننده الزامی است.' });
    }

    // پیشنهاد نام کامل از منابع راننده
    if (!driverId && query) {
      const qNorm = normalizeFa(query);
      const like = `%${qNorm}%`;
      const likeRaw = `%${query}%`;
      const tokens = qNorm.split(/\s+/).filter((t) => t.length >= 1).slice(0, 4);
      const safeQuery = async (sql, params) => {
        try {
          return (await pool.query(sql, params)).rows;
        } catch (e) {
          console.warn('⚠️ [gps-live] lookupDriver candidate:', e.message);
          return [];
        }
      };
      const tokenAnd = (colExpr, startIdx) => {
        if (!tokens.length) return { sql: `${colExpr} ILIKE $${startIdx}`, params: [like] };
        const parts = [];
        const params = [];
        tokens.forEach((t, i) => {
          parts.push(`${colExpr} ILIKE $${startIdx + i}`);
          params.push(`%${t}%`);
        });
        return { sql: parts.join(' AND '), params };
      };
      const companyName = faNameExpr('name');
      const companyTok = tokenAnd(companyName, 1);
      const company = await safeQuery(
        `SELECT id, name, employee_id AS code, 'company' AS kind FROM drivers
         WHERE COALESCE(is_deleted, false) = false
           AND ((${companyTok.sql}) OR name ILIKE $${companyTok.params.length + 1}
                OR name ILIKE $${companyTok.params.length + 2}
                OR COALESCE(employee_id,'') ILIKE $${companyTok.params.length + 1})
         ORDER BY name LIMIT 25`,
        [...companyTok.params, like, likeRaw]
      );
      const personalName = faNameExpr('name');
      const personalTok = tokenAnd(personalName, 1);
      const personal = await safeQuery(
        `SELECT id, name, driver_smart_id AS code, 'personal' AS kind FROM personal_drivers
         WHERE ((${personalTok.sql}) OR name ILIKE $${personalTok.params.length + 1}
                OR name ILIKE $${personalTok.params.length + 2}
                OR COALESCE(driver_smart_id,'') ILIKE $${personalTok.params.length + 1})
         ORDER BY name LIMIT 25`,
        [...personalTok.params, like, likeRaw]
      );
      const faTok = tokenAnd(faNameExpr(RESOLVED_DRIVER_NAME_SQL), 1);
      const fromFa = await safeQuery(
        `SELECT DISTINCT ON (${RESOLVED_DRIVER_NAME_SQL})
           fa.assigned_driver_id AS id,
           ${RESOLVED_DRIVER_NAME_SQL} AS name,
           COALESCE(d.employee_id, pd.driver_smart_id)::text AS code,
           CASE
             WHEN d.id IS NOT NULL THEN 'company'
             WHEN pd.id IS NOT NULL THEN 'personal'
             ELSE 'announcement'
           END AS kind
         FROM freight_announcements fa
         ${DRIVER_NAME_JOINS}
         WHERE ${RESOLVED_DRIVER_NAME_SQL} IS NOT NULL
           AND ((${faTok.sql}) OR ${RESOLVED_DRIVER_NAME_SQL} ILIKE $${faTok.params.length + 1}
                OR ${RESOLVED_DRIVER_NAME_SQL} ILIKE $${faTok.params.length + 2})
         ORDER BY ${RESOLVED_DRIVER_NAME_SQL}, fa.updated_at DESC NULLS LAST
         LIMIT 25`,
        [...faTok.params, like, likeRaw]
      );
      const candidates = [];
      const seen = new Set();
      for (const r of [...company, ...personal, ...fromFa]) {
        if (!r?.name) continue;
        const nameKey = normalizeFa(r.name);
        const key = r.id ? `id:${r.id}` : `name:${nameKey}:${r.kind}`;
        if (seen.has(key)) continue;
        if (r.kind !== 'company' && candidates.some((x) => normalizeFa(x.name) === nameKey && x.kind === 'company')) {
          continue;
        }
        seen.add(key);
        candidates.push({
          id: r.id,
          name: r.name,
          code: r.code || null,
          kind: r.kind,
          label: r.code ? `${r.name} (${r.code})` : r.name,
        });
      }
      // اگر نام کامل دقیق یکی بود همان را بگیر
      const exact = candidates.filter((c) => normalizeFa(c.name) === qNorm);
      const pickList = exact.length === 1 ? exact : candidates;
      if (pickList.length > 1) {
        return res.status(409).json({
          message: 'چند راننده پیدا شد؛ یکی را از لیست انتخاب کنید.',
          drivers: pickList,
        });
      }
      if (pickList.length === 1) {
        req.body.query = pickList[0].name;
        if (pickList[0].id) req.body.driverId = pickList[0].id;
      } else if (!pickList.length) {
        return res.status(404).json({
          message: 'راننده‌ای با این نام در منابع پیدا نشد.',
          drivers: [],
        });
      }
    }

    const resolvedDriverId = String(req.body?.driverId || driverId || '').trim() || null;
    const resolvedName = String(req.body?.query || query).trim();
    const resolvedNameNorm = normalizeFa(resolvedName);

    const params = [fromDt.toISOString(), toDt.toISOString()];
    let driverClause = '';
    if (resolvedDriverId) {
      params.push(resolvedDriverId);
      const idIdx = params.length;
      params.push(`%${resolvedNameNorm || resolvedName}%`);
      const nameIdx = params.length;
      // هم با id و هم با نام (ستون خالی + join راننده)
      driverClause = `(fa.assigned_driver_id::text = $${idIdx}
        OR ${faNameExpr('fa.assigned_driver_name')} ILIKE $${nameIdx}
        OR ${faNameExpr('d.name')} ILIKE $${nameIdx}
        OR ${faNameExpr('pd.name')} ILIKE $${nameIdx})`;
    } else {
      params.push(`%${resolvedNameNorm || resolvedName}%`);
      driverClause = `(${faNameExpr('fa.assigned_driver_name')} ILIKE $${params.length}
        OR ${faNameExpr('d.name')} ILIKE $${params.length}
        OR ${faNameExpr('pd.name')} ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        fa.id,
        fa.line_type,
        fa.status,
        fa.assignment_type,
        fa.assigned_driver_id,
        ${RESOLVED_DRIVER_NAME_SQL} AS assigned_driver_name,
        fa.vehicle_plate,
        v.vehicle_code AS v_code,
        fa.created_at,
        fa.updated_at
      FROM freight_announcements fa
      LEFT JOIN vehicles v ON v.id = fa.assigned_vehicle_id
      ${DRIVER_NAME_JOINS}
      WHERE (fa.assigned_driver_id IS NOT NULL OR (fa.assigned_driver_name IS NOT NULL AND fa.assigned_driver_name <> ''))
        AND (${driverClause})
        AND COALESCE(fa.updated_at, fa.created_at) >= $1
        AND COALESCE(fa.updated_at, fa.created_at) <= $2
      ORDER BY
        CASE
          WHEN fa.status::text ILIKE '%transit%' OR fa.status::text ILIKE '%مسیر%' OR fa.status::text ILIKE '%Assigned%' THEN 0
          ELSE 1
        END,
        COALESCE(fa.updated_at, fa.created_at) DESC
      LIMIT 40
      `,
      params
    );

    let assignmentRows = rows;
    if (!assignmentRows.length) {
      // بازه خالی بود — آخرین تخصیص راننده را بدون محدودیت بازه بگیر (برای وضعیت لحظه‌ای خودرو)
      const fallbackParams = [];
      let fallbackClause = '';
      if (resolvedDriverId) {
        fallbackParams.push(resolvedDriverId);
        const idIdx = fallbackParams.length;
        fallbackParams.push(`%${resolvedNameNorm || resolvedName}%`);
        const nameIdx = fallbackParams.length;
        fallbackClause = `(fa.assigned_driver_id::text = $${idIdx}
          OR ${faNameExpr('fa.assigned_driver_name')} ILIKE $${nameIdx}
          OR ${faNameExpr('d.name')} ILIKE $${nameIdx}
          OR ${faNameExpr('pd.name')} ILIKE $${nameIdx})`;
      } else {
        fallbackParams.push(`%${resolvedNameNorm || resolvedName}%`);
        fallbackClause = `(${faNameExpr('fa.assigned_driver_name')} ILIKE $${fallbackParams.length}
          OR ${faNameExpr('d.name')} ILIKE $${fallbackParams.length}
          OR ${faNameExpr('pd.name')} ILIKE $${fallbackParams.length})`;
      }
      const { rows: fallbackRows } = await pool.query(
        `
        SELECT
          fa.id,
          fa.line_type,
          fa.status,
          fa.assignment_type,
          fa.assigned_driver_id,
          ${RESOLVED_DRIVER_NAME_SQL} AS assigned_driver_name,
          fa.vehicle_plate,
          v.vehicle_code AS v_code,
          fa.created_at,
          fa.updated_at
        FROM freight_announcements fa
        LEFT JOIN vehicles v ON v.id = fa.assigned_vehicle_id
        ${DRIVER_NAME_JOINS}
        WHERE (fa.assigned_driver_id IS NOT NULL OR (fa.assigned_driver_name IS NOT NULL AND fa.assigned_driver_name <> ''))
          AND (${fallbackClause})
        ORDER BY COALESCE(fa.updated_at, fa.created_at) DESC
        LIMIT 5
        `,
        fallbackParams
      );
      if (!fallbackRows.length) {
        return res.status(404).json({
          message: 'برای این راننده تخصیصی پیدا نشد.',
        });
      }
      // فقط برای گرفتن live از خودرو؛ جدول تخصیص بازه خالی می‌ماند مگر اینکه داخل بازه باشند
      assignmentRows = fallbackRows;
    }

    const latest = assignmentRows[0];
    const vehicleCode = latest.v_code;
    let liveBundle = null;
    let storedTours = [];
    let assignments = [];

    if (vehicleCode || latest.vehicle_plate) {
      const resolved = await resolveGpsResource(vehicleCode || latest.vehicle_plate);
      if (resolved.resource) {
        try {
          const locMap = await getLocations(resolved.resource.imei);
          const loc =
            (locMap && !locMap.error && locMap[resolved.resource.imei]) ||
            (locMap && !locMap.error && Object.values(locMap)[0]) ||
            null;
          liveBundle = {
            resource: {
              vehicleCode: resolved.resource.vehicle_code,
              plateNumber: resolved.resource.plate_number,
              assetKind: resolved.resource.asset_kind,
              imei: resolved.resource.imei,
              gpsModelName: resolved.resource.gps_model_name,
            },
            capabilities: modelCapabilities(resolved.resource.gps_model_name),
            live: loc ? mapLiveLocation(resolved.resource.imei, loc, resolved.resource) : null,
          };
          const linked = await buildTourLinkedAssignments(
            resolved.resource.vehicle_code,
            resolved.resource.plate_number,
            resolved.resource.imei,
            fromDt,
            toDt
          );
          storedTours = linked.storedTours;
          const driverIds = new Set(assignmentRows.map((r) => String(r.assigned_driver_id)).filter(Boolean));
          const driverNames = new Set(
            assignmentRows.map((r) => String(r.assigned_driver_name || '').trim()).filter(Boolean)
          );
          assignments = linked.assignments.filter(
            (a) =>
              (a.driverId && driverIds.has(String(a.driverId))) ||
              (a.driverName && driverNames.has(String(a.driverName).trim())) ||
              rows.some((r) => String(r.id) === String(a.announcementId))
          );
        } catch (e) {
          console.warn('⚠️ [gps-live] driver live skip:', e.message);
        }
      }
    }

    if (!assignments.length && rows.length) {
      const destMap = await fetchDestinationsForAnnouncements(rows.map((r) => r.id));
      assignments = rows.map((r) => {
        const dests = destMap.get(String(r.id)) || [];
        return {
          announcementId: r.id,
          lineType: r.line_type,
          status: r.status,
          assignmentType: r.assignment_type,
          driverName: r.assigned_driver_name,
          driverId: r.assigned_driver_id,
          vehiclePlate: r.vehicle_plate,
          vehicleCode: r.v_code,
          assignmentDisplay: toTehranDisplay(r.updated_at || r.created_at),
          assignedDestinations: dests,
          assignedDestinationsLabel: dests.map((d) => d.city).filter(Boolean).join('، ') || null,
          finance: null,
          gpsTour: null,
        };
      });
    }

    if (!rows.length && liveBundle) {
      // راننده پیدا شد ولی در بازه تخصیص ندارد — وضعیت لحظه‌ای خودرو را برگردان
      return res.json({
        message: 'در این بازه تخصیصی نبود؛ وضعیت لحظه‌ای آخرین خودروی راننده نمایش داده شد.',
        latestAssignment: {
          announcementId: latest.id,
          driverName: latest.assigned_driver_name,
          lineType: latest.line_type,
          vehicleCode: latest.v_code,
          vehiclePlate: latest.vehicle_plate,
        },
        ...liveBundle,
        assignments: [],
        storedTours,
      });
    }

    if (!rows.length && !liveBundle) {
      return res.status(404).json({
        message: 'در این بازه تخصیصی برای این راننده پیدا نشد. بازه تاریخ را وسیع‌تر کنید.',
      });
    }

    return res.json({
      enabled: true,
      driverQuery: resolvedName,
      latestAssignment: {
        announcementId: latest.id,
        lineType: latest.line_type,
        status: latest.status,
        assignmentType: latest.assignment_type,
        driverName: latest.assigned_driver_name,
        driverId: latest.assigned_driver_id,
        vehiclePlate: latest.vehicle_plate,
        vehicleCode,
        assignmentDisplay: toTehranDisplay(latest.updated_at || latest.created_at),
      },
      ...(liveBundle || { resource: null, capabilities: null, live: null }),
      storedTours,
      assignments,
      range: {
        from: formatDt(fromDt),
        to: formatDt(toDt),
        fromDisplay: toTehranDisplay(fromDt),
        toDisplay: toTehranDisplay(toDt),
      },
    });
  } catch (err) {
    console.error('❌ [gps-live] lookupDriver', err);
    return res.status(500).json({ message: err?.message || 'خطا در جستجوی راننده' });
  }
}

module.exports = {
  isGpsLiveEnabled,
  requireGpsLive,
  getStatus,
  searchDrivers,
  lookupVehicle,
  lookupDriver,
};
