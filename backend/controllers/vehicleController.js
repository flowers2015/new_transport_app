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
        v.created_at AS "createdAt",
        v.updated_at AS "updatedAt",
        b.name as "branchName",
        b.location as "branchLocation"
      FROM vehicles v 
      LEFT JOIN branches b ON v.branch_id = b.id 
      ORDER BY v.created_at DESC
    `;
    let rows;
    try {
      rows = (await pool.query(extendedSql)).rows;
    } catch (err) {
      if (err && err.code === '42703') {
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
            v.brand,
            v.owner_name AS "ownerName",
            v.vin,
            v.year,
            v.status,
            v.created_at AS "createdAt",
            v.updated_at AS "updatedAt",
            b.name as "branchName",
            b.location as "branchLocation"
          FROM vehicles v 
          LEFT JOIN branches b ON v.branch_id = b.id 
          ORDER BY v.created_at DESC
        `;
        rows = (await pool.query(fallbackSql)).rows;
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
            v.brand,
            v.owner_name AS "ownerName",
            v.vin,
            v.year,
            v.status,
            v.created_at AS "createdAt",
            v.updated_at AS "updatedAt"
          FROM vehicles v 
          WHERE v.id = $1
        `;
        rows = (await pool.query(fallbackSql, [id])).rows;
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
    ];
    const extInsertSql = `
      INSERT INTO vehicles (
        id, branch_id, holding_company, mihan_company, vehicle_category, brand, model, type,
        plate_part1, plate_letter, plate_part2, plate_city_code, serial_number,
        owner_name, vin, year, status,
        color, usage_type, engine_number, vehicle_tip, chassis_number, capacity,
        wheel_count, axle_count, cylinder_count, domain_name, fuel_type,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,
        NOW(), NOW()
      ) RETURNING id;
    `;
    let result;
    try {
      result = await pool.query(extInsertSql, extParams);
    } catch (err) {
      if (err && err.code === '42703') {
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
      } else {
        throw err;
      }
    }
    const newId = result.rows[0].id;
    // Return the created record in the same shape as getVehicleById
    const { rows } = await pool.query(`
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
    const toSafeYear = (value) => {
      const n = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1800 || n > 3000) return null;
      return n;
    };
    const safeYear = toSafeYear(v.year);
    // Try extended update first (if optional columns exist)
    const extParams = [
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
      id,
    ];
    const extUpdateSql = `
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
        color = $17,
        usage_type = $18,
        engine_number = $19,
        vehicle_tip = $20,
        chassis_number = $21,
        capacity = $22,
        wheel_count = $23,
        axle_count = $24,
        cylinder_count = $25,
        domain_name = $26,
        fuel_type = $27,
        updated_at = NOW()
      WHERE id = $28
      RETURNING id;
    `;
    let result;
    try {
      result = await pool.query(extUpdateSql, extParams);
    } catch (err) {
      if (err && err.code === '42703') {
        const params = [
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

module.exports = {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
};
