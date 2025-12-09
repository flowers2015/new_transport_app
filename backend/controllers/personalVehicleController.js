const pool = require('../db');
const crypto = require('crypto');

/**
 * جستجوی خودروهای شخصی بر اساس هوشمند کامیون
 */
async function searchPersonalVehicles(req, res) {
  try {
    const { query, q } = req.query;
    const searchTerm = query || q;
    
    if (!searchTerm || searchTerm.length < 2) {
      return res.json([]);
    }

    const { rows } = await pool.query(`
      SELECT 
        id,
        truck_smart_id AS "truckSmartId",
        plate_part1 AS "platePart1",
        plate_letter AS "plateLetter",
        plate_part2 AS "platePart2",
        plate_city_code AS "plateCityCode",
        vehicle_type AS "vehicleType",
        vehicle_usage AS "vehicleUsage",
        created_at AS "createdAt"
      FROM personal_vehicles 
      WHERE 
        truck_smart_id = $1 OR 
        truck_smart_id ILIKE $2
      ORDER BY 
        CASE WHEN truck_smart_id = $1 THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT 10
    `, [searchTerm, `%${searchTerm}%`]);

    // فرمت کردن پلاک
    const formattedRows = rows.map(row => ({
      ...row,
      formattedPlate: `${row.platePart1} ${row.plateLetter} ${row.platePart2} - ${row.plateCityCode}`
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error searching personal vehicles:', error);
    res.status(500).json({ message: 'خطا در جستجوی خودروهای شخصی' });
  }
}

/**
 * دریافت خودرو شخصی بر اساس هوشمند کامیون
 */
async function getPersonalVehicleByTruckSmartId(req, res) {
  try {
    const { truckSmartId } = req.params;

    const { rows } = await pool.query(`
      SELECT 
        id,
        truck_smart_id AS "truckSmartId",
        plate_part1 AS "platePart1",
        plate_letter AS "plateLetter",
        plate_part2 AS "platePart2",
        plate_city_code AS "plateCityCode",
        vehicle_type AS "vehicleType",
        vehicle_usage AS "vehicleUsage",
        created_at AS "createdAt"
      FROM personal_vehicles 
      WHERE truck_smart_id = $1
    `, [truckSmartId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'خودرو با این هوشمند کامیون یافت نشد' });
    }

    const vehicle = rows[0];
    vehicle.formattedPlate = `${vehicle.platePart1} ${vehicle.plateLetter} ${vehicle.platePart2} - ${vehicle.plateCityCode}`;

    res.json(vehicle);
  } catch (error) {
    console.error('Error getting personal vehicle:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات خودرو' });
  }
}

/**
 * ایجاد خودرو شخصی جدید
 */
async function createPersonalVehicle(req, res) {
  try {
    const { 
      truckSmartId, 
      platePart1, 
      plateLetter, 
      platePart2, 
      plateCityCode, 
      vehicleType, 
      vehicleUsage 
    } = req.body;

    if (!truckSmartId || !platePart1 || !plateLetter || !platePart2 || !plateCityCode || !vehicleType) {
      return res.status(400).json({ 
        message: 'هوشمند کامیون، اطلاعات پلاک و نوع خودرو الزامی است' 
      });
    }

    // بررسی تکراری بودن هوشمند کامیون
    const existingVehicle = await pool.query(
      'SELECT id FROM personal_vehicles WHERE truck_smart_id = $1',
      [truckSmartId]
    );

    if (existingVehicle.rows.length > 0) {
      return res.status(400).json({ message: 'خودرو با این هوشمند کامیون قبلاً ثبت شده است' });
    }

    const id = crypto.randomUUID();
    
    const { rows } = await pool.query(`
      INSERT INTO personal_vehicles (
        id, truck_smart_id, plate_part1, plate_letter, plate_part2, 
        plate_city_code, vehicle_type, vehicle_usage
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING 
        id,
        truck_smart_id AS "truckSmartId",
        plate_part1 AS "platePart1",
        plate_letter AS "plateLetter",
        plate_part2 AS "platePart2",
        plate_city_code AS "plateCityCode",
        vehicle_type AS "vehicleType",
        vehicle_usage AS "vehicleUsage",
        created_at AS "createdAt"
    `, [id, truckSmartId, platePart1, plateLetter, platePart2, plateCityCode, vehicleType, vehicleUsage]);

    const vehicle = rows[0];
    vehicle.formattedPlate = `${vehicle.platePart1} ${vehicle.plateLetter} ${vehicle.platePart2} - ${vehicle.plateCityCode}`;

    res.status(201).json(vehicle);
  } catch (error) {
    console.error('Error creating personal vehicle:', error);
    res.status(500).json({ message: 'خطا در ثبت خودرو جدید' });
  }
}

/**
 * به‌روزرسانی خودرو شخصی
 */
async function updatePersonalVehicle(req, res) {
  try {
    const { id } = req.params;
    const { 
      truckSmartId, 
      platePart1, 
      plateLetter, 
      platePart2, 
      plateCityCode, 
      vehicleType, 
      vehicleUsage 
    } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (truckSmartId) { 
      // بررسی تکراری بودن هوشمند کامیون
      const existingVehicle = await pool.query(
        'SELECT id FROM personal_vehicles WHERE truck_smart_id = $1 AND id != $2',
        [truckSmartId, id]
      );

      if (existingVehicle.rows.length > 0) {
        return res.status(400).json({ message: 'هوشمند کامیون قبلاً استفاده شده است' });
      }
      
      fields.push(`truck_smart_id = $${idx++}`); 
      values.push(truckSmartId); 
    }
    
    if (platePart1) { fields.push(`plate_part1 = $${idx++}`); values.push(platePart1); }
    if (plateLetter) { fields.push(`plate_letter = $${idx++}`); values.push(plateLetter); }
    if (platePart2) { fields.push(`plate_part2 = $${idx++}`); values.push(platePart2); }
    if (plateCityCode) { fields.push(`plate_city_code = $${idx++}`); values.push(plateCityCode); }
    if (vehicleType) { fields.push(`vehicle_type = $${idx++}`); values.push(vehicleType); }
    if (vehicleUsage !== undefined) { fields.push(`vehicle_usage = $${idx++}`); values.push(vehicleUsage); }
    
    fields.push(`updated_at = NOW()`);

    if (fields.length > 1) {
      const updateQuery = `UPDATE personal_vehicles SET ${fields.join(', ')} WHERE id = $${idx}`;
      values.push(id);
      
      const { rows } = await pool.query(updateQuery, values);
      
      if (rows.length === 0) {
        return res.status(404).json({ message: 'خودرو یافت نشد' });
      }
    }

    // دریافت اطلاعات به‌روزرسانی شده
    const { rows } = await pool.query(`
      SELECT 
        id,
        truck_smart_id AS "truckSmartId",
        plate_part1 AS "platePart1",
        plate_letter AS "plateLetter",
        plate_part2 AS "platePart2",
        plate_city_code AS "plateCityCode",
        vehicle_type AS "vehicleType",
        vehicle_usage AS "vehicleUsage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM personal_vehicles 
      WHERE id = $1
    `, [id]);

    const vehicle = rows[0];
    vehicle.formattedPlate = `${vehicle.platePart1} ${vehicle.plateLetter} ${vehicle.platePart2} - ${vehicle.plateCityCode}`;

    res.json(vehicle);
  } catch (error) {
    console.error('Error updating personal vehicle:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی خودرو' });
  }
}

