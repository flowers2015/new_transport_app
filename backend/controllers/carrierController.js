const pool = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { logAdminAction } = require('./userManagementController');

const PERSONAL_ROLES = ['personal_transport_user', 'کاربر ترابری (خودرو شخصی)'];
const ADMIN_ROLES = ['admin', 'ادمین'];

function isAdminRole(role) {
  return ADMIN_ROLES.includes(String(role || '').toLowerCase()) || role === 'admin';
}

function isPersonalTransportRole(role) {
  return PERSONAL_ROLES.includes(role);
}

async function getUserCarrierId(userId) {
  if (!userId) return null;
  const { rows } = await pool.query('SELECT carrier_id FROM users WHERE id = $1', [userId]);
  return rows[0]?.carrier_id || null;
}

function mapCarrierRow(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    notes: row.notes || '',
    active: row.active !== false,
    enabledLines: row.enabled_lines || ['Ambient'],
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userCount: row.user_count != null ? Number(row.user_count) : undefined,
    hasLoginUser: row.has_login_user === true,
    usernames: row.usernames || '',
  };
}

/** GET /api/v1/carriers */
async function listCarriers(req, res) {
  try {
    const { line, activeOnly } = req.query;
    const role = req.user?.role;
    const userId = req.user?.userId || req.user?.id;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (activeOnly === 'true' || activeOnly === '1') {
      where += ` AND c.active = TRUE`;
    }

    if (line) {
      where += ` AND ($${idx} = ANY(c.enabled_lines))`;
      params.push(line);
      idx += 1;
    }

    if (isPersonalTransportRole(role) && !isAdminRole(role)) {
      // شخصی: همه باربری‌های فعال برای ارجاع
      where += ` AND c.active = TRUE`;
    }

    const { rows } = await pool.query(
      `
      SELECT c.*,
        (SELECT COUNT(*)::int FROM users u WHERE u.carrier_id = c.id) AS user_count,
        EXISTS(SELECT 1 FROM users u WHERE u.carrier_id = c.id) AS has_login_user,
        (SELECT string_agg(u.username, '، ' ORDER BY u.username)
         FROM users u WHERE u.carrier_id = c.id) AS usernames
      FROM carriers c
      ${where}
      ORDER BY c.name ASC
      `,
      params
    );

    return res.json({ carriers: rows.map(mapCarrierRow), total: rows.length });
  } catch (error) {
    console.error('❌ [listCarriers]', error);
    return res.status(500).json({ message: 'خطا در دریافت لیست باربری‌ها.' });
  }
}

/** GET /api/v1/carriers/:id */
async function getCarrierById(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
      SELECT c.*,
        (SELECT COUNT(*)::int FROM users u WHERE u.carrier_id = c.id) AS user_count,
        EXISTS(SELECT 1 FROM users u WHERE u.carrier_id = c.id) AS has_login_user,
        (SELECT string_agg(u.username, '، ' ORDER BY u.username)
         FROM users u WHERE u.carrier_id = c.id) AS usernames
      FROM carriers c WHERE c.id = $1
      `,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'باربری یافت نشد.' });
    }
    return res.json(mapCarrierRow(rows[0]));
  } catch (error) {
    console.error('❌ [getCarrierById]', error);
    return res.status(500).json({ message: 'خطا در دریافت باربری.' });
  }
}

/** POST /api/v1/carriers */
async function createCarrier(req, res) {
  const role = req.user?.role;
  const userId = req.user?.userId || req.user?.id;
  const { name, contact, notes, enabledLines } = req.body;

  if (!isAdminRole(role) && !isPersonalTransportRole(role)) {
    return res.status(403).json({ message: 'دسترسی غیرمجاز.' });
  }

  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    return res.status(400).json({ message: 'نام باربری الزامی است.' });
  }

  const lines = Array.isArray(enabledLines) && enabledLines.length > 0 ? enabledLines : ['Ambient'];

  try {
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `
      INSERT INTO carriers (id, name, contact, notes, enabled_lines, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [id, trimmedName, contact || null, notes || null, lines, userId || null]
    );

    if (isAdminRole(role)) {
      await logAdminAction(
        req,
        'create',
        'carriers',
        id,
        null,
        rows[0],
        req.body.reason || 'ایجاد باربری'
      );
    }

    return res.status(201).json(mapCarrierRow(rows[0]));
  } catch (error) {
    console.error('❌ [createCarrier]', error);
    return res.status(500).json({ message: 'خطا در ایجاد باربری.' });
  }
}

