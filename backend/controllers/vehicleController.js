const pool = require('../db');
const crypto = require('crypto');

/**
 * Fetches all vehicles with branch information.
 */
async function getVehicles(req, res) {
  try {
    const extendedSql = `
      SELECT 
        v.id,
        json_build_object(
          'part1', v.plate_part1,
          'letter', v.plate_letter,
          'part2', v.plate_part2,
          'cityCode', v.plate_city_code
        ) AS "plateNumber",
        v.serial_number AS "serialNumber",
        v.model,
        v.type,
        v.branch_id AS "branchId",
        v.holding_company AS "holdingCompany",
        v.mihan_company AS "mihanCompany",
        v.vehicle_category AS "vehicleCategory",
        v.current_vehicle_type AS "vehicleType",
        v.brand,
        v.owner_name AS "ownerName",
        v.color,
        v.usage_type AS "usageType",
        v.engine_number AS "engineNumber",
        v.vehicle_tip AS "vehicleTip",
        v.chassis_number AS "chassisNumber",
        v.capacity,
        v.vin,
        v.year,
        v.wheel_count AS "wheelCount",
        v.axle_count AS "axleCount",
        v.cylinder_count AS "cylinderCount",
        v.domain_name AS "domainName",
        v.fuel_type AS "fuelType",
        v.status,
        v.vehicle_code AS "vehicleCode",
        v.deleted_at AS "deletedAt",
        v.deletion_reason AS "deletionReason",
        v.created_at AS "createdAt",
        v.updated_at AS "updatedAt",
        b.name as "branchName",
        b.location as "branchLocation"
      FROM vehicles v 
      LEFT JOIN branches b ON v.branch_id = b.id 
      ORDER BY 
        CASE WHEN v.deleted_at IS NULL THEN 0 ELSE 1 END,
        v.created_at DESC
    `;
    
    let rows;
    try {
      rows = (await pool.query(extendedSql)).rows;
    } catch (err) {
      if (err && err.code === '42703') {
        // ستون current_vehicle_type وجود ندارد، از fallback استفاده می‌کنیم
        console.log('⚠️ [getVehicles] Column current_vehicle_type does not exist, using fallback query');
        const fallbackSql = `
          SELECT 
            v.id,
            json_build_object(
              'part1', v.plate_part1,
              'letter', v.plate_letter,
              'part2', v.plate_part2,
              'cityCode', v.plate_city_code
            ) AS "plateNumber",
            v.serial_number AS "serialNumber",
            v.model,
            v.type,
            v.branch_id AS "branchId",
            v.holding_company AS "holdingCompany",
            v.mihan_company AS "mihanCompany",
            v.vehicle_category AS "vehicleCategory",
            NULL AS "vehicleType",
            v.brand,
            v.owner_name AS "ownerName",
            v.color,
            v.usage_type AS "usageType",
            v.engine_number AS "engineNumber",
            v.vehicle_tip AS "vehicleTip",
            v.chassis_number AS "chassisNumber",
            v.capacity,
            v.vin,
            v.year,
            v.wheel_count AS "wheelCount",
            v.axle_count AS "axleCount",
            v.cylinder_count AS "cylinderCount",
            v.domain_name AS "domainName",
            v.fuel_type AS "fuelType",
            v.status,
            v.vehicle_code AS "vehicleCode",
            v.created_at AS "createdAt",
            v.updated_at AS "updatedAt",
            b.name as "branchName",
            b.location as "branchLocation"
          FROM vehicles v 
          LEFT JOIN branches b ON v.branch_id = b.id 
          ORDER BY v.created_at DESC
        `;
        try {
          rows = (await pool.query(fallbackSql)).rows;
        } catch (fallbackErr) {
          console.error('❌ [getVehicles] Fallback query also failed:', fallbackErr);
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Failed to get vehicles:', error);
    res.status(500).json({ message: 'Internal server error while fetching vehicles.' });
  }
}

/**
 * Fetches a single vehicle by ID.
 */
async function getVehicleById(req, res) {
  const { id } = req.params;
  try {
    const extendedSql = `
      SELECT 
        v.id,
        json_build_object(
          'part1', v.plate_part1,
          'letter', v.plate_letter,
          'part2', v.plate_part2,
          'cityCode', v.plate_city_code
        ) AS "plateNumber",
        v.serial_number AS "serialNumber",
        v.model,
        v.type,
        v.branch_id AS "branchId",
        v.holding_company AS "holdingCompany",
        v.mihan_company AS "mihanCompany",
        v.vehicle_category AS "vehicleCategory",
        v.current_vehicle_type AS "vehicleType",
        v.brand,
        v.owner_name AS "ownerName",
        v.color,
        v.usage_type AS "usageType",
        v.engine_number AS "engineNumber",
        v.vehicle_tip AS "vehicleTip",
        v.chassis_number AS "chassisNumber",
        v.capacity,
        v.vin,
        v.year,
        v.wheel_count AS "wheelCount",
        v.axle_count AS "axleCount",
        v.cylinder_count AS "cylinderCount",
        v.domain_name AS "domainName",
        v.fuel_type AS "fuelType",
        v.status,
        v.vehicle_code AS "vehicleCode",
        v.created_at AS "createdAt",
        v.updated_at AS "updatedAt"
      FROM vehicles v 
      WHERE v.id = $1
    `;
    
    let rows;
    try {
      rows = (await pool.query(extendedSql, [id])).rows;
    } catch (err) {
      if (err && err.code === '42703') {
        // ستون current_vehicle_type وجود ندارد، از fallback استفاده می‌کنیم
        console.log('⚠️ [getVehicleById] Column current_vehicle_type does not exist, using fallback query');
        const fallbackSql = `
          SELECT 
            v.id,
            json_build_object(
              'part1', v.plate_part1,
              'letter', v.plate_letter,
              'part2', v.plate_part2,
              'cityCode', v.plate_city_code
            ) AS "plateNumber",
            v.serial_number AS "serialNumber",
            v.model,
            v.type,
            v.branch_id AS "branchId",
            v.holding_company AS "holdingCompany",
            v.mihan_company AS "mihanCompany",
            v.vehicle_category AS "vehicleCategory",
            NULL AS "vehicleType",
            v.brand,
            v.owner_name AS "ownerName",
            v.color,
            v.usage_type AS "usageType",
            v.engine_number AS "engineNumber",
            v.vehicle_tip AS "vehicleTip",
            v.chassis_number AS "chassisNumber",
            v.capacity,
            v.vin,
            v.year,
            v.wheel_count AS "wheelCount",
            v.axle_count AS "axleCount",
            v.cylinder_count AS "cylinderCount",
            v.domain_name AS "domainName",
            v.fuel_type AS "fuelType",
            v.status,
            v.vehicle_code AS "vehicleCode",
            v.created_at AS "createdAt",
            v.updated_at AS "updatedAt"
          FROM vehicles v 
          WHERE v.id = $1
        `;
        try {
          rows = (await pool.query(fallbackSql, [id])).rows;
        } catch (fallbackErr) {
          console.error('❌ [getVehicleById] Fallback query also failed:', fallbackErr);
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get vehicle ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the vehicle.' });
  }
}

/**
 * Creates a new vehicle.
 */
async function createVehicle(req, res) {
  try {
    const v = req.body || {};
    const plate = v.plateNumber || {};
    const id = crypto.randomUUID();
    
    const toSafeYear = (value) => {
      const n = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
      return n;
    };
    const safeYear = toSafeYear(v.year);
    // Try extended insert first (if optional columns exist)
    const extParams = [
      id,
      v.branchId || null,
      v.holdingCompany || null,
      v.mihanCompany || null,
      v.vehicleCategory || null,
      v.vehicleType || null,
      v.brand || null,
      v.model || null,
      v.type || null,
      plate.part1 || null,
      plate.letter || null,
      plate.part2 || null,
      plate.cityCode || null,
      v.serialNumber || null,
      v.ownerName || null,
      v.vin || null,
      safeYear,
      v.status || null,
      (v.color ?? null),
      (v.usageType ?? null),
      (v.engineNumber ?? null),
      (v.vehicleTip ?? null),
      (v.chassisNumber ?? null),
      (v.capacity ?? null),
      (v.wheelCount ?? null),
      (v.axleCount ?? null),
      (v.cylinderCount ?? null),
      (v.domainName ?? null),
      (v.fuelType ?? null),
      (v.vehicleCode ?? null),
    ];
    const extInsertSql = `
      INSERT INTO vehicles (
        id, branch_id, holding_company, mihan_company, vehicle_category, current_vehicle_type, brand, model, type,
        plate_part1, plate_letter, plate_part2, plate_city_code, serial_number,
        owner_name, vin, year, status,
        color, usage_type, engine_number, vehicle_tip, chassis_number, capacity,
        wheel_count, axle_count, cylinder_count, domain_name, fuel_type, vehicle_code,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,
        $15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,
        $25,$26,$27,$28,$29,$30,
        NOW(), NOW()
      ) RETURNING id;
    `;
    let result;
    try {
      result = await pool.query(extInsertSql, extParams);
    } catch (err) {
      if (err && err.code === '23505' && err.constraint === 'vehicles_vin_key') {
        // VIN already exists
        return res.status(400).json({ 
          message: 'شماره VIN تکراری است. لطفاً شماره VIN منحصر به فرد وارد کنید.' 
        });
      } else if (err && err.code === '42703') {
        const params = [
          id,
          v.branchId || null,
          v.holdingCompany || null,
          v.mihanCompany || null,
          v.vehicleCategory || null,
          v.brand || null,
          v.model || null,
          v.type || null,
          plate.part1 || null,
          plate.letter || null,
          plate.part2 || null,
          plate.cityCode || null,
          v.serialNumber || null,
          v.ownerName || null,
          v.vin || null,
          safeYear,
          v.status || null,
        ];
        const insertSql = `
          INSERT INTO vehicles (
            id, branch_id, holding_company, mihan_company, vehicle_category, brand, model, type,
            plate_part1, plate_letter, plate_part2, plate_city_code, serial_number,
            owner_name, vin, year, status, created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13,
            $14,$15,$16,$17, NOW(), NOW()
          )
          RETURNING id;
        `;
        result = await pool.query(insertSql, params);
      } else if (err && err.code === '23505' && err.constraint === 'vehicles_vin_key') {
        // VIN already exists
        return res.status(400).json({ 
          message: 'شماره VIN تکراری است. لطفاً شماره VIN منحصر به فرد وارد کنید.' 
        });
      } else {
        throw err;
      }
    }
    const newId = result.rows[0].id;
    // Return the created record in the same shape as getVehicleById
    let rows;
    try {
      const { rows: queryRows } = await pool.query(`
        SELECT 
          v.id,
          json_build_object(
            'part1', v.plate_part1,
            'letter', v.plate_letter,
            'part2', v.plate_part2,
            'cityCode', v.plate_city_code
          ) AS "plateNumber",
          v.serial_number AS "serialNumber",
          v.model,
          v.type,
          v.branch_id AS "branchId",
          v.holding_company AS "holdingCompany",
          v.mihan_company AS "mihanCompany",
          v.vehicle_category AS "vehicleCategory",
          v.current_vehicle_type AS "vehicleType",
          v.brand,
          v.owner_name AS "ownerName",
          v.vin,
          v.year,
          v.status,
          v.created_at AS "createdAt",
          v.updated_at AS "updatedAt"
        FROM vehicles v 
        WHERE v.id = $1
      `, [newId]);
      rows = queryRows;
    } catch (selectErr) {
      // اگر ستون current_vehicle_type وجود ندارد، از fallback استفاده می‌کنیم
      if (selectErr && selectErr.code === '42703') {
        const { rows: fallbackRows } = await pool.query(`
          SELECT 
            v.id,
            json_build_object(
              'part1', v.plate_part1,
              'letter', v.plate_letter,
              'part2', v.plate_part2,
              'cityCode', v.plate_city_code
            ) AS "plateNumber",
            v.serial_number AS "serialNumber",
            v.model,
            v.type,
            v.branch_id AS "branchId",
            v.holding_company AS "holdingCompany",
            v.mihan_company AS "mihanCompany",
            v.vehicle_category AS "vehicleCategory",
            NULL AS "vehicleType",
            v.brand,
            v.owner_name AS "ownerName",
            v.vin,
            v.year,
            v.status,
            v.created_at AS "createdAt",
            v.updated_at AS "updatedAt"
          FROM vehicles v 
          WHERE v.id = $1
        `, [newId]);
        rows = fallbackRows;
      } else {
        throw selectErr;
      }
    }
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Failed to create vehicle:', error);
    res.status(500).json({ message: 'Internal server error while creating vehicle.' });
  }
}

/**
 * Updates an existing vehicle.
 */
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;
    const v = req.body || {};
    const plate = v.plateNumber || {};
    
    // Get current vehicle data (for VIN check and model fallback)
    const currentVehicle = await pool.query(
      'SELECT vin, model FROM vehicles WHERE id = $1',
      [id]
    );
    
    if (currentVehicle.rows.length === 0) {
      return res.status(404).json({ message: 'خودرو یافت نشد' });
    }
    
    // Check if VIN is being changed and if it conflicts with existing VINs
    if (v.vin) {
      const currentVin = currentVehicle.rows[0]?.vin;
      
      // Only check for conflicts if VIN is actually being changed
      if (currentVin !== v.vin) {
        const existingVehicle = await pool.query(
          'SELECT id, vin FROM vehicles WHERE vin = $1 AND id != $2',
          [v.vin, id]
        );
        
        if (existingVehicle.rows.length > 0) {
          return res.status(400).json({ 
            message: 'شماره VIN تکراری است. لطفاً شماره VIN منحصر به فرد وارد کنید.' 
          });
        }
      }
    }
    const toSafeYear = (value) => {
      const n = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
      return n;
    };
    const safeYear = toSafeYear(v.year);
    
    // Ensure model is not empty (required field)
    // Get current model from database first
    const currentModel = currentVehicle.rows[0]?.model;
    let modelValue = v.model;
    
    // If model is empty or null, use current model from database
    if (!modelValue || (typeof modelValue === 'string' && modelValue.trim() === '')) {
      if (currentModel && currentModel.trim() !== '') {
        modelValue = currentModel; // Keep existing model
      } else {
        // If no current model exists, try vehicleTip or use default
        if (v.vehicleTip && v.vehicleTip.trim() !== '') {
          modelValue = v.vehicleTip;
        } else {
          modelValue = 'نامشخص'; // Fallback default
        }
      }
    }
    
    // Try extended update first (if optional columns exist)
    const extParams = [
      v.branchId || null,
      v.holdingCompany || null,
      v.mihanCompany || null,
      v.vehicleCategory || null,
      v.vehicleType || null,
      v.brand || null,
      modelValue || 'نامشخص', // Ensure model is never null
      v.type || null,
      plate.part1 || null,
      plate.letter || null,
      plate.part2 || null,
      plate.cityCode || null,
      v.serialNumber || null,
      v.ownerName || null,
      v.vin || null,
      safeYear,
      v.status || null,
      (v.color ?? null),
      (v.usageType ?? null),
      (v.engineNumber ?? null),
      (v.vehicleTip ?? null),
      (v.chassisNumber ?? null),
      (v.capacity ?? null),
      (v.wheelCount ?? null),
      (v.axleCount ?? null),
      (v.cylinderCount ?? null),
      (v.domainName ?? null),
      (v.fuelType ?? null),
      (v.vehicleCode ?? null),
      id,
    ];
    const extUpdateSql = `
      UPDATE vehicles SET
        branch_id = $1,
        holding_company = $2,
        mihan_company = $3,
        vehicle_category = $4,
        current_vehicle_type = $5,
        brand = $6,
        model = $7,
        type = $8,
        plate_part1 = $9,
        plate_letter = $10,
        plate_part2 = $11,
        plate_city_code = $12,
        serial_number = $13,
        owner_name = $14,
        vin = $15,
        year = $16,
        status = $17,
        color = $18,
        usage_type = $19,
        engine_number = $20,
        vehicle_tip = $21,
        chassis_number = $22,
        capacity = $23,
        wheel_count = $24,
        axle_count = $25,
        cylinder_count = $26,
        domain_name = $27,
        fuel_type = $28,
        vehicle_code = $29,
        updated_at = NOW()
      WHERE id = $30
      RETURNING id;
    `;
    let result;
    try {
      result = await pool.query(extUpdateSql, extParams);
    } catch (err) {
      if (err && err.code === '23505' && err.constraint === 'vehicles_vin_key') {
        // VIN already exists
        return res.status(400).json({ 
          message: 'شماره VIN تکراری است. لطفاً شماره VIN منحصر به فرد وارد کنید.' 
        });
      } else if (err && err.code === '42703') {
        // Ensure model is not empty for fallback query too
        // Use the same logic as above
        const fallbackCurrentModel = currentVehicle.rows[0]?.model;
        let fallbackModelValue = v.model;
        if (!fallbackModelValue || (typeof fallbackModelValue === 'string' && fallbackModelValue.trim() === '')) {
          if (fallbackCurrentModel && fallbackCurrentModel.trim() !== '') {
            fallbackModelValue = fallbackCurrentModel;
          } else if (v.vehicleTip && v.vehicleTip.trim() !== '') {
            fallbackModelValue = v.vehicleTip;
          } else {
            fallbackModelValue = 'نامشخص';
          }
        }
        
        const params = [
          v.branchId || null,
          v.holdingCompany || null,
          v.mihanCompany || null,
          v.vehicleCategory || null,
          v.brand || null,
          fallbackModelValue || 'نامشخص', // Ensure model is never null
          v.type || null,
          plate.part1 || null,
          plate.letter || null,
          plate.part2 || null,
          plate.cityCode || null,
          v.serialNumber || null,
          v.ownerName || null,
          v.vin || null,
          safeYear,
          v.status || null,
          id,
        ];
        const updateSql = `
          UPDATE vehicles SET
            branch_id = $1,
            holding_company = $2,
            mihan_company = $3,
            vehicle_category = $4,
            brand = $5,
            model = $6,
            type = $7,
            plate_part1 = $8,
            plate_letter = $9,
            plate_part2 = $10,
            plate_city_code = $11,
            serial_number = $12,
            owner_name = $13,
            vin = $14,
            year = $15,
            status = $16,
            updated_at = NOW()
          WHERE id = $17
          RETURNING id;
        `;
        result = await pool.query(updateSql, params);
      } else if (err && err.code === '23505' && err.constraint === 'vehicles_vin_key') {
        // VIN already exists
        return res.status(400).json({ 
          message: 'شماره VIN تکراری است. لطفاً شماره VIN منحصر به فرد وارد کنید.' 
        });
      } else {
        throw err;
      }
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }
    // Return updated record
    return await getVehicleById({ params: { id } }, res);
  } catch (error) {
    const vid = req?.params?.id;
    console.error(`Failed to update vehicle ${vid}:`, error);
    res.status(500).json({ message: 'Internal server error while updating vehicle.' });
  }
}

/**
 * Import خودروهای شرکتی از فایل اکسل
 * POST /api/v1/vehicles/import-excel
 * Body (multipart/form-data):
 *   - file: فایل اکسل (.xlsx, .xls)
 */
async function importCompanyVehiclesFromExcel(req, res) {
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
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

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
        const model = String(row['مدل'] || row['model'] || '').trim();
        const brand = String(row['برند'] || row['brand'] || '').trim() || null;
        const type = String(row['نوع'] || row['type'] || row['vehicle_type'] || row['vehicleType'] || '').trim() || null;
        const platePart1 = String(row['بخش اول پلاک'] || row['پلاک بخش اول'] || row['plate_part1'] || row['platePart1'] || '').trim() || null;
        const plateLetter = String(row['حرف پلاک'] || row['پلاک حرف'] || row['plate_letter'] || row['plateLetter'] || '').trim() || null;
        const platePart2 = String(row['بخش دوم پلاک'] || row['پلاک بخش دوم'] || row['plate_part2'] || row['platePart2'] || '').trim() || null;
        const plateCityCode = String(row['کد شهر پلاک'] || row['پلاک کد شهر'] || row['plate_city_code'] || row['plateCityCode'] || '').trim() || null;
        const vin = String(row['VIN'] || row['vin'] || row['شماره VIN'] || row['شمارهVIN'] || '').trim() || null;
        const serialNumber = String(row['شماره سریال'] || row['serial_number'] || row['serialNumber'] || '').trim() || null;
        const vehicleCode = String(row['کد خودرو'] || row['vehicle_code'] || row['vehicleCode'] || '').trim() || null;
        const holdingCompany = String(row['شرکت هولدینگ'] || row['holding_company'] || row['holdingCompany'] || '').trim() || null;
        const mihanCompany = String(row['شرکت میهن'] || row['mihan_company'] || row['mihanCompany'] || '').trim() || null;
        const vehicleCategory = String(row['دسته خودرو'] || row['vehicle_category'] || row['vehicleCategory'] || '').trim() || null;
        const year = row['سال'] || row['year'] ? parseInt(row['سال'] || row['year']) : null;
        const status = String(row['وضعیت'] || row['status'] || '').trim() || null;

        // Validation فیلدهای اجباری
        const missingFields = [];
        if (!model) missingFields.push('مدل');
        
        if (missingFields.length > 0) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `فیلدهای اجباری خالی است: ${missingFields.join('، ')}`,
            data: { model }
          });
          continue;
        }

        // اگر VIN وارد شده باشد، بررسی تکراری بودن
        if (vin) {
          const existingVin = await pool.query(
            'SELECT id FROM vehicles WHERE vin = $1',
            [vin]
          );
          
          if (existingVin.rows.length > 0) {
            // Update existing vehicle
            const vehicleId = existingVin.rows[0].id;
            
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;
            
            if (model) { updateFields.push(`model = $${paramIndex++}`); updateValues.push(model); }
            if (brand) { updateFields.push(`brand = $${paramIndex++}`); updateValues.push(brand); }
            if (type) { updateFields.push(`type = $${paramIndex++}`); updateValues.push(type); }
            if (platePart1) { updateFields.push(`plate_part1 = $${paramIndex++}`); updateValues.push(platePart1); }
            if (plateLetter) { updateFields.push(`plate_letter = $${paramIndex++}`); updateValues.push(plateLetter); }
            if (platePart2) { updateFields.push(`plate_part2 = $${paramIndex++}`); updateValues.push(platePart2); }
            if (plateCityCode) { updateFields.push(`plate_city_code = $${paramIndex++}`); updateValues.push(plateCityCode); }
            if (serialNumber) { updateFields.push(`serial_number = $${paramIndex++}`); updateValues.push(serialNumber); }
            if (vehicleCode) { updateFields.push(`vehicle_code = $${paramIndex++}`); updateValues.push(vehicleCode); }
            if (holdingCompany) { updateFields.push(`holding_company = $${paramIndex++}`); updateValues.push(holdingCompany); }
            if (mihanCompany) { updateFields.push(`mihan_company = $${paramIndex++}`); updateValues.push(mihanCompany); }
            if (vehicleCategory) { updateFields.push(`vehicle_category = $${paramIndex++}`); updateValues.push(vehicleCategory); }
            if (year) { updateFields.push(`year = $${paramIndex++}`); updateValues.push(year); }
            if (status) { updateFields.push(`status = $${paramIndex++}`); updateValues.push(status); }
            
            updateFields.push(`updated_at = NOW()`);
            updateValues.push(vehicleId);
            
            if (updateFields.length > 1) {
              await pool.query(
                `UPDATE vehicles SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
                updateValues
              );
              results.updated++;
            } else {
              results.skipped++;
              results.errors.push({
                row: rowNumber,
                error: 'هیچ فیلدی برای به‌روزرسانی وجود ندارد',
                data: { vin }
              });
            }
            continue;
          }
        }

        // اگر vehicleCode وارد شده باشد، بررسی تکراری بودن
        if (vehicleCode) {
          const existingCode = await pool.query(
            'SELECT id FROM vehicles WHERE vehicle_code = $1',
            [vehicleCode]
          );
          
          if (existingCode.rows.length > 0) {
            // Update existing vehicle
            const vehicleId = existingCode.rows[0].id;
            
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;
            
            if (model) { updateFields.push(`model = $${paramIndex++}`); updateValues.push(model); }
            if (brand) { updateFields.push(`brand = $${paramIndex++}`); updateValues.push(brand); }
            if (type) { updateFields.push(`type = $${paramIndex++}`); updateValues.push(type); }
            if (platePart1) { updateFields.push(`plate_part1 = $${paramIndex++}`); updateValues.push(platePart1); }
            if (plateLetter) { updateFields.push(`plate_letter = $${paramIndex++}`); updateValues.push(plateLetter); }
            if (platePart2) { updateFields.push(`plate_part2 = $${paramIndex++}`); updateValues.push(platePart2); }
            if (plateCityCode) { updateFields.push(`plate_city_code = $${paramIndex++}`); updateValues.push(plateCityCode); }
            if (vin) { updateFields.push(`vin = $${paramIndex++}`); updateValues.push(vin); }
            if (serialNumber) { updateFields.push(`serial_number = $${paramIndex++}`); updateValues.push(serialNumber); }
            if (holdingCompany) { updateFields.push(`holding_company = $${paramIndex++}`); updateValues.push(holdingCompany); }
            if (mihanCompany) { updateFields.push(`mihan_company = $${paramIndex++}`); updateValues.push(mihanCompany); }
            if (vehicleCategory) { updateFields.push(`vehicle_category = $${paramIndex++}`); updateValues.push(vehicleCategory); }
            if (year) { updateFields.push(`year = $${paramIndex++}`); updateValues.push(year); }
            if (status) { updateFields.push(`status = $${paramIndex++}`); updateValues.push(status); }
            
            updateFields.push(`updated_at = NOW()`);
            updateValues.push(vehicleId);
            
            if (updateFields.length > 1) {
              await pool.query(
                `UPDATE vehicles SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
                updateValues
              );
              results.updated++;
            } else {
              results.skipped++;
              results.errors.push({
                row: rowNumber,
                error: 'هیچ فیلدی برای به‌روزرسانی وجود ندارد',
                data: { vehicleCode }
              });
            }
            continue;
          }
        }

        // Create new vehicle
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO vehicles (
            id, model, brand, type, plate_part1, plate_letter, plate_part2, plate_city_code,
            vin, serial_number, vehicle_code, holding_company, mihan_company, 
            vehicle_category, year, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`,
          [
            id, model, brand, type, platePart1, plateLetter, platePart2, plateCityCode,
            vin, serialNumber, vehicleCode, holdingCompany, mihanCompany,
            vehicleCategory, year, status
          ]
        );
        results.success++;
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
    console.error('Error importing company vehicles from Excel:', error);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }
    res.status(500).json({ message: 'خطا در پردازش فایل اکسل: ' + error.message });
  }
}

/**
 * بررسی وابستگی‌های یک خودرو در تمام جدول‌های مرتبط
 */
async function checkVehicleDependencies(vehicleId) {
  const dependencies = {
    hasDependencies: false,
    tables: []
  };

  try {
    // لیست تمام جدول‌هایی که ممکن است به vehicles مرتبط باشند
    const checks = [
      {
        name: 'vehicle_owner_history',
        query: 'SELECT COUNT(*) as count FROM vehicle_owner_history WHERE vehicle_id = $1',
        description: 'تاریخچه مالکین'
      },
      {
        name: 'repair_orders',
        query: 'SELECT COUNT(*) as count FROM repair_orders WHERE vehicle_id = $1',
        description: 'سفارش‌های تعمیر'
      },
      {
        name: 'invoices',
        query: 'SELECT COUNT(*) as count FROM invoices WHERE vehicle_id = $1',
        description: 'فاکتورها'
      },
      {
        name: 'freight_announcements',
        query: 'SELECT COUNT(*) as count FROM freight_announcements WHERE assigned_vehicle_id = $1',
        description: 'اعلام بارها'
      },
      {
        name: 'fuel_card_requests',
        query: 'SELECT COUNT(*) as count FROM fuel_card_requests WHERE vehicle_id = $1',
        description: 'درخواست کارت سوخت'
      },
      {
        name: 'traffic_fines',
        query: 'SELECT COUNT(*) as count FROM traffic_fines WHERE vehicle_id = $1',
        description: 'جرائم رانندگی'
      },
      {
        name: 'vehicle_permits',
        query: 'SELECT COUNT(*) as count FROM vehicle_permits WHERE vehicle_id = $1',
        description: 'پروانه‌های فعالیت'
      },
      {
        name: 'insurance_policies',
        query: 'SELECT COUNT(*) as count FROM insurance_policies WHERE vehicle_id = $1',
        description: 'بیمه‌نامه‌ها'
      },
      {
        name: 'accident_reports',
        query: 'SELECT COUNT(*) as count FROM accident_reports WHERE vehicle_id = $1',
        description: 'گزارشات حوادث'
      },
      {
        name: 'vehicle_allocations',
        query: async (vehicleId) => {
          // بررسی وجود ستون vehicle_id در vehicle_allocations
          try {
            const checkColumn = await pool.query(`
              SELECT column_name FROM information_schema.columns 
              WHERE table_name = 'vehicle_allocations' AND column_name = 'vehicle_id'
            `);
            
            if (checkColumn.rows.length > 0) {
              // اگر vehicle_id وجود دارد
              return await pool.query(
                `SELECT COUNT(*) as count FROM vehicle_allocations 
                 WHERE vehicle_id = $1 
                    OR id IN (SELECT allocation_id FROM vehicle_allocation_items WHERE vehicle_id = $1)`,
                [vehicleId]
              );
            } else {
              // اگر vehicle_id وجود ندارد، فقط از vehicle_allocation_items استفاده کن
              try {
                return await pool.query(
                  `SELECT COUNT(*) as count FROM vehicle_allocation_items WHERE vehicle_id = $1`,
                  [vehicleId]
                );
              } catch (itemsErr) {
                // اگر vehicle_allocation_items هم وجود ندارد یا vehicle_id ندارد، صفر برگردان
                if (itemsErr.code === '42P01' || itemsErr.code === '42703') {
                  return { rows: [{ count: '0' }] };
                }
                throw itemsErr;
              }
            }
          } catch (err) {
            // اگر جدول وجود ندارد، صفر برگردان
            if (err.code === '42P01') {
              return { rows: [{ count: '0' }] };
            }
            throw err;
          }
        },
        description: 'تخصیص خودرو'
      }
    ];

    // بررسی هر جدول
    for (const check of checks) {
      try {
        let result;
        // اگر query یک تابع است (مثل vehicle_allocations)، آن را اجرا کن
        if (typeof check.query === 'function') {
          result = await check.query(vehicleId);
        } else {
          result = await pool.query(check.query, [vehicleId]);
        }
        const count = parseInt(result.rows[0].count, 10);
        
        if (count > 0) {
          dependencies.hasDependencies = true;
          dependencies.tables.push({
            table: check.name,
            description: check.description,
            count: count
          });
        }
      } catch (err) {
        // اگر جدول وجود ندارد یا ستون وجود ندارد، نادیده بگیر
        if (err.code === '42P01' || err.code === '42703') {
          // این خطاها طبیعی هستند و نیاز به لاگ ندارند
          continue;
        }
        // فقط خطاهای دیگر را لاگ کن
        console.warn(`⚠️ [checkVehicleDependencies] Error checking ${check.name}:`, err.message);
      }
    }

    // بررسی در جداول محاسبات (driver_calculations)
    // ابتدا vehicle_code و plate_number را از vehicles بگیریم
    try {
      const vehicleInfo = await pool.query(
        'SELECT vehicle_code, plate_part1, plate_letter, plate_part2 FROM vehicles WHERE id = $1',
        [vehicleId]
      );
      
      if (vehicleInfo.rows.length > 0) {
        const vehicle = vehicleInfo.rows[0];
        const vehicleCode = vehicle.vehicle_code || '';
        const plateNumber = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2
          ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}`
          : '';
        
        // بررسی وجود ستون‌ها در driver_calculations
        let calcQuery = '';
        let calcParams = [];
        let hasVehicleIdColumn = false;
        
        try {
          // بررسی وجود ستون vehicle_id
          const checkVehicleId = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'driver_calculations' AND column_name = 'vehicle_id'
          `);
          
          hasVehicleIdColumn = checkVehicleId.rows.length > 0;
        } catch (checkErr) {
          // اگر جدول وجود ندارد، hasVehicleIdColumn = false باقی می‌ماند
        }
        
        if (hasVehicleIdColumn) {
          // اگر vehicle_id وجود دارد
          calcQuery = `SELECT COUNT(*) as count 
                      FROM driver_calculations 
                      WHERE vehicle_id = $1 
                         OR vehicle_code = $2 
                         OR vehicle_plate LIKE $3`;
          calcParams = [vehicleId, vehicleCode, `%${plateNumber}%`];
        } else {
          // اگر vehicle_id وجود ندارد، فقط از vehicle_code و vehicle_plate استفاده کن
          calcQuery = `SELECT COUNT(*) as count 
                      FROM driver_calculations 
                      WHERE vehicle_code = $1 
                         OR vehicle_plate LIKE $2`;
          calcParams = [vehicleCode, `%${plateNumber}%`];
        }
        
        const calcResult = await pool.query(calcQuery, calcParams);
        const calcCount = parseInt(calcResult.rows[0].count, 10);
        if (calcCount > 0) {
          dependencies.hasDependencies = true;
          dependencies.tables.push({
            table: 'driver_calculations',
            description: 'محاسبات راننده',
            count: calcCount
          });
        }
      }
    } catch (err) {
      // اگر جدول وجود ندارد یا ستون وجود ندارد، نادیده بگیر
      if (err.code === '42P01' || err.code === '42703') {
        // این خطاها طبیعی هستند و نیاز به لاگ ندارند
      } else {
        // فقط خطاهای دیگر را لاگ کن
        console.warn('⚠️ [checkVehicleDependencies] Error checking driver_calculations:', err.message);
      }
    }

    return dependencies;
  } catch (error) {
    console.error('❌ [checkVehicleDependencies] Error:', error);
    throw error;
  }
}

/**
 * حذف خودرو (Soft Delete یا Hard Delete)
 * POST /api/v1/vehicles/:id/delete
 * Body: { reason: string, newStatus?: string, hardDelete?: boolean }
 */
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;
    const { reason, newStatus, hardDelete } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ 
        message: 'دلیل حذف الزامی است' 
      });
    }

    // بررسی وجود خودرو
    const vehicleCheck = await pool.query(
      'SELECT id, status, deleted_at FROM vehicles WHERE id = $1',
      [id]
    );

    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ message: 'خودرو یافت نشد' });
    }

    const vehicle = vehicleCheck.rows[0];

    // اگر قبلاً حذف شده، خطا بده
    if (vehicle.deleted_at) {
      return res.status(400).json({ 
        message: 'این خودرو قبلاً حذف شده است' 
      });
    }

    // بررسی وابستگی‌ها
    const dependencies = await checkVehicleDependencies(id);

    if (dependencies.hasDependencies) {
      // اگر وابستگی وجود دارد، فقط Soft Delete با تغییر وضعیت
      let finalStatus = newStatus || 'حذف شده';
      
      // اگر وضعیت جدید مشخص نشده، وضعیت‌های پیشنهادی: اسقاط شده، فروخته شده، غیرفعال
      const allowedStatuses = ['اسقاط شده', 'فروخته شده', 'غیرفعال', 'حذف شده'];
      if (!allowedStatuses.includes(finalStatus)) {
        finalStatus = 'حذف شده';
      }

      // Soft Delete: تنظیم deleted_at و deletion_reason و تغییر وضعیت
      await pool.query(
        `UPDATE vehicles 
         SET deleted_at = NOW(), 
             deletion_reason = $1,
             status = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [reason.trim(), finalStatus, id]
      );

      return res.json({
        message: 'خودرو با موفقیت حذف شد (Soft Delete)',
        type: 'soft',
        dependencies: dependencies.tables,
        status: finalStatus
      });
    } else {
      // اگر وابستگی ندارد، Hard Delete یا Soft Delete امکان‌پذیر است
      if (hardDelete === true) {
        // Hard Delete: حذف فیزیکی از دیتابیس
        await pool.query('DELETE FROM vehicles WHERE id = $1', [id]);

        // ثبت در لاگ
        console.log(`🗑️ [deleteVehicle] Hard delete: Vehicle ${id} permanently deleted. Reason: ${reason}`);

        return res.json({
          message: 'خودرو به طور کامل از سیستم حذف شد',
          type: 'hard',
          dependencies: []
        });
      } else {
        // Soft Delete: تنظیم deleted_at و deletion_reason
        await pool.query(
          `UPDATE vehicles 
           SET deleted_at = NOW(), 
               deletion_reason = $1,
               status = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [reason.trim(), newStatus || 'حذف شده', id]
        );

        return res.json({
          message: 'خودرو با موفقیت حذف شد',
          type: 'soft',
          dependencies: [],
          canHardDelete: true // می‌تواند حذف فیزیکی شود
        });
      }
    }
  } catch (error) {
    console.error('❌ [deleteVehicle] Error:', error);
    res.status(500).json({ 
      message: 'خطا در حذف خودرو: ' + error.message 
    });
  }
}

/**
 * بازیابی خودرو حذف شده
 * POST /api/v1/vehicles/:id/restore
 */
async function restoreVehicle(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE vehicles 
       SET deleted_at = NULL, 
           deletion_reason = NULL,
           status = 'غیرفعال',
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: 'خودرو حذف شده یافت نشد یا قبلاً بازیابی شده است' 
      });
    }

    const restoredVehicle = await pool.query(
      `SELECT 
        v.id,
        json_build_object(
          'part1', v.plate_part1,
          'letter', v.plate_letter,
          'part2', v.plate_part2,
          'cityCode', v.plate_city_code
        ) AS "plateNumber",
        v.serial_number AS "serialNumber",
        v.model,
        v.type,
        v.branch_id AS "branchId",
        v.holding_company AS "holdingCompany",
        v.mihan_company AS "mihanCompany",
        v.vehicle_category AS "vehicleCategory",
        v.current_vehicle_type AS "vehicleType",
        v.brand,
        v.owner_name AS "ownerName",
        v.color,
        v.usage_type AS "usageType",
        v.engine_number AS "engineNumber",
        v.vehicle_tip AS "vehicleTip",
        v.chassis_number AS "chassisNumber",
        v.capacity,
        v.vin,
        v.year,
        v.wheel_count AS "wheelCount",
        v.axle_count AS "axleCount",
        v.cylinder_count AS "cylinderCount",
        v.domain_name AS "domainName",
        v.fuel_type AS "fuelType",
        v.status,
        v.vehicle_code AS "vehicleCode",
        v.deleted_at AS "deletedAt",
        v.deletion_reason AS "deletionReason",
        v.created_at AS "createdAt",
        v.updated_at AS "updatedAt"
      FROM vehicles v 
      WHERE v.id = $1`,
      [id]
    );

    return res.json({
      message: 'خودرو با موفقیت بازیابی شد',
      vehicle: restoredVehicle.rows[0]
    });
  } catch (error) {
    console.error('❌ [restoreVehicle] Error:', error);
    res.status(500).json({ 
      message: 'خطا در بازیابی خودرو: ' + error.message 
    });
  }
}

/** شرط جستجو — همه فیلدها به text تبدیل می‌شوند (سازگار با plate عددی روی بعضی سرورها) */
const VEHICLE_SEARCH_WHERE = `
  WHERE (
    COALESCE(v.vehicle_code::text, '') ILIKE $1
    OR (
      COALESCE(v.plate_part1::text, '') ||
      COALESCE(v.plate_letter::text, '') ||
      COALESCE(v.plate_part2::text, '') ||
      COALESCE(v.plate_city_code::text, '')
    ) ILIKE $1
    OR COALESCE(v.plate_part1::text, '') ILIKE $1
    OR COALESCE(v.plate_part2::text, '') ILIKE $1
    OR COALESCE(v.plate_letter::text, '') ILIKE $1
  )
`;

/**
 * جستجوی خودرو شرکتی — فقط کد خودرو و پلاک (برای تور استثنایی و ...)
 */
async function searchCompanyVehicles(req, res) {
  try {
    const term = (req.query.q || '').trim();
    if (term.length < 2) {
      return res.json([]);
    }

    const likeTerm = `%${term}%`;
    const queryVariants = [
      `SELECT v.id, v.vehicle_code, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
              v.vehicle_category, v.brand, v.model, v.current_vehicle_type, v.vehicle_tip
       FROM vehicles v
       ${VEHICLE_SEARCH_WHERE} AND v.deleted_at IS NULL
       ORDER BY v.vehicle_code NULLS LAST LIMIT 20`,
      `SELECT v.id, v.vehicle_code, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
              v.vehicle_category, v.brand, v.model, v.current_vehicle_type, v.vehicle_tip
       FROM vehicles v
       ${VEHICLE_SEARCH_WHERE}
       ORDER BY v.vehicle_code NULLS LAST LIMIT 20`,
      `SELECT v.id, v.vehicle_code, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
              v.vehicle_category, v.brand, v.model
       FROM vehicles v
       ${VEHICLE_SEARCH_WHERE}
       ORDER BY v.vehicle_code NULLS LAST LIMIT 20`,
      `SELECT v.id, v.vehicle_code, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
       FROM vehicles v
       ${VEHICLE_SEARCH_WHERE}
       ORDER BY v.vehicle_code NULLS LAST LIMIT 20`,
    ];

    let rows = null;
    let lastError = null;
    for (const sql of queryVariants) {
      try {
        ({ rows } = await pool.query(sql, [likeTerm]));
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const retryable = ['42703', '42883'].includes(err?.code);
        if (!retryable) throw err;
      }
    }
    if (lastError) throw lastError;

    res.json(
      (rows || []).map((row) => ({
        id: row.id,
        vehicleCode: row.vehicle_code != null ? String(row.vehicle_code) : null,
        vehicleCategory: row.vehicle_category || null,
        vehicleType:
          row.current_vehicle_type ||
          row.vehicle_tip ||
          row.vehicle_category ||
          null,
        currentVehicleType: row.current_vehicle_type || row.vehicle_tip || null,
        brand: row.brand || null,
        model: row.model || null,
        plate: {
          part1: row.plate_part1 != null ? String(row.plate_part1) : null,
          letter: row.plate_letter != null ? String(row.plate_letter) : null,
          part2: row.plate_part2 != null ? String(row.plate_part2) : null,
          cityCode: row.plate_city_code != null ? String(row.plate_city_code) : null,
        },
      }))
    );
  } catch (error) {
    console.error('❌ [searchCompanyVehicles] failed:', error.message, error.code);
    res.status(500).json({ message: 'خطا در جستجوی خودرو' });
  }
}

module.exports = {
  getVehicles,
  getVehicleById,
  searchCompanyVehicles,
  createVehicle,
  updateVehicle,
  importCompanyVehiclesFromExcel,
  checkVehicleDependencies,
  deleteVehicle,
  restoreVehicle,
};
