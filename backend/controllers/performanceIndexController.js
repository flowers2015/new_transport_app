const pool = require('../db');
const jalaliUtils = require('../utils/jalali');
const { classifyRouteDistanceBucket } = require('../services/dispatch/dispatchRouteRules');

/** مبادی گزارش عملکرد — تطبیق نرم با origin_city دیتابیس */
const PERFORMANCE_ORIGIN_GROUPS = [
  {
    key: 'aminzadeh',
    label: 'امین‌زاده',
    test: (n) => n.includes('امین') && n.includes('زاد'),
  },
  {
    key: 'mihan_factory',
    label: 'کارخانه میهن',
    test: (n) =>
      (n.includes('میهن') && n.includes('کارخانه')) ||
      n.includes('کارخانهمیهن'),
  },
  {
    key: 'panda_factory',
    label: 'کارخانه پاندا',
    test: (n) => n.includes('پاندا'),
  },
  {
    key: 'shahrnosh',
    label: 'شهرنوشیدنی',
    test: (n) => n.includes('شهرنوش') || n.includes('شهنوش') || n.includes('شهرنوشیدنی'),
  },
  {
    key: 'tehranpars',
    label: 'تهرانپارس',
    test: (n) => n.includes('تهرانپارس') || (n.includes('تهران') && n.includes('پارس')),
  },
  {
    key: 'varamin',
    label: 'ورامین',
    test: (n) => n.includes('ورامین'),
  },
  {
    key: 'central_warehouse',
    label: 'انبار مرکزی',
    test: (n) => n.includes('انبار') && n.includes('مرکز'),
  },
  {
    key: 'golfam',
    label: 'گلفام',
    test: (n) => n.includes('گلفام'),
  },
  {
    key: 'dairy_city',
    label: 'شهر لبنیات',
    test: (n) =>
      n.includes('شهرلبنیات') ||
      (n.includes('شهر') && n.includes('لبنیات')) ||
      n.includes('کارخانهشهرلبنیات'),
  },
];

function normalizeOriginText(value) {
  return (value || '')
    .toString()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-‌]/g, '')
    .toLowerCase();
}

function matchOriginGroup(originCity) {
  const n = normalizeOriginText(originCity);
  if (!n) return null;
  for (const group of PERFORMANCE_ORIGIN_GROUPS) {
    if (group.test(n)) return group;
  }
  return null;
}

/** فقط بارهایی که مبدا آن‌ها یکی از مبادی ستاد است */
function isHqOrigin(originCity) {
  return Boolean(matchOriginGroup(originCity));
}

/** مسیر مقصد از جدول شهرها (dispatch_routes) — دورترین مقصد */
const DEST_ROUTE_SQL = `
  SELECT
    dr.round_trip_km,
    dr.distance_category,
    dr.route_category,
    fd.city
  FROM freight_destinations fd
  INNER JOIN dispatch_routes dr
    ON dr.is_active = TRUE
   AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(dr.city, ''), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
     = REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(fd.city, ''), 'ي', 'ی'), 'ك', 'ک'), '‌', ''), ' ', '')
  WHERE fd.freight_announcement_id = fa.id
  ORDER BY COALESCE(dr.round_trip_km, 0) DESC NULLS LAST
  LIMIT 1
`;

function resolveTripDistance(row) {
  const routeKm = Number(row.route_km || 0);
  const financeKm =
    Number(row.approved_kilometers || 0) + Number(row.excess_kilometers || 0);
  const km =
    financeKm > 0 ? financeKm : routeKm > 0 ? routeKm : null;

  // اول از دسته‌بندی ثبت‌شده در مسیر/شهر؛ بدون fallback اشتباه به نزدیک وقتی km=0
  let bucket = classifyRouteDistanceBucket({
    distance_category: row.distance_category,
    route_category: row.route_category,
    round_trip_km: km,
  });

  if (!bucket && km != null && km > 0) {
    bucket = km >= 500 ? 'far' : 'near';
  }

  return { km: km || 0, bucket: bucket || null };
}

/** مثل مالی ترابری: تریلی/مینی‌تریلی → کشنده ، ده چرخ → ده چرخ */
function normalizeFinanceVehicleCategory(raw) {
  const t = (raw || '').toString().trim();
  if (!t) return null;
  if (t.includes('ده چرخ') || t.includes('ده‌چرخ') || t === 'ده چرخ') return 'ده چرخ';
  if (
    t.includes('تریلی') ||
    t.includes('تریلر') ||
    t.includes('کشنده') ||
    t.includes('مینی')
  ) {
    return 'کشنده';
  }
  if (t === 'کشنده') return 'کشنده';
  return null;
}

