const bcrypt = require('bcrypt');
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
    
    const { rows } = await pool.query(`SELECT *, ${nameColumn} as display_name FROM users WHERE username = $1`, [username]);
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
    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.branch_id,
        fullName: user.display_name || user.full_name || user.name || null,
        email: user.email || null,
        branchCity: user.branch_city || null
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
