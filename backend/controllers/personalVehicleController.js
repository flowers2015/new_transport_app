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
      ORDER BY created_at DESC
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

module.exports = {
  searchPersonalVehicles,
  getPersonalVehicleByTruckSmartId,
  createPersonalVehicle,
  updatePersonalVehicle,
  getAllPersonalVehicles
};
