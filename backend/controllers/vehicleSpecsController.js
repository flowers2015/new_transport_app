/**
 * کنترلر مشخصات خودرو
 * مدیریت برندها، مدل‌ها و مشخصات فنی خودروها
 */

const pool = require('../db');
const crypto = require('crypto');

// دریافت همه مشخصات خودرو با فیلتر
async function getAllVehicleSpecs(req, res) {
  try {
    const { category, brand, model, isActive } = req.query;
    
    const { vehicleType } = req.query;
    
    // بررسی وجود ستون‌های جدید
    let hasFuelColumns = false;
    try {
      const checkColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vehicle_specifications' 
        AND column_name IN ('fuel_consumption_percentage', 'fuel_price_per_liter')
      `);
      hasFuelColumns = checkColumns.rows.length === 2;
    } catch (e) {
      hasFuelColumns = false;
    }
    
    let query;
    if (hasFuelColumns) {
      query = `
        SELECT 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          fuel_consumption_percentage AS "fuelConsumptionPercentage",
          fuel_price_per_liter AS "fuelPricePerLiter",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM vehicle_specifications
        WHERE 1=1
      `;
    } else {
      query = `
        SELECT 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          NULL AS "fuelConsumptionPercentage",
          NULL AS "fuelPricePerLiter",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM vehicle_specifications
        WHERE 1=1
      `;
    }
    
    const params = [];
    let paramIndex = 1;
    
    if (vehicleType) {
      query += ` AND vehicle_type = $${paramIndex++}`;
      params.push(vehicleType);
    }
    if (category) {
      query += ` AND vehicle_category = $${paramIndex++}`;
      params.push(category);
    }
    if (brand) {
      query += ` AND brand = $${paramIndex++}`;
      params.push(brand);
    }
    if (model) {
      query += ` AND model = $${paramIndex++}`;
      params.push(model);
    }
    if (isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(isActive === 'true');
    }
    
    query += ` ORDER BY vehicle_type, vehicle_category, brand, model, tip`;
    
    let rows;
    try {
      const result = await pool.query(query, params);
      rows = result.rows;
    } catch (queryError) {
      // اگر خطای ستون بود، از fallback استفاده کن
      if (queryError.code === '42703') {
        console.warn('⚠️ [getAllVehicleSpecs] Column error, using fallback query');
        // ساخت fallback query بدون ستون‌های جدید
        let fallbackQuery = `
          SELECT 
            id, 
            vehicle_type AS "vehicleType",
            vehicle_category AS "vehicleCategory",
            brand,
            model,
            tip,
            fuel_type AS "fuelType",
            cylinder_count AS "cylinderCount",
            axle_count AS "axleCount",
            wheel_count AS "wheelCount",
            capacity,
            engine_type AS "engineType",
            description,
            NULL AS "fuelConsumptionPercentage",
            NULL AS "fuelPricePerLiter",
            is_active AS "isActive",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM vehicle_specifications
          WHERE 1=1
        `;
        const fallbackParams = [];
        let fallbackParamIndex = 1;
        
        if (vehicleType) {
          fallbackQuery += ` AND vehicle_type = $${fallbackParamIndex++}`;
          fallbackParams.push(vehicleType);
        }
        if (category) {
          fallbackQuery += ` AND vehicle_category = $${fallbackParamIndex++}`;
          fallbackParams.push(category);
        }
        if (brand) {
          fallbackQuery += ` AND brand = $${fallbackParamIndex++}`;
          fallbackParams.push(brand);
        }
        if (model) {
          fallbackQuery += ` AND model = $${fallbackParamIndex++}`;
          fallbackParams.push(model);
        }
        if (isActive !== undefined) {
          fallbackQuery += ` AND is_active = $${fallbackParamIndex++}`;
          fallbackParams.push(isActive === 'true');
        }
        
        fallbackQuery += ` ORDER BY vehicle_type, vehicle_category, brand, model, tip`;
        
        const fallbackResult = await pool.query(fallbackQuery, fallbackParams);
        rows = fallbackResult.rows;
      } else {
        throw queryError;
      }
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching vehicle specs:', error);
    res.status(500).json({ message: 'خطا در دریافت مشخصات خودرو' });
  }
}

// دریافت لیست انواع خودرو (vehicle_type)
async function getVehicleTypes(req, res) {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT DISTINCT vehicle_type AS "vehicleType"
      FROM vehicle_specifications 
      WHERE is_active = true
    `;
    const params = [];
    
    if (category) {
      query += ` AND vehicle_category = $1`;
      params.push(category);
    }
    
    query += ` ORDER BY vehicle_type`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => r.vehicleType));
  } catch (error) {
    console.error('Error fetching vehicle types:', error);
    res.status(500).json({ message: 'خطا در دریافت انواع خودرو' });
  }
}

