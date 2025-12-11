const pool = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createAdminActionsTable } = require('../migrations/create_admin_actions_table');

// Helper function برای تولید UUID
function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * Helper function برای ثبت تغییرات در audit trail
 */
async function logAdminAction(req, actionType, tableName, recordId, oldValue, newValue, reason) {
  try {
    await createAdminActionsTable();
    
    const userId = req.user?.userId || req.user?.id;
    const userName = req.user?.username 
      ? (req.user?.name ? `${req.user.username} - ${req.user.name}` : req.user.username)
      : (req.user?.name || 'سیستم');
    const userRole = req.user?.role;
    const ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];

    console.log('📝 [logAdminAction] ثبت لاگ تغییرات:', {
      actionType,
      tableName,
      recordId,
      recordIdType: typeof recordId,
      recordIdLength: recordId?.length,
      userId,
      userName,
      userRole,
      hasReason: !!reason
    });

    await pool.query(`
      INSERT INTO admin_actions (
        id, user_id, user_name, user_role, action_type, table_name, record_id,
        old_value, new_value, reason, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      generateUUID(),
      userId,
      userName,
      userRole,
      actionType,
      tableName,
      recordId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      reason,
      ipAddress,
      userAgent
    ]);

    console.log('✅ [logAdminAction] لاگ با موفقیت ثبت شد:', {
      tableName,
      recordId
    });
  } catch (error) {
    console.error('❌ [logAdminAction] خطا در ثبت لاگ:', error);
    // لاگ خطا را throw نمی‌کنیم تا عملیات اصلی متوقف نشود
  }
}

/**
 * دریافت لیست تمام کاربران
 */
async function getAllUsers(req, res) {
  try {
    const { search, role, branch_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // بررسی اینکه کدام ستون‌ها وجود دارند
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('branch_id', 'branch_city', 'email', 'full_name', 'name')
    `);
    
    const hasBranchId = columnCheck.rows.some(r => r.column_name === 'branch_id');
    const hasBranchCity = columnCheck.rows.some(r => r.column_name === 'branch_city');
    const hasEmail = columnCheck.rows.some(r => r.column_name === 'email');
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const hasName = columnCheck.rows.some(r => r.column_name === 'name');
    
    const branchColumn = hasBranchId ? 'branch_id' : (hasBranchCity ? 'branch_city' : null);
    const nameColumn = hasFullName ? 'full_name' : (hasName ? 'name' : null);
    
    // ساخت query بر اساس ستون‌های موجود
    // اگر branch_city وجود دارد، باید بررسی کنیم که آیا این ID است یا نام شهر
    // اگر branch_id وجود دارد، از branches table join می‌کنیم
    // اگر branch_city وجود دارد و به نظر می‌رسد که ID است (UUID format)، از branches table join می‌کنیم
    let branchJoin = '';
    let branchSelect = 'NULL as branch_id, NULL as branch_name';
    if (hasBranchId) {
      branchSelect = 'u.branch_id, b.name as branch_name';
      branchJoin = 'LEFT JOIN branches b ON u.branch_id = b.id';
    } else if (hasBranchCity) {
      // اگر branch_city وجود دارد، سعی می‌کنیم از branches table join کنیم
      // اگر branch_city یک UUID است (36 کاراکتر با خط تیره)، از branches table join می‌کنیم
      branchSelect = 'u.branch_city as branch_id, COALESCE(b.name, u.branch_city) as branch_name';
      branchJoin = 'LEFT JOIN branches b ON u.branch_city = b.id';
    }
    
    let query = `
      SELECT 
        u.id,
        u.username,
        ${hasEmail ? 'u.email' : 'NULL as email'},
        ${nameColumn ? `u.${nameColumn}` : 'NULL'} as full_name,
        u.role,
        ${branchSelect},
        u.created_at,
        u.updated_at,
        COUNT(*) OVER() as total_count
      FROM users u
      ${branchJoin}
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      const searchConditions = ['u.username ILIKE $' + paramIndex];
      if (hasEmail) {
        searchConditions.push('u.email ILIKE $' + paramIndex);
      }
      if (nameColumn) {
        searchConditions.push(`u.${nameColumn} ILIKE $` + paramIndex);
      }
      query += ` AND (${searchConditions.join(' OR ')})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      query += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (branch_id) {
      query += ` AND u.${branchColumn} = $${paramIndex}`;
      params.push(branch_id);
      paramIndex++;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      users: result.rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email || null,
        fullName: row.full_name || null,
        role: row.role,
        branchId: row.branch_id || null,
        branchName: row.branch_name || null, // فقط branch_name را برگردان، نه branch_id
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      total: result.rows[0]?.total_count || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('❌ [getAllUsers] خطا:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست کاربران: ' + error.message });
  }
}

/**
 * دریافت اطلاعات یک کاربر
 */
