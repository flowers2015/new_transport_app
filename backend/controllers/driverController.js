const pool = require('../db');
const crypto = require('crypto');

/**
 * Fetches all drivers.
 */
async function getDrivers(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id,
        employee_id AS "employeeId",
        name,
        father_name AS "fatherName",
        national_id AS "nationalId",
        birth_date AS "birthDate",
        id_number AS "idNumber",
        birth_place AS "birthPlace",
        issue_place AS "issuePlace",
        home_phone AS "homePhone",
        work_phone AS "workPhone",
        mobile,
        postal_code AS "postalCode",
        home_address AS "homeAddress",
        work_location AS "workLocation",
        job_title AS "jobTitle",
        hire_date AS "hireDate",
        termination_date AS "terminationDate",
        license_number AS "licenseNumber",
        license_type AS "licenseType",
        license_issue_date AS "licenseIssueDate",
        license_issue_place AS "licenseIssuePlace",
        license_expiry_date AS "licenseExpiryDate",
        current_vehicle_type AS "currentVehicleType",
        current_vehicle_plate AS "currentVehiclePlate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM drivers 
      WHERE is_deleted = false 
      ORDER BY name
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get drivers:', error);
    res.status(500).json({ message: 'Internal server error while fetching drivers.' });
  }
}

/**
 * Fetches a single driver by ID.
 */
async function getDriverById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`
      SELECT 
        id,
        employee_id AS "employeeId",
        name,
        father_name AS "fatherName",
        national_id AS "nationalId",
        birth_date AS "birthDate",
        id_number AS "idNumber",
        birth_place AS "birthPlace",
        issue_place AS "issuePlace",
        home_phone AS "homePhone",
        work_phone AS "workPhone",
        mobile,
        postal_code AS "postalCode",
        home_address AS "homeAddress",
        work_location AS "workLocation",
        job_title AS "jobTitle",
        hire_date AS "hireDate",
        termination_date AS "terminationDate",
        license_number AS "licenseNumber",
        license_type AS "licenseType",
        license_issue_date AS "licenseIssueDate",
        license_issue_place AS "licenseIssuePlace",
        license_expiry_date AS "licenseExpiryDate",
        current_vehicle_type AS "currentVehicleType",
        current_vehicle_plate AS "currentVehiclePlate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM drivers 
      WHERE id = $1 AND is_deleted = false
    `, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get driver ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the driver.' });
  }
}

/**
 * Creates a new driver.
 */
async function createDriver(req, res) {
  try {
    const {
      employeeId,
      name,
      fatherName,
      nationalId,
      birthDate,
      idNumber,
      birthPlace,
      issuePlace,
      homePhone,
      workPhone,
      mobile,
      postalCode,
      homeAddress,
      workLocation,
      jobTitle,
      hireDate,
      terminationDate,
      licenseNumber,
      licenseType,
      licenseIssueDate,
      licenseIssuePlace,
      licenseExpiryDate
    } = req.body;

    if (!employeeId || !name) {
      return res.status(400).json({ message: 'Employee ID and name are required.' });
    }

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO drivers (
        id, employee_id, name, father_name, national_id, birth_date, id_number,
        birth_place, issue_place, home_phone, work_phone, mobile, postal_code,
        home_address, work_location, job_title, hire_date, termination_date,
        license_number, license_type, license_issue_date, license_issue_place,
        license_expiry_date, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW()
      ) RETURNING *`,
      [
        id, employeeId, name, fatherName || null, nationalId,
        birthDate ? new Date(birthDate) : null, idNumber || null,
        birthPlace || null, issuePlace || null, homePhone || null,
        workPhone || null, mobile || null, postalCode || null,
        homeAddress || null, workLocation || null, jobTitle || null,
        hireDate ? new Date(hireDate) : null, terminationDate ? new Date(terminationDate) : null,
        licenseNumber || null, licenseType || null, licenseIssueDate ? new Date(licenseIssueDate) : null,
        licenseIssuePlace || null, licenseExpiryDate ? new Date(licenseExpiryDate) : null
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Failed to create driver:', error);
    res.status(500).json({ message: 'Internal server error while creating driver.' });
  }
}

/**
 * Updates an existing driver.
 */
async function updateDriver(req, res) {
  try {
    const { id } = req.params;
    const {
      employeeId,
      name,
      fatherName,
      nationalId,
      birthDate,
      idNumber,
      birthPlace,
      issuePlace,
      homePhone,
      workPhone,
      mobile,
      postalCode,
      homeAddress,
      workLocation,
      jobTitle,
      hireDate,
      terminationDate,
      licenseNumber,
      licenseType,
      licenseIssueDate,
      licenseIssuePlace,
      licenseExpiryDate
    } = req.body;

    if (!employeeId || !name) {
      return res.status(400).json({ message: 'Employee ID and name are required.' });
    }

    const { rows } = await pool.query(
      `UPDATE drivers SET 
        employee_id = $1, name = $2, father_name = $3, national_id = $4, birth_date = $5, id_number = $6,
        birth_place = $7, issue_place = $8, home_phone = $9, work_phone = $10, mobile = $11, postal_code = $12,
        home_address = $13, work_location = $14, job_title = $15, hire_date = $16, termination_date = $17,
        license_number = $18, license_type = $19, license_issue_date = $20, license_issue_place = $21,
        license_expiry_date = $22, updated_at = NOW()
      WHERE id = $23 AND is_deleted = false RETURNING *`,
      [
        employeeId, name, fatherName || null, nationalId,
        birthDate ? new Date(birthDate) : null, idNumber || null,
        birthPlace || null, issuePlace || null, homePhone || null,
        workPhone || null, mobile || null, postalCode || null,
        homeAddress || null, workLocation || null, jobTitle || null,
        hireDate ? new Date(hireDate) : null, terminationDate ? new Date(terminationDate) : null,
        licenseNumber || null, licenseType || null, licenseIssueDate ? new Date(licenseIssueDate) : null,
        licenseIssuePlace || null, licenseExpiryDate ? new Date(licenseExpiryDate) : null, id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    const did = req?.params?.id;
    console.error(`Failed to update driver ${did}:`, error);
    res.status(500).json({ message: 'Internal server error while updating driver.' });
  }
}

/**
 * Deletes a driver.
 */
async function deleteDriver(req, res) {
  try {
    const { id } = req.params;
    // Soft delete: mark as deleted instead of removing the row
    // Try by primary id first
    let result = await pool.query('UPDATE drivers SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *', [id]);
    // If nothing updated, try by employee_id (some clients may send employee code)
    if (result.rows.length === 0) {
      result = await pool.query('UPDATE drivers SET is_deleted = true, updated_at = NOW() WHERE employee_id = $1 AND is_deleted = false RETURNING *', [id]);
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found.' });
    }
    res.json({ message: 'Driver deleted successfully (soft delete).' });
  } catch (error) {
    const did = req?.params?.id;
    console.error(`Failed to delete driver ${did}:`, error);
    res.status(500).json({ message: 'Internal server error while deleting driver.' });
  }
}

module.exports = {
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
};



