// دریافت لیست برندها (یونیک)
async function getBrands(req, res) {
  try {
    const { category, vehicleType } = req.query;
    
    let query = `
      SELECT DISTINCT brand 
      FROM vehicle_specifications 
      WHERE is_active = true
    `;
    const params = [];
    let paramIndex = 1;
    
    if (vehicleType) {
      query += ` AND vehicle_type = $${paramIndex++}`;
      params.push(vehicleType);
    }
    if (category) {
      query += ` AND vehicle_category = $${paramIndex++}`;
      params.push(category);
    }
    
    query += ` ORDER BY brand`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => r.brand));
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ message: 'خطا در دریافت برندها' });
  }
}

// دریافت مدل‌های یک برند
async function getModels(req, res) {
  try {
    const { category, brand, vehicleType } = req.query;
    
    if (!brand) {
      return res.status(400).json({ message: 'برند الزامی است' });
    }
    
    let query = `
      SELECT DISTINCT model 
      FROM vehicle_specifications 
      WHERE brand = $1 AND is_active = true
    `;
    const params = [brand];
    let paramIndex = 2;
    
    if (vehicleType) {
      query += ` AND vehicle_type = $${paramIndex++}`;
      params.push(vehicleType);
    }
    if (category) {
      query += ` AND vehicle_category = $${paramIndex++}`;
      params.push(category);
    }
    
    query += ` ORDER BY model`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => r.model));
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ message: 'خطا در دریافت مدل‌ها' });
  }
}

// دریافت تیپ‌های یک مدل با مشخصات کامل
async function getTips(req, res) {
  try {
    const { category, brand, model, vehicleType } = req.query;
    
    if (!brand || !model) {
      return res.status(400).json({ message: 'برند و مدل الزامی است' });
    }
    
    let query = `
      SELECT 
        id,
        vehicle_type AS "vehicleType",
        tip,
        fuel_type AS "fuelType",
        cylinder_count AS "cylinderCount",
        axle_count AS "axleCount",
        wheel_count AS "wheelCount",
        capacity,
        engine_type AS "engineType",
        description
      FROM vehicle_specifications 
      WHERE brand = $1 AND model = $2 AND is_active = true
    `;
    const params = [brand, model];
    let paramIndex = 3;
    
    if (vehicleType) {
      query += ` AND vehicle_type = $${paramIndex++}`;
      params.push(vehicleType);
    }
    if (category) {
      query += ` AND vehicle_category = $${paramIndex++}`;
      params.push(category);
    }
    
    query += ` ORDER BY tip`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tips:', error);
    res.status(500).json({ message: 'خطا در دریافت تیپ‌ها' });
  }
}

