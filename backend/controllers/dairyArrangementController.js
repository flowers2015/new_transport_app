const pool = require('../db');
const realtimeService = require('../services/realtimeService');

const DEFAULT_STATE_ID = 'Dairy';
const LOCK_TTL_MS = 90 * 1000;

const WEEK_DAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
];

function normalizeWeekDay(value) {
  let raw = String(value ?? '')
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
  if (raw === 'سه شنبه') raw = 'سه‌شنبه';
  if (raw === 'پنج شنبه') raw = 'پنج‌شنبه';
  if (raw === '__unassigned__') return '__unassigned__';
  return WEEK_DAYS.includes(raw) ? raw : '';
}

/** state id جدا برای هر شیت اعلام‌بار روز */
function resolveStateId(req) {
  const raw =
    req.query?.weekDay ||
    req.query?.week_day ||
    req.body?.weekDay ||
    req.body?.week_day ||
    '';
  const day = normalizeWeekDay(raw);
  if (day === '__unassigned__') return 'Dairy:__unassigned__';
  if (day) return `Dairy:${day}`;
  return DEFAULT_STATE_ID;
}

function resolveUser(req) {
  const userId = req.user?.userId || req.user?.id || null;
  const username = req.user?.username || '';
  const name = req.user?.name || req.user?.fullName || '';
  const userName =
    username && name ? `${username} - ${name}` : username || name || 'کاربر';
  return { userId, userName };
}

function pruneExpiredLocks(locks) {
  const now = Date.now();
  const next = {};
  for (const [routeId, lock] of Object.entries(locks || {})) {
    if (!lock || !lock.expiresAt) continue;
    if (new Date(lock.expiresAt).getTime() > now) {
      next[routeId] = lock;
    }
  }
  return next;
}

async function readState(client, stateId = DEFAULT_STATE_ID) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT id, routes_json, locks_json, version, updated_by_user_id, updated_by_user_name, updated_at
     FROM dairy_arrangement_state WHERE id = $1`,
    [stateId]
  );
  if (!rows[0]) {
    await db.query(
      `INSERT INTO dairy_arrangement_state (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [stateId]
    );
    return readState(db, stateId);
  }
  const row = rows[0];
  const locks = pruneExpiredLocks(row.locks_json || {});
  return {
    id: row.id,
    routes: Array.isArray(row.routes_json) ? row.routes_json : [],
    locks,
    version: Number(row.version) || 1,
    updatedByUserId: row.updated_by_user_id || null,
    updatedByUserName: row.updated_by_user_name || null,
    updatedAt: row.updated_at,
  };
}

function broadcast(updateType, data, excludeUserId) {
  try {
    realtimeService.notifyGeneralUpdate(updateType, data, excludeUserId);
  } catch (e) {
    console.error('❌ [dairyArrangement] realtime broadcast failed:', e);
  }
}

/**
 * GET /freight-announcements/dairy-arrangement?weekDay=شنبه
 */
async function getDairyArrangement(req, res) {
  try {
    const stateId = resolveStateId(req);
    const state = await readState(pool, stateId);
    await pool.query(
      `UPDATE dairy_arrangement_state SET locks_json = $1::jsonb WHERE id = $2`,
      [JSON.stringify(state.locks), stateId]
    );
    return res.json(state);
  } catch (error) {
    console.error('❌ [getDairyArrangement]', error);
    return res.status(500).json({ message: 'خطا در دریافت چیدمان مشترک' });
  }
}

/**
 * PUT /freight-announcements/dairy-arrangement
 * body: { routes, baseVersion?, weekDay? }
 */
