const crypto = require('crypto');
const pool = require('../db');
const { isKingGpsConfigured } = require('./kingGpsClient');
const { fetchAndUpsertVehicle } = require('./gpsTourCatalog');

const LOOKBACK_DAYS = Number(process.env.GPS_INGEST_LOOKBACK_DAYS || 4);
const ADVISORY_LOCK_KEY = 88221001;
const BETWEEN_VEHICLE_MS = Number(process.env.GPS_INGEST_PAUSE_MS || 250);

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tehranDateTime(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hm: `${get('hour')}:${get('minute')}`,
  };
}

function lookbackWindow(now = new Date()) {
  const days = Number.isFinite(LOOKBACK_DAYS) && LOOKBACK_DAYS > 0 ? LOOKBACK_DAYS : 4;
  const toDt = now;
  const fromDt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { fromDt, toDt, lookbackDays: days };
}

function isGpsIngestEnabled() {
  const v = String(process.env.GPS_INGEST_ENABLED ?? 'true').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  return isKingGpsConfigured();
}

async function listActiveImeiResources() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (TRIM(imei))
      TRIM(imei) AS imei,
      vehicle_code,
      asset_kind
    FROM gps_resources
    WHERE is_active = TRUE
      AND imei IS NOT NULL
      AND TRIM(imei) <> ''
    ORDER BY TRIM(imei), vehicle_code
  `);
  return rows;
}

async function markStaleRunsFailed() {
  await pool.query(
    `
    UPDATE gps_ingest_runs
    SET status = 'failed',
        error_summary = COALESCE(error_summary, '') || ' (قطع به‌خاطر اجرای کهنه)',
        finished_at = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '4 hours'
    `
  );
}

async function runFleetIngest({ slot, triggerSource = 'schedule' } = {}) {
  if (!isGpsIngestEnabled()) {
    return { skipped: true, reason: 'ingest_disabled' };
  }

  const lock = await pool.query('SELECT pg_try_advisory_lock($1) AS ok', [ADVISORY_LOCK_KEY]);
  if (!lock.rows[0]?.ok) {
    console.log('⏭️ [gps-ingest] skipped: another ingest is running');
    return { skipped: true, reason: 'locked' };
  }

  const runId = newId();
  try {
    await markStaleRunsFailed();
    const { fromDt, toDt, lookbackDays } = lookbackWindow();
    const { date: tehranDate } = tehranDateTime();
    const slotLabel = String(slot || triggerSource || 'manual').slice(0, 8);

    try {
      await pool.query(
        `
        INSERT INTO gps_ingest_runs (
          id, tehran_date, slot, trigger_source, lookback_days,
          window_from, window_to, status
        ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, 'running')
        `,
        [runId, tehranDate, slotLabel, triggerSource, lookbackDays, fromDt.toISOString(), toDt.toISOString()]
      );
    } catch (e) {
      if (e?.code === '23505') {
        console.log(`⏭️ [gps-ingest] slot ${tehranDate} ${slotLabel} already done/running`);
        return { skipped: true, reason: 'slot_exists', tehranDate, slot: slotLabel };
      }
      throw e;
    }

    const resources = await listActiveImeiResources();
    await pool.query(`UPDATE gps_ingest_runs SET vehicle_total = $1 WHERE id = $2`, [
      resources.length,
      runId,
    ]);

    console.log(
      `📡 [gps-ingest] start slot=${slotLabel} vehicles=${resources.length} window=${lookbackDays}d`
    );

    let ok = 0;
    let failed = 0;
    let toursUpserted = 0;

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      const vehicleRunId = newId();
      const started = new Date();
      try {
        const result = await fetchAndUpsertVehicle({
          imei: r.imei,
          vehicleCode: r.vehicle_code,
          fromDt,
          toDt,
        });
        if (!result.ok) {
          failed += 1;
          await pool.query(
            `
            INSERT INTO gps_ingest_vehicle_runs (
              id, run_id, vehicle_code, imei, status, tours_count, raw_event_count,
              events_ms, error_text, started_at, finished_at
            ) VALUES ($1,$2,$3,$4,'failed',$5,$6,$7,$8,$9,NOW())
            `,
            [
              vehicleRunId,
              runId,
              r.vehicle_code,
              r.imei,
              0,
              0,
              result.eventsMs,
              String(result.error || 'King error').slice(0, 500),
              started.toISOString(),
            ]
          );
        } else {
          ok += 1;
          toursUpserted += result.toursCount;
          await pool.query(
            `
            INSERT INTO gps_ingest_vehicle_runs (
              id, run_id, vehicle_code, imei, status, tours_count, raw_event_count,
              events_ms, error_text, started_at, finished_at
            ) VALUES ($1,$2,$3,$4,'success',$5,$6,$7,NULL,$8,NOW())
            `,
            [
              vehicleRunId,
              runId,
              r.vehicle_code,
              r.imei,
              result.toursCount,
              result.rawEventCount,
              result.eventsMs,
              started.toISOString(),
            ]
          );
        }
      } catch (err) {
        failed += 1;
        await pool.query(
          `
          INSERT INTO gps_ingest_vehicle_runs (
            id, run_id, vehicle_code, imei, status, tours_count, raw_event_count,
            error_text, started_at, finished_at
          ) VALUES ($1,$2,$3,$4,'failed',0,0,$5,$6,NOW())
          `,
          [
            vehicleRunId,
            runId,
            r.vehicle_code,
            r.imei,
            String(err?.message || err).slice(0, 500),
            started.toISOString(),
          ]
        );
      }

      if (i < resources.length - 1 && BETWEEN_VEHICLE_MS > 0) {
        await sleep(BETWEEN_VEHICLE_MS);
      }
    }

    const status = failed && !ok ? 'failed' : 'success';
    const errorSummary =
      failed > 0 ? `${failed} خودرو ناموفق از ${resources.length}` : null;
    await pool.query(
      `
      UPDATE gps_ingest_runs
      SET status = $1,
          vehicle_ok = $2,
          vehicle_failed = $3,
          tours_upserted = $4,
          error_summary = $5,
          finished_at = NOW()
      WHERE id = $6
      `,
      [status, ok, failed, toursUpserted, errorSummary, runId]
    );

    console.log(
      `✅ [gps-ingest] done slot=${slotLabel} ok=${ok} failed=${failed} tours=${toursUpserted}`
    );
    return {
      skipped: false,
      runId,
      slot: slotLabel,
      tehranDate,
      vehicleTotal: resources.length,
      vehicleOk: ok,
      vehicleFailed: failed,
      toursUpserted,
      status,
    };
  } catch (err) {
    console.error('❌ [gps-ingest] run failed:', err?.message || err);
    try {
      await pool.query(
        `
        UPDATE gps_ingest_runs
        SET status = 'failed', error_summary = $1, finished_at = NOW()
        WHERE id = $2 AND status = 'running'
        `,
        [String(err?.message || err).slice(0, 500), runId]
      );
    } catch (_) {
      /* ignore */
    }
    return { skipped: false, error: err?.message || String(err) };
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
  }
}

async function getLatestIngestStatus() {
  const { rows } = await pool.query(
    `
    SELECT id, tehran_date, slot, trigger_source, lookback_days, status,
           vehicle_total, vehicle_ok, vehicle_failed, tours_upserted,
           error_summary, started_at, finished_at, window_from, window_to
    FROM gps_ingest_runs
    ORDER BY started_at DESC
    LIMIT 1
    `
  );
  return rows[0] || null;
}

module.exports = {
  LOOKBACK_DAYS,
  isGpsIngestEnabled,
  tehranDateTime,
  lookbackWindow,
  runFleetIngest,
  getLatestIngestStatus,
};
