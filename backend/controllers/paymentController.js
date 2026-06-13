const pool = require('../db');
const crypto = require('crypto');

/**
 * ایجاد جدول payments
 */
async function createPaymentsTable() {
  try {
    // بررسی وجود جدول
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'driver_payments'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // ایجاد جدول
      await pool.query(`
        CREATE TABLE IF NOT EXISTS driver_payments (
          id VARCHAR(255) PRIMARY KEY,
          driver_id VARCHAR(255) NOT NULL,
          payment_date VARCHAR(10) NOT NULL, -- تاریخ شمسی پرداخت YYYY/MM/DD
          payment_amount DECIMAL(15, 2) NOT NULL,
          calculation_date_from VARCHAR(10), -- تاریخ محاسبه از (شمسی)
          calculation_date_to VARCHAR(10), -- تاریخ محاسبه تا (شمسی)
          payment_list_date VARCHAR(10), -- تاریخ تهیه لیست هزینه (شمسی)
          created_by VARCHAR(255),
          updated_by VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          notes TEXT
        )
      `);
      console.log('✅ [createPaymentsTable] جدول driver_payments ایجاد شد');
    } else {
      console.log('ℹ️ [createPaymentsTable] جدول driver_payments از قبل وجود دارد');
    }
  } catch (error) {
    console.error('❌ [createPaymentsTable] Error:', error);
    throw error;
  }
}

/**
 * ثبت پرداخت
 */
async function savePayment(req, res) {
  try {
    await createPaymentsTable();

    const {
      driverId,
      paymentDate,
      paymentAmount,
      calculationDateFrom,
      calculationDateTo,
      paymentListDate,
      notes,
      userId,
      calculationId,
      announcementId,
    } = req.body;

    if (!driverId || !paymentDate || !paymentAmount) {
      return res.status(400).json({ message: 'driverId، paymentDate و paymentAmount الزامی است.' });
    }

    const id = crypto.randomUUID();

    await pool.query(`
      INSERT INTO driver_payments (
        id, driver_id, payment_date, payment_amount,
        calculation_date_from, calculation_date_to, payment_list_date,
        notes, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      driverId,
      paymentDate,
      paymentAmount,
      calculationDateFrom || null,
      calculationDateTo || null,
      paymentListDate || null,
      notes || null,
      userId || null,
      userId || null,
    ]);

    // به‌روزرسانی وضعیت پرداخت در driver_calculations — اولویت با شناسه تور/محاسبه
    try {
      if (calculationId) {
        const { rowCount } = await pool.query(`
          UPDATE driver_calculations 
          SET is_paid = TRUE, updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND is_paid = FALSE
        `, [userId || null, calculationId]);
        console.log('✅ [savePayment] is_paid برای calculationId:', calculationId, 'rows:', rowCount);
      } else if (announcementId && driverId) {
        const { rowCount } = await pool.query(`
          UPDATE driver_calculations 
          SET is_paid = TRUE, updated_by = $1, updated_at = NOW()
          WHERE driver_id = $2 AND announcement_id = $3 AND is_paid = FALSE
        `, [userId || null, driverId, announcementId]);
        console.log('✅ [savePayment] is_paid برای announcementId:', announcementId, 'rows:', rowCount);
      } else if (calculationDateFrom && calculationDateTo) {
        const { rowCount } = await pool.query(`
          UPDATE driver_calculations 
          SET is_paid = TRUE, updated_by = $1, updated_at = NOW()
          WHERE driver_id = $2 
            AND calculation_date >= $3 
            AND calculation_date <= $4
            AND is_paid = FALSE
        `, [userId || null, driverId, calculationDateFrom, calculationDateTo]);
        console.log('✅ [savePayment] is_paid برای بازه تاریخ، rows:', rowCount);
      } else if (driverId) {
        const { rowCount } = await pool.query(`
          UPDATE driver_calculations 
          SET is_paid = TRUE, updated_by = $1, updated_at = NOW()
          WHERE driver_id = $2 AND is_paid = FALSE
        `, [userId || null, driverId]);
        console.log('✅ [savePayment] is_paid برای همه تورهای راننده، rows:', rowCount);
      }
    } catch (updateError) {
      console.error('⚠️ [savePayment] خطا در به‌روزرسانی وضعیت پرداخت:', updateError);
    }

    console.log('✅ [savePayment] پرداخت ثبت شد:', id);
    return res.status(201).json({ 
      message: 'پرداخت با موفقیت ثبت شد.',
      id 
    });
  } catch (error) {
    console.error('❌ [savePayment] Error:', error);
    res.status(500).json({ message: 'خطا در ثبت پرداخت.' });
  }
}

/**
 * دریافت آخرین پرداخت برای یک راننده
 */
async function getLastPayment(req, res) {
  try {
    // بررسی وجود جدول
    await createPaymentsTable();

    const { driverId } = req.params;

    if (!driverId) {
      return res.status(400).json({ message: 'driverId الزامی است.' });
    }

    const { rows } = await pool.query(`
      SELECT * FROM driver_payments
      WHERE driver_id = $1
      ORDER BY payment_date DESC, created_at DESC
      LIMIT 1
    `, [driverId]);

    if (rows.length === 0) {
      return res.json(null);
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('❌ [getLastPayment] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت آخرین پرداخت.' });
  }
}

/**
 * دریافت تمام پرداخت‌ها
 */
async function getPayments(req, res) {
  try {
    // بررسی وجود جدول driver_payments
    await createPaymentsTable();
    
    const { driverId, startDate, endDate } = req.query;

    // ابتدا query ساده بدون JOIN با users
    let query = `
      SELECT dp.*, 
             d.employee_id,
             d.name as driver_name
      FROM driver_payments dp
      LEFT JOIN drivers d ON dp.driver_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (driverId) {
      query += ` AND dp.driver_id = $${paramIndex++}`;
      params.push(driverId);
    }

    if (startDate) {
      query += ` AND dp.payment_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND dp.payment_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY dp.payment_date DESC, dp.created_at DESC`;

    console.log('🔍 [getPayments] Query:', query);
    console.log('🔍 [getPayments] Params:', params);

    const { rows } = await pool.query(query, params);
    
    // اگر users table وجود دارد، created_by_name را اضافه کن
    let hasUsersTable = false;
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      hasUsersTable = tableCheck.rows[0].exists;
    } catch (err) {
      console.log('ℹ️ [getPayments] جدول users وجود ندارد');
    }
    
    // اگر users table وجود دارد و created_by وجود دارد، نام کاربر را بگیر
    if (hasUsersTable && rows.length > 0) {
      const userIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
      if (userIds.length > 0) {
        try {
          const usersRes = await pool.query(`
            SELECT id, full_name FROM users WHERE id = ANY($1)
          `, [userIds]);
          const usersMap = new Map(usersRes.rows.map(u => [u.id, u.full_name]));
          rows.forEach(row => {
            if (row.created_by && usersMap.has(row.created_by)) {
              row.created_by_name = usersMap.get(row.created_by);
            }
          });
        } catch (userErr) {
          console.log('ℹ️ [getPayments] خطا در دریافت نام کاربران:', userErr.message);
        }
      }
    }
    
    console.log('✅ [getPayments] Found', rows.length, 'payments');
    res.json(rows);
  } catch (error) {
    console.error('❌ [getPayments] Error:', error);
    console.error('❌ [getPayments] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({ 
      message: 'خطا در دریافت پرداخت‌ها.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  createPaymentsTable,
  savePayment,
  getLastPayment,
  getPayments,
};

