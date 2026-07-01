const pool = require('../db');
const { logFreightHistory } = require('../services/freightHistoryService');
const { getUserCarrierId } = require('./carrierController');

const PERSONAL_ROLES = ['personal_transport_user', 'کاربر ترابری (خودرو شخصی)'];
const CARRIER_ROLE = 'carrier_user';

function isDairyOrAmbientLineType(lineType) {
  const lt = String(lineType || '');
  return ['Dairy', 'Ambient', 'پاستوریزه', 'لبنیات-فروتلند'].includes(lt);
}

function isAmbientLine(lineType) {
  const lt = String(lineType || '');
  return ['Ambient', 'لبنیات-فروتلند'].includes(lt);
}

async function buildUserName(req) {
  const userId = req.user?.userId || req.user?.id;
  let userFullName = '';
  if (userId) {
    try {
      const userCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('full_name', 'name')
      `);
      const hasFullName = userCheck.rows.some((r) => r.column_name === 'full_name');
      const nameColumn = hasFullName ? 'full_name' : 'name';
      const userRow = await pool.query(`SELECT ${nameColumn} AS display_name FROM users WHERE id = $1`, [userId]);
      if (userRow.rows.length > 0) userFullName = userRow.rows[0].display_name || '';
    } catch (e) {
      console.error('buildUserName:', e);
    }
  }
  const username = req.user?.username || '';
  const role = req.user?.role || '';
  if (username && userFullName) return `${username} - ${userFullName}`;
  return username || userFullName || 'کاربر';
}

function notifyUpdate(announcementId, patch, userId) {
  try {
    const realtimeService = require('../services/realtimeService');
    realtimeService.notifyAnnouncementUpdate(announcementId, patch, userId);
  } catch (e) {
    console.warn('notifyUpdate failed:', e.message);
  }
}

/** POST /freight-announcements/:id/carrier-refer */
async function referToCarrier(req, res) {
  const { id: announcementId } = req.params;
  const { carrierId, totalFreightCost } = req.body;
  const role = req.user?.role;
  const userId = req.user?.userId || req.user?.id;
  const userName = await buildUserName(req);

  if (!PERSONAL_ROLES.includes(role)) {
    return res.status(403).json({ message: 'فقط ترابری شخصی می‌تواند به باربری ارجاع دهد.' });
  }

  const cost = Number(totalFreightCost);
  if (!carrierId) {
    return res.status(400).json({ message: 'انتخاب باربری الزامی است.' });
  }
  if (!Number.isFinite(cost) || cost <= 0) {
    return res.status(400).json({ message: 'ثبت کرایه قبل از ارجاع الزامی است.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const annRes = await client.query(
      `SELECT id, status, assignment_type, line_type, handoff_status, handoff_carrier_id,
              assigned_driver_id, assigned_vehicle_id, announcement_code, vehicle_type, brand,
              origin_city, cargo_value, total_freight_cost, carrier_name
       FROM freight_announcements WHERE id = $1 FOR UPDATE`,
      [announcementId]
    );
    if (annRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const ann = annRes.rows[0];

    if (!isAmbientLine(ann.line_type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'ارجاع به باربری فقط برای خط لبنیات-فروتلند فعال است.' });
    }
    if (ann.assignment_type !== 'personal') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'این بار در صف شخصی نیست.' });
    }

    const carrierChanged =
      ann.handoff_status === 'with_carrier' &&
      ann.handoff_carrier_id &&
      String(ann.handoff_carrier_id) !== String(carrierId);

    if (ann.handoff_status === 'with_carrier' && !carrierChanged) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'این بار در حال حاضر نزد همین باربری است.' });
    }
    if (ann.assigned_driver_id || ann.assigned_vehicle_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'برای ارجاع به باربری، بار نباید تخصیص داده شده باشد.' });
    }

    const carrierRes = await client.query(
      `SELECT id, name, active FROM carriers WHERE id = $1 AND active = TRUE`,
      [carrierId]
    );
    if (carrierRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'باربری فعال یافت نشد.' });
    }
    const carrier = carrierRes.rows[0];

    await client.query(
      `
      UPDATE freight_announcements SET
        handoff_carrier_id = $1,
        handoff_status = 'with_carrier',
        freight_cost_locked_at = NOW(),
        total_freight_cost = $2,
        carrier_name = $3,
        updated_at = NOW()
      WHERE id = $4
      `,
      [carrierId, cost, carrier.name, announcementId]
    );

    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: carrierChanged ? 'CARRIER_REFERRAL_CHANGED' : 'REFERRED_TO_CARRIER',
      oldStatus: ann.status,
      newStatus: ann.status,
      fieldChanges: {
        باربری: { old: ann.carrier_name || null, new: carrier.name },
        total_freight_cost: { old: ann.total_freight_cost || null, new: cost },
      },
      description: carrierChanged
        ? `تغییر باربری به «${carrier.name}» با کرایه ${cost}`
        : `ارجاع به باربری «${carrier.name}» با کرایه ${cost}`,
      ipAddress: req.ip,
      client,
    });

    await client.query('COMMIT');

    setImmediate(() => {
      const { notifyReferToCarrierAfterCommit } = require('../services/bale/baleAmbientAssignmentNotify');
      notifyReferToCarrierAfterCommit(announcementId, { carrierChanged }).catch((err) => {
        console.error('⚠️ [referToCarrier] Bale notify error:', err.message);
      });
    });

    notifyUpdate(
      announcementId,
      {
        handoff_carrier_id: carrierId,
        handoff_status: 'with_carrier',
        total_freight_cost: cost,
        carrier_name: carrier.name,
        freight_cost_locked_at: new Date().toISOString(),
      },
      userId
    );

    return res.status(200).json({
      message: `بار به باربری «${carrier.name}» ارجاع شد.`,
      handoffCarrierId: carrierId,
      handoffStatus: 'with_carrier',
      totalFreightCost: cost,
      carrierName: carrier.name,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [referToCarrier]', error);
    return res.status(500).json({ message: 'خطا در ارجاع به باربری.' });
  } finally {
    client.release();
  }
}

/** POST /freight-announcements/:id/carrier-cancel-refer */
async function cancelCarrierReferral(req, res) {
  const { id: announcementId } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId || req.user?.id;
  const userName = await buildUserName(req);

  if (!PERSONAL_ROLES.includes(role)) {
    return res.status(403).json({ message: 'دسترسی غیرمجاز.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const annRes = await client.query(
      `SELECT * FROM freight_announcements WHERE id = $1 FOR UPDATE`,
      [announcementId]
    );
    if (annRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const ann = annRes.rows[0];

    if (ann.handoff_status !== 'with_carrier') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'این بار در وضعیت ارجاع به باربری نیست.' });
    }
    if (ann.assigned_driver_id || ann.assigned_vehicle_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'باربری قبلاً تخصیص زده؛ لغو ارجاع ممکن نیست.' });
    }

    await client.query(
      `
      UPDATE freight_announcements SET
        handoff_carrier_id = NULL,
        handoff_status = NULL,
        freight_cost_locked_at = NULL,
        carrier_name = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [announcementId]
    );

    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: 'CARRIER_REFERRAL_CANCELLED',
      oldStatus: ann.status,
      newStatus: ann.status,
      description: 'لغو ارجاع به باربری توسط ترابری شخصی',
      ipAddress: req.ip,
      client,
    });

    await client.query('COMMIT');
    notifyUpdate(announcementId, { handoff_status: null, handoff_carrier_id: null }, userId);
    return res.status(200).json({ message: 'ارجاع به باربری لغو شد.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [cancelCarrierReferral]', error);
    return res.status(500).json({ message: 'خطا در لغو ارجاع.' });
  } finally {
    client.release();
  }
}

