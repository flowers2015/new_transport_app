const { isGpsIngestEnabled, tehranDateTime, runFleetIngest } = require('./gpsFleetIngest');

const DEFAULT_SLOTS = ['06:30', '09:00', '12:00', '16:00'];
const TICK_MS = 20 * 1000;

function parseSlots() {
  const raw = String(process.env.GPS_INGEST_SLOTS || '').trim();
  if (!raw) return DEFAULT_SLOTS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{2}:\d{2}$/.test(s));
}

let timer = null;
let lastFiredKey = '';

function startGpsIngestScheduler() {
  if (!isGpsIngestEnabled()) {
    console.log('⏭️ [gps-ingest] scheduler off (GPS_INGEST_ENABLED / KING_GPS_API_KEY)');
    return;
  }
  if (timer) return;

  const slots = parseSlots();
  console.log(`⏰ [gps-ingest] scheduler Tehran slots: ${slots.join(', ')} (lookback 4d, events only)`);

  timer = setInterval(() => {
    const { date, hm } = tehranDateTime();
    if (!slots.includes(hm)) return;
    const key = `${date}|${hm}`;
    if (key === lastFiredKey) return;
    lastFiredKey = key;
    console.log(`⏰ [gps-ingest] slot hit ${hm} Asia/Tehran`);
    runFleetIngest({ slot: hm, triggerSource: 'schedule' }).catch((err) => {
      console.error('❌ [gps-ingest] scheduled run:', err?.message || err);
    });
  }, TICK_MS);

  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
  startGpsIngestScheduler,
  DEFAULT_SLOTS,
};
