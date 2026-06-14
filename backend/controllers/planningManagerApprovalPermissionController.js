const pool = require('../db');
const crypto = require('crypto');

const MANAGER_ROLES = [
  'planner_manager',
  'مدیر برنامه‌ریزی',
  'PlanningManager',
  'planning_manager',
];

const EMPLOYEE_ROLES = [
  'planner',
  'کارمند برنامه‌ریزی',
  'PlanningEmployee',
  'planning_employee',
];

let usersColumnCache = null;

async function getUsersColumnInfo() {
  if (usersColumnCache) return usersColumnCache;

  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN ('full_name', 'name', 'employee_id')
  `);

  const cols = new Set(rows.map((r) => r.column_name));
  const nameParts = [];
  if (cols.has('full_name')) nameParts.push("NULLIF(TRIM(full_name), '')");
  if (cols.has('name')) nameParts.push("NULLIF(TRIM(name), '')");
  nameParts.push('username');

  usersColumnCache = {
    fullNameExpr: `COALESCE(${nameParts.join(', ')})`,
    employeeSelect: cols.has('employee_id') ? 'employee_id' : 'NULL::varchar AS employee_id',
  };
  return usersColumnCache;
}

async function queryPlanningUsers(roles) {
  const { fullNameExpr, employeeSelect } = await getUsersColumnInfo();
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `
      SELECT
        id,
        username,
        ${fullNameExpr} AS full_name,
        role,
        ${employeeSelect}
      FROM users
      WHERE role IN (${placeholders})
      ORDER BY full_name, username
    `,
    roles
  );

  return rows;
}

async function ensurePermissionsTable() {
  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'planning_manager_approval_permissions'
    ) AS exists
  `);

  if (tableCheck.rows[0].exists) return true;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planning_manager_approval_permissions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      line_type VARCHAR(255) NOT NULL,
      permission_type VARCHAR(50) NOT NULL DEFAULT 'approval',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, line_type, permission_type)
    )
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_user_id ON planning_manager_approval_permissions(user_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_line_type ON planning_manager_approval_permissions(line_type)'
  );

  return true;
}

async function getPlanningManagers(req, res) {
  try {
    const rows = await queryPlanningUsers(MANAGER_ROLES);
    res.json(rows);
  } catch (error) {
    console.error('Error getting planning managers:', error);
    res.status(500).json({
      message: 'خطا در دریافت لیست مدیران برنامه‌ریزی',
      error: error.message,
    });
  }
}

async function getPlanningEmployees(req, res) {
  try {
    const rows = await queryPlanningUsers(EMPLOYEE_ROLES);
    res.json(rows);
  } catch (error) {
    console.error('Error getting planning employees:', error);
    res.status(500).json({
      message: 'خطا در دریافت لیست کارمندان برنامه‌ریزی',
      error: error.message,
    });
  }
}

async function getApprovalPermissions(req, res) {
  try {
    await ensurePermissionsTable();

    const { rows } = await pool.query(`
      SELECT
        pmap.id,
        pmap.user_id,
        pmap.username,
        pmap.full_name,
        pmap.line_type,
        pmap.permission_type,
        pmap.created_at,
        pmap.updated_at,
        u.role
      FROM planning_manager_approval_permissions pmap
      LEFT JOIN users u ON pmap.user_id = u.id
      ORDER BY pmap.line_type, pmap.full_name
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error getting approval permissions:', error);
    res.status(500).json({
      message: 'خطا در دریافت مجوزها',
      error: error.message,
    });
  }
}

async function checkApprovalPermission(req, res) {
  try {
    const { userId, lineType } = req.query;

    if (!userId || !lineType) {
      return res.status(400).json({ message: 'userId و lineType الزامی است' });
    }

    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'planning_manager_approval_permissions'
      ) AS exists
    `);

    if (!tableCheck.rows[0].exists) {
      return res.json({ hasPermission: false });
    }

    let normalizedLineType = lineType;
    if (lineType === 'بستنی' || lineType === 'IceCream') {
      normalizedLineType = 'IceCream';
    } else if (lineType === 'پاستوریزه' || lineType === 'Dairy') {
      normalizedLineType = 'Dairy';
    } else if (lineType === 'لبنیات-فروتلند' || lineType === 'Ambient') {
      normalizedLineType = 'Ambient';
    }

    const { rows } = await pool.query(
      `
        SELECT COUNT(*) AS count
        FROM planning_manager_approval_permissions
        WHERE user_id = $1 AND line_type = $2
      `,
      [userId, normalizedLineType]
    );

    res.json({ hasPermission: parseInt(rows[0].count, 10) > 0 });
  } catch (error) {
    console.error('Error checking approval permission:', error);
    res.json({ hasPermission: false });
  }
}

async function addApprovalPermission(req, res) {
  try {
    const { userId, username, fullName, lineType, permissionType = 'approval' } = req.body;

    if (!userId || !username || !fullName || !lineType) {
      return res.status(400).json({ message: 'همه فیلدها الزامی است' });
    }

    await ensurePermissionsTable();

    let normalizedLineType = lineType;
    if (lineType === 'بستنی' || lineType === 'IceCream') {
      normalizedLineType = 'IceCream';
    } else if (lineType === 'پاستوریزه' || lineType === 'Dairy') {
      normalizedLineType = 'Dairy';
    } else if (lineType === 'لبنیات-فروتلند' || lineType === 'Ambient') {
      normalizedLineType = 'Ambient';
    }

    const existing = await pool.query(
      `
        SELECT id FROM planning_manager_approval_permissions
        WHERE user_id = $1 AND line_type = $2 AND permission_type = $3
      `,
      [userId, normalizedLineType, permissionType]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'این مجوز قبلاً ثبت شده است' });
    }

    const id = crypto.randomUUID();

    await pool.query(
      `
        INSERT INTO planning_manager_approval_permissions
          (id, user_id, username, full_name, line_type, permission_type)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [id, userId, username, fullName, normalizedLineType, permissionType]
    );

    res.status(201).json({ message: 'مجوز با موفقیت اضافه شد', id });
  } catch (error) {
    console.error('Error adding approval permission:', error);
    res.status(500).json({ message: 'خطا در افزودن مجوز', error: error.message });
  }
}

async function deleteApprovalPermission(req, res) {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `
        DELETE FROM planning_manager_approval_permissions
        WHERE id = $1
        RETURNING *
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'مجوز یافت نشد' });
    }

    res.json({ message: 'مجوز با موفقیت حذف شد' });
  } catch (error) {
    console.error('Error deleting approval permission:', error);
    res.status(500).json({ message: 'خطا در حذف مجوز', error: error.message });
  }
}

module.exports = {
  getPlanningManagers,
  getPlanningEmployees,
  getApprovalPermissions,
  checkApprovalPermission,
  addApprovalPermission,
  deleteApprovalPermission,
};
