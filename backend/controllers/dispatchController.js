const pool = require('../db');
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
      ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(255)
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
  const date = new Date(referenceDate);
  const day = date.getDate();

  const start = new Date(date);
  if (day >= 26) {
    start.setDate(26);
  } else {
    start.setMonth(start.getMonth() - 1);
    start.setDate(26);
  }
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(25);
  end.setHours(23, 59, 59, 999);

  return { start, end };
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

    const grouped = {};
    for (const row of rows) {
      const category = row.vehicle_category || 'نامشخص';
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
      const queueTypeLabel = existingEntry.queue_type === 'far' ? 'دور' : existingEntry.queue_type === 'near' ? 'نزدیک' : existingEntry.queue_type;
      return res.status(409).json({ 
        message: `${conflictType} "${conflictName || 'نامشخص'}" در صف "${queueTypeLabel}" موجود است.`,
        conflictType,
        conflictName: conflictName || 'نامشخص',
        existingQueueType: existingEntry.queue_type,
        existingPosition: existingEntry.position
      });
    }

    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM dispatch_queue_entries WHERE queue_type = $1 AND vehicle_category = $2',
      [queueType, vehicleCategory || null]
    );

    const position = maxRows[0]?.next_pos || 1;

    const insert = await client.query(
      `INSERT INTO dispatch_queue_entries
        (vehicle_id, driver_id, vehicle_category, queue_type, position, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [vehicleId, driverId, vehicleCategory || null, queueType, position, notes || null, req.user?.id || null]
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
      `SELECT id, queue_type, vehicle_category
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

    const { rows: siblingRows } = await client.query(
      `SELECT id
       FROM dispatch_queue_entries
       WHERE queue_type = $1
         AND (vehicle_category IS NOT DISTINCT FROM $2)
       ORDER BY position ASC, created_at ASC`,
      [queue_type, vehicle_category || null]
    );

    const total = siblingRows.length;
    const targetPosition = Math.max(1, Math.min(Math.trunc(numericPosition), total));

    const orderedIds = siblingRows
      .map(row => row.id)
      .filter(rowId => rowId !== id);
    orderedIds.splice(targetPosition - 1, 0, id);

    const actingUserId = req.user?.id || null;
    let newPos = 1;
    for (const rowId of orderedIds) {
      await client.query(
        `UPDATE dispatch_queue_entries
         SET position = $1,
             updated_by_user_id = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [newPos, actingUserId, rowId]
      );
      newPos += 1;
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [dispatch] updateQueuePosition failed:', error);
    res.status(500).json({ message: 'خطا در بروزرسانی ردیف' });
  } finally {
    client.release();
  }
}

async function getDriverLongRouteHistory(driverId, since) {
  // Check for very far routes (خیلی دور) only - these block stage1 eligibility
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
        AND fa.status NOT IN ('Cancelled')
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
    [driverId, since]
  );
  
  return rows;
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

const vehicleMatchesCategory = (vehicleType, categoryValue) => {
  const presetKey = resolveCategoryKey(categoryValue);
  if (!presetKey) return false;
  const normalizedType = normalizeVehicleText(vehicleType);
  if (!normalizedType) return false;

  const detectedKey = detectVehicleCategoryKey(vehicleType);
  if (detectedKey) {
    return detectedKey === presetKey;
  }

  const keywords = categoryVehicleKeywordsNormalized[presetKey] || [];
  return keywords.some(keyword => keyword && normalizedType.includes(keyword));
};

async function getStageCandidates(req, res) {
  const stage = req.query.stage || 'stage1';
  const forceStage2 = req.query.forceStage2 === 'true';
  const categoryFilter = req.query.category || '';
  const queueEntryIdParam = req.query.queueEntryId || null;
  if (!['stage1', 'stage2'].includes(stage)) {
    return res.status(400).json({ message: 'پارامتر stage نامعتبر است.' });
  }

  try {
    await ensureDriverOpportunityTable();
    const { start } = computeCycleRange();

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

    if (stage === 'stage1') {
      const longQueueDrivers = queue.filter(q => q.queue_type === 'far');
      const ids = [...new Set(longQueueDrivers.map(q => q.driver_id).filter(Boolean))];
      if (ids.length > 0) {
        await Promise.all(
          ids.map(async (driverId) => {
            const history = await getDriverLongRouteHistory(driverId, start);
            driverHistoryMap[driverId] = history;
          })
        );
      }
    }

    const freightRows = await pool.query(
      `
        SELECT
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
          fa.products,
          fd.id AS destination_id,
          fd.city,
          fd.representative_name,
          fd.tonnage,
          fd.freight_cost
        FROM freight_announcements fa
        LEFT JOIN freight_destinations fd ON fd.freight_announcement_id = fa.id
        WHERE fa.status IN ('PendingCompanyAssignment', 'PendingPersonalAssignment', 'Assigned')
          AND (fa.assignment_type IS NULL OR fa.assignment_type = 'company')
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
    const normalizeDistanceText = (value) =>
      (value || '')
        .toString()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\s_\-‌]/g, '')
        .toLowerCase();
    const farDistanceTokens = ['خیلی‌دور', 'خیلیدور', 'veryfar'];
    for (const row of freightRows.rows) {
      const destCity = row.city;
      let routeInfo = null;
      if (destCity) {
        const { rows: routeRows } = await pool.query(
          `SELECT id, city, province, route_category, round_trip_km, distance_category
           FROM dispatch_routes
           WHERE is_active = TRUE AND city = $1
           ORDER BY route_category DESC`,
          [destCity]
        );

        if (routeRows.length > 0) {
          routeInfo = routeRows[0];
        }
      }

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
        destination: {
          id: row.destination_id,
          city: row.city,
          representativeName: row.representative_name,
          tonnage: row.tonnage,
          freightCost: row.freight_cost,
        },
        route: routeInfo,
      });
    }

    const isFarRouteAnnouncement = (announcement) => {
      const distanceCategoryNormalized = normalizeDistanceText(
        announcement.route?.distance_category || ''
      );
      if (distanceCategoryNormalized) {
        return farDistanceTokens.some(token => distanceCategoryNormalized.includes(token));
      }
      const routeCategoryNormalized = normalizeDistanceText(
        announcement.route?.route_category || ''
      );
      if (routeCategoryNormalized) {
        return farDistanceTokens.some(token => routeCategoryNormalized.includes(token));
      }
      return false;
    };

    const farAnnouncements = announcements.filter(isFarRouteAnnouncement);
    const filteredAnnouncements = stage === 'stage1' ? farAnnouncements : announcements;

    const farAnnouncementsForCategory = categoryFilter
      ? farAnnouncements.filter(ann => vehicleMatchesCategory(ann.vehicleType, categoryFilter))
      : farAnnouncements;

    const pendingStage1Count = farAnnouncementsForCategory.length;
    const globalPendingStage1Count = farAnnouncements.length;
    const stage2Forced = stage === 'stage2' && forceStage2;
    const stage2Locked = stage === 'stage2' && pendingStage1Count > 0 && !forceStage2;
    const finalAnnouncements = stage2Locked ? [] : filteredAnnouncements;

    // Stage 1: Order by far queue first (by position), then near queue (by position)
    // Stage 2: All drivers except those who got assignments in stage1
    let baseStageQueue = [];
    if (stage === 'stage1') {
      // First get far queue drivers, sorted by position
      const farQueue = queue
        .filter(q => q.queue_type === 'far')
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      
      // Then get near queue drivers, sorted by position
      const nearQueue = queue
        .filter(q => q.queue_type === 'near')
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      
      // Combine: far queue first, then near queue
      baseStageQueue = [...farQueue, ...nearQueue];
    } else {
      // Stage 2: All drivers from both queues, sorted by queue_type (far first) then position
      baseStageQueue = queue
        .filter(q => q.queue_type === 'near' || q.queue_type === 'far')
        .sort((a, b) => {
          if (a.queue_type !== b.queue_type) {
            return a.queue_type === 'far' ? -1 : 1;
          }
          return (a.position || 0) - (b.position || 0);
        });
    }

    // Filter: Stage 1 only allows drivers who haven't taken very far routes in current cycle
    const stageQueue = baseStageQueue.filter(item =>
      stage === 'stage1' ? (driverHistoryMap[item.driver_id] || []).length === 0 : true
    );

    const queueWithHistory = stageQueue.map(item => ({
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
      longRouteHistory: driverHistoryMap[item.driver_id] || [],
      blockedStage1: stage === 'stage1' && (driverHistoryMap[item.driver_id] || []).length > 0,
    }));

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
      cycleStart: start,
      queue: queueWithHistory,
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
      `SELECT id, announcement_code, status, assignment_type
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

    const { rows: destRows } = await client.query(
      `SELECT id, city
       FROM freight_destinations
       WHERE id = $1 AND freight_announcement_id = $2`,
      [destinationId, freightAnnouncementId]
    );

    const destination = destRows[0] || null;
    let route = null;
    if (destination?.city) {
      const { rows: routeRows } = await client.query(
        `SELECT id, city, province, route_category, round_trip_km, distance_category
         FROM dispatch_routes
         WHERE is_active = TRUE AND city = $1
         ORDER BY route_category DESC`,
        [destination.city]
      );
      if (routeRows.length > 0) {
        route = routeRows[0];
      }
    }

    let actingUserId = req.user?.id || null;
    if (!actingUserId && queueEntryId) {
      const { rows: queueUserRows } = await client.query(
        `SELECT created_by_user_id FROM dispatch_queue_entries WHERE id = $1`,
        [queueEntryId]
      );
      actingUserId = queueUserRows[0]?.created_by_user_id || null;
    }

    let actingUserName = req.user?.name || req.user?.username || null;

    if ((!actingUserName || actingUserName.trim() === '') && actingUserId) {
      const { rows: userRows } = await client.query(
        `SELECT name, username, full_name FROM users WHERE id = $1`,
        [actingUserId]
      );
      const userRow = userRows[0] || {};
      actingUserName = userRow.name || userRow.full_name || userRow.username || null;
    }

    if (!actingUserId || !actingUserName) {
      const { rows: fallbackRows } = await client.query(
        `SELECT id, name, username FROM users WHERE username = 'system' LIMIT 1`
      );
      const fallback = fallbackRows[0] || {};
      actingUserId = actingUserId || fallback.id || null;
      actingUserName = actingUserName || fallback.name || fallback.username || 'system';
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

    // دریافت vehicle_category از queue entry یا vehicle
    let finalVehicleCategory = vehicleCategoryFromEntry;
    if (!finalVehicleCategory) {
      const { rows: vehicleRows } = await client.query(
        `SELECT vehicle_category FROM vehicles WHERE id = $1`,
        [vehicleId]
      );
      finalVehicleCategory = vehicleRows[0]?.vehicle_category || null;
    }
    
    await client.query(
      `INSERT INTO dispatch_assignments
        (freight_announcement_id, freight_destination_id, vehicle_id, driver_id, stage, route_id, distance_km, created_by, created_at, queue_position, assigned_at_jalali, queue_entry_id, queue_type, vehicle_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13)`,
      [
        freightAnnouncementId,
        destination ? destination.id : null,
        vehicleId,
        driverId,
        stage,
        route ? route.id : null,
        route ? route.round_trip_km : null,
        actingUserId,
        queuePosition,
        timestampToJalaliDate(now),
        queueEntryId || null,
        queueTypeFromEntry || (stage === 'stage1' ? 'far' : 'near'),
        finalVehicleCategory,
      ]
    );

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
  const vehicleCategoryFilter =
    typeof categoryParam === 'string' && categoryParam.trim() ? categoryParam.trim() : null;

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
          dr.route_category,
          dr.distance_category,
          dr.round_trip_km,
          COALESCE(da.queue_type, dqe.queue_type, CASE WHEN da.stage = 'stage1' THEN 'far' ELSE 'near' END) AS queue_type,
          COALESCE(da.is_cancelled, FALSE) AS is_cancelled
        FROM dispatch_assignments da
        LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
        LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
        LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
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
          AND (fa.status IN ('Assigned', 'InTransit') OR da.is_cancelled = TRUE)
          AND fa.status != 'Cancelled'
        ORDER BY dr.round_trip_km DESC NULLS LAST, da.created_at DESC
      `,
      [driverId, fromISO, toISO]
    );

    const assignmentsWithQueueType = assignmentsRes.rows;

    console.log(`🔍 [getDriverPreferences] Found ${assignmentsWithQueueType.length} assignments for driver ${driverId}`);
    if (assignmentsWithQueueType.length > 0) {
      console.log(`🔍 [getDriverPreferences] Sample assignments:`, assignmentsWithQueueType.slice(0, 3).map(r => ({
        id: r.id,
        stage: r.stage,
        queue_type: r.queue_type,
        announcement_code: r.announcement_code,
        created_at: r.created_at
      })));
    }

    const opportunitiesRes = { rows: [] };
    const snapshotOpportunitiesRes = { rows: [] };

    const taken = assignmentsWithQueueType.map(row => {
      const queueType = row.queue_type || (row.stage === 'stage1' ? 'far' : 'near');
      console.log(`🔍 [getDriverPreferences] Mapping assignment ${row.id}: stage=${row.stage}, queue_type=${row.queue_type}, final queueType=${queueType}`);
      return {
      id: row.id,
      announcementId: row.freight_announcement_id,
      announcementCode: row.announcement_code,
      stage: row.stage,
      queueType: queueType,
      lineType: row.line_type,
      vehicleType: row.vehicle_type,
      originCity: row.origin_city,
      destinationCity: row.destination_city,
      routeCategory: row.route_category,
      distanceCategory: row.distance_category,
      roundTripKm:
        row.round_trip_km != null
          ? Number(row.round_trip_km)
          : row.distance_km != null
            ? Number(row.distance_km)
            : null,
      queuePosition: row.queue_position ?? null,
      assignedAt: row.created_at,
      assignedAtJalali: row.assigned_at_jalali || timestampToJalaliDate(row.created_at),
      isCancelled: row.is_cancelled || false,
      };
    });

    const uniqueAnnouncementIds = new Set();
    for (const row of assignmentsWithQueueType) {
      if (row.freight_announcement_id) uniqueAnnouncementIds.add(row.freight_announcement_id);
    }
    for (const row of opportunitiesRes.rows) {
      if (row.freight_announcement_id) uniqueAnnouncementIds.add(row.freight_announcement_id);
    }
    const announcementIdList = Array.from(uniqueAnnouncementIds);

    let relatedAssignments = [];
    if (announcementIdList.length > 0) {
      const otherAssignmentsRes = await pool.query(
        `
          SELECT
            da.freight_announcement_id,
            da.driver_id,
            da.queue_position,
            da.created_at,
            fa.announcement_code,
            fa.origin_city,
            fd.city AS destination_city,
            d.name AS driver_name
          FROM dispatch_assignments da
          LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
          LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
          LEFT JOIN drivers d ON d.id = da.driver_id
          WHERE da.freight_announcement_id = ANY($1::varchar[])
        `,
        [announcementIdList]
      );
      relatedAssignments = otherAssignmentsRes.rows;
    }

    const snapshotDriverIds = new Set();
    for (const row of opportunitiesRes.rows) {
      const snapshotRaw = row.queue_snapshot;
      if (snapshotRaw) {
        const snapshotList = Array.isArray(snapshotRaw)
          ? snapshotRaw
          : (() => {
              try {
                return JSON.parse(snapshotRaw);
              } catch {
                return [];
              }
            })();
        for (const entry of snapshotList) {
          if (entry?.driverId) {
            snapshotDriverIds.add(String(entry.driverId));
          }
        }
      }
    }

    const lastAssignmentMap = new Map();
    const driverIdList = Array.from(snapshotDriverIds);
    if (driverIdList.length > 0) {
      const lastAssignmentsRes = await pool.query(
        `
          SELECT DISTINCT ON (da.driver_id)
            da.driver_id,
            fa.origin_city,
            fd.city AS destination_city,
            da.created_at
          FROM dispatch_assignments da
          LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
          LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
          WHERE da.driver_id = ANY($1::varchar[])
          ORDER BY da.driver_id, da.created_at DESC
        `,
        [driverIdList]
      );
      for (const row of lastAssignmentsRes.rows) {
        lastAssignmentMap.set(row.driver_id, {
          originCity: row.origin_city,
          destinationCity: row.destination_city,
          createdAt: row.created_at,
        });
      }
    }

    const assignmentsByAnnouncement = new Map();
    for (const row of relatedAssignments) {
      if (!row.freight_announcement_id) continue;
      const list = assignmentsByAnnouncement.get(row.freight_announcement_id) || [];
      list.push(row);
      assignmentsByAnnouncement.set(row.freight_announcement_id, list);
    }

    const buildOpportunity = row => {
      const snapshotList = (() => {
        const raw = row.queue_snapshot;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try {
          return JSON.parse(raw);
        } catch {
          return [];
        }
      })();

      const others = snapshotList
        .map(entry => {
          const entryDriverId = entry?.driverId ? String(entry.driverId) : null;
          if (!entryDriverId || entryDriverId === driverId) {
            return null;
          }
          const annAssignments =
            assignmentsByAnnouncement.get(row.freight_announcement_id) || [];
          const driverAssignment = annAssignments.find(
            item => String(item.driver_id) === entryDriverId
          );
          const lastInfo = lastAssignmentMap.get(entryDriverId) || {};
          return {
            driverId: entryDriverId,
            driverName: entry.driverName || driverAssignment?.driver_name || null,
            queuePosition: entry.queuePosition ?? null,
            chosenAnnouncementCode: driverAssignment?.announcement_code || null,
            lastOriginCity: lastInfo.originCity || null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => ((a?.queuePosition ?? 0) - (b?.queuePosition ?? 0)));

      const entryForDriver = snapshotList.find(
        entry => entry?.driverId && String(entry.driverId) === driverId
      );

      return {
        id: String(row.id),
        announcementId: row.freight_announcement_id,
        announcementCode: row.announcement_code,
        stage: row.stage,
        lineType: row.line_type,
        vehicleType: row.vehicle_type,
        originCity: row.origin_city,
        destinationCity: row.destination_city,
        routeCategory: row.route_category,
        distanceCategory: row.distance_category,
        roundTripKm: row.round_trip_km != null ? Number(row.round_trip_km) : null,
        queuePosition:
          entryForDriver?.queuePosition ?? row.queue_position ?? null,
        seenAt: row.seen_at,
        seenAtJalali: row.seen_at_jalali || timestampToJalaliDate(row.seen_at),
        others,
        sourceDriverId: row.source_driver_id || row.driver_id || null,
        sourceDriverName: row.source_driver_name || null,
      };
    };

    const skippedMap = new Map();
    const addOpportunity = opp => {
      const key = `${opp.announcementId || opp.announcementCode || opp.id}-${opp.stage}`;
      if (!skippedMap.has(key)) {
        skippedMap.set(key, opp);
      }
    };

    const skipped = [];

    const peerAssignments = await (async () => {
      const peerValues = [fromISO, toISO];
      let categoryClause = '';
      if (vehicleCategoryFilter) {
        const categoryIndex = peerValues.push(vehicleCategoryFilter);
        categoryClause = `
          AND (
            v.vehicle_category = $${categoryIndex}
            OR fa.vehicle_type = $${categoryIndex}
          )
        `;
      }
      console.log('🔍 [getDriverPreferences] Fetching peerAssignments:', {
        fromISO,
        toISO,
        vehicleCategoryFilter,
        categoryClause: categoryClause ? 'has filter' : 'no filter'
      });
      const peerRes = await pool.query(
        `
          SELECT
            da.id,
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
            fa.announcement_code,
            fa.line_type,
            fa.status AS freight_status,
            fd.city AS destination_city,
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
          ORDER BY da.created_at DESC
          LIMIT 150
        `,
        peerValues
      );
      console.log('🔍 [getDriverPreferences] peerAssignments query result:', {
        rowCount: peerRes.rowCount,
        sampleRows: peerRes.rows.slice(0, 3).map(r => ({
          id: r.id,
          driverName: r.driver_name,
          queueType: r.queue_type,
          queuePosition: r.queue_position,
          isCancelled: r.is_cancelled,
          freightStatus: r.freight_status,
          createdAt: r.created_at
        }))
      });
      return peerRes.rows.map(row => ({
        id: row.id,
        driverId: row.driver_id,
        driverName: row.driver_name,
        employeeId: row.employee_id,
        stage: row.stage,
        queuePosition: row.queue_position ?? null,
        queueType: row.queue_type || (row.stage === 'stage1' ? 'far' : 'near'),
        lineType: row.line_type,
        destinationCity: row.destination_city,
        roundTripKm: row.round_trip_km != null ? Number(row.round_trip_km) : null,
        assignedAt: row.created_at,
        assignedAtJalali: row.assigned_at_jalali || timestampToJalaliDate(row.created_at),
        previousOriginCity: row.previous_origin_city || null,
        announcementCode: row.announcement_code,
        isCancelled: row.is_cancelled || false,
      }));
    })();

    res.json({
      driver: {
        id: driverResult.rows[0].id,
        name: driverResult.rows[0].name,
        employeeId: driverResult.rows[0].employee_id,
        mobile: driverResult.rows[0].mobile,
      },
      from: fromISO,
      to: toISO,
      fromJalali,
      toJalali,
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
    const { rows } = await pool.query(
      `SELECT
         da.id,
         da.stage,
         da.created_at,
         da.vehicle_id,
         da.driver_id,
         da.route_id,
         fa.announcement_code,
         fa.line_type,
         fa.vehicle_type,
         fa.origin_city,
         fd.city,
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
         COALESCE(da.vehicle_category, v.vehicle_category) AS vehicle_category
       FROM dispatch_assignments da
       LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
       LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
       LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
       LEFT JOIN drivers d ON d.id = da.driver_id
       LEFT JOIN vehicles v ON v.id = da.vehicle_id
       WHERE fa.status IN ('Assigned', 'InTransit')
         AND fa.status NOT IN ('Cancelled')
         AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
       ORDER BY fd.city, da.created_at DESC`
    );

    const grouped = {};
    for (const row of rows) {
      const city = row.city || 'نامشخص';
      if (!grouped[city]) {
        grouped[city] = [];
      }
      grouped[city].push({
        assignmentId: row.id,
        stage: row.stage,
        createdAt: row.created_at,
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
        daysSinceAssignment: Math.floor((new Date() - new Date(row.created_at)) / (1000 * 60 * 60 * 24)),
      });
    }

    res.json(grouped);
  } catch (error) {
    console.error('❌ [dispatch] getBoard failed:', error);
    res.status(500).json({ message: 'خطا در دریافت تابلو اعلام بار' });
  }
}

async function searchVehicles(req, res) {
  try {
    const term = (req.query.q || '').trim();
    if (term.length < 2) {
      return res.json([]);
    }

    const likeTerm = `%${term}%`;
    const { rows } = await pool.query(
      `SELECT
         id,
         vehicle_code,
         model,
         brand,
         vehicle_category,
         plate_part1,
         plate_letter,
         plate_part2,
         plate_city_code
       FROM vehicles
       WHERE
         (vehicle_code IS NOT NULL AND vehicle_code ILIKE $1)
         OR (model IS NOT NULL AND model ILIKE $1)
         OR (brand IS NOT NULL AND brand ILIKE $1)
       ORDER BY vehicle_code NULLS LAST, model NULLS LAST
       LIMIT 15`,
      [likeTerm]
    );

    res.json(
      rows.map(row => ({
        id: row.id,
        vehicleCode: row.vehicle_code,
        model: row.model,
        brand: row.brand,
        vehicleCategory: row.vehicle_category,
        plate: {
          part1: row.plate_part1,
          letter: row.plate_letter,
          part2: row.plate_part2,
          cityCode: row.plate_city_code,
        },
      }))
    );
  } catch (error) {
    console.error('❌ [dispatch] searchVehicles failed:', error);
    res.status(500).json({ message: 'خطا در جستجوی خودرو' });
  }
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
};

