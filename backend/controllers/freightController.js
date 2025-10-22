const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js
const crypto = require('crypto');
const {
  logFreightHistory,
  compareObjects,
  compareDestinations,
  calculateTotalFreightCost,
  generateChangeDescription
} = require('../services/freightHistoryService');

/**
 * Fetches all freight announcements with related information.
 */
async function getFreightAnnouncements(req, res) {
  try {
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
      ORDER BY fa.created_at DESC
    `);
    
    // Fetch destinations for each announcement and convert dates
    for (let announcement of rows) {
      const destRows = await pool.query(
        'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1',
        [announcement.id]
      );
      announcement.destinations = destRows.rows;
      
      // Convert loading_date to string if it's a Date object
      if (announcement.loading_date instanceof Date) {
        const { formatJalali } = require('../utils/jalali');
        announcement.loading_date = formatJalali(announcement.loading_date);
      } else if (typeof announcement.loading_date === 'string') {
        // If it's already a string, keep it as is
        // No conversion needed
      }
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
    
    // Convert loading_date to string if it's a Date object
    const announcement = rows[0];
    if (announcement.loading_date instanceof Date) {
      // If it's a Date object, convert to Jalali string
      const { formatJalali } = require('../utils/jalali');
      announcement.loading_date = formatJalali(announcement.loading_date);
    } else if (typeof announcement.loading_date === 'string') {
      // If it's already a string, keep it as is
      // No conversion needed
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
      
      if (loadingDate) { fields.push(`loading_date = $${idx++}`); values.push(loadingDate); }
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
      
      // Convert loading_date to string if it's a Date object
      if (updated.loading_date instanceof Date) {
        const { formatJalali } = require('../utils/jalali');
        updated.loading_date = formatJalali(updated.loading_date);
      } else if (typeof updated.loading_date === 'string') {
        // If it's already a string, keep it as is
        // No conversion needed
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

    await pool.query(insertAnnouncementQuery, [
      id,
      announcementCode,
      loadingDate,
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
    
    // Convert loading_date to string if it's a Date object
    if (created.loading_date instanceof Date) {
      const { formatJalali } = require('../utils/jalali');
      created.loading_date = formatJalali(created.loading_date);
    } else if (typeof created.loading_date === 'string') {
      // If it's already a string, keep it as is
      // No conversion needed
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

// PUT /:id/assignment
async function assignVehicleAndDriver(req, res) {
  const { id: announcementId } = req.params;
  const { vehicleId, driverId } = req.body;
  const { userId, role, name, username } = req.user;
  const userName = name || username || 'کاربر ترابری';

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
      assignment_type: assignmentType, 
      assigned_driver_id: oldDriverId,
      assigned_vehicle_id: oldVehicleId,
      status: oldStatus,
      announcement_code: code 
    } = rows[0];
    
    // گرفتن مقاصد برای نمایش در توضیحات
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 3',
      [announcementId]
    );
    const destinations = destRows.rows.map(d => d.city).join('، ');
    const destinationLabel = destinations || 'بدون مقصد';
    
    // بررسی دسترسی
    if (role === 'transport_user' && assignmentType !== 'company') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Assignment not allowed in current queue for Transport Company.' });
    }
    if (role === 'personal_transport_user' && assignmentType !== 'personal') {
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
};
