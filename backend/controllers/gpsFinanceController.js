const crypto = require('crypto');
const pool = require('../db');
const { jalaliToGregorian, formatJalali } = require('../utils/jalali');
const { isKingGpsConfigured, getMessages, formatDt } = require('../services/kingGpsClient');
const {
  intervalsOverlap,
  parseTime,
  buildZoneDebug,
  enrichTourDrivingStats,
  takeSamplePoints,
} = require('../services/gpsTourAnalyzer');
const {
  loadToursOverlapping,
  fetchAndUpsertVehicle,
} = require('../services/gpsTourCatalog');
const { isGpsIngestEnabled, getLatestIngestStatus, runFleetIngest } = require('../services/gpsFleetIngest');

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function isGpsFinanceEnabled() {
  const v = String(process.env.GPS_FINANCE_ENABLED ?? 'true').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  return isKingGpsConfigured();
}

function requireGpsFinance(req, res, next) {
  if (!isGpsFinanceEnabled()) {
    return res.status(503).json({
      enabled: false,
      message:
        'محاسبه GPS مالی غیرفعال است. GPS_FINANCE_ENABLED و KING_GPS_API_KEY را در .env بررسی کنید.',
    });
  }
  next();
}

function parseJalaliOrIsoToDate(input, endOfDay = false) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(
      s.includes('T') || s.includes(' ')
        ? s.replace(' ', 'T')
        : `${s}T${endOfDay ? '23:59:59' : '00:00:00'}`
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const [gy, gm, gd] = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3]));
  const d = new Date(gy, gm - 1, gd, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toTehranDisplay(dt) {
  if (!dt) return null;
  const d = dt instanceof Date ? dt : parseTime(dt);
  if (!d) return null;
  try {
    const jalali = formatJalali(d);
    const time = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tehran',
    });
    return { jalali, time, iso: d.toISOString() };
  } catch {
    return { jalali: null, time: null, iso: d.toISOString() };
  }
}

function normalizeJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNum(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getStatus(req, res) {
  const lastIngest = await getLatestIngestStatus().catch(() => null);
  return res.json({
    enabled: isGpsFinanceEnabled(),
    kingConfigured: isKingGpsConfigured(),
    ingestEnabled: isGpsIngestEnabled(),
    ingestSlots: ['06:30', '09:00', '12:00', '16:00'],
    ingestLookbackDays: 4,
    lastIngest,
  });
}

async function triggerFleetIngest(req, res) {
  try {
    const result = await runFleetIngest({
      slot: 'manual',
      triggerSource: 'manual',
    });
    return res.json({ ok: !result.error, ...result });
  } catch (err) {
    return res.status(500).json({ message: err?.message || 'خطا در اجرای ingest' });
  }
}

async function resolveImei(vehicleCode, assetKind) {
  const code = String(vehicleCode || '').trim();
  if (!code) return null;
  const kind = assetKind === 'semi_trailer' ? 'semi_trailer' : 'tractor';
  const exact = await pool.query(
    `SELECT imei, vehicle_code, asset_kind, plate_number
     FROM gps_resources
     WHERE is_active = TRUE AND vehicle_code = $1 AND asset_kind = $2
     LIMIT 1`,
    [code, kind]
  );
  if (exact.rows[0]) return exact.rows[0];

  const any = await pool.query(
    `SELECT imei, vehicle_code, asset_kind, plate_number
     FROM gps_resources
     WHERE is_active = TRUE AND vehicle_code = $1
     ORDER BY CASE WHEN asset_kind = 'tractor' THEN 0 ELSE 1 END
     LIMIT 5`,
    [code]
  );
  if (any.rows.length === 1) return any.rows[0];
  if (any.rows.length > 1) return { multiple: any.rows };

  const like = await pool.query(
    `SELECT imei, vehicle_code, asset_kind, plate_number
     FROM gps_resources
     WHERE is_active = TRUE AND vehicle_code ILIKE $1
     ORDER BY vehicle_code ASC
     LIMIT 10`,
    [`%${code}%`]
  );
  if (like.rows.length === 1) return like.rows[0];
  if (like.rows.length > 1) return { multiple: like.rows };
  return null;
}

async function getUsedIntervals(vehicleCode, excludeAnnouncementId) {
  const params = [vehicleCode];
  let sql = `
    SELECT announcement_id, tour_start, tour_end, selected_source, selected_mileage
    FROM gps_tour_snapshots
    WHERE vehicle_code = $1
  `;
  if (excludeAnnouncementId) {
    params.push(excludeAnnouncementId);
    sql += ` AND (announcement_id IS NULL OR announcement_id <> $2)`;
  }
  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({
    announcementId: r.announcement_id,
    start: new Date(r.tour_start),
    end: new Date(r.tour_end),
    selectedSource: r.selected_source,
    selectedMileage: r.selected_mileage != null ? Number(r.selected_mileage) : null,
  }));
}

