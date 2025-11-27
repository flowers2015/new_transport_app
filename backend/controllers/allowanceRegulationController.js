const pool = require('../db');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// تنظیمات multer برای آپلود فایل
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/regulations');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'regulation-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('فقط فایل‌های تصویر، PDF و Word مجاز هستند.'));
  }
});

/**
 * ایجاد جداول بخشنامه (جداگانه برای غذا، اجرت راننده کمکی و اجرت پیمایش)
 */
async function createAllowanceRegulationTables() {
  try {
    // جدول بخشنامه هزینه غذا
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowance_regulations_food (
        id VARCHAR(255) PRIMARY KEY,
        food_cost DECIMAL(15, 2) NOT NULL,
        approval_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        document_path VARCHAR(500),
        start_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        end_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      )
    `);

    // جدول بخشنامه اجرت راننده کمکی
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowance_regulations_helper (
        id VARCHAR(255) PRIMARY KEY,
        helper_allowance DECIMAL(15, 2) NOT NULL,
        approval_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        document_path VARCHAR(500),
        start_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        end_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      )
    `);

    // جدول اجرت پیمایش (تریلی و ده چرخ)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowance_regulations_mileage (
        id VARCHAR(255) PRIMARY KEY,
        vehicle_type VARCHAR(50) NOT NULL, -- 'تریلی' یا 'ده چرخ'
        min_kilometers INTEGER NOT NULL,
        max_kilometers INTEGER NOT NULL,
        allowance_per_km DECIMAL(15, 2) NOT NULL,
        approval_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        document_path VARCHAR(500),
        start_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        end_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      )
    `);

    // جدول بخشنامه هزینه ماموریت مازاد
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowance_regulations_excess_mission (
        id VARCHAR(255) PRIMARY KEY,
        excess_mission_cost DECIMAL(15, 2) NOT NULL,
        approval_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        document_path VARCHAR(500),
        start_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        end_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      )
    `);

    // جدول بخشنامه هزینه چندجا تخلیه
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowance_regulations_multi_unload (
        id VARCHAR(255) PRIMARY KEY,
        multi_unload_cost DECIMAL(15, 2) NOT NULL,
        approval_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        document_path VARCHAR(500),
        start_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        end_date VARCHAR(10), -- تاریخ شمسی YYYY/MM/DD
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      )
    `);

    // اضافه کردن ستون‌های جدید به جداول موجود (اگر وجود دارند)
    try {
      // بررسی و اضافه کردن ستون‌های جدید به جدول mileage
      const mileageColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'allowance_regulations_mileage'
      `);
      
      const columnNames = mileageColumns.rows.map(row => row.column_name);
      
      if (!columnNames.includes('is_active')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN is_active BOOLEAN DEFAULT TRUE`);
        console.log('✅ [createAllowanceRegulationTables] ستون is_active به جدول mileage اضافه شد');
      }
      
      if (!columnNames.includes('approval_date')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN approval_date VARCHAR(10)`);
        console.log('✅ [createAllowanceRegulationTables] ستون approval_date به جدول mileage اضافه شد');
      }
      
      if (!columnNames.includes('document_path')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN document_path VARCHAR(500)`);
        console.log('✅ [createAllowanceRegulationTables] ستون document_path به جدول mileage اضافه شد');
      }
      
      if (!columnNames.includes('start_date')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN start_date VARCHAR(10)`);
        console.log('✅ [createAllowanceRegulationTables] ستون start_date به جدول mileage اضافه شد');
      }
      
      if (!columnNames.includes('end_date')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN end_date VARCHAR(10)`);
        console.log('✅ [createAllowanceRegulationTables] ستون end_date به جدول mileage اضافه شد');
      }
      
      if (!columnNames.includes('created_by')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN created_by VARCHAR(255)`);
        console.log('✅ [createAllowanceRegulationTables] ستون created_by به جدول mileage اضافه شد');
      }
      
      if (!columnNames.includes('updated_by')) {
        await pool.query(`ALTER TABLE allowance_regulations_mileage ADD COLUMN updated_by VARCHAR(255)`);
        console.log('✅ [createAllowanceRegulationTables] ستون updated_by به جدول mileage اضافه شد');
      }
    } catch (alterError) {
      console.warn('⚠️ [createAllowanceRegulationTables] خطا در اضافه کردن ستون‌ها (ممکن است قبلاً اضافه شده باشند):', alterError.message);
    }

    console.log('✅ [createAllowanceRegulationTables] جداول بخشنامه ایجاد شدند');
  } catch (error) {
    console.error('❌ [createAllowanceRegulationTables] خطا:', error);
    throw error;
  }
}

