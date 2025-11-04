const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js
const crypto = require('crypto');
const {
  logFreightHistory,
  compareObjects,
  compareDestinations,
  calculateTotalFreightCost,
  generateChangeDescription
} = require('../services/freightHistoryService');
const { formatJalali } = require('../utils/jalali');

/**
 * تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14
 * اگر Date object است، آن را به Jalali string تبدیل می‌کند
 * چون PostgreSQL ممکن است `/` را به `-` تبدیل کند یا Date object برگرداند
 */
function normalizeJalaliDate(dateInput) {
  if (!dateInput) {
    return dateInput;
  }
  
  // اگر Date object است (از PostgreSQL برگشته)، آن را به Jalali string تبدیل کن
  if (dateInput instanceof Date) {
    const jalaliStr = formatJalali(dateInput);
    console.log(`📅 [normalizeJalaliDate] Date object converted: "${dateInput.toISOString()}" → "${jalaliStr}"`);
    return jalaliStr;
  }
  
  // اگر string است
  if (typeof dateInput === 'string') {
    const original = dateInput;
    // اگر فرمت YYYY-MM-DD دارد، به YYYY/MM/DD تبدیل کن
    const result = dateInput.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, '$1/$2/$3');
    if (original !== result) {
      console.log(`📅 [normalizeJalaliDate] String converted: "${original}" → "${result}"`);
    }
    return result;
  }
  
  console.log(`📅 [normalizeJalaliDate] Unknown type:`, { dateInput, type: typeof dateInput });
  return dateInput;
}

/**
 * اطمینان از اینکه تاریخ با `/` ذخیره شود (نه `-`)
 */
function ensureJalaliDateFormat(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    console.log(`📅 [ensureJalaliDateFormat] Input is not string:`, { dateStr, type: typeof dateStr });
    return dateStr;
  }
  const original = dateStr;
  // تبدیل `-` به `/` برای اطمینان از فرمت یکسان
  const result = dateStr.replace(/-/g, '/');
  if (original !== result) {
    console.log(`📅 [ensureJalaliDateFormat] Converted: "${original}" → "${result}"`);
  }
  return result;
}

/**
 * Fetches all freight announcements with related information.
 */
