const pool = require('../db');
const crypto = require('crypto');

/**
 * ایجاد جداول دوره‌های مالی و لاگ تغییرات
 */
async function createFinancialTables() {
  try {
    // جدول دوره‌های مالی
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_periods (
        id VARCHAR(255) PRIMARY KEY,
        period_name VARCHAR(100) NOT NULL,
        start_date VARCHAR(10) NOT NULL,
        end_date VARCHAR(10) NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        total_tours INTEGER DEFAULT 0,
        recorded_tours INTEGER DEFAULT 0,
        unrecorded_tours INTEGER DEFAULT 0,
        total_amount BIGINT DEFAULT 0,
        closed_by VARCHAR(255),
        closed_at TIMESTAMPTZ,
        reopened_by VARCHAR(255),
        reopened_at TIMESTAMPTZ,
        archived_by VARCHAR(255),
        archived_at TIMESTAMPTZ,
        notes TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // جدول لاگ تغییرات (Audit Trail)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(255) PRIMARY KEY,
        action VARCHAR(50) NOT NULL,
        table_name VARCHAR(100),
        record_id VARCHAR(255),
        old_values JSONB,
        new_values JSONB,
        user_id VARCHAR(255),
        user_name VARCHAR(255),
        ip_address VARCHAR(50),
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // اضافه کردن ستون commission_status به driver_calculations اگر وجود ندارد
    try {
      await pool.query(`
        ALTER TABLE driver_calculations 
        ADD COLUMN IF NOT EXISTS commission_status VARCHAR(30) DEFAULT 'recorded'
      `);
      // مقادیر: recorded, commission_calculated, paid
    } catch (e) {
      console.log('ℹ️ [createFinancialTables] ستون commission_status از قبل وجود دارد');
    }

    // اضافه کردن ستون period_id به driver_calculations اگر وجود ندارد
    try {
      await pool.query(`
        ALTER TABLE driver_calculations 
        ADD COLUMN IF NOT EXISTS period_id VARCHAR(255)
      `);
    } catch (e) {
      console.log('ℹ️ [createFinancialTables] ستون period_id از قبل وجود دارد');
    }

    console.log('✅ [createFinancialTables] جداول مالی ایجاد شدند');
  } catch (error) {
    console.error('❌ [createFinancialTables] خطا:', error);
    throw error;
  }
}

/**
 * ثبت لاگ تغییرات
 */
async function logAudit(action, tableName, recordId, oldValues, newValues, userId, userName, ipAddress, description) {
  try {
    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO audit_logs (id, action, table_name, record_id, old_values, new_values, user_id, user_name, ip_address, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      id,
      action,
      tableName || null,
      recordId || null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      userId || null,
      userName || null,
      ipAddress || null,
      description || null
    ]);
    console.log(`📝 [logAudit] ${action} - ${tableName} - ${recordId}`);
  } catch (error) {
    console.error('❌ [logAudit] خطا در ثبت لاگ:', error);
  }
}

/**
 * دریافت همه دوره‌های مالی
 */