/**
 * دریافت بخشنامه هزینه غذا
 */
async function getFoodRegulations(req, res) {
  try {
    await createAllowanceRegulationTables();

    // بررسی وجود جدول users
    let query = `
      SELECT arf.*
      FROM allowance_regulations_food arf
      WHERE arf.is_active = TRUE
      ORDER BY arf.created_at DESC
    `;
    
    try {
      // اگر جدول users وجود دارد، JOIN را اضافه کن
      const usersTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      
      if (usersTableCheck.rows[0]?.exists) {
        query = `
          SELECT 
            arf.*,
            u1.name as created_by_name,
            u2.name as updated_by_name
          FROM allowance_regulations_food arf
          LEFT JOIN users u1 ON arf.created_by = u1.id
          LEFT JOIN users u2 ON arf.updated_by = u2.id
          WHERE arf.is_active = TRUE
          ORDER BY arf.created_at DESC
        `;
      }
    } catch (joinError) {
      console.warn('⚠️ [getFoodRegulations] جدول users وجود ندارد، بدون JOIN ادامه می‌دهیم:', joinError.message);
    }

    const result = await pool.query(query);
    console.log('✅ [getFoodRegulations] تعداد رکوردها:', result.rows.length);
    
    const regulations = result.rows.map(row => ({
      id: row.id,
      foodCost: parseFloat(row.food_cost || 0),
      approvalDate: row.approval_date || null,
      documentPath: row.document_path || null,
      startDate: row.start_date || null,
      endDate: row.end_date || null,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by || null,
      createdByName: row.created_by_name || null,
      updatedBy: row.updated_by || null,
      updatedByName: row.updated_by_name || null,
    }));

    res.json(regulations);
  } catch (error) {
    console.error('❌ [getFoodRegulations] Error:', error);
    console.error('❌ [getFoodRegulations] Error Stack:', error.stack);
    res.status(500).json({ message: 'خطا در دریافت بخشنامه هزینه غذا: ' + error.message });
  }
}

/**
 * دریافت بخشنامه اجرت راننده کمکی
 */
async function getHelperRegulations(req, res) {
  try {
    await createAllowanceRegulationTables();

    // بررسی وجود جدول users
    let query = `
      SELECT arh.*
      FROM allowance_regulations_helper arh
      WHERE arh.is_active = TRUE
      ORDER BY arh.created_at DESC
    `;
    
    try {
      // اگر جدول users وجود دارد، JOIN را اضافه کن
      const usersTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      
      if (usersTableCheck.rows[0]?.exists) {
        query = `
          SELECT 
            arh.*,
            u1.name as created_by_name,
            u2.name as updated_by_name
          FROM allowance_regulations_helper arh
          LEFT JOIN users u1 ON arh.created_by = u1.id
          LEFT JOIN users u2 ON arh.updated_by = u2.id
          WHERE arh.is_active = TRUE
          ORDER BY arh.created_at DESC
        `;
      }
    } catch (joinError) {
      console.warn('⚠️ [getHelperRegulations] جدول users وجود ندارد، بدون JOIN ادامه می‌دهیم:', joinError.message);
    }

    const result = await pool.query(query);
    console.log('✅ [getHelperRegulations] تعداد رکوردها:', result.rows.length);
    
    const regulations = result.rows.map(row => ({
      id: row.id,
      helperAllowance: parseFloat(row.helper_allowance || 0),
      approvalDate: row.approval_date || null,
      documentPath: row.document_path || null,
      startDate: row.start_date || null,
      endDate: row.end_date || null,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by || null,
      createdByName: row.created_by_name || null,
      updatedBy: row.updated_by || null,
      updatedByName: row.updated_by_name || null,
    }));

    res.json(regulations);
  } catch (error) {
    console.error('❌ [getHelperRegulations] Error:', error);
    console.error('❌ [getHelperRegulations] Error Stack:', error.stack);
    res.status(500).json({ message: 'خطا در دریافت بخشنامه اجرت راننده کمکی: ' + error.message });
  }
}

