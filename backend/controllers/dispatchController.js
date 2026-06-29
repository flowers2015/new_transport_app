const pool = require('../db');
const { isVeryFarAnnouncement } = require('../services/dispatch/dispatchRouteRules');
const { computeJalaliCycleRange } = require('../services/dispatch/dispatchCycle');
const {
  normalizeCategoryFilter,
  mapAssignmentRow,
  mapOpportunityRow,
  buildAssignmentNotes,
  buildCycleSummary,
  buildStats,
  routeIsVeryFar,
  resolveAssignmentCertainty,
  isFarOrVeryFarOpportunity,
  groupAssignmentsByTrip,
} = require('../services/dispatch/driverPreferences');
const {
  lookupRoutesForDestinations,
  pickPrimaryRouteFromList,
} = require('../services/dispatch/multiDestinationAssignments');
const {
  vehicleMatchesCategory,
  isCompanyDispatchAssignable,
} = require('../services/dispatch/dispatchVehicleCategory');
const { formatJalali } = require('../utils/jalali');
const {
  jalaliToGregorian,
  parseJalaliDateString,
  timestampToJalaliDate,
  gregorianToJalali,
} = require('../utils/jalali');

const pad2 = (value) => (value < 10 ? `0${value}` : `${value}`);

function computeDefaultPreferenceRange(referenceDate = new Date()) {
  const [jy, jm] = gregorianToJalali(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate()
  );
  const toYear = jy;
  const toMonth = jm;
  const fromMonth = jm === 1 ? 12 : jm - 1;
  const fromYear = jm === 1 ? jy - 1 : jy;
  const [fromGy, fromGm, fromGd] = jalaliToGregorian(fromYear, fromMonth, 26);
  const [toGy, toGm, toGd] = jalaliToGregorian(toYear, toMonth, 25);
  const fromDate = new Date(fromGy, fromGm - 1, fromGd);
  const toDate = new Date(toGy, toGm - 1, toGd);
  return { fromDate, toDate };
}

let driverOpportunityTableEnsured = false;
let assignmentExtrasEnsured = false;