async function getFinancialPeriods(req, res) {
  try {
    await createFinancialTables();

    const { status } = req.query;
    
    let query = `
      SELECT fp.*,
        u1.name as closed_by_name,
        u2.name as reopened_by_name,
        u3.name as created_by_name
      FROM financial_periods fp
      LEFT JOIN users u1 ON fp.closed_by = u1.id
      LEFT JOIN users u2 ON fp.reopened_by = u2.id
      LEFT JOIN users u3 ON fp.created_by = u3.id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE fp.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY fp.start_date DESC';

    const result = await pool.query(query, params);
    
    const periods = result.rows.map(row => ({
      id: row.id,
      periodName: row.period_name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      totalTours: row.total_tours,
      recordedTours: row.recorded_tours,
      unrecordedTours: row.unrecorded_tours,
      totalAmount: parseInt(row.total_amount || 0),
      closedBy: row.closed_by,
      closedByName: row.closed_by_name,
      closedAt: row.closed_at,
      reopenedBy: row.reopened_by,
      reopenedByName: row.reopened_by_name,
      reopenedAt: row.reopened_at,
      archivedBy: row.archived_by,
      archivedAt: row.archived_at,
      notes: row.notes,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
    }));

    res.json(periods);
  } catch (error) {
    console.error('❌ [getFinancialPeriods] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت دوره‌های مالی: ' + error.message });
  }
}

/** تفکیک هزینه تورهای ثبت‌شده برای دیالوگ بستن دوره */
function buildPeriodCostBreakdown(recordedTours) {
  const n = (v) => parseInt(v, 10) || 0;

  const sums = {
    tourCost: 0,
    fixedAllowance: 0,
    billOfLading: 0,
    fuel: 0,
    food: 0,
    toll: 0,
    helper: 0,
    returnCargo: 0,
    returnInterBranch: 0,
    returnBill: 0,
    multiUnload: 0,
    excessMission: 0,
    depot: 0,
    loading: 0,
  };

  for (const r of recordedTours) {
    sums.tourCost += n(r.tour_cost);
    sums.fixedAllowance += n(r.fixed_allowance);
    sums.billOfLading += n(r.bill_of_lading_cost);
    sums.fuel += n(r.fuel_cost);
    sums.food += n(r.food_cost);
    sums.toll += n(r.toll_cost);
    sums.helper += n(r.helper_driver_cost);
    sums.returnCargo += n(r.return_cargo_cost);
    sums.returnInterBranch += n(r.return_inter_branch_cargo_cost);
    sums.returnBill += n(r.return_bill_of_lading_cost);
    sums.multiUnload += n(r.multi_unload_cost);
    sums.excessMission += n(r.excess_mission_cost);
    sums.depot +=
      n(r.depot_cargo_handling_cost) +
      n(r.depot_kilometer_rate) +
      n(r.depot_food_cost) +
      n(r.depot_mission_cost);
    sums.loading += n(r.loading_cost);
  }

  const totalCost = recordedTours.reduce((s, r) => s + n(r.total_cost), 0);
  const commissionAllowance = sums.tourCost + sums.fixedAllowance;

  // همان منطق «جمع قابل پرداخت» صفحه محاسبه پورسانت (بدون بارنامه، کمکی، دپو، برگشتی بین‌شعب)
  const commissionPayableEstimate =
    commissionAllowance +
    sums.food +
    sums.fuel +
    sums.toll +
    sums.loading +
    sums.returnCargo +
    sums.returnBill +
    sums.multiUnload +
    sums.excessMission;

  const amountByKey = {
    commission: commissionAllowance,
    billOfLading: sums.billOfLading,
    fuel: sums.fuel,
    food: sums.food,
    toll: sums.toll,
    helper: sums.helper,
    returnCargo: sums.returnCargo,
    returnInterBranch: sums.returnInterBranch,
    returnBill: sums.returnBill,
    multiUnload: sums.multiUnload,
    excessMission: sums.excessMission,
    depot: sums.depot,
    loading: sums.loading,
  };

  const lineDefs = [
    { key: 'commission', label: 'پورسانت / اجرت تور' },
    { key: 'billOfLading', label: 'هزینه بارنامه' },
    { key: 'fuel', label: 'سوخت' },
    { key: 'food', label: 'غذا' },
    { key: 'toll', label: 'عوارض جاده' },
    { key: 'helper', label: 'راننده کمکی' },
    { key: 'returnCargo', label: 'بار برگشتی' },
    { key: 'returnInterBranch', label: 'بار برگشتی بین شعب' },
    { key: 'returnBill', label: 'بارنامه برگشتی' },
    { key: 'multiUnload', label: 'چندجا تخلیه' },
    { key: 'excessMission', label: 'ماموریت مازاد' },
    { key: 'depot', label: 'هزینه‌های دپو' },
    { key: 'loading', label: 'بارگیری' },
  ];

  const breakdown = lineDefs
    .map(({ key, label }) => {
      const amount = amountByKey[key] || 0;
      return {
        key,
        label,
        amount,
        percent: totalCost > 0 ? Math.round((amount / totalCost) * 1000) / 10 : 0,
      };
    })
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const breakdownSum = breakdown.reduce((s, i) => s + i.amount, 0);
  const otherAmount = Math.max(0, totalCost - breakdownSum);

  if (otherAmount > 0) {
    breakdown.push({
      key: 'other',
      label: 'سایر / اختلاف گرد',
      amount: otherAmount,
      percent: totalCost > 0 ? Math.round((otherAmount / totalCost) * 1000) / 10 : 0,
    });
  }

  return {
    totalCost,
    commissionPayableEstimate,
    commissionAllowance,
    breakdown,
  };
}

/**
 * بررسی وضعیت قبل از بستن دوره
 */
async function checkPeriodStatus(req, res) {
  try {
    await createFinancialTables();
    
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'تاریخ شروع و پایان الزامی است' });
    }

    // دریافت همه تورهای این بازه (هم با / هم با -)
    const startDateDashForCalc = startDate.replace(/\//g, '-');
    const endDateDashForCalc = endDate.replace(/\//g, '-');
    
    const calculationsResult = await pool.query(`
      SELECT dc.*, d.name as driver_name, d.employee_id
      FROM driver_calculations dc
      LEFT JOIN drivers d ON dc.driver_id = d.id
      WHERE (
        (dc.bill_of_lading_date >= $1 AND dc.bill_of_lading_date <= $2)
        OR (dc.bill_of_lading_date >= $3 AND dc.bill_of_lading_date <= $4)
      )
    `, [startDate, endDate, startDateDashForCalc, endDateDashForCalc]);
    
    console.log('📊 [checkPeriodStatus] تورهای در بازه:', calculationsResult.rows.length);

    // دریافت همه تورهایی که راننده دارند ولی اطلاعات هزینه‌شون ثبت نشده
    // بدون فیلتر تاریخ - مثل کارتابل محاسبه هزینه تور
    let unrecordedResult = { rows: [] };
    try {
      // تورهایی که راننده دارن ولی در driver_calculations نیستن
      // مثل کارتابل: فقط announcement هایی که driver و vehicle پیدا میشن
      unrecordedResult = await pool.query(`
        SELECT fa.id, fa.announcement_code as code, 
          CAST(fa.loading_date AS TEXT) as loading_date, 
          fa.status, 
          COALESCE(d.name, fa.assigned_driver_name, '') as driver_name, 
          COALESCE(d.employee_id, fa.assigned_driver_employee_id, '') as employee_id,
          fa.assigned_driver_id as driver_id
        FROM freight_announcements fa
        LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
        WHERE fa.assigned_driver_id IS NOT NULL
          AND fa.assignment_type = 'company'
          AND fa.status = 'Finalized'
          AND COALESCE(fa.finance_disposition, '') <> 'rejected'
          AND d.id IS NOT NULL  -- فقط driver هایی که در جدول drivers وجود دارن
          AND NOT EXISTS (
            SELECT 1 FROM driver_calculations dc 
            WHERE dc.announcement_id = fa.id
          )
      `);
      
      console.log('📊 [checkPeriodStatus] تورهای بدون رکورد:', unrecordedResult.rows.length);
      if (unrecordedResult.rows.length > 0) {
        console.log('📋 [checkPeriodStatus] نمونه تور بدون رکورد:', unrecordedResult.rows[0]);
      }
    } catch (queryError) {
      console.error('❌ [checkPeriodStatus] خطا در دریافت تورهای ثبت نشده:', queryError.message);
    }
    
    // تورهایی که رکورد دارن ولی total_cost = 0 (بدون فیلتر تاریخ)
    let zeroCostResult = { rows: [] };
    try {
      zeroCostResult = await pool.query(`
        SELECT dc.*, d.name as driver_name, d.employee_id
        FROM driver_calculations dc
        LEFT JOIN drivers d ON dc.driver_id = d.id
        WHERE (dc.total_cost IS NULL OR dc.total_cost = 0)
          AND (dc.commission_status IS NULL OR dc.commission_status = 'recorded')
      `);
      
      console.log('📊 [checkPeriodStatus] تورهای با هزینه صفر:', zeroCostResult.rows.length);
    } catch (queryError) {
      console.error('❌ [checkPeriodStatus] خطا در دریافت تورهای با هزینه صفر:', queryError.message);
    }

    // تفکیک تورها بر اساس وضعیت
    const allTours = calculationsResult.rows;
    
    // تورهایی که هزینه‌شون ثبت شده (total_cost > 0) و هنوز دوره‌شون بسته نشده - در بازه تاریخ
    const recordedTours = allTours.filter(r => 
      (!r.commission_status || r.commission_status === 'recorded') && 
      (parseInt(r.total_cost) || 0) > 0
    );
    
    // تورهایی که قبلاً دوره‌شون بسته شده
    const alreadyCalculated = allTours.filter(r => 
      r.commission_status === 'commission_calculated' || r.commission_status === 'paid'
    );
    
    // تعداد کل تورهای ثبت نشده (بدون فیلتر تاریخ - مثل کارتابل)
    const unrecordedFromAnnouncements = unrecordedResult.rows.length;
    const unrecordedWithZeroCost = zeroCostResult.rows.length;
    
    console.log('📊 [checkPeriodStatus] تفکیک:', {
      inDateRange: allTours.length,
      recordedWithCost: recordedTours.length,
      alreadyClosed: alreadyCalculated.length,
      unrecordedFromAnnouncements,
      unrecordedWithZeroCost
    });

    // گروه‌بندی تورهای ثبت نشده بر اساس راننده
    const unrecordedByDriver = {};
    
    // گروه‌بندی تورهای بدون رکورد
    if (unrecordedResult.rows && unrecordedResult.rows.length > 0) {
      unrecordedResult.rows.forEach(row => {
        // استفاده از driver_id به عنوان کلید اصلی (اگر موجود باشه)
        const driverKey = row.driver_id || row.employee_id || row.driver_name || 'unknown';
        if (!unrecordedByDriver[driverKey]) {
          unrecordedByDriver[driverKey] = {
            driverId: row.driver_id || null,
            driverName: row.driver_name || 'نامشخص',
            employeeId: row.employee_id || '',
            tours: []
          };
        }
        unrecordedByDriver[driverKey].tours.push({
          announcementId: row.id,
          code: row.code,
          loadingDate: row.loading_date
        });
      });
    }
    
    // گروه‌بندی تورهای با هزینه صفر
    if (zeroCostResult.rows && zeroCostResult.rows.length > 0) {
      zeroCostResult.rows.forEach(row => {
        const driverKey = row.employee_id || row.driver_name || row.driver_id || 'unknown';
        if (!unrecordedByDriver[driverKey]) {
          unrecordedByDriver[driverKey] = {
            driverId: row.driver_id || null,
            driverName: row.driver_name || 'نامشخص',
            employeeId: row.employee_id || '',
            tours: []
          };
        }
        // برای تورهای با هزینه صفر، اطلاعات تور رو از driver_calculations می‌گیریم
        unrecordedByDriver[driverKey].tours.push({
          announcementId: row.announcement_id,
          code: row.bill_of_lading_number || 'بدون شماره',
          loadingDate: row.bill_of_lading_date || ''
        });
      });
    }
    
    console.log('📊 [checkPeriodStatus] رانندگان با تور ثبت نشده:', Object.keys(unrecordedByDriver).length);
    if (Object.keys(unrecordedByDriver).length > 0) {
      console.log('📋 [checkPeriodStatus] نمونه راننده:', Object.values(unrecordedByDriver)[0]);
    }

    // تفکیک هزینه (فقط تورهای در بازه تاریخ)
    const costSummary = buildPeriodCostBreakdown(recordedTours);
    const totalAmount = costSummary.totalCost;
    
    // تعداد کل تورهای ثبت نشده (بدون فیلتر تاریخ - مثل کارتابل)
    const totalUnrecorded = unrecordedFromAnnouncements + unrecordedWithZeroCost;

    const unrecordedDriversArray = Object.values(unrecordedByDriver);
    console.log('📊 [checkPeriodStatus] ارسال unrecordedDrivers:', {
      count: unrecordedDriversArray.length,
      sample: unrecordedDriversArray.length > 0 ? unrecordedDriversArray[0] : null
    });
    
    res.json({
      startDate,
      endDate,
      // آمار بازه تاریخ (برای بستن دوره)
      recordedTours: recordedTours.length,
      totalAmount,
      totalCost: costSummary.totalCost,
      commissionPayableEstimate: costSummary.commissionPayableEstimate,
      costBreakdown: costSummary.breakdown,
      alreadyCalculatedTours: alreadyCalculated.length,
      // آمار کلی (بدون فیلتر تاریخ - مثل کارتابل)
      unrecordedTours: totalUnrecorded,
      unrecordedFromAnnouncements,
      unrecordedWithZeroCost,
      unrecordedDrivers: unrecordedDriversArray,
      canClose: true
    });
  } catch (error) {
    console.error('❌ [checkPeriodStatus] Error:', error);
    res.status(500).json({ message: 'خطا در بررسی وضعیت دوره: ' + error.message });
  }
}

/**
 * بستن دوره مالی
 */
async function closePeriod(req, res) {
  try {
    await createFinancialTables();
    
    const {
      periodName,
      startDate,
      endDate,
      notes,
      userId,
      userName
    } = req.body;
    
    if (!periodName || !startDate || !endDate) {
      return res.status(400).json({ message: 'نام دوره، تاریخ شروع و پایان الزامی است' });
    }

    // بررسی وجود دوره با همین تاریخ
    const existingPeriod = await pool.query(
      'SELECT id FROM financial_periods WHERE start_date = $1 AND end_date = $2',
      [startDate, endDate]
    );

    if (existingPeriod.rows.length > 0) {
      return res.status(400).json({ message: 'دوره‌ای با این تاریخ قبلاً ثبت شده است' });
    }

    // دریافت آمار تورها (با پشتیبانی از هر دو فرمت تاریخ)
    const startDateDashForCalc = startDate.replace(/\//g, '-');
    const endDateDashForCalc = endDate.replace(/\//g, '-');
    
    const recordedResult = await pool.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total
      FROM driver_calculations
      WHERE (
        (bill_of_lading_date >= $1 AND bill_of_lading_date <= $2)
        OR (bill_of_lading_date >= $3 AND bill_of_lading_date <= $4)
      )
        AND (commission_status IS NULL OR commission_status = 'recorded')
        AND (total_cost IS NULL OR total_cost > 0)
    `, [startDate, endDate, startDateDashForCalc, endDateDashForCalc]);

    // تبدیل فرمت تاریخ برای مقایسه
    const startDateDash = startDate.replace(/\//g, '-');
    const endDateDash = endDate.replace(/\//g, '-');
    
    const unrecordedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM freight_announcements fa
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      WHERE (
        (CAST(fa.loading_date AS TEXT) >= $1 AND CAST(fa.loading_date AS TEXT) <= $2)
        OR (CAST(fa.loading_date AS TEXT) >= $3 AND CAST(fa.loading_date AS TEXT) <= $4)
      )
        AND fa.assigned_driver_id IS NOT NULL
        AND fa.assignment_type = 'company'
        AND fa.status = 'Finalized'
        AND COALESCE(fa.finance_disposition, '') <> 'rejected'
        AND d.id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM driver_calculations dc 
          WHERE dc.announcement_id = fa.id
        )
    `, [startDate, endDate, startDateDash, endDateDash]);

    const recordedTours = parseInt(recordedResult.rows[0].count) || 0;
    const totalAmount = parseInt(recordedResult.rows[0].total) || 0;
    const unrecordedTours = parseInt(unrecordedResult.rows[0].count) || 0;
    
    console.log('📊 [closePeriod] آمار دوره:', {
      recordedTours,
      unrecordedTours,
      totalAmount
    });

    // ایجاد دوره جدید
    const periodId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO financial_periods (
        id, period_name, start_date, end_date, status,
        total_tours, recorded_tours, unrecorded_tours, total_amount,
        closed_by, closed_at, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $10)
    `, [
      periodId,
      periodName,
      startDate,
      endDate,
      'closed',
      recordedTours + unrecordedTours,
      recordedTours,
      unrecordedTours,
      totalAmount,
      userId || null,
      notes || null
    ]);

    // آپدیت وضعیت تورهای ثبت شده (با پشتیبانی از هر دو فرمت تاریخ)
    const updateResult = await pool.query(`
      UPDATE driver_calculations
      SET commission_status = 'commission_calculated',
          period_id = $1,
          updated_at = NOW()
      WHERE (
        (bill_of_lading_date >= $2 AND bill_of_lading_date <= $3)
        OR (bill_of_lading_date >= $4 AND bill_of_lading_date <= $5)
      )
        AND (commission_status IS NULL OR commission_status = 'recorded')
        AND (total_cost IS NULL OR total_cost > 0)
      RETURNING id
    `, [periodId, startDate, endDate, startDateDashForCalc, endDateDashForCalc]);
    
    console.log('✅ [closePeriod] تورهای آپدیت شده:', updateResult.rows.length);

    // ثبت لاگ
    await logAudit(
      'close_period',
      'financial_periods',
      periodId,
      null,
      { periodName, startDate, endDate, recordedTours, unrecordedTours, totalAmount },
      userId,
      userName,
      req.ip,
      `بستن دوره ${periodName}`
    );

    console.log(`✅ [closePeriod] دوره ${periodName} بسته شد - ${recordedTours} تور`);

    res.json({
      message: 'دوره با موفقیت بسته شد',
      periodId,
      recordedTours,
      unrecordedTours,
      totalAmount
    });
  } catch (error) {
    console.error('❌ [closePeriod] Error:', error);
    res.status(500).json({ message: 'خطا در بستن دوره: ' + error.message });
  }
}

