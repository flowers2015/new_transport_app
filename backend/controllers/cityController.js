const pool = require('../db');

/**
 * دریافت لیست همه شهرها
 */
async function getCities(req, res) {
  try {
    // بررسی وجود جدول cities
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cities'
      )
    `);
    
    const citiesTableExists = tableCheck.rows[0].exists;
    
    let cities = [];
    
    if (citiesTableExists) {
      // استفاده از جدول cities
      const result = await pool.query(`
        SELECT 
          id,
          city_name as "cityName",
          province,
          approved_mission_days as "approvedMissionDays",
          city_kilometers as "cityKilometers",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM cities
        ORDER BY province, city_name
      `);
      
      cities = result.rows;
    } else {
      // استفاده از dispatch_routes به عنوان fallback
      const result = await pool.query(`
        SELECT DISTINCT
          city as "cityName",
          province,
          NULL as "approvedMissionDays",
          CASE 
            WHEN round_trip_km IS NOT NULL THEN round_trip_km / 2 
            ELSE NULL 
          END as "cityKilometers"
        FROM dispatch_routes
        WHERE is_active = TRUE 
          AND city IS NOT NULL 
          AND city != ''
          AND province IS NOT NULL 
          AND province != ''
        ORDER BY province, city
      `);
      
      // ساخت id موقت برای هر شهر
      cities = result.rows.map((row, index) => ({
        id: `temp-${index}`,
        ...row,
        createdAt: null,
        updatedAt: null
      }));
    }
    
    res.json(cities);
  } catch (error) {
    console.error('❌ [getCities] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست شهرها', error: error.message });
  }
}

/**
 * دریافت یک شهر با ID
 */
async function getCityById(req, res) {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        city_name as "cityName",
        province,
        approved_mission_days as "approvedMissionDays",
        city_kilometers as "cityKilometers",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM cities
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'شهر یافت نشد' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ [getCityById] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت شهر', error: error.message });
  }
}

/**
 * ایجاد شهر جدید
 */
async function createCity(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { cityName, province, approvedMissionDays, cityKilometers } = req.body;
    
    // اعتبارسنجی
    if (!cityName || !province) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'اسم شهر و استان الزامی است' });
    }
    
    // بررسی تکراری بودن
    const checkQuery = await client.query(`
      SELECT id FROM cities 
      WHERE LOWER(city_name) = LOWER($1) AND LOWER(province) = LOWER($2)
    `, [cityName, province]);
    
    if (checkQuery.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'این شهر با این استان قبلاً ثبت شده است' });
    }
    
    // ایجاد ID
    const id = require('crypto').randomUUID();
    
    // درج در دیتابیس
    const insertQuery = await client.query(`
      INSERT INTO cities (
        id, city_name, province, approved_mission_days, city_kilometers, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING 
        id,
        city_name as "cityName",
        province,
        approved_mission_days as "approvedMissionDays",
        city_kilometers as "cityKilometers",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      id,
      cityName,
      province,
      approvedMissionDays || null,
      cityKilometers || null
    ]);
    
    await client.query('COMMIT');
    
    res.status(201).json(insertQuery.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [createCity] Error:', error);
    
    // اگر جدول cities وجود ندارد، آن را ایجاد کن
    if (error.message.includes('does not exist') || error.message.includes('relation "cities"')) {
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS cities (
            id VARCHAR(255) PRIMARY KEY,
            city_name VARCHAR(255) NOT NULL,
            province VARCHAR(255) NOT NULL,
            approved_mission_days INTEGER,
            city_kilometers NUMERIC(10, 2),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(city_name, province)
          )
        `);
        await client.query('COMMIT');
        // دوباره تلاش کن
        return createCity(req, res);
      } catch (createError) {
        await client.query('ROLLBACK');
        return res.status(500).json({ 
          message: 'خطا در ایجاد جدول cities', 
          error: createError.message 
        });
      }
    }
    
    res.status(500).json({ message: 'خطا در ایجاد شهر', error: error.message });
  } finally {
    client.release();
  }
}

/**
 * به‌روزرسانی شهر
 */
async function updateCity(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { cityName, province, approvedMissionDays, cityKilometers } = req.body;
    
    // اعتبارسنجی
    if (!cityName || !province) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'اسم شهر و استان الزامی است' });
    }
    
    // بررسی وجود شهر
    const checkQuery = await client.query('SELECT id FROM cities WHERE id = $1', [id]);
    if (checkQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'شهر یافت نشد' });
    }
    
    // بررسی تکراری بودن (به جز خودش)
    const duplicateQuery = await client.query(`
      SELECT id FROM cities 
      WHERE LOWER(city_name) = LOWER($1) 
        AND LOWER(province) = LOWER($2)
        AND id != $3
    `, [cityName, province, id]);
    
    if (duplicateQuery.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'این شهر با این استان قبلاً ثبت شده است' });
    }
    
    // به‌روزرسانی
    const updateQuery = await client.query(`
      UPDATE cities
      SET 
        city_name = $1,
        province = $2,
        approved_mission_days = $3,
        city_kilometers = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING 
        id,
        city_name as "cityName",
        province,
        approved_mission_days as "approvedMissionDays",
        city_kilometers as "cityKilometers",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      cityName,
      province,
      approvedMissionDays || null,
      cityKilometers || null,
      id
    ]);
    
    await client.query('COMMIT');
    
    res.json(updateQuery.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [updateCity] Error:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی شهر', error: error.message });
  } finally {
    client.release();
  }
}

/**
 * حذف شهر
 */