function buildToursResponseFromRows(rows) {
  return rows.map((row, idx) => {
    const unloadDetails = normalizeJson(row.unload_stations_json, []);
    const zoneMarkers = normalizeJson(row.zone_markers_json, []);
    const rawFlags = normalizeJson(row.raw_flags, {});
    const detailSummary = row.detail_id
      ? (() => {
          const rawInside = toNum(row.stop_inside_h);
          const rawOutside = toNum(row.stop_outside_h);
          const rawLegal = toNum(row.stop_legal_h);
          const breakdown = normalizeJson(row.stop_breakdown_json, null);
          const hasBreakdown = breakdown && (breakdown.unloadStops || breakdown.legalIntervals);
          // داده قدیمی: فقط stop_outside_h = توقف کل پر شده بود
          const isLegacy = rawInside == null && rawLegal == null && rawOutside != null;
          const stopLegalHours = isLegacy ? null : rawLegal;
          const stopEnRouteHours = isLegacy ? null : rawOutside;
          const stopTotalHours = isLegacy
            ? rawOutside
            : rawInside != null
              ? rawInside
              : stopLegalHours != null || stopEnRouteHours != null
                ? Math.round(((stopLegalHours || 0) + (stopEnRouteHours || 0)) * 100) / 100
                : null;
          return {
            drivingHours: toNum(row.driving_hours),
            drivingPercent: toNum(row.driving_percent),
            totalDurationHours: toNum(row.total_duration_hours),
            stopTotalHours,
            stopLegalHours,
            stopEnRouteHours,
            stopUnloadHours: hasBreakdown ? toNum(breakdown.stopUnloadHours) : null,
            stopInsideHours: stopTotalHours,
            stopOutsideHours: stopEnRouteHours,
            overspeedRuleCount: toNum(row.overspeed_rule_count),
            maxSpeed: toNum(row.detail_max_speed),
            fuelLPer100Km: toNum(row.fuel_l_per_100km),
            mileageGpsTrack: toNum(row.mileage_gps_track),
            computedAt: row.detail_computed_at || null,
            samplePoints: normalizeJson(row.sample_points_json, []),
            stopBreakdown: hasBreakdown ? breakdown : null,
            unloadStops: hasBreakdown ? breakdown.unloadStops || [] : null,
            legalIntervals: hasBreakdown ? breakdown.legalIntervals || [] : null,
            overspeedDetails: normalizeJson(row.overspeed_details_json, []),
            fuelEvents: normalizeJson(row.fuel_events_json, null) || [],
          };
        })()
      : null;

    return {
      index: idx,
      tourId: row.id,
      tourKey: row.tour_key,
      startHub: row.start_hub,
      endHub: row.end_hub,
      startTime: row.tour_start,
      endTime: row.tour_end,
      startDisplay: toTehranDisplay(row.tour_start),
      endDisplay: toTehranDisplay(row.tour_end),
      unloadStations: unloadDetails.map((u) => u.zone).join(' - ') || '-',
      unloadCount: unloadDetails.length,
      unloadDetails,
      mileageCan: toNum(row.mileage_can),
      mileageGps: toNum(row.mileage_gps),
      mileageGpsTrack: toNum(row.mileage_gps_track),
      diffCanMinusGps:
        row.mileage_can != null && row.mileage_gps != null
          ? Math.round((Number(row.mileage_can) - Number(row.mileage_gps)) * 10) / 10
          : null,
      mileageGo: toNum(row.mileage_go),
      mileageBack: toNum(row.mileage_back),
      hoursToDest: toNum(row.hours_to_dest),
      hoursBack: toNum(row.hours_back),
      hoursTotal: toNum(row.hours_total),
      drivingHours: detailSummary?.drivingHours ?? null,
      stopHours: detailSummary?.stopTotalHours ?? null,
      overspeedCount: detailSummary?.overspeedRuleCount ?? toNum(row.overspeed_count_events) ?? 0,
      overspeedCountEvents: toNum(row.overspeed_count_events) ?? 0,
      maxSpeed: detailSummary?.maxSpeed ?? 0,
      zoneEvents: zoneMarkers,
      zoneMarkers,
      fuelStartTotal: toNum(row.fuel_start_total),
      fuelEndTotal: toNum(row.fuel_end_total),
      fuelUsedTotal: toNum(row.fuel_used_total),
      tankLevelStart: toNum(row.tank_level_start),
      tankLevelEnd: toNum(row.tank_level_end),
      engineTempStart: toNum(row.engine_temp_start),
      engineTempEnd: toNum(row.engine_temp_end),
      airTempStart: toNum(row.air_temp_start),
      airTempEnd: toNum(row.air_temp_end),
      stoppedCountEvents: toNum(row.stopped_count_events) ?? 0,
      rawFlags,
      detailStatus: row.detail_id ? 'ready' : 'none',
      detailSummary,
      blocked: false,
      overlap: false,
    };
  });
}

