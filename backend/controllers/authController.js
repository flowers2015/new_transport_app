const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    // ابتدا کاربر را بدون join بگیریم (ساده‌تر و سریع‌تر)
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // گرفتن branch name اگر branch_id یا branch_city وجود دارد
    let branchCityValue = user.branch_city || null;
    if ((user.branch_id || user.branch_city) && !branchCityValue) {
      try {
        // بررسی اینکه آیا جدول branches وجود دارد
        const branchesCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'branches'
          )
        `);
        const branchesTableExists = branchesCheck.rows[0]?.exists || false;
        
        if (branchesTableExists) {
          if (user.branch_id) {
            const branchResult = await pool.query('SELECT name FROM branches WHERE id = $1', [user.branch_id]);
            if (branchResult.rows.length > 0) {
              branchCityValue = branchResult.rows[0].name;
            }
          } else if (user.branch_city) {
            // اگر branch_city یک UUID است، سعی می‌کنیم از branches table بگیریم
            const branchResult = await pool.query('SELECT name FROM branches WHERE id = $1', [user.branch_city]);
            if (branchResult.rows.length > 0) {
              branchCityValue = branchResult.rows[0].name;
            } else {
              // اگر پیدا نشد، احتمالاً branch_city خودش نام شهر است
              branchCityValue = user.branch_city;
            }
          }
        }
      } catch (branchError) {
        console.warn('⚠️ [Login] Could not fetch branch name:', branchError.message);
        // اگر خطا رخ داد، از مقدار اصلی استفاده کن
        branchCityValue = user.branch_city || null;
      }
    }

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.branch_id || null, 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }); // 7 روز اعتبار

    // Return both token and user data
    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.branch_id || null,
        fullName: user.full_name || user.name || null,
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
