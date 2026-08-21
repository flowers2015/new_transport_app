const crypto = require('crypto');
const pool = require('../db');

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function isGpsAdminEnabled() {
  const v = String(process.env.GPS_ADMIN_ENABLED ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
}

function requireGpsAdminEnabled(req, res, next) {
  if (!isGpsAdminEnabled()) {
    return res.status(503).json({
      enabled: false,
      message: 'مدیریت منابع GPS غیرفعال است (GPS_ADMIN_ENABLED=false).',
    });
  }
  next();
}

function mapModel(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapResource(row) {
  return {
    id: row.id,
    vehicleCode: row.vehicle_code,
    plateNumber: row.plate_number || '',
    assetKind: row.asset_kind,
    assetKindLabel: row.asset_kind === 'semi_trailer' ? 'نیمه یدک' : 'کشنده',
    imei: row.imei,
    gpsModelId: row.gps_model_id || null,
    gpsModelName: row.gps_model_name || null,
    notes: row.notes || '',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeImei(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits;
}

function normalizeAssetKind(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'semi_trailer' || v === 'semi-trailer' || v === 'trailer' || v === 'نیمه یدک' || v === 'نیمه\u200cیدک') {
    return 'semi_trailer';
  }
  return 'tractor';
}

async function getStatus(req, res) {
  return res.json({ enabled: isGpsAdminEnabled() });
}

async function listModels(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, is_active, created_at, updated_at
       FROM gps_device_models
       ORDER BY name ASC`
    );
    return res.json(rows.map(mapModel));
  } catch (err) {
    console.error('❌ [gps] listModels', err.message);
    return res.status(500).json({ message: 'خطا در دریافت مدل‌های GPS' });
  }
}

async function createModel(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'نام مدل الزامی است.' });
    if (name.length > 120) return res.status(400).json({ message: 'نام مدل خیلی بلند است.' });

    const id = newId();
    const { rows } = await pool.query(
      `INSERT INTO gps_device_models (id, name, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING id, name, is_active, created_at, updated_at`,
      [id, name]
    );
    return res.status(201).json(mapModel(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'این مدل از قبل وجود دارد.' });
    }
    console.error('❌ [gps] createModel', err.message);
    return res.status(500).json({ message: 'خطا در ایجاد مدل GPS' });
  }
}

async function updateModel(req, res) {
  try {
    const { id } = req.params;
    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    const isActive = req.body?.isActive;

    const fields = [];
    const values = [];
    let i = 1;
    if (name != null) {
      if (!name) return res.status(400).json({ message: 'نام مدل خالی است.' });
      fields.push(`name = $${i++}`);
      values.push(name);
    }
    if (typeof isActive === 'boolean') {
      fields.push(`is_active = $${i++}`);
      values.push(isActive);
    }
    if (!fields.length) return res.status(400).json({ message: 'چیزی برای ویرایش ارسال نشده.' });
    fields.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE gps_device_models SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING id, name, is_active, created_at, updated_at`,
      values
    );
    if (!rows.length) return res.status(404).json({ message: 'مدل یافت نشد.' });
    return res.json(mapModel(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'نام مدل تکراری است.' });
    }
    console.error('❌ [gps] updateModel', err.message);
    return res.status(500).json({ message: 'خطا در ویرایش مدل GPS' });
  }
}

async function listResources(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = 'WHERE 1=1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        r.vehicle_code ILIKE $1 OR r.plate_number ILIKE $1 OR r.imei ILIKE $1
        OR COALESCE(m.name, '') ILIKE $1
      )`;
    }
    const { rows } = await pool.query(
      `
      SELECT r.*, m.name AS gps_model_name
      FROM gps_resources r
      LEFT JOIN gps_device_models m ON m.id = r.gps_model_id
      ${where}
      ORDER BY r.vehicle_code ASC, r.asset_kind ASC
      `,
      params
    );
    return res.json(rows.map(mapResource));
  } catch (err) {
    console.error('❌ [gps] listResources', err.message);
    return res.status(500).json({ message: 'خطا در دریافت منابع GPS' });
  }
}

async function listVehicleOptions(req, res) {
  try {
    // فقط خودروهای سنگین و نیمه یدک‌ها برای انتخاب سریع
    const { rows } = await pool.query(
      `
      SELECT
        id,
        COALESCE(NULLIF(TRIM(vehicle_code), ''), NULLIF(TRIM(serial_number), ''), id) AS vehicle_code,
        CASE
          WHEN plate_part1 IS NOT NULL THEN
            CONCAT(plate_part1, plate_letter, plate_part2, '-', plate_city_code)
          ELSE ''
        END AS plate_number,
        COALESCE(NULLIF(TRIM(current_vehicle_type), ''), NULLIF(TRIM(type), ''), '') AS vehicle_type
      FROM vehicles
      WHERE deleted_at IS NULL
        AND (
          COALESCE(type, '') ILIKE '%سنگین%'
          OR COALESCE(type, '') ILIKE '%یدک%'
          OR COALESCE(type, '') ILIKE '%تریلر%'
          OR COALESCE(type, '') ILIKE '%کفی%'
          OR COALESCE(type, '') ILIKE '%تانکر%'
          OR COALESCE(current_vehicle_type, '') ILIKE '%کشنده%'
          OR COALESCE(current_vehicle_type, '') ILIKE '%تریلی%'
          OR COALESCE(current_vehicle_type, '') ILIKE '%یدک%'
        )
      ORDER BY vehicle_code ASC
      LIMIT 2000
      `
    );
    return res.json(
      rows.map((r) => ({
        id: r.id,
        vehicleCode: r.vehicle_code,
        plateNumber: r.plate_number || '',
        vehicleType: r.vehicle_type || '',
      }))
    );
  } catch (err) {
    console.warn('⚠️ [gps] listVehicleOptions fallback:', err.message);
    try {
      const { rows } = await pool.query(
        `
        SELECT
          id,
          COALESCE(NULLIF(TRIM(vehicle_code), ''), NULLIF(TRIM(serial_number), ''), id) AS vehicle_code,
          CASE
            WHEN plate_part1 IS NOT NULL THEN
              CONCAT(plate_part1, plate_letter, plate_part2, '-', plate_city_code)
            ELSE ''
          END AS plate_number,
          COALESCE(type, '') AS vehicle_type
        FROM vehicles
        WHERE deleted_at IS NULL
        ORDER BY vehicle_code ASC
        LIMIT 2000
        `
      );
      return res.json(
        rows.map((r) => ({
          id: r.id,
          vehicleCode: r.vehicle_code,
          plateNumber: r.plate_number || '',
          vehicleType: r.vehicle_type || '',
        }))
      );
    } catch (e2) {
      console.error('❌ [gps] listVehicleOptions', e2.message);
      return res.status(500).json({ message: 'خطا در دریافت لیست خودروها' });
    }
  }
}

async function createResource(req, res) {
  try {
    const vehicleCode = String(req.body?.vehicleCode || '').trim();
    const plateNumber = String(req.body?.plateNumber || '').trim();
    const assetKind = normalizeAssetKind(req.body?.assetKind);
    const imei = sanitizeImei(req.body?.imei);
    const gpsModelId = req.body?.gpsModelId ? String(req.body.gpsModelId).trim() : null;
    const notes = String(req.body?.notes || '').trim();

    if (!vehicleCode) return res.status(400).json({ message: 'کد خودرو الزامی است.' });
    if (!imei) return res.status(400).json({ message: 'IMEI الزامی است و باید فقط عدد باشد.' });
    if (imei.length < 8 || imei.length > 20) {
      return res.status(400).json({ message: 'طول IMEI باید بین ۸ تا ۲۰ رقم باشد.' });
    }

    const id = newId();
    const { rows } = await pool.query(
      `
      INSERT INTO gps_resources (
        id, vehicle_code, plate_number, asset_kind, imei, gps_model_id, notes, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
      RETURNING *
      `,
      [id, vehicleCode, plateNumber || null, assetKind, imei, gpsModelId || null, notes || null]
    );

    let modelName = null;
    if (gpsModelId) {
      const m = await pool.query(`SELECT name FROM gps_device_models WHERE id = $1`, [gpsModelId]);
      modelName = m.rows[0]?.name || null;
    }
    return res.status(201).json(mapResource({ ...rows[0], gps_model_name: modelName }));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'IMEI یا ترکیب کد خودرو/نوع تکراری است.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ message: 'IMEI باید فقط عدد باشد.' });
    }
    console.error('❌ [gps] createResource', err.message);
    return res.status(500).json({ message: 'خطا در ثبت منبع GPS' });
  }
}

async function updateResource(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const fields = [];
    const values = [];
    let i = 1;

    if (body.vehicleCode != null) {
      const vehicleCode = String(body.vehicleCode).trim();
      if (!vehicleCode) return res.status(400).json({ message: 'کد خودرو خالی است.' });
      fields.push(`vehicle_code = $${i++}`);
      values.push(vehicleCode);
    }
    if (body.plateNumber != null) {
      fields.push(`plate_number = $${i++}`);
      values.push(String(body.plateNumber).trim() || null);
    }
    if (body.assetKind != null) {
      fields.push(`asset_kind = $${i++}`);
      values.push(normalizeAssetKind(body.assetKind));
    }
    if (body.imei != null) {
      const imei = sanitizeImei(body.imei);
      if (!imei) return res.status(400).json({ message: 'IMEI باید فقط عدد باشد.' });
      if (imei.length < 8 || imei.length > 20) {
        return res.status(400).json({ message: 'طول IMEI باید بین ۸ تا ۲۰ رقم باشد.' });
      }
      fields.push(`imei = $${i++}`);
      values.push(imei);
    }
    if (body.gpsModelId !== undefined) {
      fields.push(`gps_model_id = $${i++}`);
      values.push(body.gpsModelId ? String(body.gpsModelId).trim() : null);
    }
    if (body.notes != null) {
      fields.push(`notes = $${i++}`);
      values.push(String(body.notes).trim() || null);
    }
    if (typeof body.isActive === 'boolean') {
      fields.push(`is_active = $${i++}`);
      values.push(body.isActive);
    }

    if (!fields.length) return res.status(400).json({ message: 'چیزی برای ویرایش ارسال نشده.' });
    fields.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await pool.query(
      `
      UPDATE gps_resources SET ${fields.join(', ')}
      WHERE id = $${i}
      RETURNING *
      `,
      values
    );
    if (!rows.length) return res.status(404).json({ message: 'منبع GPS یافت نشد.' });

    let modelName = null;
    if (rows[0].gps_model_id) {
      const m = await pool.query(`SELECT name FROM gps_device_models WHERE id = $1`, [rows[0].gps_model_id]);
      modelName = m.rows[0]?.name || null;
    }
    return res.json(mapResource({ ...rows[0], gps_model_name: modelName }));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'IMEI یا ترکیب کد خودرو/نوع تکراری است.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ message: 'IMEI باید فقط عدد باشد.' });
    }
    console.error('❌ [gps] updateResource', err.message);
    return res.status(500).json({ message: 'خطا در ویرایش منبع GPS' });
  }
}

async function deleteResource(req, res) {
  try {
    const { id } = req.params;
    // soft-delete برای برگشت آسان‌تر
    const { rows } = await pool.query(
      `UPDATE gps_resources SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'منبع GPS یافت نشد.' });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('❌ [gps] deleteResource', err.message);
    return res.status(500).json({ message: 'خطا در حذف منبع GPS' });
  }
}

module.exports = {
  isGpsAdminEnabled,
  requireGpsAdminEnabled,
  getStatus,
  listModels,
  createModel,
  updateModel,
  listResources,
  listVehicleOptions,
  createResource,
  updateResource,
  deleteResource,
};
