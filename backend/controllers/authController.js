const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    // بررسی اینکه کدام ستون name در جدول users وجود دارد
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('full_name', 'name')
    `);
    const hasFullName = columnCheck.rows.some(r => r.column_name === 'full_name');
    const hasName = columnCheck.rows.some(r => r.column_name === 'name');
    const nameColumn = hasFullName ? 'full_name' : (hasName ? 'name' : 'username');
    
    // بررسی اینکه آیا branch_id یا branch_city وجود دارد
    const branchColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('branch_id', 'branch_city')
    `);
    const hasBranchId = branchColumnCheck.rows.some(r => r.column_name === 'branch_id');
    const hasBranchCity = branchColumnCheck.rows.some(r => r.column_name === 'branch_city');
    
    // بررسی اینکه آیا جدول branches وجود دارد
    let branchesTableExists = false;
    try {
      const branchesCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'branches'
        )
      `);
      branchesTableExists = branchesCheck.rows[0]?.exists || false;
    } catch (err) {
      console.warn('⚠️ [Login] Could not check branches table existence:', err.message);
      branchesTableExists = false;
    }
    
    // ساخت query برای گرفتن branch name
    let branchJoin = '';
    let branchSelect = '';
    if (hasBranchId && branchesTableExists) {
      branchSelect = ', b.name as branch_city_name';
      branchJoin = 'LEFT JOIN branches b ON users.branch_id = b.id';
    } else if (hasBranchCity && branchesTableExists) {
      branchSelect = ', COALESCE(b.name, users.branch_city) as branch_city_name';
      branchJoin = 'LEFT JOIN branches b ON users.branch_city = b.id';
    } else {
      branchSelect = ', NULL as branch_city_name';
    }
    
    // ساخت query با error handling
    let query = `SELECT users.*, ${nameColumn} as display_name${branchSelect} FROM users`;
    if (branchJoin) {
      query += ` ${branchJoin}`;
    }
    query += ` WHERE users.username = $1`;
    
    const { rows } = await pool.query(query, [username]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.branch_id, 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }); // 7 روز اعتبار

    // Return both token and user data
    // branchCity باید نام شهر باشد، نه ID
    const branchCityValue = user.branch_city_name || user.branch_city || null;
    
    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.branch_id,
        fullName: user.display_name || user.full_name || user.name || null,
        email: user.email || null,
        branchCity: branchCityValue
      }
    });

  } catch (error) {
    console.error('❌ [Login] Error:', error);
    console.error('❌ [Login] Error stack:', error.stack);
    // ارسال پیام خطای دقیق‌تر برای debugging
    const errorMessage = error.message || 'Internal server error';
    res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
}

module.exports = {
  login,
};