/**
 * دریافت بخشنامه اجرت پیمایش
 */
async function getMileageRegulations(req, res) {
  try {
    await createAllowanceRegulationTables();

    const { vehicleType } = req.query;

    // بررسی وجود جدول users
    let query = `
      SELECT arm.*
      FROM allowance_regulations_mileage arm
      WHERE arm.is_active = TRUE
    `;
    const params = [];
    let paramIndex = 1;

    if (vehicleType) {
      query += ` AND arm.vehicle_type = $${paramIndex++}`;
      params.push(vehicleType);
    }

    query += ` ORDER BY arm.min_kilometers ASC`;
    
    try {
      // اگر جدول users وجود دارد، JOIN را اضافه کن
      const usersTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      
      if (usersTableCheck.rows[0]?.exists) {
        let baseQuery = `
          SELECT 
            arm.*,
            u1.name as created_by_name,
            u2.name as updated_by_name
          FROM allowance_regulations_mileage arm
          LEFT JOIN users u1 ON arm.created_by = u1.id
          LEFT JOIN users u2 ON arm.updated_by = u2.id
          WHERE arm.is_active = TRUE
        `;
        if (vehicleType) {
          baseQuery += ` AND arm.vehicle_type = $1`;
          params.length = 0;
          params.push(vehicleType);
        }
        baseQuery += ` ORDER BY arm.min_kilometers ASC`;
        query = baseQuery;
      }
    } catch (joinError) {
      console.warn('⚠️ [getMileageRegulations] جدول users وجود ندارد، بدون JOIN ادامه می‌دهیم:', joinError.message);
    }

    const result = await pool.query(query, params);
    console.log('✅ [getMileageRegulations] تعداد رکوردها:', result.rows.length);
    
    const regulations = result.rows.map(row => ({
      id: row.id,
      vehicleType: row.vehicle_type,
      minKilometers: row.min_kilometers,
      maxKilometers: row.max_kilometers,
      allowancePerKm: parseFloat(row.allowance_per_km || 0),
      approvalDate: row.approval_date || null,
      documentPath: row.document_path || null,
      startDate: row.start_date || null,
      endDate: row.end_date || null,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by || null,
      createdByName: row.created_by_name || null,
      updatedBy: row.updated_by || null,
      updatedByName: row.updated_by_name || null,
    }));

    res.json(regulations);
  } catch (error) {
    console.error('❌ [getMileageRegulations] Error:', error);
    console.error('❌ [getMileageRegulations] Error Stack:', error.stack);
    res.status(500).json({ message: 'خطا در دریافت بخشنامه اجرت پیمایش: ' + error.message });
  }
}

/**
 * ذخیره یا به‌روزرسانی بخشنامه هزینه غذا
 */
