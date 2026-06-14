const pool = require('../db');
const crypto = require('crypto');

/**
 * Fetches all drivers.
 */
async function getDrivers(req, res) {
  try {
    const { full } = req.query; // اگر full=true باشد، همه فیلدها را برمی‌گرداند
    const isFull = full === 'true' || full === true;
    
    // بررسی وجود ستون account_number
    let hasAccountNumber = false;
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'drivers' 
        AND column_name = 'account_number'
      `);
      hasAccountNumber = columnCheck.rows.length > 0;
    } catch (checkError) {
      console.warn('⚠️ [getDrivers] Failed to check for account_number column, assuming it does not exist:', checkError.message);
      hasAccountNumber = false;
    }
    
    const accountNumberSelect = hasAccountNumber 
      ? 'account_number AS "accountNumber"'
      : 'NULL AS "accountNumber"';
    
    let query;
    if (isFull) {
      // برگرداندن همه فیلدها برای admin panel
      query = `
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
          ${accountNumberSelect},
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM drivers 
        WHERE is_deleted = false 
        ORDER BY name
      `;
    } else {
      // فقط فیلدهای ضروری برای dropdown/select را برگردان
      query = `
        SELECT 
          id,
          employee_id AS "employeeId",
          name,
          mobile,
          national_id AS "nationalId",
          license_number AS "licenseNumber",
          license_type AS "licenseType",
          current_vehicle_type AS "currentVehicleType",
          current_vehicle_plate AS "currentVehiclePlate",
          ${accountNumberSelect}
        FROM drivers 
        WHERE is_deleted = false 
        ORDER BY name
      `;
    }
    
    const { rows } = await pool.query(query);
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
    // بررسی وجود ستون account_number
    let hasAccountNumber = false;
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'drivers' 
        AND column_name = 'account_number'
      `);
      hasAccountNumber = columnCheck.rows.length > 0;
    } catch (checkError) {
      console.warn('⚠️ [getDriverById] Failed to check for account_number column, assuming it does not exist:', checkError.message);
      hasAccountNumber = false;
    }
    
    const accountNumberSelect = hasAccountNumber 
      ? 'account_number AS "accountNumber"'
      : 'NULL AS "accountNumber"';
    
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
        ${accountNumberSelect},
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
      licenseExpiryDate,
      accountNumber
    } = req.body;

    if (!employeeId || !name) {
      return res.status(400).json({ message: 'کد پرسنلی و نام الزامی است.' });
    }

    let normalizedNationalId = null;
    if (nationalId !== undefined && nationalId !== null && String(nationalId).trim() !== '') {
      normalizedNationalId = String(nationalId).trim();
    }
    if (!normalizedNationalId) {
      return res.status(400).json({ message: 'کد ملی الزامی است.' });
    }

    const existingEmployee = await pool.query(
      'SELECT id, name FROM drivers WHERE employee_id = $1 AND is_deleted = false',
      [String(employeeId).trim()]
    );
    if (existingEmployee.rows.length > 0) {
      return res.status(400).json({
        message: `کد پرسنلی "${employeeId}" قبلاً ثبت شده (${existingEmployee.rows[0].name}).`,
      });
    }

    const existingNational = await pool.query(
      'SELECT id, name FROM drivers WHERE national_id = $1 AND is_deleted = false',
      [normalizedNationalId]
    );
    if (existingNational.rows.length > 0) {
      return res.status(400).json({
        message: `کد ملی "${normalizedNationalId}" قبلاً ثبت شده (${existingNational.rows[0].name}).`,
      });
    }

    // بررسی وجود ستون account_number
    let hasAccountNumber = false;
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'drivers' 
        AND column_name = 'account_number'
      `);
      hasAccountNumber = columnCheck.rows.length > 0;
    } catch (checkError) {
      console.warn('⚠️ [createDriver] Failed to check for account_number column, assuming it does not exist:', checkError.message);
      hasAccountNumber = false;
    }

    const id = crypto.randomUUID();
    
    // ساخت query بر اساس وجود ستون
    let insertColumns = `id, employee_id, name, father_name, national_id, birth_date, id_number,
        birth_place, issue_place, home_phone, work_phone, mobile, postal_code,
        home_address, work_location, job_title, hire_date, termination_date,
        license_number, license_type, license_issue_date, license_issue_place,
        license_expiry_date, created_at, updated_at`;
    let insertValues = `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW()`;
    let insertParams = [
      id, employeeId, name, fatherName || null, normalizedNationalId,
      birthDate ? new Date(birthDate) : null, idNumber || null,
      birthPlace || null, issuePlace || null, homePhone || null,
      workPhone || null, mobile || null, postalCode || null,
      homeAddress || null, workLocation || null, jobTitle || null,
      hireDate ? new Date(hireDate) : null, terminationDate ? new Date(terminationDate) : null,
      licenseNumber || null, licenseType || null, licenseIssueDate ? new Date(licenseIssueDate) : null,
      licenseIssuePlace || null, licenseExpiryDate ? new Date(licenseExpiryDate) : null
    ];
    
    if (hasAccountNumber) {
      insertColumns = `id, employee_id, name, father_name, national_id, birth_date, id_number,
        birth_place, issue_place, home_phone, work_phone, mobile, postal_code,
        home_address, work_location, job_title, hire_date, termination_date,
        license_number, license_type, license_issue_date, license_issue_place,
        license_expiry_date, account_number, created_at, updated_at`;
      insertValues = `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW()`;
      insertParams.push(accountNumber || null);
    }
    
    const { rows } = await pool.query(
      `INSERT INTO drivers (${insertColumns}) VALUES (${insertValues}) RETURNING *`,
      insertParams
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Failed to create driver:', error);
    if (error.code === '23505') {
      const detail = String(error.detail || '');
      if (detail.includes('employee_id')) {
        return res.status(400).json({ message: 'کد پرسنلی تکراری است.' });
      }
      if (detail.includes('national_id')) {
        return res.status(400).json({ message: 'کد ملی تکراری است.' });
      }
      return res.status(400).json({ message: 'رکورد تکراری است.' });
    }
    if (error.code === '23502') {
      return res.status(400).json({ message: 'فیلدهای الزامی را کامل کنید (کد پرسنلی، نام، کد ملی).' });
    }
    res.status(500).json({ message: 'خطا در ایجاد راننده.' });
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
      licenseExpiryDate,
      accountNumber
    } = req.body;

    if (!employeeId || !name) {
      return res.status(400).json({ message: 'Employee ID and name are required.' });
    }

    // Normalize nationalId: اگر undefined، null، یا empty string است، به null تبدیل کن
    let normalizedNationalId = null;
    if (nationalId !== undefined && nationalId !== null && String(nationalId).trim() !== '') {
      normalizedNationalId = String(nationalId).trim();
    }

    // بررسی اینکه آیا national_id متعلق به راننده دیگری است یا نه
    // فقط اگر national_id خالی نباشد چک می‌کنیم (NULL یا empty string)
    if (normalizedNationalId) {
      try {
        const existingDriver = await pool.query(
          'SELECT id, name FROM drivers WHERE national_id = $1 AND national_id IS NOT NULL AND national_id != \'\' AND id != $2 AND is_deleted = false',
          [normalizedNationalId, id]
        );
        
        if (existingDriver.rows.length > 0) {
          return res.status(400).json({ 
            message: `کد ملی "${normalizedNationalId}" متعلق به راننده دیگری است (${existingDriver.rows[0].name}). لطفاً یک کد ملی منحصر به فرد وارد کنید.` 
          });
        }
      } catch (checkError) {
        console.warn('⚠️ [updateDriver] Failed to check national_id uniqueness:', checkError.message);
        // اگر چک با خطا مواجه شد، ادامه می‌دهیم (ممکن است ستون وجود نداشته باشد)
      }
    }

    // بررسی وجود ستون account_number
    let hasAccountNumber = false;
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'drivers' 
        AND column_name = 'account_number'
      `);
      hasAccountNumber = columnCheck.rows.length > 0;
    } catch (checkError) {
      console.warn('⚠️ [updateDriver] Failed to check for account_number column, assuming it does not exist:', checkError.message);
      hasAccountNumber = false;
    }

    // ساخت query بر اساس وجود ستون
    // normalizedNationalId قبلاً محاسبه شده است
    
    let updateQuery = `UPDATE drivers SET 
        employee_id = $1, name = $2, father_name = $3, national_id = $4, birth_date = $5, id_number = $6,
        birth_place = $7, issue_place = $8, home_phone = $9, work_phone = $10, mobile = $11, postal_code = $12,
        home_address = $13, work_location = $14, job_title = $15, hire_date = $16, termination_date = $17,
        license_number = $18, license_type = $19, license_issue_date = $20, license_issue_place = $21,
        license_expiry_date = $22, updated_at = NOW()
      WHERE id = $23 AND is_deleted = false RETURNING *`;
    let updateParams = [
      employeeId, name, fatherName || null, normalizedNationalId,
      birthDate ? new Date(birthDate) : null, idNumber || null,
      birthPlace || null, issuePlace || null, homePhone || null,
      workPhone || null, mobile || null, postalCode || null,
      homeAddress || null, workLocation || null, jobTitle || null,
      hireDate ? new Date(hireDate) : null, terminationDate ? new Date(terminationDate) : null,
      licenseNumber || null, licenseType || null, licenseIssueDate ? new Date(licenseIssueDate) : null,
      licenseIssuePlace || null, licenseExpiryDate ? new Date(licenseExpiryDate) : null,
      id
    ];
    
    if (hasAccountNumber) {
      updateQuery = `UPDATE drivers SET 
        employee_id = $1, name = $2, father_name = $3, national_id = $4, birth_date = $5, id_number = $6,
        birth_place = $7, issue_place = $8, home_phone = $9, work_phone = $10, mobile = $11, postal_code = $12,
        home_address = $13, work_location = $14, job_title = $15, hire_date = $16, termination_date = $17,
        license_number = $18, license_type = $19, license_issue_date = $20, license_issue_place = $21,
        license_expiry_date = $22, account_number = $23, updated_at = NOW()
      WHERE id = $24 AND is_deleted = false RETURNING *`;
      updateParams = [
        employeeId, name, fatherName || null, normalizedNationalId,
        birthDate ? new Date(birthDate) : null, idNumber || null,
        birthPlace || null, issuePlace || null, homePhone || null,
        workPhone || null, mobile || null, postalCode || null,
        homeAddress || null, workLocation || null, jobTitle || null,
        hireDate ? new Date(hireDate) : null, terminationDate ? new Date(terminationDate) : null,
        licenseNumber || null, licenseType || null, licenseIssueDate ? new Date(licenseIssueDate) : null,
        licenseIssuePlace || null, licenseExpiryDate ? new Date(licenseExpiryDate) : null,
        accountNumber || null, id
      ];
    }

    const { rows } = await pool.query(updateQuery, updateParams);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    const did = req?.params?.id;
    console.error(`Failed to update driver ${did}:`, error);
    
    // بررسی خطای unique constraint violation
    if (error.code === '23505') {
      // کد 23505 = unique_violation
      if (error.constraint === 'drivers_national_id_key') {
        return res.status(400).json({ 
          message: 'کد ملی تکراری است. لطفاً یک کد ملی منحصر به فرد وارد کنید.' 
        });
      } else if (error.constraint === 'drivers_employee_id_key') {
        return res.status(400).json({ 
          message: 'کد پرسنلی تکراری است. لطفاً یک کد پرسنلی منحصر به فرد وارد کنید.' 
        });
      }
      return res.status(400).json({ 
        message: 'مقدار تکراری وارد شده است. لطفاً مقادیر منحصر به فرد وارد کنید.' 
      });
    }
    
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