async function calculateTours(req, res) {
  try {
    const vehicleCode = String(req.body?.vehicleCode || '').trim();
    const fromJalali = req.body?.fromDate;
    const toJalali = req.body?.toDate;
    const days = Number(req.body?.days);
    const assetKind = req.body?.assetKind;
    const announcementId = req.body?.announcementId || null;
    const approvedKilometers =
      req.body?.approvedKilometers != null ? Number(req.body.approvedKilometers) : null;

    if (!vehicleCode) return res.status(400).json({ message: 'کد خودرو الزامی است.' });

    let fromDt = parseJalaliOrIsoToDate(fromJalali, false);
    let toDt = parseJalaliOrIsoToDate(toJalali, true);
    if (!fromDt && fromJalali) {
      return res.status(400).json({ message: 'تاریخ شروع نامعتبر است (شمسی YYYY/MM/DD).' });
    }
    if (!fromDt) {
      return res.status(400).json({ message: 'تاریخ شروع الزامی است.' });
    }
    if (!toDt) {
      const d = Number.isFinite(days) && days > 0 ? days : 5;
      toDt = new Date(fromDt.getTime() + d * 86400000);
      toDt.setHours(23, 59, 59, 0);
    }
    if (toDt <= fromDt) {
      return res.status(400).json({ message: 'بازه تاریخ نامعتبر است.' });
    }

    const imeiRow = await resolveImei(vehicleCode, assetKind);
    if (!imeiRow) {
      return res.status(404).json({
        message: 'برای این کد خودرو IMEI در منابع GPS ثبت نشده است.',
        needImei: true,
      });
    }
    if (imeiRow.multiple) {
      return res.status(409).json({
        message: 'چند منبع GPS برای این کد یافت شد. نوع متحرک (کشنده/نیمه یدک) را مشخص کنید.',
        options: imeiRow.multiple,
      });
    }

    const imei = String(imeiRow.imei);
    const fromStr = formatDt(fromDt);
    const toStr = formatDt(toDt);
    const timings = {};
    const t0 = Date.now();
    const forceLive = req.body?.live === true || req.body?.live === '1';
    let servedFrom = 'catalog';
    let storedRows = [];
    let eventsRaw = [];
    let zoneEvents = [];
    let tours = [];

    if (!forceLive) {
      storedRows = await loadToursOverlapping(imei, fromDt, toDt);
      timings.catalogMs = Date.now() - t0;
    }

    if (forceLive || !storedRows.length) {
      servedFrom = 'king';
      const ingested = await fetchAndUpsertVehicle({
        imei,
        vehicleCode: imeiRow.vehicle_code || vehicleCode,
        fromDt,
        toDt,
      });
      timings.eventsMs = ingested.eventsMs;
      if (!ingested.ok) {
        console.error('❌ [gps-finance] King events:', ingested.error);
        return res.status(502).json({
          message: ingested.error || 'خطا در دریافت رویداد GPS',
          kingError: true,
          kingUnreachable: true,
          timings,
          debug: {
            hint: ingested.error,
            searchFrom: fromStr,
            searchTo: toStr,
            timings,
            rawEventCount: 0,
            zoneEventCount: 0,
            tourCount: 0,
            kingUnreachable: true,
          },
        });
      }
      storedRows = ingested.rows;
      eventsRaw = ingested.eventsRaw || [];
      zoneEvents = ingested.zoneEvents || [];
      tours = ingested.tours || [];
    }

    const used = await getUsedIntervals(imeiRow.vehicle_code || vehicleCode, announcementId);
    const candidates = buildToursResponseFromRows(storedRows).map((t) => {
      const start = parseTime(t.startTime);
      const end = parseTime(t.endTime);
      const overlap = used.some((u) => start && end && intervalsOverlap(start, end, u.start, u.end));
      return { ...t, overlap, blocked: overlap };
    });

    timings.totalMs = Date.now() - t0;
    const debug = servedFrom === 'king'
      ? buildZoneDebug(eventsRaw, zoneEvents, tours)
      : {
          rawEventCount: 0,
          zoneEventCount: 0,
          tourCount: candidates.length,
          hint: 'از سینی ingest دیتابیس',
        };
    debug.timings = timings;
    debug.includeTelemetry = false;
    debug.searchFrom = fromStr;
    debug.searchTo = toStr;
    debug.servedFrom = servedFrom;

    console.log(
      `📡 [gps-finance] IMEI=${imei} code=${vehicleCode} from=${servedFrom} tours=${candidates.length} ${timings.totalMs}ms`
    );

    return res.json({
      enabled: true,
      servedFrom,
      vehicleCode: imeiRow.vehicle_code || vehicleCode,
      imei,
      assetKind: imeiRow.asset_kind,
      searchFrom: fromStr,
      searchTo: toStr,
      searchFromDisplay: toTehranDisplay(fromDt),
      searchToDisplay: toTehranDisplay(toDt),
      approvedKilometers: Number.isFinite(approvedKilometers) ? approvedKilometers : null,
      messageCount: 0,
      eventCount: zoneEvents.length,
      rawEventCount: Array.isArray(eventsRaw) ? eventsRaw.length : 0,
      timings,
      debug,
      tours: candidates,
    });
  } catch (err) {
    console.error('❌ [gps-finance] calculateTours', err);
    return res.status(500).json({ message: err?.message || 'خطا در محاسبه GPS' });
  }
}

