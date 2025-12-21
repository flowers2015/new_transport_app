const pool = require('../db');
const crypto = require('crypto');

/**
 * دریافت لیست مدیران برنامه‌ریزی
 */
async function getPlanningManagers(req, res) {
  try {
    // بررسی اینکه کدام ستون name وجود دارد
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('name', 'full_name')
    `);
    
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const nameColumn = hasFullName ? 'full_name' : 'name';
    
    // نقش‌های مدیر برنامه‌ریزی
    const { rows } = await pool.query(`
      SELECT 
        id,
        username,
        ${nameColumn} as full_name,
        role,
        employee_id
      FROM users 
      WHERE role IN (
        'planner_manager',
        'مدیر برنامه‌ریزی',
        'PlanningManager',
        'planning_manager'
      )
      ORDER BY ${nameColumn}
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error getting planning managers:', error);
    res.status(500).json({ 
      message: 'خطا در دریافت لیست مدیران برنامه‌ریزی',
      error: error.message 
    });
  }
}

/**
 * دریافت لیست کارمندان برنامه‌ریزی
 */
async function getPlanningEmployees(req, res) {
  try {
    // بررسی اینکه کدام ستون name وجود دارد
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('name', 'full_name')
    `);
    
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const nameColumn = hasFullName ? 'full_name' : 'name';
    
    // نقش‌های کارمند برنامه‌ریزی
    const { rows } = await pool.query(`
      SELECT 
        id,
        username,
        ${nameColumn} as full_name,
        role,
        employee_id
      FROM users 
      WHERE role IN (
        'planner',
        'کارمند برنامه‌ریزی',
        'PlanningEmployee',
        'planning_employee'
      )
      ORDER BY ${nameColumn}
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error getting planning employees:', error);
    res.status(500).json({ 
      message: 'خطا در دریافت لیست کارمندان برنامه‌ریزی',
      error: error.message 
    });
  }
}

/**
 * دریافت مجوزهای تاییدیه
 */
async function getApprovalPermissions(req, res) {
  try {
    // بررسی وجود جدول
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'planning_manager_approval_permissions'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('Table planning_manager_approval_permissions does not exist');
      return res.status(500).json({ 
        message: 'جدول مجوزها وجود ندارد. لطفاً migration را اجرا کنید.',
        error: 'TABLE_NOT_FOUND'
      });
    }
    
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
      error: error.message 
    });
  }
}

/**
 * بررسی مجوز کاربر برای تاییدیه در یک لاین خاص
 */
async function checkApprovalPermission(req, res) {
  try {
    const { userId, lineType } = req.query;
    
    if (!userId || !lineType) {
      return res.status(400).json({ message: 'userId و lineType الزامی است' });
    }
    
    // بررسی وجود جدول
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'planning_manager_approval_permissions'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      // اگر جدول وجود ندارد، false برگردان (بدون خطا)
      return res.json({ hasPermission: false });
    }
    
    // تبدیل lineType به فرمت استاندارد
    let normalizedLineType = lineType;
    if (lineType === 'بستنی' || lineType === 'IceCream') {
      normalizedLineType = 'IceCream';
    } else if (lineType === 'پاستوریزه' || lineType === 'Dairy') {
      normalizedLineType = 'Dairy';
    } else if (lineType === 'لبنیات-فروتلند' || lineType === 'Ambient') {
      normalizedLineType = 'Ambient';
    }
    
    const { rows } = await pool.query(`
      SELECT COUNT(*) as count
      FROM planning_manager_approval_permissions
      WHERE user_id = $1 AND line_type = $2
    `, [userId, normalizedLineType]);
    
    const hasPermission = parseInt(rows[0].count) > 0;
    
    res.json({ hasPermission });
  } catch (error) {
    console.error('Error checking approval permission:', error);
    // در صورت خطا، false برگردان (بدون خطا)
    res.json({ hasPermission: false });
  }
}

/**
 * افزودن مجوز تاییدیه یا ایجاد اعلام بار
 */
async function addApprovalPermission(req, res) {
  try {
    const { userId, username, fullName, lineType, permissionType = 'approval' } = req.body;
    
    if (!userId || !username || !fullName || !lineType) {
      return res.status(400).json({ message: 'همه فیلدها الزامی است' });
    }
    
    // تبدیل lineType به فرمت استاندارد
    let normalizedLineType = lineType;
    if (lineType === 'بستنی' || lineType === 'IceCream') {
      normalizedLineType = 'IceCream';
    } else if (lineType === 'پاستوریزه' || lineType === 'Dairy') {
      normalizedLineType = 'Dairy';
    } else if (lineType === 'لبنیات-فروتلند' || lineType === 'Ambient') {
      normalizedLineType = 'Ambient';
    }
    
    // بررسی تکراری بودن
    const existing = await pool.query(`
      SELECT id FROM planning_manager_approval_permissions 
      WHERE user_id = $1 AND line_type = $2 AND permission_type = $3
    `, [userId, normalizedLineType, permissionType]);
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'این مجوز قبلاً ثبت شده است' });
    }
    
    const id = crypto.randomUUID();
    
    await pool.query(`
      INSERT INTO planning_manager_approval_permissions (id, user_id, username, full_name, line_type, permission_type)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, userId, username, fullName, normalizedLineType, permissionType]);
    
    res.status(201).json({ message: 'مجوز با موفقیت اضافه شد', id });
  } catch (error) {
    console.error('Error adding approval permission:', error);
    res.status(500).json({ message: 'خطا در افزودن مجوز' });
  }
}

/**
 * حذف مجوز تاییدیه
 */
async function deleteApprovalPermission(req, res) {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
      DELETE FROM planning_manager_approval_permissions 
      WHERE id = $1 
      RETURNING *
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'مجوز یافت نشد' });
    }
    
    res.json({ message: 'مجوز با موفقیت حذف شد' });
  } catch (error) {
    console.error('Error deleting approval permission:', error);
    res.status(500).json({ message: 'خطا در حذف مجوز' });
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