// دریافت یک مشخصات با ID
async function getVehicleSpecById(req, res) {
  try {
    const { id } = req.params;
    
    // بررسی وجود ستون‌های جدید
    let hasFuelColumns = false;
    try {
      const checkColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vehicle_specifications' 
        AND column_name IN ('fuel_consumption_percentage', 'fuel_price_per_liter')
      `);
      hasFuelColumns = checkColumns.rows.length === 2;
    } catch (e) {
      hasFuelColumns = false;
    }
    
    let query;
    if (hasFuelColumns) {
      query = `
        SELECT 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          fuel_consumption_percentage AS "fuelConsumptionPercentage",
          fuel_price_per_liter AS "fuelPricePerLiter",
          is_active AS "isActive"
        FROM vehicle_specifications
        WHERE id = $1
      `;
    } else {
      query = `
        SELECT 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          NULL AS "fuelConsumptionPercentage",
          NULL AS "fuelPricePerLiter",
          is_active AS "isActive"
        FROM vehicle_specifications
        WHERE id = $1
      `;
    }
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'مشخصات یافت نشد' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching vehicle spec:', error);
    res.status(500).json({ message: 'خطا در دریافت مشخصات' });
  }
}

// ایجاد مشخصات جدید
async function createVehicleSpec(req, res) {
  try {
    const {
      vehicleType,
      vehicleCategory,
      brand,
      model,
      tip,
      fuelType,
      cylinderCount,
      axleCount,
      wheelCount,
      capacity,
      engineType,
      description
    } = req.body;
    
    // بررسی وجود ستون vehicle_type
    let hasVehicleTypeColumn = false;
    try {
      const checkColumn = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vehicle_specifications' AND column_name = 'vehicle_type'
      `);
      hasVehicleTypeColumn = checkColumn.rows.length > 0;
    } catch (e) {
      hasVehicleTypeColumn = false;
    }
    
    // Validation: اگر vehicle_type وجود دارد، باید ارسال شود
    if (hasVehicleTypeColumn) {
      if (!vehicleType || !vehicleCategory || !brand || !model) {
        return res.status(400).json({ message: 'نوع خودرو، دسته‌بندی، برند و مدل الزامی است' });
      }
    } else {
      if (!vehicleCategory || !brand || !model) {
        return res.status(400).json({ message: 'دسته‌بندی، برند و مدل الزامی است' });
      }
    }
    
    const id = crypto.randomUUID();
    
    let query, params;
    if (hasVehicleTypeColumn) {
      query = `
        INSERT INTO vehicle_specifications 
        (id, vehicle_type, vehicle_category, brand, model, tip, fuel_type, cylinder_count, axle_count, wheel_count, capacity, engine_type, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          is_active AS "isActive"
      `;
      params = [id, vehicleType, vehicleCategory, brand, model, tip || null, fuelType || null, cylinderCount || null, axleCount || null, wheelCount || null, capacity || null, engineType || null, description || null];
    } else {
      query = `
        INSERT INTO vehicle_specifications 
        (id, vehicle_category, brand, model, tip, fuel_type, cylinder_count, axle_count, wheel_count, capacity, engine_type, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING 
          id, 
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          is_active AS "isActive"
      `;
      params = [id, vehicleCategory, brand, model, tip || null, fuelType || null, cylinderCount || null, axleCount || null, wheelCount || null, capacity || null, engineType || null, description || null];
    }
    
    const { rows } = await pool.query(query, params);
    
    // اگر vehicle_type وجود ندارد، null برگردان
    if (!hasVehicleTypeColumn && rows[0]) {
      rows[0].vehicleType = null;
    }
    
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return res.status(400).json({ message: 'این ترکیب نوع/دسته‌بندی/برند/مدل/تیپ قبلاً ثبت شده است' });
    }
    if (error.code === '42703') { // undefined column
      console.error('⚠️ [createVehicleSpec] Column error:', error.message);
      // اگر خطای ستون بود، دوباره بدون vehicle_type امتحان کنیم
      if (error.message.includes('vehicle_type')) {
        // Retry without vehicle_type
        try {
          const id = crypto.randomUUID();
          const { vehicleCategory, brand, model, tip, fuelType, cylinderCount, axleCount, wheelCount, capacity, engineType, description } = req.body;
          
          const { rows } = await pool.query(`
            INSERT INTO vehicle_specifications 
            (id, vehicle_category, brand, model, tip, fuel_type, cylinder_count, axle_count, wheel_count, capacity, engine_type, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING 
              id, 
              vehicle_category AS "vehicleCategory",
              brand,
              model,
              tip,
              fuel_type AS "fuelType",
              cylinder_count AS "cylinderCount",
              axle_count AS "axleCount",
              wheel_count AS "wheelCount",
              capacity,
              engine_type AS "engineType",
              description,
              is_active AS "isActive"
          `, [id, vehicleCategory, brand, model, tip || null, fuelType || null, cylinderCount || null, axleCount || null, wheelCount || null, capacity || null, engineType || null, description || null]);
          
          rows[0].vehicleType = null;
          return res.status(201).json(rows[0]);
        } catch (retryError) {
          console.error('❌ [createVehicleSpec] Retry also failed:', retryError);
          return res.status(500).json({ message: 'خطا در ایجاد مشخصات: ' + retryError.message });
        }
      }
    }
    console.error('Error creating vehicle spec:', error);
    res.status(500).json({ message: 'خطا در ایجاد مشخصات: ' + error.message });
  }
}