function decorateFuelEvents(events) {
  return (events || []).map((e) => {
    const atDisp = toTehranDisplay(e.atIso);
    const startDisp = toTehranDisplay(e.startIso);
    return {
      ...e,
      atJalali: atDisp?.jalali || null,
      atTime: atDisp?.time || null,
      startJalali: startDisp?.jalali || null,
      startTime: startDisp?.time || null,
    };
  });
}

function detailPayloadFromRow(row, tourId, tourIn) {
  const breakdown = normalizeJson(row.stop_breakdown_json, {}) || {};
  return {
    tourId,
    drivingHours: toNum(row.driving_hours),
    drivingPercent: toNum(row.driving_percent),
    totalDurationHours: toNum(row.total_duration_hours) ?? tourIn?.hoursTotal ?? null,
    stopTotalHours: toNum(row.stop_inside_h),
    stopUnloadHours: toNum(breakdown.stopUnloadHours),
    stopLegalHours: toNum(row.stop_legal_h),
    stopEnRouteHours: toNum(row.stop_outside_h),
    stopInsideHours: toNum(row.stop_inside_h),
    stopOutsideHours: toNum(row.stop_outside_h),
    unloadStops: breakdown.unloadStops || [],
    legalIntervals: breakdown.legalIntervals || [],
    stopBreakdown: breakdown,
    overspeedRuleCount: toNum(row.overspeed_rule_count) ?? 0,
    maxSpeed: toNum(row.max_speed) ?? 0,
    overspeedDetails: normalizeJson(row.overspeed_details_json, []),
    fuelLPer100Km: toNum(row.fuel_l_per_100km),
    mileageGpsTrack: tourIn?.mileageGpsTrack ?? null,
    samplePoints: normalizeJson(row.sample_points_json, []),
    fuelEvents: normalizeJson(row.fuel_events_json, []) || [],
    computedAt: row.computed_at || null,
  };
}