async function saveFoodRegulation(req, res) {
  try {
    const {
      id,
      foodCost,
      approvalDate,
      documentPath,
      startDate,
      endDate,
      isActive,
      userId,
    } = req.body;

    if (!foodCost || !approvalDate || !startDate || !endDate) {
      return res.status(400).json({ message: 'هزینه غذا، تاریخ مصوبه، تاریخ شروع و پایان الزامی است.' });
    }

    await createAllowanceRegulationTables();

    if (id) {
      // به‌روزرسانی
      await pool.query(`
        UPDATE allowance_regulations_food SET
          food_cost = $1,
          approval_date = $2,
          document_path = $3,
          start_date = $4,
          end_date = $5,
          is_active = $6,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [
        foodCost,
        approvalDate,
        documentPath || null,
        startDate,
        endDate,
        isActive !== undefined ? isActive : true,
        userId || null,
        id,
      ]);

      return res.json({ 
        message: 'بخشنامه هزینه غذا به‌روزرسانی شد.',
        id 
      });
    } else {
      // ایجاد جدید
      const newId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO allowance_regulations_food (
          id, food_cost, approval_date, document_path,
          start_date, end_date, is_active, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newId,
        foodCost,
        approvalDate,
        documentPath || null,
        startDate,
        endDate,
        isActive !== undefined ? isActive : true,
        userId || null,
        userId || null,
      ]);

      return res.status(201).json({ 
        message: 'بخشنامه هزینه غذا ثبت شد.',
        id: newId 
      });
    }
  } catch (error) {
    console.error('❌ [saveFoodRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در ذخیره بخشنامه هزینه غذا.' });
  }
}

/**
 * ذخیره یا به‌روزرسانی بخشنامه اجرت راننده کمکی
 */
async function saveHelperRegulation(req, res) {
  try {
    const {
      id,
      helperAllowance,
      approvalDate,
      documentPath,
      startDate,
      endDate,
      isActive,
      userId,
    } = req.body;

    if (!helperAllowance || !approvalDate || !startDate || !endDate) {
      return res.status(400).json({ message: 'اجرت راننده کمکی، تاریخ مصوبه، تاریخ شروع و پایان الزامی است.' });
    }

    await createAllowanceRegulationTables();

    if (id) {
      // به‌روزرسانی
      await pool.query(`
        UPDATE allowance_regulations_helper SET
          helper_allowance = $1,
          approval_date = $2,
          document_path = $3,
          start_date = $4,
          end_date = $5,
          is_active = $6,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [
        helperAllowance,
        approvalDate,
        documentPath || null,
        startDate,
        endDate,
        isActive !== undefined ? isActive : true,
        userId || null,
        id,
      ]);

      return res.json({ 
        message: 'بخشنامه اجرت راننده کمکی به‌روزرسانی شد.',
        id 
      });
    } else {
      // ایجاد جدید
      const newId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO allowance_regulations_helper (
          id, helper_allowance, approval_date, document_path,
          start_date, end_date, is_active, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newId,
        helperAllowance,
        approvalDate,
        documentPath || null,
        startDate,
        endDate,
        isActive !== undefined ? isActive : true,
        userId || null,
        userId || null,
      ]);

      return res.status(201).json({ 
        message: 'بخشنامه اجرت راننده کمکی ثبت شد.',
        id: newId 
      });
    }
  } catch (error) {
    console.error('❌ [saveHelperRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در ذخیره بخشنامه اجرت راننده کمکی.' });
  }
}

/**
 * ذخیره یا به‌روزرسانی بخشنامه اجرت پیمایش
 */
async function saveMileageRegulation(req, res) {
  try {
    const {
      id,
      vehicleType,
      minKilometers,
      maxKilometers,
      allowancePerKm,
      approvalDate,
      documentPath,
      startDate,
      endDate,
      isActive,
      userId,
    } = req.body;

    if (!vehicleType || minKilometers === undefined || maxKilometers === undefined || !allowancePerKm) {
      return res.status(400).json({ message: 'نوع خودرو، بازه کیلومتر و اجرت به ازای هر کیلومتر الزامی است.' });
    }

    await createAllowanceRegulationTables();

    if (id) {
      // به‌روزرسانی
      await pool.query(`
        UPDATE allowance_regulations_mileage SET
          vehicle_type = $1,
          min_kilometers = $2,
          max_kilometers = $3,
          allowance_per_km = $4,
          approval_date = $5,
          document_path = $6,
          start_date = $7,
          end_date = $8,
          is_active = $9,
          updated_by = $10,
          updated_at = NOW()
        WHERE id = $11
      `, [
        vehicleType,
        minKilometers,
        maxKilometers,
        allowancePerKm,
        approvalDate || null,
        documentPath || null,
        startDate || null,
        endDate || null,
        isActive !== undefined ? isActive : true,
        userId || null,
        id,
      ]);

      return res.json({ 
        message: 'بخشنامه اجرت پیمایش به‌روزرسانی شد.',
        id 
      });
    } else {
      // ایجاد جدید
      const newId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO allowance_regulations_mileage (
          id, vehicle_type, min_kilometers, max_kilometers,
          allowance_per_km, approval_date, document_path,
          start_date, end_date, is_active, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        newId,
        vehicleType,
        minKilometers,
        maxKilometers,
        allowancePerKm,
        approvalDate || null,
        documentPath || null,
        startDate || null,
        endDate || null,
        isActive !== undefined ? isActive : true,
        userId || null,
        userId || null,
      ]);

      return res.status(201).json({ 
        message: 'بخشنامه اجرت پیمایش ثبت شد.',
        id: newId 
      });
    }
  } catch (error) {
    console.error('❌ [saveMileageRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در ذخیره بخشنامه اجرت پیمایش.' });
  }
}