// ویرایش مشخصات
async function updateVehicleSpec(req, res) {
  try {
    const { id } = req.params;
    const {
      vehicleType,
      vehicleCategory,
      brand,
      model,
      tip,
      fuelType,
      cylinderCount,
      axleCount,
      wheelCount,
      capacity,
      engineType,
      description,
      fuelConsumptionPercentage,
      fuelPricePerLiter,
      isActive
    } = req.body;
    
    // بررسی وجود ستون‌های جدید
    let hasFuelColumns = false;
    try {
      const checkColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vehicle_specifications' 
        AND column_name IN ('fuel_consumption_percentage', 'fuel_price_per_liter')
      `);
      hasFuelColumns = checkColumns.rows.length === 2;
    } catch (e) {
      hasFuelColumns = false;
    }
    
    // ساخت dynamic update query - فقط فیلدهای ارسال شده را به‌روز می‌کند
    const updateFields = [];
    const updateParams = [id];
    let paramIndex = 2;
    
    // فقط فیلدهایی که ارسال شده‌اند را اضافه کن
    if (vehicleType !== undefined) {
      updateFields.push(`vehicle_type = $${paramIndex++}`);
      updateParams.push(vehicleType);
    }
    if (vehicleCategory !== undefined) {
      updateFields.push(`vehicle_category = $${paramIndex++}`);
      updateParams.push(vehicleCategory);
    }
    if (brand !== undefined) {
      updateFields.push(`brand = $${paramIndex++}`);
      updateParams.push(brand);
    }
    if (model !== undefined) {
      updateFields.push(`model = $${paramIndex++}`);
      updateParams.push(model);
    }
    if (tip !== undefined) {
      updateFields.push(`tip = $${paramIndex++}`);
      updateParams.push(tip);
    }
    if (fuelType !== undefined) {
      updateFields.push(`fuel_type = $${paramIndex++}`);
      updateParams.push(fuelType);
    }
    if (cylinderCount !== undefined) {
      updateFields.push(`cylinder_count = $${paramIndex++}`);
      updateParams.push(cylinderCount);
    }
    if (axleCount !== undefined) {
      updateFields.push(`axle_count = $${paramIndex++}`);
      updateParams.push(axleCount);
    }
    if (wheelCount !== undefined) {
      updateFields.push(`wheel_count = $${paramIndex++}`);
      updateParams.push(wheelCount);
    }
    if (capacity !== undefined) {
      updateFields.push(`capacity = $${paramIndex++}`);
      updateParams.push(capacity);
    }
    if (engineType !== undefined) {
      updateFields.push(`engine_type = $${paramIndex++}`);
      updateParams.push(engineType);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateParams.push(description);
    }
    if (hasFuelColumns) {
      if (fuelConsumptionPercentage !== undefined) {
        // Validation: بررسی محدوده مجاز (0 تا 999999.99)
        const percentage = parseFloat(fuelConsumptionPercentage);
        if (isNaN(percentage) || percentage < 0 || percentage > 999999.99) {
          return res.status(400).json({ 
            message: 'درصد مصرف سوخت باید بین 0 تا 999999.99 باشد' 
          });
        }
        updateFields.push(`fuel_consumption_percentage = $${paramIndex++}`);
        updateParams.push(percentage);
      }
      if (fuelPricePerLiter !== undefined) {
        // Validation: بررسی محدوده مجاز (0 تا 99999999.99)
        const price = parseFloat(fuelPricePerLiter);
        if (isNaN(price) || price < 0 || price > 99999999.99) {
          return res.status(400).json({ 
            message: 'مبلغ سوخت باید بین 0 تا 99999999.99 باشد' 
          });
        }
        updateFields.push(`fuel_price_per_liter = $${paramIndex++}`);
        updateParams.push(price);
      }
    }
    if (isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateParams.push(isActive);
    }
    
    // همیشه updated_at را به‌روز کن
    updateFields.push(`updated_at = NOW()`);
    
    if (updateFields.length === 1) {
      // فقط updated_at - هیچ فیلدی برای به‌روزرسانی نیست
      return res.status(400).json({ message: 'هیچ فیلدی برای به‌روزرسانی ارسال نشده است' });
    }
    
    let returnQuery;
    if (hasFuelColumns) {
      returnQuery = `
        RETURNING 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          fuel_consumption_percentage AS "fuelConsumptionPercentage",
          fuel_price_per_liter AS "fuelPricePerLiter",
          is_active AS "isActive"
      `;
    } else {
      returnQuery = `
        RETURNING 
          id, 
          vehicle_type AS "vehicleType",
          vehicle_category AS "vehicleCategory",
          brand,
          model,
          tip,
          fuel_type AS "fuelType",
          cylinder_count AS "cylinderCount",
          axle_count AS "axleCount",
          wheel_count AS "wheelCount",
          capacity,
          engine_type AS "engineType",
          description,
          is_active AS "isActive"
      `;
    }
    
    const updateQuery = `
      UPDATE vehicle_specifications SET
        ${updateFields.join(', ')}
      WHERE id = $1
      ${returnQuery}
    `;
    
    const { rows } = await pool.query(updateQuery, updateParams);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'مشخصات یافت نشد' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'این ترکیب نوع/دسته‌بندی/برند/مدل/تیپ قبلاً ثبت شده است' });
    }
    if (error.code === '22003') {
      // Numeric field overflow
      return res.status(400).json({ 
        message: 'مقدار وارد شده برای درصد مصرف سوخت یا مبلغ سوخت خیلی بزرگ است. لطفاً مقدار کوچکتری وارد کنید.' 
      });
    }
    console.error('Error updating vehicle spec:', error);
    res.status(500).json({ message: 'خطا در ویرایش مشخصات: ' + (error.message || 'خطای نامشخص') });
  }
}

// حذف مشخصات
async function deleteVehicleSpec(req, res) {
  try {
    const { id } = req.params;
    
    const { rowCount } = await pool.query('DELETE FROM vehicle_specifications WHERE id = $1', [id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ message: 'مشخصات یافت نشد' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting vehicle spec:', error);
    res.status(500).json({ message: 'خطا در حذف مشخصات' });
  }
}

// دریافت دسته‌بندی‌ها
async function getCategories(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT vehicle_category AS "vehicleCategory"
      FROM vehicle_specifications 
      WHERE is_active = true
      ORDER BY vehicle_category
    `);
    res.json(rows.map(r => r.vehicleCategory));
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'خطا در دریافت دسته‌بندی‌ها' });
  }
}

module.exports = {
  getAllVehicleSpecs,
  getVehicleTypes,
  getBrands,
  getModels,
  getTips,
  getVehicleSpecById,
  createVehicleSpec,
  updateVehicleSpec,
  deleteVehicleSpec,
  getCategories
};

