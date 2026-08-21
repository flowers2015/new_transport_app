/**
 * کلاینت King GPS — نزدیک به new.py
 * پیام‌ها: تکه‌های ۲روزه پشت‌سرهم (نه موازی — موازی روی این API خیلی کندتر شد)
 */
const https = require('https');
const { URL } = require('url');

const API_URL = process.env.KING_GPS_API_URL || 'https://mihan.kinggps.ir/api/api.php';
const API_KEY = (process.env.KING_GPS_API_KEY || '').trim();
const REQUEST_TIMEOUT_MS = Number(process.env.KING_GPS_TIMEOUT_MS || 60000);
const MAX_RETRIES = Number(process.env.KING_GPS_RETRIES || 0);
const MSG_CHUNK_DAYS = Number(process.env.KING_GPS_MSG_CHUNK_DAYS || 2);

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 4,
  keepAliveMsecs: 30000,
});

function isKingGpsConfigured() {
  return Boolean(API_KEY);
}

function friendlyNetError(err) {
  const msg = String(err?.message || err || '');
  const code = err?.code || err?.cause?.code || '';
  if (err?.name === 'AbortError' || code === 'ABORT_ERR' || /Timeout GPS/i.test(msg)) {
    return 'Timeout: سرور King GPS در زمان مجاز پاسخ نداد.';
  }
  if (code === 'ECONNRESET' || msg.includes('socket hang up') || msg.includes('ECONNRESET')) {
    return 'قطع ارتباط با King GPS (ECONNRESET).';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'DNS: میزبان mihan.kinggps.ir پیدا نشد.';
  }
  if (code === 'ETIMEDOUT' || /timed out|timeout/i.test(msg)) {
    return 'Timeout اتصال به King GPS.';
  }
  if (msg.includes('fetch failed')) {
    return 'اتصال به King GPS برقرار نشد.';
  }
  return msg || 'خطای ناشناخته King GPS';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsGetText(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        agent,
        timeout: timeoutMs,
        servername: u.hostname,
        minVersion: 'TLSv1.2',
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': 'transport-app-gps/1.3',
          Connection: 'keep-alive',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      const e = new Error('Timeout GPS');
      e.name = 'AbortError';
      reject(e);
    });
    req.on('error', reject);
    req.end();
  });
}

async function callKingGpsOnce(cmd) {
  if (!API_KEY) {
    return { error: 'KING_GPS_API_KEY تنظیم نشده است.' };
  }
  const url = `${API_URL}?api=user&key=${encodeURIComponent(API_KEY)}&cmd=${encodeURIComponent(cmd)}`;
  try {
    const { status, text } = await httpsGetText(url, REQUEST_TIMEOUT_MS);
    if (status >= 500) return { error: `King GPS HTTP ${status}` };
    if (!text || !text.trim()) return { error: 'پاسخ خالی از GPS' };
    try {
      return JSON.parse(text);
    } catch {
      return { plainText: text.trim() };
    }
  } catch (e) {
    return { error: friendlyNetError(e), code: e?.code || null };
  }
}

async function callKingGps(cmd) {
  let last = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    last = await callKingGpsOnce(cmd);
    if (!last || !last.error) return last;
    if (attempt < MAX_RETRIES) {
      console.warn(`⚠️ [KingGPS] retry ${attempt + 1}: ${last.error}`);
    }
  }
  return last;
}

/**
 * مثل new.py: تکه‌های ۲روزه پشت‌سرهم؛ خطای یک تکه کل را خراب نمی‌کند.
 */
async function getMessages(imei, fromDt, toDt, chunkDays = MSG_CHUNK_DAYS) {
  const start = parseKingDt(fromDt);
  const end = parseKingDt(toDt);
  if (!start || !end || end <= start) return [];

  const chunks = [];
  let cur = new Date(start);
  while (cur < end) {
    const chunkEnd = new Date(Math.min(cur.getTime() + chunkDays * 86400000, end.getTime()));
    chunks.push({ f: formatDt(cur), t: formatDt(chunkEnd) });
    cur = chunkEnd;
  }

  const all = [];
  const errors = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const t0 = Date.now();
    const data = await callKingGps(`OBJECT_GET_MESSAGES,${imei},${c.f},${c.t}`);
    const ms = Date.now() - t0;
    if (Array.isArray(data)) {
      all.push(...data);
      console.log(`📡 [KingGPS] messages chunk ${i + 1}/${chunks.length}: ${data.length} pts in ${ms}ms`);
    } else if (data && data.error) {
      errors.push(`${c.f}: ${data.error}`);
      console.warn(`⚠️ [KingGPS] msg chunk skip ${c.f}→${c.t} (${ms}ms): ${data.error}`);
    }
  }
  if (errors.length && !all.length) {
    return { error: errors[0], partialErrors: errors };
  }
  return all;
}

async function getEvents(imei, fromDt, toDt) {
  const t0 = Date.now();
  const data = await callKingGps(`OBJECT_GET_EVENTS,${imei},${fromDt},${toDt}`);
  console.log(`📡 [KingGPS] events in ${Date.now() - t0}ms`);
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    return data;
  }
  return Array.isArray(data) ? data : [];
}

function formatDt(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const x = d instanceof Date ? d : new Date(d);
  // King API با ساعت UTC کار می‌کند
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
}

function parseKingDt(t) {
  if (!t) return null;
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t;
  const s = String(t).trim();
  const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(hasTz ? normalized : `${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function getLocations(imei) {
  const t0 = Date.now();
  const cmd = imei
    ? `OBJECT_GET_LOCATIONS,${String(imei).trim()}`
    : 'OBJECT_GET_LOCATIONS';
  const data = await callKingGps(cmd);
  console.log(`📡 [KingGPS] locations in ${Date.now() - t0}ms`);
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    return data;
  }
  return data && typeof data === 'object' ? data : {};
}

module.exports = {
  isKingGpsConfigured,
  callKingGps,
  getMessages,
  getEvents,
  getLocations,
  formatDt,
};