/**
 * حذف بخشنامه هزینه غذا
 */
async function deleteFoodRegulation(req, res) {
  try {
    const { id } = req.params;
    await createAllowanceRegulationTables();

    await pool.query(`
      UPDATE allowance_regulations_food 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'بخشنامه هزینه غذا حذف شد.' });
  } catch (error) {
    console.error('❌ [deleteFoodRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در حذف بخشنامه هزینه غذا.' });
  }
}

/**
 * حذف بخشنامه اجرت راننده کمکی
 */
async function deleteHelperRegulation(req, res) {
  try {
    const { id } = req.params;
    await createAllowanceRegulationTables();

    await pool.query(`
      UPDATE allowance_regulations_helper 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'بخشنامه اجرت راننده کمکی حذف شد.' });
  } catch (error) {
    console.error('❌ [deleteHelperRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در حذف بخشنامه اجرت راننده کمکی.' });
  }
}

/**
 * حذف بخشنامه اجرت پیمایش
 */
async function deleteMileageRegulation(req, res) {
  try {
    const { id } = req.params;
    await createAllowanceRegulationTables();

    await pool.query(`
      UPDATE allowance_regulations_mileage 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'بخشنامه اجرت پیمایش حذف شد.' });
  } catch (error) {
    console.error('❌ [deleteMileageRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در حذف بخشنامه اجرت پیمایش.' });
  }
}

/**
 * دریافت بخشنامه هزینه ماموریت مازاد
 */
async function getExcessMissionRegulations(req, res) {
  try {
    console.log('🔍 [getExcessMissionRegulations] شروع دریافت بخشنامه ماموریت مازاد');
    
    try {
      await createAllowanceRegulationTables();
      console.log('✅ [getExcessMissionRegulations] جداول بررسی شدند');
    } catch (tableError) {
      console.error('❌ [getExcessMissionRegulations] خطا در ایجاد جداول:', tableError);
      throw tableError;
    }

    // بررسی وجود جدول excess_mission
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'allowance_regulations_excess_mission'
        )
      `);
      
      if (!tableCheck.rows[0]?.exists) {
        console.error('❌ [getExcessMissionRegulations] جدول allowance_regulations_excess_mission وجود ندارد');
        return res.status(500).json({ message: 'جدول بخشنامه هزینه ماموریت مازاد وجود ندارد' });
      }
    } catch (checkError) {
      console.error('❌ [getExcessMissionRegulations] خطا در بررسی وجود جدول:', checkError);
      throw checkError;
    }

    // بررسی وجود جدول users
    let query = `
      SELECT arem.*
      FROM allowance_regulations_excess_mission arem
      WHERE (arem.is_active IS NULL OR arem.is_active = TRUE)
      ORDER BY arem.created_at DESC
    `;
    
    try {
      // اگر جدول users وجود دارد، JOIN را اضافه کن
      const usersTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      
      if (usersTableCheck.rows[0]?.exists) {
        query = `
          SELECT 
            arem.*,
            u1.name as created_by_name,
            u2.name as updated_by_name
          FROM allowance_regulations_excess_mission arem
          LEFT JOIN users u1 ON arem.created_by = u1.id
          LEFT JOIN users u2 ON arem.updated_by = u2.id
          WHERE (arem.is_active IS NULL OR arem.is_active = TRUE)
          ORDER BY arem.created_at DESC
        `;
        console.log('✅ [getExcessMissionRegulations] استفاده از JOIN با جدول users');
      } else {
        console.log('⚠️ [getExcessMissionRegulations] جدول users وجود ندارد، بدون JOIN');
      }
    } catch (joinError) {
      console.warn('⚠️ [getExcessMissionRegulations] خطا در بررسی جدول users، بدون JOIN ادامه می‌دهیم:', joinError.message);
    }

    console.log('🔍 [getExcessMissionRegulations] اجرای کوئری');
    const result = await pool.query(query);
    console.log('✅ [getExcessMissionRegulations] تعداد رکوردها:', result.rows.length);
    
    const regulations = result.rows.map(row => ({
      id: row.id,
      excessMissionCost: parseFloat(row.excess_mission_cost || 0),
      approvalDate: row.approval_date || null,
      documentPath: row.document_path || null,
      startDate: row.start_date || null,
      endDate: row.end_date || null,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by || null,
      createdByName: row.created_by_name || null,
      updatedBy: row.updated_by || null,
      updatedByName: row.updated_by_name || null,
    }));

    console.log('✅ [getExcessMissionRegulations] ارسال پاسخ با', regulations.length, 'رکورد');
    res.json(regulations);
  } catch (error) {
    console.error('❌ [getExcessMissionRegulations] Error:', error);
    console.error('❌ [getExcessMissionRegulations] Error Message:', error.message);
    console.error('❌ [getExcessMissionRegulations] Error Code:', error.code);
    console.error('❌ [getExcessMissionRegulations] Error Stack:', error.stack);
    res.status(500).json({ message: 'خطا در دریافت بخشنامه هزینه ماموریت مازاد: ' + error.message });
  }
}

