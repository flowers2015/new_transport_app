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

    if (!nationalId || !name) {
      return res.status(400).json({ message: 'کد ملی و نام الزامی است (موبایل و کد هوشمند راننده اختیاری هستند)' });
    }

    // بررسی تکراری بودن کد ملی
    const existingDriver = await pool.query(
      'SELECT id FROM personal_drivers WHERE national_id = $1',
      [nationalId]
    );

    if (existingDriver.rows.length > 0) {
      return res.status(400).json({ message: 'راننده با این کد ملی قبلاً ثبت شده است' });
    }

    // بررسی تکراری بودن هوشمند راننده (فقط اگر وارد شده باشد)
    if (driverSmartId) {
      const existingSmartId = await pool.query(
        'SELECT id FROM personal_drivers WHERE driver_smart_id = $1',
        [driverSmartId]
      );

      if (existingSmartId.rows.length > 0) {
        return res.status(400).json({ message: 'هوشمند راننده قبلاً استفاده شده است' });
      }
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
    `, [id, nationalId, name, mobile || null, driverSmartId || null]);

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
    const { nationalId, name, mobile, driverSmartId } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (nationalId) {
      // بررسی تکراری بودن کد ملی
      const existingNationalId = await pool.query(
        'SELECT id FROM personal_drivers WHERE national_id = $1 AND id != $2',
        [nationalId, id]
      );

      if (existingNationalId.rows.length > 0) {
        return res.status(400).json({ message: 'کد ملی قبلاً ثبت شده است' });
      }
      
      fields.push(`national_id = $${idx++}`); 
      values.push(nationalId); 
    }
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
      
      const result = await pool.query(updateQuery, values);
      
      if (result.rowCount === 0) {
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

    if (rows.length === 0) {
      return res.status(404).json({ message: 'راننده یافت نشد' });
    }

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

/**
 * دریافت راننده شخصی بر اساس ID
 */
async function getPersonalDriverById(req, res) {
  try {
    const { id } = req.params;
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

    if (rows.length === 0) {
      return res.status(404).json({ message: 'راننده یافت نشد' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error getting personal driver by id:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات راننده' });
  }
}

/**
 * حذف راننده شخصی
 */
async function deletePersonalDriver(req, res) {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(
      'DELETE FROM personal_drivers WHERE id = $1 RETURNING *',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'راننده یافت نشد' });
    }

    res.json({ message: 'راننده با موفقیت حذف شد', deleted: rows[0] });
  } catch (error) {
    console.error('Error deleting personal driver:', error);
    res.status(500).json({ message: 'خطا در حذف راننده' });
  }
}

/**
 * Import رانندگان شخصی از فایل اکسل
 * POST /api/v1/personal-drivers/import-excel
 * Body (multipart/form-data):
 *   - file: فایل اکسل (.xlsx, .xls)
 */
async function importPersonalDriversFromExcel(req, res) {
  const XLSX = require('xlsx');
  const fs = require('fs');
  
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'هیچ فایلی ارسال نشده است' });
    }

    // خواندن فایل اکسل
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; // اولین sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // خواندن به صورت array برای بررسی header
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    console.log('🔍 [ImportExcel] First 3 rows of raw data:', rawData.slice(0, 3));
    
    // خواندن به صورت object
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    
    console.log('🔍 [ImportExcel] Total rows:', data.length);
    if (data.length > 0) {
      console.log('🔍 [ImportExcel] First row keys:', Object.keys(data[0]));
      console.log('🔍 [ImportExcel] First row values:', data[0]);
    }

    if (data.length === 0) {
      // حذف فایل موقت
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'فایل اکسل خالی است' });
    }

    const results = {
      total: data.length,
      success: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    // پردازش هر ردیف
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 چون header در ردیف 1 است و index از 0 شروع می‌شود

      try {
        // استخراج داده‌ها از اکسل (با نام‌های مختلف ممکن)
        // لاگ کردن کلیدهای موجود در row برای دیباگ
        if (i === 0) {
          console.log('🔍 [ImportExcel] Available columns in first row:', Object.keys(row));
        }
        
        // استخراج کد ملی - بررسی همه حالت‌های ممکن (با فاصله، بدون فاصله، نیم‌فاصله)
        let nationalId = '';
        const nationalIdKeys = Object.keys(row).find(key => 
          key.trim() === 'کد ملی' || 
          key.trim() === 'کدملی' || 
          key.trim() === 'کد‌ملی' ||
          key.toLowerCase().trim() === 'national_id' ||
          key.toLowerCase().trim() === 'nationalid'
        );
        if (nationalIdKeys) {
          nationalId = String(row[nationalIdKeys] || '').trim();
        }
        
        // استخراج نام - بررسی همه حالت‌های ممکن
        let name = '';
        const nameKeys = Object.keys(row).find(key => 
          key.trim() === 'نام' ||
          key.toLowerCase().trim() === 'name'
        );
        if (nameKeys) {
          name = String(row[nameKeys] || '').trim();
        }
        
        // استخراج موبایل - بررسی همه حالت‌های ممکن
        let mobile = '';
        const mobileKeys = Object.keys(row).find(key => 
          key.trim() === 'موبایل' ||
          key.trim() === 'شماره موبایل' ||
          key.toLowerCase().trim() === 'mobile'
        );
        if (mobileKeys) {
          mobile = String(row[mobileKeys] || '').trim();
        }
        
        // استخراج کد هوشمند راننده - بررسی همه حالت‌های ممکن
        let driverSmartId = '';
        const driverSmartIdKeys = Object.keys(row).find(key => 
          key.trim() === 'کد هوشمند راننده' ||
          key.trim() === 'کد هوشمند' ||
          key.trim() === 'کد‌هوشمند راننده' ||
          key.toLowerCase().trim() === 'driver_smart_id' ||
          key.toLowerCase().trim() === 'driversmartid'
        );
        if (driverSmartIdKeys) {
          driverSmartId = String(row[driverSmartIdKeys] || '').trim();
        }
        
        // لاگ کردن برای ردیف اول
        if (i === 0) {
          console.log('🔍 [ImportExcel] First row extracted data:', {
            nationalId,
            name,
            mobile,
            driverSmartId,
            rawRow: row
          });
        }

        // Validation فیلدهای اجباری (موبایل و کد هوشمند راننده اختیاری هستند - از کاربر گرفته می‌شوند)
        const missingFields = [];
        if (!nationalId) missingFields.push('کد ملی');
        if (!name) missingFields.push('نام');
        // driverSmartId اختیاری است - اگر خالی بود، null می‌گذاریم و بعد از کاربر گرفته می‌شود
        
        if (missingFields.length > 0) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `فیلدهای اجباری خالی است: ${missingFields.join('، ')}`,
            data: { nationalId, name, mobile, driverSmartId }
          });
          continue;
        }

        // Validation فرمت کد ملی (10 رقم)
        if (!/^\d{10}$/.test(nationalId)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'کد ملی باید 10 رقم باشد',
            data: { nationalId }
          });
          continue;
        }

        // Validation فرمت موبایل (اگر وارد شده باشد، باید معتبر باشد)
        // موبایل اختیاری است، اما اگر وارد شده باشد باید معتبر باشد
        if (mobile && !/^09\d{9}$/.test(mobile)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'شماره موبایل باید 11 رقم و با 09 شروع شود (یا خالی باشد)',
            data: { mobile }
          });
          continue;
        }

        // بررسی وجود راننده با این کد ملی
        const existingDriver = await pool.query(
          'SELECT id FROM personal_drivers WHERE national_id = $1',
          [nationalId]
        );

        if (existingDriver.rows.length > 0) {
          // Update existing driver
          const driverId = existingDriver.rows[0].id;
          
          // بررسی تکراری بودن driver_smart_id برای راننده دیگر (فقط اگر driverSmartId وارد شده باشد)
          if (driverSmartId) {
            const existingSmartId = await pool.query(
              'SELECT id FROM personal_drivers WHERE driver_smart_id = $1 AND id != $2',
              [driverSmartId, driverId]
            );

            if (existingSmartId.rows.length > 0) {
              results.skipped++;
              results.errors.push({
                row: rowNumber,
                error: 'کد هوشمند راننده قبلاً برای راننده دیگری استفاده شده است',
                data: { driverSmartId }
              });
              continue;
            }
          }

          // Update: اگر driverSmartId خالی بود، null می‌گذاریم (بعد از کاربر گرفته می‌شود)
          await pool.query(
            'UPDATE personal_drivers SET name = $1, mobile = $2, driver_smart_id = $3, updated_at = NOW() WHERE id = $4',
            [name, mobile || null, driverSmartId || null, driverId]
          );
          results.updated++;
        } else {
          // بررسی تکراری بودن driver_smart_id (فقط اگر driverSmartId وارد شده باشد)
          if (driverSmartId) {
            const existingSmartId = await pool.query(
              'SELECT id FROM personal_drivers WHERE driver_smart_id = $1',
              [driverSmartId]
            );

            if (existingSmartId.rows.length > 0) {
              results.skipped++;
              results.errors.push({
                row: rowNumber,
                error: 'کد هوشمند راننده قبلاً استفاده شده است',
                data: { driverSmartId }
              });
              continue;
            }
          }

          // Create new driver: اگر driverSmartId خالی بود، null می‌گذاریم (بعد از کاربر گرفته می‌شود)
          const id = crypto.randomUUID();
          await pool.query(
            'INSERT INTO personal_drivers (id, national_id, name, mobile, driver_smart_id) VALUES ($1, $2, $3, $4, $5)',
            [id, nationalId, name, mobile || null, driverSmartId || null]
          );
          results.success++;
        }
      } catch (error) {
        results.skipped++;
        results.errors.push({
          row: rowNumber,
          error: error.message || 'خطای نامشخص',
          data: row
        });
      }
    }

    // حذف فایل موقت
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'Import با موفقیت انجام شد',
      results
    });
  } catch (error) {
    // حذف فایل موقت در صورت خطا
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }

    console.error('Error importing personal drivers from Excel:', error);
    res.status(500).json({ message: 'خطا در import فایل اکسل', error: error.message });
  }
}

module.exports = {
  searchPersonalDrivers,
  getPersonalDriverByNationalId,
  createPersonalDriver,
  updatePersonalDriver,
  getAllPersonalDrivers,
  getPersonalDriverById,
  deletePersonalDriver,
  importPersonalDriversFromExcel
};
