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
    
    let query = `
      SELECT 
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
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM vehicle_specifications
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
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
    
    query += ` ORDER BY vehicle_category, brand, model, tip`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching vehicle specs:', error);
    res.status(500).json({ message: 'خطا در دریافت مشخصات خودرو' });
  }
}

// دریافت لیست برندها (یونیک)
async function getBrands(req, res) {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT DISTINCT brand 
      FROM vehicle_specifications 
      WHERE is_active = true
    `;
    const params = [];
    
    if (category) {
      query += ` AND vehicle_category = $1`;
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
    const { category, brand } = req.query;
    
    if (!brand) {
      return res.status(400).json({ message: 'برند الزامی است' });
    }
    
    let query = `
      SELECT DISTINCT model 
      FROM vehicle_specifications 
      WHERE brand = $1 AND is_active = true
    `;
    const params = [brand];
    
    if (category) {
      query += ` AND vehicle_category = $2`;
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
    const { category, brand, model } = req.query;
    
    if (!brand || !model) {
      return res.status(400).json({ message: 'برند و مدل الزامی است' });
    }
    
    let query = `
      SELECT 
        id,
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
    
    if (category) {
      query += ` AND vehicle_category = $3`;
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
    
    const { rows } = await pool.query(`
      SELECT 
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
      FROM vehicle_specifications
      WHERE id = $1
    `, [id]);
    
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
    
    if (!vehicleCategory || !brand || !model) {
      return res.status(400).json({ message: 'دسته‌بندی، برند و مدل الزامی است' });
    }
    
    const id = crypto.randomUUID();
    
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
    
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return res.status(400).json({ message: 'این ترکیب دسته‌بندی/برند/مدل/تیپ قبلاً ثبت شده است' });
    }
    console.error('Error creating vehicle spec:', error);
    res.status(500).json({ message: 'خطا در ایجاد مشخصات' });
  }
}

// ویرایش مشخصات
async function updateVehicleSpec(req, res) {
  try {
    const { id } = req.params;
    const {
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
      isActive
    } = req.body;
    
    const { rows } = await pool.query(`
      UPDATE vehicle_specifications SET
        vehicle_category = COALESCE($2, vehicle_category),
        brand = COALESCE($3, brand),
        model = COALESCE($4, model),
        tip = $5,
        fuel_type = $6,
        cylinder_count = $7,
        axle_count = $8,
        wheel_count = $9,
        capacity = $10,
        engine_type = $11,
        description = $12,
        is_active = COALESCE($13, is_active),
        updated_at = NOW()
      WHERE id = $1
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
    `, [id, vehicleCategory, brand, model, tip, fuelType, cylinderCount, axleCount, wheelCount, capacity, engineType, description, isActive]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'مشخصات یافت نشد' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'این ترکیب دسته‌بندی/برند/مدل/تیپ قبلاً ثبت شده است' });
    }
    console.error('Error updating vehicle spec:', error);
    res.status(500).json({ message: 'خطا در ویرایش مشخصات' });
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
  getBrands,
  getModels,
  getTips,
  getVehicleSpecById,
  createVehicleSpec,
  updateVehicleSpec,
  deleteVehicleSpec,
  getCategories
};