/**
 * Import رانندگان شرکتی از فایل اکسل
 * POST /api/v1/drivers/import-excel
 * Body (multipart/form-data):
 *   - file: فایل اکسل (.xlsx, .xls)
 */
async function importCompanyDriversFromExcel(req, res) {
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
        if (i === 0) {
          console.log('🔍 [ImportExcel] Available columns in first row:', Object.keys(row));
        }
        
        // استخراج کد پرسنلی - اجباری
        let employeeId = '';
        const employeeIdKeys = Object.keys(row).find(key => {
          const normalized = key.trim().toLowerCase();
          return normalized === 'کد پرسنلی' || 
                 normalized === 'کدپرسنلی' || 
                 normalized === 'کد پرسنلی' ||
                 normalized === 'employee_id' ||
                 normalized === 'employeeid' ||
                 normalized === 'کد پرسنلی' ||
                 normalized === 'کدپرسنلی';
        });
        if (employeeIdKeys) {
          employeeId = String(row[employeeIdKeys] || '').trim();
        }
        
        // استخراج نام - اجباری
        let name = '';
        const nameKeys = Object.keys(row).find(key => {
          const normalized = key.trim().toLowerCase();
          return normalized === 'نام' ||
                 normalized === 'name';
        });
        if (nameKeys) {
          name = String(row[nameKeys] || '').trim();
        }
        
        // استخراج کد ملی - اجباری
        let nationalId = '';
        const nationalIdKeys = Object.keys(row).find(key => {
          const normalized = key.trim().toLowerCase();
          return normalized === 'کد ملی' || 
                 normalized === 'کدملی' || 
                 normalized === 'کد‌ملی' ||
                 normalized === 'national_id' ||
                 normalized === 'nationalid';
        });
        if (nationalIdKeys) {
          nationalId = String(row[nationalIdKeys] || '').trim();
        }
        
        // استخراج سایر فیلدها - اختیاری (با بررسی همه نام‌های ممکن)
        const getFieldValue = (possibleNames) => {
          for (const name of possibleNames) {
            const key = Object.keys(row).find(k => k.trim().toLowerCase() === name.toLowerCase());
            if (key && row[key]) {
              const value = String(row[key] || '').trim();
              if (value) return value;
            }
          }
          return null;
        };
        
        const fatherName = getFieldValue(['نام پدر', 'father_name', 'fatherName']) || null;
        const mobile = getFieldValue(['موبایل', 'شماره موبایل', 'mobile']) || null;
        const workPhone = getFieldValue(['تلفن محل کار', 'تلفن کار', 'work_phone', 'workPhone']) || null;
        const homePhone = getFieldValue(['تلفن منزل', 'تلفن خانه', 'home_phone', 'homePhone']) || null;
        const jobTitle = getFieldValue(['عنوان شغلی', 'شغل', 'job_title', 'jobTitle']) || null;
        const workLocation = getFieldValue(['محل کار', 'work_location', 'workLocation']) || null;
        const licenseNumber = getFieldValue(['شماره گواهینامه', 'گواهینامه', 'license_number', 'licenseNumber']) || null;
        const licenseType = getFieldValue(['نوع گواهینامه', 'license_type', 'licenseType']) || null;
        
        // تاریخ‌ها - فقط پشتیبانی از تاریخ شمسی (YYYY/MM/DD)
        const { jalaliToGregorian } = require('../utils/jalali');
        const parseJalaliDate = (dateStr) => {
          if (!dateStr) return null;
          const str = String(dateStr).trim();
          if (!str || str === '') return null;
          
          // اگر عدد است (مثل 45234 که تاریخ اکسل است) - تبدیل به تاریخ میلادی اکسل و سپس به شمسی
          if (/^\d+$/.test(str)) {
            try {
              const excelDate = XLSX.SSF.parse_date_code(parseInt(str));
              if (excelDate) {
                // تبدیل تاریخ میلادی اکسل به شمسی
                const [jy, jm, jd] = require('../utils/jalali').gregorianToJalali(excelDate.y, excelDate.m, excelDate.d);
                // سپس شمسی را به میلادی تبدیل کنیم برای ذخیره در دیتابیس
                const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
                return new Date(gy, gm - 1, gd);
              }
            } catch (error) {
              console.warn(`⚠️ [ImportExcel] Row ${rowNumber}: خطا در تبدیل تاریخ اکسل:`, error);
            }
          }
          
          // اگر تاریخ شمسی است (YYYY/MM/DD)
          const jalaliMatch = str.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
          if (jalaliMatch) {
            try {
              const [, year, month, day] = jalaliMatch;
              const jy = parseInt(year, 10);
              const jm = parseInt(month, 10);
              const jd = parseInt(day, 10);
              
              // تبدیل تاریخ شمسی به میلادی با استفاده از کتابخانه
              const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
              const date = new Date(gy, gm - 1, gd);
              
              if (!isNaN(date.getTime())) {
                return date;
              }
            } catch (error) {
              console.warn(`⚠️ [ImportExcel] Row ${rowNumber}: خطا در تبدیل تاریخ شمسی:`, error);
            }
          }
          
          return null;
        };
        
        const hireDateValue = getFieldValue(['تاریخ استخدام', 'hire_date', 'hireDate']) || '';
        const licenseExpiryDateValue = getFieldValue(['تاریخ انقضای گواهینامه', 'license_expiry_date', 'licenseExpiryDate']) || '';
        
        const hireDate = parseJalaliDate(hireDateValue);
        const licenseExpiryDate = parseJalaliDate(licenseExpiryDateValue);

        // Validation فیلدهای اجباری
        const missingFields = [];
        if (!employeeId) missingFields.push('کد پرسنلی');
        if (!name) missingFields.push('نام');
        
        if (missingFields.length > 0) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: `فیلدهای اجباری خالی است: ${missingFields.join('، ')}`,
            data: { employeeId, name, nationalId }
          });
          continue;
        }

        // Validation فرمت کد ملی (اگر وارد شده باشد، باید 10 رقم باشد)
        if (nationalId && nationalId.trim() !== '' && !/^\d{10}$/.test(nationalId)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'کد ملی باید 10 رقم باشد یا خالی باشد',
            data: { nationalId }
          });
          continue;
        }
        
        // اگر کد ملی خالی بود، null می‌گذاریم (نه موقت)
        if (!nationalId || nationalId.trim() === '') {
          nationalId = null;
        }

        // Validation فرمت موبایل (اگر وارد شده باشد)
        if (mobile && !/^09\d{9}$/.test(mobile)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            error: 'شماره موبایل باید 11 رقم و با 09 شروع شود (یا خالی باشد)',
            data: { mobile }
          });
          continue;
        }

        // بررسی وجود راننده با این کد پرسنلی یا کد ملی (اگر کد ملی وارد شده باشد)
        const existingByEmployeeId = await pool.query(
          'SELECT id FROM drivers WHERE employee_id = $1 AND is_deleted = false',
          [employeeId]
        );
        
        let existingByNationalId = { rows: [] };
        if (nationalId) {
          existingByNationalId = await pool.query(
            'SELECT id FROM drivers WHERE national_id = $1 AND is_deleted = false',
            [nationalId]
          );
        }

        if (existingByEmployeeId.rows.length > 0 || (nationalId && existingByNationalId.rows.length > 0)) {
          // Update existing driver
          const driverId = existingByEmployeeId.rows[0]?.id || (nationalId ? existingByNationalId.rows[0]?.id : null);
          
          await pool.query(
            `UPDATE drivers SET 
              name = $1, 
              father_name = $2, 
              national_id = $3, 
              mobile = $4, 
              work_phone = $5, 
              home_phone = $6, 
              job_title = $7, 
              work_location = $8, 
              license_number = $9, 
              license_type = $10, 
              hire_date = $11, 
              license_expiry_date = $12, 
              updated_at = NOW()
            WHERE id = $13 AND is_deleted = false`,
            [
              name, fatherName, nationalId || null, mobile, workPhone, homePhone,
              jobTitle, workLocation, licenseNumber, licenseType,
              hireDate, licenseExpiryDate, driverId
            ]
          );
          results.updated++;
        } else {
          // Create new driver
          const id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO drivers (
              id, employee_id, name, father_name, national_id, mobile, 
              work_phone, home_phone, job_title, work_location, 
              license_number, license_type, hire_date, license_expiry_date,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
            [
              id, employeeId, name, fatherName, nationalId || null, mobile,
              workPhone, homePhone, jobTitle, workLocation,
              licenseNumber, licenseType, hireDate, licenseExpiryDate
            ]
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
    console.error('Error importing company drivers from Excel:', error);
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
 * Updates only the account number of a driver (for transport finance users only)
 */
async function updateDriverAccountNumber(req, res) {
  try {
    const { id } = req.params;
    const { accountNumber } = req.body;

    if (!id) {
      return res.status(400).json({ message: 'Driver ID is required.' });
    }

    // بررسی وجود ستون account_number
    let hasAccountNumber = false;
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'drivers' 
        AND column_name = 'account_number'
      `);
      hasAccountNumber = columnCheck.rows.length > 0;
    } catch (checkError) {
      console.error('❌ [updateDriverAccountNumber] Failed to check for account_number column:', checkError.message);
      return res.status(500).json({ 
        message: 'Failed to check for account_number column. Please ensure the database is accessible.' 
      });
    }

    if (!hasAccountNumber) {
      return res.status(400).json({ 
        message: 'Column account_number does not exist. Please run the migration first.' 
      });
    }

    // بررسی وجود راننده
    const checkDriver = await pool.query(
      `SELECT id FROM drivers WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (checkDriver.rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found.' });
    }

    // فقط account_number را update می‌کنیم
    const { rows } = await pool.query(
      `UPDATE drivers 
       SET account_number = $1, updated_at = NOW()
       WHERE id = $2 AND is_deleted = false 
       RETURNING id, employee_id AS "employeeId", name, account_number AS "accountNumber"`,
      [accountNumber || null, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found or update failed.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to update driver account number ${req.params.id}:`, error);
    res.status(500).json({ message: 'Internal server error while updating driver account number.' });
  }
}

module.exports = {
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  importCompanyDriversFromExcel,
  updateDriverAccountNumber
};



