async function ensureDriverOpportunityTable() {
  if (!driverOpportunityTableEnsured) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dispatch_driver_opportunities (
        id SERIAL PRIMARY KEY,
        driver_id VARCHAR(255) NOT NULL,
        queue_entry_id VARCHAR(255),
        stage VARCHAR(50) NOT NULL,
        freight_announcement_id VARCHAR(255) NOT NULL,
        seen_at TIMESTAMPTZ DEFAULT NOW(),
        seen_at_jalali VARCHAR(16),
        taken BOOLEAN DEFAULT FALSE,
        taken_at TIMESTAMPTZ,
        created_by_user_id VARCHAR(255),
        queue_position INTEGER,
        queue_snapshot JSONB,
        UNIQUE (driver_id, stage, freight_announcement_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_opportunities_driver
      ON dispatch_driver_opportunities(driver_id, seen_at DESC)
    `);
    await pool.query(`
      ALTER TABLE dispatch_driver_opportunities
      ADD COLUMN IF NOT EXISTS queue_position INTEGER,
      ADD COLUMN IF NOT EXISTS queue_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS seen_at_jalali VARCHAR(16)
    `);
    driverOpportunityTableEnsured = true;
  }
  if (!assignmentExtrasEnsured) {
    await pool.query(`
      ALTER TABLE dispatch_assignments
      ADD COLUMN IF NOT EXISTS queue_position INTEGER,
      ADD COLUMN IF NOT EXISTS assigned_at_jalali VARCHAR(16),
      ADD COLUMN IF NOT EXISTS queue_entry_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS queue_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(255),
      ADD COLUMN IF NOT EXISTS assignment_finalized_at TIMESTAMPTZ
    `);
    // اضافه کردن فیلد expected_days به dispatch_routes اگر وجود ندارد
    try {
      await pool.query(`
        ALTER TABLE dispatch_routes
        ADD COLUMN IF NOT EXISTS expected_days INTEGER
      `);
    } catch (e) {
      // اگر جدول وجود ندارد یا خطای دیگری رخ داد، نادیده بگیر
      console.warn('⚠️ [dispatch] Could not add expected_days to dispatch_routes:', e.message);
    }
    assignmentExtrasEnsured = true;
  }
}

async function logDriverOpportunities(
  driverId,
  queueEntryId,
  stage,
  announcements,
  userId,
  stageQueue
) {
  if (!driverId || !Array.isArray(announcements) || announcements.length === 0) {
    return;
  }
  await ensureDriverOpportunityTable();

  const snapshotArray = Array.isArray(stageQueue)
    ? stageQueue.map(item => ({
        driverId: item.driverId || item.driver_id || null,
        driverName: item.driver?.name || item.driver_name || null,
        queuePosition: item.position ?? null,
        queueType: item.queueType || item.queue_type || null,
      }))
    : null;
  const stageQueueMap = new Map();
  if (Array.isArray(stageQueue)) {
    for (const entry of stageQueue) {
      if (entry?.id) {
        stageQueueMap.set(entry.id, entry);
      }
    }
  }

  for (const item of announcements) {
    if (!item?.id) continue;
    const queueEntry = queueEntryId ? stageQueueMap.get(queueEntryId) : null;
    const queuePosition = queueEntry?.position ?? null;
    await pool.query(
      `INSERT INTO dispatch_driver_opportunities
        (driver_id, queue_entry_id, stage, freight_announcement_id, seen_at, seen_at_jalali, created_by_user_id, queue_position, queue_snapshot)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
       ON CONFLICT (driver_id, stage, freight_announcement_id)
       DO UPDATE SET
         seen_at = NOW(),
         seen_at_jalali = EXCLUDED.seen_at_jalali,
         queue_entry_id = EXCLUDED.queue_entry_id,
         queue_position = COALESCE(dispatch_driver_opportunities.queue_position, EXCLUDED.queue_position),
         queue_snapshot = EXCLUDED.queue_snapshot`,
      [
        driverId,
        queueEntryId || null,
        stage,
        item.id,
        timestampToJalaliDate(new Date()),
        userId || null,
        queuePosition,
        snapshotArray ? JSON.stringify(snapshotArray) : null,
      ]
    );
  }
}

function computeCycleRange(referenceDate = new Date()) {
  return computeJalaliCycleRange(referenceDate);
}

function mapVeryFarHistoryRow(row) {
  const at = row.created_at ? new Date(row.created_at) : null;
  return {
    id: row.id,
    at: row.created_at,
    atJalali: at ? formatJalali(at) : null,
    city: row.city || null,
    announcementCode: row.announcement_code || null,
    stage: row.stage || null,
  };
}

async function getQueue(req, res) {
  try {
    let rows;
    try {
      const result = await pool.query(`
        SELECT
          q.id,
          q.vehicle_id,
          q.driver_id,
          q.vehicle_category,
          q.queue_type,
          q.position,
          q.notes,
          q.created_by_user_id,
          q.created_at,
          q.updated_by_user_id,
          q.updated_at,
          v.model AS vehicle_model,
          v.brand AS vehicle_brand,
          v.vehicle_code,
          v.plate_part1,
          v.plate_letter,
          v.plate_part2,
          v.plate_city_code,
          d.employee_id,
          d.name AS driver_name,
          d.mobile AS driver_mobile
        FROM dispatch_queue_entries q
        LEFT JOIN vehicles v ON v.id = q.vehicle_id
        LEFT JOIN drivers d ON d.id = q.driver_id
        ORDER BY q.vehicle_category NULLS LAST, q.queue_type, q.position, q.created_at
      `);
      rows = result.rows;
    } catch (innerError) {
      if (innerError?.code === '42703') {
        const fallback = await pool.query(`
          SELECT
            q.id,
            q.vehicle_id,
            q.driver_id,
            q.vehicle_category,
            q.queue_type,
            q.position,
            q.notes,
            q.created_by_user_id,
            q.created_at,
            NULL::VARCHAR(255) AS updated_by_user_id,
            NULL::TIMESTAMPTZ AS updated_at,
            v.model AS vehicle_model,
            v.brand AS vehicle_brand,
            v.vehicle_code,
            v.plate_part1,
            v.plate_letter,
            v.plate_part2,
            v.plate_city_code,
            d.employee_id,
            d.name AS driver_name,
            d.mobile AS driver_mobile
          FROM dispatch_queue_entries q
          LEFT JOIN vehicles v ON v.id = q.vehicle_id
          LEFT JOIN drivers d ON d.id = q.driver_id
          ORDER BY q.vehicle_category NULLS LAST, q.queue_type, q.position, q.created_at
        `);
        rows = fallback.rows;
      } else {
        throw innerError;
      }
    }

    // تبدیل vehicleCategory از key انگلیسی به label فارسی
    const categoryKeyToLabel = {
      'trailer': 'تریلی',
      'mini-trailer': 'مینی تریلی',
      'ten-wheel': 'ده چرخ'
    };

    const { start: cycleStart, end: cycleEnd } = computeJalaliCycleRange();
    const { fetchDriversFinalizedKm } = require('../services/dispatch/driverPreferences');
    const driverIds = [...new Set(rows.map(r => r.driver_id).filter(Boolean))];
    const finalizedKmMap = await fetchDriversFinalizedKm(pool, driverIds, cycleStart, cycleEnd);
    
    const grouped = {};
    const categoryRepairs = [];
    for (const row of rows) {
      const rawCategory = row.vehicle_category || null;
      const category = await resolveQueueEntryDisplayCategory(pool, row);

      if (
        rawCategory &&
        category !== 'نامشخص' &&
        category !== rawCategory &&
        row.id
      ) {
        categoryRepairs.push({ id: row.id, category });
      }

      if (!grouped[category]) {
        grouped[category] = {
          near: [],
          far: [],
          workshop: [],
          external: [],
          leave: [],
          other: [],
        };
      }

      const info = {
        id: row.id,
        vehicleId: row.vehicle_id,
        driverId: row.driver_id,
        queueType: row.queue_type,
        position: row.position,
        notes: row.notes,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedByUserId: row.updated_by_user_id,
        updatedAt: row.updated_at,
        vehicle: {
          id: row.vehicle_id,
          model: row.vehicle_model,
          brand: row.vehicle_brand,
          vehicleCode: row.vehicle_code,
          platePart1: row.plate_part1,
          plateLetter: row.plate_letter,
          platePart2: row.plate_part2,
          plateCityCode: row.plate_city_code,
        },
        driver: {
          id: row.driver_id,
          name: row.driver_name,
          mobile: row.driver_mobile,
          employeeId: row.employee_id,
          periodFinalizedKm: finalizedKmMap.get(row.driver_id) || 0,
        },
      };

      switch (row.queue_type) {
        case 'near':
          grouped[category].near.push(info);
          break;
        case 'far':
          grouped[category].far.push(info);
          break;
        case 'workshop':
          grouped[category].workshop.push(info);
          break;
        case 'external':
          grouped[category].external.push(info);
          break;
        case 'leave':
          grouped[category].leave.push(info);
          break;
        default:
          grouped[category].other.push(info);
      }
    }

    if (categoryRepairs.length > 0) {
      await Promise.all(
        categoryRepairs.map(({ id, category }) =>
          pool.query(
            `UPDATE dispatch_queue_entries SET vehicle_category = $1, updated_at = NOW() WHERE id = $2`,
            [category, id]
          )
        )
      );
      console.log(
        `🔧 [getQueue] Repaired ${categoryRepairs.length} queue entries with non-preset vehicle_category`
      );
    }

    res.json(grouped);
  } catch (error) {
    if (error?.code === '42P01') {
      console.warn('⚠️ [dispatch] dispatch_queue_entries table not found. Returning empty result.');
      return res.json({});
    }
    console.error('❌ [dispatch] getQueue failed:', error);
    res.status(500).json({ message: 'خطا در دریافت لیست نوبت‌ها' });
  }
}

async function createQueueEntry(req, res) {
  const { vehicleId, driverId, vehicleCategory, queueType, notes } = req.body || {};

  if (!vehicleId || !driverId || !queueType) {
    return res.status(400).json({ message: 'vehicleId، driverId و queueType الزامی هستند.' });
  }

  // تبدیل vehicleCategory از key انگلیسی به label فارسی (اگر لازم باشد)
  const categoryKeyToLabel = {
    'trailer': 'تریلی',
    'mini-trailer': 'مینی تریلی',
    'ten-wheel': 'ده چرخ'
  };
  const normalizedVehicleCategory = normalizeQueueVehicleCategory(vehicleCategory);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // بررسی اینکه آیا راننده/خودرو در نوبت موجود است
    const existing = await client.query(
      `SELECT id, queue_type, position, driver_id, vehicle_id,
              (SELECT name FROM drivers WHERE id = dispatch_queue_entries.driver_id) as driver_name,
              (SELECT vehicle_code FROM vehicles WHERE id = dispatch_queue_entries.vehicle_id) as vehicle_code
       FROM dispatch_queue_entries 
       WHERE driver_id = $1 OR vehicle_id = $2`,
      [driverId, vehicleId]
    );

    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      const existingEntry = existing.rows[0];
      const isDriverConflict = existingEntry.driver_id === driverId;
      const conflictType = isDriverConflict ? 'راننده' : 'خودرو';
      const conflictName = isDriverConflict ? existingEntry.driver_name : existingEntry.vehicle_code;
      const queueTypeLabel = existingEntry.queue_type === 'far' ? 'مسیر دور' : existingEntry.queue_type === 'near' ? 'مسیر نزدیک' : existingEntry.queue_type;
      const positionText = existingEntry.position ? ` در موقعیت ${existingEntry.position}` : '';
      return res.status(409).json({ 
        message: `${conflictType} "${conflictName || 'نامشخص'}" قبلاً در صف "${queueTypeLabel}"${positionText} ثبت شده است. لطفاً ابتدا نوبت قبلی را حذف کنید.`,
        conflictType,
        conflictName: conflictName || 'نامشخص',
        existingQueueType: existingEntry.queue_type,
        existingPosition: existingEntry.position
      });
    }

    // بررسی اینکه آیا راننده/خودرو در تابلو اعلام بار است (یعنی تخصیص فعال دارد)
    // اگر هست، یعنی از مسیر برگشته و باید تخصیص قبلی را finalize کنیم
    const activeAssignments = await client.query(
      `SELECT da.id, da.freight_announcement_id, fa.status, fa.announcement_code
       FROM dispatch_assignments da
       INNER JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
       WHERE (da.driver_id = $1 OR da.vehicle_id = $2)
         AND fa.status IN ('Assigned', 'InTransit')
         AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)`,
      [driverId, vehicleId]
    );

    // اگر تخصیص فعال دارد، آن را finalize می‌کنیم (یعنی از تابلو خارج می‌شود)
    if (activeAssignments.rowCount > 0) {
      console.log(`🔄 [createQueueEntry] Finalizing ${activeAssignments.rowCount} active assignment(s) for driver/vehicle before adding to queue`);
      
      for (const assignment of activeAssignments.rows) {
        // تغییر status اعلام بار به Finalized
        await client.query(
          `UPDATE freight_announcements 
           SET status = 'Finalized', updated_at = NOW() 
           WHERE id = $1`,
          [assignment.freight_announcement_id]
        );
        
        console.log(`✅ [createQueueEntry] Finalized freight announcement ${assignment.announcement_code} (ID: ${assignment.freight_announcement_id})`);
      }
    }

    // اعتبارسنجی تطابق نوع خودرو با vehicleCategory
    // استفاده از normalizedVehicleCategory برای validation
    const categoryForValidation = normalizedVehicleCategory || vehicleCategory;
    if (categoryForValidation && (categoryForValidation === 'trailer' || categoryForValidation === 'mini-trailer' || categoryForValidation === 'ten-wheel' || categoryForValidation === 'تریلی' || categoryForValidation === 'مینی تریلی' || categoryForValidation === 'ده چرخ')) {
      // گرفتن vehicle_type خودرو
      let vehicleCheck;
      let vehicleType = null;
      
      try {
        vehicleCheck = await client.query(
          'SELECT id, current_vehicle_type, plate_part1, plate_letter, plate_part2, plate_city_code, vehicle_code, brand, model, vehicle_tip FROM vehicles WHERE id = $1',
          [vehicleId]
        );
      } catch (err) {
        // اگر current_vehicle_type وجود نداشت، بدون آن بخوانیم
        if (err.code === '42703') {
          vehicleCheck = await client.query(
            'SELECT id, plate_part1, plate_letter, plate_part2, plate_city_code, vehicle_code, brand, model, vehicle_tip FROM vehicles WHERE id = $1',
            [vehicleId]
          );
        } else {
          throw err;
        }
      }
      
      if (vehicleCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'خودرو یافت نشد.' });
      }
      
      const vehicle = vehicleCheck.rows[0];
      vehicleType = vehicle.current_vehicle_type;
      
      // اگر current_vehicle_type خالی است، از vehicle_specifications استفاده می‌کنیم
      if (!vehicleType || vehicleType.trim() === '') {
        try {
          // جستجو در vehicle_specifications بر اساس brand, model, tip
          const specQuery = `
            SELECT vehicle_type 
            FROM vehicle_specifications 
            WHERE brand = $1 
              AND model = $2 
              AND (tip = $3 OR tip IS NULL)
            LIMIT 1
          `;
          const specResult = await client.query(specQuery, [
            vehicle.brand || '',
            vehicle.model || '',
            vehicle.vehicle_tip || ''
          ]);
          
          if (specResult.rows.length > 0 && specResult.rows[0].vehicle_type) {
            vehicleType = specResult.rows[0].vehicle_type;
          }
        } catch (specErr) {
          console.warn('⚠️ [createQueueEntry] خطا در جستجوی vehicle_specifications:', specErr.message);
          // ادامه می‌دهیم با vehicleType = null
        }
      }
      
      // اگر vehicle_type خالی است
      if (!vehicleType || vehicleType.trim() === '') {
        const plateInfo = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2 
          ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}` 
          : (vehicle.vehicle_code || 'این خودرو');
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: `نوع خودرو برای ${plateInfo} تعریف نشده است. لطفاً به قسمت "مدیریت خودروها" بروید و نوع خودرو را تعریف کنید.` 
        });
      }
      
      // تطابق نوع خودرو با vehicleCategory
      // استفاده از categoryForValidation برای مقایسه
      const isTrailerCategory = categoryForValidation === 'trailer' || categoryForValidation === 'تریلی';
      const isMiniTrailerCategory = categoryForValidation === 'mini-trailer' || categoryForValidation === 'مینی تریلی';
      const isTenWheelCategory = categoryForValidation === 'ten-wheel' || categoryForValidation === 'ده چرخ';
      const categoryLabel = isTrailerCategory ? 'تریلی' : isMiniTrailerCategory ? 'مینی تریلی' : 'ده چرخ';
      
      if (isTrailerCategory || isMiniTrailerCategory) {
        // باید خودرو "کشنده" باشد
        if (vehicleType !== 'کشنده') {
          const plateInfo = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2 
            ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}` 
            : (vehicle.vehicle_code || 'این خودرو');
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: `برای ثبت نوبت در رسته "${categoryLabel}"، خودرو باید از نوع "کشنده" باشد، اما خودروی انتخاب شده (${plateInfo}) از نوع "${vehicleType}" است. لطفاً یک خودروی "کشنده" انتخاب کنید.` 
          });
        }
      } else if (isTenWheelCategory) {
        // باید خودرو "ده چرخ" باشد
        if (vehicleType !== 'ده چرخ') {
          const plateInfo = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2 
            ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}` 
            : (vehicle.vehicle_code || 'این خودرو');
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: `برای ثبت نوبت در رسته "ده چرخ"، خودرو باید از نوع "ده چرخ" باشد، اما خودروی انتخاب شده (${plateInfo}) از نوع "${vehicleType}" است. لطفاً یک خودروی "ده چرخ" انتخاب کنید.` 
          });
        }
      }
    }

    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM dispatch_queue_entries WHERE queue_type = $1 AND vehicle_category = $2',
      [queueType, normalizedVehicleCategory || null]
    );

    const position = maxRows[0]?.next_pos || 1;

    const insert = await client.query(
      `INSERT INTO dispatch_queue_entries
        (vehicle_id, driver_id, vehicle_category, queue_type, position, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [vehicleId, driverId, normalizedVehicleCategory || null, queueType, position, notes || null, req.user?.id || null]
    );

    await client.query('COMMIT');
    res.status(201).json(insert.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [dispatch] createQueueEntry failed:', error);
    res.status(500).json({ message: 'خطا در ثبت نوبت' });
  } finally {
    client.release();
  }
}

async function deleteQueueEntry(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'شناسه نوبت الزامی است.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM dispatch_queue_entries WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'نوبت یافت نشد.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ [dispatch] deleteQueueEntry failed:', error);
    res.status(500).json({ message: 'خطا در حذف نوبت' });
  }
}

async function setQueueEntryPosition(client, entryId, position, actingUserId) {
  try {
    await client.query(
      `UPDATE dispatch_queue_entries
       SET position = $1,
           updated_by_user_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [position, actingUserId, entryId]
    );
  } catch (error) {
    if (error?.code === '42703') {
      await client.query(`UPDATE dispatch_queue_entries SET position = $1 WHERE id = $2`, [
        position,
        entryId,
      ]);
      return;
    }
    throw error;
  }
}