async function getFreightAnnouncements(req, res) {
  try {
    // اگر includeLeftover=true باشد، Leftover را هم شامل می‌کند (برای صفحه برنامه ریزی)
    const { includeLeftover } = req.query;
    
    let whereClause = "WHERE fa.status NOT IN ('Finalized'";
    if (includeLeftover !== 'true') {
      whereClause += ", 'Leftover'";
    }
    whereClause += ")";
    
    console.log(`🔍 [getFreightAnnouncements] includeLeftover=${includeLeftover}, whereClause=${whereClause}`);
    
    const { rows } = await pool.query(`
      SELECT 
        fa.*,
        fa.rejection_reason,
        d.name as assigned_driver_name,
        d.employee_id as assigned_driver_employee_id,
        v.model as assigned_vehicle_model,
        v.brand as assigned_vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
      FROM freight_announcements fa
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      ${whereClause}
      ORDER BY fa.created_at DESC
    `);
    
    console.log(`📊 [getFreightAnnouncements] Found ${rows.length} announcements. Leftover count: ${rows.filter(r => r.status === 'Leftover').length}`);
    
    // Fetch destinations for each announcement and convert dates
    for (let announcement of rows) {
      const destRows = await pool.query(
        'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1',
        [announcement.id]
      );
      announcement.destinations = destRows.rows;
      
      // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
      if (announcement.loading_date) {
        const before = announcement.loading_date;
        announcement.loading_date = normalizeJalaliDate(announcement.loading_date);
        if (before !== announcement.loading_date) {
          console.log(`📅 [getFreightAnnouncements] ID ${announcement.id}: "${before}" → "${announcement.loading_date}"`);
        }
      }
    }
    
    // لاگ نمونه برای بررسی
    if (rows.length > 0) {
      console.log(`📅 [getFreightAnnouncements] Sample first item:`, {
        id: rows[0].id,
        loading_date: rows[0].loading_date,
        type: typeof rows[0].loading_date
      });
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Failed to get freight announcements:', error);
    res.status(500).json({ message: 'Internal server error while fetching freight announcements.' });
  }
}

/**
 * Fetches a single freight announcement by ID.
 */
async function getFreightAnnouncementById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Freight announcement not found.' });
    }
    
    // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
    const announcement = rows[0];
    console.log(`📅 [getFreightAnnouncementById] ID ${id}: Loading from DB:`, {
      loading_date: announcement.loading_date,
      type: typeof announcement.loading_date
    });
    
    if (announcement.loading_date) {
      const before = announcement.loading_date;
      announcement.loading_date = normalizeJalaliDate(announcement.loading_date);
      console.log(`📅 [getFreightAnnouncementById] ID ${id}: After normalization:`, {
        before,
        after: announcement.loading_date
      });
    }
    
    res.json(announcement);
  } catch (error) {
    console.error(`Failed to get freight announcement ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the freight announcement.' });
  }
}

/**
 * Updates an existing freight announcement. Supports updating status and core fields.
 * If destinations are provided, replaces existing destinations.
 * با ثبت کامل تغییرات در تاریخچه
 */
async function updateFreightAnnouncement(req, res) {
  const { id } = req.params;
  try {
    const {
      loadingDate,
      lineType,
      cargoValue,
      vehicleType,
      notes,
      status,
      destinations,
      originCity,
      brand,
      representativeType,
      representativeName,
      cartonCount,
      priority,
      products,
      platformArrivalTime,
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. گرفتن رکورد قبلی (برای مقایسه)
      const oldRecordQuery = await client.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
      if (oldRecordQuery.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Freight announcement not found.' });
      }
      const oldRecord = oldRecordQuery.rows[0];
      
      // گرفتن مقاصد قبلی
      const oldDestQuery = await client.query(
        'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC',
        [id]
      );
      const oldDestinations = oldDestQuery.rows;

      // 2. آپدیت فیلدهای اصلی
      const fields = [];
      const values = [];
      let idx = 1;
      
      // اطمینان از فرمت `/` برای ذخیره در دیتابیس
      if (loadingDate) { 
        console.log(`📅 [updateFreightAnnouncement] ID ${id}: Received from frontend:`, {
          loadingDate,
          type: typeof loadingDate
        });
        const normalizedDate = ensureJalaliDateFormat(loadingDate);
        console.log(`📅 [updateFreightAnnouncement] ID ${id}: Normalized for DB:`, {
          normalizedDate,
          willSave: normalizedDate
        });
        fields.push(`loading_date = $${idx++}`); 
        values.push(normalizedDate); 
      }
      if (lineType) { fields.push(`line_type = $${idx++}`); values.push(lineType); }
      if (cargoValue !== undefined) { fields.push(`cargo_value = $${idx++}`); values.push(cargoValue); }
      if (vehicleType) { fields.push(`vehicle_type = $${idx++}`); values.push(vehicleType); }
      
      // فیلدهای اضافی بستنی
      if (originCity !== undefined) { fields.push(`origin_city = $${idx++}`); values.push(originCity); }
      if (brand !== undefined) { fields.push(`brand = $${idx++}`); values.push(brand); }
      if (representativeType !== undefined) { fields.push(`representative_type = $${idx++}`); values.push(representativeType); }
      if (representativeName !== undefined) { fields.push(`representative_name = $${idx++}`); values.push(representativeName); }
      if (cartonCount !== undefined) { fields.push(`carton_count = $${idx++}`); values.push(cartonCount); }
      if (priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(priority); }
      if (products !== undefined) { 
        fields.push(`products = $${idx++}`); 
        values.push(Array.isArray(products) ? JSON.stringify(products) : '[]'); 
      }
      
      // فیلدهای پاستوریزه و لبنیات
      if (platformArrivalTime !== undefined) { fields.push(`platform_arrival_time = $${idx++}`); values.push(platformArrivalTime); }
      
      // یادداشت
      if (notes !== undefined) {
        const notesColumn = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_announcements' AND column_name = 'notes'`
        );
        if (notesColumn.rowCount > 0) {
          fields.push(`notes = $${idx++}`);
          values.push(notes);
        }
      }
      
      if (status) { fields.push(`status = $${idx++}`); values.push(status); }
      fields.push(`updated_at = NOW()`);

      if (fields.length > 1) { // حداقل updated_at
        const updateQuery = `UPDATE freight_announcements SET ${fields.join(', ')} WHERE id = $${idx}`;
        values.push(id);
        await client.query(updateQuery, values);
      }

      // 3. آپدیت مقاصد (اگر ارسال شده)
      let newDestinations = oldDestinations;
      if (Array.isArray(destinations)) {
        await client.query('DELETE FROM freight_destinations WHERE freight_announcement_id = $1', [id]);

        const columnCheck = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_destinations' AND column_name = 'unload_time'`
        );
        const hasUnloadTime = columnCheck.rowCount > 0;

        const insertDestQuery = hasUnloadTime
          ? `INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost, unload_time, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`
          : `INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`;

        for (const d of destinations) {
          const params = [
            crypto.randomUUID(),
            id,
            d.city || null,
            d.representativeName || null,
            d.tonnage || null,
            d.freightCost || null,
          ];
          if (hasUnloadTime) params.push(d.unloadTime || null);
          await client.query(insertDestQuery, params);
        }
        
        // محاسبه و آپدیت کرایه کل
        const newTotalFreight = calculateTotalFreightCost(destinations);
        await client.query(
          'UPDATE freight_announcements SET total_freight_cost = $1 WHERE id = $2',
          [newTotalFreight, id]
        );
        
        newDestinations = destinations;
      }

      // 4. گرفتن رکورد جدید (برای مقایسه)
      const newRecordQuery = await client.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
      const newRecord = newRecordQuery.rows[0];

      // 5. مقایسه و شناسایی تغییرات
      const fieldsToTrack = [
        'loading_date', 'line_type', 'cargo_value', 'vehicle_type', 'notes', 'status',
        'origin_city', 'brand', 'representative_type', 'representative_name', 
        'carton_count', 'priority', 'products', 'platform_arrival_time', 'total_freight_cost'
      ];
      
      const fieldChanges = compareObjects(oldRecord, newRecord, fieldsToTrack);
      
      // مقایسه مقاصد
      const destinationChanges = compareDestinations(oldDestinations, newDestinations);
      
      // ترکیب تغییرات
      const allChanges = { ...fieldChanges };
      if (destinationChanges) {
        Object.assign(allChanges, destinationChanges);
      }

      // 6. ثبت تاریخچه (فقط اگه تغییری رخ داده)
      if (allChanges && Object.keys(allChanges).length > 0) {
        const userName = req.user?.name || req.user?.username || 'کاربر';
        const userId = req.user?.userId || req.user?.id;
        
        let action = 'EDITED';
        if (destinationChanges && !fieldChanges) {
          action = 'DESTINATIONS_CHANGED';
        } else if (oldRecord.status !== newRecord.status) {
          action = 'STATUS_CHANGED';
        }
        
        const description = generateChangeDescription(
          action,
          allChanges,
          oldRecord.status,
          newRecord.status,
          newRecord.line_type
        );
        
        await logFreightHistory({
          announcementId: id,
          userId: userId,
          userName: userName,
          action: action,
          oldStatus: oldRecord.status,
          newStatus: newRecord.status,
          fieldChanges: allChanges,
          description: description,
          ipAddress: req.ip,
          client: client
        });
      }

      await client.query('COMMIT');

      // 7. برگرداندن رکورد آپدیت شده
      const { rows } = await pool.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
      const updated = rows[0];
      
      console.log(`📅 [updateFreightAnnouncement] ID ${id}: After UPDATE, reading from DB:`, {
        loading_date: updated.loading_date,
        type: typeof updated.loading_date
      });
      
      // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
      if (updated.loading_date) {
        const before = updated.loading_date;
        updated.loading_date = normalizeJalaliDate(updated.loading_date);
        console.log(`📅 [updateFreightAnnouncement] ID ${id}: Sending to frontend:`, {
          before,
          after: updated.loading_date
        });
      }
      
      const destRows = await pool.query('SELECT * FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC', [id]);
      updated.destinations = destRows.rows;
      
      return res.json(updated);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to update freight announcement:', error);
    return res.status(500).json({ message: 'Internal server error while updating freight announcement.' });
  }
}

/**
 * Creates a new freight announcement with optional destinations.
 * Expects camelCase fields from frontend; maps to DB snake_case.
 */
