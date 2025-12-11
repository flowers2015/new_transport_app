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
    
    // ساخت query برای گرفتن branch name
    let branchJoin = '';
    let branchSelect = '';
    if (hasBranchId) {
      branchSelect = ', b.name as branch_city_name';
      branchJoin = 'LEFT JOIN branches b ON users.branch_id = b.id';
    } else if (hasBranchCity) {
      branchSelect = ', COALESCE(b.name, users.branch_city) as branch_city_name';
      branchJoin = 'LEFT JOIN branches b ON users.branch_city = b.id';
    } else {
      branchSelect = ', NULL as branch_city_name';
    }
    
    const { rows } = await pool.query(`
      SELECT users.*, ${nameColumn} as display_name${branchSelect}
      FROM users
      ${branchJoin}
      WHERE users.username = $1
    `, [username]);
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
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  login,
};
