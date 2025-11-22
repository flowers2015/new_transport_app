const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js
const crypto = require('crypto');
const {
  logFreightHistory,
  compareObjects,
  compareDestinations,
  calculateTotalFreightCost,
  generateChangeDescription
} = require('../services/freightHistoryService');
const { formatJalali, parseJalaliDateString, jalaliToGregorian, timestampToJalaliDate } = require('../utils/jalali');

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

function jalaliDateToDate(jy, jm, jd) {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

function shiftJalaliMonth(jy, jm, offset) {
  let year = jy;
  let month = jm + offset;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  return { year, month };
}

function getJalaliMonthRange(jy, jm, offset) {
  const { year: startYear, month: startMonth } = shiftJalaliMonth(jy, jm, offset);
  const startDate = jalaliDateToDate(startYear, startMonth, 1);
  const { year: nextYear, month: nextMonth } = shiftJalaliMonth(startYear, startMonth, 1);
  const nextStartDate = jalaliDateToDate(nextYear, nextMonth, 1);
  return {
    start: startDate,
    endExclusive: nextStartDate,
    jalali: { year: startYear, month: startMonth }
  };
}

function roundNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calculateMedian(values) {
  if (!values || values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function calculateMode(values, precision = 2) {
  if (!values || values.length === 0) {
    return null;
  }

  const counts = new Map();
  let maxCount = 0;
  let modeValue = null;

  values.forEach(value => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return;
    }
    const rounded = Number(value.toFixed(precision));
    const freq = (counts.get(rounded) || 0) + 1;
    counts.set(rounded, freq);

    if (freq > maxCount || (freq === maxCount && (modeValue === null || rounded < modeValue))) {
      maxCount = freq;
      modeValue = rounded;
    }
  });

  return modeValue;
}

/**
 * Fetches all freight announcements with related information.
 */
async function getFreightAnnouncements(req, res) {
  try {
    // اگر includeLeftover=true باشد، Leftover را هم شامل می‌کند (برای صفحه برنامه ریزی)
    // ChangeRequested باید نمایش داده شود تا planner بتواند آن را ببیند و تأیید/رد کند
    // اگر includeFinalized=true باشد، Finalized و InTransit را هم شامل می‌کند (برای Freight Finance)
    const { includeLeftover, includeFinalized } = req.query;
    
    let whereClause = "WHERE fa.status NOT IN (";
    if (includeFinalized === 'true') {
      // برای Freight Finance: فقط Reannounced, Archived, Cancelled را فیلتر کن
      whereClause += "'Reannounced', 'Archived', 'Cancelled'";
    } else {
      // برای Transport Live: Finalized را هم فیلتر کن
      whereClause += "'Finalized', 'Reannounced', 'Archived', 'Cancelled'";
    }
    if (includeLeftover !== 'true') {
      whereClause += ", 'Leftover'";
    }
    whereClause += ")";
    
    console.log(`🔍 [getFreightAnnouncements] includeLeftover=${includeLeftover}, includeFinalized=${includeFinalized}, whereClause=${whereClause}`);
    
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (fa.id)
        fa.*,
        fa.rejection_reason,
        COALESCE(d.name, pd.name) as assigned_driver_name,
        COALESCE(d.employee_id, pd.driver_smart_id) as assigned_driver_employee_id,
        v.model as assigned_vehicle_model,
        v.brand as assigned_vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
        da.assignment_finalized_at,
        -- تشخیص assignment_type: اگر driver در personal_drivers است، personal است
        CASE 
          WHEN pd.id IS NOT NULL THEN 'personal'
          WHEN fa.assignment_type IS NOT NULL THEN fa.assignment_type
          WHEN d.id IS NOT NULL THEN 'company'
          ELSE NULL
        END as detected_assignment_type
      FROM freight_announcements fa
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      LEFT JOIN personal_drivers pd ON fa.assigned_driver_id = pd.id
      LEFT JOIN LATERAL (
        SELECT assignment_finalized_at
        FROM dispatch_assignments
        WHERE freight_announcement_id = fa.id 
          AND (is_cancelled IS NULL OR is_cancelled = FALSE)
        ORDER BY created_at DESC
        LIMIT 1
      ) da ON true
      ${whereClause}
      ORDER BY fa.id, fa.created_at DESC
    `);
    
    const finalizedCount = rows.filter(r => r.status === 'Finalized').length;
    const inTransitCount = rows.filter(r => r.status === 'InTransit').length;
    const leftoverCount = rows.filter(r => r.status === 'Leftover').length;
    console.log(`📊 [getFreightAnnouncements] Found ${rows.length} announcements. Leftover: ${leftoverCount}, Finalized: ${finalizedCount}, InTransit: ${inTransitCount}`);
    
    // Fetch destinations for each announcement and convert dates
    const allDestinationsStats = {
      total: 0,
      pakhsh: 0,
      namayande: 0,
      namayandeNames: new Set(),
      sampleDestinations: []
    };
    
    for (let announcement of rows) {
      const destRows = await pool.query(
        'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC',
        [announcement.id]
      );
      announcement.destinations = destRows.rows;
      
      // آمار representative_name
      destRows.rows.forEach(dest => {
        allDestinationsStats.total++;
        const repName = dest.representative_name || '';
        const normalizedRepName = repName === null || repName === '' ? '' : repName;
        const isPakhsh = normalizedRepName === 'پخش' || normalizedRepName === '';
        
        if (isPakhsh) {
          allDestinationsStats.pakhsh++;
        } else {
          allDestinationsStats.namayande++;
          allDestinationsStats.namayandeNames.add(normalizedRepName);
          if (allDestinationsStats.sampleDestinations.length < 10) {
            allDestinationsStats.sampleDestinations.push({
              annId: announcement.id,
              annCode: announcement.announcement_code || 'N/A',
              city: dest.city || '',
              repName: normalizedRepName,
              destId: dest.id
            });
          }
        }
      });
      
      // اگر assignment_type null است اما detected_assignment_type داریم، از آن استفاده کن
      if (!announcement.assignment_type && announcement.detected_assignment_type) {
        announcement.assignment_type = announcement.detected_assignment_type;
      }
      
      // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
      if (announcement.loading_date) {
        const before = announcement.loading_date;
        announcement.loading_date = normalizeJalaliDate(announcement.loading_date);
        if (before !== announcement.loading_date) {
          console.log(`📅 [getFreightAnnouncements] ID ${announcement.id}: "${before}" → "${announcement.loading_date}"`);
        }
      }
    }
    
    // لاگ آمار نماینده‌ها و پخش‌ها
    console.log('📊 [getFreightAnnouncements] آمار نماینده‌ها و پخش‌ها:', {
      totalDestinations: allDestinationsStats.total,
      pakhshCount: allDestinationsStats.pakhsh,
      namayandeCount: allDestinationsStats.namayande,
      uniqueNamayandeNames: Array.from(allDestinationsStats.namayandeNames),
      sampleNamayandeDestinations: allDestinationsStats.sampleDestinations
    });
    
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
        
        // اگر فقط وضعیت از Draft یا Leftover به PendingManagerApproval تغییر کرده (ارجاع)، فقط تغییر وضعیت را ثبت کن
        // تغییرات کرایه و سایر فیلدها در این مرحله معنی ندارند
        let filteredChanges = allChanges;
        if ((oldRecord.status === 'Draft' || oldRecord.status === 'Leftover') && newRecord.status === 'PendingManagerApproval') {
          // فقط تغییر وضعیت را نگه دار، بقیه را حذف کن
          // حذف تمام فیلدها به جز status
          filteredChanges = {};
          if (allChanges && allChanges.status) {
            filteredChanges.status = allChanges.status;
          } else {
            // اگر status در allChanges نیست، آن را از oldStatus و newStatus بساز
            filteredChanges.status = {
              old: oldRecord.status,
              new: newRecord.status
            };
          }
        }
        
        const description = generateChangeDescription(
          action,
          filteredChanges,
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
          fieldChanges: filteredChanges,
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
    // گرفتن شهر برای نمایش در توضیحات (از همان destRows استفاده می‌کنیم)
    const city = destRows.rows[0]?.city || 'بدون مقصد';
    const description = `اعلام بار به مقصد ${city} ایجاد شد (${lineType})`;
    
    console.log(`📝 [createFreightAnnouncement] Creating history entry:`, {
      announcementId: id,
      city,
      lineType,
      description,
      destinationsCount: destRows.rows.length,
      firstDestination: destRows.rows[0]
    });
    
    await logFreightHistory({
      announcementId: id,
      userId: userId,
      userName: userName,
      action: 'CREATED',
      newStatus: status,
      description: description,
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
    // تبدیل نام کاربر به فارسی
    const userLabel = userName === 'personal_transport_user' ? 'کاربر ترابری (شخصی)' : 
                     userName === 'transport_user' ? 'کاربر ترابری (شرکت)' : userName;
    const description = `بار به مقصد ${destinationLabel} توسط ${userLabel} به صف ${queueLabel} ارجاع شد`;
    
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
    const { date, destination, billOfLading, driverName, lineType } = req.query;
    
    let query = `
      SELECT 
        fa.*,
        fa.rejection_reason,
        fa.bill_of_lading_number,
        COALESCE(d.name, pd.name) as assigned_driver_name,
        COALESCE(d.employee_id, pd.driver_smart_id) as assigned_driver_employee_id,
        v.model as assigned_vehicle_model,
        v.brand as assigned_vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
      FROM freight_announcements fa
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN personal_drivers pd ON fa.assigned_driver_id = pd.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      WHERE fa.status IN ('Finalized', 'InTransit')
    `;
    const params = [];
    let paramIndex = 1;
    
    // فیلتر بر اساس lineType - فقط برای تب فعلی
    if (lineType && lineType.trim()) {
      query += ` AND fa.line_type = $${paramIndex}`;
      params.push(lineType.trim());
      paramIndex += 1;
      console.log(`📦 [getFreightHistory] Filtering by lineType: ${lineType}`);
    }
    
    // فیلتر بر اساس تاریخ شمسی بارگیری
    // تاریخ در دیتابیس به صورت DATE ذخیره می‌شود اما با سال شمسی (1404)
    // پس باید مستقیماً با تاریخ شمسی مقایسه کنیم
    if (date && date.trim() !== '') {
      // پذیرش فرمت 1404/05/01 یا 1404-05-01
      const normalizedDate = date.trim().replace(/\//g, '-'); // تبدیل `/` به `-`
      const dateMatch = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (dateMatch) {
        const [, jy, jm, jd] = dateMatch.map(Number);
        
        // تبدیل به فرمت YYYY-MM-DD برای مقایسه مستقیم با تاریخ شمسی در دیتابیس
        const jalaliDateStr = `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
        
        console.log(`📅 [getFreightHistory] Filtering by loading_date: ${date} (${jy}/${jm}/${jd})`);
        console.log(`📅 [getFreightHistory] Jalali date string: ${jalaliDateStr}`);
        
        // استفاده از SUBSTRING برای استخراج تاریخ شمسی از loading_date و مقایسه
        // loading_date در دیتابیس به صورت DATE است اما با سال شمسی (1404)
        // پس باید مستقیماً با string مقایسه کنیم
        query += ` AND SUBSTRING(CAST(fa.loading_date AS TEXT) FROM 1 FOR 10) = $${paramIndex}`;
        params.push(jalaliDateStr);
        paramIndex += 1;
      } else {
        console.log(`⚠️ [getFreightHistory] Invalid date format: ${date}. Expected: 1404-05-01 or 1404/05/01`);
      }
    } else {
      console.log(`📅 [getFreightHistory] No date filter - showing all Finalized announcements`);
    }
    
    query += ' ORDER BY fa.loading_date DESC, fa.created_at DESC';
    
    console.log(`🔍 [getFreightHistory] Query:`, query);
    console.log(`🔍 [getFreightHistory] Params:`, params);
    
    const { rows } = await pool.query(query, params);
    
    console.log(`📊 [getFreightHistory] Found ${rows.length} Finalized/InTransit announcements`);
    
    // Fetch destinations for each announcement and convert dates
    const filteredRows = [];
    for (let announcement of rows) {
      // فیلتر بر اساس شماره بارنامه
      if (billOfLading && billOfLading.trim()) {
        const billOfLadingValue = (announcement.bill_of_lading_number || '').toString().toLowerCase();
        if (!billOfLadingValue.includes(billOfLading.trim().toLowerCase())) {
          continue; // skip این announcement
        }
      }
      
      // فیلتر بر اساس نام راننده
      if (driverName && driverName.trim()) {
        const driverNameValue = (announcement.assigned_driver_name || '').toString().toLowerCase();
        if (!driverNameValue.includes(driverName.trim().toLowerCase())) {
          continue; // skip این announcement
        }
      }
      
      // همیشه همه destinations را بگیر
      const allDestRows = await pool.query('SELECT * FROM freight_destinations WHERE freight_announcement_id = $1', [announcement.id]);
      
      // اگر فیلتر مقصد داریم، بررسی کن که آیا حداقل یک destination matching دارد
      if (destination && destination.trim()) {
        const matchingDests = allDestRows.rows.filter(d => 
          d.city && d.city.toLowerCase().includes(destination.trim().toLowerCase())
        );
        
        // اگر هیچ destination matching نداشت، این announcement را skip کن
        if (matchingDests.length === 0) {
          continue;
        }
        
        // فقط destinations matching را نگه دار
        announcement.destinations = matchingDests;
      } else {
        // اگر فیلتر نداریم، همه destinations را بگیر
        announcement.destinations = allDestRows.rows;
      }
      
      // تبدیل فرمت تاریخ از 1404-08-14 به 1404/08/14 (اگر لازم باشد)
      if (announcement.loading_date) {
        const before = announcement.loading_date;
        announcement.loading_date = normalizeJalaliDate(announcement.loading_date);
        if (before !== announcement.loading_date) {
          console.log(`📅 [getFreightHistory] ID ${announcement.id}: "${before}" → "${announcement.loading_date}"`);
        }
      }
      
      filteredRows.push(announcement);
    }
    
    console.log(`✅ [getFreightHistory] Returning ${filteredRows.length} filtered announcements`);
    res.json(filteredRows);
  } catch (error) {
    console.error('❌ [getFreightHistory] Failed to get freight history:', error);
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
        // تخصیص دارد → status را به InTransit تغییر می‌دهیم (اگر قبلاً InTransit نبود)
        // این باعث می‌شود که از "پیگیری اعلام بار زنده" خارج شود
        // اما در "تابلو اعلام بار" باقی می‌ماند (چون InTransit در getBoard نمایش داده می‌شود)
        const oldStatus = ann.status || 'Assigned';
        const newStatus = 'InTransit';
        
        // آپدیت status اعلام بار (فقط اگر قبلاً InTransit نبود)
        if (oldStatus !== 'InTransit' && oldStatus !== 'in_transit') {
          await client.query(
            `UPDATE freight_announcements 
             SET status = $1, updated_at = NOW() 
             WHERE id = $2`,
            [newStatus, annId]
          );
        }
        
        // آپدیت dispatch_assignments برای ثبت زمان نهایی‌سازی
        // این مهم است که assignment_finalized_at set شود تا در frontend فیلتر شود
        // ابتدا بررسی می‌کنیم که آیا dispatch_assignments برای این اعلام بار وجود دارد یا نه
        const checkDispatch = await client.query(
          `SELECT id FROM dispatch_assignments 
           WHERE freight_announcement_id = $1 
           AND (is_cancelled IS NULL OR is_cancelled = FALSE)
           LIMIT 1`,
          [annId]
        );
        
        if (checkDispatch.rowCount > 0) {
          // اگر dispatch_assignments وجود دارد، فقط assignment_finalized_at را set می‌کنیم
          const updateResult = await client.query(
            `UPDATE dispatch_assignments 
             SET assignment_finalized_at = NOW() 
             WHERE freight_announcement_id = $1 
             AND (assignment_finalized_at IS NULL OR is_cancelled = FALSE)
             RETURNING id`,
            [annId]
          );
          console.log(`✅ [finalizeAssignments] Assignment finalized for ${annId}, status: ${oldStatus} -> ${newStatus}, assignment_finalized_at updated: ${updateResult.rowCount > 0}`);
        } else {
          // اگر dispatch_assignments وجود ندارد، یک رکورد جدید ایجاد می‌کنیم
          // این برای تخصیص‌های شخصی که ممکن است dispatch_assignments نداشته باشند
          // stage باید 'stage1' یا 'stage2' باشد - برای تخصیص شخصی از 'stage2' استفاده می‌کنیم
          // برای تخصیص‌های شخصی، vehicle_id و driver_id ممکن است به جداول personal_vehicles و personal_drivers اشاره کنند
          // پس باید آنها را null بگذاریم یا بررسی کنیم که آیا در جداول company وجود دارند یا نه
          let vehicleIdForDispatch = null;
          let driverIdForDispatch = null;
          
          // بررسی اینکه آیا vehicle_id در جدول vehicles وجود دارد
          if (ann.assigned_vehicle_id) {
            const vehicleCheck = await client.query(
              'SELECT id FROM vehicles WHERE id = $1',
              [ann.assigned_vehicle_id]
            );
            if (vehicleCheck.rowCount > 0) {
              vehicleIdForDispatch = ann.assigned_vehicle_id;
            }
          }
          
          // بررسی اینکه آیا driver_id در جدول drivers وجود دارد
          if (ann.assigned_driver_id) {
            const driverCheck = await client.query(
              'SELECT id FROM drivers WHERE id = $1',
              [ann.assigned_driver_id]
            );
            if (driverCheck.rowCount > 0) {
              driverIdForDispatch = ann.assigned_driver_id;
            }
          }
          
          const insertResult = await client.query(
            `INSERT INTO dispatch_assignments 
             (freight_announcement_id, vehicle_id, driver_id, stage, assignment_finalized_at, created_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING id`,
            [annId, vehicleIdForDispatch, driverIdForDispatch, 'stage2']
          );
          console.log(`✅ [finalizeAssignments] Assignment finalized for ${annId}, status: ${oldStatus} -> ${newStatus}, dispatch_assignments created: ${insertResult.rowCount > 0}, vehicle_id: ${vehicleIdForDispatch}, driver_id: ${driverIdForDispatch}`);
        }
        
        finalizedIds.push(annId);
        
        // ثبت تاریخچه
        await logFreightHistory({
          announcementId: annId,
          userId: userId,
          userName: name || username || 'کاربر',
          action: 'ASSIGNMENT_FINALIZED',
          oldStatus: oldStatus,
          newStatus: newStatus,
          description: `تخصیص نهایی شد - بار از پیگیری اعلام بار زنده خارج شد (در تابلو اعلام بار باقی می‌ماند)`,
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
    
    // منطق فیلتر تاریخ:
    // - اگر timeRange = 'day' و year و month داده شده: آمار روزانه یک ماه خاص (تاریخچه)
    // - اگر timeRange = 'day' و هیچ فیلتر تاریخی داده نشده: آمار روزانه زنده (امروز)
    // - اگر timeRange = 'month' یا 'year': آمار ماهانه/سالانه (تاریخچه)
    
    let dateFilter = '';
    let dateParams = [];
    let isDailyHistorical = false; // آیا آمار روزانه برای تاریخچه است (نه زنده)
    
    // برای آمار روزانه (timeRange = 'day'):
    if (timeRange === 'day' && year && month) {
      // آمار روزانه برای یک ماه خاص (تاریخچه)
      isDailyHistorical = true;
      if (day) {
        // روز خاص: فیلتر بر اساس YYYY-MM-DD یا YYYY/MM/DD
        const jalaliDate1 = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const jalaliDate2 = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        dateFilter = "WHERE (CAST(fa.loading_date AS TEXT) = $1 OR CAST(fa.loading_date AS TEXT) = $2)";
        dateParams = [jalaliDate1, jalaliDate2];
        console.log(`📊 [TransportStatistics] Date filter: Daily historical - Specific day (${jalaliDate1} or ${jalaliDate2})`);
      } else {
        // ماه خاص: فیلتر بر اساس YYYY-MM یا YYYY/MM (برای آمار روزانه یک ماه)
        const jalaliMonth1 = `${year}-${String(month).padStart(2, '0')}`;
        const jalaliMonth2 = `${year}/${String(month).padStart(2, '0')}`;
        dateFilter = "WHERE (CAST(fa.loading_date AS TEXT) LIKE $1 OR CAST(fa.loading_date AS TEXT) LIKE $2)";
        dateParams = [`${jalaliMonth1}-%`, `${jalaliMonth2}/%`];
        console.log(`📊 [TransportStatistics] Date filter: Daily historical - Specific month (${jalaliMonth1} or ${jalaliMonth2})`);
      }
    } else if (timeRange !== 'day') {
      // برای آمار ماهانه/سالانه
      if (year && month && day) {
        // روز خاص: فیلتر بر اساس YYYY-MM-DD یا YYYY/MM/DD (فرمت شمسی)
        const jalaliDate1 = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const jalaliDate2 = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        dateFilter = "WHERE (CAST(fa.loading_date AS TEXT) = $1 OR CAST(fa.loading_date AS TEXT) = $2)";
        dateParams = [jalaliDate1, jalaliDate2];
        console.log(`📊 [TransportStatistics] Date filter: Specific day (${jalaliDate1} or ${jalaliDate2})`);
      } else if (year && month) {
        // ماه خاص: فیلتر بر اساس YYYY-MM یا YYYY/MM
        const jalaliMonth1 = `${year}-${String(month).padStart(2, '0')}`;
        const jalaliMonth2 = `${year}/${String(month).padStart(2, '0')}`;
        dateFilter = "WHERE (CAST(fa.loading_date AS TEXT) LIKE $1 OR CAST(fa.loading_date AS TEXT) LIKE $2)";
        dateParams = [`${jalaliMonth1}-%`, `${jalaliMonth2}/%`];
        console.log(`📊 [TransportStatistics] Date filter: Specific month (${jalaliMonth1} or ${jalaliMonth2})`);
      } else if (year) {
        // سال خاص: فیلتر بر اساس YYYY
        dateFilter = "WHERE (CAST(fa.loading_date AS TEXT) LIKE $1 OR CAST(fa.loading_date AS TEXT) LIKE $2)";
        dateParams = [`${year}-%`, `${year}/%`];
        console.log(`📊 [TransportStatistics] Date filter: All months of year ${year}`);
      }
    }
    
    // Build line type filter
    let lineTypeFilter = '';
    if (lineType && lineType !== 'all') {
      const lineTypeParam = dateParams.length + 1;
      lineTypeFilter = dateFilter ? ` AND fa.line_type = $${lineTypeParam}` : `WHERE fa.line_type = $${lineTypeParam}`;
      dateParams.push(lineType);
    }
    
    // فیلتر status:
    // برای آمار روزانه زنده (timeRange = 'day' و بدون فیلتر تاریخ): فقط بارهایی که الان در کارتابل هستند
    //   یعنی: PendingCompanyAssignment, PendingPersonalAssignment, Assigned, InTransit
    // برای آمار روزانه تاریخچه (timeRange = 'day' و با فیلتر تاریخ): همه بارهایی که به دست ترابری رسیده‌اند
    //   حذف فقط: Draft, PendingManagerApproval, Rejected
    // برای آمار ماهانه/سالانه (timeRange = 'month' or 'year'): 
    //   همه بارهایی که در آن بازه زمانی به دست ترابری رسیده‌اند (حتی اگر الان Finalized یا Leftover باشند)
    //   حذف فقط: Draft, PendingManagerApproval, Rejected
    // نکته: status ها در دیتابیس به انگلیسی ذخیره می‌شوند (مگر برخی که فارسی هستند)
    let statusFilter = '';
    if (timeRange === 'day' && !isDailyHistorical) {
      // برای آمار روزانه زنده: فقط statusهای فعال در کارتابل (زنده)
      if (dateFilter || lineTypeFilter) {
        statusFilter = ` AND fa.status IN ('PendingCompanyAssignment', 'PendingPersonalAssignment', 'Assigned', 'InTransit')`;
      } else {
        statusFilter = `WHERE fa.status IN ('PendingCompanyAssignment', 'PendingPersonalAssignment', 'Assigned', 'InTransit')`;
      }
    } else {
      // برای آمار روزانه تاریخچه یا آمار ماهانه/سالانه: حذف فقط Draft, PendingManagerApproval, Rejected
      if (dateFilter || lineTypeFilter) {
        statusFilter = ` AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced')`;
      } else {
        statusFilter = `WHERE fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced')`;
      }
    }
    
    // ترکیب تمام فیلترها
    let whereClause = dateFilter + lineTypeFilter + statusFilter;
    if (!whereClause) {
      whereClause = '';
    }
    
    console.log('📊 [TransportStatistics] Status filter:', statusFilter);
    
    // Determine grouping based on timeRange
    // برای آمار روزانه زنده (timeRange = 'day' و بدون فیلتر تاریخ): بدون گروه‌بندی (یک ردیف برای امروز)
    // برای آمار روزانه تاریخچه (timeRange = 'day' و با فیلتر تاریخ): گروه‌بندی بر اساس روز
    // برای آمار ماهانه/سالانه: گروه‌بندی بر اساس تاریخ بارگیری
    let groupBy = '';
    let dateFormat = '';
    if (timeRange === 'day' && isDailyHistorical) {
      // برای آمار روزانه تاریخچه: گروه‌بندی بر اساس روز (YYYY-MM-DD)
      groupBy = "CAST(fa.loading_date AS TEXT)";
      dateFormat = "CAST(fa.loading_date AS TEXT)";
      console.log(`📊 [TransportStatistics] Daily historical stats - grouping by day`);
    } else if (timeRange === 'day') {
      // برای آمار روزانه زنده: چون تاریخ فیلتر نمی‌شود، فقط یک ردیف برای همه بارهای کارتابل برمی‌گردانیم
      // از یک مقدار ثابت برای time_period استفاده می‌کنیم (تاریخ امروز شمسی برای نمایش)
      const today = new Date();
      const jalaliUtils = require('../utils/jalali');
      const [jy, jm, jd] = jalaliUtils.gregorianToJalali(
        today.getFullYear(), 
        today.getMonth() + 1, 
        today.getDate()
      );
      const todayJalali = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
      console.log(`📊 [TransportStatistics] Daily live stats - today gregorian: ${today.toISOString().split('T')[0]}, jalali: ${todayJalali}`);
      // فقط یک مقدار ثابت برمی‌گردانیم (بدون GROUP BY)
      groupBy = `NULL`; // برای جلوگیری از GROUP BY
      // Escape single quotes in todayJalali for SQL
      const escapedJalali = todayJalali.replace(/'/g, "''");
      dateFormat = `'${escapedJalali}'::text`;
    } else if (timeRange === 'month') {
      // برای ماه: استخراج YYYY-MM از تاریخ (7 کاراکتر اول)
      // تاریخ‌ها در دیتابیس به صورت VARCHAR ذخیره شده‌اند (1404-08-12)
      // استفاده از SUBSTRING برای استخراج 7 کاراکتر اول
      // اگر loading_date به صورت DATE ذخیره شده باشد، باید به TEXT تبدیل شود
      // اما چون ممکن است به صورت VARCHAR باشد، باید مستقیماً SUBSTRING کنیم
      groupBy = "SUBSTRING(CAST(fa.loading_date AS TEXT) FROM 1 FOR 7)";
      dateFormat = "SUBSTRING(CAST(fa.loading_date AS TEXT) FROM 1 FOR 7)";
    } else if (timeRange === 'year') {
      // برای سال: 4 کاراکتر اول را برگردان (YYYY)
      groupBy = "SUBSTRING(CAST(fa.loading_date AS TEXT) FROM 1 FOR 4)";
      dateFormat = "SUBSTRING(CAST(fa.loading_date AS TEXT) FROM 1 FOR 4)";
    }
    
    // Query for statistics
    let query = '';
    if (timeRange === 'day' && isDailyHistorical) {
      // برای آمار روزانه تاریخچه: با GROUP BY روز
      query = `
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
    } else if (timeRange === 'day') {
      // برای آمار روزانه زنده: بدون GROUP BY، فقط یک ردیف برمی‌گردد
      query = `
      SELECT 
          ${dateFormat} as time_period,
        COUNT(*) as total_requests,
        COUNT(CASE WHEN fa.assignment_type = 'company' AND fa.assigned_driver_id IS NOT NULL THEN 1 END) as company_assignments,
        COUNT(CASE WHEN fa.assignment_type = 'personal' AND fa.assigned_driver_id IS NOT NULL THEN 1 END) as personal_assignments,
        COUNT(CASE WHEN fa.assigned_driver_id IS NOT NULL THEN 1 END) as total_assignments
      FROM freight_announcements fa
      ${whereClause}
      `;
    } else {
      // برای آمار ماهانه/سالانه: با GROUP BY
      query = `
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
    }
    
    console.log('📊 [TransportStatistics] Query:', query);
    console.log('📊 [TransportStatistics] Params:', dateParams);
    
    // Debug: بررسی تعداد کل بارها با status مناسب برای این lineType
    if (lineType && lineType !== 'all') {
      let debugQuery = '';
      if (timeRange === 'day') {
        // برای آمار روزانه: فقط statusهای فعال در کارتابل
        debugQuery = `
          SELECT COUNT(*) as total_count, 
                 COUNT(CASE WHEN fa.status IN ('PendingCompanyAssignment', 'PendingPersonalAssignment', 'Assigned', 'InTransit') THEN 1 END) as status_match_count
          FROM freight_announcements fa
          WHERE fa.line_type = $1
        `;
      } else {
        // برای آمار ماهانه/سالانه: همه به جز Draft, PendingManagerApproval, Rejected
        debugQuery = `
          SELECT COUNT(*) as total_count, 
                 COUNT(CASE WHEN fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced') THEN 1 END) as status_match_count
          FROM freight_announcements fa
          WHERE fa.line_type = $1
        `;
      }
      const debugResult = await pool.query(debugQuery, [lineType]);
      console.log(`📊 [TransportStatistics] Debug for ${lineType} (timeRange: ${timeRange}):`, {
        totalCount: debugResult.rows[0].total_count,
        statusMatchCount: debugResult.rows[0].status_match_count
      });
      
      // بررسی چند نمونه از تاریخ‌ها با status مناسب
      let sampleQuery = '';
      if (timeRange === 'day') {
        // برای آمار روزانه: فقط statusهای فعال در کارتابل
        sampleQuery = `
          SELECT loading_date, status, line_type
          FROM freight_announcements fa
          WHERE fa.line_type = $1 AND fa.status IN ('PendingCompanyAssignment', 'PendingPersonalAssignment', 'Assigned', 'InTransit')
          LIMIT 5
        `;
      } else {
        // برای آمار ماهانه/سالانه: همه به جز Draft, PendingManagerApproval, Rejected
        sampleQuery = `
          SELECT loading_date, status, line_type
          FROM freight_announcements fa
          WHERE fa.line_type = $1 AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced')
          LIMIT 5
        `;
      }
      const sampleResult = await pool.query(sampleQuery, [lineType]);
      console.log(`📊 [TransportStatistics] Sample records for ${lineType} (timeRange: ${timeRange}):`, sampleResult.rows);
      
      // بررسی تمام statusهای موجود برای این lineType
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM freight_announcements fa
        WHERE fa.line_type = $1
        GROUP BY status
        ORDER BY count DESC
      `;
      const statusResult = await pool.query(statusQuery, [lineType]);
      console.log(`📊 [TransportStatistics] All statuses for ${lineType}:`, statusResult.rows);
      
      // بررسی تمام ماه‌های موجود در دیتابیس برای این lineType و year (اگر year داده شده باشد)
      if (timeRange === 'month' && year) {
        const monthQuery = `
          SELECT DISTINCT SUBSTRING(CAST(fa.loading_date AS TEXT) FROM 1 FOR 7) as month_period
          FROM freight_announcements fa
          WHERE fa.line_type = $1 
            AND (CAST(fa.loading_date AS TEXT) LIKE $2 OR CAST(fa.loading_date AS TEXT) LIKE $3)
            AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced')
          ORDER BY month_period ASC
        `;
        const monthResult = await pool.query(monthQuery, [lineType, `${year}-%`, `${year}/%`]);
        console.log(`📊 [TransportStatistics] All months in DB for ${lineType} and year ${year}:`, monthResult.rows.map(r => r.month_period));
      }
    }
    
    const { rows } = await pool.query(query, dateParams);
    
    console.log('📊 [TransportStatistics] Raw rows from DB:', rows.length);
    if (rows.length > 0) {
      console.log('📊 [TransportStatistics] First raw row:', rows[0]);
      console.log('📊 [TransportStatistics] All raw time_periods:', rows.map(r => r.time_period));
    } else {
      console.log('⚠️ [TransportStatistics] No rows returned from query!');
    }
    
    // برای محاسبه اطلاعات اضافی (بارهای مانده، درصد تخصیص در هر روز)
    // باید تمام بارهای مربوط به این بازه زمانی را با تاریخ تخصیص بگیریم
    const jalaliUtils = require('../utils/jalali');
    
    // کوئری برای گرفتن تمام بارها با تاریخ تخصیص (از تاریخچه)
    // فقط برای آمار تاریخچه (نه برای daily live stats)
    let detailedResult = { rows: [] };
    if (isDailyHistorical || timeRange !== 'day') {
      let detailedQuery = `
        SELECT 
          fa.id,
          CAST(fa.loading_date AS TEXT) as loading_date,
          fa.line_type,
          fa.assigned_driver_id,
          fa.status,
          (
            SELECT MIN(fah.created_at) 
            FROM freight_announcement_history fah 
            WHERE fah.freight_announcement_id = fa.id 
              AND fah.action = 'ASSIGNED'
            LIMIT 1
          ) as assigned_at
        FROM freight_announcements fa
        ${whereClause}
      `;
      
      console.log(`📊 [TransportStatistics] Detailed query:`, detailedQuery);
      console.log(`📊 [TransportStatistics] Detailed query params:`, dateParams);
      detailedResult = await pool.query(detailedQuery, dateParams);
      console.log(`📊 [TransportStatistics] Detailed records: ${detailedResult.rows.length} total`);
      if (detailedResult.rows.length > 0) {
        console.log(`📊 [TransportStatistics] First detailed record:`, detailedResult.rows[0]);
      }
    } else {
      console.log(`📊 [TransportStatistics] Skipping detailed query for daily live stats`);
    }
    
    // محاسبه اطلاعات برای هر time_period
    const periodDetailsMap = new Map(); // key: time_period, value: details
    
    // برای هر بار، محاسبه کنیم که در کدام time_period قرار دارد
    for (const record of detailedResult.rows) {
      let recordTimePeriod = null;
      
      // تعیین time_period بر اساس timeRange
      if (timeRange === 'day' && isDailyHistorical) {
        // برای آمار روزانه: time_period = loading_date
        recordTimePeriod = record.loading_date?.replace(/-/g, '/');
      } else if (timeRange === 'month') {
        // برای آمار ماهانه: time_period = YYYY/MM
        const loadingDate = record.loading_date?.replace(/-/g, '/');
        if (loadingDate) {
          recordTimePeriod = loadingDate.substring(0, 7);
        }
      } else if (timeRange === 'year') {
        // برای آمار سالانه: time_period = YYYY
        const loadingDate = record.loading_date?.replace(/-/g, '/');
        if (loadingDate) {
          recordTimePeriod = loadingDate.substring(0, 4);
        }
      }
      
      if (!recordTimePeriod) continue;
      
      // اگر این period در map نیست، ایجاد کن
      if (!periodDetailsMap.has(recordTimePeriod)) {
        periodDetailsMap.set(recordTimePeriod, {
          period: recordTimePeriod,
          totalRequests: 0,
          assignedRecords: [], // بارهایی که تخصیص دارند
          leftoverFromPrevious: 0, // بارهای مانده از قبل
          assignmentByDay: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, '11+': 0 } // تخصیص در روز 0، 1، 2، ...
        });
      }
      
      const periodDetails = periodDetailsMap.get(recordTimePeriod);
      periodDetails.totalRequests++;
      
      // اگر تخصیص دارد، اطلاعات را محاسبه کن
      if (record.assigned_driver_id && record.assigned_at) {
        const assignedAtDate = new Date(record.assigned_at);
        const assignedAtJalali = jalaliUtils.timestampToJalaliDate(assignedAtDate);
        const loadingDateNormalized = record.loading_date?.replace(/-/g, '/');
        
        if (assignedAtJalali && loadingDateNormalized) {
          let daysDiff = jalaliUtils.daysDifferenceJalali(loadingDateNormalized, assignedAtJalali);
          
          // اگر daysDiff منفی باشد اما سال و ماه یکسان باشند، بررسی دقیق‌تر
          // اگر روزها نزدیک به هم باشند (تفاوت 1-2 روز)، احتمالاً به دلیل مشکل timezone است
          if (daysDiff < 0 && daysDiff >= -2) {
            const loadingMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(loadingDateNormalized);
            const assignedMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(assignedAtJalali);
            if (loadingMatch && assignedMatch) {
              const loadingYear = parseInt(loadingMatch[1], 10);
              const loadingMonth = parseInt(loadingMatch[2], 10);
              const loadingDay = parseInt(loadingMatch[3], 10);
              const assignedYear = parseInt(assignedMatch[1], 10);
              const assignedMonth = parseInt(assignedMatch[2], 10);
              const assignedDay = parseInt(assignedMatch[3], 10);
              // اگر سال و ماه یکسان باشند، احتمالاً تخصیص در همان روز یا روز بعد است
              if (loadingYear === assignedYear && loadingMonth === assignedMonth) {
                // اگر روزها یکسان باشند، daysDiff = 0
                if (loadingDay === assignedDay) {
                  daysDiff = 0;
                  console.log(`🔧 [TransportStatistics] Record ${record.id}: Fixed daysDiff to 0 (same day) - loadingDate: ${loadingDateNormalized}, assignedAt: ${assignedAtJalali}`);
                } else if (Math.abs(loadingDay - assignedDay) <= 1) {
                  // اگر تفاوت روز 1 باشد، daysDiff = 0 یا 1 بسته به اینکه کدام بزرگتر است
                  daysDiff = assignedDay > loadingDay ? 1 : 0;
                  console.log(`🔧 [TransportStatistics] Record ${record.id}: Fixed daysDiff to ${daysDiff} (same month, day diff=${Math.abs(loadingDay - assignedDay)}) - loadingDate: ${loadingDateNormalized}, assignedAt: ${assignedAtJalali}`);
                }
              }
            }
          }
          
          console.log(`📊 [TransportStatistics] Record ${record.id}: daysDiff calculation:`, {
            loadingDate: loadingDateNormalized,
            assignedAt: assignedAtJalali,
            daysDiff,
            assignedAtRaw: record.assigned_at
          });
          
          if (daysDiff !== null && daysDiff >= 0) {
            periodDetails.assignedRecords.push({
              daysDiff,
              loadingDate: loadingDateNormalized,
              assignedAt: assignedAtJalali
            });
            
            // دسته‌بندی بر اساس روز تخصیص
            if (daysDiff === 0) {
              periodDetails.assignmentByDay[0]++;
              console.log(`✅ [TransportStatistics] Record ${record.id}: Same day assignment (day 0) - loadingDate: ${loadingDateNormalized}, assignedAt: ${assignedAtJalali}`);
            } else if (daysDiff === 1) {
              periodDetails.assignmentByDay[1]++;
            } else if (daysDiff === 2) {
              periodDetails.assignmentByDay[2]++;
            } else if (daysDiff >= 3 && daysDiff <= 10) {
              periodDetails.assignmentByDay[daysDiff]++;
            } else if (daysDiff > 10) {
              periodDetails.assignmentByDay['11+']++;
            }
          } else {
            console.log(`⚠️ [TransportStatistics] Invalid daysDiff for record ${record.id}:`, {
              loadingDate: loadingDateNormalized,
              assignedAt: assignedAtJalali,
              daysDiff
            });
          }
        } else {
          console.log(`⚠️ [TransportStatistics] Missing dates for record ${record.id}:`, {
            loadingDate: loadingDateNormalized,
            assignedAt: assignedAtJalali,
            assignedAtRaw: record.assigned_at
          });
        }
      } else if (record.assigned_driver_id && !record.assigned_at) {
        // بار تخصیص دارد اما تاریخ تخصیص در تاریخچه نیست
        console.log(`⚠️ [TransportStatistics] Record ${record.id} has assigned_driver_id but no assigned_at in history`);
      }
      
      // بررسی بارهای مانده از روز قبل (برای آمار روزانه)
      // یک بار مانده است اگر loading_date آن قبل از time_period باشد
      if (timeRange === 'day' && isDailyHistorical && record.loading_date) {
        const loadingDateNormalized = record.loading_date.replace(/-/g, '/');
        // مقایسه تاریخ شمسی (فرمت YYYY/MM/DD)
        if (loadingDateNormalized && loadingDateNormalized < recordTimePeriod) {
          periodDetails.leftoverFromPrevious++;
        }
      }
    }
    
    // Calculate success rate for each period
    // همچنین باید time_period را normalize کنیم (تبدیل `-` به `/`)
    // و برای آمار ماهانه، اطمینان حاصل کنیم که فقط YYYY/MM برگردانده می‌شود (نه YYYY/MM/DD)
    const statistics = rows.map(row => {
      let timePeriod = row.time_period;
      if (typeof timePeriod === 'string') {
        // برای آمار ماهانه: اطمینان حاصل کنیم که فقط 7 کاراکتر اول را می‌گیریم (YYYY-MM یا YYYY/MM)
        if (timeRange === 'month') {
          // همیشه فقط 7 کاراکتر اول را بگیر (حتی اگر از دیتابیس بیشتر برگردانده شود)
          timePeriod = timePeriod.substring(0, 7);
          // اگر timePeriod به صورت YYYY/MM/DD است (10 کاراکتر)، فقط 7 کاراکتر اول را بگیر
          if (timePeriod.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
            timePeriod = timePeriod.substring(0, 7);
          }
        }
        
        // برای آمار سالانه: اطمینان حاصل کنیم که فقط 4 کاراکتر اول را می‌گیریم (YYYY)
        if (timeRange === 'year') {
          // همیشه فقط 4 کاراکتر اول را بگیر
          timePeriod = timePeriod.substring(0, 4);
        }
        
        // تبدیل `-` به `/` (بعد از اینکه طول را محدود کردیم)
        timePeriod = timePeriod.replace(/-/g, '/');
      }
      
      // پیدا کردن اطلاعات اضافی از periodDetailsMap
      // باید قبل از normalize کردن timePeriod، با key اصلی هم چک کنیم
      let periodDetails = periodDetailsMap.get(timePeriod);
      if (!periodDetails) {
        // اگر پیدا نشد، با key قبل از normalize (با -) هم چک کن
        const timePeriodWithDash = timePeriod.replace(/\//g, '-');
        periodDetails = periodDetailsMap.get(timePeriodWithDash);
      }
      if (!periodDetails) {
        // اگر باز هم پیدا نشد، با key بعد از normalize (با /) هم چک کن
        const timePeriodWithSlash = timePeriod.replace(/-/g, '/');
        periodDetails = periodDetailsMap.get(timePeriodWithSlash);
      }
      
      if (periodDetails) {
        console.log(`✅ [TransportStatistics] Found periodDetails for ${timePeriod}:`, {
          totalRequests: periodDetails.totalRequests,
          assignedRecords: periodDetails.assignedRecords.length,
          assignmentByDay: periodDetails.assignmentByDay
        });
      } else {
        console.log(`⚠️ [TransportStatistics] No periodDetails found for ${timePeriod}. Map keys:`, Array.from(periodDetailsMap.keys()));
      }
      
      const totalRequests = parseInt(row.total_requests) || 0;
      const totalAssignments = parseInt(row.total_assignments) || 0;
      const successRate = totalRequests > 0 
        ? Math.round((totalAssignments / totalRequests) * 100)
        : 0;
      
      // محاسبه درصد تخصیص در هر روز
      const assignmentPercentagesByDay = {};
      if (periodDetails && periodDetails.assignedRecords.length > 0) {
        const totalAssigned = periodDetails.assignedRecords.length;
        for (const [day, count] of Object.entries(periodDetails.assignmentByDay)) {
          if (count > 0) {
            assignmentPercentagesByDay[day] = Math.round((count / totalAssigned) * 100);
          }
        }
        console.log(`📊 [TransportStatistics] Calculated assignmentPercentagesByDay for ${timePeriod}:`, assignmentPercentagesByDay);
      } else if (totalAssignments > 0 && periodDetails) {
        console.log(`⚠️ [TransportStatistics] totalAssignments=${totalAssignments} but assignedRecords.length=${periodDetails?.assignedRecords?.length || 0} for ${timePeriod}`);
      }
      
      const result = {
        timePeriod,
        totalRequests,
        companyAssignments: parseInt(row.company_assignments) || 0,
        personalAssignments: parseInt(row.personal_assignments) || 0,
        totalAssignments,
        successRate
      };
      
      // اضافه کردن اطلاعات اضافی اگر موجود باشد
      if (periodDetails) {
        result.leftoverFromPrevious = periodDetails.leftoverFromPrevious;
        result.assignmentByDay = periodDetails.assignmentByDay; // تعداد مطلق
        result.assignmentPercentagesByDay = assignmentPercentagesByDay; // درصد
        result.totalAssigned = periodDetails.assignedRecords.length;
      } else {
        result.leftoverFromPrevious = 0;
        result.assignmentByDay = {};
        result.assignmentPercentagesByDay = {};
        result.totalAssigned = 0;
      }
      
      return result;
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

/**
 * آمار نمایندگان بر اساس شهر و نماینده
 * برای ترابری‌ها: لیست نمایندگان با تعداد ارسال، تعداد شرکتی/شخصی، مبلغ کرایه، تعداد بارنامه‌های پرداخت نشده
 */
async function getRepresentativeStatistics(req, res) {
  try {
    const { year, month, day, timeRange = 'month' } = req.query;
    
    console.log('📊 [RepresentativeStatistics] Request:', { year, month, day, timeRange });
    
    // ساخت dateFilter بر اساس timeRange
    let dateFilter = '';
    const dateParams = [];
    let paramIdx = 1;
    
    if (timeRange === 'day' && year && month) {
      // آمار روزانه تاریخی
      if (day) {
        const dayStr = day.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-${dayStr}`);
        dateParams.push(`${year}/${month}/${dayStr}`);
        paramIdx += 2;
      } else {
        // تمام روزهای ماه
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-%`);
        dateParams.push(`${year}/${month}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'month' && year) {
      if (month) {
        // ماه خاص
        const monthStr = month.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${monthStr}-%`);
        dateParams.push(`${year}/${monthStr}/%`);
        paramIdx += 2;
      } else {
        // تمام ماه‌های سال
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-%`);
        dateParams.push(`${year}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'year' && year) {
      dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
      dateParams.push(`${year}-%`);
      dateParams.push(`${year}/%`);
      paramIdx += 2;
    }
    
    // فیلتر status: فقط بارهایی که تخصیص دارند یا finalized/leftover هستند
    const statusFilter = `AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced')`;
    
    // کوئری اصلی: آمار بر اساس نماینده/پخش و شهر - فقط تخصیص‌ها را می‌شمارد
    // نمایش همه ترکیبات: پخش مشهد، احمدی مشهد، حسنی مشهد و ...
    // منطق پرداخت نشده: اگر freight_transaction وجود دارد و is_paid = false است، یا اگر freight_transaction وجود ندارد اما freight_cost > 0 و personal است
    // برای assignment_type null: اگر assigned_driver_id دارد اما assignment_type null است، در شرکتی شمارش می‌شود
    // مهم: استفاده از fd.freight_cost (کرایه هر مقصد) به جای fa.total_freight_cost (کرایه کل)
    const query = `
      SELECT 
        COALESCE(NULLIF(fd.representative_name, ''), 'پخش') as representative_name,
        fd.city,
        fa.line_type,
        COUNT(DISTINCT CASE WHEN fa.assigned_driver_id IS NOT NULL THEN fa.id END) as total_freights,
        COUNT(DISTINCT CASE 
          WHEN fa.assigned_driver_id IS NOT NULL 
          AND (fa.assignment_type = 'company' OR fa.assignment_type IS NULL)
          THEN fa.id 
        END) as company_count,
        COUNT(DISTINCT CASE WHEN fa.assignment_type = 'personal' AND fa.assigned_driver_id IS NOT NULL THEN fa.id END) as personal_count,
        COALESCE(SUM(CASE WHEN fa.assignment_type = 'personal' AND fa.assigned_driver_id IS NOT NULL THEN COALESCE(fd.freight_cost, 0) ELSE 0 END), 0) as total_personal_freight_cost,
        COUNT(DISTINCT CASE 
          WHEN fa.assigned_driver_id IS NOT NULL 
          AND fa.assignment_type = 'personal'
          AND COALESCE(fd.freight_cost, 0) > 0
          AND (
            (EXISTS (SELECT 1 FROM freight_transactions ft2 WHERE ft2.announcement_id = fa.id AND ft2.is_paid = false))
            OR (NOT EXISTS (SELECT 1 FROM freight_transactions ft3 WHERE ft3.announcement_id = fa.id))
          )
          THEN fd.id 
        END) as unpaid_invoice_count,
        COALESCE(SUM(CASE 
          WHEN fa.assigned_driver_id IS NOT NULL 
          AND fa.assignment_type = 'personal'
          AND COALESCE(fd.freight_cost, 0) > 0
          AND (
            (EXISTS (SELECT 1 FROM freight_transactions ft2 WHERE ft2.announcement_id = fa.id AND ft2.is_paid = false))
            OR (NOT EXISTS (SELECT 1 FROM freight_transactions ft3 WHERE ft3.announcement_id = fa.id))
          )
          THEN COALESCE(fd.freight_cost, 0)
          ELSE 0 
        END), 0) as unpaid_amount
      FROM freight_destinations fd
      INNER JOIN freight_announcements fa ON fd.freight_announcement_id = fa.id
      WHERE fd.city IS NOT NULL AND fd.city != ''
        AND fa.assigned_driver_id IS NOT NULL
        ${dateFilter}
        ${statusFilter}
      GROUP BY COALESCE(NULLIF(fd.representative_name, ''), 'پخش'), fd.city, fa.line_type
      ORDER BY fd.city ASC, representative_name ASC, fa.line_type ASC, total_freights DESC
    `;
    
    console.log('📊 [RepresentativeStatistics] Query:', query);
    console.log('📊 [RepresentativeStatistics] Params:', dateParams);
    
    const { rows } = await pool.query(query, dateParams);
    
    console.log('✅ [RepresentativeStatistics] Found', rows.length, 'representatives');
    
    const statistics = rows.map(row => ({
      representativeName: row.representative_name,
      city: row.city,
      lineType: row.line_type || '',
      totalFreights: parseInt(row.total_freights) || 0,
      companyCount: parseInt(row.company_count) || 0,
      personalCount: parseInt(row.personal_count) || 0,
      totalPersonalFreightCost: parseFloat(row.total_personal_freight_cost) || 0,
      unpaidInvoiceCount: parseInt(row.unpaid_invoice_count) || 0,
      unpaidAmount: parseFloat(row.unpaid_amount) || 0
    }));
    
    res.json(statistics);
  } catch (error) {
    console.error('❌ [RepresentativeStatistics] Error:', error);
    res.status(500).json({ message: 'Internal server error while fetching representative statistics.', error: error.message });
  }
}

/**
 * جزئیات تخصیص‌های خودرو برای یک نماینده خاص
 */
async function getRepresentativeDetails(req, res) {
  try {
    const { representativeName, city, lineType, year, month, day, timeRange = 'month' } = req.query;
    
    if (!representativeName || !city) {
      return res.status(400).json({ message: 'representativeName and city are required' });
    }
    
    console.log('📊 [RepresentativeDetails] Request:', { representativeName, city, lineType, year, month, day, timeRange });
    
    // ساخت dateFilter
    let dateFilter = '';
    const dateParams = [representativeName, city];
    let paramIdx = 3;
    
    // فیلتر لاین - باید قبل از dateFilter اضافه شود
    let lineTypeFilter = '';
    if (lineType) {
      lineTypeFilter = `AND fa.line_type = $${paramIdx}`;
      dateParams.push(lineType);
      paramIdx++;
    }
    
    if (timeRange === 'day' && year && month) {
      if (day) {
        const dayStr = day.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-${dayStr}`, `${year}/${month}/${dayStr}`);
        paramIdx += 2;
      } else {
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-%`, `${year}/${month}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'month' && year) {
      if (month) {
        const monthStr = month.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${monthStr}-%`, `${year}/${monthStr}/%`);
        paramIdx += 2;
      } else {
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-%`, `${year}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'year' && year) {
      dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
      dateParams.push(`${year}-%`, `${year}/%`);
      paramIdx += 2;
    }
    
    const statusFilter = `AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر', 'ChangeRequested', 'Reannounced')`;
    
    // کوئری برای گرفتن جزئیات تخصیص‌ها
    // ابتدا announcements را پیدا می‌کنیم که حداقل یک destination با فیلترهای representative و city دارند
    // سپس برای هر announcement، همه destinations را می‌گیریم
    const query = `
      SELECT 
        fa.id,
        fa.announcement_code,
        CAST(fa.loading_date AS TEXT) as loading_date,
        fa.line_type,
        fa.assignment_type,
        (
          SELECT MIN(fah.created_at) 
          FROM freight_announcement_history fah 
          WHERE fah.freight_announcement_id = fa.id 
            AND fah.action = 'ASSIGNED'
          LIMIT 1
        ) as assigned_at,
        COALESCE(d.id, pd.id) as driver_id,
        COALESCE(d.name, pd.name) as driver_name,
        COALESCE(d.employee_id, pd.driver_smart_id) as driver_employee_id,
        COALESCE(d.mobile, d.work_phone, d.home_phone, pd.mobile) as driver_phone,
        COALESCE(v.id, pv.id) as vehicle_id,
        COALESCE(v.plate_part1, pv.plate_part1) as plate_part1,
        COALESCE(v.plate_letter, pv.plate_letter) as plate_letter,
        COALESCE(v.plate_part2, pv.plate_part2) as plate_part2,
        COALESCE(v.plate_city_code, pv.plate_city_code) as plate_city_code,
        COALESCE(v.brand, NULL) as vehicle_make,
        COALESCE(v.model, pv.vehicle_type) as vehicle_model,
        fd.id as destination_id,
        fd.city as destination_city,
        COALESCE(fd.freight_cost, 0) as freight_cost,
        fd_filter.city as filter_city,
        -- کرایه مقصد خاص (مشهد) که کاربر روی آن کلیک کرده
        CASE 
          WHEN fd.city = fd_filter.city THEN COALESCE(fd.freight_cost, 0)
          ELSE 0
        END as destination_specific_freight_cost
      FROM freight_announcements fa
      INNER JOIN freight_destinations fd_filter ON fd_filter.freight_announcement_id = fa.id
      INNER JOIN freight_destinations fd ON fd.freight_announcement_id = fa.id
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      LEFT JOIN personal_drivers pd ON fa.assigned_driver_id = pd.id
      LEFT JOIN personal_vehicles pv ON fa.assigned_vehicle_id = pv.id
      WHERE (COALESCE(NULLIF(fd_filter.representative_name, ''), 'پخش') = $1 OR ($1 = 'پخش' AND (fd_filter.representative_name IS NULL OR fd_filter.representative_name = '')))
        AND fd_filter.city = $2
        AND fa.assigned_driver_id IS NOT NULL
        ${lineTypeFilter}
        ${dateFilter}
        ${statusFilter}
      ORDER BY fa.id, fd.created_at ASC
    `;
    
    console.log('📊 [RepresentativeDetails] Query:', query);
    console.log('📊 [RepresentativeDetails] Params:', dateParams);
    
    const { rows } = await pool.query(query, dateParams);
    
    const jalaliUtils = require('../utils/jalali');
    
    // گروه‌بندی بر اساس announcement_id برای جمع‌آوری همه مقاصد
    const announcementMap = new Map();
    
    for (const row of rows) {
      const annId = row.id;
      
      if (!announcementMap.has(annId)) {
        let assignedAtJalali = null;
        if (row.assigned_at) {
          try {
            const assignedAtDate = new Date(row.assigned_at);
            assignedAtJalali = jalaliUtils.timestampToJalaliDate(assignedAtDate);
          } catch (err) {
            console.error('❌ [RepresentativeDetails] Error converting assigned_at:', err);
          }
        }
        
        let loadingDate = null;
        try {
          loadingDate = row.loading_date ? normalizeJalaliDate(row.loading_date) : null;
        } catch (err) {
          console.error('❌ [RepresentativeDetails] Error normalizing loading_date:', err);
          loadingDate = row.loading_date || null;
        }
        
        announcementMap.set(annId, {
          id: annId,
          announcementCode: row.announcement_code,
          loadingDate: loadingDate,
          lineType: row.line_type,
          assignmentType: row.assignment_type,
          totalFreightCost: 0, // بعداً جمع می‌کنیم
          destinationFreightCost: 0, // کرایه مقصد خاص (مشهد)
          assignedAt: assignedAtJalali,
          driver: row.driver_id ? {
            id: row.driver_id,
            name: row.driver_name,
            employeeId: row.driver_employee_id,
            phone: row.driver_phone
          } : null,
          vehicle: row.vehicle_id ? {
            id: row.vehicle_id,
            plateNumber: {
              part1: row.plate_part1,
              letter: row.plate_letter,
              part2: row.plate_part2,
              cityCode: row.plate_city_code
            },
            make: row.vehicle_make,
            model: row.vehicle_model
          } : null,
          destinations: []
        });
      }
      
      // اضافه کردن مقصد به لیست مقاصد
      const announcement = announcementMap.get(annId);
      const destCity = row.destination_city || null;
      const destCost = parseFloat(row.freight_cost) || 0;
      const destSpecificCost = parseFloat(row.destination_specific_freight_cost) || 0;
      
      // اگر این مقصد همان مقصد خاص (مشهد) است، کرایه آن را ذخیره کنیم
      if (destSpecificCost > 0) {
        announcement.destinationFreightCost = destSpecificCost;
      }
      
      // جلوگیری از اضافه کردن مقاصد تکراری
      const existingDest = announcement.destinations.find(d => d.city === destCity);
      if (!existingDest && destCity) {
        announcement.destinations.push({
          id: row.destination_id || null,
          city: destCity,
          freightCost: destCost
        });
        announcement.totalFreightCost += destCost;
      }
    }
    
    // تبدیل Map به Array
    const details = Array.from(announcementMap.values());
    
    // برای هر announcement، همه مقاصد را از database بگیریم (برای اطمینان از کامل بودن)
    for (const detail of details) {
      const destRows = await pool.query(
        'SELECT id, city, freight_cost FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC',
        [detail.id]
      );
      
      // همیشه از database بگیریم تا مطمئن شویم همه مقاصد را داریم
      detail.destinations = destRows.rows.map(dest => ({
        id: dest.id || null,
        city: dest.city,
        freightCost: parseFloat(dest.freight_cost) || 0
      }));
      // محاسبه مجدد totalFreightCost از همه مقاصد
      detail.totalFreightCost = detail.destinations.reduce((sum, d) => sum + d.freightCost, 0);
    }
    
    console.log('✅ [RepresentativeDetails] Found', details.length, 'assignments');
    
    res.json(details);
  } catch (error) {
    console.error('❌ [RepresentativeDetails] Error:', error);
    res.status(500).json({ message: 'Internal server error while fetching representative details.', error: error.message });
  }
}

/**
 * آمار شهرها بر اساس شهر
 * برای ترابری‌ها: لیست شهرها با تعداد ارسال، تعداد شرکتی/شخصی، مبلغ کرایه، تعداد بارنامه‌های پرداخت نشده
 */
async function getCityStatistics(req, res) {
  try {
    const { year, month, day, timeRange = 'month' } = req.query;
    
    console.log('📊 [CityStatistics] Request:', { year, month, day, timeRange });
    
    // ساخت dateFilter بر اساس timeRange
    let dateFilter = '';
    const dateParams = [];
    let paramIdx = 1;
    
    if (timeRange === 'day' && year && month) {
      // آمار روزانه تاریخی
      if (day) {
        const dayStr = day.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-${dayStr}`);
        dateParams.push(`${year}/${month}/${dayStr}`);
        paramIdx += 2;
      } else {
        // تمام روزهای ماه
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-%`);
        dateParams.push(`${year}/${month}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'month' && year) {
      if (month) {
        // ماه خاص
        const monthStr = month.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${monthStr}-%`);
        dateParams.push(`${year}/${monthStr}/%`);
        paramIdx += 2;
      } else {
        // تمام ماه‌های سال
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-%`);
        dateParams.push(`${year}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'year' && year) {
      dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
      dateParams.push(`${year}-%`);
      dateParams.push(`${year}/%`);
      paramIdx += 2;
    }
    
    // فیلتر status: فقط بارهایی که تخصیص دارند یا finalized/leftover هستند
    const statusFilter = `AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر')`;
    
    // کوئری اصلی: آمار بر اساس شهر - فقط تخصیص‌ها را می‌شمارد
    // منطق پرداخت نشده: اگر freight_transaction وجود دارد و is_paid = false است، یا اگر freight_transaction وجود ندارد اما freight_cost > 0 و personal است
    // برای assignment_type null: اگر assigned_driver_id دارد اما assignment_type null است، در شرکتی شمارش می‌شود
    // مهم: استفاده از fd.freight_cost (کرایه هر مقصد) به جای fa.total_freight_cost (کرایه کل)
    const query = `
      SELECT 
        fd.city,
        COALESCE(MAX(fd.representative_name), '') as representative_name,
        COUNT(DISTINCT CASE WHEN fa.assigned_driver_id IS NOT NULL THEN fa.id END) as total_freights,
        COUNT(DISTINCT CASE 
          WHEN fa.assigned_driver_id IS NOT NULL 
          AND (fa.assignment_type = 'company' OR fa.assignment_type IS NULL)
          THEN fa.id 
        END) as company_count,
        COUNT(DISTINCT CASE WHEN fa.assignment_type = 'personal' AND fa.assigned_driver_id IS NOT NULL THEN fa.id END) as personal_count,
        COALESCE(SUM(CASE WHEN fa.assignment_type = 'personal' AND fa.assigned_driver_id IS NOT NULL THEN COALESCE(fd.freight_cost, 0) ELSE 0 END), 0) as total_personal_freight_cost,
        COUNT(DISTINCT CASE 
          WHEN fa.assigned_driver_id IS NOT NULL 
          AND fa.assignment_type = 'personal'
          AND COALESCE(fd.freight_cost, 0) > 0
          AND (
            (EXISTS (SELECT 1 FROM freight_transactions ft2 WHERE ft2.announcement_id = fa.id AND ft2.is_paid = false))
            OR (NOT EXISTS (SELECT 1 FROM freight_transactions ft3 WHERE ft3.announcement_id = fa.id))
          )
          THEN fd.id 
        END) as unpaid_invoice_count,
        COALESCE(SUM(CASE 
          WHEN fa.assigned_driver_id IS NOT NULL 
          AND fa.assignment_type = 'personal'
          AND COALESCE(fd.freight_cost, 0) > 0
          AND (
            (EXISTS (SELECT 1 FROM freight_transactions ft2 WHERE ft2.announcement_id = fa.id AND ft2.is_paid = false))
            OR (NOT EXISTS (SELECT 1 FROM freight_transactions ft3 WHERE ft3.announcement_id = fa.id))
          )
          THEN COALESCE(fd.freight_cost, 0)
          ELSE 0 
        END), 0) as unpaid_amount
      FROM freight_destinations fd
      INNER JOIN freight_announcements fa ON fd.freight_announcement_id = fa.id
      WHERE fd.city IS NOT NULL AND fd.city != ''
        AND fa.assigned_driver_id IS NOT NULL
        ${dateFilter}
        ${statusFilter}
      GROUP BY fd.city
      ORDER BY total_freights DESC, fd.city ASC
    `;
    
    console.log('📊 [CityStatistics] Query:', query);
    console.log('📊 [CityStatistics] Params:', dateParams);
    
    const { rows } = await pool.query(query, dateParams);
    
    console.log('✅ [CityStatistics] Found', rows.length, 'cities');
    
    const statistics = rows.map(row => ({
      city: row.city,
      representativeName: row.representative_name || '',
      totalFreights: parseInt(row.total_freights) || 0,
      companyCount: parseInt(row.company_count) || 0,
      personalCount: parseInt(row.personal_count) || 0,
      totalPersonalFreightCost: parseFloat(row.total_personal_freight_cost) || 0,
      unpaidInvoiceCount: parseInt(row.unpaid_invoice_count) || 0,
      unpaidAmount: parseFloat(row.unpaid_amount) || 0
    }));
    
    res.json(statistics);
  } catch (error) {
    console.error('❌ [CityStatistics] Error:', error);
    res.status(500).json({ message: 'Internal server error while fetching city statistics.', error: error.message });
  }
}

/**
 * جزئیات تخصیص‌های خودرو برای یک شهر خاص
 */
async function getCityDetails(req, res) {
  try {
    const { city, year, month, day, timeRange = 'month' } = req.query;
    
    if (!city) {
      return res.status(400).json({ message: 'city is required' });
    }
    
    console.log('📊 [CityDetails] Request:', { city, year, month, day, timeRange });
    
    // ساخت dateFilter
    let dateFilter = '';
    const dateParams = [city];
    let paramIdx = 2;
    
    if (timeRange === 'day' && year && month) {
      if (day) {
        const dayStr = day.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-${dayStr}`, `${year}/${month}/${dayStr}`);
        paramIdx += 2;
      } else {
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${month}-%`, `${year}/${month}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'month' && year) {
      if (month) {
        const monthStr = month.padStart(2, '0');
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-${monthStr}-%`, `${year}/${monthStr}/%`);
        paramIdx += 2;
      } else {
        dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
        dateParams.push(`${year}-%`, `${year}/%`);
        paramIdx += 2;
      }
    } else if (timeRange === 'year' && year) {
      dateFilter = `AND (CAST(fa.loading_date AS TEXT) LIKE $${paramIdx} OR CAST(fa.loading_date AS TEXT) LIKE $${paramIdx + 1})`;
      dateParams.push(`${year}-%`, `${year}/%`);
      paramIdx += 2;
    }
    
    const statusFilter = `AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر')`;
    
    // کوئری برای گرفتن جزئیات تخصیص‌ها
    // مهم: استفاده از fd.freight_cost (کرایه هر مقصد) به جای fa.total_freight_cost (کرایه کل)
    const query = `
      SELECT 
        fa.id,
        fd.id as destination_id,
        fa.announcement_code,
        CAST(fa.loading_date AS TEXT) as loading_date,
        fa.line_type,
        fa.assignment_type,
        COALESCE(fd.freight_cost, 0) as freight_cost,
        (
          SELECT MIN(fah.created_at) 
          FROM freight_announcement_history fah 
          WHERE fah.freight_announcement_id = fa.id 
            AND fah.action = 'ASSIGNED'
          LIMIT 1
        ) as assigned_at,
        d.id as driver_id,
        d.name as driver_name,
        d.employee_id as driver_employee_id,
        COALESCE(d.mobile, d.work_phone, d.home_phone) as driver_phone,
        v.id as vehicle_id,
        v.plate_part1,
        v.plate_letter,
        v.plate_part2,
        v.plate_city_code,
        v.brand as vehicle_make,
        v.model as vehicle_model,
        fd.representative_name
      FROM freight_destinations fd
      INNER JOIN freight_announcements fa ON fd.freight_announcement_id = fa.id
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      WHERE fd.city = $1 
        AND fa.assigned_driver_id IS NOT NULL
        ${dateFilter}
        ${statusFilter}
      ORDER BY fa.loading_date DESC, fa.created_at DESC
    `;
    
    console.log('📊 [CityDetails] Query:', query);
    console.log('📊 [CityDetails] Params:', dateParams);
    
    const { rows } = await pool.query(query, dateParams);
    
    const jalaliUtils = require('../utils/jalali');
    
    const details = rows.map(row => {
      let assignedAtJalali = null;
      if (row.assigned_at) {
        try {
          const assignedAtDate = new Date(row.assigned_at);
          assignedAtJalali = jalaliUtils.timestampToJalaliDate(assignedAtDate);
        } catch (err) {
          console.error('❌ [CityDetails] Error converting assigned_at:', err);
        }
      }
      
      let loadingDate = null;
      try {
        loadingDate = row.loading_date ? normalizeJalaliDate(row.loading_date) : null;
      } catch (err) {
        console.error('❌ [CityDetails] Error normalizing loading_date:', err);
        loadingDate = row.loading_date || null;
      }
      
      return {
        id: row.id,
        destinationId: row.destination_id,
        announcementCode: row.announcement_code,
        loadingDate: loadingDate,
        lineType: row.line_type,
        assignmentType: row.assignment_type,
        totalFreightCost: parseFloat(row.freight_cost) || 0, // استفاده از کرایه مقصد خاص
        assignedAt: assignedAtJalali,
        driver: row.driver_id ? {
          id: row.driver_id,
          name: row.driver_name,
          employeeId: row.driver_employee_id,
          phone: row.driver_phone
        } : null,
        vehicle: row.vehicle_id ? {
          id: row.vehicle_id,
          plateNumber: {
            part1: row.plate_part1,
            letter: row.plate_letter,
            part2: row.plate_part2,
            cityCode: row.plate_city_code
          },
          make: row.vehicle_make,
          model: row.vehicle_model
        } : null,
        representativeName: row.representative_name || ''
      };
    });
    
    console.log('✅ [CityDetails] Found', details.length, 'assignments');
    
    res.json(details);
  } catch (error) {
    console.error('❌ [CityDetails] Error:', error);
    res.status(500).json({ message: 'Internal server error while fetching city details.', error: error.message });
  }
}

async function getLineAnalytics(req, res) {
  try {
    const supportedLineTypes = ['بستنی', 'پاستوریزه', 'لبنیات-فروتلند'];
    const { year, month, timeRange = 'month' } = req.query;
    const parsedYear = parseInt(year, 10);
    const parsedMonth = parseInt(month, 10);

    if (!parsedYear || !parsedMonth) {
      return res.status(400).json({ message: 'year and month are required for line analytics.' });
    }

    const periodDefinitions = [
      { key: 'current', label: 'دوره انتخابی', offset: 0 },
      { key: 'm1', label: '۱ ماه قبل', offset: -1 },
      { key: 'm3', label: '۳ ماه قبل', offset: -3 },
      { key: 'm6', label: '۶ ماه قبل', offset: -6 },
      { key: 'm9', label: '۹ ماه قبل', offset: -9 },
      { key: 'm12', label: '۱۲ ماه قبل', offset: -12 }
    ];

    const periods = periodDefinitions.map(def => {
      const range = getJalaliMonthRange(parsedYear, parsedMonth, def.offset);
      return {
        ...def,
        start: range.start,
        endExclusive: range.endExclusive,
        jalali: range.jalali
      };
    });

    const earliestStart = periods.reduce((min, period) => (period.start < min ? period.start : min), periods[0].start);
    const latestEndExclusive = periods[0].endExclusive;

    console.log('📊 [getLineAnalytics] Periods:', periods.map(p => ({
      key: p.key,
      label: p.label,
      start: p.start.toISOString(),
      endExclusive: p.endExclusive.toISOString(),
    })));

    const analyticsQuery = `
      SELECT
        fa.id AS announcement_id,
        fa.loading_date,
        CAST(fa.loading_date AS TEXT) AS loading_date_text,
        fa.line_type,
        fa.vehicle_type,
        fa.assignment_type,
        fa.cargo_value,
        fa.carton_count,
        fd.id AS destination_id,
        fd.city,
        fd.representative_name,
        fd.freight_cost,
        fd.tonnage,
        fd.created_at AS destination_created_at
      FROM freight_destinations fd
      INNER JOIN freight_announcements fa ON fd.freight_announcement_id = fa.id
      WHERE fa.assignment_type = 'personal'
        AND fa.assigned_driver_id IS NOT NULL
        AND fa.status NOT IN ('Draft', 'PendingManagerApproval', 'Rejected', 'در انتظار تایید مدیر')
        AND fa.line_type = ANY($1)
    `;

    console.log('📊 [getLineAnalytics] Running query for line types:', supportedLineTypes);
    const { rows } = await pool.query(analyticsQuery, [supportedLineTypes]);
    console.log(`📊 [getLineAnalytics] Query returned ${rows.length} destination rows`);

    const announcements = new Map();
    let skippedOutOfRange = 0;
    let skippedNoLineType = 0;
    let skippedUnsupportedLine = 0;

    rows.forEach(row => {
      let loadingDate = null;
      let jalaliString = null;

      if (row.loading_date_text && typeof row.loading_date_text === 'string') {
        jalaliString = row.loading_date_text;
      } else if (typeof row.loading_date === 'string') {
        jalaliString = row.loading_date;
      }

      if (jalaliString) {
        const withoutTime = jalaliString.split('T')[0];
        const normalized = withoutTime.replace(/-/g, '/');
        loadingDate = parseJalaliDateString(normalized);
      }

      if (!loadingDate && row.loading_date instanceof Date) {
        // به عنوان آخرین تلاش، از تاریخ میلادی ذخیره‌شده استفاده می‌کنیم
        // اما قبل از آن آن را به شمسی تبدیل و دوباره به میلادی برمی‌گردانیم تا در بازه صحیح مقایسه شود
        const jalaliFromTimestamp = timestampToJalaliDate(row.loading_date);
        if (jalaliFromTimestamp) {
          loadingDate = parseJalaliDateString(jalaliFromTimestamp);
        }
      }

      if (!loadingDate || loadingDate < earliestStart || loadingDate >= latestEndExclusive) {
        console.log('⚠️ [getLineAnalytics] Skipping destination for out-of-range date:', {
          announcementId: row.announcement_id,
          lineType: row.line_type,
          vehicleType: row.vehicle_type,
          loadingDateRaw: row.loading_date,
          loadingDateText: row.loading_date_text,
          parsedDate: loadingDate ? loadingDate.toISOString() : null,
          earliestStart: earliestStart.toISOString(),
          latestEndExclusive: latestEndExclusive.toISOString()
        });
        skippedOutOfRange += 1;
        return;
      }

      const lineType = row.line_type || 'نامشخص';
      if (!supportedLineTypes.includes(lineType)) {
        skippedUnsupportedLine += 1;
        return;
      }

      const announcementId = row.announcement_id;
      let announcement = announcements.get(announcementId);
      if (!announcement) {
        announcement = {
          id: announcementId,
          lineType,
          vehicleType: row.vehicle_type || 'نامشخص',
          loadingDate,
          loadingDateRaw: row.loading_date_text || row.loading_date,
          cargoValue: row.cargo_value ? Number(row.cargo_value) : 0,
          cartonCount: row.carton_count ? Number(row.carton_count) : null,
          destinations: []
        };
        announcements.set(announcementId, announcement);
      }

      announcement.destinations.push({
        id: row.destination_id,
        city: row.city || 'نامشخص',
        representativeName: row.representative_name || null,
        freightCost: row.freight_cost ? Number(row.freight_cost) : 0,
        tonnage: row.tonnage ? Number(row.tonnage) : 0,
        createdAt: row.destination_created_at ? new Date(row.destination_created_at) : null
      });
    });

    console.log(`📊 [getLineAnalytics] Built ${announcements.size} announcements, skippedOutOfRange=${skippedOutOfRange}, skippedUnsupportedLine=${skippedUnsupportedLine}`);

    const combinations = new Map();
    let skippedNoFreight = 0;
    let skippedNoUnits = 0;

    announcements.forEach(announcement => {
      if (!announcement.destinations || announcement.destinations.length === 0) {
        return;
      }

      const sortedDestinations = [...announcement.destinations].sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.getTime() : 0;
        const timeB = b.createdAt ? b.createdAt.getTime() : 0;
        if (timeA === timeB) {
          return String(a.id).localeCompare(String(b.id));
        }
        return timeA - timeB;
      });

      const finalDestination = sortedDestinations[sortedDestinations.length - 1];
      const finalFreight = finalDestination.freightCost || 0;
      if (finalFreight <= 0) {
        skippedNoFreight += 1;
        return;
      }

      let unitType = 'ton';
      let totalUnits = 0;
      if (announcement.lineType === 'بستنی') {
        unitType = 'carton';
        totalUnits = announcement.cartonCount ? Number(announcement.cartonCount) : 0;
      } else {
        totalUnits = sortedDestinations.reduce((sum, dest) => sum + (dest.tonnage || 0), 0);
      }

      if (!totalUnits || totalUnits <= 0) {
        skippedNoUnits += 1;
        return;
      }

      const perUnitCost = finalFreight / totalUnits;
      const perCargoPercent = announcement.cargoValue ? (finalFreight / announcement.cargoValue) * 100 : null;
      const combinationKey = `${announcement.lineType}__${announcement.vehicleType || 'نامشخص'}__${finalDestination.city || 'نامشخص'}`;

      let combination = combinations.get(combinationKey);
      if (!combination) {
        combination = {
          lineType: announcement.lineType,
          vehicleType: announcement.vehicleType || 'نامشخص',
          destinationCity: finalDestination.city || 'نامشخص',
          unitType,
          records: []
        };
        combinations.set(combinationKey, combination);
      }

      combination.records.push({
        loadingDate: announcement.loadingDate,
        unitCost: perUnitCost,
        perCargoPercent,
        finalFreight,
        totalUnits,
        destinationCount: sortedDestinations.length
      });
    });

    console.log(`📊 [getLineAnalytics] Built ${combinations.size} combinations, skippedNoFreight=${skippedNoFreight}, skippedNoUnits=${skippedNoUnits}`);

    const results = [];

    combinations.forEach(combination => {
      const periodStats = {};

      periods.forEach(period => {
        const periodRecords = combination.records.filter(record => record.loadingDate >= period.start && record.loadingDate < period.endExclusive);
        if (periodRecords.length === 0) {
          periodStats[period.key] = null;
          return;
        }

        const unitCosts = periodRecords.map(r => r.unitCost).filter(Number.isFinite);
        const perCargoValues = periodRecords.map(r => r.perCargoPercent).filter(Number.isFinite);
        const destinationCounts = periodRecords.map(r => r.destinationCount).filter(Number.isFinite);
        const finalFreights = periodRecords.map(r => r.finalFreight).filter(Number.isFinite);

        const totalUnits = periodRecords.reduce((sum, r) => sum + (r.totalUnits || 0), 0);
        const totalFreight = periodRecords.reduce((sum, r) => sum + (r.finalFreight || 0), 0);
        const finalFreightMean = finalFreights.length ? finalFreights.reduce((sum, val) => sum + val, 0) / finalFreights.length : null;

        periodStats[period.key] = {
          sampleSize: periodRecords.length,
          unitCostMode: unitCosts.length ? calculateMode(unitCosts, combination.unitType === 'carton' ? 0 : 2) : null,
          perCargoMode: perCargoValues.length ? calculateMode(perCargoValues, 4) : null,
          finalFreightMode: finalFreights.length ? calculateMode(finalFreights, 0) : null,
          finalFreightMean,
          totalUnits,
          totalFreight,
          destinationCountMedian: destinationCounts.length ? calculateMedian(destinationCounts) : null
        };
      });

      const currentStats = periodStats.current;
      if (!currentStats || currentStats.sampleSize === 0 || currentStats.finalFreightMode === null) {
        return;
      }

      const comparisons = periods.slice(1).map(period => {
        const comparisonStats = periodStats[period.key];
        let changePercent = null;
        if (comparisonStats && comparisonStats.finalFreightMode && comparisonStats.finalFreightMode !== 0) {
          changePercent = ((currentStats.finalFreightMode - comparisonStats.finalFreightMode) / comparisonStats.finalFreightMode) * 100;
        }
        return {
          key: period.key,
          label: period.label,
          modeFare: comparisonStats ? roundNumber(comparisonStats.finalFreightMode, 0) : null,
          changePercent: changePercent !== null ? roundNumber(changePercent, 2) : null,
          sampleSize: comparisonStats ? comparisonStats.sampleSize : 0
        };
      });

      const chartData = periods.map(period => {
        const stats = periodStats[period.key];
        return {
          key: period.key,
          label: period.label,
          meanFare: stats ? roundNumber(stats.finalFreightMean, 0) : null,
          modeFare: stats ? roundNumber(stats.finalFreightMode, 0) : null,
          sampleSize: stats ? stats.sampleSize : 0
        };
      });

      results.push({
        lineType: combination.lineType,
        vehicleType: combination.vehicleType,
        destinationCity: combination.destinationCity,
        unitType: combination.unitType,
        unitLabel: combination.unitType === 'carton' ? 'کارتن' : 'تن',
        current: {
          modeFare: roundNumber(currentStats.finalFreightMode, 0),
          meanFare: roundNumber(currentStats.finalFreightMean, 0),
          modeUnitCost: currentStats.unitCostMode !== null ? roundNumber(currentStats.unitCostMode, 0) : null,
          modePerCargoPercent: currentStats.perCargoMode !== null ? roundNumber(currentStats.perCargoMode, 2) : null,
          totalUnits: roundNumber(currentStats.totalUnits, combination.unitType === 'carton' ? 0 : 2),
          totalFreight: roundNumber(currentStats.totalFreight, 0),
          sampleSize: currentStats.sampleSize,
          destinationCountMedian: currentStats.destinationCountMedian !== null ? roundNumber(currentStats.destinationCountMedian, 0) : null
        },
        comparisons,
        chartData
      });
    });

    results.sort((a, b) => {
      if (a.lineType !== b.lineType) {
        return a.lineType.localeCompare(b.lineType, 'fa');
      }
      if ((a.vehicleType || '') !== (b.vehicleType || '')) {
        return (a.vehicleType || '').localeCompare(b.vehicleType || '', 'fa');
      }
      return (a.destinationCity || '').localeCompare(b.destinationCity || '', 'fa');
    });

    res.json({
      meta: {
        lineTypes: supportedLineTypes,
        year: parsedYear,
        month: parsedMonth,
        timeRange,
        periods: periods.map(period => ({
          key: period.key,
          label: period.label,
          jalali: period.jalali
        }))
      },
      data: results
    });
  } catch (error) {
    console.error('❌ [getLineAnalytics] Error:', error);
    res.status(500).json({ message: 'Internal server error while computing line analytics.', error: error.message });
  }
}

