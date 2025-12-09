const pool = require('../db');
const crypto = require('crypto');

/**
 * دریافت لیست کاربران ترابری (شرکت و شخصی)
 */
async function getTransportUsers(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id,
        username,
        name as full_name,
        role,
        employee_id
      FROM users 
      WHERE role IN ('کاربر ترابری (شرکت)', 'کاربر ترابری (خودرو شخصی)', 'ترابری')
      ORDER BY name
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error getting transport users:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست کاربران' });
  }
}

/**
 * دریافت دسترسی‌های اتمام تخصیص
 */
async function getFinalizePermissions(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        fp.id,
        fp.user_id,
        fp.username,
        fp.full_name,
        fp.line_type,
        fp.created_at,
        fp.updated_at,
        u.role
      FROM finalize_permissions fp
      LEFT JOIN users u ON fp.user_id = u.id
      ORDER BY fp.line_type, fp.full_name
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error getting finalize permissions:', error);
    res.status(500).json({ message: 'خطا در دریافت دسترسی‌ها' });
  }
}

/**
 * بررسی دسترسی کاربر برای اتمام تخصیص در یک تب خاص
 */
async function checkFinalizePermission(req, res) {
  try {
    const { userId, lineType } = req.query;
    
    if (!userId || !lineType) {
      return res.status(400).json({ message: 'userId و lineType الزامی است' });
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
      FROM finalize_permissions
      WHERE user_id = $1 AND line_type = $2
    `, [userId, normalizedLineType]);
    
    const hasPermission = parseInt(rows[0].count) > 0;
    
    res.json({ hasPermission });
  } catch (error) {
    console.error('Error checking finalize permission:', error);
    res.status(500).json({ message: 'خطا در بررسی دسترسی' });
  }
}

/**
 * افزودن دسترسی اتمام تخصیص
 */
async function addFinalizePermission(req, res) {
  try {
    const { userId, username, fullName, lineType } = req.body;
    
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
      SELECT id FROM finalize_permissions 
      WHERE user_id = $1 AND line_type = $2
    `, [userId, normalizedLineType]);
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'این دسترسی قبلاً ثبت شده است' });
    }
    
    const id = crypto.randomUUID();
    
    await pool.query(`
      INSERT INTO finalize_permissions (id, user_id, username, full_name, line_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, userId, username, fullName, normalizedLineType]);
    
    res.status(201).json({ message: 'دسترسی با موفقیت اضافه شد', id });
  } catch (error) {
    console.error('Error adding finalize permission:', error);
    res.status(500).json({ message: 'خطا در افزودن دسترسی' });
  }
}

/**
 * حذف دسترسی اتمام تخصیص
 */
async function deleteFinalizePermission(req, res) {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
      DELETE FROM finalize_permissions 
      WHERE id = $1 
      RETURNING *
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'دسترسی یافت نشد' });
    }
    
    res.json({ message: 'دسترسی با موفقیت حذف شد' });
  } catch (error) {
    console.error('Error deleting finalize permission:', error);
    res.status(500).json({ message: 'خطا در حذف دسترسی' });
  }
}

module.exports = {
  getTransportUsers,
  getFinalizePermissions,
  checkFinalizePermission,
  addFinalizePermission,
  deleteFinalizePermission,
};

