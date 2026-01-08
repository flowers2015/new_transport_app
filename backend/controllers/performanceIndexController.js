const pool = require('../db');
const jalaliUtils = require('../utils/jalali');

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

module.exports = {
  getPerformanceIndex,
  getPersonalPerformanceIndex
};

