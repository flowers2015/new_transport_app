const crypto = require('crypto');
const pool = require('../db');
const { jalaliToGregorian, formatJalali } = require('../utils/jalali');
const { isKingGpsConfigured, getMessages, getEvents, formatDt } = require('../services/kingGpsClient');
const {
  parseZoneEvents,
  parseRawEvents,
  detectTours,
  intervalsOverlap,
  parseTime,
  buildZoneDebug,
  enrichTourDrivingStats,
  summarizeEventOnlyTour,
  takeSamplePoints,
} = require('../services/gpsTourAnalyzer');

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

function tourKey(imei, startTime, endTime) {
  return crypto.createHash('sha1').update(`${imei}|${startTime}|${endTime}`).digest('hex');
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
  return res.json({
    enabled: isGpsFinanceEnabled(),
    kingConfigured: isKingGpsConfigured(),
  });
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

async function upsertToursAndLoad(imei, vehicleCode, tours, rawEvents) {
  for (const t of tours || []) {
    const eventSummary = summarizeEventOnlyTour(t, rawEvents);
    const key = tourKey(imei, t.startTime, t.endTime);
    await pool.query(
      `
      INSERT INTO gps_tours (
        id, tour_key, vehicle_code, imei,
        start_hub, end_hub, tour_start, tour_end,
        unload_stations_json, zone_markers_json,
        odo_start_can, odo_end_can, odo_start_gps, odo_end_gps,
        mileage_can, mileage_gps, mileage_go, mileage_back,
        hours_to_dest, hours_back, hours_total,
        fuel_start_total, fuel_end_total, fuel_used_total,
        tank_level_start, tank_level_end,
        engine_temp_start, engine_temp_end, engine_temp_start_source, engine_temp_end_source,
        air_temp_start, air_temp_end, air_temp_start_source, air_temp_end_source,
        overspeed_count_events, stopped_count_events, raw_flags
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9::jsonb,$10::jsonb,
        $11,$12,$13,$14,
        $15,$16,$17,$18,
        $19,$20,$21,
        $22,$23,$24,
        $25,$26,
        $27,$28,$29,$30,
        $31,$32,$33,$34,
        $35,$36,$37::jsonb
      )
      ON CONFLICT (tour_key) DO UPDATE SET
        vehicle_code = EXCLUDED.vehicle_code,
        start_hub = EXCLUDED.start_hub,
        end_hub = EXCLUDED.end_hub,
        tour_start = EXCLUDED.tour_start,
        tour_end = EXCLUDED.tour_end,
        unload_stations_json = EXCLUDED.unload_stations_json,
        zone_markers_json = EXCLUDED.zone_markers_json,
        odo_start_can = EXCLUDED.odo_start_can,
        odo_end_can = EXCLUDED.odo_end_can,
        odo_start_gps = EXCLUDED.odo_start_gps,
        odo_end_gps = EXCLUDED.odo_end_gps,
        mileage_can = EXCLUDED.mileage_can,
        mileage_gps = EXCLUDED.mileage_gps,
        mileage_go = EXCLUDED.mileage_go,
        mileage_back = EXCLUDED.mileage_back,
        hours_to_dest = EXCLUDED.hours_to_dest,
        hours_back = EXCLUDED.hours_back,
        hours_total = EXCLUDED.hours_total,
        fuel_start_total = EXCLUDED.fuel_start_total,
        fuel_end_total = EXCLUDED.fuel_end_total,
        fuel_used_total = EXCLUDED.fuel_used_total,
        tank_level_start = EXCLUDED.tank_level_start,
        tank_level_end = EXCLUDED.tank_level_end,
        engine_temp_start = EXCLUDED.engine_temp_start,
        engine_temp_end = EXCLUDED.engine_temp_end,
        engine_temp_start_source = EXCLUDED.engine_temp_start_source,
        engine_temp_end_source = EXCLUDED.engine_temp_end_source,
        air_temp_start = EXCLUDED.air_temp_start,
        air_temp_end = EXCLUDED.air_temp_end,
        air_temp_start_source = EXCLUDED.air_temp_start_source,
        air_temp_end_source = EXCLUDED.air_temp_end_source,
        overspeed_count_events = EXCLUDED.overspeed_count_events,
        stopped_count_events = EXCLUDED.stopped_count_events,
        raw_flags = EXCLUDED.raw_flags,
        updated_at = NOW()
      `,
      [
        newId(),
        key,
        vehicleCode || null,
        String(imei),
        t.startHub || null,
        t.endHub || null,
        parseTime(t.startTime)?.toISOString() || t.startTime,
        parseTime(t.endTime)?.toISOString() || t.endTime,
        JSON.stringify(t.unloadDetails || []),
        JSON.stringify(eventSummary.zoneMarkers || []),
        t.startOdoCan ?? null,
        t.endOdoCan ?? null,
        t.startOdo ?? null,
        t.endOdo ?? null,
        t.mileageCan ?? null,
        t.mileageGps ?? null,
        t.mileageGo ?? null,
        t.mileageBack ?? null,
        t.hoursToDest ?? null,
        t.hoursBack ?? null,
        t.hoursTotal ?? null,
        eventSummary.fuelStartTotal ?? null,
        eventSummary.fuelEndTotal ?? null,
        eventSummary.fuelUsedTotal ?? null,
        eventSummary.tankLevelStart ?? null,
        eventSummary.tankLevelEnd ?? null,
        eventSummary.engineTempStart ?? null,
        eventSummary.engineTempEnd ?? null,
        eventSummary.engineTempStartSource ?? null,
        eventSummary.engineTempEndSource ?? null,
        eventSummary.airTempStart ?? null,
        eventSummary.airTempEnd ?? null,
        eventSummary.airTempStartSource ?? null,
        eventSummary.airTempEndSource ?? null,
        eventSummary.overspeedCountEvents ?? 0,
        eventSummary.stoppedCountEvents ?? 0,
        JSON.stringify(eventSummary.rawFlags || {}),
      ]
    );
  }

  if (!tours.length) return [];
  const keys = tours.map((t) => tourKey(imei, t.startTime, t.endTime));
  const { rows } = await pool.query(
    `
    SELECT
      t.*,
      d.id AS detail_id,
      d.driving_hours,
      d.driving_percent,
      d.total_duration_hours,
      d.stop_inside_h,
      d.stop_outside_h,
      d.stop_legal_h,
      d.overspeed_rule_count,
      d.max_speed AS detail_max_speed,
      d.fuel_l_per_100km,
      d.computed_at AS detail_computed_at,
      d.sample_points_json,
      d.stop_breakdown_json
    FROM gps_tours t
    LEFT JOIN gps_tour_details d ON d.tour_id = t.id
    WHERE t.tour_key = ANY($1::text[])
    ORDER BY t.tour_start ASC
    `,
    [keys]
  );
  return rows;
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
    const tEvents = Date.now();
    const eventsRaw = await getEvents(imei, fromStr, toStr);
    timings.eventsMs = Date.now() - tEvents;

    if (eventsRaw && eventsRaw.error) {
      console.error('❌ [gps-finance] King events:', eventsRaw.error);
      return res.status(502).json({
        message: eventsRaw.error || 'خطا در دریافت رویداد GPS',
        kingError: true,
        kingUnreachable: true,
        timings,
        debug: {
          hint: eventsRaw.error,
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

    const rawEvents = parseRawEvents(Array.isArray(eventsRaw) ? eventsRaw : []);
    const zoneEvents = parseZoneEvents(Array.isArray(eventsRaw) ? eventsRaw : []);
    const tours = detectTours(zoneEvents, []);
    const storedRows = await upsertToursAndLoad(imei, imeiRow.vehicle_code || vehicleCode, tours, rawEvents);
    const used = await getUsedIntervals(imeiRow.vehicle_code || vehicleCode, announcementId);
    const candidates = buildToursResponseFromRows(storedRows).map((t) => {
      const start = parseTime(t.startTime);
      const end = parseTime(t.endTime);
      const overlap = used.some((u) => start && end && intervalsOverlap(start, end, u.start, u.end));
      return { ...t, overlap, blocked: overlap };
    });

    timings.totalMs = Date.now() - t0;
    const debug = buildZoneDebug(eventsRaw, zoneEvents, tours);
    debug.timings = timings;
    debug.includeTelemetry = false;
    debug.searchFrom = fromStr;
    debug.searchTo = toStr;

    console.log(
      `📡 [gps-finance] IMEI=${imei} code=${vehicleCode} events=${debug.rawEventCount} msgs=0 tours=${candidates.length} ${timings.totalMs}ms`
    );

    return res.json({
      enabled: true,
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

async function computeAndPersistTourDetails(imei, tourId, tourIn) {
  const start = parseTime(tourIn?.startTime);
  const end = parseTime(tourIn?.endTime);
  if (!imei || !tourId || !start || !end || end <= start) {
    return { ok: false, error: 'اطلاعات تور ناقص است.' };
  }

  const t0 = Date.now();
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
      overspeed_rule_count, max_speed, fuel_l_per_100km, sample_points_json, stop_breakdown_json, computed_at
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,
      $9,$10,$11,$12::jsonb,$13::jsonb,NOW()
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
    ]
  );

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
    fuelLPer100Km,
    mileageGpsTrack: enriched.mileageGpsTrack ?? null,
    samplePoints,
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
  calculateTours,
  enrichDriving,
  applyTourSelection,
};
