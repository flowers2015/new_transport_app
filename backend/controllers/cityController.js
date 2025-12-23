const pool = require('../db');

/**
 * دریافت لیست همه مسیرها از dispatch_routes
 */
async function getCities(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        city,
        province,
        round_trip_km::NUMERIC as "roundTripKm",
        expected_days::INTEGER as "expectedDays",
        approved_allowance::NUMERIC as "approvedAllowance",
        route_category as "routeCategory",
        distance_category as "distanceCategory",
        is_active as "isActive"
      FROM dispatch_routes
      ORDER BY province, city
    `);
    
    const routes = result.rows.map(row => ({
      id: row.id,
      city: row.city || '',
      province: row.province || '',
      roundTripKm: row.roundTripKm !== null ? parseFloat(row.roundTripKm) : null,
      expectedDays: row.expectedDays !== null ? parseInt(row.expectedDays) : null,
      approvedAllowance: row.approvedAllowance !== null ? parseFloat(row.approvedAllowance) : null,
      routeCategory: row.routeCategory || null,
      distanceCategory: row.distanceCategory || null,
      isActive: row.isActive !== null ? row.isActive : true
    }));
    
    res.json(routes);
  } catch (error) {
    console.error('❌ [getCities] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست مسیرها', error: error.message });
  }
}

/**
 * دریافت یک مسیر با ID
 */
async function getCityById(req, res) {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        city,
        province,
        round_trip_km::NUMERIC as "roundTripKm",
        expected_days::INTEGER as "expectedDays",
        approved_allowance::NUMERIC as "approvedAllowance",
        route_category as "routeCategory",
        distance_category as "distanceCategory",
        is_active as "isActive"
      FROM dispatch_routes
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'مسیر یافت نشد' });
    }
    
    const route = result.rows[0];
    res.json({
      id: route.id,
      city: route.city || '',
      province: route.province || '',
      roundTripKm: route.roundTripKm !== null ? parseFloat(route.roundTripKm) : null,
      expectedDays: route.expectedDays !== null ? parseInt(route.expectedDays) : null,
      approvedAllowance: route.approvedAllowance !== null ? parseFloat(route.approvedAllowance) : null,
      routeCategory: route.routeCategory || null,
      distanceCategory: route.distanceCategory || null,
      isActive: route.isActive !== null ? route.isActive : true
    });
  } catch (error) {
    console.error('❌ [getCityById] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت مسیر', error: error.message });
  }
}

/**
 * ایجاد مسیر جدید
 */
async function createCity(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { city, province, roundTripKm, expectedDays, approvedAllowance, routeCategory, distanceCategory, isActive } = req.body;
    
    if (!city || !province) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'شهر و استان الزامی است' });
    }
    
    const id = require('crypto').randomUUID();
    
    const insertQuery = await client.query(`
      INSERT INTO dispatch_routes (
        id, city, province, round_trip_km, expected_days, 
        approved_allowance, route_category, distance_category, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        city,
        province,
        round_trip_km::NUMERIC as "roundTripKm",
        expected_days::INTEGER as "expectedDays",
        approved_allowance::NUMERIC as "approvedAllowance",
        route_category as "routeCategory",
        distance_category as "distanceCategory",
        is_active as "isActive"
    `, [
      id,
      city,
      province,
      roundTripKm ? parseFloat(roundTripKm) : null,
      expectedDays ? parseInt(expectedDays) : null,
      approvedAllowance ? parseFloat(approvedAllowance) : null,
      routeCategory || null,
      distanceCategory || null,
      isActive !== undefined ? isActive : true
    ]);
    
    await client.query('COMMIT');
    
    const newRoute = insertQuery.rows[0];
    res.status(201).json({
      id: newRoute.id,
      city: newRoute.city || '',
      province: newRoute.province || '',
      roundTripKm: newRoute.roundTripKm !== null ? parseFloat(newRoute.roundTripKm) : null,
      expectedDays: newRoute.expectedDays !== null ? parseInt(newRoute.expectedDays) : null,
      approvedAllowance: newRoute.approvedAllowance !== null ? parseFloat(newRoute.approvedAllowance) : null,
      routeCategory: newRoute.routeCategory || null,
      distanceCategory: newRoute.distanceCategory || null,
      isActive: newRoute.isActive !== null ? newRoute.isActive : true
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [createCity] Error:', error);
    res.status(500).json({ message: 'خطا در ایجاد مسیر', error: error.message });
  } finally {
    client.release();
  }
}

/**
 * به‌روزرسانی مسیر
 */
async function updateCity(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { city, province, roundTripKm, expectedDays, approvedAllowance, routeCategory, distanceCategory, isActive } = req.body;
    
    if (!city || !province) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'شهر و استان الزامی است' });
    }
    
    const updateQuery = await client.query(`
      UPDATE dispatch_routes
      SET 
        city = $1,
        province = $2,
        round_trip_km = $3,
        expected_days = $4,
        approved_allowance = $5,
        route_category = $6,
        distance_category = $7,
        is_active = $8
      WHERE id = $9
      RETURNING 
        id,
        city,
        province,
        round_trip_km::NUMERIC as "roundTripKm",
        expected_days::INTEGER as "expectedDays",
        approved_allowance::NUMERIC as "approvedAllowance",
        route_category as "routeCategory",
        distance_category as "distanceCategory",
        is_active as "isActive"
    `, [
      city,
      province,
      roundTripKm ? parseFloat(roundTripKm) : null,
      expectedDays ? parseInt(expectedDays) : null,
      approvedAllowance ? parseFloat(approvedAllowance) : null,
      routeCategory || null,
      distanceCategory || null,
      isActive !== undefined ? isActive : true,
      id
    ]);
    
    if (updateQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'مسیر یافت نشد' });
    }
    
    await client.query('COMMIT');
    
    const updatedRoute = updateQuery.rows[0];
    res.json({
      id: updatedRoute.id,
      city: updatedRoute.city || '',
      province: updatedRoute.province || '',
      roundTripKm: updatedRoute.roundTripKm !== null ? parseFloat(updatedRoute.roundTripKm) : null,
      expectedDays: updatedRoute.expectedDays !== null ? parseInt(updatedRoute.expectedDays) : null,
      approvedAllowance: updatedRoute.approvedAllowance !== null ? parseFloat(updatedRoute.approvedAllowance) : null,
      routeCategory: updatedRoute.routeCategory || null,
      distanceCategory: updatedRoute.distanceCategory || null,
      isActive: updatedRoute.isActive !== null ? updatedRoute.isActive : true
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [updateCity] Error:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی مسیر', error: error.message });
  } finally {
    client.release();
  }
}

/**
 * حذف مسیر
 */
async function deleteCity(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    const deleteQuery = await client.query(`
      DELETE FROM dispatch_routes
      WHERE id = $1
      RETURNING id
    `, [id]);
    
    if (deleteQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'مسیر یافت نشد' });
    }
    
    await client.query('COMMIT');
    res.json({ message: 'مسیر با موفقیت حذف شد' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [deleteCity] Error:', error);
    res.status(500).json({ message: 'خطا در حذف مسیر', error: error.message });
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
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        // استخراج داده‌ها با نام‌های مختلف ستون
        const city = row['شهر'] || row['city'] || row['cityName'] || row['اسم شهر'] || '';
        const province = row['استان'] || row['province'] || '';
        const roundTripKmRaw = row['کیلومتر رفت و برگشت'] || row['roundTripKm'] || row['round_trip_km'] || row['کیلومتر'] || null;
        const expectedDaysRaw = row['روزهای مورد انتظار'] || row['expectedDays'] || row['expected_days'] || row['ماموریت مصوب'] || row['approvedMissionDays'] || null;
        const approvedAllowanceRaw = row['حق ماموریت مصوب'] || row['approvedAllowance'] || row['approved_allowance'] || null;
        const routeCategory = row['دسته‌بندی مسیر'] || row['routeCategory'] || row['route_category'] || null;
        const distanceCategory = row['دسته‌بندی فاصله'] || row['distanceCategory'] || row['distance_category'] || null;
        const isActiveRaw = row['فعال'] || row['isActive'] || row['is_active'] !== undefined ? row['is_active'] : true;
        
        // تبدیل به عدد
        const roundTripKm = roundTripKmRaw !== null && roundTripKmRaw !== '' && roundTripKmRaw !== undefined
          ? (typeof roundTripKmRaw === 'number' ? roundTripKmRaw : (isNaN(parseFloat(roundTripKmRaw)) ? null : parseFloat(roundTripKmRaw)))
          : null;
        const expectedDays = expectedDaysRaw !== null && expectedDaysRaw !== '' && expectedDaysRaw !== undefined
          ? (typeof expectedDaysRaw === 'number' ? expectedDaysRaw : (isNaN(parseFloat(expectedDaysRaw)) ? null : parseInt(expectedDaysRaw)))
          : null;
        const approvedAllowance = approvedAllowanceRaw !== null && approvedAllowanceRaw !== '' && approvedAllowanceRaw !== undefined
          ? (typeof approvedAllowanceRaw === 'number' ? approvedAllowanceRaw : (isNaN(parseFloat(approvedAllowanceRaw)) ? null : parseFloat(approvedAllowanceRaw)))
          : null;
        const isActive = isActiveRaw !== null && isActiveRaw !== '' && isActiveRaw !== undefined
          ? (typeof isActiveRaw === 'boolean' ? isActiveRaw : (String(isActiveRaw).toLowerCase() === 'true' || String(isActiveRaw) === '1'))
          : true;
        
        if (!city || !province) {
          results.skipped++;
          results.errors.push({ row: i + 2, error: 'شهر یا استان خالی است' });
          continue;
        }
        
        // بررسی وجود مسیر (بر اساس شهر و استان)
        const checkQuery = await client.query(`
          SELECT id FROM dispatch_routes 
          WHERE LOWER(city) = LOWER($1) AND LOWER(province) = LOWER($2)
        `, [city, province]);
        
        if (checkQuery.rows.length > 0) {
          // به‌روزرسانی
          await client.query(`
            UPDATE dispatch_routes
            SET 
              round_trip_km = $1,
              expected_days = $2,
              approved_allowance = $3,
              route_category = $4,
              distance_category = $5,
              is_active = $6
            WHERE id = $7
          `, [
            roundTripKm,
            expectedDays,
            approvedAllowance,
            routeCategory,
            distanceCategory,
            isActive,
            checkQuery.rows[0].id
          ]);
          results.updated++;
        } else {
          // ایجاد جدید
          const id = require('crypto').randomUUID();
          await client.query(`
            INSERT INTO dispatch_routes (
              id, city, province, round_trip_km, expected_days, 
              approved_allowance, route_category, distance_category, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            id,
            city,
            province,
            roundTripKm,
            expectedDays,
            approvedAllowance,
            routeCategory,
            distanceCategory,
            isActive
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
    
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      try {
        // پشتیبانی از camelCase و snake_case
        const cityName = city.city || city.cityName || city.city_name || '';
        const province = city.province || '';
        const roundTripKmRaw = city.roundTripKm || city.round_trip_km || null;
        const expectedDaysRaw = city.expectedDays || city.expected_days || city.approvedMissionDays || city.approved_mission_days || null;
        const approvedAllowanceRaw = city.approvedAllowance || city.approved_allowance || null;
        const routeCategory = city.routeCategory || city.route_category || null;
        const distanceCategory = city.distanceCategory || city.distance_category || null;
        const isActiveRaw = city.isActive !== undefined ? city.isActive : (city.is_active !== undefined ? city.is_active : true);
        
        // تبدیل به عدد
        const roundTripKm = roundTripKmRaw !== null && roundTripKmRaw !== '' && roundTripKmRaw !== undefined
          ? (typeof roundTripKmRaw === 'number' ? roundTripKmRaw : (isNaN(parseFloat(roundTripKmRaw)) ? null : parseFloat(roundTripKmRaw)))
          : null;
        const expectedDays = expectedDaysRaw !== null && expectedDaysRaw !== '' && expectedDaysRaw !== undefined
          ? (typeof expectedDaysRaw === 'number' ? expectedDaysRaw : (isNaN(parseFloat(expectedDaysRaw)) ? null : parseInt(expectedDaysRaw)))
          : null;
        const approvedAllowance = approvedAllowanceRaw !== null && approvedAllowanceRaw !== '' && approvedAllowanceRaw !== undefined
          ? (typeof approvedAllowanceRaw === 'number' ? approvedAllowanceRaw : (isNaN(parseFloat(approvedAllowanceRaw)) ? null : parseFloat(approvedAllowanceRaw)))
          : null;
        const isActive = isActiveRaw !== null && isActiveRaw !== '' && isActiveRaw !== undefined
          ? (typeof isActiveRaw === 'boolean' ? isActiveRaw : (String(isActiveRaw).toLowerCase() === 'true' || String(isActiveRaw) === '1'))
          : true;
        
        if (!cityName || !province) {
          results.skipped++;
          results.errors.push({ row: i + 1, error: 'city و province الزامی است' });
          continue;
        }
        
        // بررسی وجود مسیر
        const checkQuery = await client.query(`
          SELECT id FROM dispatch_routes 
          WHERE LOWER(city) = LOWER($1) AND LOWER(province) = LOWER($2)
        `, [cityName, province]);
        
        if (checkQuery.rows.length > 0) {
          // به‌روزرسانی
          await client.query(`
            UPDATE dispatch_routes
            SET 
              round_trip_km = $1,
              expected_days = $2,
              approved_allowance = $3,
              route_category = $4,
              distance_category = $5,
              is_active = $6
            WHERE id = $7
          `, [
            roundTripKm,
            expectedDays,
            approvedAllowance,
            routeCategory,
            distanceCategory,
            isActive,
            checkQuery.rows[0].id
          ]);
          results.updated++;
        } else {
          // ایجاد جدید
          const id = require('crypto').randomUUID();
          await client.query(`
            INSERT INTO dispatch_routes (
              id, city, province, round_trip_km, expected_days, 
              approved_allowance, route_category, distance_category, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            id,
            cityName,
            province,
            roundTripKm,
            expectedDays,
            approvedAllowance,
            routeCategory,
            distanceCategory,
            isActive
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

/**
 * Export شهرها به JSON
 */
async function exportCitiesToJson(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        city,
        province,
        round_trip_km::NUMERIC as "roundTripKm",
        expected_days::INTEGER as "expectedDays",
        approved_allowance::NUMERIC as "approvedAllowance",
        route_category as "routeCategory",
        distance_category as "distanceCategory",
        is_active as "isActive"
      FROM dispatch_routes
      ORDER BY province, city
    `);
    
    const routes = result.rows.map(row => ({
      city: row.city || '',
      province: row.province || '',
      roundTripKm: row.roundTripKm !== null ? parseFloat(row.roundTripKm) : null,
      expectedDays: row.expectedDays !== null ? parseInt(row.expectedDays) : null,
      approvedAllowance: row.approvedAllowance !== null ? parseFloat(row.approvedAllowance) : null,
      routeCategory: row.routeCategory || null,
      distanceCategory: row.distanceCategory || null,
      isActive: row.isActive !== null ? row.isActive : true
    }));
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dispatch_routes_export.json"');
    res.json(routes);
  } catch (error) {
    console.error('❌ [exportCitiesToJson] Error:', error);
    res.status(500).json({ message: 'خطا در export JSON', error: error.message });
  }
}

/**
 * Export شهرها به Excel
 */
async function exportCitiesToExcel(req, res) {
  try {
    const XLSX = require('xlsx');
    
    const result = await pool.query(`
      SELECT 
        city,
        province,
        round_trip_km::NUMERIC as "roundTripKm",
        expected_days::INTEGER as "expectedDays",
        approved_allowance::NUMERIC as "approvedAllowance",
        route_category as "routeCategory",
        distance_category as "distanceCategory",
        is_active as "isActive"
      FROM dispatch_routes
      ORDER BY province, city
    `);
    
    const routes = result.rows.map(row => ({
      'شهر': row.city || '',
      'استان': row.province || '',
      'کیلومتر رفت و برگشت': row.roundTripKm !== null ? parseFloat(row.roundTripKm) : '',
      'روزهای مورد انتظار': row.expectedDays !== null ? parseInt(row.expectedDays) : '',
      'حق ماموریت مصوب': row.approvedAllowance !== null ? parseFloat(row.approvedAllowance) : '',
      'دسته‌بندی مسیر': row.routeCategory || '',
      'دسته‌بندی فاصله': row.distanceCategory || '',
      'فعال': row.isActive !== null ? row.isActive : true
    }));
    
    // ایجاد workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(routes);
    
    // تنظیم عرض ستون‌ها
    worksheet['!cols'] = [
      { wch: 20 }, // شهر
      { wch: 20 }, // استان
      { wch: 18 }, // کیلومتر رفت و برگشت
      { wch: 15 }, // روزهای مورد انتظار
      { wch: 18 }, // حق ماموریت مصوب
      { wch: 15 }, // دسته‌بندی مسیر
      { wch: 15 }, // دسته‌بندی فاصله
      { wch: 10 }  // فعال
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'مسیرها');
    
    // تولید buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="dispatch_routes_export.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('❌ [exportCitiesToExcel] Error:', error);
    res.status(500).json({ message: 'خطا در export Excel', error: error.message });
  }
}

module.exports = {
  getCities,
  getCityById,
  createCity,
  updateCity,
  deleteCity,
  importCitiesFromExcel,
  importCitiesFromJson,
  exportCitiesToJson,
  exportCitiesToExcel
};
