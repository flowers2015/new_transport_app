const pool = require('../db');
const crypto = require('crypto');

/**
 * جستجوی رانندگان شخصی بر اساس کد ملی یا نام
 */
async function searchPersonalDrivers(req, res) {
  try {
    const { query, q } = req.query;
    const searchTerm = query || q;
    
    if (!searchTerm || searchTerm.length < 2) {
      return res.json([]);
    }

    const { rows } = await pool.query(`
      SELECT 
        id,
        national_id AS "nationalId",
        name,
        mobile,
        driver_smart_id AS "driverSmartId",
        created_at AS "createdAt"
      FROM personal_drivers 
      WHERE 
        national_id = $1 OR 
        national_id ILIKE $2 OR 
        name ILIKE $2
      ORDER BY 
        CASE WHEN national_id = $1 THEN 1 ELSE 2 END,
        name
      LIMIT 10
    `, [searchTerm, `%${searchTerm}%`]);

    res.json(rows);
  } catch (error) {
    console.error('Error searching personal drivers:', error);
    res.status(500).json({ message: 'خطا در جستجوی رانندگان شخصی' });
  }
}

/**
 * دریافت راننده شخصی بر اساس کد ملی
 */
async function getPersonalDriverByNationalId(req, res) {
  try {
    const { nationalId } = req.params;

    const { rows } = await pool.query(`
      SELECT 
        id,
        national_id AS "nationalId",
        name,
        mobile,
        driver_smart_id AS "driverSmartId",
        created_at AS "createdAt"
      FROM personal_drivers 
      WHERE national_id = $1
    `, [nationalId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'راننده با این کد ملی یافت نشد' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error getting personal driver:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات راننده' });
  }
}

/**
 * ایجاد راننده شخصی جدید
 */
async function createPersonalDriver(req, res) {
  try {
    const { nationalId, name, mobile, driverSmartId } = req.body;

    if (!nationalId || !name || !mobile || !driverSmartId) {
      return res.status(400).json({ message: 'کد ملی، نام، شماره تماس و هوشمند راننده الزامی است' });
    }

    // بررسی تکراری بودن کد ملی
    const existingDriver = await pool.query(
      'SELECT id FROM personal_drivers WHERE national_id = $1',
      [nationalId]
    );

    if (existingDriver.rows.length > 0) {
      return res.status(400).json({ message: 'راننده با این کد ملی قبلاً ثبت شده است' });
    }

    // بررسی تکراری بودن هوشمند راننده
    const existingSmartId = await pool.query(
      'SELECT id FROM personal_drivers WHERE driver_smart_id = $1',
      [driverSmartId]
    );

    if (existingSmartId.rows.length > 0) {
      return res.status(400).json({ message: 'هوشمند راننده قبلاً استفاده شده است' });
    }

    const id = crypto.randomUUID();
    
    const { rows } = await pool.query(`
      INSERT INTO personal_drivers (id, national_id, name, mobile, driver_smart_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING 
        id,
        national_id AS "nationalId",
        name,
        mobile,
        driver_smart_id AS "driverSmartId",
        created_at AS "createdAt"
    `, [id, nationalId, name, mobile, driverSmartId]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating personal driver:', error);
    res.status(500).json({ message: 'خطا در ثبت راننده جدید' });
  }
}

/**
 * به‌روزرسانی راننده شخصی
 */
async function updatePersonalDriver(req, res) {
  try {
    const { id } = req.params;
    const { name, mobile, driverSmartId } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (mobile) { fields.push(`mobile = $${idx++}`); values.push(mobile); }
    if (driverSmartId) { 
      // بررسی تکراری بودن هوشمند راننده
      const existingSmartId = await pool.query(
        'SELECT id FROM personal_drivers WHERE driver_smart_id = $1 AND id != $2',
        [driverSmartId, id]
      );

      if (existingSmartId.rows.length > 0) {
        return res.status(400).json({ message: 'هوشمند راننده قبلاً استفاده شده است' });
      }
      
      fields.push(`driver_smart_id = $${idx++}`); 
      values.push(driverSmartId); 
    }
    
    fields.push(`updated_at = NOW()`);

    if (fields.length > 1) {
      const updateQuery = `UPDATE personal_drivers SET ${fields.join(', ')} WHERE id = $${idx}`;
      values.push(id);
      
      const { rows } = await pool.query(updateQuery, values);
      
      if (rows.length === 0) {
        return res.status(404).json({ message: 'راننده یافت نشد' });
      }
    }

    // دریافت اطلاعات به‌روزرسانی شده
    const { rows } = await pool.query(`
      SELECT 
        id,
        national_id AS "nationalId",
        name,
        mobile,
        driver_smart_id AS "driverSmartId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM personal_drivers 
      WHERE id = $1
    `, [id]);

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating personal driver:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی راننده' });
  }
}

/**
 * دریافت همه رانندگان شخصی
 */
async function getAllPersonalDrivers(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id,
        national_id AS "nationalId",
        name,
        mobile,
        driver_smart_id AS "driverSmartId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM personal_drivers 
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error getting all personal drivers:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست رانندگان' });
  }
}

module.exports = {
  searchPersonalDrivers,
  getPersonalDriverByNationalId,
  createPersonalDriver,
  updatePersonalDriver,
  getAllPersonalDrivers
};