async function createFreightAnnouncement(req, res) {
  try {
    const {
      loadingDate,
      lineType,
      cargoValue,
      vehicleType,
      notes,
      originCity,
      brand,
      representativeType,
      representativeName,
      cartonCount,
      priority,
      products,
      platformArrivalTime,
      destinations = [],
      isDraft,
    } = req.body || {};

    if (!loadingDate || !lineType || !vehicleType) {
      return res.status(400).json({ message: 'loadingDate, lineType and vehicleType are required.' });
    }

    const id = crypto.randomUUID();
    const announcementCode = `ANN-${Date.now()}`;
    const status = isDraft ? 'Draft' : 'PendingManagerApproval';

    // Calculate total freight cost if provided in destinations
    const totalFreightCost = Array.isArray(destinations)
      ? destinations.reduce((sum, d) => sum + (Number(d.freightCost) || 0), 0)
      : 0;

    const insertAnnouncementQuery = `
      INSERT INTO freight_announcements (
        id, announcement_code, loading_date, line_type, status, cargo_value,
        vehicle_type, assignment_type, assigned_driver_id, assigned_vehicle_id,
        total_freight_cost, platform_arrival_time, carton_count, created_at, updated_at,
        origin_city, brand, representative_type, representative_name, priority, products, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, NULL, NULL,
        $9, $10, $11, NOW(), NOW(),
        $12, $13, $14, $15, $16, $17, $18
      )
    `;

    // اطمینان از فرمت `/` برای ذخیره در دیتابیس
    console.log(`📅 [createFreightAnnouncement] Received from frontend:`, {
      loadingDate,
      type: typeof loadingDate
    });
    const normalizedLoadingDate = ensureJalaliDateFormat(loadingDate);
    console.log(`📅 [createFreightAnnouncement] Normalized for DB:`, {
      normalizedLoadingDate,
      willSave: normalizedLoadingDate
    });

    await pool.query(insertAnnouncementQuery, [
      id,
      announcementCode,
      normalizedLoadingDate,
      lineType,
      status,
      cargoValue || 0,
      vehicleType,
      representativeType || null, // using assignment_type to store representativeType when applicable
      totalFreightCost || null,
      platformArrivalTime || null,
      cartonCount || null,
      originCity || null,
      brand || null,
      representativeType || null,
      representativeName || null,
      priority || null,
      Array.isArray(products) ? JSON.stringify(products) : '[]',
      notes || null,
    ]);

    // Insert destinations if provided
    if (Array.isArray(destinations) && destinations.length > 0) {
      // Detect unload_time column existence for flexible insert
      const columnCheck = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_destinations' AND column_name = 'unload_time'`
      );
      const hasUnloadTime = columnCheck.rowCount > 0;
      const insertDestQuery = hasUnloadTime
        ? `INSERT INTO freight_destinations (
             id, freight_announcement_id, city, representative_name, tonnage, freight_cost, unload_time, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, NOW()
           )`
        : `INSERT INTO freight_destinations (
             id, freight_announcement_id, city, representative_name, tonnage, freight_cost, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, NOW()
           )`;

      for (const d of destinations) {
        const destId = crypto.randomUUID();
        const params = [
          destId,
          id,
          d.city || null,
          d.representativeName || null,
          d.tonnage || null,
          d.freightCost || null,
        ];
        if (hasUnloadTime) params.push(d.unloadTime || null);
        await pool.query(insertDestQuery, params);
      }
    }

    // Fetch the created record with destinations for response
    const { rows } = await pool.query(
      `SELECT 
         fa.*,
         d.name as assigned_driver_name,
         d.employee_id as assigned_driver_employee_id,
         v.model as assigned_vehicle_model,
         v.brand as assigned_vehicle_brand,
         v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
       FROM freight_announcements fa
       LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
       LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
       WHERE fa.id = $1`,
      [id]
    );

    const created = rows[0];
    
    console.log(`📅 [createFreightAnnouncement] ID ${id}: After INSERT, reading from DB:`, {
      loading_date: created.loading_date,
      type: typeof created.loading_date
    });
    
    // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
    if (created.loading_date) {
      const before = created.loading_date;
      created.loading_date = normalizeJalaliDate(created.loading_date);
      console.log(`📅 [createFreightAnnouncement] ID ${id}: Sending to frontend:`, {
        before,
        after: created.loading_date
      });
    }
    
    const destRows = await pool.query(
      'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC',
      [id]
    );
    created.destinations = destRows.rows;

    // Attach optional UI fields if supplied to avoid null reference on client
    created.origin_city = originCity || null;
    created.brand = brand || null;
    created.representative_type = representativeType || null;
    created.representative_name = representativeName || null;
    created.priority = priority || null;
    created.products = Array.isArray(products) ? products : [];
    created.platform_arrival_time = platformArrivalTime || null;
    created.notes = notes || null;

    // ثبت رویداد CREATED در تاریخچه
    const userName = req.user?.name || req.user?.username || 'کاربر';
    const userId = req.user?.userId || req.user?.id;
    await logFreightHistory({
      announcementId: id,
      userId: userId,
      userName: userName,
      action: 'CREATED',
      newStatus: status,
      description: `اعلام بار با کد ${announcementCode} ایجاد شد (${lineType})`,
      ipAddress: req.ip
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error('Failed to create freight announcement:', error);
    return res.status(500).json({ message: 'Internal server error while creating freight announcement.' });
  }
}

/**
 * تابع کمکی برای آپدیت وضعیت و ثبت تاریخچه (این تابع دیگه استفاده نمیشه)
 * از logFreightHistory در داخل updateFn استفاده کنید
 */

// POST /:id/approve
async function approveAnnouncement(req, res) {
  const { id: announcementId } = req.params;
  const { userId, name, username } = req.user;
  const userName = name || username || 'مدیر';
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch announcement info با مقاصد
    const { rows } = await client.query(
      'SELECT line_type, status, announcement_code FROM freight_announcements WHERE id = $1',
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Announcement not found.' });
    }
    
    const { line_type: lineType, status: oldStatus, announcement_code: code } = rows[0];
    
    // گرفتن مقاصد برای نمایش در توضیحات
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 3',
      [announcementId]
    );
    const destinations = destRows.rows.map(d => d.city).join('، ');
    const destinationLabel = destinations || 'بدون مقصد';
    
    let newStatus;
    let assignmentType;
    const iceCreamMatches = ['IceCream', 'بستنی'];
    const dairyMatches = ['Dairy', 'پاستوریزه'];
    const ambientMatches = ['Ambient', 'لبنیات-فروتلند'];
    
    if (iceCreamMatches.includes(lineType)) {
      newStatus = 'PendingCompanyAssignment';
      assignmentType = 'company';
    } else if (dairyMatches.includes(lineType) || ambientMatches.includes(lineType)) {
      newStatus = 'PendingPersonalAssignment';
      assignmentType = 'personal';
    } else {
      newStatus = 'PendingCompanyAssignment';
      assignmentType = 'company';
    }

    const description = `بار به مقصد ${destinationLabel} توسط ${userName} تایید شد و به صف ${assignmentType === 'company' ? 'شرکتی' : 'شخصی'} ارجاع شد`;

    // آپدیت وضعیت و نوع تخصیص
    await client.query(
      'UPDATE freight_announcements SET status = $1, assignment_type = $2, updated_at = NOW() WHERE id = $3',
      [newStatus, assignmentType, announcementId]
    );
    
    // ثبت تاریخچه
    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: 'APPROVED',
      oldStatus,
      newStatus,
      fieldChanges: { assignmentType: { old: null, new: assignmentType } },
      description,
      ipAddress: req.ip,
      client
    });
    
    await client.query('COMMIT');
    return res.status(200).json({ message: `Announcement approved and routed to ${assignmentType}.` });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to approve announcement:', e);
    return res.status(500).json({ message: 'Internal server error while approving announcement.' });
  } finally {
    client.release();
  }
}