async function searchDispatchRoutes(req, res) {
  try {
    const { q, limit } = req.query;
    const trimmed = typeof q === 'string' ? q.trim() : '';
    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    let rows;
    if (trimmed) {
      const normalized = `%${trimmed.replace(/\s+/g, '%')}%`;
      const query = `
        SELECT id,
               province,
               city,
               round_trip_km,
               approved_allowance,
               route_category,
               distance_category
        FROM dispatch_routes
        WHERE is_active = TRUE
          AND city ILIKE $1
        ORDER BY
          city ASC
        LIMIT $2
      `;
      const { rows: result } = await pool.query(query, [normalized, maxLimit]);
      rows = result;
    } else {
      const query = `
        SELECT id,
               province,
               city,
               round_trip_km,
               approved_allowance,
               route_category,
               distance_category
        FROM dispatch_routes
        WHERE is_active = TRUE
        ORDER BY city ASC
        LIMIT $1
      `;
      const { rows: result } = await pool.query(query, [maxLimit]);
      rows = result;
    }

    const payload = rows.map((row) => ({
      id: row.id,
      province: row.province,
      city: row.city,
      roundTripKm: row.round_trip_km,
      approvedAllowance: row.approved_allowance,
      routeCategory: row.route_category,
      distanceCategory: row.distance_category,
    }));

    res.json(payload);
  } catch (error) {
    console.error('❌ [searchDispatchRoutes] Error:', error);
    res.status(500).json({ message: 'Internal server error while searching dispatch routes.' });
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
  getRepresentativeStatistics,
  getRepresentativeDetails,
  getCityStatistics,
  getCityDetails,
  getLineAnalytics,
  searchDispatchRoutes,
};

/**
 * لغو تخصیص یک اعلام بار و بازگرداندن آن به صف مربوطه
 * POST /api/v1/freight/:id/cancel
 */
async function cancelAssignment(req, res) {
  const { id: announcementId } = req.params;
  const { userId, name, username } = req.user || {};
  const userName = name || username || 'system';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // قفل رکورد اعلام بار
    const { rows } = await client.query(
      `SELECT id, announcement_code, status, assignment_type, assigned_driver_id, assigned_vehicle_id
       FROM freight_announcements
       WHERE id = $1
       FOR UPDATE`,
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const ann = rows[0];
    const oldStatus = ann.status || null;
    const oldDriverId = ann.assigned_driver_id || null;
    const oldVehicleId = ann.assigned_vehicle_id || null;

    // تعیین وضعیت جدید برای بازگشت به صف مربوطه
    let newStatus = 'PendingCompanyAssignment';
    if (ann.assignment_type === 'personal') {
      newStatus = 'PendingPersonalAssignment';
    } else if (ann.assignment_type === 'company') {
      newStatus = 'PendingCompanyAssignment';
    }

    await client.query(
      `UPDATE freight_announcements
         SET assigned_driver_id = NULL,
             assigned_vehicle_id = NULL,
             status = $1,
             updated_at = NOW()
       WHERE id = $2`,
      [newStatus, announcementId]
    );

    // علامت‌گذاری تخصیص‌های مربوطه به عنوان لغو شده
    // تخصیص‌های لغو شده در ترجیحات راننده نمایش داده می‌شوند اما با علامت لغو
    // اما در آمار و تابلو اعلام بار نمایش داده نمی‌شوند
    await client.query(
      `UPDATE dispatch_assignments
       SET is_cancelled = TRUE
       WHERE freight_announcement_id = $1 AND is_cancelled = FALSE`,
      [announcementId]
    );

    // گرفتن شهر برای نمایش در توضیحات
    const destRows = await client.query(
      'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 1',
      [announcementId]
    );
    const city = destRows.rows[0]?.city || 'بدون مقصد';
    
    // ثبت تاریخچه
    await logFreightHistory({
      announcementId: announcementId,
      userId: userId || null,
      userName: userName,
      action: 'CANCELLED',
      oldStatus: oldStatus,
      newStatus: newStatus,
      fieldChanges: {
        assigned_driver_id: { old: oldDriverId, new: null },
        assigned_vehicle_id: { old: oldVehicleId, new: null },
        status: { old: oldStatus, new: newStatus }
      },
      description: `لغو تخصیص برای بار به مقصد ${city}`,
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');
    return res.status(200).json({ message: 'تخصیص با موفقیت لغو شد', newStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [freight] cancelAssignment failed:', error);
    return res.status(500).json({ message: 'خطا در لغو تخصیص' });
  } finally {
    client.release();
  }
}

// extend exports with cancelAssignment
module.exports.cancelAssignment = cancelAssignment;

/**
 * ثبت درخواست تغییر/تقسیم برای یک اعلام بار
 * نقش‌های مجاز: transport_user, personal_transport_user
 * Body: { type: 'change' | 'split' | 'merge', targetQueue?: 'company'|'personal', description?: string, payload?: any }
 * اثر: ایجاد رکورد در freight_change_requests، تغییر وضعیت اعلان به 'ChangeRequested'، خالی کردن تخصیص‌ها (در صورت وجود)، ثبت تاریخچه.
 */
async function createChangeRequest(req, res) {
  const { id: announcementId } = req.params;
  const { type, targetQueue, description, payload } = req.body || {};
  const { id: actingUserId, name, username } = req.user || {};
  const userName = name || username || 'system';

  if (!type || !['change', 'split', 'merge'].includes(type)) {
    return res.status(400).json({ message: 'نوع درخواست نامعتبر است.' });
  }
  if (targetQueue && !['company', 'personal'].includes(targetQueue)) {
    return res.status(400).json({ message: 'targetQueue باید company یا personal باشد.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // قفل رکورد اعلام بار
    const { rows } = await client.query(
      `SELECT id, announcement_code, status, assignment_type, assigned_driver_id, assigned_vehicle_id
       FROM freight_announcements
       WHERE id = $1
       FOR UPDATE`,
      [announcementId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const ann = rows[0];
    const oldStatus = ann.status || null;
    const oldDriverId = ann.assigned_driver_id || null;
    const oldVehicleId = ann.assigned_vehicle_id || null;

    // تغییر وضعیت به درخواست تغییر و خالی کردن تخصیص‌ها
    await client.query(
      `UPDATE freight_announcements
         SET status = 'ChangeRequested',
             assigned_driver_id = NULL,
             assigned_vehicle_id = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [announcementId]
    );

    // ایجاد رکورد درخواست
    const requestId = require('crypto').randomUUID();
    // تبدیل payload به JSON string اگر object است
    const payloadJson = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null;
    
    // اطمینان از وجود جدول (با try-catch برای جلوگیری از خطا)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS freight_change_requests (
          id VARCHAR(255) PRIMARY KEY,
          freight_announcement_id VARCHAR(255) NOT NULL,
          requester_user_id VARCHAR(255),
          requested_at TIMESTAMPTZ DEFAULT NOW(),
          type VARCHAR(50) NOT NULL,
          target_queue VARCHAR(50),
          payload JSONB,
          status VARCHAR(50) DEFAULT 'requested',
          reviewed_by VARCHAR(255),
          reviewed_at TIMESTAMPTZ,
          review_note TEXT
        );
      `);
      // اضافه کردن foreign key اگر وجود ندارد
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'freight_change_requests_freight_announcement_id_fkey'
          ) THEN
            ALTER TABLE freight_change_requests 
            ADD CONSTRAINT freight_change_requests_freight_announcement_id_fkey 
            FOREIGN KEY (freight_announcement_id) REFERENCES freight_announcements(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `).catch(() => {});
    } catch (e) {
      // ignore if table exists or other errors
      console.log('⚠️ [createChangeRequest] Table creation skipped:', e.message);
    }
    
    // اگر actingUserId وجود ندارد، از req.user تلاش می‌کنیم
    let finalUserId = actingUserId || req.user?.id || null;
    
    try {
      await client.query(
        `INSERT INTO freight_change_requests
           (id, freight_announcement_id, requester_user_id, type, target_queue, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'requested')`,
        [requestId, announcementId, finalUserId, type, targetQueue || null, payloadJson]
      );
    } catch (insertError) {
      console.error('❌ [createChangeRequest] Insert failed:', insertError);
      throw insertError;
    }

    // ثبت تاریخچه
    await logFreightHistory({
      announcementId: announcementId,
      userId: actingUserId || null,
      userName: userName,
      action: 'CHANGE_REQUESTED',
      oldStatus: oldStatus,
      newStatus: 'ChangeRequested',
      fieldChanges: {
        assigned_driver_id: oldDriverId ? { old: oldDriverId, new: null } : undefined,
        assigned_vehicle_id: oldVehicleId ? { old: oldVehicleId, new: null } : undefined,
        status: { old: oldStatus, new: 'ChangeRequested' },
        target_queue: targetQueue ? { old: ann.assignment_type || null, new: targetQueue } : undefined,
        request_type: { old: null, new: type },
      },
      description: description ? `درخواست تغییر/تقسیم توسط ترابری: ${description}` : 'درخواست تغییر/تقسیم توسط ترابری',
      ipAddress: req.ip,
      client
    });

    await client.query('COMMIT');
    return res.status(201).json({ id: requestId, status: 'requested' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ [freight] createChangeRequest failed:', e);
    return res.status(500).json({ message: 'خطا در ثبت درخواست تغییر' });
  } finally {
    client.release();
  }
}

/**
 * لیست درخواست‌های تغییر/تقسیم برای برنامه‌ریزی
 * GET /api/v1/freight-change-requests?status=requested
 * نقش‌های مجاز: planner, planner_manager
 */
async function listChangeRequests(req, res) {
  const { status } = req.query || {};
  const filterStatus = typeof status === 'string' ? status : 'requested';
  try {
    const { rows } = await pool.query(
      `
      SELECT 
        r.id,
        r.type,
        r.status,
        r.target_queue,
        r.payload,
        r.requested_at,
        ru.name as requester_name,
        r.freight_announcement_id as announcement_id,
        fa.announcement_code,
        fa.origin_city,
        fa.line_type,
        fa.status as announcement_status,
        fa.assignment_type,
        fa.loading_date,
        fa.created_at
      FROM freight_change_requests r
      LEFT JOIN freight_announcements fa ON fa.id = r.freight_announcement_id
      LEFT JOIN users ru ON ru.id = r.requester_user_id
      WHERE r.status = $1
      ORDER BY r.requested_at DESC
      `,
      [filterStatus]
    );

    for (const row of rows) {
      if (row.loading_date) {
        row.loading_date = String(row.loading_date).replace(/-/g, '/');
      }
    }
    return res.json(rows);
  } catch (e) {
    console.error('❌ [freight] listChangeRequests failed:', e);
    return res.status(500).json({ message: 'خطا در دریافت درخواست‌های تغییر' });
  }
}

/**
 * تأیید/رد درخواست تغییر/تقسیم
 * POST /api/v1/freight-change-requests/:id/approve
 * POST /api/v1/freight-change-requests/:id/reject
 * نقش‌های مجاز: planner, planner_manager
 * برای approve: body می‌تواند شامل { newAnnouncements: [...] } باشد (برای تقسیم/تجمیع)
 * برای reject: body می‌تواند شامل { reviewNote: string } باشد
 */
async function approveChangeRequest(req, res) {
  const { id: requestId } = req.params;
  const { newAnnouncements } = req.body || {};
  const { id: actingUserId, name, username } = req.user || {};
  const userName = name || username || 'system';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // دریافت درخواست
    const { rows: reqRows } = await client.query(
      `SELECT r.*, fa.id as announcement_id, fa.announcement_code, fa.status as announcement_status
       FROM freight_change_requests r
       LEFT JOIN freight_announcements fa ON fa.id = r.freight_announcement_id
       WHERE r.id = $1 AND r.status = 'requested'
       FOR UPDATE`,
      [requestId]
    );
    if (reqRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'درخواست یافت نشد یا قبلاً پردازش شده است.' });
    }
    const changeReq = reqRows[0];
    const originalAnnId = changeReq.freight_announcement_id;

    // اگر newAnnouncements ارسال شده (تقسیم/تجمیع)، ایجاد اعلام‌بارهای جدید
    if (Array.isArray(newAnnouncements) && newAnnouncements.length > 0) {
      // تغییر وضعیت اعلام بار اصلی به Reannounced
      await client.query(
        `UPDATE freight_announcements SET status = 'Reannounced', updated_at = NOW() WHERE id = $1`,
        [originalAnnId]
      );

      // ثبت تاریخچه برای اعلام بار اصلی
      await logFreightHistory({
        announcementId: originalAnnId,
        userId: actingUserId || null,
        userName: userName,
        action: 'REANNOUNCED',
        oldStatus: changeReq.announcement_status,
        newStatus: 'Reannounced',
        fieldChanges: {
          status: { old: changeReq.announcement_status, new: 'Reannounced' },
        },
        description: `اعلام بار به ${newAnnouncements.length} اعلام بار جدید تقسیم/تجمیع شد`,
        ipAddress: req.ip,
        client
      });

      // ایجاد اعلام‌بارهای جدید (استفاده از createFreightAnnouncement logic)
      const crypto = require('crypto');
      for (const newAnn of newAnnouncements) {
        const newId = crypto.randomUUID();
        const annCode = `ANN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const assignmentType = newAnn.assignmentType || changeReq.target_queue || 'company';
        const newStatus = assignmentType === 'personal' ? 'PendingPersonalAssignment' : 'PendingCompanyAssignment';

        await client.query(
          `INSERT INTO freight_announcements 
           (id, announcement_code, loading_date, line_type, cargo_value, vehicle_type, notes, origin_city, brand, 
            representative_type, representative_name, carton_count, priority, products, platform_arrival_time, 
            assignment_type, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
          [
            newId, annCode, newAnn.loadingDate, newAnn.lineType || changeReq.type, newAnn.cargoValue || 0,
            newAnn.vehicleType, newAnn.notes || null, newAnn.originCity || null, newAnn.brand || null,
            newAnn.representativeType || null, newAnn.representativeName || null, newAnn.cartonCount || null,
            newAnn.priority || 'normal', Array.isArray(newAnn.products) ? JSON.stringify(newAnn.products) : '[]',
            newAnn.platformArrivalTime || null, assignmentType, newStatus
          ]
        );

        // افزودن مقاصد
        if (Array.isArray(newAnn.destinations)) {
          for (const dest of newAnn.destinations) {
            await client.query(
              `INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [crypto.randomUUID(), newId, dest.city, dest.representativeName || null, dest.tonnage || null, dest.freightCost || null]
            );
          }
        }

        // گرفتن شهر برای نمایش در توضیحات
        const newDestRows = await client.query(
          'SELECT city FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC LIMIT 1',
          [newId]
        );
        const newCity = newDestRows.rows[0]?.city || 'بدون مقصد';
        
        // ثبت تاریخچه برای اعلام بار جدید
        await logFreightHistory({
          announcementId: newId,
          userId: actingUserId || null,
          userName: userName,
          action: 'DESTINATIONS_CHANGED',
          oldStatus: null,
          newStatus: newStatus,
          fieldChanges: {
            created_from: { old: null, new: originalAnnId },
            request_id: { old: null, new: requestId },
          },
          description: `اعلام بار جدید به مقصد ${newCity} از تقسیم/تجمیع ایجاد شد`,
          ipAddress: req.ip,
          client
        });
      }
    } else {
      // فقط تغییر نوع خودرو/تناژ: ویرایش اعلام بار موجود
      // این بخش را می‌توان با updateFreightAnnouncement انجام داد
      // برای سادگی، فقط وضعیت را به Pending* برمی‌گردانیم
      const assignmentType = changeReq.target_queue || 'company';
      const newStatus = assignmentType === 'personal' ? 'PendingPersonalAssignment' : 'PendingCompanyAssignment';
      
      await client.query(
        `UPDATE freight_announcements SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, originalAnnId]
      );

      await logFreightHistory({
        announcementId: originalAnnId,
        userId: actingUserId || null,
        userName: userName,
        action: 'DESTINATIONS_CHANGED',
        oldStatus: 'ChangeRequested',
        newStatus: newStatus,
        fieldChanges: {
          status: { old: 'ChangeRequested', new: newStatus },
        },
        description: `درخواست تغییر تأیید شد و اعلام بار به صف ${assignmentType} بازگشت`,
        ipAddress: req.ip,
        client
      });
    }

    // به‌روزرسانی وضعیت درخواست
    await client.query(
      `UPDATE freight_change_requests 
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [actingUserId || null, requestId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ message: 'درخواست با موفقیت تأیید شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ [freight] approveChangeRequest failed:', e);
    return res.status(500).json({ message: 'خطا در تأیید درخواست' });
  } finally {
    client.release();
  }
}

async function rejectChangeRequest(req, res) {
  const { id: requestId } = req.params;
  const { reviewNote } = req.body || {};
  const { id: actingUserId, name, username } = req.user || {};
  const userName = name || username || 'system';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: reqRows } = await client.query(
      `SELECT r.*, fa.id as announcement_id, fa.announcement_code, fa.status as announcement_status, fa.assignment_type
       FROM freight_change_requests r
       LEFT JOIN freight_announcements fa ON fa.id = r.freight_announcement_id
       WHERE r.id = $1 AND r.status = 'requested'
       FOR UPDATE`,
      [requestId]
    );
    if (reqRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'درخواست یافت نشد یا قبلاً پردازش شده است.' });
    }
    const changeReq = reqRows[0];
    const originalAnnId = changeReq.announcement_id;

    // بازگرداندن وضعیت اعلام بار به وضعیت قبلی (Pending*)
    const assignmentType = changeReq.assignment_type || 'company';
    const newStatus = assignmentType === 'personal' ? 'PendingPersonalAssignment' : 'PendingCompanyAssignment';

    await client.query(
      `UPDATE freight_announcements SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, originalAnnId]
    );

    await logFreightHistory({
      announcementId: originalAnnId,
      userId: actingUserId || null,
      userName: userName,
      action: 'REJECTED',
      oldStatus: 'ChangeRequested',
      newStatus: newStatus,
      fieldChanges: {
        status: { old: 'ChangeRequested', new: newStatus },
      },
      description: `درخواست تغییر رد شد${reviewNote ? `: ${reviewNote}` : ''}`,
      ipAddress: req.ip,
      client
    });

    await client.query(
      `UPDATE freight_change_requests 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_note = $2
       WHERE id = $3`,
      [actingUserId || null, reviewNote || null, requestId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ message: 'درخواست رد شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ [freight] rejectChangeRequest failed:', e);
    return res.status(500).json({ message: 'خطا در رد درخواست' });
  } finally {
    client.release();
  }
}

/**
 * خارج کردن درخواست تغییر از کارتابل
 * POST /api/v1/freight-announcements/change-requests/:id/archive
 * نقش‌های مجاز: planner, planner_manager
 */
async function archiveChangeRequest(req, res) {
  const { id: requestId } = req.params;
  const { id: actingUserId, name, username } = req.user || {};
  const userName = name || username || 'system';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: reqRows } = await client.query(
      `SELECT r.*, fa.id as announcement_id, fa.announcement_code, fa.status as announcement_status, fa.assignment_type
       FROM freight_change_requests r
       LEFT JOIN freight_announcements fa ON fa.id = r.freight_announcement_id
       WHERE r.id = $1 AND r.status = 'requested'
       FOR UPDATE`,
      [requestId]
    );
    if (reqRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'درخواست یافت نشد یا قبلاً پردازش شده است.' });
    }
    const changeReq = reqRows[0];
    const originalAnnId = changeReq.announcement_id;

    // خارج کردن از کارتابل: تغییر وضعیت به Archived (دیگر در لیست نمایش داده نمی‌شود)
    await client.query(
      `UPDATE freight_announcements SET status = 'Archived', updated_at = NOW() WHERE id = $1`,
      [originalAnnId]
    );

    await logFreightHistory({
      announcementId: originalAnnId,
      userId: actingUserId || null,
      userName: userName,
      action: 'ARCHIVED',
      oldStatus: 'ChangeRequested',
      newStatus: 'Archived',
      fieldChanges: {
        status: { old: 'ChangeRequested', new: 'Archived' },
      },
      description: `درخواست تغییر از کارتابل خارج شد`,
      ipAddress: req.ip,
      client
    });

    // به‌روزرسانی وضعیت درخواست به archived
    await client.query(
      `UPDATE freight_change_requests 
       SET status = 'archived', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [actingUserId || null, requestId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ message: 'درخواست از کارتابل خارج شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ [freight] archiveChangeRequest failed:', e);
    return res.status(500).json({ message: 'خطا در خارج کردن از کارتابل' });
  } finally {
    client.release();
  }
}

// expose new handlers
module.exports.createChangeRequest = createChangeRequest;
module.exports.listChangeRequests = listChangeRequests;
module.exports.approveChangeRequest = approveChangeRequest;
module.exports.rejectChangeRequest = rejectChangeRequest;
module.exports.archiveChangeRequest = archiveChangeRequest;

/**
 * انتقال مقصد از یک اعلام بار به اعلام بار دیگر
 * PUT /api/v1/freight-announcements/:id/transfer-destination
 * Body: { destinationId, targetAnnouncementId, newPosition }
 */
async function transferDestination(req, res) {
  const { id: sourceAnnouncementId } = req.params;
  const { destinationId, targetAnnouncementId, newPosition } = req.body || {};
  const { id: userId, name, username } = req.user || {};
  const userName = name || username || 'کاربر';

  console.log('🔄 [transferDestination] Request received:', {
    sourceAnnouncementId,
    destinationId,
    targetAnnouncementId,
    newPosition,
    userId,
    userName
  });

  if (!destinationId || !targetAnnouncementId || !newPosition) {
    return res.status(400).json({ message: 'پارامترهای destinationId، targetAnnouncementId و newPosition الزامی است.' });
  }

  if (newPosition < 1 || newPosition > 4) {
    return res.status(400).json({ message: 'موقعیت جدید باید بین 1 تا 4 باشد.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // بررسی source announcement
    const { rows: sourceRows } = await client.query(
      `SELECT id, announcement_code, status FROM freight_announcements WHERE id = $1 FOR UPDATE`,
      [sourceAnnouncementId]
    );
    if (sourceRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار مبدا یافت نشد.' });
    }
    const sourceAnn = sourceRows[0];

    // بررسی target announcement
    const { rows: targetRows } = await client.query(
      `SELECT id, announcement_code, status FROM freight_announcements WHERE id = $1 FOR UPDATE`,
      [targetAnnouncementId]
    );
    if (targetRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار هدف یافت نشد.' });
    }
    const targetAnn = targetRows[0];

    // بررسی destination
    const { rows: destRows } = await client.query(
      `SELECT id, city, representative_name, tonnage, freight_cost, freight_announcement_id
       FROM freight_destinations
       WHERE id = $1 AND freight_announcement_id = $2 FOR UPDATE`,
      [destinationId, sourceAnnouncementId]
    );
    if (destRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'مقصد یافت نشد یا متعلق به این اعلام بار نیست.' });
    }
    const destination = destRows[0];

    console.log('📋 [transferDestination] Found:', {
      sourceAnnouncement: { id: sourceAnn.id, code: sourceAnn.announcement_code },
      targetAnnouncement: { id: targetAnn.id, code: targetAnn.announcement_code },
      destination: { id: destination.id, city: destination.city }
    });

    // گرفتن مقاصد target برای تعیین موقعیت
    const { rows: targetDestRows } = await client.query(
      `SELECT id, city, created_at FROM freight_destinations
       WHERE freight_announcement_id = $1
       ORDER BY created_at ASC`,
      [targetAnnouncementId]
    );

    console.log('🔍 [transferDestination] Target destinations before transfer:', {
      targetAnnouncementId,
      count: targetDestRows.length,
      destinations: targetDestRows.map((d, idx) => ({
        index: idx + 1,
        id: d.id,
        city: d.city,
        created_at: d.created_at,
        timestamp: new Date(d.created_at).getTime()
      }))
    });

    // محاسبه created_at برای موقعیت جدید
    let newCreatedAt;
    const actualPosition = Math.min(newPosition, targetDestRows.length + 1);
    
    console.log('🔍 [transferDestination] Position calculation start:', {
      requestedPosition: newPosition,
      targetDestinationsCount: targetDestRows.length,
      actualPosition
    });
    
    if (targetDestRows.length === 0) {
      // اگر مقصدی وجود ندارد، از NOW() استفاده می‌کنیم
      newCreatedAt = new Date();
      console.log('📅 [transferDestination] No existing destinations, using NOW():', newCreatedAt.toISOString());
    } else if (actualPosition === 1) {
      // اگر باید در اول قرار بگیرد، created_at را قبل از اولین مقصد قرار می‌دهیم
      const firstCreatedAt = new Date(targetDestRows[0].created_at);
      const firstTimestamp = firstCreatedAt.getTime();
      // استفاده از یک بازه زمانی بزرگ‌تر برای اطمینان از قرار گرفتن در اول
      const offsetMs = (targetDestRows.length + 1) * 1000;
      newCreatedAt = new Date(firstTimestamp - offsetMs);
      console.log('📅 [transferDestination] Position 1 calculation:', {
        firstCreatedAt: firstCreatedAt.toISOString(),
        firstTimestamp,
        offsetMs,
        newCreatedAt: newCreatedAt.toISOString(),
        newTimestamp: newCreatedAt.getTime(),
        difference: firstTimestamp - newCreatedAt.getTime()
      });
    } else if (actualPosition > targetDestRows.length) {
      // اگر باید در آخر قرار بگیرد، created_at را بعد از آخرین مقصد قرار می‌دهیم
      const lastCreatedAt = new Date(targetDestRows[targetDestRows.length - 1].created_at);
      newCreatedAt = new Date(lastCreatedAt.getTime() + 1000); // 1 ثانیه بعد
      console.log('📅 [transferDestination] Position last calculation:', {
        lastCreatedAt: lastCreatedAt.toISOString(),
        newCreatedAt: newCreatedAt.toISOString()
      });
    } else {
      // اگر باید در وسط قرار بگیرد، created_at را بین مقصد قبلی و بعدی قرار می‌دهیم
      const prevIndex = actualPosition - 2;
      const nextIndex = actualPosition - 1;
      const prevCreatedAt = new Date(targetDestRows[prevIndex].created_at);
      const nextCreatedAt = new Date(targetDestRows[nextIndex].created_at);
      const diff = nextCreatedAt.getTime() - prevCreatedAt.getTime();
      console.log('📅 [transferDestination] Position middle calculation:', {
        actualPosition,
        prevIndex,
        nextIndex,
        prevCity: targetDestRows[prevIndex].city,
        nextCity: targetDestRows[nextIndex].city,
        prevCreatedAt: prevCreatedAt.toISOString(),
        nextCreatedAt: nextCreatedAt.toISOString(),
        diffMs: diff
      });
      // اگر diff خیلی کوچک است (مثلاً کمتر از 2 ثانیه)، از یک مقدار ثابت استفاده می‌کنیم
      if (diff < 2000) {
        newCreatedAt = new Date(prevCreatedAt.getTime() + 1000);
        console.log('📅 [transferDestination] Using fixed offset (diff < 2000ms):', newCreatedAt.toISOString());
      } else {
        newCreatedAt = new Date(prevCreatedAt.getTime() + Math.floor(diff / 2));
        console.log('📅 [transferDestination] Using half diff:', {
          halfDiff: Math.floor(diff / 2),
          newCreatedAt: newCreatedAt.toISOString()
        });
      }
    }

    console.log('📅 [transferDestination] Final position calculation:', {
      targetDestinationsCount: targetDestRows.length,
      requestedPosition: newPosition,
      actualPosition,
      newCreatedAt: newCreatedAt.toISOString(),
      newTimestamp: newCreatedAt.getTime()
    });

    // انتقال مقصد: تغییر freight_announcement_id و created_at
    await client.query(
      `UPDATE freight_destinations
       SET freight_announcement_id = $1, created_at = $2
       WHERE id = $3`,
      [targetAnnouncementId, newCreatedAt, destinationId]
    );

    console.log('✅ [transferDestination] Destination transferred:', {
      destinationId,
      from: sourceAnnouncementId,
      to: targetAnnouncementId,
      newPosition: actualPosition,
      newCreatedAt: newCreatedAt.toISOString()
    });

    // بررسی ترتیب نهایی مقاصد بعد از انتقال
    const { rows: finalDestRows } = await client.query(
      `SELECT id, city, created_at FROM freight_destinations
       WHERE freight_announcement_id = $1
       ORDER BY created_at ASC`,
      [targetAnnouncementId]
    );

    console.log('🔍 [transferDestination] Final destinations order after transfer:', {
      targetAnnouncementId,
      count: finalDestRows.length,
      destinations: finalDestRows.map((d, idx) => ({
        position: idx + 1,
        id: d.id,
        city: d.city,
        created_at: d.created_at,
        timestamp: new Date(d.created_at).getTime(),
        isTransferred: d.id === destinationId
      }))
    });

    // ثبت تاریخچه برای source announcement
    await logFreightHistory({
      announcementId: sourceAnnouncementId,
      userId: userId,
      userName: userName,
      action: 'DESTINATION_TRANSFERRED',
      oldStatus: sourceAnn.status,
      newStatus: sourceAnn.status,
      description: `مقصد ${destination.city} به اعلام بار ${targetAnn.announcement_code} منتقل شد (توسط ${userName})`,
      ipAddress: req.ip,
      client: client
    });

    // ثبت تاریخچه برای target announcement
    await logFreightHistory({
      announcementId: targetAnnouncementId,
      userId: userId,
      userName: userName,
      action: 'DESTINATION_RECEIVED',
      oldStatus: targetAnn.status,
      newStatus: targetAnn.status,
      description: `مقصد ${destination.city} از اعلام بار ${sourceAnn.announcement_code} دریافت شد (موقعیت: ${actualPosition}) (توسط ${userName})`,
      ipAddress: req.ip,
      client: client
    });

    await client.query('COMMIT');
    
    console.log('✅ [transferDestination] Transfer completed successfully');
    
    return res.status(200).json({ 
      message: 'انتقال مقصد با موفقیت انجام شد',
      sourceAnnouncementId,
      targetAnnouncementId,
      destinationId,
      newPosition: actualPosition
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [transferDestination] Error:', error);
    return res.status(500).json({ message: 'خطا در انتقال مقصد', details: error.message });
  } finally {
    client.release();
  }
}

module.exports.transferDestination = transferDestination;

/**
 * دریافت لیست انواع خودروهای موجود
 * GET /api/v1/freight-announcements/vehicle-types
 */
async function getVehicleTypes(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT vehicle_type, vehicle_category
       FROM vehicles
       WHERE vehicle_type IS NOT NULL AND vehicle_type != ''
       ORDER BY vehicle_type ASC`
    );
    
    // اگر vehicle_type خالی بود، از vehicle_category استفاده می‌کنیم
    const types = rows
      .map(r => r.vehicle_type || r.vehicle_category)
      .filter(t => t && t.trim() !== '')
      .filter((value, index, self) => self.indexOf(value) === index) // حذف تکراری‌ها
      .sort();
    
    console.log('📋 [getVehicleTypes] Found vehicle types:', types);
    
    return res.json({ vehicleTypes: types });
  } catch (error) {
    console.error('❌ [getVehicleTypes] Error:', error);
    return res.status(500).json({ message: 'خطا در دریافت لیست انواع خودرو', details: error.message });
  }
}

/**
 * تغییر نوع خودرو یک اعلام بار
 * PUT /api/v1/freight-announcements/:id/vehicle-type
 * Body: { vehicleType }
 */
async function changeVehicleType(req, res) {
  const { id: announcementId } = req.params;
  const { vehicleType } = req.body || {};
  const { id: userId, name, username } = req.user || {};
  const userName = name || username || 'کاربر';

  console.log('🔄 [changeVehicleType] Request received:', {
    announcementId,
    vehicleType,
    userId,
    userName
  });

  if (!vehicleType || vehicleType.trim() === '') {
    return res.status(400).json({ message: 'نوع خودرو الزامی است.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // بررسی اعلام بار
    const { rows: annRows } = await client.query(
      `SELECT id, announcement_code, status, vehicle_type, line_type
       FROM freight_announcements
       WHERE id = $1 FOR UPDATE`,
      [announcementId]
    );
    if (annRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }
    const announcement = annRows[0];

    // بررسی اینکه فقط برای پاستوریزه و لبنیات-فروتلند مجاز است
    if (!['پاستوریزه', 'لبنیات-فروتلند'].includes(announcement.line_type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'تغییر نوع خودرو فقط برای پاستوریزه و لبنیات-فروتلند مجاز است.' });
    }

    const oldVehicleType = announcement.vehicle_type;

    // تغییر نوع خودرو
    await client.query(
      `UPDATE freight_announcements
       SET vehicle_type = $1, updated_at = NOW()
       WHERE id = $2`,
      [vehicleType, announcementId]
    );

    console.log('✅ [changeVehicleType] Vehicle type changed:', {
      announcementId,
      oldVehicleType,
      newVehicleType: vehicleType
    });

    // ثبت تاریخچه
    await logFreightHistory({
      announcementId: announcementId,
      userId: userId,
      userName: userName,
      action: 'VEHICLE_TYPE_CHANGED',
      oldStatus: announcement.status,
      newStatus: announcement.status,
      fieldChanges: {
        vehicle_type: {
          old: oldVehicleType,
          new: vehicleType
        }
      },
      description: `نوع خودرو از "${oldVehicleType}" به "${vehicleType}" تغییر یافت (توسط ${userName})`,
      ipAddress: req.ip,
      client: client
    });

    await client.query('COMMIT');
    
    console.log('✅ [changeVehicleType] Change completed successfully');
    
    return res.status(200).json({ 
      message: 'نوع خودرو با موفقیت تغییر یافت',
      announcementId,
      oldVehicleType,
      newVehicleType: vehicleType
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [changeVehicleType] Error:', error);
    return res.status(500).json({ message: 'خطا در تغییر نوع خودرو', details: error.message });
  } finally {
    client.release();
  }
}

module.exports.getVehicleTypes = getVehicleTypes;
module.exports.changeVehicleType = changeVehicleType;

/**
 * دریافت لیست تراکنش‌های مالی حمل
 * GET /api/v1/freight-transactions
 */
async function getFreightTransactions(req, res) {
  try {
    // بررسی وجود فیلد bill_of_lading_number
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'bill_of_lading_number'
    `);
    const hasBillOfLadingNumber = columnCheck.rows.length > 0;

    const billOfLadingColumn = hasBillOfLadingNumber ? 'ft.bill_of_lading_number,' : 'NULL as bill_of_lading_number,';
    
    // بررسی وجود فیلدهای referral
    const referralCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'referral_status'
    `);
    const hasReferralFields = referralCheck.rows.length > 0;
    
    // بررسی وجود فیلد central_finance_rejection_notes و destination_id
    const rejectionNotesCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name IN ('central_finance_rejection_notes', 'destination_id')
    `);
    const hasRejectionNotesField = rejectionNotesCheck.rows.some(r => r.column_name === 'central_finance_rejection_notes');
    const hasDestinationId = rejectionNotesCheck.rows.some(r => r.column_name === 'destination_id');
    
    const destinationIdColumn = hasDestinationId ? 'ft.destination_id,' : 'NULL as destination_id,';
    const referralColumns = hasReferralFields 
      ? `ft.referral_status, ft.referral_notes, ft.referred_at, ft.referred_by,${hasRejectionNotesField ? ' ft.central_finance_rejection_notes,' : ' NULL as central_finance_rejection_notes,'}`
      : 'NULL as referral_status, NULL as referral_notes, NULL as referred_at, NULL as referred_by, NULL as central_finance_rejection_notes,';
    
    const { rows } = await pool.query(`
      SELECT 
        ft.id,
        ft.announcement_id,
        ${destinationIdColumn}
        ft.amount,
        ft.transaction_date,
        ${billOfLadingColumn}
        ${referralColumns}
        ft.is_paid,
        ft.notes,
        ft.invoice_image_path,
        ft.receipt_image_path,
        ft.extra_document_image_path,
        ft.created_at,
        ft.updated_at,
        fa.announcement_code,
        fa.loading_date,
        fa.assignment_type,
        fa.assigned_driver_id,
        fa.assigned_vehicle_id
      FROM freight_transactions ft
      LEFT JOIN freight_announcements fa ON ft.announcement_id = fa.id
      ORDER BY ft.created_at DESC
    `);

    // تبدیل تاریخ‌ها و normalize کردن
    const transactions = rows.map(row => ({
      id: row.id,
      announcementId: row.announcement_id,
      destinationId: row.destination_id || null,
      amount: parseFloat(row.amount) || 0,
      transactionDate: row.transaction_date ? new Date(row.transaction_date) : new Date(),
      billOfLadingNumber: row.bill_of_lading_number || null,
      referralStatus: row.referral_status || null,
      referralNotes: row.referral_notes || null,
      centralFinanceRejectionNotes: row.central_finance_rejection_notes || null,
      referredAt: row.referred_at ? new Date(row.referred_at) : null,
      referredBy: row.referred_by || null,
      isPaid: row.is_paid || false,
      notes: row.notes || null,
      invoiceImage: row.invoice_image_path || null,
      receiptImage: row.receipt_image_path || null,
      extraDocumentImage: row.extra_document_image_path || null,
    }));

    res.json(transactions);
  } catch (error) {
    console.error('❌ [getFreightTransactions] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت تراکنش‌های مالی حمل', details: error.message });
  }
}

/**
 * ایجاد تراکنش مالی جدید
 * POST /api/v1/freight-transactions
 * Body: { announcementId, amount, transactionDate, notes?, isPaid?, invoiceImage?, receiptImage?, extraDocumentImage? }
 */
async function createFreightTransaction(req, res) {
  try {
    const { announcementId, destinationId, amount, transactionDate, billOfLadingNumber, notes, isPaid, invoiceImage, receiptImage, extraDocumentImage } = req.body;
    
    // تبدیل isPaid به boolean - اگر undefined یا null باشد، false می‌شود
    const finalIsPaid = isPaid === true || isPaid === 'true' || isPaid === 1;
    const { id: userId } = req.user || {};

    if (!announcementId || !amount || !transactionDate) {
      return res.status(400).json({ message: 'پارامترهای announcementId، amount و transactionDate الزامی است.' });
    }

    // بررسی وجود اعلام بار
    const annCheck = await pool.query('SELECT id FROM freight_announcements WHERE id = $1', [announcementId]);
    if (annCheck.rows.length === 0) {
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }

    // ایجاد ID منحصر به فرد
    const transactionId = `FT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // تبدیل transactionDate به Date object اگر string است
    let transDate;
    if (typeof transactionDate === 'string') {
      transDate = new Date(transactionDate);
    } else {
      transDate = transactionDate;
    }

    // ذخیره فایل‌ها - مسیر فایل‌ها در دیتابیس ذخیره می‌شود
    // invoiceImage, receiptImage, extraDocumentImage باید مسیر فایل‌های آپلود شده باشند

    // بررسی وجود فیلدهای bill_of_lading_number و destination_id
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name IN ('bill_of_lading_number', 'destination_id')
    `);
    const hasBillOfLadingNumber = columnCheck.rows.some(r => r.column_name === 'bill_of_lading_number');
    const hasDestinationId = columnCheck.rows.some(r => r.column_name === 'destination_id');

    // بررسی وجود transaction موجود برای این announcement و destination
    // اگر destinationId وجود دارد و فیلد در دیتابیس هم وجود دارد، بر اساس آن جستجو کن
    let existingTransactionCheck;
    if (destinationId && hasDestinationId) {
      existingTransactionCheck = await pool.query(
        'SELECT id FROM freight_transactions WHERE announcement_id = $1 AND destination_id = $2 ORDER BY created_at DESC LIMIT 1',
        [announcementId, destinationId]
      );
    } else if (hasDestinationId) {
      // اگر فیلد وجود دارد اما destinationId نداریم
      existingTransactionCheck = await pool.query(
        'SELECT id FROM freight_transactions WHERE announcement_id = $1 AND destination_id IS NULL ORDER BY created_at DESC LIMIT 1',
        [announcementId]
      );
    } else {
      // اگر فیلد destination_id وجود ندارد، فقط بر اساس announcement_id جستجو کن
      existingTransactionCheck = await pool.query(
        'SELECT id FROM freight_transactions WHERE announcement_id = $1 ORDER BY created_at DESC LIMIT 1',
        [announcementId]
      );
    }
    const hasExistingTransaction = existingTransactionCheck.rows.length > 0;
    const existingTransactionId = hasExistingTransaction ? existingTransactionCheck.rows[0].id : null;

    // اگر فیلد در دیتابیس وجود دارد، billOfLadingNumber هم الزامی است
    if (hasBillOfLadingNumber && !billOfLadingNumber) {
      return res.status(400).json({ message: 'پارامتر billOfLadingNumber الزامی است.' });
    }

    let insertQuery, insertValues, updateQuery, updateValues;
    if (hasBillOfLadingNumber && hasDestinationId) {
      // اگر هر دو فیلد وجود دارند
      insertQuery = `
        INSERT INTO freight_transactions (
          id,
          announcement_id,
          destination_id,
          amount,
          transaction_date,
          bill_of_lading_number,
          is_paid,
          notes,
          invoice_image_path,
          receipt_image_path,
          extra_document_image_path,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *
      `;
      insertValues = [
        transactionId,
        announcementId,
        destinationId || null,
        parseFloat(amount),
        transDate,
        billOfLadingNumber.trim(),
        finalIsPaid,
        notes || null,
        invoiceImage || null,
        receiptImage || null,
        extraDocumentImage || null
      ];
    } else if (hasBillOfLadingNumber && !hasDestinationId) {
      // اگر فقط bill_of_lading_number وجود دارد
      insertQuery = `
        INSERT INTO freight_transactions (
          id,
          announcement_id,
          amount,
          transaction_date,
          bill_of_lading_number,
          is_paid,
          notes,
          invoice_image_path,
          receipt_image_path,
          extra_document_image_path,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `;
      insertValues = [
        transactionId,
        announcementId,
        parseFloat(amount),
        transDate,
        billOfLadingNumber.trim(),
        finalIsPaid,
        notes || null,
        invoiceImage || null,
        receiptImage || null,
        extraDocumentImage || null
      ];
    } else {
      // اگر فیلد وجود ندارد، بدون آن insert کن
      insertQuery = `
        INSERT INTO freight_transactions (
          id,
          announcement_id,
          amount,
          transaction_date,
          is_paid,
          notes,
          invoice_image_path,
          receipt_image_path,
          extra_document_image_path,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *
      `;
      insertValues = [
        transactionId,
        announcementId,
        parseFloat(amount),
        transDate,
        finalIsPaid,
        notes || null,
        invoiceImage || null,
        receiptImage || null,
        extraDocumentImage || null
      ];
    }

    let rows;
    if (hasExistingTransaction && existingTransactionId) {
      // Update transaction موجود
      if (hasBillOfLadingNumber && hasDestinationId) {
        updateQuery = `
          UPDATE freight_transactions 
          SET amount = $1,
              transaction_date = $2,
              destination_id = $3,
              bill_of_lading_number = $4,
              is_paid = $5,
              notes = $6,
              invoice_image_path = COALESCE($7, invoice_image_path),
              receipt_image_path = COALESCE($8, receipt_image_path),
              extra_document_image_path = COALESCE($9, extra_document_image_path),
              updated_at = NOW()
          WHERE id = $10
          RETURNING *
        `;
        updateValues = [
          parseFloat(amount),
          transDate,
          destinationId || null,
          billOfLadingNumber.trim(),
          finalIsPaid,
          notes || null,
          invoiceImage || null,
          receiptImage || null,
          extraDocumentImage || null,
          existingTransactionId
        ];
      } else if (hasBillOfLadingNumber) {
        updateQuery = `
          UPDATE freight_transactions 
          SET amount = $1,
              transaction_date = $2,
              bill_of_lading_number = $3,
              is_paid = $4,
              notes = $5,
              invoice_image_path = COALESCE($6, invoice_image_path),
              receipt_image_path = COALESCE($7, receipt_image_path),
              extra_document_image_path = COALESCE($8, extra_document_image_path),
              updated_at = NOW()
          WHERE id = $9
          RETURNING *
        `;
        updateValues = [
          parseFloat(amount),
          transDate,
          billOfLadingNumber.trim(),
          finalIsPaid,
          notes || null,
          invoiceImage || null,
          receiptImage || null,
          extraDocumentImage || null,
          existingTransactionId
        ];
      } else {
        updateQuery = `
          UPDATE freight_transactions 
          SET amount = $1,
              transaction_date = $2,
              is_paid = $3,
              notes = $4,
              invoice_image_path = COALESCE($5, invoice_image_path),
              receipt_image_path = COALESCE($6, receipt_image_path),
              extra_document_image_path = COALESCE($7, extra_document_image_path),
              updated_at = NOW()
          WHERE id = $8
          RETURNING *
        `;
        updateValues = [
          parseFloat(amount),
          transDate,
          finalIsPaid,
          notes || null,
          invoiceImage || null,
          receiptImage || null,
          extraDocumentImage || null,
          existingTransactionId
        ];
      }
      const updateResult = await pool.query(updateQuery, updateValues);
      rows = updateResult.rows;
      console.log('✅ [createFreightTransaction] Transaction updated:', existingTransactionId);
    } else {
      // ایجاد transaction جدید
      const insertResult = await pool.query(insertQuery, insertValues);
      rows = insertResult.rows;
      console.log('✅ [createFreightTransaction] Transaction created:', transactionId);
    }

    const transaction = {
      ...rows[0],
      transactionDate: rows[0].transaction_date,
      announcementId: rows[0].announcement_id,
      destinationId: rows[0].destination_id || null,
      billOfLadingNumber: rows[0].bill_of_lading_number || null,
      isPaid: rows[0].is_paid || false,
      invoiceImage: rows[0].invoice_image_path || null,
      receiptImage: rows[0].receipt_image_path || null,
      extraDocumentImage: rows[0].extra_document_image_path || null,
    };

    res.status(hasExistingTransaction ? 200 : 201).json(transaction);
  } catch (error) {
    console.error('❌ [createFreightTransaction] Error:', error);
    res.status(500).json({ message: 'خطا در ایجاد تراکنش مالی', details: error.message });
  }
}

/**
 * ارجاع تراکنش به ستاد مالی
 * POST /api/v1/freight-transactions/:announcementId/refer
 */
async function referTransactionToHeadquarters(req, res) {
  try {
    const { announcementId } = req.params;
    const { destinationId, notes } = req.body;
    const { id: userId } = req.user || {};

    if (!announcementId) {
      return res.status(400).json({ message: 'شناسه اعلام بار الزامی است.' });
    }

    // بررسی وجود فیلد destination_id
    const destinationIdCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'destination_id'
    `);
    const hasDestinationId = destinationIdCheck.rows.length > 0;

    // پیدا کردن تراکنش مربوط به این announcement و destination
    // اگر destinationId وجود دارد و فیلد در دیتابیس هم وجود دارد، بر اساس آن جستجو کن
    let transactionResult;
    if (destinationId && hasDestinationId) {
      transactionResult = await pool.query(
        'SELECT id, referred_by FROM freight_transactions WHERE announcement_id = $1 AND destination_id = $2 ORDER BY created_at DESC LIMIT 1',
        [announcementId, destinationId]
      );
    } else if (hasDestinationId) {
      // اگر فیلد وجود دارد اما destinationId نداریم
      transactionResult = await pool.query(
        'SELECT id, referred_by FROM freight_transactions WHERE announcement_id = $1 AND (destination_id IS NULL OR destination_id = \'\') ORDER BY created_at DESC LIMIT 1',
        [announcementId]
      );
    } else {
      // اگر فیلد destination_id وجود ندارد، فقط بر اساس announcement_id جستجو کن
      transactionResult = await pool.query(
        'SELECT id, referred_by FROM freight_transactions WHERE announcement_id = $1 ORDER BY created_at DESC LIMIT 1',
        [announcementId]
      );
    }

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ message: 'تراکنش یافت نشد. ابتدا تراکنش را ثبت کنید.' });
    }

    const transactionId = transactionResult.rows[0].id;

    // بررسی وجود فیلد referral_status
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'referral_status'
    `);
    const hasReferralFields = columnCheck.rows.length > 0;

    if (hasReferralFields) {
      // آپدیت وضعیت ارجاع
      await pool.query(`
        UPDATE freight_transactions 
        SET referral_status = 'referred',
            referral_notes = $1,
            referred_at = NOW(),
            referred_by = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [notes || 'ارجاع به ستاد مالی', userId, transactionId]);
    } else {
      // اگر فیلد وجود ندارد، فقط لاگ کن
      console.log('⚠️ [referTransactionToHeadquarters] Referral fields not found in database. Please run migration.');
    }

    console.log('✅ [referTransactionToHeadquarters] Transaction referred:', transactionId);
    res.json({ 
      success: true, 
      message: 'تراکنش با موفقیت به ستاد مالی ارجاع شد',
      transactionId 
    });
  } catch (error) {
    console.error('❌ [referTransactionToHeadquarters] Error:', error);
    res.status(500).json({ message: 'خطا در ارجاع تراکنش', details: error.message });
  }
}

/**
 * تأیید تراکنش توسط ستاد مالی
 * POST /api/v1/freight-transactions/:announcementId/approve
 */
async function approveTransaction(req, res) {
  try {
    const { announcementId } = req.params;
    const { id: userId } = req.user || {};

    if (!announcementId) {
      return res.status(400).json({ message: 'شناسه اعلام بار الزامی است.' });
    }

    // پیدا کردن تراکنش مربوط به این announcement
    const transactionResult = await pool.query(
      'SELECT id FROM freight_transactions WHERE announcement_id = $1 ORDER BY created_at DESC LIMIT 1',
      [announcementId]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ message: 'تراکنش یافت نشد.' });
    }

    const transactionId = transactionResult.rows[0].id;

    // بررسی وجود فیلد referral_status
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'referral_status'
    `);
    const hasReferralFields = columnCheck.rows.length > 0;

    if (hasReferralFields) {
      // آپدیت وضعیت به approved
      await pool.query(`
        UPDATE freight_transactions 
        SET referral_status = 'approved',
            updated_at = NOW()
        WHERE id = $1
      `, [transactionId]);
    }

    console.log('✅ [approveTransaction] Transaction approved:', transactionId);
    res.json({ 
      success: true, 
      message: 'تراکنش با موفقیت تأیید شد.'
    });
  } catch (error) {
    console.error('❌ [approveTransaction] Error:', error);
    res.status(500).json({ message: 'خطا در تأیید تراکنش', details: error.message });
  }
}

/**
 * رد تراکنش توسط ستاد مالی و ارجاع به شعبه
 * POST /api/v1/freight-transactions/:announcementId/reject
 */
async function rejectTransaction(req, res) {
  try {
    const { announcementId } = req.params;
    const { destinationId, notes } = req.body;
    const { id: userId } = req.user || {};

    if (!announcementId) {
      return res.status(400).json({ message: 'شناسه اعلام بار الزامی است.' });
    }

    if (!notes || !notes.trim()) {
      return res.status(400).json({ message: 'توضیحات رد الزامی است.' });
    }

    // بررسی وجود فیلد destination_id
    const destinationIdCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'destination_id'
    `);
    const hasDestinationId = destinationIdCheck.rows.length > 0;

    // پیدا کردن تراکنش مربوط به این announcement و destination
    let transactionResult;
    if (destinationId && hasDestinationId) {
      transactionResult = await pool.query(
        'SELECT id, referred_by FROM freight_transactions WHERE announcement_id = $1 AND destination_id = $2 ORDER BY created_at DESC LIMIT 1',
        [announcementId, destinationId]
      );
    } else if (hasDestinationId) {
      transactionResult = await pool.query(
        'SELECT id, referred_by FROM freight_transactions WHERE announcement_id = $1 AND (destination_id IS NULL OR destination_id = \'\') ORDER BY created_at DESC LIMIT 1',
        [announcementId]
      );
    } else {
      transactionResult = await pool.query(
        'SELECT id, referred_by FROM freight_transactions WHERE announcement_id = $1 ORDER BY created_at DESC LIMIT 1',
        [announcementId]
      );
    }

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ message: 'تراکنش یافت نشد.' });
    }

    const transactionId = transactionResult.rows[0].id;
    const referredBy = transactionResult.rows[0].referred_by; // کاربری که ارجاع داده

    // بررسی وجود فیلد referral_status
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freight_transactions' 
      AND column_name = 'referral_status'
    `);
    const hasReferralFields = columnCheck.rows.length > 0;

    if (hasReferralFields) {
      // بررسی وجود فیلد central_finance_rejection_notes
      const rejectionNotesCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'freight_transactions' 
        AND column_name = 'central_finance_rejection_notes'
      `);
      const hasRejectionNotesField = rejectionNotesCheck.rows.length > 0;

      if (hasRejectionNotesField) {
        // آپدیت وضعیت به rejected و ذخیره توضیحات رد
        await pool.query(`
          UPDATE freight_transactions 
          SET referral_status = 'rejected',
              central_finance_rejection_notes = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [notes.trim(), transactionId]);
      } else {
        // اگر فیلد وجود ندارد، از referral_notes استفاده کن
        await pool.query(`
          UPDATE freight_transactions 
          SET referral_status = 'rejected',
              referral_notes = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [notes.trim(), transactionId]);
      }
    }

    console.log('✅ [rejectTransaction] Transaction rejected:', transactionId, 'Referred by:', referredBy);
    res.json({ 
      success: true, 
      message: 'تراکنش رد شد و به شعبه ارجاع داده شد.'
    });
  } catch (error) {
    console.error('❌ [rejectTransaction] Error:', error);
    res.status(500).json({ message: 'خطا در رد تراکنش', details: error.message });
  }
}

module.exports.getFreightTransactions = getFreightTransactions;
module.exports.createFreightTransaction = createFreightTransaction;
module.exports.referTransactionToHeadquarters = referTransactionToHeadquarters;
module.exports.approveTransaction = approveTransaction;
module.exports.rejectTransaction = rejectTransaction;