function parseRangeQuery(query) {
  const { startYear, startMonth, startDay, endYear, endMonth, endDay } = query || {};
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) {
    return { error: 'تمام پارامترهای تاریخ الزامی است.' };
  }
  const [startGy, startGm, startGd] = jalaliUtils.jalaliToGregorian(
    parseInt(startYear, 10),
    parseInt(startMonth, 10),
    parseInt(startDay, 10)
  );
  const [endGy, endGm, endGd] = jalaliUtils.jalaliToGregorian(
    parseInt(endYear, 10),
    parseInt(endMonth, 10),
    parseInt(endDay, 10)
  );
  const startDate = new Date(startGy, startGm - 1, startGd, 0, 0, 0, 0);
  const endDate = new Date(endGy, endGm - 1, endGd, 23, 59, 59, 999);
  const startJalali = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')}`;
  const endJalali = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')}`;
  return { startDate, endDate, startJalali, endJalali };
}

function emptyOriginCounts() {
  const counts = {};
  for (const g of PERFORMANCE_ORIGIN_GROUPS) counts[g.key] = 0;
  counts.other = 0;
  return counts;
}

/**
 * GET /api/v1/freight-announcements/performance-index
 * شاخص عملکرد رانندگان سنگین شرکتی
 */
async function getPerformanceIndex(req, res) {
  try {
    const {
      startYear,
      startMonth,
      startDay,
      endYear,
      endMonth,
      endDay,
      assignmentType = 'company' // فقط شرکتی
    } = req.query;

    if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) {
      return res.status(400).json({ message: 'تمام پارامترهای تاریخ الزامی است.' });
    }

    // تبدیل تاریخ شمسی به میلادی
    const [startGy, startGm, startGd] = jalaliUtils.jalaliToGregorian(
      parseInt(startYear),
      parseInt(startMonth),
      parseInt(startDay)
    );
    const [endGy, endGm, endGd] = jalaliUtils.jalaliToGregorian(
      parseInt(endYear),
      parseInt(endMonth),
      parseInt(endDay)
    );

    const startDate = new Date(startGy, startGm - 1, startGd);
    const endDate = new Date(endGy, endGm - 1, endGd);
    endDate.setHours(23, 59, 59, 999);

    console.log('📊 [PerformanceIndex] Fetching data:', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      assignmentType
    });

    // Query برای دریافت داده‌های driver_calculations
    // فقط رانندگان شرکتی (assignment_type = 'company')
    // و فقط خودروهای سنگین (کشنده و ده چرخ)
    // توجه: loading_date در دیتابیس به صورت Jalali string است (مثلاً "1404/09/26")
    // پس باید از CAST به TEXT و مقایسه string استفاده کنیم
    const startDateStr = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')}`;
    const startDateStrDash = startDateStr.replace(/\//g, '-');
    const endDateStrDash = endDateStr.replace(/\//g, '-');
    
    const query = `
      SELECT 
        dc.id,
        dc.driver_id,
        dc.announcement_id,
        dc.approved_kilometers,
        dc.excess_kilometers,
        dc.depot_total_mileage,
        dc.return_cargo_cost,
        dc.return_inter_branch_cargo_cost,
        dc.queue_type,
        dc.fixed_allowance,
        fa.loading_date,
        fa.vehicle_type,
        v.current_vehicle_type,
        vs.vehicle_type as spec_vehicle_type,
        COALESCE(v.vehicle_code, dc.vehicle_code) as vehicle_code
      FROM driver_calculations dc
      INNER JOIN freight_announcements fa ON fa.id = dc.announcement_id
      LEFT JOIN vehicles v ON (
        dc.vehicle_code IS NOT NULL AND v.vehicle_code = dc.vehicle_code
      )
      LEFT JOIN vehicle_specifications vs ON (
        v.id IS NOT NULL
        AND vs.brand = v.brand 
        AND vs.model = v.model 
        AND (vs.tip = v.vehicle_tip OR vs.tip IS NULL OR v.vehicle_tip IS NULL)
      )
      WHERE fa.assignment_type = $1
        AND fa.status = 'Finalized'
        AND (
          (CAST(fa.loading_date AS TEXT) >= $2 AND CAST(fa.loading_date AS TEXT) <= $3) OR
          (CAST(fa.loading_date AS TEXT) >= $4 AND CAST(fa.loading_date AS TEXT) <= $5)
        )
        AND dc.approved_kilometers IS NOT NULL
        AND dc.approved_kilometers > 0
    `;

    const result = await pool.query(query, [
      assignmentType,
      startDateStr,
      endDateStr,
      startDateStrDash,
      endDateStrDash
    ]);

    console.log(`✅ [PerformanceIndex] Found ${result.rows.length} calculations`);

    // گروه‌بندی بر اساس ماه و نوع خودرو
    const monthlyData = new Map();

    for (const row of result.rows) {
      // تشخیص نوع خودرو
      let vehicleType = 'نامشخص';
      if (row.current_vehicle_type) {
        if (row.current_vehicle_type === 'کشنده' || row.current_vehicle_type === 'تریلی' || row.current_vehicle_type === 'مینی تریلی') {
          vehicleType = 'کشنده';
        } else if (row.current_vehicle_type === 'ده چرخ') {
          vehicleType = 'ده چرخ';
        } else {
          vehicleType = row.current_vehicle_type;
        }
      } else if (row.spec_vehicle_type) {
        if (row.spec_vehicle_type === 'کشنده' || row.spec_vehicle_type === 'تریلی' || row.spec_vehicle_type === 'مینی تریلی') {
          vehicleType = 'کشنده';
        } else if (row.spec_vehicle_type === 'ده چرخ') {
          vehicleType = 'ده چرخ';
        } else {
          vehicleType = row.spec_vehicle_type;
        }
      } else if (row.vehicle_type) {
        if (row.vehicle_type === 'کشنده' || row.vehicle_type === 'تریلی' || row.vehicle_type === 'مینی تریلی') {
          vehicleType = 'کشنده';
        } else if (row.vehicle_type === 'ده چرخ') {
          vehicleType = 'ده چرخ';
        } else {
          vehicleType = row.vehicle_type;
        }
      }

      // فقط کشنده و ده چرخ را در نظر می‌گیریم
      if (vehicleType !== 'کشنده' && vehicleType !== 'ده چرخ') {
        continue;
      }

      // استخراج ماه از loading_date
      // loading_date به صورت Jalali string است (مثلاً "1404/09/05")
      let monthKey;
      if (typeof row.loading_date === 'string' && row.loading_date.includes('/')) {
        // اگر loading_date به صورت Jalali string است، مستقیماً از آن استفاده می‌کنیم
        const parts = row.loading_date.split('/');
        const year = parts[0];
        const month = parts[1];
        monthKey = `${year}/${String(month).padStart(2, '0')}`;
      } else {
        // اگر loading_date به صورت Date object است، آن را به Jalali تبدیل می‌کنیم
        const loadingDate = new Date(row.loading_date);
        const jalaliDate = jalaliUtils.timestampToJalaliDate(loadingDate);
        const [year, month] = jalaliDate.split('/');
        monthKey = `${year}/${String(month).padStart(2, '0')}`;
      }

      const key = `${monthKey}_${vehicleType}`;
      
      if (!monthlyData.has(key)) {
        monthlyData.set(key, {
          month: monthKey,
          vehicleType,
          totalMileage: 0,
          tourCount: 0,
          returnCargoCount: 0,
          fixedAllowanceTourCount: 0,
          commissionTourCount: 0,
          commissionMileage: 0,
          fixedAllowanceMileage: 0
        });
      }

      const data = monthlyData.get(key);
      
      // محاسبه پیمایش کل (approved + excess + depot)
      const totalMileage = (row.approved_kilometers || 0) + (row.excess_kilometers || 0) + (row.depot_total_mileage || 0);
      
      data.totalMileage += totalMileage;
      data.tourCount += 1;
      
      // شمارش بار برگشتی (اگر return_cargo_cost یا return_inter_branch_cargo_cost > 0)
      if ((row.return_cargo_cost && row.return_cargo_cost > 0) || 
          (row.return_inter_branch_cargo_cost && row.return_inter_branch_cargo_cost > 0)) {
        data.returnCargoCount += 1;
      }
      
      // تفکیک اجرت ثابت و پورسانتی
      if (row.queue_type === 'fixed_allowance') {
        data.fixedAllowanceTourCount += 1;
        data.fixedAllowanceMileage += totalMileage;
      } else if (row.queue_type === 'porsant') {
        data.commissionTourCount += 1;
        data.commissionMileage += totalMileage;
      }
    }

    // تبدیل به آرایه و محاسبه نسبت‌ها
    const responseData = Array.from(monthlyData.values()).map(item => {
      const mileagePerTour = item.tourCount > 0 ? item.totalMileage / item.tourCount : 0;
      const returnCargoPerTour = item.tourCount > 0 ? item.returnCargoCount / item.tourCount : 0;
      const fixedAllowanceMileagePerTour = item.fixedAllowanceTourCount > 0 
        ? item.fixedAllowanceMileage / item.fixedAllowanceTourCount 
        : 0;
      const commissionMileagePerTour = item.commissionTourCount > 0 
        ? item.commissionMileage / item.commissionTourCount 
        : 0;
      const totalTourMileage = item.commissionMileage + item.fixedAllowanceMileage;
      const totalTours = item.commissionTourCount + item.fixedAllowanceTourCount;
      const totalMileagePerTotalTours = totalTours > 0 ? item.totalMileage / totalTours : 0;

      return {
        month: item.month,
        vehicleType: item.vehicleType,
        totalMileage: item.totalMileage,
        tourCount: item.tourCount,
        mileagePerTour,
        returnCargoCount: item.returnCargoCount,
        returnCargoPerTour,
        fixedAllowanceTourCount: item.fixedAllowanceTourCount,
        commissionTourCount: item.commissionTourCount,
        commissionMileage: item.commissionMileage,
        fixedAllowanceMileage: item.fixedAllowanceMileage,
        fixedAllowanceMileagePerTour,
        commissionMileagePerTour,
        totalTourMileage,
        totalTours,
        totalMileagePerTotalTours
      };
    });

    // مرتب‌سازی بر اساس ماه
    responseData.sort((a, b) => {
      const [aYear, aMonth] = a.month.split('/').map(Number);
      const [bYear, bMonth] = b.month.split('/').map(Number);
      if (aYear !== bYear) return aYear - bYear;
      return aMonth - bMonth;
    });

    console.log(`✅ [PerformanceIndex] Returning ${responseData.length} records`);

    res.json({ data: responseData });
  } catch (error) {
    console.error('❌ [PerformanceIndex] Error:', error);
    res.status(500).json({ 
      message: 'خطا در دریافت شاخص عملکرد',
      error: error.message 
    });
  }
}