async function updateQueuePosition(req, res) {
  const { id } = req.params;
  let { position } = req.body || {};

  const numericPosition = Number(position);
  if (!id || !Number.isFinite(numericPosition) || numericPosition < 1) {
    return res.status(400).json({ message: 'مقدار ردیف معتبر نیست.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: entryRows } = await client.query(
      `SELECT id, queue_type, vehicle_category, position
       FROM dispatch_queue_entries
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (entryRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'نوبت یافت نشد.' });
    }

    const entry = entryRows[0];
    const { queue_type, vehicle_category } = entry;
    const oldPosition = Number(entry.position) || 0;
    const targetPosition = Math.trunc(numericPosition);
    const actingUserId = req.user?.id || null;

    if (targetPosition === oldPosition) {
      await client.query('COMMIT');
      return res.json({ success: true, mode: 'unchanged' });
    }

    await client.query(
      `SELECT id FROM dispatch_queue_entries
       WHERE queue_type = $1
         AND (vehicle_category IS NOT DISTINCT FROM $2)
       FOR UPDATE`,
      [queue_type, vehicle_category || null]
    );

    const { rows: siblingRows } = await client.query(
      `SELECT id, position
       FROM dispatch_queue_entries
       WHERE queue_type = $1
         AND (vehicle_category IS NOT DISTINCT FROM $2)
       ORDER BY position ASC, created_at ASC`,
      [queue_type, vehicle_category || null]
    );

    const peer = siblingRows.find(
      row => row.id !== id && Number(row.position) === targetPosition
    );

    if (peer) {
      await setQueueEntryPosition(client, peer.id, oldPosition, actingUserId);
      await setQueueEntryPosition(client, id, targetPosition, actingUserId);
      await client.query('COMMIT');
      return res.json({
        success: true,
        mode: 'swap',
        from: oldPosition,
        to: targetPosition,
      });
    }

    const total = siblingRows.length;
    const rank = Math.max(1, Math.min(targetPosition, total));
    const orderedIds = siblingRows.map(row => row.id).filter(rowId => rowId !== id);
    orderedIds.splice(rank - 1, 0, id);

    let newPos = 1;
    for (const rowId of orderedIds) {
      await setQueueEntryPosition(client, rowId, newPos, actingUserId);
      newPos += 1;
    }

    await client.query('COMMIT');
    res.json({ success: true, mode: 'reorder', rank });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [dispatch] updateQueuePosition failed:', error);
    res.status(500).json({ message: 'خطا در بروزرسانی ردیف' });
  } finally {
    client.release();
  }
}

const CATEGORY_KEY_TO_LABEL = {
  trailer: 'تریلی',
  'mini-trailer': 'مینی تریلی',
  'ten-wheel': 'ده چرخ',
};

function normalizeQueueType(rawQueueType, stage) {
  const value = (rawQueueType || '').toString().trim().toLowerCase();
  if (value === 'far' || value === 'near') return value;
  if (value.includes('نزدیک')) return 'near';
  if (value.includes('دور')) return 'far';
  return stage === 'stage2' ? 'near' : 'far';
}

async function restoreDriverToDispatchQueue(
  client,
  { driverId, vehicleId, queueType, vehicleCategory, queuePosition, createdByUserId }
) {
  if (!driverId || !vehicleId || !queueType) {
    return { restored: false, reason: 'missing_fields' };
  }

  const { rows: existing } = await client.query(
    `SELECT id, position FROM dispatch_queue_entries WHERE driver_id = $1`,
    [driverId]
  );
  if (existing.length > 0) {
    return {
      restored: false,
      reason: 'already_in_queue',
      entryId: existing[0].id,
      position: existing[0].position,
    };
  }

  const category = normalizeQueueVehicleCategory(vehicleCategory);
  let position = Number(queuePosition);

  if (!Number.isFinite(position) || position < 1) {
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
       FROM dispatch_queue_entries
       WHERE queue_type = $1 AND (vehicle_category IS NOT DISTINCT FROM $2)`,
      [queueType, category]
    );
    position = maxRows[0]?.next_pos || 1;
  } else {
    try {
      await client.query(
        `UPDATE dispatch_queue_entries
         SET position = position + 1, updated_at = NOW()
         WHERE queue_type = $1
           AND (vehicle_category IS NOT DISTINCT FROM $2)
           AND position >= $3`,
        [queueType, category, position]
      );
    } catch (shiftError) {
      if (shiftError?.code === '42703') {
        await client.query(
          `UPDATE dispatch_queue_entries
           SET position = position + 1
           WHERE queue_type = $1
             AND (vehicle_category IS NOT DISTINCT FROM $2)
             AND position >= $3`,
          [queueType, category, position]
        );
      } else {
        throw shiftError;
      }
    }
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO dispatch_queue_entries
      (vehicle_id, driver_id, vehicle_category, queue_type, position, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, position`,
    [vehicleId, driverId, category, queueType, position, createdByUserId || null]
  );

  return {
    restored: true,
    entryId: inserted[0]?.id,
    position: inserted[0]?.position,
    queueType,
    vehicleCategory: category,
  };
}

async function restoreDriversFromCancelledAssignment(client, announcementId, createdByUserId) {
  const { rows: assignments } = await client.query(
    `SELECT DISTINCT ON (da.driver_id)
       da.driver_id,
       da.vehicle_id,
       da.queue_type,
       da.vehicle_category,
       da.queue_position,
       da.stage,
       fa.vehicle_type AS announcement_vehicle_type
     FROM dispatch_assignments da
     LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
     WHERE da.freight_announcement_id = $1
       AND da.driver_id IS NOT NULL
       AND da.vehicle_id IS NOT NULL
       AND COALESCE(da.is_cancelled, FALSE) = FALSE
     ORDER BY da.driver_id, da.created_at DESC`,
    [announcementId]
  );

  const results = [];
  for (const row of assignments) {
    const queueType = normalizeQueueType(row.queue_type, row.stage);
    let queuePosition = row.queue_position;
    let queueCategory = row.vehicle_category;

    if (!queuePosition || !queueCategory) {
      const { rows: prevRows } = await client.query(
        `SELECT queue_position, queue_type, vehicle_category
         FROM dispatch_assignments
         WHERE driver_id = $1
           AND queue_position IS NOT NULL
           AND freight_announcement_id <> $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [row.driver_id, announcementId]
      );
      if (prevRows.length > 0) {
        queuePosition = queuePosition || prevRows[0].queue_position;
        queueCategory = queueCategory || prevRows[0].vehicle_category;
      }
    }

    const vehicleCategory = resolveDispatchQueueCategoryLabel({
      queueCategory,
      announcementVehicleType: row.announcement_vehicle_type,
    });

    const result = await restoreDriverToDispatchQueue(client, {
      driverId: row.driver_id,
      vehicleId: row.vehicle_id,
      queueType,
      vehicleCategory,
      queuePosition,
      createdByUserId,
    });
    results.push({ driverId: row.driver_id, ...result });

    if (result.restored) {
      await client.query(
        `UPDATE dispatch_driver_opportunities
         SET taken = FALSE, taken_at = NULL
         WHERE driver_id = $1 AND freight_announcement_id = $2`,
        [row.driver_id, announcementId]
      );
    }
  }
  return results;
}

async function getDriverLongRouteHistory(driverId, since, until) {
  const params = [driverId, since];
  let untilSql = '';
  if (until) {
    untilSql = 'AND da.created_at <= $3';
    params.push(until);
  }

  const { rows } = await pool.query(
    `
      SELECT
        da.id,
        da.created_at,
        da.stage,
        dr.city,
        dr.route_category,
        dr.distance_category,
        dr.round_trip_km,
        fa.announcement_code,
        fa.status
      FROM dispatch_assignments da
      LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      WHERE da.driver_id = $1
        AND da.created_at >= $2
        ${untilSql}
        AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
        AND fa.status NOT IN ('Cancelled')
        AND COALESCE(fa.finance_disposition, '') <> 'rejected'
        AND (
          COALESCE(da.assignment_finalized_at, fa.assignment_finalized_at) IS NOT NULL
          OR fa.status = 'Finalized'
        )
        AND (
          LOWER(REPLACE(REPLACE(REPLACE(COALESCE(dr.distance_category, ''), 'ي', 'ی'), 'ك', 'ک'), ' ', '')) LIKE '%خیلی‌دور%'
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(dr.distance_category, ''), 'ي', 'ی'), 'ك', 'ک'), ' ', '')) LIKE '%خیلیدور%'
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(dr.distance_category, ''), 'ي', 'ی'), 'ك', 'ک'), ' ', '')) LIKE '%veryfar%'
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(dr.route_category, ''), 'ي', 'ی'), 'ك', 'ک'), ' ', '')) LIKE '%خیلی‌دور%'
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(dr.route_category, ''), 'ي', 'ی'), 'ك', 'ک'), ' ', '')) LIKE '%خیلیدور%'
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(dr.route_category, ''), 'ي', 'ی'), 'ك', 'ک'), ' ', '')) LIKE '%veryfar%'
        )
      ORDER BY da.created_at DESC
    `,
    params
  );

  return rows.map(mapVeryFarHistoryRow);
}