// POST /:id/reject
async function rejectAnnouncement(req, res) {
  const { id: announcementId } = req.params;
  const { userId, name, username } = req.user;
  const userName = name || username || 'مدیر';
  const newStatus = 'Rejected';
  const reason = (req.body && req.body.reason) || 'بدون علت';
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // گرفتن اطلاعات قبلی با مقاصد
    const { rows } = await client.query(
      'SELECT status, announcement_code FROM freight_announcements WHERE id = $1',
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Announcement not found.' });
    }
    
    const { status: oldStatus, announcement_code: code } = rows[0];
    
    // گرفتن مقاصد برای نمایش در توضیحات
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 3',
      [announcementId]
    );
    const destinations = destRows.rows.map(d => d.city).join('، ');
    const destinationLabel = destinations || 'بدون مقصد';
    
    const description = `بار به مقصد ${destinationLabel} توسط ${userName} رد شد. علت: ${reason}`;

    // ثبت علت رد
      const col = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_announcements' AND column_name = 'rejection_reason'`);
      if (col.rowCount > 0) {
      await client.query(
        'UPDATE freight_announcements SET status = $1, rejection_reason = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, reason, announcementId]
      );
    } else {
      await client.query(
        "UPDATE freight_announcements SET status = $1, notes = COALESCE(notes, '') || $2, updated_at = NOW() WHERE id = $3",
        [newStatus, " رد شده: " + reason, announcementId]
      );
    }
    
    // ثبت تاریخچه
    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action: 'REJECTED',
      oldStatus,
      newStatus,
      fieldChanges: { rejectionReason: { old: null, new: reason } },
      description,
      ipAddress: req.ip,
      client
    });
    
    await client.query('COMMIT');
    return res.status(200).json({ message: 'Announcement rejected.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to reject announcement:', e);
    return res.status(500).json({ message: 'Internal server error while rejecting announcement.' });
  } finally {
    client.release();
  }
}

// Helper function for personal driver and vehicle assignment
async function assignPersonalDriverAndVehicle(req, res) {
  const { id: announcementId } = req.params;
  const { 
    nationalId,
    driverName,
    driverContact,
    driverSmartId,
    vehicleType,
    vehiclePlate,
    truckSmartId,
    destinations,
    totalFreightCost,
    billOfLadingNumber
  } = req.body;
  const { userId, role, name, username } = req.user;
  const userName = name || username || 'کاربر ترابری';

  if (!nationalId || !driverName || !driverContact || !driverSmartId || !vehicleType || !vehiclePlate || !truckSmartId) {
    return res.status(400).json({ 
      message: 'کد ملی، نام راننده، شماره تماس، هوشمند راننده، نوع خودرو، پلاک خودرو و هوشمند کامیون الزامی است.' 
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if announcement exists
    const { rows } = await client.query(
      'SELECT assignment_type, assigned_driver_id, assigned_vehicle_id, status, announcement_code FROM freight_announcements WHERE id = $1',
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    
    const { 
      assignment_type: assignmentType, 
      assigned_driver_id: oldDriverId,
      assigned_vehicle_id: oldVehicleId,
      status: oldStatus,
      announcement_code: code 
    } = rows[0];
    
    // Check if this is personal assignment
    if (assignmentType !== 'personal') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'این اعلام بار برای تخصیص شخصی نیست.' });
    }
    
    // Parse plate number - more flexible regex for Persian letters
    const plateMatch = vehiclePlate.match(/^(\d{2})([آ-یا-ی])(\d{3})-(\d{2})$/);
    if (!plateMatch) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'فرمت پلاک خودرو صحیح نیست. فرمت صحیح: 12ع345-67' });
    }
    
    const [, platePart1, plateLetter, platePart2, plateCityCode] = plateMatch;
    
    // Check if personal driver exists, if not create
    let personalDriverId;
    const existingDriver = await client.query(
      'SELECT id FROM personal_drivers WHERE national_id = $1',
      [nationalId]
    );
    
    if (existingDriver.rows.length > 0) {
      personalDriverId = existingDriver.rows[0].id;
      // Update driver info (only if driver_smart_id is different and not already used by another driver)
      if (driverSmartId) {
        const existingSmartId = await client.query(
          'SELECT id FROM personal_drivers WHERE driver_smart_id = $1 AND id != $2',
          [driverSmartId, personalDriverId]
        );
        
        if (existingSmartId.rows.length === 0) {
          await client.query(
            'UPDATE personal_drivers SET name = $1, mobile = $2, driver_smart_id = $3, updated_at = NOW() WHERE id = $4',
            [driverName, driverContact, driverSmartId, personalDriverId]
          );
        } else {
          // Keep existing driver_smart_id if new one is already used
          await client.query(
            'UPDATE personal_drivers SET name = $1, mobile = $2, updated_at = NOW() WHERE id = $3',
            [driverName, driverContact, personalDriverId]
          );
        }
      } else {
        await client.query(
          'UPDATE personal_drivers SET name = $1, mobile = $2, updated_at = NOW() WHERE id = $3',
          [driverName, driverContact, personalDriverId]
        );
      }
    } else {
      // Create new personal driver
      const crypto = require('crypto');
      personalDriverId = crypto.randomUUID();
      
      // Check if driver_smart_id is already used
      if (driverSmartId) {
        const existingSmartId = await client.query(
          'SELECT id FROM personal_drivers WHERE driver_smart_id = $1',
          [driverSmartId]
        );
        
        if (existingSmartId.rows.length > 0) {
          // Generate a new unique driver_smart_id
          const newSmartId = `DRV-${Date.now()}`;
          await client.query(
            'INSERT INTO personal_drivers (id, national_id, name, mobile, driver_smart_id) VALUES ($1, $2, $3, $4, $5)',
            [personalDriverId, nationalId, driverName, driverContact, newSmartId]
          );
        } else {
          await client.query(
            'INSERT INTO personal_drivers (id, national_id, name, mobile, driver_smart_id) VALUES ($1, $2, $3, $4, $5)',
            [personalDriverId, nationalId, driverName, driverContact, driverSmartId]
          );
        }
      } else {
        // Generate a new unique driver_smart_id if none provided
        const newSmartId = `DRV-${Date.now()}`;
        await client.query(
          'INSERT INTO personal_drivers (id, national_id, name, mobile, driver_smart_id) VALUES ($1, $2, $3, $4, $5)',
          [personalDriverId, nationalId, driverName, driverContact, newSmartId]
        );
      }
    }
    
    // Check if personal vehicle exists, if not create
    let personalVehicleId;
    const existingVehicle = await client.query(
      'SELECT id FROM personal_vehicles WHERE truck_smart_id = $1',
      [truckSmartId]
    );
    
    if (existingVehicle.rows.length > 0) {
      personalVehicleId = existingVehicle.rows[0].id;
      // Update vehicle info
      await client.query(
        'UPDATE personal_vehicles SET vehicle_type = $1, plate_part1 = $2, plate_letter = $3, plate_part2 = $4, plate_city_code = $5, updated_at = NOW() WHERE id = $6',
        [vehicleType, platePart1, plateLetter, platePart2, plateCityCode, personalVehicleId]
      );
    } else {
      // Create new personal vehicle
      const crypto = require('crypto');
      personalVehicleId = crypto.randomUUID();
      await client.query(
        'INSERT INTO personal_vehicles (id, truck_smart_id, plate_part1, plate_letter, plate_part2, plate_city_code, vehicle_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [personalVehicleId, truckSmartId, platePart1, plateLetter, platePart2, plateCityCode, vehicleType]
      );
    }
    
    // Update destinations if provided
    if (Array.isArray(destinations) && destinations.length > 0) {
      await client.query('DELETE FROM freight_destinations WHERE freight_announcement_id = $1', [announcementId]);
      
      for (const dest of destinations) {
        const destId = crypto.randomUUID();
        await client.query(
          'INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
          [destId, announcementId, dest.city, dest.representativeName, dest.tonnage, dest.freightCost]
        );
      }
    }
    
    // Update freight announcement
    await client.query(
      'UPDATE freight_announcements SET status = $1, assigned_driver_id = $2, assigned_vehicle_id = $3, bill_of_lading_number = $4, total_freight_cost = $5, updated_at = NOW() WHERE id = $6',
      ['Assigned', personalDriverId, personalVehicleId, billOfLadingNumber || null, totalFreightCost || null, announcementId]
    );
    
    // Log history
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 3',
      [announcementId]
    );
    const destinationList = destRows.rows.map(d => d.city).join('، ');
    const destinationLabel = destinationList || 'بدون مقصد';
    
    const isReassignment = oldDriverId || oldVehicleId;
    const action = isReassignment ? 'REASSIGNED' : 'ASSIGNED';
    const description = isReassignment 
      ? `بار به مقصد ${destinationLabel} مجدداً تخصیص داده شد (راننده شخصی)`
      : `بار به مقصد ${destinationLabel} به راننده و خودرو شخصی تخصیص یافت`;
    
    const fieldChanges = {};
    if (oldDriverId !== personalDriverId) {
      fieldChanges.assignedDriverId = { old: oldDriverId, new: personalDriverId };
    }
    if (oldVehicleId !== personalVehicleId) {
      fieldChanges.assignedVehicleId = { old: oldVehicleId, new: personalVehicleId };
    }
    
    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action,
      oldStatus,
      newStatus: 'Assigned',
      fieldChanges,
      description,
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');
    res.json({ message: 'Assignment successful.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in personal assignment:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      announcementId,
      nationalId,
      driverName,
      driverContact,
      vehicleType,
      vehiclePlate,
      truckSmartId
    });
    res.status(500).json({ message: 'خطا در تخصیص راننده و خودرو شخصی', error: error.message });
  } finally {
    client.release();
  }
}