/**
 * دریافت همه خودروهای شخصی
 */
async function getAllPersonalVehicles(req, res) {
  try {
    // فقط فیلدهای ضروری برای dropdown/select را برگردان
    // حذف created_at و updated_at برای کاهش حجم داده
    const { rows } = await pool.query(`
      SELECT 
        id,
        truck_smart_id AS "truckSmartId",
        plate_part1 AS "platePart1",
        plate_letter AS "plateLetter",
        plate_part2 AS "platePart2",
        plate_city_code AS "plateCityCode",
        vehicle_type AS "vehicleType",
        vehicle_usage AS "vehicleUsage"
      FROM personal_vehicles 
      ORDER BY plate_part1 ASC, plate_part2 ASC
    `);

    // فرمت کردن پلاک
    const formattedRows = rows.map(row => ({
      ...row,
      formattedPlate: `${row.platePart1} ${row.plateLetter} ${row.platePart2} - ${row.plateCityCode}`
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error getting all personal vehicles:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست خودروها' });
  }
}

/**
 * دریافت خودرو شخصی بر اساس ID
 */
async function getPersonalVehicleById(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT 
        id,
        truck_smart_id AS "truckSmartId",
        plate_part1 AS "platePart1",
        plate_letter AS "plateLetter",
        plate_part2 AS "platePart2",
        plate_city_code AS "plateCityCode",
        vehicle_type AS "vehicleType",
        vehicle_usage AS "vehicleUsage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM personal_vehicles 
      WHERE id = $1
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'خودرو یافت نشد' });
    }

    const vehicle = rows[0];
    vehicle.formattedPlate = `${vehicle.platePart1} ${vehicle.plateLetter} ${vehicle.platePart2} - ${vehicle.plateCityCode}`;

    res.json(vehicle);
  } catch (error) {
    console.error('Error getting personal vehicle by id:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات خودرو' });
  }
}

/**
 * حذف خودرو شخصی
 */
async function deletePersonalVehicle(req, res) {
  try {
    const { id } = req.params;
    
    const { rows } = await pool.query(
      'DELETE FROM personal_vehicles WHERE id = $1 RETURNING *',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'خودرو یافت نشد' });
    }

    res.json({ message: 'خودرو با موفقیت حذف شد', deleted: rows[0] });
  } catch (error) {
    console.error('Error deleting personal vehicle:', error);
    res.status(500).json({ message: 'خطا در حذف خودرو' });
  }
}

/**
 * Import خودروهای شخصی از فایل اکسل
 * POST /api/v1/personal-vehicles/import-excel
 * Body (multipart/form-data):
 *   - file: فایل اکسل (.xlsx, .xls)
 */