/**
 * ذخیره بخشنامه هزینه ماموریت مازاد
 */
async function saveExcessMissionRegulation(req, res) {
  try {
    await createAllowanceRegulationTables();

    const {
      id,
      excessMissionCost,
      approvalDate,
      documentPath,
      startDate,
      endDate,
      isActive,
      userId,
    } = req.body;

    if (!excessMissionCost || !approvalDate || !startDate || !endDate) {
      return res.status(400).json({ message: 'تمام فیلدهای الزامی را پر کنید.' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ message: 'تاریخ شروع باید قبل از تاریخ پایان باشد.' });
    }

    const cost = parseFloat(excessMissionCost);
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({ message: 'هزینه ماموریت مازاد باید عدد مثبت باشد.' });
    }

    if (id) {
      // به‌روزرسانی
      await pool.query(`
        UPDATE allowance_regulations_excess_mission SET
          excess_mission_cost = $1,
          approval_date = $2,
          document_path = $3,
          start_date = $4,
          end_date = $5,
          is_active = $6,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [
        cost,
        approvalDate || null,
        documentPath || null,
        startDate || null,
        endDate || null,
        isActive !== false,
        userId || null,
        id,
      ]);

      res.json({ message: 'بخشنامه هزینه ماموریت مازاد به‌روزرسانی شد.', id });
    } else {
      // ایجاد جدید
      const newId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO allowance_regulations_excess_mission (
          id, excess_mission_cost, approval_date, document_path,
          start_date, end_date, is_active, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newId,
        cost,
        approvalDate || null,
        documentPath || null,
        startDate || null,
        endDate || null,
        isActive !== false,
        userId || null,
        userId || null,
      ]);

      res.json({ message: 'بخشنامه هزینه ماموریت مازاد ایجاد شد.', id: newId });
    }
  } catch (error) {
    console.error('❌ [saveExcessMissionRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در ذخیره بخشنامه هزینه ماموریت مازاد.' });
  }
}

/**
 * حذف بخشنامه هزینه ماموریت مازاد
 */
async function deleteExcessMissionRegulation(req, res) {
  try {
    const { id } = req.params;
    await createAllowanceRegulationTables();

    await pool.query(`
      UPDATE allowance_regulations_excess_mission 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'بخشنامه هزینه ماموریت مازاد حذف شد.' });
  } catch (error) {
    console.error('❌ [deleteExcessMissionRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در حذف بخشنامه هزینه ماموریت مازاد.' });
  }
}

/**
 * دریافت بخشنامه هزینه چندجا تخلیه
 */