async function saveDairyArrangement(req, res) {
  const { userId, userName } = resolveUser(req);
  const routes = req.body?.routes;
  const baseVersion = req.body?.baseVersion != null ? Number(req.body.baseVersion) : null;
  const stateId = resolveStateId(req);

  if (!Array.isArray(routes)) {
    return res.status(400).json({ message: 'routes باید آرایه باشد.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ensure row exists
    await client.query(
      `INSERT INTO dairy_arrangement_state (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [stateId]
    );
    const { rows } = await client.query(
      `SELECT version, locks_json FROM dairy_arrangement_state WHERE id = $1 FOR UPDATE`,
      [stateId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'وضعیت چیدمان یافت نشد.' });
    }

    const currentVersion = Number(rows[0].version) || 1;
    if (baseVersion != null && baseVersion !== currentVersion) {
      await client.query('ROLLBACK');
      const latest = await readState(pool, stateId);
      return res.status(409).json({
        message: 'چیدمان توسط کاربر دیگری به‌روز شده است.',
        conflict: true,
        state: latest,
      });
    }

    const locks = pruneExpiredLocks(rows[0].locks_json || {});
    const nextVersion = currentVersion + 1;
    await client.query(
      `UPDATE dairy_arrangement_state
       SET routes_json = $1::jsonb,
           locks_json = $2::jsonb,
           version = $3,
           updated_by_user_id = $4,
           updated_by_user_name = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [JSON.stringify(routes), JSON.stringify(locks), nextVersion, userId, userName, stateId]
    );
    await client.query('COMMIT');

    const state = {
      id: stateId,
      routes,
      locks,
      version: nextVersion,
      updatedByUserId: userId,
      updatedByUserName: userName,
      updatedAt: new Date().toISOString(),
    };

    broadcast(
      'dairy_arrangement_layout',
      {
        id: stateId,
        version: state.version,
        routes: state.routes,
        locks: state.locks,
        updatedByUserId: userId,
        updatedByUserName: userName,
        updatedAt: state.updatedAt,
      },
      userId
    );

    return res.json(state);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ [saveDairyArrangement]', error);
    return res.status(500).json({ message: 'خطا در ذخیره چیدمان مشترک' });
  } finally {
    client.release();
  }
}

/**
 * POST /freight-announcements/dairy-arrangement/locks
 * body: { routeId, action: 'acquire' | 'release' | 'heartbeat', weekDay? }
 */
async function updateDairyArrangementLock(req, res) {
  const { userId, userName } = resolveUser(req);
  const routeId = String(req.body?.routeId || '').trim();
  const action = String(req.body?.action || '').trim();
  const stateId = resolveStateId(req);

  if (!routeId || !['acquire', 'release', 'heartbeat'].includes(action)) {
    return res.status(400).json({ message: 'routeId و action معتبر الزامی است.' });
  }
  if (!userId) {
    return res.status(401).json({ message: 'کاربر شناسایی نشد.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO dairy_arrangement_state (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [stateId]
    );
    const { rows } = await client.query(
      `SELECT locks_json, version FROM dairy_arrangement_state WHERE id = $1 FOR UPDATE`,
      [stateId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'وضعیت چیدمان یافت نشد.' });
    }

    const locks = pruneExpiredLocks(rows[0].locks_json || {});
    const existing = locks[routeId];
    const now = Date.now();
    const expiresAt = new Date(now + LOCK_TTL_MS).toISOString();

    if (action === 'acquire') {
      if (existing && existing.userId !== userId) {
        await client.query('ROLLBACK');
        return res.status(423).json({
          message: `این ردیف توسط «${existing.userName || 'کاربر دیگر'}» در حال ویرایش است.`,
          lock: existing,
          locks,
        });
      }
      locks[routeId] = {
        routeId,
        userId,
        userName,
        lockedAt: existing?.lockedAt || new Date().toISOString(),
        expiresAt,
      };
    } else if (action === 'heartbeat') {
      if (!existing || existing.userId !== userId) {
        await client.query('ROLLBACK');
        return res.status(423).json({
          message: 'قفل این ردیف در اختیار شما نیست.',
          lock: existing || null,
          locks,
        });
      }
      locks[routeId] = { ...existing, expiresAt };
    } else if (action === 'release') {
      if (existing && existing.userId === userId) {
        delete locks[routeId];
      }
    }

    await client.query(
      `UPDATE dairy_arrangement_state SET locks_json = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(locks), stateId]
    );
    await client.query('COMMIT');

    broadcast(
      'dairy_arrangement_locks',
      {
        id: stateId,
        locks,
        routeId,
        action,
        actorUserId: userId,
        actorUserName: userName,
      },
      userId
    );

    return res.json({ ok: true, locks, lock: locks[routeId] || null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ [updateDairyArrangementLock]', error);
    return res.status(500).json({ message: 'خطا در به‌روزرسانی قفل ردیف' });
  } finally {
    client.release();
  }
}

module.exports = {
  getDairyArrangement,
  saveDairyArrangement,
  updateDairyArrangementLock,
  LOCK_TTL_MS,
};