// PUT /:id/assignment
async function assignVehicleAndDriver(req, res) {
  const { id: announcementId } = req.params;
  const { 
    vehicleId, 
    driverId, 
    assignmentType,
    // Personal driver/vehicle info
    nationalId,
    driverName,
    driverContact,
    vehicleType,
    vehiclePlate,
    truckSmartId,
    destinations
  } = req.body;
  const { userId, role, name, username } = req.user;
  const userName = name || username || 'کاربر ترابری';

  console.log('🔍 [Assignment] Request details:', {
    announcementId,
    assignmentType,
    role,
    userId,
    body: req.body
  });

  // Check if this is personal assignment
  if (assignmentType === 'personal') {
    return await assignPersonalDriverAndVehicle(req, res);
  }

  if (!vehicleId || !driverId) {
    return res.status(400).json({ message: 'Vehicle ID and Driver ID are required for assignment.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { rows } = await client.query(
      'SELECT assignment_type, assigned_driver_id, assigned_vehicle_id, status, announcement_code FROM freight_announcements WHERE id = $1',
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Announcement not found.' });
    }
    
    const { 
      assignment_type: dbAssignmentType, 
      assigned_driver_id: oldDriverId,
      assigned_vehicle_id: oldVehicleId,
      status: oldStatus,
      announcement_code: code 
    } = rows[0];

    console.log('🔍 [Assignment] Database values:', {
      dbAssignmentType,
      requestAssignmentType: assignmentType,
      role,
      oldStatus
    });
    
    // گرفتن مقاصد برای نمایش در توضیحات
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 3',
      [announcementId]
    );
    const destinations = destRows.rows.map(d => d.city).join('، ');
    const destinationLabel = destinations || 'بدون مقصد';
    
    // بررسی دسترسی - باید با assignmentType در دیتابیس مقایسه شود
    if (role === 'transport_user' && dbAssignmentType !== 'company') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Assignment not allowed in current queue for Transport Company.' });
    }
    if (role === 'personal_transport_user' && dbAssignmentType !== 'personal') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Assignment not allowed in current queue for Personal Transport.' });
    }
    
    // تشخیص نوع عملیات: تخصیص جدید یا تغییر تخصیص
    const isReassignment = oldDriverId || oldVehicleId;
    const action = isReassignment ? 'REASSIGNED' : 'ASSIGNED';
    const newStatus = 'Assigned';
    
    // توضیحات فارسی
    let description;
    if (isReassignment) {
      description = `بار به مقصد ${destinationLabel} مجدداً تخصیص داده شد`;
    } else {
      description = `بار به مقصد ${destinationLabel} به راننده و خودرو تخصیص یافت`;
    }
    
    const fieldChanges = {};
    if (oldDriverId !== driverId) {
      fieldChanges.assignedDriverId = { old: oldDriverId, new: driverId };
    }
    if (oldVehicleId !== vehicleId) {
      fieldChanges.assignedVehicleId = { old: oldVehicleId, new: vehicleId };
    }

    // آپدیت تخصیص و وضعیت
    await client.query(
      'UPDATE freight_announcements SET status = $1, assigned_vehicle_id = $2, assigned_driver_id = $3, updated_at = NOW() WHERE id = $4',
      [newStatus, vehicleId, driverId, announcementId]
    );
    
    // ثبت تاریخچه
    await logFreightHistory({
      announcementId,
      userId,
      userName,
      action,
      oldStatus,
      newStatus,
      fieldChanges,
      description,
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Assignment successful.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Assignment failed:', e);
    return res.status(500).json({ message: 'Internal server error while assigning.' });
  } finally {
    client.release();
  }
}