async function computeAndPersistTourDetails(imei, tourId, tourIn) {
  const start = parseTime(tourIn?.startTime);
  const end = parseTime(tourIn?.endTime);
  if (!imei || !tourId || !start || !end || end <= start) {
    return { ok: false, error: 'اطلاعات تور ناقص است.' };
  }

  const t0 = Date.now();
  try {
    const cached = await pool.query(
      `SELECT * FROM gps_tour_details WHERE tour_id = $1 AND fuel_events_json IS NOT NULL LIMIT 1`,
      [tourId]
    );
    if (cached.rows[0]) {
      return {
        ok: true,
        cached: true,
        messageCount: 0,
        timings: { totalMs: Date.now() - t0 },
        detail: detailPayloadFromRow(cached.rows[0], tourId, tourIn),
      };
    }
  } catch (e) {
    console.warn('⚠️ [gps-finance] detail cache lookup skipped:', e.message);
  }

  const messagesResult = await getMessages(imei, formatDt(start), formatDt(end));
  if (messagesResult && messagesResult.error && !Array.isArray(messagesResult)) {
    return { ok: false, error: messagesResult.error, timings: { totalMs: Date.now() - t0 } };
  }

  const messages = Array.isArray(messagesResult) ? messagesResult : [];
  let unloadDetails = tourIn.unloadDetails || [];
  if ((!unloadDetails || !unloadDetails.length) && tourId) {
    try {
      const tr = await pool.query(`SELECT unload_stations_json FROM gps_tours WHERE id = $1`, [tourId]);
      unloadDetails = normalizeJson(tr.rows[0]?.unload_stations_json, []) || [];
    } catch (_) {
      unloadDetails = [];
    }
  }
  const enriched = enrichTourDrivingStats(
    {
      startTime: tourIn.startTime,
      endTime: tourIn.endTime,
      hoursTotal: tourIn.hoursTotal,
      unloadDetails,
      mileageCan: tourIn.mileageCan,
      mileageGps: tourIn.mileageGps,
      fuelUsedTotal: tourIn.fuelUsedTotal,
    },
    messages
  );
  const samplePoints = takeSamplePoints(messages, 6);
  const drivingPercent =
    enriched.drivingHours != null && tourIn.hoursTotal
      ? Math.round((Number(enriched.drivingHours) / Number(tourIn.hoursTotal)) * 1000) / 10
      : null;
  const baseMileage =
    tourIn.mileageCan != null && Number(tourIn.mileageCan) > 0
      ? Number(tourIn.mileageCan)
      : tourIn.mileageGps != null && Number(tourIn.mileageGps) > 0
        ? Number(tourIn.mileageGps)
        : enriched.mileageGpsTrack != null && Number(enriched.mileageGpsTrack) > 0
          ? Number(enriched.mileageGpsTrack)
          : null;
  const fuelLPer100Km =
    tourIn.fuelUsedTotal != null && Number.isFinite(baseMileage) && baseMileage > 0
      ? Math.round((Number(tourIn.fuelUsedTotal) / baseMileage) * 100 * 100) / 100
      : null;

  const stopBreakdown = enriched.stopBreakdown || {
    stopTotalHours: enriched.stopTotalHours,
    stopUnloadHours: enriched.stopUnloadHours,
    stopLegalHours: enriched.stopLegalHours,
    stopEnRouteHours: enriched.stopEnRouteHours,
    unloadStops: enriched.unloadStops || [],
    legalIntervals: enriched.legalIntervals || [],
  };

  if (tourId && enriched.mileageGpsTrack != null) {
    try {
      await pool.query(`UPDATE gps_tours SET mileage_gps_track = $1, updated_at = NOW() WHERE id = $2`, [
        enriched.mileageGpsTrack,
        tourId,
      ]);
    } catch (e) {
      console.warn('⚠️ [gps-finance] mileage_gps_track update skipped:', e.message);
    }
  }

  await pool.query(
    `
    INSERT INTO gps_tour_details (
      id, tour_id, driving_hours, driving_percent, total_duration_hours,
      stop_inside_h, stop_outside_h, stop_legal_h,
      overspeed_rule_count, max_speed, fuel_l_per_100km, sample_points_json, stop_breakdown_json,
      overspeed_details_json, fuel_events_json, computed_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,
      $9,$10,$11,$12::jsonb,$13::jsonb,
      $14::jsonb,$15::jsonb,NOW()
    )
    ON CONFLICT (tour_id) DO UPDATE SET
      driving_hours = EXCLUDED.driving_hours,
      driving_percent = EXCLUDED.driving_percent,
      total_duration_hours = EXCLUDED.total_duration_hours,
      stop_inside_h = EXCLUDED.stop_inside_h,
      stop_outside_h = EXCLUDED.stop_outside_h,
      stop_legal_h = EXCLUDED.stop_legal_h,
      overspeed_rule_count = EXCLUDED.overspeed_rule_count,
      max_speed = EXCLUDED.max_speed,
      fuel_l_per_100km = EXCLUDED.fuel_l_per_100km,
      sample_points_json = EXCLUDED.sample_points_json,
      stop_breakdown_json = EXCLUDED.stop_breakdown_json,
      overspeed_details_json = EXCLUDED.overspeed_details_json,
      fuel_events_json = EXCLUDED.fuel_events_json,
      computed_at = NOW()
    `,
    [
      newId(),
      tourId,
      enriched.drivingHours ?? null,
      drivingPercent,
      tourIn.hoursTotal ?? null,
      enriched.stopTotalHours ?? enriched.stopHours ?? null,
      enriched.stopEnRouteHours ?? null,
      enriched.stopLegalHours ?? null,
      enriched.overspeedCount ?? 0,
      enriched.maxSpeed ?? 0,
      fuelLPer100Km,
      JSON.stringify(samplePoints),
      JSON.stringify(stopBreakdown),
      JSON.stringify(enriched.overspeedDetails || []),
      JSON.stringify(decorateFuelEvents(enriched.fuelEvents || [])),
    ]
  );

  const fuelEvents = decorateFuelEvents(enriched.fuelEvents || []);
  const detail = {
    tourId,
    drivingHours: enriched.drivingHours ?? null,
    drivingPercent,
    totalDurationHours: tourIn.hoursTotal ?? null,
    stopTotalHours: enriched.stopTotalHours ?? enriched.stopHours ?? null,
    stopUnloadHours: enriched.stopUnloadHours ?? null,
    stopLegalHours: enriched.stopLegalHours ?? null,
    stopEnRouteHours: enriched.stopEnRouteHours ?? null,
    stopInsideHours: enriched.stopTotalHours ?? enriched.stopHours ?? null,
    stopOutsideHours: enriched.stopEnRouteHours ?? null,
    unloadStops: enriched.unloadStops || [],
    legalIntervals: enriched.legalIntervals || [],
    stopBreakdown,
    overspeedRuleCount: enriched.overspeedCount ?? 0,
    maxSpeed: enriched.maxSpeed ?? 0,
    overspeedDetails: enriched.overspeedDetails || [],
    fuelLPer100Km,
    mileageGpsTrack: enriched.mileageGpsTrack ?? null,
    samplePoints,
    fuelEvents,
    computedAt: new Date().toISOString(),
  };

  console.log(
    `📡 [gps-finance] tourDetails IMEI=${imei} msgs=${messages.length} tour=${tourId} ${Date.now() - t0}ms`
  );

  return {
    ok: true,
    messageCount: messages.length,
    timings: { totalMs: Date.now() - t0 },
    detail,
  };
}