async function getUserById(req, res) {
  try {
    const { id } = req.params;

    // بررسی اینکه کدام ستون‌ها وجود دارند
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('branch_id', 'branch_city', 'email', 'full_name', 'name')
    `);
    
    const hasBranchId = columnCheck.rows.some(r => r.column_name === 'branch_id');
    const hasBranchCity = columnCheck.rows.some(r => r.column_name === 'branch_city');
    const hasEmail = columnCheck.rows.some(r => r.column_name === 'email');
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const hasName = columnCheck.rows.some(r => r.column_name === 'name');
    
    const nameColumn = hasFullName ? 'full_name' : (hasName ? 'name' : null);
    
    // ساخت query برای branch - مشابه getAllUsers
    let branchJoin = '';
    let branchSelect = 'NULL as branch_id, NULL as branch_name';
    if (hasBranchId) {
      branchSelect = 'u.branch_id, b.name as branch_name';
      branchJoin = 'LEFT JOIN branches b ON u.branch_id = b.id';
    } else if (hasBranchCity) {
      branchSelect = 'u.branch_city as branch_id, COALESCE(b.name, u.branch_city) as branch_name';
      branchJoin = 'LEFT JOIN branches b ON u.branch_city = b.id';
    }
    
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        ${hasEmail ? 'u.email' : 'NULL as email'},
        ${nameColumn ? `u.${nameColumn}` : 'NULL'} as full_name,
        u.role,
        ${branchSelect},
        u.created_at,
        u.updated_at
      FROM users u
      ${branchJoin}
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email || null,
      fullName: user.full_name || null,
      role: user.role,
      branchId: user.branch_id || null,
      branchName: user.branch_name || null, // فقط branch_name را برگردان، نه branch_id
      createdAt: user.created_at,
      updatedAt: user.updated_at
    });
  } catch (error) {
    console.error('❌ [getUserById] خطا:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات کاربر: ' + error.message });
  }
}

/**
 * ایجاد کاربر جدید
 */
async function createUser(req, res) {
  try {
    const { username, email, fullName, password, role, branchId } = req.body;

    // اعتبارسنجی ورودی‌ها
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'فیلدهای username, password و role الزامی هستند' });
    }
    
    // ایمیل اختیاری است - اگر ارسال نشده باشد، null می‌شود

    // بررسی اینکه کدام ستون‌ها وجود دارند
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('branch_id', 'branch_city', 'email', 'full_name', 'name')
    `);
    
    const hasBranchId = columnCheck.rows.some(r => r.column_name === 'branch_id');
    const hasBranchCity = columnCheck.rows.some(r => r.column_name === 'branch_city');
    const hasEmail = columnCheck.rows.some(r => r.column_name === 'email');
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const hasName = columnCheck.rows.some(r => r.column_name === 'name');
    
    const branchColumn = hasBranchId ? 'branch_id' : (hasBranchCity ? 'branch_city' : null);
    const nameColumn = hasFullName ? 'full_name' : (hasName ? 'name' : null);

    // بررسی تکراری نبودن username
    let existingUserQuery = 'SELECT id FROM users WHERE username = $1';
    const existingUserParams = [username];
    
    if (hasEmail && email) {
      existingUserQuery += ' OR email = $2';
      existingUserParams.push(email);
    }
    
    const existingUser = await pool.query(existingUserQuery, existingUserParams);

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'نام کاربری' + (hasEmail && email ? ' یا ایمیل' : '') + ' تکراری است' });
    }

    // Hash کردن رمز عبور
    const passwordHash = await bcrypt.hash(password, 10);

    // ساخت query برای INSERT
    const insertColumns = ['id', 'username', 'password_hash', 'role'];
    const insertValues = [generateUUID(), username, passwordHash, role];
    let valueIndex = insertValues.length + 1;
    
    if (hasEmail && email) {
      insertColumns.push('email');
      insertValues.push(email);
    }
    
    if (nameColumn && fullName) {
      insertColumns.push(nameColumn);
      insertValues.push(fullName);
    }
    
    if (branchColumn && branchId) {
      insertColumns.push(branchColumn);
      insertValues.push(branchId);
    }
    
    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
    
    // ایجاد کاربر
    const userId = insertValues[0]; // اولین مقدار id است
    await pool.query(`
      INSERT INTO users (${insertColumns.join(', ')})
      VALUES (${placeholders})
    `, insertValues);

    // ثبت در audit trail
    await logAdminAction(
      req,
      'create',
      'users',
      userId,
      null,
      { username, email, fullName, role, branchId },
      `ایجاد کاربر جدید: ${username}`
    );

    res.status(201).json({
      message: 'کاربر با موفقیت ایجاد شد',
      userId
    });
  } catch (error) {
    console.error('❌ [createUser] خطا:', error);
    res.status(500).json({ message: 'خطا در ایجاد کاربر: ' + error.message });
  }
}