const presetCategories = [
  { key: 'trailer', label: 'تریلی' },
  { key: 'mini-trailer', label: 'مینی تریلی' },
  { key: 'ten-wheel', label: 'ده چرخ' },
];

const normalizeVehicleText = (value) =>
  (value || '').toString().replace(/[\s_\-‌]/g, '').toLowerCase();

const categoryVehicleKeywords = {
  trailer: [
    'تریلی',
    'تریلر',
    'trailer',
    'semi',
    'semi-trailer',
    'semitrailer',
    'semtrailer',
    'semi trailer',
    'semitrail',
    'semitrailers',
    'نیمهتریلی',
    'کفی',
    'چادری',
  ],
  'mini-trailer': ['مینی', 'mini', 'mini-trailer', 'minitrailer', 'مینی‌تریلی', 'مینیتریلی'],
  'ten-wheel': [
    'دهچرخ',
    '10چرخ',
    'دهتن',
    'tenwheel',
    'tenwheeler',
    'ده-چرخ',
    'دهچرخکمپرسی',
    'دهچرخباری',
    'دهچرخخاور',
    'دهتنکفی',
  ],
};

const categoryVehicleKeywordsNormalized = Object.fromEntries(
  Object.entries(categoryVehicleKeywords).map(([key, keywords]) => [
    key,
    keywords.map(keyword => normalizeVehicleText(keyword)),
  ])
);

const categoryDetectionOrder = ['mini-trailer', 'ten-wheel', 'trailer'];

const resolveCategoryKey = (value) => {
  if (!value) return null;
  const normalized = normalizeVehicleText(value);
  for (const preset of presetCategories) {
    if (
      normalizeVehicleText(preset.label) === normalized ||
      normalizeVehicleText(preset.key) === normalized
    ) {
      return preset.key;
    }
  }
  return null;
};

const detectVehicleCategoryKey = (vehicleType) => {
  const normalized = normalizeVehicleText(vehicleType);
  if (!normalized) return null;
  for (const key of categoryDetectionOrder) {
    const keywords = categoryVehicleKeywordsNormalized[key] || [];
    if (keywords.some(keyword => keyword && normalized.includes(keyword))) {
      return key;
    }
  }
  return null;
};

const DISPATCH_QUEUE_LABELS = ['تریلی', 'مینی تریلی', 'ده چرخ'];

function resolveDispatchCategoryFromValue(value) {
  if (!value) return null;

  const presetKey = resolveCategoryKey(value);
  if (presetKey) {
    const preset = presetCategories.find(p => p.key === presetKey);
    if (preset) return preset.label;
  }

  const detectedKey = detectVehicleCategoryKey(value);
  if (detectedKey) {
    const preset = presetCategories.find(p => p.key === detectedKey);
    if (preset) return preset.label;
  }

  if (DISPATCH_QUEUE_LABELS.includes(value)) {
    return value;
  }

  return null;
}

function normalizeQueueVehicleCategory(queueCategory, announcementVehicleType = null) {
  return resolveDispatchQueueCategoryLabel({
    queueCategory,
    announcementVehicleType,
  });
}

/** دسته نوبت فقط از نوبت یا vehicle_type اعلام بار — نه vehicle_category جدول خودرو */
function resolveDispatchQueueCategoryLabel({
  queueCategory = null,
  announcementVehicleType = null,
} = {}) {
  const fromAnnouncement = resolveDispatchCategoryFromValue(announcementVehicleType);
  if (fromAnnouncement) return fromAnnouncement;

  return resolveDispatchCategoryFromValue(queueCategory);
}

async function resolveQueueEntryDisplayCategory(client, row) {
  const fromQueue = resolveDispatchQueueCategoryLabel({ queueCategory: row.vehicle_category });
  if (fromQueue) return fromQueue;

  if (row.driver_id) {
    const { rows: hist } = await client.query(
      `SELECT fa.vehicle_type
       FROM dispatch_assignments da
       JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
       WHERE da.driver_id = $1
         AND fa.vehicle_type IS NOT NULL
       ORDER BY da.created_at DESC
       LIMIT 1`,
      [row.driver_id]
    );
    const fromAnnouncement = resolveDispatchQueueCategoryLabel({
      announcementVehicleType: hist[0]?.vehicle_type,
    });
    if (fromAnnouncement) return fromAnnouncement;
  }

  return 'نامشخص';
}

