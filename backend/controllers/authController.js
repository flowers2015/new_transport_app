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

    // بررسی قفل بودن حساب کاربری
    const now = new Date();
    if (user.account_locked_until && new Date(user.account_locked_until) > now) {
      const lockUntil = new Date(user.account_locked_until);
      const minutesLeft = Math.ceil((lockUntil - now) / 1000 / 60);
      return res.status(423).json({ 
        message: `حساب کاربری شما به دلیل تلاش‌های ناموفق به مدت ${minutesLeft} دقیقه قفل شده است. لطفاً بعداً تلاش کنید.`,
        lockedUntil: user.account_locked_until
      });
    }

    // اگر قفل منقضی شده، آن را بردار
    if (user.account_locked_until && new Date(user.account_locked_until) <= now) {
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = $1',
        [user.id]
      );
      user.failed_login_attempts = 0;
      user.account_locked_until = null;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      // افزایش تعداد تلاش‌های ناموفق
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const MAX_ATTEMPTS = 5;
      const LOCK_DURATION_MINUTES = 15;

      if (failedAttempts >= MAX_ATTEMPTS) {
        // قفل کردن حساب برای 15 دقیقه
        const lockUntil = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);
        await pool.query(
          'UPDATE users SET failed_login_attempts = $1, account_locked_until = $2 WHERE id = $3',
          [failedAttempts, lockUntil, user.id]
        );
        return res.status(423).json({ 
          message: `به دلیل ${MAX_ATTEMPTS} تلاش ناموفق، حساب کاربری شما به مدت ${LOCK_DURATION_MINUTES} دقیقه قفل شد.`,
          lockedUntil: lockUntil
        });
      } else {
        // فقط افزایش تعداد تلاش‌های ناموفق
        await pool.query(
          'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
          [failedAttempts, user.id]
        );
        const remainingAttempts = MAX_ATTEMPTS - failedAttempts;
        return res.status(401).json({ 
          message: `نام کاربری یا رمز عبور اشتباه است. ${remainingAttempts} تلاش باقی مانده.`,
          remainingAttempts
        });
      }
    }

    // ورود موفق: ریست کردن تلاش‌های ناموفق
    if (user.failed_login_attempts > 0 || user.account_locked_until) {
      await pool.query(
        'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = $1',
        [user.id]
      );
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

    // بررسی انقضای رمز عبور (اختیاری - 90 روز)
    const PASSWORD_EXPIRY_DAYS = 90;
    let passwordExpired = false;
    let passwordExpiresIn = null;
    
    if (user.password_changed_at) {
      const passwordChangedDate = new Date(user.password_changed_at);
      const daysSinceChange = Math.floor((now - passwordChangedDate) / (1000 * 60 * 60 * 24));
      passwordExpiresIn = PASSWORD_EXPIRY_DAYS - daysSinceChange;
      
      if (daysSinceChange >= PASSWORD_EXPIRY_DAYS) {
        passwordExpired = true;
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
      },
      passwordExpired,
      passwordExpiresIn: passwordExpiresIn !== null ? Math.max(0, passwordExpiresIn) : null
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