// POST /:id/assignment-queue
async function setAssignmentQueue(req, res) {
  const { id: announcementId } = req.params;
  const { nextQueue } = req.body || {};
  const { userId, name, username } = req.user;
  const userName = name || username || 'مدیر';
  
  if (!['company', 'personal'].includes(nextQueue)) {
    return res.status(400).json({ message: 'nextQueue must be "company" or "personal"' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // گرفتن اطلاعات قبلی با مقاصد
    const { rows } = await client.query(
      'SELECT assignment_type, status, announcement_code FROM freight_announcements WHERE id = $1',
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Announcement not found.' });
    }
    
    const { assignment_type: oldQueue, status: oldStatus, announcement_code: code } = rows[0];
    
    // گرفتن مقاصد برای نمایش در توضیحات
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 3',
      [announcementId]
    );
    const destinations = destRows.rows.map(d => d.city).join('، ');
    const destinationLabel = destinations || 'بدون مقصد';
    
  const newStatus = nextQueue === 'company' ? 'PendingCompanyAssignment' : 'PendingPersonalAssignment';
    const queueLabel = nextQueue === 'company' ? 'شرکتی' : 'شخصی';
    const description = `بار به مقصد ${destinationLabel} توسط ${userName} به صف ${queueLabel} ارجاع شد`;
    
    // آپدیت وضعیت و صف
    await client.query(
      'UPDATE freight_announcements SET status = $1, assignment_type = $2, updated_at = NOW() WHERE id = $3',
      [newStatus, nextQueue, announcementId]
    );
    
    // ثبت تاریخچه
    await logFreightHistory({
    announcementId,
      userId,
      userName,
      action: 'QUEUE_CHANGED',
      oldStatus,
    newStatus,
      fieldChanges: { assignmentType: { old: oldQueue, new: nextQueue } },
      description,
      ipAddress: req.ip,
      client
    });
    
    await client.query('COMMIT');
    return res.status(200).json({ message: 'Queue changed successfully.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Queue change failed:', e);
    return res.status(500).json({ message: 'Internal server error while changing queue.' });
  } finally {
    client.release();
  }
}

async function deleteFreightAnnouncement(req, res) {
  const { id } = req.params;
  const { userId, name, username } = req.user;
  const userName = name || username || 'کاربر';
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // گرفتن اطلاعات قبل از حذف
    const { rows } = await pool.query(
      'SELECT announcement_code, status FROM freight_announcements WHERE id = $1',
      [id]
    );
    
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Freight announcement not found.' });
    }
    
    const { announcement_code: code, status } = rows[0];
    
    // ثبت تاریخچه قبل از حذف
    await logFreightHistory({
      announcementId: id,
      userId,
      userName,
      action: 'DELETED',
      oldStatus: status,
      newStatus: null,
      description: `اعلام بار #${code} توسط ${userName} حذف شد`,
      ipAddress: req.ip,
      client
    });
    
    // حذف مقاصد
    await client.query('DELETE FROM freight_destinations WHERE freight_announcement_id = $1', [id]);
    
    // حذف اعلام بار (تاریخچه به دلیل CASCADE خودکار حذف میشه)
    await client.query('DELETE FROM freight_announcements WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete freight announcement:', error);
    return res.status(500).json({ message: 'Internal server error while deleting freight announcement.' });
  } finally {
    client.release();
  }
}

/**
 * دریافت تاریخچه کامل یک اعلام بار
 * GET /api/freight/:id/history
 */
async function getFreightAnnouncementHistory(req, res) {
  const { id: announcementId } = req.params;
  
  try {
    // بررسی وجود اعلام بار
    const { rows: annRows } = await pool.query(
      'SELECT id, announcement_code, status FROM freight_announcements WHERE id = $1',
      [announcementId]
    );
    
    if (annRows.length === 0) {
      return res.status(404).json({ message: 'Freight announcement not found.' });
    }
    
    // دریافت تاریخچه
    const { rows: historyRows } = await pool.query(`
      SELECT 
        id,
        freight_announcement_id,
        user_id,
        user_name,
        action,
        old_status,
        new_status,
        field_changes,
        description,
        created_at
      FROM freight_announcement_history
      WHERE freight_announcement_id = $1
      ORDER BY created_at DESC
    `, [announcementId]);
    
    return res.json({
      announcementId,
      announcementCode: annRows[0].announcement_code,
      currentStatus: annRows[0].status,
      history: historyRows,
      totalEvents: historyRows.length
    });
  } catch (error) {
    console.error('Failed to get freight announcement history:', error);
    return res.status(500).json({ message: 'Internal server error while fetching history.' });
  }
}

/**
 * دریافت اعلام بارهای تاریخچه شده (Finalized) با قابلیت فیلتر بر اساس تاریخ و مقصد
 * GET /api/freight-announcements/history?date=1403/10/15&destination=تهران
 */