async function clearAssignmentFields(client, announcementId) {
  await client.query(
    `
    UPDATE freight_announcements SET
      assigned_driver_id = NULL,
      assigned_vehicle_id = NULL,
      assigned_driver_name = NULL,
      assigned_driver_employee_id = NULL,
      assigned_vehicle_model = NULL,
      assigned_vehicle_brand = NULL,
      vehicle_plate = NULL,
      bill_of_lading_number = NULL,
      status = 'PendingPersonalAssignment',
      updated_at = NOW()
    WHERE id = $1
    `,
    [announcementId]
  );
}

/** POST /freight-announcements/:id/carrier-return */
async function carrierReturnToPersonal(req, res) {
  const { id: announcementId } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId || req.user?.id;
  const userName = await buildUserName(req);
  const { reason } = req.body || {};

  if (role !== CARRIER_ROLE) {
    return res.status(403).json({ message: 'فقط کاربر باربری می‌تواند برگشت بزند.' });
  }

  const carrierId = await getUserCarrierId(userId);
  if (!carrierId) {
    return res.status(403).json({ message: 'کاربر به باربری متصل نیست.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const annRes = await client.query(
      `SELECT * FROM freight_announcements WHERE id = $1 FOR UPDATE`,
      [announcementId]
    );
    if (annRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const ann = annRes.rows[0];

    if (ann.handoff_carrier_id !== carrierId || ann.handoff_status !== 'with_carrier') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'این بار به شما ارجاع نشده است.' });
    }

    await clearAssignmentFields(client, announcementId);
    await client.query(
      `
      UPDATE freight_announcements SET
        handoff_carrier_id = NULL,
        handoff_status = 'returned',
        freight_cost_locked_at = NULL,
        carrier_name = NULL,
        total_freight_cost = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [announcementId]
    );

    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: 'RETURNED_FROM_CARRIER',
      oldStatus: ann.status,
      newStatus: 'PendingPersonalAssignment',
      description: reason
        ? `برگشت به ترابری شخصی: ${reason}`
        : 'برگشت به ترابری شخصی توسط باربری',
      ipAddress: req.ip,
      client,
    });

    await client.query('COMMIT');
    notifyUpdate(
      announcementId,
      { handoff_status: 'returned', status: 'PendingPersonalAssignment' },
      userId
    );
    return res.status(200).json({ message: 'بار به ترابری شخصی برگشت داده شد.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [carrierReturnToPersonal]', error);
    return res.status(500).json({ message: 'خطا در برگشت بار.' });
  } finally {
    client.release();
  }
}

/** POST /freight-announcements/:id/carrier-complete */
async function carrierCompleteHandoff(req, res) {
  const { id: announcementId } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId || req.user?.id;
  const userName = await buildUserName(req);

  if (role !== CARRIER_ROLE) {
    return res.status(403).json({ message: 'فقط کاربر باربری می‌تواند اتمام واگذاری بزند.' });
  }

  const carrierId = await getUserCarrierId(userId);
  if (!carrierId) {
    return res.status(403).json({ message: 'کاربر به باربری متصل نیست.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const annRes = await client.query(
      `SELECT * FROM freight_announcements WHERE id = $1 FOR UPDATE`,
      [announcementId]
    );
    if (annRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const ann = annRes.rows[0];

    if (ann.handoff_carrier_id !== carrierId || ann.handoff_status !== 'with_carrier') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'این بار به شما ارجاع نشده است.' });
    }
    if (!ann.assigned_driver_id && !ann.assigned_vehicle_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'ابتدا تخصیص راننده و خودرو الزامی است.' });
    }

    const carrierName = ann.carrier_name;
    await client.query(
      `
      UPDATE freight_announcements SET
        handoff_carrier_id = NULL,
        handoff_status = 'carrier_done',
        freight_cost_locked_at = NULL,
        status = 'Assigned',
        awaiting_bill_of_lading_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [announcementId]
    );

    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: 'CARRIER_HANDOFF_DONE',
      oldStatus: ann.status,
      newStatus: 'Assigned',
      description: `اتمام واگذاری باربری — برگشت به ترابری شخصی`,
      ipAddress: req.ip,
      client,
    });

    await client.query('COMMIT');
    notifyUpdate(
      announcementId,
      {
        handoff_status: 'carrier_done',
        handoff_carrier_id: null,
        status: 'Assigned',
        carrier_name: carrierName,
      },
      userId
    );
    return res.status(200).json({ message: 'واگذاری باربری اتمام یافت؛ بار به ترابری شخصی برگشت.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [carrierCompleteHandoff]', error);
    return res.status(500).json({ message: 'خطا در اتمام واگذاری.' });
  } finally {
    client.release();
  }
}

module.exports = {
  referToCarrier,
  cancelCarrierReferral,
  carrierReturnToPersonal,
  carrierCompleteHandoff,
  isDairyOrAmbientLineType,
  CARRIER_ROLE,
  PERSONAL_ROLES,
};