function queueTourDetailsComputation(imei, tourId, tour) {
  if (!imei || !tourId || !tour?.startTime || !tour?.endTime) return;
  setImmediate(() => {
    computeAndPersistTourDetails(String(imei), String(tourId), tour).catch((err) => {
      console.error('❌ [gps-finance] background tourDetails', err);
    });
  });
}

async function applyTourSelection(req, res) {
  try {
    const {
      announcementId,
      driverCalculationId,
      vehicleCode,
      imei,
      tourId,
      searchFrom,
      searchTo,
      tour,
      selectedSource,
      approvedKilometers,
    } = req.body || {};

    if (!imei || !tour?.startTime || !tour?.endTime) {
      return res.status(400).json({ message: 'اطلاعات تور ناقص است.' });
    }
    const source = String(selectedSource || '').toLowerCase();
    if (!['approved', 'can', 'gps', 'track'].includes(source)) {
      return res.status(400).json({ message: 'منبع باید approved یا can یا gps یا track باشد.' });
    }

    let selectedMileage = null;
    if (source === 'can') selectedMileage = tour.mileageCan;
    else if (source === 'gps') selectedMileage = tour.mileageGps;
    else if (source === 'track') {
      selectedMileage =
        tour.mileageGpsTrack ??
        tour.detailSummary?.mileageGpsTrack ??
        (approvedKilometers != null ? Number(approvedKilometers) : null);
    } else selectedMileage = approvedKilometers != null ? Number(approvedKilometers) : null;

    if (source !== 'approved' && (selectedMileage == null || !Number.isFinite(Number(selectedMileage)))) {
      return res.status(400).json({ message: 'برای این منبع، عدد پیمایش معتبر نیست.' });
    }

    const start = parseTime(tour.startTime);
    const end = parseTime(tour.endTime);
    if (!start || !end) return res.status(400).json({ message: 'زمان شروع/پایان تور نامعتبر است.' });

    const code = String(vehicleCode || '').trim();
    if (code) {
      const used = await getUsedIntervals(code, announcementId || null);
      const overlap = used.some((u) => intervalsOverlap(start, end, u.start, u.end));
      if (overlap) {
        return res.status(409).json({ message: 'این بازه GPS قبلاً برای ردیف دیگری ثبت شده و همپوشانی دارد.' });
      }
    }

    const id = newId();
    const searchFromDt = parseTime(searchFrom) || start;
    const searchToDt = parseTime(searchTo) || end;
    const userId = req.user?.id || req.user?.username || null;

    await pool.query(
      `
      INSERT INTO gps_tour_snapshots (
        id, announcement_id, driver_calculation_id, vehicle_code, imei,
        gps_tour_id, search_from, search_to, tour_start, tour_end,
        start_hub, end_hub, mileage_can, mileage_gps, mileage_gps_track,
        selected_source, selected_mileage, payload, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,
        $16,$17,$18::jsonb,$19
      )
      `,
      [
        id,
        announcementId || null,
        driverCalculationId || null,
        code || null,
        String(imei),
        tourId || null,
        searchFromDt.toISOString(),
        searchToDt.toISOString(),
        start.toISOString(),
        end.toISOString(),
        tour.startHub || null,
        tour.endHub || null,
        tour.mileageCan ?? null,
        tour.mileageGps ?? null,
        tour.mileageGpsTrack ?? null,
        source,
        selectedMileage,
        JSON.stringify(tour),
        userId,
      ]
    );

    if (driverCalculationId) {
      try {
        await pool.query(
          `UPDATE driver_calculations SET mileage_source = $1, updated_at = NOW() WHERE id = $2`,
          [source, driverCalculationId]
        );
      } catch (e) {
        console.warn('⚠️ mileage_source update skipped:', e.message);
      }
    } else if (announcementId) {
      try {
        await pool.query(
          `UPDATE driver_calculations SET mileage_source = $1, updated_at = NOW() WHERE announcement_id = $2`,
          [source, announcementId]
        );
      } catch (e) {
        console.warn('⚠️ mileage_source update skipped:', e.message);
      }
    }

    const resolvedTourId = tourId || null;
    const detailQueued = !!(resolvedTourId && tour?.startTime && tour?.endTime);
    if (detailQueued) {
      queueTourDetailsComputation(String(imei), resolvedTourId, tour);
    }

    return res.status(201).json({
      ok: true,
      snapshotId: id,
      selectedSource: source,
      selectedMileage,
      detailQueued,
      message: detailQueued
        ? 'انتخاب GPS ذخیره شد؛ جزئیات تور در پس‌زمینه محاسبه می‌شود.'
        : 'انتخاب GPS ذخیره شد.',
    });
  } catch (err) {
    console.error('❌ [gps-finance] applyTourSelection', err);
    return res.status(500).json({ message: err?.message || 'خطا در ذخیره انتخاب GPS' });
  }
}