/** PUT /api/v1/carriers/:id */
async function updateCarrier(req, res) {
  const role = req.user?.role;
  const userId = req.user?.userId || req.user?.id;
  const { id } = req.params;
  const { name, contact, notes, active, enabledLines } = req.body;

  if (!isAdminRole(role) && !isPersonalTransportRole(role)) {
    return res.status(403).json({ message: 'دسترسی غیرمجاز.' });
  }

  try {
    const existing = await pool.query('SELECT * FROM carriers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'باربری یافت نشد.' });
    }
    const old = existing.rows[0];

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ message: 'نام باربری نمی‌تواند خالی باشد.' });
      updates.push(`name = $${idx++}`);
      values.push(trimmed);
    }
    if (contact !== undefined) {
      updates.push(`contact = $${idx++}`);
      values.push(contact || null);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(notes || null);
    }
    if (enabledLines !== undefined && isAdminRole(role)) {
      updates.push(`enabled_lines = $${idx++}`);
      values.push(Array.isArray(enabledLines) ? enabledLines : ['Ambient']);
    }
    if (active !== undefined && isAdminRole(role)) {
      updates.push(`active = $${idx++}`);
      values.push(!!active);
    }

    if (updates.length === 0) {
      return res.json(mapCarrierRow(old));
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE carriers SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (isAdminRole(role)) {
      await logAdminAction(
        req,
        'update',
        'carriers',
        id,
        old,
        rows[0],
        req.body.reason || 'ویرایش باربری'
      );
    }

    return res.json(mapCarrierRow(rows[0]));
  } catch (error) {
    console.error('❌ [updateCarrier]', error);
    return res.status(500).json({ message: 'خطا در ویرایش باربری.' });
  }
}

