const pool = require('../db');
const { logFreightHistory } = require('./freightHistoryService');

const INTAKE_LOCK_MESSAGE =
  'بدلیل اتمام تایم اعلام بار، ارسال درخواست قفل می‌باشد. در صورت ضرورت با ترابری تماس بگیرید.';

const LINE_TYPES = ['IceCream', 'Dairy', 'Ambient'];

const TRANSPORT_INTAKE_STATUSES = new Set([
  'PendingCompanyAssignment',
  'PendingPersonalAssignment',
]);

function normalizeFreightLineTypeKey(lineType) {
  if (lineType === 'بستنی' || lineType === 'IceCream') return 'IceCream';
  if (lineType === 'پاستوریزه' || lineType === 'Dairy') return 'Dairy';
  if (lineType === 'لبنیات-فروتلند' || lineType === 'Ambient') return 'Ambient';
  return lineType;
}

function isTransportIntakeStatus(status) {
  return TRANSPORT_INTAKE_STATUSES.has(status);
}

function isEnteringTransportIntake(oldStatus, newStatus) {
  return isTransportIntakeStatus(newStatus) && !isTransportIntakeStatus(oldStatus);
}

async function ensureLockRows(client) {
  const db = client || pool;
  for (const lineType of LINE_TYPES) {
    await db.query(
      `
        INSERT INTO freight_intake_locks (line_type, is_locked)
        VALUES ($1, FALSE)
        ON CONFLICT (line_type) DO NOTHING
      `,
      [lineType]
    );
  }
}

async function listFreightIntakeLocks(client) {
  const db = client || pool;
  await ensureLockRows(db);
  const { rows } = await db.query(
    `
      SELECT line_type, is_locked, updated_by_user_id, updated_by_user_name, updated_at
      FROM freight_intake_locks
      WHERE line_type = ANY($1::varchar[])
      ORDER BY line_type
    `,
    [LINE_TYPES]
  );
  return rows.map((row) => ({
    lineType: row.line_type,
    isLocked: Boolean(row.is_locked),
    updatedByUserId: row.updated_by_user_id || null,
    updatedByUserName: row.updated_by_user_name || null,
    updatedAt: row.updated_at,
  }));
}

async function isLineIntakeLocked(lineType, client) {
  const key = normalizeFreightLineTypeKey(lineType);
  if (!LINE_TYPES.includes(key)) return false;
  const db = client || pool;
  await ensureLockRows(db);
  const { rows } = await db.query(
    `SELECT is_locked FROM freight_intake_locks WHERE line_type = $1`,
    [key]
  );
  return Boolean(rows[0]?.is_locked);
}

async function setLineIntakeLock({
  lineType,
  isLocked,
  userId,
  userName,
  client,
}) {
  const key = normalizeFreightLineTypeKey(lineType);
  if (!LINE_TYPES.includes(key)) {
    const err = new Error('خط نامعتبر است.');
    err.statusCode = 400;
    throw err;
  }
  const db = client || pool;
  await ensureLockRows(db);
  const { rows } = await db.query(
    `
      UPDATE freight_intake_locks
      SET is_locked = $2,
          updated_by_user_id = $3,
          updated_by_user_name = $4,
          updated_at = NOW()
      WHERE line_type = $1
      RETURNING line_type, is_locked, updated_by_user_id, updated_by_user_name, updated_at
    `,
    [key, Boolean(isLocked), userId || null, userName || null]
  );
  const row = rows[0];
  return {
    lineType: row.line_type,
    isLocked: Boolean(row.is_locked),
    updatedByUserId: row.updated_by_user_id || null,
    updatedByUserName: row.updated_by_user_name || null,
    updatedAt: row.updated_at,
  };
}

/**
 * اگر قفل باشد: تاریخچه ثبت می‌شود و خطا پرتاب می‌شود (وضعیت بار عوض نمی‌شود).
 */
async function assertIntakeUnlockedForTransport({
  lineType,
  announcementId,
  userId,
  userName,
  oldStatus,
  ipAddress,
  client,
}) {
  const locked = await isLineIntakeLocked(lineType, client);
  if (!locked) return;

  if (announcementId) {
    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: 'INTAKE_BLOCKED',
      oldStatus: oldStatus || null,
      newStatus: oldStatus || null,
      fieldChanges: {
        intakeLock: {
          lineType: normalizeFreightLineTypeKey(lineType),
          blocked: true,
        },
      },
      description: INTAKE_LOCK_MESSAGE,
      ipAddress,
      client,
    });
  }

  const err = new Error(INTAKE_LOCK_MESSAGE);
  err.statusCode = 403;
  err.code = 'FREIGHT_INTAKE_LOCKED';
  throw err;
}

module.exports = {
  INTAKE_LOCK_MESSAGE,
  LINE_TYPES,
  normalizeFreightLineTypeKey,
  isTransportIntakeStatus,
  isEnteringTransportIntake,
  listFreightIntakeLocks,
  isLineIntakeLocked,
  setLineIntakeLock,
  assertIntakeUnlockedForTransport,
};