/**
 * GET /api/v1/freight-announcements/personal-performance-index
 * شاخص عملکرد ترابری شخصی
 */
async function getPersonalPerformanceIndex(req, res) {
  try {
    const {
      startYear,
      startMonth,
      startDay,
      endYear,
      endMonth,
      endDay
    } = req.query;

    if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) {
      return res.status(400).json({ message: 'تمام پارامترهای تاریخ الزامی است.' });
    }

    // تبدیل تاریخ شمسی به میلادی
    const [startGy, startGm, startGd] = jalaliUtils.jalaliToGregorian(
      parseInt(startYear),
      parseInt(startMonth),
      parseInt(startDay)
    );
    const [endGy, endGm, endGd] = jalaliUtils.jalaliToGregorian(
      parseInt(endYear),
      parseInt(endMonth),
      parseInt(endDay)
    );

    const startDate = new Date(startGy, startGm - 1, startGd);
    const endDate = new Date(endGy, endGm - 1, endGd);
    endDate.setHours(23, 59, 59, 999);

    console.log('📊 [PersonalPerformanceIndex] Fetching data:', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // Query برای دریافت داده‌های freight_announcements برای ترابری شخصی
    const startDateStr = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')}`;
    const startDateStrDash = startDateStr.replace(/\//g, '-');
    const endDateStrDash = endDateStr.replace(/\//g, '-');
    
    const query = `
      SELECT 
        fa.id,
        fa.loading_date,
        fa.line_type,
        fa.vehicle_type,
        fa.total_freight_cost,
        fa.carton_count,
        fa.assignment_finalized_at,
        fa.created_at,
        COALESCE(SUM(fd.tonnage), 0) as total_tonnage,
        COUNT(DISTINCT fd.id) as destination_count
      FROM freight_announcements fa
      LEFT JOIN freight_destinations fd ON fd.freight_announcement_id = fa.id
      WHERE fa.assignment_type = 'personal'
        AND fa.status = 'Finalized'
        AND fa.assigned_driver_id IS NOT NULL
        AND (
          (CAST(fa.loading_date AS TEXT) >= $1 AND CAST(fa.loading_date AS TEXT) <= $2) OR
          (CAST(fa.loading_date AS TEXT) >= $3 AND CAST(fa.loading_date AS TEXT) <= $4)
        )
      GROUP BY fa.id, fa.loading_date, fa.line_type, fa.vehicle_type, fa.total_freight_cost, fa.carton_count, fa.assignment_finalized_at, fa.created_at
      ORDER BY fa.loading_date, fa.line_type, fa.vehicle_type
    `;

    const result = await pool.query(query, [
      startDateStr,
      endDateStr,
      startDateStrDash,
      endDateStrDash
    ]);

    console.log(`✅ [PersonalPerformanceIndex] Found ${result.rows.length} announcements`);

    // گروه‌بندی بر اساس ماه، لاین و نوع خودرو
    const monthlyData = new Map();

    for (const row of result.rows) {
      // استخراج ماه از loading_date
      let monthKey;
      if (typeof row.loading_date === 'string' && row.loading_date.includes('/')) {
        const parts = row.loading_date.split('/');
        const year = parts[0];
        const month = parts[1];
        monthKey = `${year}/${String(month).padStart(2, '0')}`;
      } else {
        const loadingDate = new Date(row.loading_date);
        const jalaliDate = jalaliUtils.timestampToJalaliDate(loadingDate);
        const [year, month] = jalaliDate.split('/');
        monthKey = `${year}/${String(month).padStart(2, '0')}`;
      }

      const lineType = row.line_type || 'نامشخص';
      const vehicleType = row.vehicle_type || 'نامشخص';
      const key = `${monthKey}_${lineType}_${vehicleType}`;
      
      if (!monthlyData.has(key)) {
        monthlyData.set(key, {
          month: monthKey,
          lineType,
          vehicleType,
          assignmentCount: 0,
          totalFreightCost: 0,
          totalCarton: 0,
          totalTonnage: 0,
          assignmentDays: [] // برای محاسبه میانگین موفقیت تخصیص
        });
      }

      const data = monthlyData.get(key);
      
      data.assignmentCount += 1;
      data.totalFreightCost += parseFloat(row.total_freight_cost || 0);
      
      // برای بستنی: carton_count
      if (lineType === 'بستنی' || lineType === 'IceCream') {
        data.totalCarton += parseInt(row.carton_count || 0);
      }
      
      // برای پاستوریزه و لبنیات-فروتلند: tonnage
      if (lineType === 'پاستوریزه' || lineType === 'Dairy' || lineType === 'لبنیات-فروتلند' || lineType === 'Ambient') {
        data.totalTonnage += parseFloat(row.total_tonnage || 0);
      }
      
      // محاسبه روز تخصیص برای میانگین موفقیت
      if (row.assignment_finalized_at) {
        const assignmentDate = new Date(row.assignment_finalized_at);
        const loadingDate = typeof row.loading_date === 'string' && row.loading_date.includes('/')
          ? jalaliUtils.parseJalaliDateString(row.loading_date)
          : new Date(row.loading_date);
        
        if (loadingDate && !isNaN(loadingDate.getTime())) {
          const daysDiff = Math.floor((assignmentDate.getTime() - loadingDate.getTime()) / (1000 * 60 * 60 * 24));
          data.assignmentDays.push(daysDiff);
        }
      }
    }

    // تبدیل به آرایه و محاسبه نسبت‌ها
    const responseData = Array.from(monthlyData.values()).map(item => {
      // میانگین موفقیت تخصیص (میانگین روزهای تخصیص)
      const avgAssignmentDays = item.assignmentDays.length > 0
        ? item.assignmentDays.reduce((a, b) => a + b, 0) / item.assignmentDays.length
        : 0;
      
      // محاسبه نسبت‌ها
      const freightPerVehicle = item.assignmentCount > 0 ? item.totalFreightCost / item.assignmentCount : 0;
      
      let freightPerUnit = 0;
      let totalUnit = 0;
      
      if (item.lineType === 'بستنی' || item.lineType === 'IceCream') {
        totalUnit = item.totalCarton;
        freightPerUnit = item.totalCarton > 0 ? item.totalFreightCost / item.totalCarton : 0;
      } else {
        totalUnit = item.totalTonnage;
        freightPerUnit = item.totalTonnage > 0 ? item.totalFreightCost / item.totalTonnage : 0;
      }

      return {
        month: item.month,
        lineType: item.lineType,
        vehicleType: item.vehicleType,
        assignmentCount: item.assignmentCount,
        avgAssignmentSuccess: avgAssignmentDays,
        totalFreightCost: item.totalFreightCost,
        totalCarton: item.totalCarton,
        totalTonnage: item.totalTonnage,
        freightPerUnit,
        freightPerVehicle,
        totalUnit
      };
    });

    // مرتب‌سازی بر اساس ماه، لاین و نوع خودرو
    responseData.sort((a, b) => {
      const [aYear, aMonth] = a.month.split('/').map(Number);
      const [bYear, bMonth] = b.month.split('/').map(Number);
      if (aYear !== bYear) return aYear - bYear;
      if (aMonth !== bMonth) return aMonth - bMonth;
      if (a.lineType !== b.lineType) return a.lineType.localeCompare(b.lineType);
      return a.vehicleType.localeCompare(b.vehicleType);
    });

    console.log(`✅ [PersonalPerformanceIndex] Returning ${responseData.length} records`);

    res.json({ data: responseData });
  } catch (error) {
    console.error('❌ [PersonalPerformanceIndex] Error:', error);
    res.status(500).json({ 
      message: 'خطا در دریافت شاخص عملکرد ترابری شخصی',
      error: error.message 
    });
  }
}

/**
 * GET /api/v1/freight-announcements/company-driver-performance
 * عملکرد رانندگان شرکتی — به تفکیک راننده، دوره ۲۶–۲۵، دو مبنا
 * basis=assignment → تاریخ اتمام/ثبت تخصیص
 * basis=finance → ثبت تور مالی ترابری
 */
async function getCompanyDriverPerformance(req, res) {
  try {
    const basis = String(req.query.basis || 'assignment').toLowerCase() === 'finance'
      ? 'finance'
      : 'assignment';
    const driverIdFilter = req.query.driverId ? String(req.query.driverId) : null;
    const includeTrips = String(req.query.includeTrips || '') === '1' || Boolean(driverIdFilter);
    const vehicleCategoryFilterRaw = String(req.query.vehicleCategory || '').trim();
    const vehicleCategoryFilter =
      vehicleCategoryFilterRaw === 'کشنده' || vehicleCategoryFilterRaw === 'ده چرخ'
        ? vehicleCategoryFilterRaw
        : null;

    const range = parseRangeQuery(req.query);
    if (range.error) {
      return res.status(400).json({ message: range.error });
    }
    const { startDate, endDate, startJalali, endJalali } = range;

    let rows;
    if (basis === 'finance') {
      const result = await pool.query(
        `
        SELECT
          dc.id AS calc_id,
          dc.announcement_id,
          dc.driver_id,
          d.name AS driver_name,
          d.employee_id,
          fa.announcement_code,
          fa.origin_city,
          fa.loading_date,
          fa.vehicle_type,
          fa.assignment_finalized_at,
          COALESCE(NULLIF(TRIM(dc.bill_of_lading_date), ''), NULL) AS bill_of_lading_date,
          dc.created_at AS calc_created_at,
          COALESCE(dc.approved_kilometers, 0)::float AS approved_kilometers,
          COALESCE(dc.excess_kilometers, 0)::float AS excess_kilometers,
          (
            SELECT STRING_AGG(fd.city, '، ' ORDER BY fd.created_at ASC)
            FROM freight_destinations fd
            WHERE fd.freight_announcement_id = fa.id
          ) AS destinations,
          (
            SELECT r.round_trip_km FROM (${DEST_ROUTE_SQL}) r
          ) AS route_km,
          (
            SELECT r.distance_category FROM (${DEST_ROUTE_SQL}) r
          ) AS distance_category,
          (
            SELECT r.route_category FROM (${DEST_ROUTE_SQL}) r
          ) AS route_category,
          COALESCE(
            (
              SELECT da2.assigned_at_jalali
              FROM dispatch_assignments da2
              WHERE da2.freight_announcement_id = fa.id
                AND da2.driver_id = dc.driver_id
              ORDER BY da2.created_at ASC
              LIMIT 1
            ),
            NULL
          ) AS assigned_at_jalali
        FROM driver_calculations dc
        INNER JOIN freight_announcements fa ON fa.id = dc.announcement_id
        INNER JOIN drivers d ON d.id = dc.driver_id
        WHERE fa.assignment_type = 'company'
          AND fa.status = 'Finalized'
          AND COALESCE(fa.finance_disposition, '') <> 'rejected'
          AND dc.driver_id IS NOT NULL
          AND (
            (
              NULLIF(TRIM(dc.bill_of_lading_date), '') IS NOT NULL
              AND REPLACE(dc.bill_of_lading_date, '-', '/') >= $1
              AND REPLACE(dc.bill_of_lading_date, '-', '/') <= $2
            )
            OR (
              (dc.bill_of_lading_date IS NULL OR TRIM(dc.bill_of_lading_date) = '')
              AND dc.created_at >= $3
              AND dc.created_at <= $4
            )
          )
          AND ($5::text IS NULL OR dc.driver_id::text = $5::text)
        ORDER BY d.employee_id NULLS LAST, d.name, dc.created_at ASC
        `,
        [startJalali, endJalali, startDate.toISOString(), endDate.toISOString(), driverIdFilter]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `
        SELECT DISTINCT ON (fa.id, fa.assigned_driver_id)
          fa.id AS announcement_id,
          fa.assigned_driver_id AS driver_id,
          COALESCE(d.name, fa.assigned_driver_name) AS driver_name,
          COALESCE(d.employee_id, fa.assigned_driver_employee_id) AS employee_id,
          fa.announcement_code,
          fa.origin_city,
          fa.loading_date,
          fa.vehicle_type,
          fa.assignment_finalized_at,
          da.created_at AS assignment_created_at,
          da.assigned_at_jalali,
          COALESCE(
            (SELECT r.round_trip_km FROM (${DEST_ROUTE_SQL}) r),
            da.distance_km,
            0
          )::float AS route_km,
          COALESCE(
            (SELECT r.distance_category FROM (${DEST_ROUTE_SQL}) r),
            dr.distance_category
          ) AS distance_category,
          COALESCE(
            (SELECT r.route_category FROM (${DEST_ROUTE_SQL}) r),
            dr.route_category
          ) AS route_category,
          (
            SELECT STRING_AGG(fd.city, '، ' ORDER BY fd.created_at ASC)
            FROM freight_destinations fd
            WHERE fd.freight_announcement_id = fa.id
          ) AS destinations
        FROM freight_announcements fa
        LEFT JOIN drivers d ON d.id = fa.assigned_driver_id
        LEFT JOIN LATERAL (
          SELECT da2.*
          FROM dispatch_assignments da2
          WHERE da2.freight_announcement_id = fa.id
            AND (da2.is_cancelled IS NULL OR da2.is_cancelled = FALSE)
            AND (
              fa.assigned_driver_id IS NULL
              OR da2.driver_id = fa.assigned_driver_id
            )
          ORDER BY da2.created_at ASC
          LIMIT 1
        ) da ON TRUE
        LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
        WHERE fa.assignment_type = 'company'
          AND fa.status = 'Finalized'
          AND COALESCE(fa.finance_disposition, '') <> 'rejected'
          AND fa.assigned_driver_id IS NOT NULL
          AND (
            COALESCE(fa.assignment_finalized_at, da.assignment_finalized_at, da.created_at)
              BETWEEN $1 AND $2
          )
          AND ($3::text IS NULL OR fa.assigned_driver_id::text = $3::text)
        ORDER BY fa.id, fa.assigned_driver_id, da.created_at ASC NULLS LAST
        `,
        [startDate.toISOString(), endDate.toISOString(), driverIdFilter]
      );
      rows = result.rows;
    }

    const byDriver = new Map();

    for (const row of rows) {
      const driverId = row.driver_id;
      if (!driverId) continue;

      // فقط مبادی ستاد (امین‌زاده، کارخانه میهن، …) — مبداهایی مثل یزد→امین‌زاده حساب نمی‌شوند
      const originGroup = matchOriginGroup(row.origin_city);
      if (!originGroup) continue;

      const vehicleCategory = normalizeFinanceVehicleCategory(row.vehicle_type);
      if (vehicleCategoryFilter && vehicleCategory !== vehicleCategoryFilter) continue;

      if (!byDriver.has(driverId)) {
        byDriver.set(driverId, {
          driverId,
          driverName: row.driver_name || 'نامشخص',
          employeeId: row.employee_id || null,
          vehicleCategory: vehicleCategory || null,
          tourCount: 0,
          periodKm: 0,
          veryFarCount: 0,
          farCount: 0,
          nearCount: 0,
          originCounts: emptyOriginCounts(),
          trips: [],
        });
      }
      const agg = byDriver.get(driverId);
      if (!agg.vehicleCategory && vehicleCategory) agg.vehicleCategory = vehicleCategory;

      const { km, bucket } = resolveTripDistance(row);

      agg.originCounts[originGroup.key] += 1;
      agg.tourCount += 1;
      agg.periodKm += km;
      if (bucket === 'veryFar') agg.veryFarCount += 1;
      else if (bucket === 'far') agg.farCount += 1;
      else if (bucket === 'near') agg.nearCount += 1;

      if (includeTrips) {
        const assignedJalali =
          row.assigned_at_jalali ||
          (row.assignment_finalized_at
            ? jalaliUtils.timestampToJalaliDate(row.assignment_finalized_at)
            : null) ||
          (row.assignment_created_at
            ? jalaliUtils.timestampToJalaliDate(row.assignment_created_at)
            : null) ||
          row.bill_of_lading_date ||
          null;

        agg.trips.push({
          announcementId: row.announcement_id,
          announcementCode: row.announcement_code,
          loadingDate: row.loading_date || null,
          originCity: row.origin_city || null,
          originLabel: originGroup.label,
          destinations: row.destinations || null,
          assignedAtJalali: assignedJalali,
          km: km > 0 ? km : null,
          distanceBucket: bucket,
          distanceCategory: row.distance_category || null,
          vehicleCategory: vehicleCategory || null,
          vehicleType: row.vehicle_type || null,
          basisDate:
            basis === 'finance'
              ? row.bill_of_lading_date ||
                (row.calc_created_at
                  ? jalaliUtils.formatJalali(new Date(row.calc_created_at))
                  : null)
              : assignedJalali,
        });
      }
    }

    const drivers = [...byDriver.values()]
      .map((d) => ({
        ...d,
        periodKm: Math.round(d.periodKm),
        trips: includeTrips
          ? d.trips.sort((a, b) =>
              String(a.assignedAtJalali || '').localeCompare(String(b.assignedAtJalali || ''), 'fa')
            )
          : undefined,
      }))
      .sort((a, b) => {
        const ea = String(a.employeeId || '');
        const eb = String(b.employeeId || '');
        if (ea !== eb) return ea.localeCompare(eb, 'fa', { numeric: true });
        return String(a.driverName || '').localeCompare(String(b.driverName || ''), 'fa');
      });

    res.json({
      basis,
      fromJalali: startJalali,
      toJalali: endJalali,
      originGroups: PERFORMANCE_ORIGIN_GROUPS.map((g) => ({ key: g.key, label: g.label })),
      drivers,
    });
  } catch (error) {
    console.error('❌ [CompanyDriverPerformance] Error:', error);
    res.status(500).json({
      message: 'خطا در دریافت عملکرد رانندگان شرکتی',
      error: error.message,
    });
  }
}

const DISPATCH_LINE_DEFS = [
  { key: 'IceCream', label: 'بستنی' },
  { key: 'Dairy', label: 'پاستوریزه' },
  { key: 'Ambient', label: 'لبنیات-فروتلند' },
];

function normalizeDispatchLineKey(raw) {
  const t = (raw || '').toString().trim();
  if (!t) return null;
  if (t === 'IceCream' || t.includes('بستنی')) return 'IceCream';
  if (t === 'Dairy' || t.includes('پاستوریزه')) return 'Dairy';
  if (t === 'Ambient' || t.includes('فروتلند') || t.includes('لبنیات')) return 'Ambient';
  return null;
}

/**
 * GET /api/v1/freight-announcements/dispatch-line-stats
 * آمار اعزام به تفکیک لاین: شخصی / شرکتی / درصد / کرایه شخصی
 */
async function getDispatchLineStats(req, res) {
  try {
    const range = parseRangeQuery(req.query);
    if (range.error) {
      return res.status(400).json({ message: range.error });
    }
    const { startDate, endDate, startJalali, endJalali } = range;

    const result = await pool.query(
      `
      SELECT
        fa.line_type,
        fa.assignment_type,
        COUNT(*)::int AS assignment_count,
        COALESCE(SUM(
          CASE
            WHEN LOWER(COALESCE(fa.assignment_type, '')) IN ('personal', 'شخصی')
            THEN COALESCE(fa.total_freight_cost, 0)
            ELSE 0
          END
        ), 0)::float AS personal_freight_sum
      FROM freight_announcements fa
      WHERE fa.status = 'Finalized'
        AND COALESCE(fa.finance_disposition, '') <> 'rejected'
        AND fa.assignment_type IS NOT NULL
        AND (
          (
            fa.assignment_finalized_at IS NOT NULL
            AND fa.assignment_finalized_at >= $1
            AND fa.assignment_finalized_at <= $2
          )
          OR (
            fa.assignment_finalized_at IS NULL
            AND (
              (CAST(fa.loading_date AS TEXT) >= $3 AND CAST(fa.loading_date AS TEXT) <= $4)
              OR (CAST(fa.loading_date AS TEXT) >= $5 AND CAST(fa.loading_date AS TEXT) <= $6)
            )
          )
        )
      GROUP BY fa.line_type, fa.assignment_type
      `,
      [
        startDate.toISOString(),
        endDate.toISOString(),
        startJalali,
        endJalali,
        startJalali.replace(/\//g, '-'),
        endJalali.replace(/\//g, '-'),
      ]
    );

    const bucket = {};
    for (const def of DISPATCH_LINE_DEFS) {
      bucket[def.key] = {
        lineKey: def.key,
        lineLabel: def.label,
        companyCount: 0,
        personalCount: 0,
        personalFreightSum: 0,
      };
    }

    for (const row of result.rows) {
      const lineKey = normalizeDispatchLineKey(row.line_type);
      if (!lineKey || !bucket[lineKey]) continue;
      const type = String(row.assignment_type || '').toLowerCase();
      const isPersonal = type === 'personal' || type.includes('شخص');
      const isCompany = type === 'company' || type.includes('شرکت');
      const count = Number(row.assignment_count) || 0;
      if (isPersonal) {
        bucket[lineKey].personalCount += count;
        bucket[lineKey].personalFreightSum += Number(row.personal_freight_sum) || 0;
      } else if (isCompany) {
        bucket[lineKey].companyCount += count;
      }
    }

    const lines = DISPATCH_LINE_DEFS.map((def) => {
      const row = bucket[def.key];
      const totalAssignments = row.companyCount + row.personalCount;
      const personalToCompanyPercent =
        row.companyCount > 0
          ? Math.round((row.personalCount / row.companyCount) * 1000) / 10
          : row.personalCount > 0
            ? null
            : 0;
      return {
        lineKey: row.lineKey,
        lineLabel: row.lineLabel,
        totalAssignments,
        personalCount: row.personalCount,
        companyCount: row.companyCount,
        personalToCompanyPercent,
        personalFreightSum: Math.round(row.personalFreightSum),
      };
    });

    const totals = lines.reduce(
      (acc, line) => {
        acc.totalAssignments += line.totalAssignments;
        acc.personalCount += line.personalCount;
        acc.companyCount += line.companyCount;
        acc.personalFreightSum += line.personalFreightSum;
        return acc;
      },
      { totalAssignments: 0, personalCount: 0, companyCount: 0, personalFreightSum: 0 }
    );
    totals.personalToCompanyPercent =
      totals.companyCount > 0
        ? Math.round((totals.personalCount / totals.companyCount) * 1000) / 10
        : totals.personalCount > 0
          ? null
          : 0;

    res.json({
      fromJalali: startJalali,
      toJalali: endJalali,
      lines,
      totals,
    });
  } catch (error) {
    console.error('❌ [DispatchLineStats] Error:', error);
    res.status(500).json({
      message: 'خطا در دریافت آمار اعزام',
      error: error.message,
    });
  }
}

module.exports = {
  getPerformanceIndex,
  getPersonalPerformanceIndex,
  getCompanyDriverPerformance,
  getDispatchLineStats,
};