async function getStageCandidates(req, res) {
  const stage = req.query.stage || 'stage1';
  const forceStage2 = req.query.forceStage2 === 'true';
  const subPhase = (req.query.subPhase || '').trim();
  const categoryFilter = req.query.category || '';
  const queueEntryIdParam = req.query.queueEntryId || null;
  if (!['stage1', 'stage2'].includes(stage)) {
    return res.status(400).json({ message: 'پارامتر stage نامعتبر است.' });
  }
  if (subPhase && !['far', 'near_vf', 'near_all'].includes(subPhase)) {
    return res.status(400).json({ message: 'پارامتر subPhase نامعتبر است.' });
  }

  try {
    await ensureDriverOpportunityTable();
    const { start, end, fromJalali, toJalali } = computeCycleRange();

    const queueRows = await pool.query(
      `SELECT q.*, d.name AS driver_name, d.mobile, d.employee_id,
              v.model AS vehicle_model, v.vehicle_code, v.brand
       FROM dispatch_queue_entries q
       LEFT JOIN drivers d ON d.id = q.driver_id
       LEFT JOIN vehicles v ON v.id = q.vehicle_id
       ORDER BY q.queue_type, q.position, q.created_at`
    );

    const queue = queueRows.rows || [];
    const driverHistoryMap = {};

    const dispatchDriverIds = [
      ...new Set(
        queue
          .filter(q => q.queue_type === 'far' || q.queue_type === 'near')
          .map(q => q.driver_id)
          .filter(Boolean)
      ),
    ];
    if (dispatchDriverIds.length > 0) {
      await Promise.all(
        dispatchDriverIds.map(async driverId => {
          const history = await getDriverLongRouteHistory(driverId, start, end);
          driverHistoryMap[driverId] = history;
        })
      );
    }

    // ابتدا اعلام بارها را بدون join با destinations بگیریم
    const freightRows = await pool.query(
      `
        SELECT DISTINCT
          fa.id,
          fa.announcement_code,
          fa.line_type,
          fa.assignment_type,
          fa.status,
          fa.origin_city,
          fa.vehicle_type,
          fa.created_at,
          fa.cargo_value,
          fa.total_freight_cost,
          fa.notes,
          fa.brand,
          fa.priority,
          fa.products
        FROM freight_announcements fa
        WHERE fa.status IN ('PendingCompanyAssignment', 'Assigned')
          AND (fa.assignment_type IS NULL OR fa.assignment_type IN ('company', 'شرکتی'))
          AND fa.status != 'PendingPersonalAssignment'
          AND (fa.assigned_driver_id IS NULL)
      `
    );
    
    console.log(`📦 [getStageCandidates] Found ${freightRows.rows.length} freight announcements with status PendingCompanyAssignment/PendingPersonalAssignment/Assigned, assignment_type company/NULL, and no assigned driver`);
    if (freightRows.rows.length > 0) {
      console.log(`📦 [getStageCandidates] Sample announcements:`, freightRows.rows.slice(0, 3).map(r => ({
        id: r.id,
        code: r.announcement_code,
        status: r.status,
        assignment_type: r.assignment_type,
        line_type: r.line_type
      })));
    }

    const announcements = [];

    // برای هر اعلام بار، همه مقاصد را بگیریم
    for (const row of freightRows.rows) {
      if (!isCompanyDispatchAssignable(row)) {
        continue;
      }
      // گرفتن همه مقاصد این اعلام بار
      const destRows = await pool.query(
        `SELECT id, city, representative_name, tonnage, freight_cost
         FROM freight_destinations
         WHERE freight_announcement_id = $1
         ORDER BY created_at ASC`,
        [row.id]
      );
      
      const destinations = destRows.rows || [];
      
      // اگر مقصدی نداشت، skip کنیم
      if (destinations.length === 0) {
        continue;
      }
      
      // پیدا کردن route برای آخرین مقصد (یا مقصدی که بیشترین کیلومتر را دارد)
      let routeInfo = null;
      let maxKm = 0;
      let lastDestinationCity = null;
      
      for (const dest of destinations) {
        const { rows: routeRows } = await pool.query(
          `SELECT id, city, province, route_category, round_trip_km, distance_category
           FROM dispatch_routes
           WHERE is_active = TRUE AND city = $1
           ORDER BY route_category DESC`,
          [dest.city]
        );

        if (routeRows.length > 0) {
          const route = routeRows[0];
          const km = route.round_trip_km ? Number(route.round_trip_km) : 0;
          // اگر این route کیلومتر بیشتری دارد، آن را انتخاب کن
          if (km > maxKm) {
            maxKm = km;
            routeInfo = route;
            lastDestinationCity = dest.city;
          }
        }
      }
      
      // اگر route پیدا نشد، از آخرین مقصد استفاده کن
      if (!routeInfo && destinations.length > 0) {
        const lastDest = destinations[destinations.length - 1];
        const { rows: routeRows } = await pool.query(
          `SELECT id, city, province, route_category, round_trip_km, distance_category
           FROM dispatch_routes
           WHERE is_active = TRUE AND city = $1
           ORDER BY route_category DESC`,
          [lastDest.city]
        );
        if (routeRows.length > 0) {
          routeInfo = routeRows[0];
          lastDestinationCity = lastDest.city;
        }
      }
      
      // ساخت رشته شهرها (مثلاً "سمنان-سبزوار")
      const citiesString = destinations.map(d => d.city).join('-');
      
      // استفاده از آخرین مقصد برای نمایش (اما همه مقاصد را در destination array نگه داریم)
      const primaryDestination = destinations[destinations.length - 1];

      announcements.push({
        id: row.id,
        announcementCode: row.announcement_code,
        lineType: row.line_type,
        vehicleType: row.vehicle_type,
        originCity: row.origin_city,
        createdAt: row.created_at,
        cargoValue: row.cargo_value != null ? Number(row.cargo_value) : undefined,
        totalFreightCost: row.total_freight_cost != null ? Number(row.total_freight_cost) : undefined,
        notes: row.notes || null,
        brand: row.brand || null,
        priority: row.priority || null,
        products: row.products
          ? Array.isArray(row.products)
            ? row.products
            : (() => {
                try {
                  return JSON.parse(row.products);
                } catch {
                  return [];
                }
              })()
          : [],
        // نمایش همه شهرها با - (مثلاً "سمنان-سبزوار")
        destination: {
          id: primaryDestination.id,
          city: citiesString, // همه شهرها با - جدا شده
          representativeName: primaryDestination.representative_name,
          tonnage: destinations.reduce((sum, d) => sum + (Number(d.tonnage) || 0), 0), // مجموع تناژ
          freightCost: destinations.reduce((sum, d) => sum + (Number(d.freight_cost) || 0), 0), // مجموع کرایه
        },
        // همه مقاصد را هم نگه داریم (برای استفاده در assignFreight)
        allDestinations: destinations.map(d => ({
          id: d.id,
          city: d.city,
          representativeName: d.representative_name,
          tonnage: d.tonnage,
          freightCost: d.freight_cost,
        })),
        route: routeInfo, // route آخرین مقصد یا مقصد با بیشترین کیلومتر
      });
    }

    const veryFarAnnouncements = announcements.filter(isVeryFarAnnouncement);
    const baleControlledStage2 =
      stage === 'stage2' && ['far', 'near_vf', 'near_all'].includes(subPhase);
    const filteredAnnouncements =
      stage === 'stage1'
        ? veryFarAnnouncements
        : stage === 'stage2' && subPhase === 'near_vf'
          ? veryFarAnnouncements
          : announcements;

    const veryFarForCategory = categoryFilter
      ? veryFarAnnouncements.filter(ann => vehicleMatchesCategory(ann.vehicleType, categoryFilter))
      : veryFarAnnouncements;

    const pendingStage1Count = veryFarForCategory.length;
    const globalPendingStage1Count = veryFarAnnouncements.length;
    const stage2Forced = stage === 'stage2' && (forceStage2 || baleControlledStage2);
    const stage2Locked =
      stage === 'stage2' && pendingStage1Count > 0 && !forceStage2 && !baleControlledStage2;
    let finalAnnouncements = stage2Locked ? [] : filteredAnnouncements;
    if (categoryFilter) {
      finalAnnouncements = finalAnnouncements.filter(ann =>
        vehicleMatchesCategory(ann.vehicleType, categoryFilter)
      );
    }

    const sortByPosition = list =>
      [...list].sort((a, b) => (a.position || 0) - (b.position || 0));

    let baseStageQueue = [];
    if (stage === 'stage1') {
      baseStageQueue = sortByPosition(queue.filter(q => q.queue_type === 'far'));
    } else if (stage === 'stage2') {
      if (subPhase === 'far') {
        baseStageQueue = sortByPosition(queue.filter(q => q.queue_type === 'far'));
      } else if (subPhase === 'near_vf' || subPhase === 'near_all') {
        baseStageQueue = sortByPosition(queue.filter(q => q.queue_type === 'near'));
      } else {
        baseStageQueue = queue
          .filter(q => q.queue_type === 'near' || q.queue_type === 'far')
          .sort((a, b) => {
            if (a.queue_type !== b.queue_type) {
              return a.queue_type === 'far' ? -1 : 1;
            }
            return (a.position || 0) - (b.position || 0);
          });
      }
    }

    const driverNeverWentVeryFar = driverId =>
      (driverHistoryMap[driverId] || []).length === 0;

    const stageQueue = baseStageQueue.filter(item => {
      if (stage === 'stage1') {
        return driverNeverWentVeryFar(item.driver_id);
      }
      if (stage === 'stage2' && subPhase === 'near_vf') {
        return driverNeverWentVeryFar(item.driver_id);
      }
      return true;
    });

    const mapQueueItemWithHistory = item => {
      const history = driverHistoryMap[item.driver_id] || [];
      return {
        id: item.id,
        driverId: item.driver_id,
        vehicleId: item.vehicle_id,
        queueType: item.queue_type,
        vehicleCategory: item.vehicle_category,
        position: item.position,
        notes: item.notes,
        driver: {
          id: item.driver_id,
          name: item.driver_name,
          mobile: item.mobile,
          employeeId: item.employee_id,
        },
        vehicle: {
          id: item.vehicle_id,
          model: item.vehicle_model,
          brand: item.vehicle_brand,
          vehicleCode: item.vehicle_code,
        },
        longRouteHistory: history,
        lastVeryFarAtJalali: history[0]?.atJalali || null,
        hasVeryFarHistory: history.length > 0,
        blockedStage1:
          stage === 'stage1' &&
          (item.queue_type !== 'far' || history.length > 0),
      };
    };

    const queueWithHistory = stageQueue.map(mapQueueItemWithHistory);

    let displayBase = sortByPosition(
      queue.filter(q => q.queue_type === 'far' || q.queue_type === 'near')
    );
    if (categoryFilter) {
      displayBase = displayBase.filter(q =>
        vehicleMatchesCategory(q.vehicle_category, categoryFilter)
      );
    }
    const displayQueue = displayBase.map(mapQueueItemWithHistory);

    if (queueEntryIdParam) {
      const targetEntry = queueWithHistory.find(item => item.id === queueEntryIdParam);
      if (targetEntry) {
        await logDriverOpportunities(
          targetEntry.driverId,
          targetEntry.id,
          stage,
          finalAnnouncements,
          req.user?.id || null,
          queueWithHistory
        );
      }
    }

    res.json({
      stage,
      subPhase: subPhase || null,
      cycleStart: start,
      cycleEnd: end,
      cycleFromJalali: fromJalali,
      cycleToJalali: toJalali,
      queue: queueWithHistory,
      displayQueue,
      announcements: finalAnnouncements,
      pendingStage1Count,
      globalPendingStage1Count,
      stage2Locked,
      stage2Forced,
    });
  } catch (error) {
    console.error('❌ [dispatch] getStageCandidates failed:', error);
    res.status(500).json({ message: 'خطا در دریافت داده‌های تخصیص' });
  }
}