async function importPersonalVehiclesFromExcel(req, res) {
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
    const data = XLSX.utils.sheet_to_json(worksheet);

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

    // لیست انواع خودرو معتبر
    const validVehicleTypes = ['تریلی', 'مینی تریلی', 'ده چرخ', 'تک', 'مینی تک', 'خاور', 'یخچالی سبک', 'یخچالی سنگین', 'سایر'];

    // پردازش هر ردیف
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 چون header در ردیف 1 است و index از 0 شروع می‌شود

      try {
        // استخراج داده‌ها از اکسل (با نام‌های مختلف ممکن)
        const truckSmartId = String(row['کد هوشمند کامیون'] || row['کد هوشمند'] || row['truck_smart_id'] || row['truckSmartId'] || '').trim();
        const platePart1 = String(row['بخش اول پلاک'] || row['پلاک بخش اول'] || row['plate_part1'] || row['platePart1'] || '').trim();
        const plateLetter = String(row['حرف پلاک'] || row['پلاک حرف'] || row['plate_letter'] || row['plateLetter'] || '').trim();
        const platePart2 = String(row['بخش دوم پلاک'] || row['پلاک بخش دوم'] || row['plate_part2'] || row['platePart2'] || '').trim();
        const plateCityCode = String(row['کد شهر پلاک'] || row['پلاک کد شهر'] || row['plate_city_code'] || row['plateCityCode'] || '').trim();
        const vehicleType = String(row['نوع خودرو'] || row['نوع'] || row['vehicle_type'] || row['vehicleType'] || '').trim();
        const vehicleUsage = String(row['کاربرد خودرو'] || row['کاربرد'] || row['vehicle_usage'] || row['vehicleUsage'] || '').trim();

        // Validation فیلدهای اجباری (کاربرد خودرو اختیاری است)
        const missingFields = [];
        if (!truckSmartId) missingFields.push('کد هوشمند کامیون');
        if (!platePart1) missingFields.push('بخش اول پلاک');
        if (!plateLetter) missingFields.push('حرف پلاک');
        if (!platePart2) missingFields.push('بخش دوم پلاک');
        if (!plateCityCode) missingFields.push('کد شهر پلاک');
        if (!vehicleType) missingFields.push('نوع خودرو');
        
        if (missingFields.length > 0) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `فیلدهای اجباری خالی است: ${missingFields.join('، ')}`,
            data: { truckSmartId, platePart1, plateLetter, platePart2, plateCityCode, vehicleType, vehicleUsage }
          });
          continue;
        }

        // Validation فرمت بخش اول پلاک (2 رقم)
        if (!/^\d{2}$/.test(platePart1)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'بخش اول پلاک باید دقیقاً 2 رقم باشد',
            data: { platePart1 }
          });
          continue;
        }

        // Validation فرمت بخش دوم پلاک (3 رقم)
        if (!/^\d{3}$/.test(platePart2)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'بخش دوم پلاک باید دقیقاً 3 رقم باشد',
            data: { platePart2 }
          });
          continue;
        }

        // Validation فرمت کد شهر پلاک (2 رقم)
        if (!/^\d{2}$/.test(plateCityCode)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'کد شهر پلاک باید دقیقاً 2 رقم باشد',
            data: { plateCityCode }
          });
          continue;
        }

        // Validation نوع خودرو
        if (!validVehicleTypes.includes(vehicleType)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `نوع خودرو باید یکی از این مقادیر باشد: ${validVehicleTypes.join('، ')}`,
            data: { vehicleType }
          });
          continue;
        }

        // بررسی وجود خودرو با این کد هوشمند کامیون
        const existingVehicle = await pool.query(
          'SELECT id FROM personal_vehicles WHERE truck_smart_id = $1',
          [truckSmartId]
        );

        if (existingVehicle.rows.length > 0) {
          // Update existing vehicle
          const vehicleId = existingVehicle.rows[0].id;
          await pool.query(
            'UPDATE personal_vehicles SET plate_part1 = $1, plate_letter = $2, plate_part2 = $3, plate_city_code = $4, vehicle_type = $5, vehicle_usage = $6, updated_at = NOW() WHERE id = $7',
            [platePart1, plateLetter, platePart2, plateCityCode, vehicleType, vehicleUsage || null, vehicleId]
          );
          results.updated++;
        } else {
          // Create new vehicle
          const id = crypto.randomUUID();
          await pool.query(
            'INSERT INTO personal_vehicles (id, truck_smart_id, plate_part1, plate_letter, plate_part2, plate_city_code, vehicle_type, vehicle_usage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [id, truckSmartId, platePart1, plateLetter, platePart2, plateCityCode, vehicleType, vehicleUsage || null]
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

    console.error('Error importing personal vehicles from Excel:', error);
    res.status(500).json({ message: 'خطا در import فایل اکسل', error: error.message });
  }
}

module.exports = {
  searchPersonalVehicles,
  getPersonalVehicleByTruckSmartId,
  createPersonalVehicle,
  updatePersonalVehicle,
  getAllPersonalVehicles,
  getPersonalVehicleById,
  deletePersonalVehicle,
  importPersonalVehiclesFromExcel
};