async function enrichDriving(req, res) {
  try {
    const imei = String(req.body?.imei || '').trim();
    const tourId = String(req.body?.tourId || '').trim();
    const tourIn = req.body?.tour || null;
    if (!imei) return res.status(400).json({ message: 'IMEI الزامی است.' });
    if (!tourIn?.startTime || !tourIn?.endTime) {
      return res.status(400).json({ message: 'اطلاعات تور ناقص است.' });
    }

    const result = await computeAndPersistTourDetails(imei, tourId || null, tourIn);
    if (!result.ok) {
      const status = result.error && /King|TLS|Timeout|fetch/i.test(result.error) ? 502 : 400;
      return res.status(status).json({
        message: result.error || 'خطا در محاسبه رانندگی',
        kingError: status === 502,
        timings: result.timings,
      });
    }

    return res.json({
      ok: true,
      messageCount: result.messageCount,
      timings: result.timings,
      detail: result.detail,
    });
  } catch (err) {
    console.error('❌ [gps-finance] enrichDriving', err);
    return res.status(500).json({ message: err?.message || 'خطا در محاسبه رانندگی' });
  }
}

module.exports = {
  isGpsFinanceEnabled,
  requireGpsFinance,
  getStatus,
  triggerFleetIngest,
  calculateTours,
  enrichDriving,
  applyTourSelection,
};
