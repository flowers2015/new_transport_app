const crypto = require('crypto');
const pool = require('../db');
const { getEvents, formatDt } = require('./kingGpsClient');
const {
  parseZoneEvents,
  parseRawEvents,
  detectTours,
  parseTime,
  summarizeEventOnlyTour,
} = require('./gpsTourAnalyzer');

function newCatalogId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function tourKey(imei, startTime, endTime) {
  return crypto.createHash('sha1').update(`${imei}|${startTime}|${endTime}`).digest('hex');
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
        newCatalogId(),
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
      d.stop_breakdown_json,
      d.overspeed_details_json,
      d.fuel_events_json
    FROM gps_tours t
    LEFT JOIN gps_tour_details d ON d.tour_id = t.id
    WHERE t.tour_key = ANY($1::text[])
    ORDER BY t.tour_start ASC
    `,
    [keys]
  );
  return rows;
}

async function loadToursOverlapping(imei, fromDt, toDt) {
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
      d.stop_breakdown_json,
      d.overspeed_details_json,
      d.fuel_events_json
    FROM gps_tours t
    LEFT JOIN gps_tour_details d ON d.tour_id = t.id
    WHERE t.imei = $1
      AND t.tour_end >= $2
      AND t.tour_start <= $3
    ORDER BY t.tour_start ASC
    `,
    [String(imei), fromDt.toISOString(), toDt.toISOString()]
  );
  return rows;
}

async function fetchAndUpsertVehicle({ imei, vehicleCode, fromDt, toDt }) {
  const fromStr = formatDt(fromDt);
  const toStr = formatDt(toDt);
  const tEvents = Date.now();
  const eventsRaw = await getEvents(imei, fromStr, toStr);
  const eventsMs = Date.now() - tEvents;

  if (eventsRaw && eventsRaw.error) {
    return {
      ok: false,
      error: eventsRaw.error,
      eventsMs,
      toursCount: 0,
      rawEventCount: 0,
      zoneEventCount: 0,
      rows: [],
      eventsRaw: null,
      zoneEvents: [],
      tours: [],
      fromStr,
      toStr,
    };
  }

  const list = Array.isArray(eventsRaw) ? eventsRaw : [];
  const rawEvents = parseRawEvents(list);
  const zoneEvents = parseZoneEvents(list);
  const tours = detectTours(zoneEvents, []);
  const rows = await upsertToursAndLoad(imei, vehicleCode, tours, rawEvents);
  return {
    ok: true,
    error: null,
    eventsMs,
    toursCount: tours.length,
    rawEventCount: list.length,
    zoneEventCount: zoneEvents.length,
    rows,
    eventsRaw: list,
    zoneEvents,
    tours,
    fromStr,
    toStr,
  };
}

module.exports = {
  tourKey,
  upsertToursAndLoad,
  loadToursOverlapping,
  fetchAndUpsertVehicle,
};