async function deleteCity(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // بررسی وجود شهر
    const checkQuery = await client.query('SELECT id FROM cities WHERE id = $1', [id]);
    if (checkQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'شهر یافت نشد' });
    }
    
    // حذف
    await client.query('DELETE FROM cities WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({ message: 'شهر با موفقیت حذف شد' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [deleteCity] Error:', error);
    res.status(500).json({ message: 'خطا در حذف شهر', error: error.message });
  } finally {
    client.release();
  }
}

/**
 * Import از Excel
 */
async function importCitiesFromExcel(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    if (!req.file) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'فایل Excel ارسال نشده است' });
    }
    
    // استفاده از کتابخانه xlsx برای خواندن فایل
    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    const results = {
      total: data.length,
      success: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };
    
    // اطمینان از وجود جدول cities
    await client.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id VARCHAR(255) PRIMARY KEY,
        city_name VARCHAR(255) NOT NULL,
        province VARCHAR(255) NOT NULL,
        approved_mission_days INTEGER,
        city_kilometers NUMERIC(10, 2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(city_name, province)
      )
    `);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        // استخراج داده‌ها با نام‌های مختلف ستون
        const cityName = row['اسم شهر'] || row['شهر'] || row['cityName'] || row['city_name'] || row['cityName'] || '';
        const province = row['استان'] || row['province'] || '';
        const approvedMissionDays = row['ماموریت مصوب'] || row['approvedMissionDays'] || row['approved_mission_days'] || null;
        const cityKilometers = row['کیلومتر شهر'] || row['cityKilometers'] || row['city_kilometers'] || null;
        
        if (!cityName || !province) {
          results.skipped++;
          results.errors.push({ row: i + 2, error: 'اسم شهر یا استان خالی است' });
          continue;
        }
        
        // بررسی وجود شهر
        const checkQuery = await client.query(`
          SELECT id FROM cities 
          WHERE LOWER(city_name) = LOWER($1) AND LOWER(province) = LOWER($2)
        `, [cityName, province]);
        
        if (checkQuery.rows.length > 0) {
          // به‌روزرسانی
          await client.query(`
            UPDATE cities
            SET 
              approved_mission_days = $1,
              city_kilometers = $2,
              updated_at = NOW()
            WHERE id = $3
          `, [
            approvedMissionDays ? parseFloat(approvedMissionDays) : null,
            cityKilometers ? parseFloat(cityKilometers) : null,
            checkQuery.rows[0].id
          ]);
          results.updated++;
        } else {
          // ایجاد جدید
          const id = require('crypto').randomUUID();
          await client.query(`
            INSERT INTO cities (id, city_name, province, approved_mission_days, city_kilometers, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          `, [
            id,
            cityName,
            province,
            approvedMissionDays ? parseFloat(approvedMissionDays) : null,
            cityKilometers ? parseFloat(cityKilometers) : null
          ]);
          results.success++;
        }
      } catch (error) {
        results.skipped++;
        results.errors.push({ row: i + 2, error: error.message });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Import با موفقیت انجام شد',
      results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [importCitiesFromExcel] Error:', error);
    res.status(500).json({ message: 'خطا در import از Excel', error: error.message });
  } finally {
    client.release();
  }
}

/**
 * Import از JSON
 */
async function importCitiesFromJson(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { cities } = req.body;
    
    if (!Array.isArray(cities)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'داده باید یک آرایه باشد' });
    }
    
    const results = {
      total: cities.length,
      success: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };
    
    // اطمینان از وجود جدول cities
    await client.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id VARCHAR(255) PRIMARY KEY,
        city_name VARCHAR(255) NOT NULL,
        province VARCHAR(255) NOT NULL,
        approved_mission_days INTEGER,
        city_kilometers NUMERIC(10, 2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(city_name, province)
      )
    `);
    
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      try {
        // پشتیبانی از camelCase و snake_case
        const cityName = city.cityName || city.city_name || '';
        const province = city.province || '';
        const approvedMissionDays = city.approvedMissionDays || city.approved_mission_days || null;
        const cityKilometers = city.cityKilometers || city.city_kilometers || null;
        
        if (!cityName || !province) {
          results.skipped++;
          results.errors.push({ row: i + 1, error: 'cityName و province الزامی است' });
          continue;
        }
        
        // بررسی وجود شهر
        const checkQuery = await client.query(`
          SELECT id FROM cities 
          WHERE LOWER(city_name) = LOWER($1) AND LOWER(province) = LOWER($2)
        `, [cityName, province]);
        
        if (checkQuery.rows.length > 0) {
          // به‌روزرسانی
          await client.query(`
            UPDATE cities
            SET 
              approved_mission_days = $1,
              city_kilometers = $2,
              updated_at = NOW()
            WHERE id = $3
          `, [
            approvedMissionDays ? parseFloat(approvedMissionDays) : null,
            cityKilometers ? parseFloat(cityKilometers) : null,
            checkQuery.rows[0].id
          ]);
          results.updated++;
        } else {
          // ایجاد جدید
          const id = require('crypto').randomUUID();
          await client.query(`
            INSERT INTO cities (id, city_name, province, approved_mission_days, city_kilometers, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          `, [
            id,
            cityName,
            province,
            approvedMissionDays ? parseFloat(approvedMissionDays) : null,
            cityKilometers ? parseFloat(cityKilometers) : null
          ]);
          results.success++;
        }
      } catch (error) {
        results.skipped++;
        results.errors.push({ row: i + 1, error: error.message });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Import با موفقیت انجام شد',
      results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [importCitiesFromJson] Error:', error);
    res.status(500).json({ message: 'خطا در import از JSON', error: error.message });
  } finally {
    client.release();
  }
}

module.exports = {
  getCities,
  getCityById,
  createCity,
  updateCity,
  deleteCity,
  importCitiesFromExcel,
  importCitiesFromJson
};