/** GET /api/v1/carriers/:id/users */
async function listCarrierUsers(req, res) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ message: 'فقط ادمین می‌تواند کاربران باربری را ببیند.' });
  }
  try {
    const { id } = req.params;
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('full_name', 'name')
    `);
    const nameCol = colCheck.rows.some((r) => r.column_name === 'full_name') ? 'full_name' : 'name';
    const { rows } = await pool.query(
      `
      SELECT id, username, ${nameCol} AS full_name, role, created_at, updated_at
      FROM users WHERE carrier_id = $1
      ORDER BY username
      `,
      [id]
    );
    return res.json({ users: rows });
  } catch (error) {
    console.error('❌ [listCarrierUsers]', error);
    return res.status(500).json({ message: 'خطا در دریافت کاربران باربری.' });
  }
}

/** POST /api/v1/carriers/:id/users — فقط ادمین */
async function createCarrierUser(req, res) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ message: 'فقط ادمین می‌تواند کاربر باربری بسازد.' });
  }

  const adminId = req.user?.userId || req.user?.id;
  const { id: carrierId } = req.params;
  const { username, password, fullName } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'نام کاربری و رمز عبور الزامی است.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const carrierCheck = await client.query('SELECT id, name FROM carriers WHERE id = $1', [carrierId]);
    if (carrierCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'باربری یافت نشد.' });
    }

    const dup = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'نام کاربری تکراری است.' });
    }

    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);

    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('full_name', 'name', 'must_change_password')
    `);
    const cols = colCheck.rows.map((r) => r.column_name);
    const hasFullName = cols.includes('full_name');
    const hasMustChange = cols.includes('must_change_password');

    const insertCols = ['id', 'username', 'password_hash', 'role', 'carrier_id'];
    const insertVals = [userId, username, hash, 'carrier_user', carrierId];
    if (hasFullName) {
      insertCols.push('full_name');
      insertVals.push(fullName || carrierCheck.rows[0].name);
    } else if (cols.includes('name')) {
      insertCols.push('name');
      insertVals.push(fullName || carrierCheck.rows[0].name);
    }
    if (hasMustChange) {
      insertCols.push('must_change_password');
      insertVals.push(true);
    }

    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(
      `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );

    await client.query('COMMIT');

    await logAdminAction(
      req,
      'create',
      'users',
      userId,
      null,
      { username, role: 'carrier_user', carrierId },
      req.body.reason || 'ایجاد کاربر باربری'
    );

    return res.status(201).json({
      id: userId,
      username,
      fullName: fullName || carrierCheck.rows[0].name,
      carrierId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [createCarrierUser]', error);
    return res.status(500).json({ message: 'خطا در ایجاد کاربر باربری.' });
  } finally {
    client.release();
  }
}

async function getCarrierUserOr404(carrierId, userId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, username, role, carrier_id FROM users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) {
    return { error: { status: 404, message: 'کاربر یافت نشد.' } };
  }
  const user = rows[0];
  if (user.carrier_id !== carrierId) {
    return { error: { status: 403, message: 'این کاربر به این باربری تعلق ندارد.' } };
  }
  if (user.role !== 'carrier_user') {
    return { error: { status: 400, message: 'فقط کاربر باربری قابل مدیریت است.' } };
  }
  return { user };
}

/** PUT /api/v1/carriers/:id/users/:userId/password — فقط ادمین */
async function resetCarrierUserPassword(req, res) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ message: 'فقط ادمین می‌تواند رمز کاربر باربری را تغییر دهد.' });
  }

  const { id: carrierId, userId } = req.params;
  const { password } = req.body;

  if (!password || String(password).trim().length < 4) {
    return res.status(400).json({ message: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' });
  }

  try {
    const lookup = await getCarrierUserOr404(carrierId, userId);
    if (lookup.error) {
      return res.status(lookup.error.status).json({ message: lookup.error.message });
    }

    const hash = await bcrypt.hash(String(password).trim(), 10);
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('must_change_password', 'password_changed_at')
    `);
    const cols = colCheck.rows.map((r) => r.column_name);
    const updates = ['password_hash = $1', 'updated_at = NOW()'];
    const params = [hash];
    let idx = 2;
    if (cols.includes('must_change_password')) {
      updates.push(`must_change_password = $${idx++}`);
      params.push(true);
    }
    if (cols.includes('password_changed_at')) {
      updates.push('password_changed_at = NOW()');
    }
    params.push(userId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    await logAdminAction(
      req,
      'update',
      'users',
      userId,
      { username: lookup.user.username },
      { passwordReset: true, carrierId },
      req.body.reason || 'ریست رمز کاربر باربری'
    );

    return res.json({ message: `رمز کاربر «${lookup.user.username}» به‌روزرسانی شد.` });
  } catch (error) {
    console.error('❌ [resetCarrierUserPassword]', error);
    return res.status(500).json({ message: 'خطا در تغییر رمز عبور.' });
  }
}

/** DELETE /api/v1/carriers/:id/users/:userId — فقط ادمین */
async function deleteCarrierUser(req, res) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ message: 'فقط ادمین می‌تواند کاربر باربری را حذف کند.' });
  }

  const { id: carrierId, userId } = req.params;
  const adminId = req.user?.userId || req.user?.id;
  if (userId === adminId) {
    return res.status(400).json({ message: 'نمی‌توانید حساب خود را از اینجا حذف کنید.' });
  }

  try {
    const lookup = await getCarrierUserOr404(carrierId, userId);
    if (lookup.error) {
      return res.status(lookup.error.status).json({ message: lookup.error.message });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    await logAdminAction(
      req,
      'delete',
      'users',
      userId,
      { username: lookup.user.username, role: 'carrier_user', carrierId },
      null,
      req.body?.reason || 'حذف کاربر باربری'
    );

    return res.json({ message: `کاربر «${lookup.user.username}» حذف شد.` });
  } catch (error) {
    console.error('❌ [deleteCarrierUser]', error);
    return res.status(500).json({ message: 'خطا در حذف کاربر باربری.' });
  }
}

module.exports = {
  listCarriers,
  getCarrierById,
  createCarrier,
  updateCarrier,
  listCarrierUsers,
  createCarrierUser,
  resetCarrierUserPassword,
  deleteCarrierUser,
  getUserCarrierId,
  isAdminRole,
  isPersonalTransportRole,
};