async function getMultiUnloadRegulations(req, res) {
  try {
    await createAllowanceRegulationTables();

    // بررسی وجود جدول users
    let query = `
      SELECT armu.*
      FROM allowance_regulations_multi_unload armu
      WHERE armu.is_active = TRUE
      ORDER BY armu.created_at DESC
    `;
    
    try {
      // اگر جدول users وجود دارد، JOIN را اضافه کن
      const usersTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        )
      `);
      
      if (usersTableCheck.rows[0]?.exists) {
        query = `
          SELECT 
            armu.*,
            u1.name as created_by_name,
            u2.name as updated_by_name
          FROM allowance_regulations_multi_unload armu
          LEFT JOIN users u1 ON armu.created_by = u1.id
          LEFT JOIN users u2 ON armu.updated_by = u2.id
          WHERE armu.is_active = TRUE
          ORDER BY armu.created_at DESC
        `;
      }
    } catch (joinError) {
      console.warn('⚠️ [getMultiUnloadRegulations] جدول users وجود ندارد، بدون JOIN ادامه می‌دهیم:', joinError.message);
    }

    const result = await pool.query(query);
    console.log('✅ [getMultiUnloadRegulations] تعداد رکوردها:', result.rows.length);
    
    const regulations = result.rows.map(row => ({
      id: row.id,
      multiUnloadCost: parseFloat(row.multi_unload_cost || 0),
      approvalDate: row.approval_date || null,
      documentPath: row.document_path || null,
      startDate: row.start_date || null,
      endDate: row.end_date || null,
      isActive: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by || null,
      createdByName: row.created_by_name || null,
      updatedBy: row.updated_by || null,
      updatedByName: row.updated_by_name || null,
    }));

    res.json(regulations);
  } catch (error) {
    console.error('❌ [getMultiUnloadRegulations] Error:', error);
    console.error('❌ [getMultiUnloadRegulations] Error Stack:', error.stack);
    res.status(500).json({ message: 'خطا در دریافت بخشنامه هزینه چندجا تخلیه: ' + error.message });
  }
}

/**
 * ذخیره بخشنامه هزینه چندجا تخلیه
 */
async function saveMultiUnloadRegulation(req, res) {
  try {
    await createAllowanceRegulationTables();

    const {
      id,
      multiUnloadCost,
      approvalDate,
      documentPath,
      startDate,
      endDate,
      isActive,
      userId,
    } = req.body;

    if (!multiUnloadCost || !approvalDate || !startDate || !endDate) {
      return res.status(400).json({ message: 'تمام فیلدهای الزامی را پر کنید.' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ message: 'تاریخ شروع باید قبل از تاریخ پایان باشد.' });
    }

    const cost = parseFloat(multiUnloadCost);
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({ message: 'هزینه چندجا تخلیه باید عدد مثبت باشد.' });
    }

    if (id) {
      // به‌روزرسانی
      await pool.query(`
        UPDATE allowance_regulations_multi_unload SET
          multi_unload_cost = $1,
          approval_date = $2,
          document_path = $3,
          start_date = $4,
          end_date = $5,
          is_active = $6,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $8
      `, [
        cost,
        approvalDate || null,
        documentPath || null,
        startDate || null,
        endDate || null,
        isActive !== false,
        userId || null,
        id,
      ]);

      res.json({ message: 'بخشنامه هزینه چندجا تخلیه به‌روزرسانی شد.', id });
    } else {
      // ایجاد جدید
      const newId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO allowance_regulations_multi_unload (
          id, multi_unload_cost, approval_date, document_path,
          start_date, end_date, is_active, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newId,
        cost,
        approvalDate || null,
        documentPath || null,
        startDate || null,
        endDate || null,
        isActive !== false,
        userId || null,
        userId || null,
      ]);

      res.json({ message: 'بخشنامه هزینه چندجا تخلیه ایجاد شد.', id: newId });
    }
  } catch (error) {
    console.error('❌ [saveMultiUnloadRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در ذخیره بخشنامه هزینه چندجا تخلیه.' });
  }
}

/**
 * حذف بخشنامه هزینه چندجا تخلیه
 */
async function deleteMultiUnloadRegulation(req, res) {
  try {
    const { id } = req.params;
    await createAllowanceRegulationTables();

    await pool.query(`
      UPDATE allowance_regulations_multi_unload 
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ message: 'بخشنامه هزینه چندجا تخلیه حذف شد.' });
  } catch (error) {
    console.error('❌ [deleteMultiUnloadRegulation] Error:', error);
    res.status(500).json({ message: 'خطا در حذف بخشنامه هزینه چندجا تخلیه.' });
  }
}

/**
 * محاسبه اجرت بر اساس بخشنامه
 */