/**
 * باز کردن دوره مالی (فقط مدیر)
 */
async function reopenPeriod(req, res) {
  try {
    const { periodId, userId, userName, reason } = req.body;
    
    if (!periodId) {
      return res.status(400).json({ message: 'شناسه دوره الزامی است' });
    }

    // دریافت اطلاعات دوره
    const periodResult = await pool.query(
      'SELECT * FROM financial_periods WHERE id = $1',
      [periodId]
    );

    if (periodResult.rows.length === 0) {
      return res.status(404).json({ message: 'دوره یافت نشد' });
    }

    const period = periodResult.rows[0];
    
    if (period.status === 'archived') {
      return res.status(400).json({ message: 'دوره بایگانی شده قابل باز کردن نیست' });
    }

    if (period.status === 'open') {
      return res.status(400).json({ message: 'دوره قبلاً باز است' });
    }

    // آپدیت وضعیت دوره
    await pool.query(`
      UPDATE financial_periods
      SET status = 'open',
          reopened_by = $1,
          reopened_at = NOW(),
          notes = COALESCE(notes, '') || E'\n' || $2,
          updated_at = NOW()
      WHERE id = $3
    `, [userId || null, `باز شده توسط ${userName || 'نامشخص'}: ${reason || '-'}`, periodId]);

    // آپدیت وضعیت تورها (برگشت به recorded)
    await pool.query(`
      UPDATE driver_calculations
      SET commission_status = 'recorded',
          updated_at = NOW()
      WHERE period_id = $1
        AND commission_status = 'commission_calculated'
    `, [periodId]);

    // ثبت لاگ
    await logAudit(
      'reopen_period',
      'financial_periods',
      periodId,
      { status: 'closed' },
      { status: 'open', reason },
      userId,
      userName,
      req.ip,
      `باز کردن دوره ${period.period_name}: ${reason || '-'}`
    );

    console.log(`✅ [reopenPeriod] دوره ${period.period_name} باز شد`);

    res.json({ message: 'دوره با موفقیت باز شد' });
  } catch (error) {
    console.error('❌ [reopenPeriod] Error:', error);
    res.status(500).json({ message: 'خطا در باز کردن دوره: ' + error.message });
  }
}

