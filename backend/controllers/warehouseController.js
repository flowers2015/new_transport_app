const pool = require('../db');
const { logFreightHistory } = require('../services/freightHistoryService');
const {
  warehouseMatchesAnnouncement,
  canStart,
  canEnd,
  canCancelStart,
  canReopen,
  canReset,
  isWarehouseKeeperRole,
  linesMatch,
} = require('../utils/warehouseLoading');

let usersColCache = null;

async function getUsersColumns() {
  if (usersColCache) return usersColCache;
  const colCheck = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name IN ('full_name', 'name', 'employee_id')`
  );
  const names = new Set(colCheck.rows.map((r) => r.column_name));
  const nameExpr =
    names.has('full_name') && names.has('name')
      ? 'COALESCE(u.full_name, u.name)'
      : names.has('full_name')
        ? 'u.full_name'
        : names.has('name')
          ? 'u.name'
          : 'u.username';
  const empExpr = names.has('employee_id') ? 'u.employee_id' : 'NULL';
  usersColCache = { nameExpr, empExpr, names };
  return usersColCache;
}

function formatTehran(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('fa-IR', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function loadingStatusFa(status) {
  const s = String(status || '').trim();
  if (!s || s === 'not_started') return 'شروع‌نشده';
  if (s === 'in_progress') return 'در حال بارگیری';
  if (s === 'completed') return 'تمام‌شده';
  return s;
}

function loadingDurationFa(startAt, endAt) {
  if (!startAt) return '';
  const s = new Date(startAt).getTime();
  const e = endAt ? new Date(endAt).getTime() : Date.now();
  if (isNaN(s) || isNaN(e) || e < s) return '';
  const sec = Math.floor((e - s) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + ' ساعت و ' + m + ' دقیقه';
  return m + ' دقیقه';
}

function formatKeeperLabel(displayName, username, employeeId) {
  const name = (displayName || username || 'انباردار').trim();
  const emp = employeeId ? String(employeeId).trim() : '';
  return emp ? `${name} - کد پرسنلی: ${emp}` : name;
}

async function getKeeperActor(userId) {
  const { nameExpr, empExpr } = await getUsersColumns();
  const result = await pool.query(
    `SELECT u.username, ${nameExpr} AS display_name, ${empExpr} AS employee_id
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  return {
    username: row.username || '',
    displayName: row.display_name || row.username || 'انباردار',
    employeeId: row.employee_id || '',
    historyName: formatKeeperLabel(row.display_name, row.username, row.employee_id),
  };
}

function deny(res, status, message) {
  return res.status(status).json({ message });
}

function isDairyWarehouseLine(lineType) {
  const v = String(lineType || '').trim();
  return (
    v === 'Pasturized' ||
    v === 'پاستوریزه' ||
    v === 'Dairy' ||
    linesMatch(v, 'پاستوریزه') ||
    linesMatch(v, 'Pasturized')
  );
}

function loadingMetaSuffix(ann) {
  if (!ann) return '';
  const bits = [];
  const name = String(ann.remittance_receiver_name || '').trim();
  const dock = ann.dock_number != null && String(ann.dock_number).trim() !== ''
    ? String(ann.dock_number)
    : '';
  if (name) bits.push(`حواله‌گیر ${name}`);
  if (dock) bits.push(`سکو ${dock}`);
  return bits.length ? ` — ${bits.join(' — ')}` : '';
}

function loadingMetaFieldChanges(ann) {
  const name = String(ann?.remittance_receiver_name || '').trim() || '-';
  const dock =
    ann?.dock_number != null && String(ann.dock_number).trim() !== ''
      ? String(ann.dock_number)
      : '-';
  return {
    'حواله گیر': { old: '-', new: name },
    'شماره سکو': { old: '-', new: dock },
  };
}