async function calculateAllowance(req, res) {
  try {
    const { vehicleType, kilometers } = req.query;

    if (!vehicleType || !kilometers) {
      return res.status(400).json({ message: 'vehicleType و kilometers الزامی است.' });
    }

    const km = parseInt(kilometers, 10);
    if (isNaN(km)) {
      return res.status(400).json({ message: 'kilometers باید عدد باشد.' });
    }

    await createAllowanceRegulationTables();

    // دریافت بخشنامه اجرت پیمایش فعال
    const mileageQuery = `
      SELECT * FROM allowance_regulations_mileage
      WHERE is_active = TRUE
        AND vehicle_type = $1
        AND min_kilometers <= $2
        AND max_kilometers >= $2
        AND (start_date IS NULL OR start_date <= CURRENT_DATE::text)
        AND (end_date IS NULL OR end_date >= CURRENT_DATE::text)
      ORDER BY min_kilometers DESC
      LIMIT 1
    `;

    const mileageResult = await pool.query(mileageQuery, [vehicleType, km]);

    if (mileageResult.rows.length === 0) {
      return res.json({ 
        allowance: 0,
        message: 'بخشنامه‌ای برای این مسافت پیدا نشد.'
      });
    }

    const mileageReg = mileageResult.rows[0];
    const totalAllowance = km * parseFloat(mileageReg.allowance_per_km);

    // دریافت بخشنامه هزینه غذا فعال
    const foodQuery = `
      SELECT * FROM allowance_regulations_food
      WHERE is_active = TRUE
        AND (start_date IS NULL OR start_date <= CURRENT_DATE::text)
        AND (end_date IS NULL OR end_date >= CURRENT_DATE::text)
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const foodResult = await pool.query(foodQuery);
    const foodCost = foodResult.rows.length > 0 ? parseFloat(foodResult.rows[0].food_cost || 0) : 0;

    // دریافت بخشنامه اجرت راننده کمکی فعال
    const helperQuery = `
      SELECT * FROM allowance_regulations_helper
      WHERE is_active = TRUE
        AND (start_date IS NULL OR start_date <= CURRENT_DATE::text)
        AND (end_date IS NULL OR end_date >= CURRENT_DATE::text)
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const helperResult = await pool.query(helperQuery);
    const helperAllowance = helperResult.rows.length > 0 ? parseFloat(helperResult.rows[0].helper_allowance || 0) : 0;

    res.json({
      allowance: totalAllowance,
      foodCost,
      helperAllowance,
      mileageRegulation: {
        id: mileageReg.id,
        vehicleType: mileageReg.vehicle_type,
        minKilometers: mileageReg.min_kilometers,
        maxKilometers: mileageReg.max_kilometers,
        allowancePerKm: parseFloat(mileageReg.allowance_per_km),
      }
    });
  } catch (error) {
    console.error('❌ [calculateAllowance] Error:', error);
    res.status(500).json({ message: 'خطا در محاسبه اجرت.' });
  }
}

/**
 * آپلود فایل بخشنامه
 */
const uploadDocument = upload.single('document');

async function uploadRegulationDocument(req, res) {
  uploadDocument(req, res, (err) => {
    if (err) {
      console.error('❌ [uploadRegulationDocument] Error:', err);
      return res.status(400).json({ message: err.message || 'خطا در آپلود فایل.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'فایلی آپلود نشده است.' });
    }

    const filePath = `/uploads/regulations/${req.file.filename}`;
    res.json({ 
      message: 'فایل با موفقیت آپلود شد.',
      filePath: filePath,
      fileName: req.file.filename
    });
  });
}

module.exports = {
  getFoodRegulations,
  getHelperRegulations,
  getMileageRegulations,
  getExcessMissionRegulations,
  getMultiUnloadRegulations,
  saveFoodRegulation,
  saveHelperRegulation,
  saveMileageRegulation,
  saveExcessMissionRegulation,
  saveMultiUnloadRegulation,
  deleteFoodRegulation,
  deleteHelperRegulation,
  deleteMileageRegulation,
  deleteExcessMissionRegulation,
  deleteMultiUnloadRegulation,
  calculateAllowance,
  uploadRegulationDocument,
  createAllowanceRegulationTables,
};
