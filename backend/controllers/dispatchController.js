const pool = require('../db');
const { jalaliToGregorian } = require('../utils/jalali');

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
      'SELECT id FROM dispatch_queue_entries WHERE driver_id = $1 OR vehicle_id = $2',
      [driverId, vehicleId]
    );

    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'این راننده یا خودرو در صف دیگری موجود است.' });
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
  const { rows } = await pool.query(
    `
      SELECT
        da.id,
        da.created_at,
        da.stage,
        dr.city,
        dr.route_category,
        dr.round_trip_km,
        fa.announcement_code
      FROM dispatch_assignments da
      LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      WHERE da.driver_id = $1
        AND da.stage = 'stage1'
        AND da.created_at >= $2
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
  if (!['stage1', 'stage2'].includes(stage)) {
    return res.status(400).json({ message: 'پارامتر stage نامعتبر است.' });
  }

  try {
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

    const announcements = [];
    const farKeywords = ['دور', 'خیلی دور', 'مسیر دور', 'مسیر خیلی دور', 'خیلی\u200cدور', 'very far', 'long route', 'long trip'];
    const nearKeywords = ['نزدیک', 'medium', 'متوسط', 'short', 'کوتاه', 'میانه'];
    const normalizeText = (value) =>
      (value || '')
        .toString()
        .replace(/[\s_\-‌]/g, '')
        .toLowerCase();
    const farKeywordTokens = [
      ...farKeywords.map(normalizeText),
      'far',
      'long',
      'longroute',
      'veryfar',
      'verylong',
      'خیلیطولانی',
    ];
    const nearKeywordTokens = [
      ...nearKeywords.map(normalizeText),
      'near',
      'shortroute',
      'shorttrip',
      'close',
    ];
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
      const routeCategory = announcement.route?.route_category || '';
      const distanceCategory = announcement.route?.distance_category || '';
      const combined = `${routeCategory} ${distanceCategory}`;
      const combinedNormalized = normalizeText(combined);
      if (nearKeywordTokens.some(keyword => keyword && combinedNormalized.includes(keyword))) {
        return false;
      }
      const km = announcement.route?.round_trip_km || 0;
      const hasKeyword = farKeywordTokens.some(keyword => keyword && combinedNormalized.includes(keyword));
      if (hasKeyword) {
        return true;
      }
      if (!combinedNormalized) {
        return km >= 800;
      }
      return km >= 700;
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

    const baseStageQueue =
      stage === 'stage1'
        ? queue.filter(q => q.queue_type === 'far')
        : queue.filter(q => q.queue_type === 'near' || q.queue_type === 'far');

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

    const now = new Date();
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
        (freight_announcement_id, user_id, action, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        freightAnnouncementId,
        req.user?.id || null,
        stage === 'stage1' ? 'ASSIGNED_STAGE1' : 'ASSIGNED_STAGE2',
        JSON.stringify({ driverId, vehicleId }),
      ]
    );

    await client.query(
      `INSERT INTO dispatch_assignments
        (freight_announcement_id, freight_destination_id, vehicle_id, driver_id, stage, route_id, distance_km, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        freightAnnouncementId,
        destination ? destination.id : null,
        vehicleId,
        driverId,
        stage,
        route ? route.id : null,
        route ? route.round_trip_km : null,
        req.user?.id || null,
      ]
    );

    if (queueEntryId) {
      await client.query('DELETE FROM dispatch_queue_entries WHERE id = $1', [queueEntryId]);
    }

    await client.query('COMMIT');
    res.json({ success: true, assignedAt: now });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [dispatch] assignFreight failed:', error);
    res.status(500).json({ message: 'خطا در ثبت تخصیص' });
  } finally {
    client.release();
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
         d.name AS driver_name,
         d.mobile AS driver_mobile,
         d.employee_id,
         v.model AS vehicle_model,
         v.vehicle_code
       FROM dispatch_assignments da
       LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
       LEFT JOIN freight_destinations fd ON fd.id = da.freight_destination_id
       LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
       LEFT JOIN drivers d ON d.id = da.driver_id
       LEFT JOIN vehicles v ON v.id = da.vehicle_id
       WHERE fa.status IN ('Assigned', 'InTransit')
       ORDER BY fd.city, da.created_at`
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
        },
        route: {
          id: row.route_id,
          province: row.province,
          routeCategory: row.route_category,
          roundTripKm: row.round_trip_km,
        },
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
  getBoard,
  searchVehicles,
  searchDrivers,
};