/**
 * بایگانی دوره مالی
 */
async function archivePeriod(req, res) {
  try {
    const { periodId, userId, userName } = req.body;
    
    if (!periodId) {
      return res.status(400).json({ message: 'شناسه دوره الزامی است' });
    }

    // دریافت اطلاعات دوره
    const periodResult = await pool.query(
      'SELECT * FROM financial_periods WHERE id = $1',
      [periodId]
    );

    if (periodResult.rows.length === 0) {
      return res.status(404).json({ message: 'دوره یافت نشد' });
    }

    const period = periodResult.rows[0];
    
    if (period.status !== 'closed') {
      return res.status(400).json({ message: 'فقط دوره‌های بسته قابل بایگانی هستند' });
    }

    // آپدیت وضعیت دوره
    await pool.query(`
      UPDATE financial_periods
      SET status = 'archived',
          archived_by = $1,
          archived_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [userId || null, periodId]);

    // ثبت لاگ
    await logAudit(
      'archive_period',
      'financial_periods',
      periodId,
      { status: 'closed' },
      { status: 'archived' },
      userId,
      userName,
      req.ip,
      `بایگانی دوره ${period.period_name}`
    );

    res.json({ message: 'دوره با موفقیت بایگانی شد' });
  } catch (error) {
    console.error('❌ [archivePeriod] Error:', error);
    res.status(500).json({ message: 'خطا در بایگانی دوره: ' + error.message });
  }
}

/**
 * دریافت تورهای یک دوره مالی
 */
async function getPeriodTours(req, res) {
  try {
    const { periodId } = req.params;
    
    if (!periodId) {
      return res.status(400).json({ message: 'شناسه دوره الزامی است' });
    }

    // دریافت اطلاعات دوره
    const periodResult = await pool.query(
      'SELECT * FROM financial_periods WHERE id = $1',
      [periodId]
    );

    if (periodResult.rows.length === 0) {
      return res.status(404).json({ message: 'دوره یافت نشد' });
    }

    const period = periodResult.rows[0];

    // دریافت تورهای این دوره
    const toursResult = await pool.query(`
      SELECT 
        dc.*,
        d.name as driver_name,
        d.employee_id,
        fa.announcement_code,
        fa.loading_date,
        COALESCE(fa.vehicle_type, dc.vehicle_code, '') as vehicle_type,
        COALESCE(
          (
            SELECT json_agg(json_build_object('city', fd.city, 'representative_name', fd.representative_name) ORDER BY fd.created_at ASC)
            FROM freight_destinations fd
            WHERE fd.freight_announcement_id = fa.id
          ),
          '[]'::json
        ) as destinations
      FROM driver_calculations dc
      LEFT JOIN drivers d ON dc.driver_id = d.id
      LEFT JOIN freight_announcements fa ON dc.announcement_id = fa.id
      WHERE dc.period_id = $1
      ORDER BY dc.bill_of_lading_date DESC, d.name ASC
    `, [periodId]);

    const calcTotalKm = (row) => {
      const stored = parseInt(row.total_kilometers, 10) || 0;
      if (stored > 0) return stored;
      return (
        (parseInt(row.approved_kilometers, 10) || 0) +
        (parseInt(row.excess_kilometers, 10) || 0) +
        (parseInt(row.depot_total_mileage, 10) || 0)
      );
    };

    const tours = toursResult.rows.map(row => {
      // Parse destinations - می‌تونه JSON string یا object باشه
      let destinations = row.destinations;
      if (typeof destinations === 'string') {
        try {
          destinations = JSON.parse(destinations);
        } catch (e) {
          destinations = [];
        }
      }
      // اگر null یا undefined بود، array خالی بده
      if (!destinations) {
        destinations = [];
      }
      
      return {
        id: row.id,
        driverId: row.driver_id,
        driverName: row.driver_name,
        employeeId: row.employee_id,
        announcementId: row.announcement_id,
        announcementCode: row.announcement_code,
        billOfLadingNumber: row.bill_of_lading_number,
        billOfLadingDate: row.bill_of_lading_date,
        loadingDate: row.loading_date,
        destinations: destinations,
        vehicleType: row.vehicle_type || row.vehicle_code || '',
        queueType: row.queue_type,
      approvedKilometers: parseInt(row.approved_kilometers) || 0,
      excessKilometers: parseInt(row.excess_kilometers) || 0,
      depotTotalMileage: parseInt(row.depot_total_mileage) || 0,
      totalKilometers: calcTotalKm(row),
      fixedAllowance: row.queue_type === 'fixed_allowance'
        ? (parseInt(row.fixed_allowance) || parseInt(row.tour_cost) || 0)
        : 0,
      foodCost: parseInt(row.food_cost) || 0,
      fuelCost: parseInt(row.fuel_cost) || 0,
      tollCost: parseInt(row.toll_cost) || 0,
      billOfLadingCost: parseInt(row.bill_of_lading_cost) || 0,
      returnCargoCost: parseInt(row.return_cargo_cost) || 0,
      returnBillOfLadingCost: parseInt(row.return_bill_of_lading_cost) || 0,
      multiUnloadCost: parseInt(row.multi_unload_cost) || 0,
      excessMissionCost: parseInt(row.excess_mission_cost) || 0,
      helperDriverCost: parseInt(row.helper_driver_cost) || 0,
      totalCost: parseInt(row.total_cost) || 0,
      commissionStatus: row.commission_status,
      };
    });

    res.json({
      period: {
        id: period.id,
        periodName: period.period_name,
        startDate: period.start_date,
        endDate: period.end_date,
        status: period.status,
        recordedTours: period.recorded_tours,
        totalAmount: parseInt(period.total_amount || 0),
      },
      tours,
      totalTours: tours.length,
      totalAmount: tours.reduce((sum, t) => sum + t.totalCost, 0)
    });
  } catch (error) {
    console.error('❌ [getPeriodTours] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت تورهای دوره: ' + error.message });
  }
}

/**
 * تاریخچه پورسانت یک راننده در دوره‌های بسته/بایگانی
 */
async function getDriverCommissionHistory(req, res) {
  try {
    const { search, periodLimit = '10' } = req.query;
    const limit = Math.min(parseInt(periodLimit, 10) || 10, 30);

    if (!search || !String(search).trim()) {
      return res.status(400).json({ message: 'کد پرسنلی یا نام راننده الزامی است.' });
    }

    const term = `%${String(search).trim()}%`;

    const periodsResult = await pool.query(`
      SELECT id, period_name, start_date, end_date, status, closed_at
      FROM financial_periods
      WHERE status IN ('closed', 'archived')
      ORDER BY closed_at DESC NULLS LAST, start_date DESC
      LIMIT $1
    `, [limit]);

    if (periodsResult.rows.length === 0) {
      return res.json({ periods: [], rows: [] });
    }

    const periodIds = periodsResult.rows.map(p => p.id);

    const toursResult = await pool.query(`
      SELECT
        dc.*,
        d.name as driver_name,
        d.employee_id,
        fp.id as period_id,
        fp.period_name,
        fp.start_date,
        fp.end_date,
        fp.status as period_status,
        COALESCE(fa.vehicle_type, dc.vehicle_code, '') as vehicle_type
      FROM driver_calculations dc
      JOIN financial_periods fp ON fp.id = dc.period_id
      LEFT JOIN drivers d ON dc.driver_id = d.id
      LEFT JOIN freight_announcements fa ON dc.announcement_id = fa.id
      WHERE dc.period_id = ANY($1::varchar[])
        AND (
          d.employee_id ILIKE $2
          OR d.name ILIKE $2
        )
      ORDER BY fp.closed_at DESC NULLS LAST, dc.bill_of_lading_date DESC
    `, [periodIds, term]);

    res.json({
      periods: periodsResult.rows.map(p => ({
        id: p.id,
        periodName: p.period_name,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
        closedAt: p.closed_at,
      })),
      calculations: toursResult.rows,
    });
  } catch (error) {
    console.error('❌ [getDriverCommissionHistory] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت تاریخچه راننده: ' + error.message });
  }
}

/**
 * دریافت لاگ‌های تغییرات
 */
async function getAuditLogs(req, res) {
  try {
    await createFinancialTables();
    
    const { tableName, recordId, action, startDate, endDate, limit = 100 } = req.query;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (tableName) {
      query += ` AND table_name = $${paramIndex++}`;
      params.push(tableName);
    }
    if (recordId) {
      query += ` AND record_id = $${paramIndex++}`;
      params.push(recordId);
    }
    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }
    if (startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    
    res.json(result.rows.map(row => ({
      id: row.id,
      action: row.action,
      tableName: row.table_name,
      recordId: row.record_id,
      oldValues: row.old_values,
      newValues: row.new_values,
      userId: row.user_id,
      userName: row.user_name,
      ipAddress: row.ip_address,
      description: row.description,
      createdAt: row.created_at
    })));
  } catch (error) {
    console.error('❌ [getAuditLogs] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت لاگ‌ها: ' + error.message });
  }
}

module.exports = {
  createFinancialTables,
  logAudit,
  getFinancialPeriods,
  checkPeriodStatus,
  closePeriod,
  reopenPeriod,
  archivePeriod,
  getPeriodTours,
  getDriverCommissionHistory,
  getAuditLogs
};