/**
 * به‌روزرسانی کاربر
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { email, fullName, role, branchId, password, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'دلیل تغییر الزامی است' });
    }

    // دریافت اطلاعات قبلی
    const oldUserResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (oldUserResult.rows.length === 0) {
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    const oldUser = oldUserResult.rows[0];
    
    // بررسی اینکه کدام ستون‌ها وجود دارند
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('branch_id', 'branch_city', 'email', 'full_name', 'name')
    `);
    
    const hasEmail = columnCheck.rows.some(r => r.column_name === 'email');
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const hasName = columnCheck.rows.some(r => r.column_name === 'name');
    const nameColumn = hasFullName ? 'full_name' : (hasName ? 'name' : null);
    
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (email !== undefined && hasEmail) {
      // بررسی تکراری نبودن email
      const existingEmail = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({ message: 'ایمیل تکراری است' });
      }
      updates.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (fullName !== undefined && nameColumn) {
      updates.push(`${nameColumn} = $${paramIndex}`);
      params.push(fullName);
      paramIndex++;
    }

    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (branchId !== undefined) {
      // بررسی اینکه کدام ستون branch وجود دارد
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('branch_id', 'branch_city')
      `);
      const hasBranchId = columnCheck.rows.some(r => r.column_name === 'branch_id');
      const branchColumn = hasBranchId ? 'branch_id' : 'branch_city';
      
      updates.push(`${branchColumn} = $${paramIndex}`);
      params.push(branchId);
      paramIndex++;
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramIndex}`);
      params.push(passwordHash);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'هیچ فیلدی برای به‌روزرسانی ارسال نشده است' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await pool.query(`
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, params);

    // دریافت اطلاعات جدید
    const newUserResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const newUser = newUserResult.rows[0];

    // ثبت در audit trail
    await logAdminAction(
      req,
      'update',
      'users',
      id,
      {
        email: oldUser.email,
        full_name: oldUser.full_name,
        role: oldUser.role,
        branch_id: oldUser.branch_id
      },
      {
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        branch_id: newUser.branch_id
      },
      reason
    );

    res.json({
      message: 'کاربر با موفقیت به‌روزرسانی شد'
    });
  } catch (error) {
    console.error('❌ [updateUser] خطا:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی کاربر: ' + error.message });
  }
}

/**
 * حذف کاربر (Soft Delete - غیرفعال کردن)
 */
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'دلیل حذف الزامی است' });
    }

    // دریافت اطلاعات کاربر
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    const user = userResult.rows[0];

    // حذف کاربر (در حال حاضر hard delete - می‌توانید soft delete کنید)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // ثبت در audit trail
    await logAdminAction(
      req,
      'delete',
      'users',
      id,
      {
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      null,
      reason
    );

    res.json({
      message: 'کاربر با موفقیت حذف شد'
    });
  } catch (error) {
    console.error('❌ [deleteUser] خطا:', error);
    res.status(500).json({ message: 'خطا در حذف کاربر: ' + error.message });
  }
}

/**
 * دریافت لاگ تغییرات (Audit Trail)
 */
async function getAdminActions(req, res) {
  try {
    const { 
      userId, 
      tableName, 
      recordId, 
      actionType,
      startDate,
      endDate,
      page = 1, 
      limit = 50 
    } = req.query;

    const offset = (page - 1) * limit;
    let query = `
      SELECT 
        aa.*,
        COUNT(*) OVER() as total_count
      FROM admin_actions aa
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND aa.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (tableName) {
      query += ` AND aa.table_name = $${paramIndex}`;
      params.push(tableName);
      paramIndex++;
    }

    if (recordId) {
      console.log('🔍 [getAdminActions] جستجوی recordId:', {
        recordId,
        tableName,
        recordIdType: typeof recordId,
        recordIdLength: recordId?.length
      });
      
      // اگر recordId یک announcementCode است (شروع می‌شود با "ANN-")، باید آن را به id تبدیل کنیم
      if (tableName === 'freight_announcements' && recordId.startsWith('ANN-')) {
        console.log('🔄 [getAdminActions] تبدیل announcementCode به id:', recordId);
        // جستجو بر اساس announcement_code
        const { rows: annRows } = await pool.query(
          'SELECT id FROM freight_announcements WHERE announcement_code = $1 LIMIT 1',
          [recordId]
        );
        if (annRows.length > 0) {
          const actualId = annRows[0].id;
          console.log('✅ [getAdminActions] پیدا شد:', { announcementCode: recordId, id: actualId });
          query += ` AND aa.record_id = $${paramIndex}`;
          params.push(actualId);
        } else {
          console.log('⚠️ [getAdminActions] announcementCode پیدا نشد:', recordId);
          // اگر announcementCode پیدا نشد، هیچ نتیجه‌ای برنگردان
          query += ` AND 1=0`;
        }
      } else {
        query += ` AND aa.record_id = $${paramIndex}`;
        params.push(recordId);
      }
      paramIndex++;
    }

    if (actionType) {
      query += ` AND aa.action_type = $${paramIndex}`;
      params.push(actionType);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND aa.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND aa.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY aa.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      actions: result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        userRole: row.user_role,
        actionType: row.action_type,
        tableName: row.table_name,
        recordId: row.record_id,
        oldValue: row.old_value,
        newValue: row.new_value,
        reason: row.reason,
        ipAddress: row.ip_address,
        createdAt: row.created_at
      })),
      total: result.rows[0]?.total_count || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('❌ [getAdminActions] خطا:', error);
    res.status(500).json({ message: 'خطا در دریافت لاگ تغییرات: ' + error.message });
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getAdminActions,
  logAdminAction // Export برای استفاده در سایر کنترلرها
};