function mapReceiver(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertDairyKeeper(req) {
  if (!isWarehouseKeeperRole(req.user && req.user.role)) {
    return { error: { status: 403, message: 'فقط انباردار لاین پاستوریزه مجاز است' } };
  }
  const userId = req.user.userId || req.user.id;
  const warehouses = await loadMyActiveWarehouses(userId);
  if (!warehouses.some((w) => isDairyWarehouseLine(w.line_type))) {
    return { error: { status: 403, message: 'فقط انباردار لاین پاستوریزه مجاز است' } };
  }
  return { userId };
}

async function loadAnnouncement(id) {
  const result = await pool.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function loadMyActiveWarehouses(userId) {
  const result = await pool.query(
    `SELECT w.* FROM warehouses w
     JOIN user_warehouse_assignments uwa ON uwa.warehouse_id = w.id
     WHERE uwa.user_id = $1 AND w.is_active = TRUE
     ORDER BY w.line_type, w.name`,
    [userId]
  );
  return result.rows;
}

async function assertKeeperCanAccessAnnouncement(req, announcementId) {
  if (!isWarehouseKeeperRole(req.user && req.user.role)) {
    return { error: { status: 403, message: 'فقط انباردار مجاز به عملیات بارگیری است' } };
  }
  const userId = req.user.userId || req.user.id;
  const announcement = await loadAnnouncement(announcementId);
  if (!announcement) {
    return { error: { status: 404, message: 'اعلام بار یافت نشد' } };
  }
  const warehouses = await loadMyActiveWarehouses(userId);
  const warehouse = warehouses.find((w) => warehouseMatchesAnnouncement(w, announcement));
  if (!warehouse) {
    return { error: { status: 403, message: 'این اعلام بار مربوط به انبار شما نیست' } };
  }
  return { userId, announcement, warehouse };
}

async function writeHistory(req, announcement, action, description, extraChanges) {
  const actor = await getKeeperActor(req.user.userId || req.user.id);
  await logFreightHistory({
    announcementId: announcement.id,
    userId: req.user.userId || req.user.id,
    userName: actor.historyName,
    action,
    oldStatus: announcement.status,
    newStatus: announcement.status,
    fieldChanges: extraChanges || null,
    description,
    ipAddress: req.ip,
  });
}

async function getWarehouses(req, res) {
  try {
    const { line_type } = req.query;
    let query = 'SELECT * FROM warehouses WHERE is_active = TRUE';
    const params = [];
    if (line_type) {
      params.push(line_type);
      query += ` AND line_type = $${params.length}`;
    }
    query += ' ORDER BY line_type, name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('[getWarehouses]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function getAllWarehouses(req, res) {
  try {
    const result = await pool.query('SELECT * FROM warehouses ORDER BY line_type, name');
    res.json(result.rows);
  } catch (error) {
    console.error('[getAllWarehouses]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function getOriginCities(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT origin_city
       FROM freight_announcements
       WHERE origin_city IS NOT NULL AND TRIM(origin_city) <> ''
       ORDER BY origin_city`
    );
    res.json(result.rows.map((r) => r.origin_city));
  } catch (error) {
    console.error('[getOriginCities]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function getMyWarehouses(req, res) {
  try {
    const userId = req.user.userId || req.user.id;
    const rows = await loadMyActiveWarehouses(userId);
    res.json(rows);
  } catch (error) {
    console.error('[getMyWarehouses]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function createWarehouse(req, res) {
  try {
    const { line_type, name, city, is_active } = req.body;
    if (!line_type || !name || !city) {
      return deny(res, 400, 'لاین، نام و محل انبار لازم است');
    }
    const id = 'WH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    await pool.query(
      'INSERT INTO warehouses (id, line_type, name, city, is_active) VALUES ($1, $2, $3, $4, $5)',
      [id, line_type, name, city, is_active !== false]
    );
    res.status(201).json({ id, message: 'created' });
  } catch (error) {
    console.error('[createWarehouse]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function updateWarehouse(req, res) {
  try {
    const { id } = req.params;
    const { line_type, name, city, is_active } = req.body;
    await pool.query(
      'UPDATE warehouses SET line_type = COALESCE($2, line_type), name = COALESCE($3, name), city = COALESCE($4, city), is_active = COALESCE($5, is_active), updated_at = NOW() WHERE id = $1',
      [id, line_type, name, city, is_active]
    );
    res.json({ message: 'updated' });
  } catch (error) {
    console.error('[updateWarehouse]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function deleteWarehouse(req, res) {
  try {
    const { id } = req.params;
    await pool.query('UPDATE warehouses SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ message: 'deleted' });
  } catch (error) {
    console.error('[deleteWarehouse]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function getAssignments(req, res) {
  try {
    const { nameExpr } = await getUsersColumns();
    const result = await pool.query(
      `SELECT uwa.id, uwa.user_id, uwa.warehouse_id, uwa.created_at,
              ${nameExpr} AS user_name, u.username,
              w.name AS warehouse_name, w.line_type, w.city
       FROM user_warehouse_assignments uwa
       JOIN users u ON u.id = uwa.user_id
       JOIN warehouses w ON w.id = uwa.warehouse_id
       ORDER BY w.line_type, w.name, user_name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[getAssignments]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function createAssignment(req, res) {
  try {
    const { user_id, warehouse_id } = req.body;
    if (!user_id || !warehouse_id) {
      return deny(res, 400, 'user_id and warehouse_id required');
    }
    const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [user_id]);
    if (!userRes.rows[0]) {
      return deny(res, 400, 'کاربر یافت نشد');
    }
    if (!isWarehouseKeeperRole(userRes.rows[0].role)) {
      return deny(res, 400, 'فقط کاربر با نقش انباردار قابل تخصیص است');
    }
    const id = 'UWA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const inserted = await pool.query(
      `INSERT INTO user_warehouse_assignments (id, user_id, warehouse_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, warehouse_id) DO NOTHING
       RETURNING id`,
      [id, user_id, warehouse_id]
    );
    if (inserted.rows.length === 0) {
      return res.status(200).json({ message: 'already assigned' });
    }
    res.status(201).json({ id: inserted.rows[0].id, message: 'created' });
  } catch (error) {
    console.error('[createAssignment]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function deleteAssignment(req, res) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM user_warehouse_assignments WHERE id = $1', [id]);
    res.json({ message: 'deleted' });
  } catch (error) {
    console.error('[deleteAssignment]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function startLoading(req, res) {
  try {
    const access = await assertKeeperCanAccessAnnouncement(req, req.params.id);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { announcement, userId } = access;
    if (!canStart(announcement)) {
      return deny(res, 400, 'شروع بارگیری برای این اعلام بار مجاز نیست');
    }
    await pool.query(
      `UPDATE freight_announcements
       SET loading_status = 'in_progress', loading_started_at = NOW(), loading_started_by = $2,
           loading_ended_at = NULL, loading_ended_by = NULL
       WHERE id = $1`,
      [announcement.id, userId]
    );
    const startedAt = new Date();
    const startLabel = formatTehran(startedAt);
    const actor = await getKeeperActor(userId);
    await writeHistory(
      req,
      announcement,
      'LOADING_STARTED',
      `شروع بارگیری توسط ${actor.historyName} — شروع ${startLabel}${loadingMetaSuffix(announcement)}`,
      {
        'وضعیت بارگیری': { old: loadingStatusFa(announcement.loading_status), new: 'در حال بارگیری' },
        'زمان شروع بارگیری': { old: '-', new: startLabel },
        ...loadingMetaFieldChanges(announcement),
      }
    );
    res.json({ message: 'loading started' });
  } catch (error) {
    console.error('[startLoading]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function endLoading(req, res) {
  try {
    const access = await assertKeeperCanAccessAnnouncement(req, req.params.id);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { announcement, userId } = access;
    if (!canEnd(announcement)) {
      return deny(res, 400, 'پایان بارگیری فقط در حالت در حال بارگیری مجاز است');
    }
    const endedAt = new Date();
    await pool.query(
      `UPDATE freight_announcements
       SET loading_status = 'completed', loading_ended_at = NOW(), loading_ended_by = $2
       WHERE id = $1`,
      [announcement.id, userId]
    );
    const actor = await getKeeperActor(userId);
    const startLabel = announcement.loading_started_at ? formatTehran(announcement.loading_started_at) : '';
    const endLabel = formatTehran(endedAt);
    const dur = loadingDurationFa(announcement.loading_started_at, endedAt);
    const extra = dur ? ` — مدت ${dur}` : '';
    await writeHistory(
      req,
      announcement,
      'LOADING_ENDED',
      `پایان بارگیری توسط ${actor.historyName} — اتمام ${endLabel}${extra}${loadingMetaSuffix(announcement)}`,
      {
        'وضعیت بارگیری': { old: 'در حال بارگیری', new: 'تمام‌شده' },
        'زمان شروع بارگیری': { old: '-', new: startLabel || '-' },
        'زمان اتمام بارگیری': { old: '-', new: endLabel },
        ...loadingMetaFieldChanges(announcement),
      }
    );
    res.json({ message: 'loading ended' });
  } catch (error) {
    console.error('[endLoading]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function cancelLoading(req, res) {
  try {
    const access = await assertKeeperCanAccessAnnouncement(req, req.params.id);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { announcement } = access;
    if (!canCancelStart(announcement)) {
      return deny(res, 400, 'لغو شروع فقط در حالت در حال بارگیری مجاز است');
    }
    await pool.query(
      `UPDATE freight_announcements
       SET loading_status = NULL, loading_started_at = NULL, loading_started_by = NULL,
           loading_ended_at = NULL, loading_ended_by = NULL
       WHERE id = $1`,
      [announcement.id]
    );
    const actor = await getKeeperActor(access.userId);
    const startLabel = announcement.loading_started_at ? formatTehran(announcement.loading_started_at) : '';
    await writeHistory(
      req,
      announcement,
      'LOADING_CANCELLED',
      `لغو شروع بارگیری توسط ${actor.historyName}${startLabel ? ' — شروع قبلی ' + startLabel : ''}`,
      {
        'وضعیت بارگیری': { old: 'در حال بارگیری', new: 'شروع‌نشده' },
        'زمان شروع بارگیری': { old: startLabel || '-', new: 'لغو شد' },
      }
    );
    res.json({ message: 'loading cancelled' });
  } catch (error) {
    console.error('[cancelLoading]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function reopenLoading(req, res) {
  try {
    const access = await assertKeeperCanAccessAnnouncement(req, req.params.id);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { announcement } = access;
    if (!canReopen(announcement)) {
      return deny(res, 400, 'برگشت فقط بعد از اتمام بارگیری مجاز است');
    }
    await pool.query(
      `UPDATE freight_announcements
       SET loading_status = 'in_progress', loading_ended_at = NULL, loading_ended_by = NULL
       WHERE id = $1`,
      [announcement.id]
    );
    const actor = await getKeeperActor(access.userId);
    const startLabel = announcement.loading_started_at ? formatTehran(announcement.loading_started_at) : '';
    await writeHistory(
      req,
      announcement,
      'LOADING_REOPENED',
      `برگشت از اتمام به در حال بارگیری توسط ${actor.historyName}${startLabel ? ' — شروع ' + startLabel : ''}`,
      {
        'وضعیت بارگیری': { old: 'تمام‌شده', new: 'در حال بارگیری' },
        'زمان شروع بارگیری': { old: startLabel || '-', new: startLabel || '-' },
        'زمان اتمام بارگیری': {
          old: announcement.loading_ended_at ? formatTehran(announcement.loading_ended_at) : '-',
          new: 'لغو شد',
        },
      }
    );
    res.json({ message: 'loading reopened' });
  } catch (error) {
    console.error('[reopenLoading]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function resetLoading(req, res) {
  try {
    const access = await assertKeeperCanAccessAnnouncement(req, req.params.id);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { announcement } = access;
    if (!canReset(announcement)) {
      return deny(res, 400, 'ریست بارگیری برای این وضعیت مجاز نیست');
    }
    await pool.query(
      `UPDATE freight_announcements
       SET loading_status = NULL, loading_started_at = NULL, loading_started_by = NULL,
           loading_ended_at = NULL, loading_ended_by = NULL
       WHERE id = $1`,
      [announcement.id]
    );
    const actor = await getKeeperActor(access.userId);
    const startLabel = announcement.loading_started_at ? formatTehran(announcement.loading_started_at) : '';
    const endLabel = announcement.loading_ended_at ? formatTehran(announcement.loading_ended_at) : '';
    await writeHistory(
      req,
      announcement,
      'LOADING_RESET',
      `ریست کامل بارگیری توسط ${actor.historyName}`,
      {
        'وضعیت بارگیری': { old: loadingStatusFa(announcement.loading_status), new: 'شروع‌نشده' },
        'زمان شروع بارگیری': { old: startLabel || '-', new: 'پاک شد' },
        'زمان اتمام بارگیری': { old: endLabel || '-', new: 'پاک شد' },
      }
    );
    res.json({ message: 'loading reset' });
  } catch (error) {
    console.error('[resetLoading]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function getWarehouseAnnouncements(req, res) {
  try {
    if (!isWarehouseKeeperRole(req.user && req.user.role)) {
      return deny(res, 403, 'فقط انباردار مجاز است');
    }
    const userId = req.user.userId || req.user.id;
    const warehouses = await loadMyActiveWarehouses(userId);
    if (warehouses.length === 0) {
      return res.json([]);
    }
    const result = await pool.query(
      `SELECT fa.*,
              (SELECT json_agg(json_build_object(
                 'id', fd.id, 'city', fd.city, 'representative_name', fd.representative_name,
                 'tonnage', fd.tonnage, 'freight_cost', fd.freight_cost
               )) FROM freight_destinations fd WHERE fd.freight_announcement_id = fa.id) AS destinations
       FROM freight_announcements fa
       WHERE fa.status IN ('Assigned', 'InTransit', 'PendingPersonalAssignment', 'PendingCompanyAssignment', 'ChangeRequested')
       ORDER BY fa.loading_date DESC, fa.created_at DESC`
    );
    const rows = result.rows.filter((fa) =>
      warehouses.some((w) => warehouseMatchesAnnouncement(w, fa))
    ).map((r) => {
      r.destinations = r.destinations || [];
      return r;
    });
    res.json(rows);
  } catch (error) {
    console.error('[getWarehouseAnnouncements]', error.message);
    res.status(500).json({ message: 'error' });
  }
}

async function listLisReceivers(req, res) {
  try {
    const access = await assertDairyKeeper(req);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const result = await pool.query(
      `SELECT * FROM lis_remittance_receivers
       WHERE is_active = TRUE
       ORDER BY full_name ASC, employee_id ASC`
    );
    res.json(result.rows.map(mapReceiver));
  } catch (error) {
    console.error('[listLisReceivers]', error.message);
    res.status(500).json({ message: 'خطا در دریافت حواله‌گیرها' });
  }
}

async function createLisReceiver(req, res) {
  try {
    const access = await assertDairyKeeper(req);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const employeeId = String(req.body?.employeeId || req.body?.employee_id || '').trim();
    const fullName = String(req.body?.fullName || req.body?.full_name || '').trim();
    if (!employeeId) return deny(res, 400, 'کد پرسنلی الزامی است');
    if (!fullName) return deny(res, 400, 'نام و نام خانوادگی الزامی است');
    const dup = await pool.query(
      `SELECT id FROM lis_remittance_receivers WHERE employee_id = $1 AND is_active = TRUE`,
      [employeeId]
    );
    if (dup.rowCount > 0) return deny(res, 409, 'این کد پرسنلی قبلاً ثبت شده است');
    const id = 'LR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    await pool.query(
      `INSERT INTO lis_remittance_receivers (id, employee_id, full_name, created_by)
       VALUES ($1, $2, $3, $4)`,
      [id, employeeId, fullName, access.userId]
    );
    const created = await pool.query(`SELECT * FROM lis_remittance_receivers WHERE id = $1`, [id]);
    res.status(201).json(mapReceiver(created.rows[0]));
  } catch (error) {
    console.error('[createLisReceiver]', error.message);
    res.status(500).json({ message: 'خطا در ثبت حواله‌گیر' });
  }
}

async function updateLisReceiver(req, res) {
  try {
    const access = await assertDairyKeeper(req);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { id } = req.params;
    const employeeId = String(req.body?.employeeId || req.body?.employee_id || '').trim();
    const fullName = String(req.body?.fullName || req.body?.full_name || '').trim();
    if (!employeeId) return deny(res, 400, 'کد پرسنلی الزامی است');
    if (!fullName) return deny(res, 400, 'نام و نام خانوادگی الزامی است');
    const dup = await pool.query(
      `SELECT id FROM lis_remittance_receivers
       WHERE employee_id = $1 AND is_active = TRUE AND id <> $2`,
      [employeeId, id]
    );
    if (dup.rowCount > 0) return deny(res, 409, 'این کد پرسنلی قبلاً ثبت شده است');
    const result = await pool.query(
      `UPDATE lis_remittance_receivers
       SET employee_id = $2, full_name = $3, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING *`,
      [id, employeeId, fullName]
    );
    if (!result.rowCount) return deny(res, 404, 'حواله‌گیر یافت نشد');
    res.json(mapReceiver(result.rows[0]));
  } catch (error) {
    console.error('[updateLisReceiver]', error.message);
    res.status(500).json({ message: 'خطا در ویرایش حواله‌گیر' });
  }
}

async function deleteLisReceiver(req, res) {
  try {
    const access = await assertDairyKeeper(req);
    if (access.error) return deny(res, access.error.status, access.error.message);
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE lis_remittance_receivers
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id`,
      [id]
    );
    if (!result.rowCount) return deny(res, 404, 'حواله‌گیر یافت نشد');
    res.json({ message: 'deleted' });
  } catch (error) {
    console.error('[deleteLisReceiver]', error.message);
    res.status(500).json({ message: 'خطا در حذف حواله‌گیر' });
  }
}

module.exports = {
  getWarehouses,
  getAllWarehouses,
  getOriginCities,
  getMyWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getAssignments,
  createAssignment,
  deleteAssignment,
  startLoading,
  endLoading,
  cancelLoading,
  reopenLoading,
  resetLoading,
  getWarehouseAnnouncements,
  getKeeperActor,
  listLisReceivers,
  createLisReceiver,
  updateLisReceiver,
  deleteLisReceiver,
};