async function assignFreight(req, res) {
  const {
    stage,
    freightAnnouncementId,
    destinationId,
    driverId,
    vehicleId,
    queueEntryId,
  } = req.body || {};

  if (!freightAnnouncementId || !driverId || !vehicleId || !stage) {
    return res.status(400).json({ message: 'پارامترهای اجباری ارسال نشده است.' });
  }

  if (!['stage1', 'stage2'].includes(stage)) {
    return res.status(400).json({ message: 'stage نامعتبر است.' });
  }

  await ensureDriverOpportunityTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: annRows } = await client.query(
      `SELECT id, announcement_code, status, assignment_type, vehicle_type, line_type
       FROM freight_announcements
       WHERE id = $1 FOR UPDATE`,
      [freightAnnouncementId]
    );

    if (annRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'اعلام بار یافت نشد.' });
    }

    const announcement = annRows[0];
    if (announcement.status === 'Finalized') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'اعلام بار قبلاً نهایی شده است.' });
    }

    if (!isCompanyDispatchAssignable(announcement)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'این بار به ترابری دیگر ارجاع شده و از تابلوی نوبت شرکت قابل تخصیص نیست.',
      });
    }

    // کنترل تطابق نوع خودرو با اعلام بار
    if (announcement.vehicle_type && (announcement.vehicle_type === 'تریلی' || announcement.vehicle_type === 'مینی تریلی' || announcement.vehicle_type === 'ده چرخ')) {
      // گرفتن vehicle_type خودرو
      // ابتدا سعی می‌کنیم current_vehicle_type را از vehicles بخوانیم
      let vehicleCheck;
      let vehicleType = null;
      
      try {
        vehicleCheck = await client.query(
          'SELECT id, current_vehicle_type, plate_part1, plate_letter, plate_part2, plate_city_code, vehicle_code, brand, model, vehicle_tip FROM vehicles WHERE id = $1',
          [vehicleId]
        );
      } catch (err) {
        // اگر current_vehicle_type وجود نداشت، بدون آن بخوانیم
        if (err.code === '42703') {
          vehicleCheck = await client.query(
            'SELECT id, plate_part1, plate_letter, plate_part2, plate_city_code, vehicle_code, brand, model, vehicle_tip FROM vehicles WHERE id = $1',
            [vehicleId]
          );
        } else {
          throw err;
        }
      }
      
      if (vehicleCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'خودرو یافت نشد.' });
      }
      
      const vehicle = vehicleCheck.rows[0];
      vehicleType = vehicle.current_vehicle_type;
      
      // اگر current_vehicle_type خالی است، از vehicle_specifications استفاده می‌کنیم
      if (!vehicleType || vehicleType.trim() === '') {
        try {
          // جستجو در vehicle_specifications بر اساس brand, model, tip
          const specQuery = `
            SELECT vehicle_type 
            FROM vehicle_specifications 
            WHERE brand = $1 
              AND model = $2 
              AND (tip = $3 OR tip IS NULL)
            LIMIT 1
          `;
          const specResult = await client.query(specQuery, [
            vehicle.brand || '',
            vehicle.model || '',
            vehicle.vehicle_tip || ''
          ]);
          
          if (specResult.rows.length > 0 && specResult.rows[0].vehicle_type) {
            vehicleType = specResult.rows[0].vehicle_type;
          }
        } catch (specErr) {
          console.warn('⚠️ [assignFreight] خطا در جستجوی vehicle_specifications:', specErr.message);
          // ادامه می‌دهیم با vehicleType = null
        }
      }
      
      // اگر vehicle_type خالی است
      if (!vehicleType || vehicleType.trim() === '') {
        const plateInfo = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2 
          ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}` 
          : (vehicle.vehicle_code || 'این خودرو');
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: `نوع خودرو برای ${plateInfo} تعریف نشده است. لطفاً به قسمت "مدیریت خودروها" بروید و نوع خودرو را تعریف کنید.` 
        });
      }
      
      // تطابق نوع خودرو با اعلام بار
      if (announcement.vehicle_type === 'تریلی' || announcement.vehicle_type === 'مینی تریلی') {
        // باید خودرو "کشنده" باشد
        if (vehicleType !== 'کشنده') {
          const plateInfo = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2 
            ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}` 
            : (vehicle.vehicle_code || 'این خودرو');
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: `این اعلام بار برای "${announcement.vehicle_type}" است، اما خودروی تخصیص داده شده (${plateInfo}) از نوع "${vehicleType}" است. لطفاً یک خودروی "کشنده" تخصیص دهید.` 
          });
        }
      } else if (announcement.vehicle_type === 'ده چرخ') {
        // باید خودرو "ده چرخ" باشد
        if (vehicleType !== 'ده چرخ') {
          const plateInfo = vehicle.plate_part1 && vehicle.plate_letter && vehicle.plate_part2 
            ? `${vehicle.plate_part1}${vehicle.plate_letter}${vehicle.plate_part2}` 
            : (vehicle.vehicle_code || 'این خودرو');
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: `این اعلام بار برای "ده چرخ" است، اما خودروی تخصیص داده شده (${plateInfo}) از نوع "${vehicleType}" است. لطفاً یک خودروی "ده چرخ" تخصیص دهید.` 
          });
        }
      }
    }

    // گرفتن همه مقاصد این اعلام بار (نه فقط یک مقصد)
    const { rows: allDestRows } = await client.query(
      `SELECT id, city
       FROM freight_destinations
       WHERE freight_announcement_id = $1
       ORDER BY created_at ASC`,
      [freightAnnouncementId]
    );

    // اگر مقصدی نداشت، خطا برگردان
    if (allDestRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'اعلام بار مقصدی ندارد.' });
    }

    // پیدا کردن route اصلی (دورترین مقصد) برای queue_type و stage
    const destRoutes = await lookupRoutesForDestinations(client, allDestRows);
    const { route, primaryDestination } = pickPrimaryRouteFromList(allDestRows, destRoutes);

    let actingUserId = req.user?.id || null;
    if (!actingUserId && queueEntryId) {
      const { rows: queueUserRows } = await client.query(
        `SELECT created_by_user_id FROM dispatch_queue_entries WHERE id = $1`,
        [queueEntryId]
      );
      actingUserId = queueUserRows[0]?.created_by_user_id || null;
    }

    let actingUserName = req.user?.name || req.user?.username || null;

    if (actingUserId) {
      const { rows: userRows } = await client.query(
        `SELECT id, name, username FROM users WHERE id = $1`,
        [actingUserId]
      );
      if (!userRows.length) {
        actingUserId = null;
        actingUserName = null;
      } else {
        const userRow = userRows[0];
        if (!actingUserName || actingUserName.trim() === '') {
          actingUserName = userRow.name || userRow.username || null;
        }
      }
    }

    if (!actingUserId || !actingUserName) {
      const { rows: fallbackRows } = await client.query(
        `SELECT id, name, username FROM users WHERE username = 'system' LIMIT 1`
      );
      const fallback = fallbackRows[0];
      if (fallback) {
        actingUserId = actingUserId || fallback.id;
        actingUserName = actingUserName || fallback.name || fallback.username;
      }
    }

    if (!actingUserId) {
      const { rows: anyUserRows } = await client.query(
        `SELECT id, name, username FROM users ORDER BY username LIMIT 1`
      );
      const anyUser = anyUserRows[0];
      if (anyUser) {
        actingUserId = anyUser.id;
        actingUserName = actingUserName || anyUser.name || anyUser.username || 'سیستم';
      }
    }

    if (!actingUserId) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        message: 'خطا در ثبت تخصیص',
        details: 'کاربر معتبر برای ثبت تاریخچه یافت نشد.',
      });
    }

    let queueEntryRow = null;
    let queueTypeFromEntry = null;
    let vehicleCategoryFromEntry = null;
    if (queueEntryId) {
      const { rows: queueEntryRows } = await client.query(
        `SELECT id, position, queue_type, driver_id, vehicle_category FROM dispatch_queue_entries WHERE id = $1`,
        [queueEntryId]
      );
      queueEntryRow = queueEntryRows[0] || null;
      queueTypeFromEntry = queueEntryRow?.queue_type || null;
      vehicleCategoryFromEntry = queueEntryRow?.vehicle_category || null;
    }

    if (queueEntryRow?.vehicle_category && announcement.vehicle_type) {
      if (!vehicleMatchesCategory(announcement.vehicle_type, queueEntryRow.vehicle_category)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `این اعلام بار برای «${announcement.vehicle_type}» است اما نوبت در صف «${queueEntryRow.vehicle_category}» ثبت شده است.`,
        });
      }
    }

    const queuePosition = queueEntryRow?.position ?? null;
    const now = new Date();

    const { rows: driverRows } = await client.query(
      `SELECT name FROM drivers WHERE id = $1`,
      [driverId]
    );
    const driverName = driverRows[0]?.name || 'راننده نامشخص';

    const { rows: vehicleRows } = await client.query(
      `SELECT vehicle_code, model FROM vehicles WHERE id = $1`,
      [vehicleId]
    );
    const vehicleLabel =
      vehicleRows[0]?.vehicle_code ||
      vehicleRows[0]?.model ||
      'خودرو نامشخص';

    const stageLabel = stage === 'stage1' ? 'مرحله اول' : 'مرحله دوم';
    const descriptionText = `تخصیص ${stageLabel} به راننده ${driverName} با خودرو ${vehicleLabel}`;
    await client.query(
      `UPDATE freight_announcements
       SET assigned_driver_id = $1,
           assigned_vehicle_id = $2,
           status = 'Assigned',
           updated_at = NOW()
       WHERE id = $3`,
      [driverId, vehicleId, freightAnnouncementId]
    );

    await client.query(
      `INSERT INTO freight_announcement_history
        (freight_announcement_id, user_id, user_name, action, description, old_status, new_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        freightAnnouncementId,
        actingUserId,
        actingUserName,
        stage === 'stage1' ? 'ASSIGNED_STAGE1' : 'ASSIGNED_STAGE2',
        descriptionText,
        announcement.status || null,
        'Assigned',
      ]
    );

    const finalVehicleCategory = resolveDispatchQueueCategoryLabel({
      queueCategory: vehicleCategoryFromEntry,
      announcementVehicleType: announcement.vehicle_type,
    });
    
    // برای هر مقصد یک dispatch_assignments — route و km همان مقصد (نه دورترین)
    for (let i = 0; i < allDestRows.length; i++) {
      const dest = allDestRows[i];
      const destRoute = destRoutes[i] || null;
      await client.query(
        `INSERT INTO dispatch_assignments
          (freight_announcement_id, freight_destination_id, vehicle_id, driver_id, stage, route_id, distance_km, created_by, created_at, queue_position, assigned_at_jalali, queue_entry_id, queue_type, vehicle_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13)`,
        [
          freightAnnouncementId,
          dest.id,
          vehicleId,
          driverId,
          stage,
          destRoute ? destRoute.id : null,
          destRoute ? destRoute.round_trip_km : null,
          actingUserId,
          queuePosition,
          timestampToJalaliDate(now),
          queueEntryId || null,
          queueTypeFromEntry || (stage === 'stage1' ? 'far' : 'near'),
          finalVehicleCategory,
        ]
      );
    }

    if (queueEntryId) {
      await client.query('DELETE FROM dispatch_queue_entries WHERE id = $1', [queueEntryId]);
    }

    await client.query(
      `UPDATE dispatch_driver_opportunities
         SET taken = TRUE,
             taken_at = NOW(),
             queue_position = COALESCE(queue_position, $4)
       WHERE driver_id = $1
         AND stage = $2
         AND freight_announcement_id = $3`,
      [driverId, stage, freightAnnouncementId, queuePosition]
    );

    await client.query('COMMIT');
    res.json({ success: true, assignedAt: now });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [dispatch] assignFreight failed:', error);
    res.status(500).json({ message: 'خطا در ثبت تخصیص', details: error?.message || null });
  } finally {
    client.release();
  }
}

async function getDriverPreferences(req, res) {
  const { driverId } = req.params || {};
  let { from, to, category: categoryParam } = req.query || {};
  const vehicleCategoryFilter = normalizeCategoryFilter(
    typeof categoryParam === 'string' ? categoryParam : null
  );

  if (!driverId) {
    return res.status(400).json({ message: 'شناسه راننده الزامی است.' });
  }

  try {
    await ensureDriverOpportunityTable();

    const driverResult = await pool.query(
      `SELECT id, name, employee_id, mobile FROM drivers WHERE id = $1`,
      [driverId]
    );
    if (driverResult.rowCount === 0) {
      return res.status(404).json({ message: 'راننده یافت نشد.' });
    }

    const { fromDate: defaultFromDate, toDate: defaultToDate } = computeDefaultPreferenceRange(new Date());
    let fromDate = defaultFromDate;
    let toDate = defaultToDate;

    if (typeof from === 'string' && from.trim()) {
      const parsed = parseJalaliDateString(from.trim().replace(/\\/g, '/'));
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'تاریخ شروع نامعتبر است.' });
      }
      fromDate = parsed;
    }
    if (typeof to === 'string' && to.trim()) {
      const parsed = parseJalaliDateString(to.trim().replace(/\\/g, '/'));
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'تاریخ پایان نامعتبر است.' });
      }
      toDate = parsed;
    }

    if (fromDate > toDate) {
      const tmp = fromDate;
      fromDate = toDate;
      toDate = tmp;
    }

    const fromStart = new Date(fromDate);
    fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(toDate);
    toEnd.setHours(23, 59, 59, 999);

    const fromISO = fromStart.toISOString();
    const toISO = toEnd.toISOString();
    const fromJalali = timestampToJalaliDate(fromStart);
    const toJalali = timestampToJalaliDate(toEnd);

    // Try to get queue_type from multiple sources:
    // 1. From dispatch_queue_entries via queue_entry_id in dispatch_assignments
    // 2. From dispatch_driver_opportunities which has queue_entry_id
    // 3. Fallback to stage (stage1 = far, stage2 = near)
    const assignmentsRes = await pool.query(
      `
        SELECT
          da.id,
          da.freight_announcement_id,
          da.stage,
          da.created_at,
          da.queue_position,
          da.assigned_at_jalali,
          da.distance_km,
          fa.announcement_code,
          fa.line_type,
          fa.vehicle_type,
          fa.origin_city,
          fa.brand,
          fa.priority,
          fd.city AS destination_city,
          fd.created_at AS destination_created_at,
          dr.route_category,
          dr.distance_category,
          dr.round_trip_km,
          v.vehicle_code,
          COALESCE(da.queue_type, dqe.queue_type, CASE WHEN da.stage = 'stage1' THEN 'far' ELSE 'near' END) AS queue_type,
          COALESCE(da.is_cancelled, FALSE) AS is_cancelled,
          fa.status AS freight_status,
          COALESCE(da.assignment_finalized_at, fa.assignment_finalized_at) AS assignment_finalized_at
        FROM dispatch_assignments da
        LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
        LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
        LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
        LEFT JOIN vehicles v ON v.id = da.vehicle_id
        LEFT JOIN LATERAL (
          SELECT dqe2.queue_type
          FROM dispatch_driver_opportunities ddo
          LEFT JOIN dispatch_queue_entries dqe2 ON dqe2.id::text = ddo.queue_entry_id::text
          WHERE ddo.driver_id = da.driver_id
            AND ddo.freight_announcement_id = da.freight_announcement_id
            AND ddo.taken = TRUE
          ORDER BY ddo.taken_at DESC
          LIMIT 1
        ) dqe ON TRUE
        WHERE da.driver_id = $1
          AND da.created_at BETWEEN $2 AND $3
          AND fa.status != 'Cancelled'
          AND (fa.status IN ('Assigned', 'InTransit', 'Finalized') OR da.is_cancelled = TRUE)
        ORDER BY da.created_at DESC, fd.created_at ASC
      `,
      [driverId, fromISO, toISO]
    );

    const assignmentsWithQueueType = assignmentsRes.rows;

    let taken = groupAssignmentsByTrip(
      assignmentsWithQueueType.map(row => mapAssignmentRow(row, timestampToJalaliDate))
    );
    if (vehicleCategoryFilter) {
      taken = taken.filter(item => vehicleMatchesCategory(item.vehicleType, vehicleCategoryFilter));
    }

    const opportunitiesRes = await pool.query(
      `
        SELECT
          ddo.id,
          ddo.stage,
          ddo.freight_announcement_id,
          ddo.seen_at,
          ddo.seen_at_jalali,
          ddo.queue_position,
          fa.announcement_code,
          fa.line_type,
          fa.vehicle_type,
          fa.origin_city,
          fd.city AS destination_city,
          dr.route_category,
          dr.distance_category,
          dr.round_trip_km
        FROM dispatch_driver_opportunities ddo
        LEFT JOIN freight_announcements fa ON fa.id = ddo.freight_announcement_id
        LEFT JOIN LATERAL (
          SELECT fd2.city
          FROM freight_destinations fd2
          WHERE fd2.freight_announcement_id = fa.id
          ORDER BY fd2.created_at DESC
          LIMIT 1
        ) fd ON TRUE
        LEFT JOIN dispatch_routes dr ON dr.city = fd.city AND dr.is_active = TRUE
        WHERE ddo.driver_id = $1
          AND ddo.seen_at BETWEEN $2 AND $3
          AND ddo.taken = FALSE
          AND (fa.status IS NULL OR fa.status NOT IN ('Cancelled'))
        ORDER BY ddo.seen_at DESC
        LIMIT 200
      `,
      [driverId, fromISO, toISO]
    );

    let skipped = opportunitiesRes.rows
      .map(row => mapOpportunityRow(row, timestampToJalaliDate))
      .filter(item => vehicleMatchesCategory(item.vehicleType, vehicleCategoryFilter))
      .filter(item => isFarOrVeryFarOpportunity(item));

    buildAssignmentNotes(taken, skipped);

    const cycleSummary = buildCycleSummary(taken);
    const stats = buildStats(taken);

    const peerAssignments = await (async () => {
      const peerValues = [fromISO, toISO];
      let categoryClause = '';
      if (vehicleCategoryFilter) {
        const categoryIndex = peerValues.push(vehicleCategoryFilter);
        categoryClause = `
          AND (
            v.vehicle_category = $${categoryIndex}
            OR fa.vehicle_type = $${categoryIndex}
            OR ($${categoryIndex} = 'تریلی' AND fa.vehicle_type IN ('تریلی', 'مینی تریلی'))
            OR ($${categoryIndex} = 'مینی تریلی' AND fa.vehicle_type IN ('تریلی', 'مینی تریلی'))
          )
        `;
      }
      const peerRes = await pool.query(
        `
          SELECT
            da.id,
            da.freight_announcement_id,
            da.driver_id,
            d.name AS driver_name,
            d.employee_id,
            da.stage,
            da.queue_position,
            da.queue_type,
            da.created_at,
            da.assigned_at_jalali,
            COALESCE(da.is_cancelled, FALSE) AS is_cancelled,
            COALESCE(dr.round_trip_km, da.distance_km) AS round_trip_km,
            dr.route_category,
            dr.distance_category,
            fa.announcement_code,
            fa.line_type,
            fa.status AS freight_status,
            COALESCE(da.assignment_finalized_at, fa.assignment_finalized_at) AS assignment_finalized_at,
            fd.city AS destination_city,
            fd.created_at AS destination_created_at,
            v.vehicle_code,
            prev.origin_city AS previous_origin_city
          FROM dispatch_assignments da
          LEFT JOIN drivers d ON d.id = da.driver_id
          LEFT JOIN vehicles v ON v.id = da.vehicle_id
          LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
          LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
          LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
          LEFT JOIN LATERAL (
            SELECT fa2.origin_city
            FROM dispatch_assignments da_prev
            LEFT JOIN freight_announcements fa2 ON fa2.id = da_prev.freight_announcement_id
            WHERE da_prev.driver_id = da.driver_id
              AND da_prev.created_at < da.created_at
            ORDER BY da_prev.created_at DESC
            LIMIT 1
          ) prev ON TRUE
          WHERE da.created_at BETWEEN $1 AND $2
            AND (fa.status IS NULL OR fa.status NOT IN ('Cancelled') OR da.is_cancelled = TRUE)
            ${categoryClause}
          ORDER BY da.created_at DESC, fd.created_at ASC
          LIMIT 150
        `,
        peerValues
      );
      const peerMapped = peerRes.rows.map(row => {
        const certaintyInfo = resolveAssignmentCertainty(row);
        return {
          id: row.id,
          announcementId: row.freight_announcement_id,
          driverId: row.driver_id,
          driverName: row.driver_name,
          employeeId: row.employee_id,
          stage: row.stage,
          queuePosition: row.queue_position ?? null,
          queueType: row.queue_type || (row.stage === 'stage1' ? 'far' : 'near'),
          lineType: row.line_type,
          destinationCity: row.destination_city,
          destinationOrder: row.destination_created_at
            ? new Date(row.destination_created_at).getTime()
            : 0,
          roundTripKm: row.round_trip_km != null ? Number(row.round_trip_km) : null,
          vehicleCode: row.vehicle_code || null,
          isVeryFar: routeIsVeryFar(row),
          assignedAt: row.created_at,
          assignedAtJalali: row.assigned_at_jalali || timestampToJalaliDate(row.created_at),
          previousOriginCity: row.previous_origin_city || null,
          announcementCode: row.announcement_code,
          isCancelled: row.is_cancelled || false,
          certainty: certaintyInfo.certainty,
          certaintyLabel: certaintyInfo.certaintyLabel,
        };
      });
      return groupAssignmentsByTrip(peerMapped).map(item => ({
        id: item.id,
        announcementId: item.announcementId,
        driverId: item.driverId,
        driverName: item.driverName,
        employeeId: item.employeeId,
        stage: item.stage,
        queuePosition: item.queuePosition ?? null,
        queueType: item.queueType,
        lineType: item.lineType,
        destinationCity: item.destinationCity,
        roundTripKm: item.roundTripKm,
        vehicleCode: item.vehicleCode,
        isVeryFar: item.isVeryFar,
        assignedAt: item.assignedAt,
        assignedAtJalali: item.assignedAtJalali,
        previousOriginCity: item.previousOriginCity,
        announcementCode: item.announcementCode,
        isCancelled: item.isCancelled,
        certainty: item.certainty,
        certaintyLabel: item.certaintyLabel,
      }));
    })();

    res.json({
      driver: {
        id: driverResult.rows[0].id,
        name: driverResult.rows[0].name,
        employeeId: driverResult.rows[0].employee_id,
        mobile: driverResult.rows[0].mobile,
      },
      category: vehicleCategoryFilter,
      from: fromISO,
      to: toISO,
      fromJalali,
      toJalali,
      cycleSummary,
      stats,
      taken,
      skipped,
      peerAssignments,
    });
  } catch (error) {
    console.error('❌ [dispatch] getDriverPreferences failed:', error);
    res.status(500).json({ message: 'خطا در دریافت ترجیحات راننده' });
  }
}

async function getBoard(req, res) {
  try {
    // ابتدا همه dispatch_assignments را با مقاصدشان بگیریم
    // منطق: راننده و خودرو تا زمانی که مجدد در نوبت قرار بگیرند در تابلو می‌مانند
    // اگر راننده یا خودرو در dispatch_queue_entries هستند، از تابلو خارج می‌شوند
    const { rows: allRows } = await pool.query(
      `SELECT
         da.id,
         da.freight_announcement_id,
         da.stage,
         da.created_at,
         da.assignment_finalized_at,
         da.vehicle_id,
         da.driver_id,
         da.route_id,
         fa.announcement_code,
         fa.line_type,
         fa.vehicle_type,
         fa.origin_city,
         fd.city AS destination_city,
         fd.representative_name,
         dr.province,
         dr.route_category,
         dr.round_trip_km,
         dr.expected_days,
         d.name AS driver_name,
         d.mobile AS driver_mobile,
         d.employee_id,
         v.model AS vehicle_model,
         v.vehicle_code,
         COALESCE(da.vehicle_category, v.vehicle_category) AS vehicle_category,
         -- چک می‌کنیم که آیا راننده یا خودرو در نوبت هستند یا نه
         -- اگر راننده یا خودرو در dispatch_queue_entries هستند، از تابلو خارج می‌شوند
         CASE WHEN EXISTS (
           SELECT 1 FROM dispatch_queue_entries dqe 
           WHERE dqe.driver_id = da.driver_id
         ) THEN TRUE ELSE FALSE END AS driver_in_queue,
         CASE WHEN EXISTS (
           SELECT 1 FROM dispatch_queue_entries dqe 
           WHERE dqe.vehicle_id = da.vehicle_id
         ) THEN TRUE ELSE FALSE END AS vehicle_in_queue
       FROM dispatch_assignments da
       LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
       LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
       LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
       LEFT JOIN drivers d ON d.id = da.driver_id
       LEFT JOIN vehicles v ON v.id = da.vehicle_id
       WHERE fa.status IN ('Assigned', 'InTransit', 'Finalized')
         AND fa.status NOT IN ('Cancelled')
         AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
         -- فقط راننده‌ها و خودروهای شرکتی: بررسی می‌کنیم که vehicle_id و driver_id در جداول company وجود دارند
         -- اگر vehicle_id یا driver_id NULL باشد، آن را رد می‌کنیم (چون باید در جداول company باشند)
         AND (da.vehicle_id IS NOT NULL AND v.id IS NOT NULL)
         AND (da.driver_id IS NOT NULL AND d.id IS NOT NULL)
       ORDER BY da.freight_announcement_id, fd.created_at ASC`
    );

    // فیلتر کردن: اگر راننده یا خودرو در نوبت هستند، از تابلو خارج می‌شوند
    const filteredRows = allRows.filter(row => {
      // اگر راننده یا خودرو در نوبت هستند، از تابلو خارج می‌شوند
      return !(row.driver_in_queue || row.vehicle_in_queue);
    });
    
    // گروه‌بندی بر اساس freight_announcement_id
    const announcementMap = new Map();
    
    for (const row of filteredRows) {
      const annId = row.freight_announcement_id;
      
      if (!announcementMap.has(annId)) {
        // اولین ردیف برای این اعلام بار - ایجاد entry جدید
        announcementMap.set(annId, {
          assignmentId: row.id,
          freightAnnouncementId: annId,
          stage: row.stage,
          createdAt: row.created_at,
          assignmentFinalizedAt: row.assignment_finalized_at,
          announcementCode: row.announcement_code,
          lineType: row.line_type,
          vehicleType: row.vehicle_type,
          originCity: row.origin_city,
          driver: {
            id: row.driver_id,
            name: row.driver_name,
            mobile: row.driver_mobile,
            employeeId: row.employee_id,
          },
          vehicle: {
            id: row.vehicle_id,
            model: row.vehicle_model,
            vehicleCode: row.vehicle_code,
            vehicleCategory: row.vehicle_category,
          },
          route: {
            id: row.route_id,
            province: row.province,
            routeCategory: row.route_category,
            roundTripKm: row.round_trip_km,
            expectedDays: row.expected_days,
          },
          destinations: [], // لیست همه مقاصد
          lastDestinationCity: null, // مقصد آخر برای grouping
        });
      }
      
      // اضافه کردن مقصد به لیست
      const entry = announcementMap.get(annId);
      if (row.destination_city) {
        entry.destinations.push(row.destination_city);
        entry.lastDestinationCity = row.destination_city; // آخرین مقصد
      }
      
      // اگر route این مقصد کیلومتر بیشتری دارد، آن را استفاده کن
      if (row.round_trip_km && (!entry.route.roundTripKm || Number(row.round_trip_km) > Number(entry.route.roundTripKm))) {
        entry.route = {
          id: row.route_id,
          province: row.province,
          routeCategory: row.route_category,
          roundTripKm: row.round_trip_km,
          expectedDays: row.expected_days,
        };
      }
    }

    // تبدیل به array و ساخت route summary
    const entries = Array.from(announcementMap.values()).map(entry => {
      // ساخت خلاصه مسیر (مثلاً "سمنان-سبزوار")
      const routeSummary = entry.destinations.join('-');
      
      // اضافه کردن route summary به اسم راننده
      const driverNameWithRoute = entry.destinations.length > 1 
        ? `${entry.driver.name} (${routeSummary})`
        : entry.driver.name;
      
      return {
        ...entry,
        driver: {
          ...entry.driver,
          name: driverNameWithRoute,
        },
        routeSummary, // برای استفاده در frontend
        daysSinceAssignment: (() => {
          // استفاده از created_at (تاریخ تخصیص) برای محاسبه تعداد روزها
          // assignment_finalized_at تاریخ finalize است، نه تاریخ تخصیص
          const assignmentDate = entry.createdAt;
          if (!assignmentDate) return 0;
          const assignmentDateTime = new Date(assignmentDate);
          const now = new Date();
          
          // محاسبه تفاوت روزها بر اساس تاریخ (بدون در نظر گیری ساعت)
          // استفاده از UTC برای مقایسه دقیق‌تر
          const assignmentDateUTC = new Date(Date.UTC(
            assignmentDateTime.getFullYear(),
            assignmentDateTime.getMonth(),
            assignmentDateTime.getDate()
          ));
          const nowUTC = new Date(Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          ));
          
          const diffTime = nowUTC.getTime() - assignmentDateUTC.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          
          return diffDays;
        })(),
      };
    });

    // گروه‌بندی بر اساس آخرین مقصد
    const grouped = {};
    for (const entry of entries) {
      const city = entry.lastDestinationCity || 'نامشخص';
      if (!grouped[city]) {
        grouped[city] = [];
      }
      grouped[city].push(entry);
    }

    // مرتب‌سازی entries در هر شهر بر اساس created_at DESC
    for (const city in grouped) {
      grouped[city].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.json(grouped);
  } catch (error) {
    console.error('❌ [dispatch] getBoard failed:', error);
    res.status(500).json({ message: 'خطا در دریافت تابلو اعلام بار' });
  }
}

async function searchVehicles(req, res) {
  const { searchCompanyVehicles } = require('./vehicleController');
  return searchCompanyVehicles(req, res);
}

async function searchDrivers(req, res) {
  try {
    const term = (req.query.q || '').trim();
    if (term.length < 2) {
      return res.json([]);
    }

    const likeTerm = `%${term}%`;
    const { rows } = await pool.query(
      `SELECT
         id,
         name,
         mobile,
         employee_id,
         national_id
       FROM drivers
       WHERE
         is_deleted = FALSE AND
         (
           (name IS NOT NULL AND name ILIKE $1)
           OR (mobile IS NOT NULL AND mobile ILIKE $1)
           OR (employee_id IS NOT NULL AND employee_id ILIKE $1)
           OR (national_id IS NOT NULL AND national_id ILIKE $1)
         )
       ORDER BY name NULLS LAST, employee_id NULLS LAST
       LIMIT 15`,
      [likeTerm]
    );

    res.json(
      rows.map(row => ({
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        employeeId: row.employee_id,
        nationalCode: row.national_id,
      }))
    );
  } catch (error) {
    if (error?.code === '42P01') {
      console.warn('⚠️ [dispatch] drivers table not found while searching. Returning empty list.');
      return res.json([]);
    }
    console.error('❌ [dispatch] searchDrivers failed:', error);
    res.status(500).json({ message: 'خطا در جستجوی راننده' });
  }
}

async function getAssignmentContext(req, res) {
  const { queueEntryId, assignMode } = req.query || {};
  if (!queueEntryId) {
    return res.status(400).json({ message: 'queueEntryId الزامی است.' });
  }
  try {
    const { getAssignContext } = require('../services/dispatch/dispatchAssignContext');
    const context = await getAssignContext(queueEntryId, req.user?.id || null, assignMode || 'free');
    res.json(context);
  } catch (error) {
    console.error('❌ [dispatch] getAssignmentContext failed:', error);
    res.status(400).json({ message: error.message || 'خطا در دریافت context تخصیص' });
  }
}

async function getQueueAssignmentHints(req, res) {
  const { category, assignMode } = req.query || {};
  if (!category) {
    return res.status(400).json({ message: 'category الزامی است.' });
  }
  try {
    const { getQueueAssignHints } = require('../services/dispatch/dispatchAssignContext');
    const hints = await getQueueAssignHints(category, req.user?.id || null, assignMode || 'free');
    res.json(hints);
  } catch (error) {
    console.error('❌ [dispatch] getQueueAssignmentHints failed:', error);
    res.status(500).json({ message: error.message || 'خطا در دریافت وضعیت نوبت‌ها' });
  }
}

async function deferQueueTurn(req, res) {
  const { id } = req.params || {};
  if (!id) {
    return res.status(400).json({ message: 'شناسه نوبت الزامی است.' });
  }
  try {
    const { deferQueueEntry } = require('../services/dispatch/dispatchAssignContext');
    const context = await deferQueueEntry(id, req.user?.id || null);
    res.json(context);
  } catch (error) {
    console.error('❌ [dispatch] deferQueueTurn failed:', error);
    res.status(400).json({ message: error.message || 'ثبت «بمانم» ناموفق بود' });
  }
}

module.exports = {
  getQueue,
  createQueueEntry,
  deleteQueueEntry,
  updateQueuePosition,
  getStageCandidates,
  assignFreight,
  getDriverPreferences,
  getBoard,
  searchVehicles,
  searchDrivers,
  restoreDriversFromCancelledAssignment,
  resolveDispatchQueueCategoryLabel,
  normalizeQueueType,
  getAssignmentContext,
  getQueueAssignmentHints,
  deferQueueTurn,
};