async function getFreightHistory(req, res) {
  try {
    const { date, destination } = req.query;
    
    let query = `
      SELECT 
        fa.*,
        fa.rejection_reason,
        d.name as assigned_driver_name,
        d.employee_id as assigned_driver_employee_id,
        v.model as assigned_vehicle_model,
        v.brand as assigned_vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
      FROM freight_announcements fa
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      WHERE fa.status = 'Finalized'
    `;
    const params = [];
    let paramIndex = 1;
    
    // فیلتر بر اساس تاریخ شمسی
    if (date && date.trim() !== '') {
      // انتظار فرمت 1403/10/15
      const dateMatch = date.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (dateMatch) {
        const [, jy, jm, jd] = dateMatch.map(Number);
        const { jalaliToGregorian } = require('../utils/jalali');
        const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
        
        // تبدیل به تاریخ شروع و پایان روز
        const startDate = new Date(gy, gm - 1, gd, 0, 0, 0, 0);
        const endDate = new Date(gy, gm - 1, gd, 23, 59, 59, 999);
        
        console.log(`📅 [getFreightHistory] Filtering by date: ${date} -> ${startDate} to ${endDate}`);
        
        query += ` AND fa.loading_date >= $${paramIndex} AND fa.loading_date <= $${paramIndex + 1}`;
        params.push(startDate, endDate);
        paramIndex += 2;
      } else {
        console.log(`⚠️ [getFreightHistory] Invalid date format: ${date}`);
      }
    } else {
      console.log(`📅 [getFreightHistory] No date filter - showing all Finalized announcements`);
    }
    
    query += ' ORDER BY fa.loading_date DESC, fa.created_at DESC';
    
    console.log(`🔍 [getFreightHistory] Query:`, query);
    console.log(`🔍 [getFreightHistory] Params:`, params);
    
    const { rows } = await pool.query(query, params);
    
    console.log(`📊 [getFreightHistory] Found ${rows.length} Finalized announcements`);
    
    // Fetch destinations for each announcement and convert dates
    for (let announcement of rows) {
      let destQuery = 'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1';
      const destParams = [announcement.id];
      
      // فیلتر بر اساس مقصد
      if (destination) {
        destQuery += ' AND city ILIKE $2';
        destParams.push(`%${destination}%`);
      }
      
      const destRows = await pool.query(destQuery, destParams);
      
      // اگر فیلتر مقصد داشتیم و نتیجه‌ای پیدا نشد، این ردیف را حذف می‌کنیم
      if (destination && destRows.rows.length === 0) {
        const index = rows.indexOf(announcement);
        if (index > -1) {
          rows.splice(index, 1);
        }
        continue;
      }
      
      announcement.destinations = destRows.rows;
      
      // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
      if (announcement.loading_date) {
        const before = announcement.loading_date;
        announcement.loading_date = normalizeJalaliDate(announcement.loading_date);
        if (before !== announcement.loading_date) {
          console.log(`📅 [getFreightHistory] ID ${announcement.id}: "${before}" → "${announcement.loading_date}"`);
        }
      }
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Failed to get freight history:', error);
    res.status(500).json({ message: 'Internal server error while fetching freight history.' });
  }
}

/**
 * اتمام تخصیص - تقسیم اعلام بارها بر اساس تخصیص
 * POST /api/freight-announcements/finalize-assignments
 * Body: { announcementIds: string[], lineType: string }
 * 
 * منطق:
 * - اعلام بارهایی که تخصیص دارند (assigned_vehicle_id و assigned_driver_id) → Finalized
 * - اعلام بارهایی که تخصیص ندارند → Leftover (بار مانده) و ارجاع به کارمند سازنده
 */
async function finalizeAssignments(req, res) {
  const { announcementIds, lineType } = req.body;
  const { userId, name, username } = req.user;
  
  if (!Array.isArray(announcementIds) || announcementIds.length === 0) {
    return res.status(400).json({ message: 'announcementIds array is required.' });
  }
  
  if (!lineType) {
    return res.status(400).json({ message: 'lineType is required.' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const finalizedIds = [];
    const leftoverIds = [];
    const creatorMap = {}; // Map announcementId to creatorUserId
    
    // بررسی هر اعلام بار
    for (const annId of announcementIds) {
      const annResult = await client.query(
        'SELECT id, assigned_vehicle_id, assigned_driver_id, line_type, status FROM freight_announcements WHERE id = $1',
        [annId]
      );
      
      if (annResult.rows.length === 0) {
        console.log(`⚠️ [finalizeAssignments] Announcement ${annId} not found`);
        continue;
      }
      
      const ann = annResult.rows[0];
      
      // تبدیل lineType انگلیسی به فارسی برای مقایسه
      const lineTypeMap = {
        'IceCream': 'بستنی',
        'Dairy': 'پاستوریزه',
        'Ambient': 'لبنیات-فروتلند'
      };
      const persianLineType = lineTypeMap[lineType] || lineType;
      
      // بررسی اینکه آیا اعلام بار مربوط به lineType مورد نظر است
      // بررسی هم به صورت فارسی و هم انگلیسی برای سازگاری
      if (ann.line_type !== persianLineType && ann.line_type !== lineType) {
        console.log(`⚠️ [finalizeAssignments] Line type mismatch: ${ann.line_type} !== ${lineType} (persian: ${persianLineType}) for ${annId}`);
        continue;
      }
      
      console.log(`✅ [finalizeAssignments] Line type match: ${ann.line_type} === ${lineType} (persian: ${persianLineType})`);
      
      // بررسی تخصیص
      const hasAssignment = ann.assigned_vehicle_id && ann.assigned_driver_id;
      
      console.log(`🔍 [finalizeAssignments] Processing ${annId}: hasAssignment=${hasAssignment}, status=${ann.status}, line_type=${ann.line_type}`);
      
      if (hasAssignment) {
        // تخصیص دارد → Finalized
        const updateResult = await client.query(
          'UPDATE freight_announcements SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status',
          ['Finalized', annId]
        );
        
        console.log(`✅ [finalizeAssignments] Finalized ${annId}:`, updateResult.rows[0]);
        finalizedIds.push(annId);
        
        // ثبت تاریخچه
        await logFreightHistory({
          announcementId: annId,
          userId: userId,
          userName: name || username || 'کاربر',
          action: 'FINALIZED',
          oldStatus: ann.status || 'Assigned',
          newStatus: 'Finalized',
          description: `اعلام بار نهایی شد (تخصیص تکمیل شده)`,
          ipAddress: req.ip,
          client: client
        });
      } else {
        // تخصیص ندارد → باید کارمند سازنده را پیدا کنیم
        const historyRows = await client.query(
          `SELECT user_id, user_name 
           FROM freight_announcement_history 
           WHERE freight_announcement_id = $1 AND action = 'CREATED' 
           ORDER BY created_at ASC 
           LIMIT 1`,
          [annId]
        );
        
        let creatorUserId = null;
        let creatorUserName = 'کاربر نامشخص';
        
        if (historyRows.rows.length > 0) {
          creatorUserId = historyRows.rows[0].user_id;
          creatorUserName = historyRows.rows[0].user_name || creatorUserName;
        }
        
        // تغییر وضعیت به Leftover
        const updateResult = await client.query(
          'UPDATE freight_announcements SET status = $1, assignment_type = NULL, assigned_driver_id = NULL, assigned_vehicle_id = NULL, updated_at = NOW() WHERE id = $2 RETURNING id, status',
          ['Leftover', annId]
        );
        
        console.log(`✅ [finalizeAssignments] Set as Leftover ${annId}:`, updateResult.rows[0]);
        leftoverIds.push(annId);
        creatorMap[annId] = { userId: creatorUserId, userName: creatorUserName };
        
        // ثبت تاریخچه
        await logFreightHistory({
          announcementId: annId,
          userId: userId,
          userName: name || username || 'کاربر',
          action: 'RETURNED_TO_PLANNER',
          oldStatus: ann.status || 'PendingCompanyAssignment',
          newStatus: 'Leftover',
          description: `اعلام بار به عنوان بار مانده به کارمند برنامه‌ریزی (${creatorUserName}) برگردانده شد (تخصیص انجام نشده)`,
          ipAddress: req.ip,
          client: client
        });
      }
    }
    
    console.log(`📊 [finalizeAssignments] Summary: finalized=${finalizedIds.length}, leftover=${leftoverIds.length}`);
    
    await client.query('COMMIT');
    
    res.json({
      message: 'اتمام تخصیص با موفقیت انجام شد',
      finalized: finalizedIds.length,
      leftover: leftoverIds.length,
      finalizedIds,
      leftoverIds,
      creators: creatorMap
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to finalize assignments:', error);
    res.status(500).json({ message: 'Internal server error while finalizing assignments.' });
  } finally {
    client.release();
  }
}

/**
 * GET /statistics - Get transport performance statistics
 * Query params: year, month, day, lineType, timeRange (day/month/year)
 */
async function getTransportStatistics(req, res) {
  try {
    const { year, month, day, lineType, timeRange = 'day' } = req.query;
    
    console.log('📊 [TransportStatistics] Request:', { year, month, day, lineType, timeRange });
    
    // Build date filter - چون loading_date به صورت DATE ذخیره شده و شامل تاریخ شمسی است
    // باید ابتدا به TEXT تبدیل کنیم (فرمت YYYY-MM-DD)
    let dateFilter = '';
    let dateParams = [];
    
    if (year && month && day) {
      // روز خاص: فیلتر بر اساس YYYY-MM-DD (فرمت PostgreSQL)
      const jalaliDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dateFilter = "WHERE CAST(fa.loading_date AS TEXT) = $1";
      dateParams = [jalaliDate];
    } else if (year && month) {
      // ماه خاص: فیلتر بر اساس YYYY-MM
      const jalaliMonth = `${year}-${String(month).padStart(2, '0')}`;
      dateFilter = "WHERE CAST(fa.loading_date AS TEXT) LIKE $1";
      dateParams = [`${jalaliMonth}-%`];
    } else if (year) {
      // سال خاص: فیلتر بر اساس YYYY
      dateFilter = "WHERE CAST(fa.loading_date AS TEXT) LIKE $1";
      dateParams = [`${year}-%`];
    }
    
    // Build line type filter
    let lineTypeFilter = '';
    if (lineType && lineType !== 'all') {
      const lineTypeParam = dateParams.length + 1;
      lineTypeFilter = dateFilter ? ` AND fa.line_type = $${lineTypeParam}` : `WHERE fa.line_type = $${lineTypeParam}`;
      dateParams.push(lineType);
    }
    
    // فیلتر status: فقط بارهایی که Draft نیستند (یعنی تایید شده و به ترابری رفته‌اند)
    // باید Draft و PendingManagerApproval و Rejected را از آمار حذف کنیم
    // چون این بارها هنوز به مرحله ترابری نرسیده‌اند
    // نکته: status ها در دیتابیس به انگلیسی ذخیره می‌شوند
    let statusFilter = '';
    if (dateFilter || lineTypeFilter) {
      statusFilter = ` AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected')`;
    } else {
      statusFilter = `WHERE fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected')`;
    }
    
    // ترکیب تمام فیلترها
    let whereClause = dateFilter + lineTypeFilter + statusFilter;
    if (!whereClause) {
      whereClause = '';
    }
    
    console.log('📊 [TransportStatistics] Status filter:', statusFilter);
    
    // Determine grouping based on timeRange
    // ابتدا loading_date را به TEXT تبدیل می‌کنیم (فرمت YYYY-MM-DD)، سپس از SUBSTRING استفاده می‌کنیم
    let groupBy = '';
    let dateFormat = '';
    if (timeRange === 'day') {
      // برای روز: کل رشته را برگردان (YYYY-MM-DD)
      groupBy = 'CAST(fa.loading_date AS TEXT)';
      dateFormat = 'CAST(fa.loading_date AS TEXT)';
    } else if (timeRange === 'month') {
      // برای ماه: 7 کاراکتر اول را برگردان (YYYY-MM)
      groupBy = "SUBSTRING(CAST(fa.loading_date AS TEXT), 1, 7)";
      dateFormat = "SUBSTRING(CAST(fa.loading_date AS TEXT), 1, 7)";
    } else if (timeRange === 'year') {
      // برای سال: 4 کاراکتر اول را برگردان (YYYY)
      groupBy = "SUBSTRING(CAST(fa.loading_date AS TEXT), 1, 4)";
      dateFormat = "SUBSTRING(CAST(fa.loading_date AS TEXT), 1, 4)";
    }
    
    // Query for statistics
    const query = `
      SELECT 
        ${dateFormat} as time_period,
        COUNT(*) as total_requests,
        COUNT(CASE WHEN fa.assignment_type = 'company' AND fa.assigned_driver_id IS NOT NULL THEN 1 END) as company_assignments,
        COUNT(CASE WHEN fa.assignment_type = 'personal' AND fa.assigned_driver_id IS NOT NULL THEN 1 END) as personal_assignments,
        COUNT(CASE WHEN fa.assigned_driver_id IS NOT NULL THEN 1 END) as total_assignments
      FROM freight_announcements fa
      ${whereClause}
      GROUP BY ${groupBy}
      ORDER BY time_period ASC
    `;
    
    console.log('📊 [TransportStatistics] Query:', query);
    console.log('📊 [TransportStatistics] Params:', dateParams);
    
    const { rows } = await pool.query(query, dateParams);
    
    // Calculate success rate for each period
    // همچنین باید time_period را normalize کنیم (تبدیل `-` به `/`)
    const statistics = rows.map(row => {
      let timePeriod = row.time_period;
      // اگر فرمت `YYYY-MM-DD` یا `YYYY-MM` دارد، به `YYYY/MM/DD` یا `YYYY/MM` تبدیل کن
      if (typeof timePeriod === 'string') {
        timePeriod = timePeriod.replace(/-/g, '/');
      }
      return {
        timePeriod,
        totalRequests: parseInt(row.total_requests) || 0,
        companyAssignments: parseInt(row.company_assignments) || 0,
        personalAssignments: parseInt(row.personal_assignments) || 0,
        totalAssignments: parseInt(row.total_assignments) || 0,
        successRate: row.total_requests > 0 
          ? Math.round((parseInt(row.total_assignments) / parseInt(row.total_requests)) * 100)
          : 0
      };
    });
    
    console.log('✅ [TransportStatistics] Found', statistics.length, 'periods');
    if (statistics.length > 0) {
      console.log('📊 [TransportStatistics] Sample period:', statistics[0]);
    }
    
    res.json(statistics);
  } catch (error) {
    console.error('❌ [TransportStatistics] Error:', error);
    res.status(500).json({ message: 'Internal server error while fetching statistics.', error: error.message });
  }
}

module.exports = {
  getFreightAnnouncements,
  getFreightAnnouncementById,
  approveAnnouncement,
  rejectAnnouncement,
  assignVehicleAndDriver,
  createFreightAnnouncement,
  updateFreightAnnouncement,
  setAssignmentQueue,
  deleteFreightAnnouncement,
  getFreightAnnouncementHistory,
  getFreightHistory,
  finalizeAssignments,
  getTransportStatistics,
};
