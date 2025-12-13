const pool = require('../db');
const crypto = require('crypto');

/**
 * ذخیره محاسبات اجرت پیمایش برای یک تور
 */
async function saveDriverCalculation(req, res) {
  try {
    const {
      driverId,
      announcementId,
      billOfLadingNumber,
      billOfLadingDate,
      billOfLadingCost,
      approvedKilometers,
      excessKilometers,
      approvedMissionDays,
      excessMissionDays,
      tollCost,
      loadingCost,
      returnCargoCost,
      returnBillOfLadingCost,
      multiUnloadCost,
      excessMissionCost,
      helperDriverCost,
      fixedAllowance,
      foodCost,
      fuelCost,
      tourCost,
      totalCost,
      notes,
      queueType,
      calculationDate,
      userId,
      helperDriverId,
      helperDriverEmployeeId,
      helperDriverName,
      helperDriverAllowance,
      helperDriverFoodCost,
      helperDriverExcessMissionDays,
      helperDriverExcessMissionCost,
      helperDriverExcessKilometers,
      vehicleCode,
      vehiclePlate,
      destinations,
      multiUnloadCount,
      advancePayment,
      depotTotalMileage,
      depotShipmentCount,
      depotCargoHandlingCost,
      depotMissionDays,
      depotKilometerRate,
      depotFoodCost,
      depotMissionCost,
      depotRows,
    } = req.body;

    // تبدیل و اعتبارسنجی مقادیر عددی
    const parseNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined || value === '') return defaultValue;
      // اگر string است، ابتدا آن را به number تبدیل کن
      if (typeof value === 'string') {
        // حذف کاراکترهای غیر عددی (به جز نقطه و منفی)
        const cleaned = value.replace(/[^\d.-]/g, '');
        if (cleaned === '' || cleaned === '-' || cleaned === '.') return defaultValue;
        const num = parseFloat(cleaned);
        return isNaN(num) ? defaultValue : num;
      }
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    console.log('🔍 [saveDriverCalculation] مقادیر خام دریافت شده:', {
      foodCost: foodCost,
      fuelCost: fuelCost,
      tourCost: tourCost,
      totalCost: totalCost,
      tollCost: tollCost,
      loadingCost: loadingCost,
      foodCostType: typeof foodCost,
      fuelCostType: typeof fuelCost,
      tourCostType: typeof tourCost,
      totalCostType: typeof totalCost,
    });

    const validatedFoodCost = parseNumber(foodCost, 0);
    const validatedFuelCost = parseNumber(fuelCost, 0);
    const validatedTourCost = parseNumber(tourCost, 0);
    const validatedTotalCost = parseNumber(totalCost, 0);
    const validatedTollCost = parseNumber(tollCost, 0);
    const validatedLoadingCost = parseNumber(loadingCost, 0);

    console.log('✅ [saveDriverCalculation] مقادیر اعتبارسنجی شده:', {
      validatedFoodCost,
      validatedFuelCost,
      validatedTourCost,
      validatedTotalCost,
      validatedTollCost,
      validatedLoadingCost,
    });

    if (!driverId || !announcementId) {
      return res.status(400).json({ message: 'driverId و announcementId الزامی است.' });
    }

    console.log('💾 [saveDriverCalculation] دریافت درخواست:', {
      driverId,
      announcementId,
      approvedKilometers,
      approvedMissionDays,
      excessKilometers,
      excessMissionDays,
    });

    // بررسی وجود جدول driver_calculations
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'driver_calculations'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // ایجاد جدول اگر وجود ندارد
      await pool.query(`
        CREATE TABLE IF NOT EXISTS driver_calculations (
          id VARCHAR(255) PRIMARY KEY,
          driver_id VARCHAR(255) NOT NULL,
          announcement_id VARCHAR(255) NOT NULL REFERENCES freight_announcements(id),
          bill_of_lading_number VARCHAR(255),
          bill_of_lading_date VARCHAR(10), -- تاریخ شمسی صدور بارنامه YYYY/MM/DD
          bill_of_lading_cost INTEGER DEFAULT 0, -- هزینه بارنامه (ریال)
          approved_kilometers INTEGER,
          excess_kilometers INTEGER DEFAULT 0,
          approved_mission_days INTEGER,
          excess_mission_days INTEGER DEFAULT 0,
          toll_cost INTEGER DEFAULT 0,
          loading_cost INTEGER DEFAULT 0, -- هزینه بارگیری اصلی
          return_cargo_cost INTEGER DEFAULT 0, -- هزینه بار برگشتی
          return_bill_of_lading_cost INTEGER DEFAULT 0, -- هزینه بارنامه برگشتی
          multi_unload_cost INTEGER DEFAULT 0, -- هزینه چندجا تخلیه
          excess_mission_cost INTEGER DEFAULT 0, -- هزینه ماموریت مازاد
          helper_driver_cost INTEGER DEFAULT 0, -- هزینه راننده کمکی
          fixed_allowance INTEGER DEFAULT 0, -- اجرت ثابت
          helper_driver_id VARCHAR(255), -- شناسه راننده کمکی
          helper_driver_employee_id VARCHAR(255), -- کد پرسنلی راننده کمکی
          helper_driver_name VARCHAR(255), -- نام و نام خانوادگی راننده کمکی
          helper_driver_allowance INTEGER DEFAULT 0, -- اجرت راننده کمکی
          helper_driver_food_cost INTEGER DEFAULT 0, -- هزینه غذا راننده کمکی
          helper_driver_excess_mission_days INTEGER DEFAULT 0, -- ماموریت مازاد راننده کمکی
          helper_driver_excess_mission_cost INTEGER DEFAULT 0, -- هزینه ماموریت مازاد راننده کمکی
          food_cost INTEGER DEFAULT 0,
          fuel_cost INTEGER DEFAULT 0,
          tour_cost INTEGER DEFAULT 0,
          total_cost INTEGER DEFAULT 0,
          notes TEXT,
          queue_type VARCHAR(50),
          calculation_date VARCHAR(10), -- تاریخ شمسی محاسبه YYYY/MM/DD
          vehicle_code VARCHAR(255), -- کد خودرو
          vehicle_plate VARCHAR(255), -- پلاک خودرو
          destinations TEXT, -- فیلد مقاصد
          multi_unload_count INTEGER DEFAULT 0, -- تعداد چندجا تخلیه
          advance_payment INTEGER DEFAULT 0, -- پیش پرداخت (ریال)
          created_by VARCHAR(255),
          updated_by VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(driver_id, announcement_id)
        )
      `);
    } else {
      // اضافه کردن ستون‌های جدید اگر وجود ندارند
      try {
        await pool.query(`
          ALTER TABLE driver_calculations 
          ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
          ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),
          ADD COLUMN IF NOT EXISTS calculation_date VARCHAR(10),
          ADD COLUMN IF NOT EXISTS bill_of_lading_date VARCHAR(10),
          ADD COLUMN IF NOT EXISTS bill_of_lading_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS return_cargo_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS return_bill_of_lading_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS multi_unload_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS excess_mission_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS helper_driver_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS fixed_allowance INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS helper_driver_id VARCHAR(255),
          ADD COLUMN IF NOT EXISTS helper_driver_employee_id VARCHAR(255),
          ADD COLUMN IF NOT EXISTS helper_driver_name VARCHAR(255),
          ADD COLUMN IF NOT EXISTS helper_driver_allowance INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS helper_driver_food_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS helper_driver_excess_mission_days INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS helper_driver_excess_mission_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS helper_driver_excess_kilometers INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS commission_status VARCHAR(30) DEFAULT 'recorded',
          ADD COLUMN IF NOT EXISTS period_id VARCHAR(255),
          ADD COLUMN IF NOT EXISTS vehicle_code VARCHAR(255),
          ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(255),
          ADD COLUMN IF NOT EXISTS destinations TEXT,
          ADD COLUMN IF NOT EXISTS multi_unload_count INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS advance_payment INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_total_mileage INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_shipment_count INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_cargo_handling_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_mission_days INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_kilometer_rate INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_food_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_mission_cost INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS depot_rows JSONB
        `);
        // تبدیل ستون‌های DECIMAL به INTEGER برای هزینه‌ها
        try {
          await pool.query(`ALTER TABLE driver_calculations ALTER COLUMN toll_cost TYPE INTEGER USING COALESCE(toll_cost::INTEGER, 0)`);
          await pool.query(`ALTER TABLE driver_calculations ALTER COLUMN loading_cost TYPE INTEGER USING COALESCE(loading_cost::INTEGER, 0)`);
          await pool.query(`ALTER TABLE driver_calculations ALTER COLUMN food_cost TYPE INTEGER USING COALESCE(food_cost::INTEGER, 0)`);
          await pool.query(`ALTER TABLE driver_calculations ALTER COLUMN fuel_cost TYPE INTEGER USING COALESCE(fuel_cost::INTEGER, 0)`);
          await pool.query(`ALTER TABLE driver_calculations ALTER COLUMN tour_cost TYPE INTEGER USING COALESCE(tour_cost::INTEGER, 0)`);
          await pool.query(`ALTER TABLE driver_calculations ALTER COLUMN total_cost TYPE INTEGER USING COALESCE(total_cost::INTEGER, 0)`);
        } catch (typeError) {
          console.log('ℹ️ [saveDriverCalculation] ستون‌ها از قبل INTEGER هستند یا خطا در تبدیل:', typeError.message);
        }
      } catch (alterError) {
        // اگر ستون‌ها از قبل وجود دارند، خطا نادیده گرفته می‌شود
        console.log('ℹ️ [saveDriverCalculation] ستون‌های جدید از قبل وجود دارند');
      }
    }

    const id = crypto.randomUUID();

    // بررسی وجود رکورد قبلی
    const existingCheck = await pool.query(
      'SELECT id FROM driver_calculations WHERE driver_id = $1 AND announcement_id = $2',
      [driverId, announcementId]
    );

    if (existingCheck.rows.length > 0) {
      // آپدیت رکورد موجود
      const updateQuery = `
        UPDATE driver_calculations SET
          bill_of_lading_number = $1,
          bill_of_lading_date = $2,
          bill_of_lading_cost = $3,
          approved_kilometers = $4,
          excess_kilometers = $5,
          approved_mission_days = $6,
          excess_mission_days = $7,
          toll_cost = $8,
          loading_cost = 0, -- این فیلد دیگر استفاده نمی‌شود و همیشه 0 است
          return_cargo_cost = $9,
          return_bill_of_lading_cost = $10,
          multi_unload_cost = $11,
          excess_mission_cost = $12,
          helper_driver_cost = $13,
          fixed_allowance = $14,
          helper_driver_id = $16,
          helper_driver_employee_id = $17,
          helper_driver_name = $18,
          helper_driver_allowance = $19,
          helper_driver_food_cost = $20,
          helper_driver_excess_mission_days = $21,
          helper_driver_excess_mission_cost = $22,
          helper_driver_excess_kilometers = $23,
          food_cost = $24,
          fuel_cost = $25,
          tour_cost = $26,
          total_cost = $27,
          notes = $28,
          queue_type = $29,
          calculation_date = $30,
          vehicle_code = $31,
          vehicle_plate = $32,
          destinations = $33,
          multi_unload_count = $34,
          advance_payment = $35,
          depot_total_mileage = $36,
          depot_shipment_count = $37,
          depot_cargo_handling_cost = $38,
          depot_mission_days = $39,
          depot_kilometer_rate = $40,
          depot_food_cost = $41,
          depot_mission_cost = $42,
          depot_rows = $43,
          updated_by = $44,
          updated_at = NOW()
        WHERE driver_id = $45 AND announcement_id = $46
      `;
      
      const updateParams = [
        billOfLadingNumber || null,
        billOfLadingDate || null,
        parseNumber(billOfLadingCost, 0),
        approvedKilometers || null,
        excessKilometers || 0,
        approvedMissionDays || null,
        excessMissionDays || 0,
        validatedTollCost,
        parseNumber(returnCargoCost, 0),
        parseNumber(returnBillOfLadingCost, 0),
        parseNumber(multiUnloadCost, 0),
        parseNumber(excessMissionCost || 0, 0), // اطمینان از اینکه undefined نباشد
        parseNumber(helperDriverCost, 0),
        parseNumber(fixedAllowance, 0),
        helperDriverId || null,
        helperDriverEmployeeId || null,
        helperDriverName || null,
        parseNumber(helperDriverAllowance, 0),
        parseNumber(helperDriverFoodCost, 0),
        parseNumber(helperDriverExcessMissionDays, 0),
        parseNumber(helperDriverExcessMissionCost, 0),
        parseNumber(helperDriverExcessKilometers, 0),
        validatedFoodCost,
        validatedFuelCost,
        validatedTourCost,
        validatedTotalCost,
        notes || null,
        queueType || null,
        calculationDate || null,
        vehicleCode || null,
        vehiclePlate || null,
        (destinations ? String(destinations) : null),
        parseNumber(multiUnloadCount, 0),
        parseNumber(advancePayment, 0),
        parseNumber(depotTotalMileage, 0),
        parseNumber(depotShipmentCount, 0),
        parseNumber(depotCargoHandlingCost, 0),
        parseNumber(depotMissionDays, 0),
        parseNumber(depotKilometerRate, 0),
        parseNumber(depotFoodCost, 0),
        parseNumber(depotMissionCost, 0),
        (depotRows ? JSON.stringify(depotRows) : null),
        (userId || null),
        driverId,
        announcementId,
      ];
      
      console.log('🔍 [saveDriverCalculation] تعداد پارامترهای UPDATE:', updateParams.length, 'مورد نیاز: 45');
      console.log('🔍 [saveDriverCalculation] جزئیات پارامترها:', updateParams.map((p, i) => ({ 
        index: i + 1, 
        value: p, 
        type: typeof p,
        isUndefined: p === undefined 
      })));
      
      if (updateParams.length !== 45) {
        console.error('❌ [saveDriverCalculation] تعداد پارامترها نادرست است!', {
          count: updateParams.length,
          expected: 45,
          params: updateParams.map((p, i) => ({ index: i + 1, value: p, type: typeof p }))
        });
        return res.status(500).json({ 
          message: `خطا در تعداد پارامترها: ${updateParams.length} به جای 45`,
          error: 'PARAMETER_COUNT_MISMATCH'
        });
      }
      
      // بررسی undefined بودن پارامترها
      const undefinedParams = updateParams.map((p, i) => ({ index: i + 1, isUndefined: p === undefined })).filter(p => p.isUndefined);
      if (undefinedParams.length > 0) {
        console.error('❌ [saveDriverCalculation] پارامترهای undefined:', undefinedParams);
      }
      
      await pool.query(updateQuery, updateParams);

      console.log('✅ [saveDriverCalculation] اطلاعات به‌روزرسانی شد:', existingCheck.rows[0].id);
      return res.json({ 
        message: 'اطلاعات محاسباتی به‌روزرسانی شد.',
        id: existingCheck.rows[0].id 
      });
    } else {
      // ایجاد رکورد جدید
      await pool.query(`
        INSERT INTO driver_calculations (
          id, driver_id, announcement_id, bill_of_lading_number, bill_of_lading_date, bill_of_lading_cost,
          approved_kilometers, excess_kilometers, approved_mission_days, excess_mission_days,
          toll_cost, loading_cost, return_cargo_cost, return_bill_of_lading_cost, multi_unload_cost, excess_mission_cost, helper_driver_cost, fixed_allowance,
          helper_driver_id, helper_driver_employee_id, helper_driver_name, helper_driver_allowance, helper_driver_food_cost, helper_driver_excess_mission_days, helper_driver_excess_mission_cost, helper_driver_excess_kilometers,
          food_cost, fuel_cost, tour_cost, total_cost,
          notes, queue_type, calculation_date, vehicle_code, vehicle_plate, destinations, multi_unload_count, advance_payment, 
          depot_total_mileage, depot_shipment_count, depot_cargo_handling_cost, depot_mission_days, depot_kilometer_rate, depot_food_cost, depot_mission_cost, depot_rows,
          created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14, $15::INTEGER, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47)
      `, [
        id,
        driverId,
        announcementId,
        billOfLadingNumber || null,
        billOfLadingDate || null,
        parseNumber(billOfLadingCost, 0),
        approvedKilometers || null,
        excessKilometers || 0,
        approvedMissionDays || null,
        excessMissionDays || 0,
        validatedTollCost,
        parseNumber(returnCargoCost, 0),
        parseNumber(returnBillOfLadingCost, 0),
        parseNumber(multiUnloadCost, 0),
        parseNumber(excessMissionCost || 0, 0), // اطمینان از اینکه undefined نباشد
        parseNumber(helperDriverCost, 0),
        parseNumber(fixedAllowance, 0),
        helperDriverId || null,
        helperDriverEmployeeId || null,
        helperDriverName || null,
        parseNumber(helperDriverAllowance, 0),
        parseNumber(helperDriverFoodCost, 0),
        parseNumber(helperDriverExcessMissionDays, 0),
        parseNumber(helperDriverExcessMissionCost, 0),
        parseNumber(helperDriverExcessKilometers, 0),
        validatedFoodCost,
        validatedFuelCost,
        validatedTourCost,
        validatedTotalCost,
        notes || null,
        queueType || null,
        calculationDate || null,
        vehicleCode || null,
        vehiclePlate || null,
        (destinations ? String(destinations) : null),
        parseNumber(multiUnloadCount, 0),
        parseNumber(advancePayment, 0),
        parseNumber(depotTotalMileage, 0),
        parseNumber(depotShipmentCount, 0),
        parseNumber(depotCargoHandlingCost, 0),
        parseNumber(depotMissionDays, 0),
        parseNumber(depotKilometerRate, 0),
        parseNumber(depotFoodCost, 0),
        parseNumber(depotMissionCost, 0),
        depotRows ? JSON.stringify(depotRows) : null,
        userId || null, // created_by
        userId || null, // updated_by
      ]);

      console.log('✅ [saveDriverCalculation] اطلاعات جدید ثبت شد:', id);
      return res.status(201).json({ 
        message: 'اطلاعات محاسباتی ثبت شد.',
        id 
      });
    }
  } catch (error) {
    console.error('❌ [saveDriverCalculation] Error:', error);
    console.error('❌ [saveDriverCalculation] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    res.status(500).json({ 
      message: 'خطا در ذخیره اطلاعات محاسباتی.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * دریافت محاسبات یک راننده
 */
async function getDriverCalculations(req, res) {
  try {
    // بررسی و اضافه کردن ستون‌های مورد نیاز اگر وجود ندارند
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'driver_calculations' 
        AND column_name IN ('bill_of_lading_date', 'is_paid')
      `);
      
      const existingColumns = columnCheck.rows.map(r => r.column_name);
      
      if (!existingColumns.includes('bill_of_lading_date')) {
        await pool.query(`ALTER TABLE driver_calculations ADD COLUMN bill_of_lading_date VARCHAR(10)`);
        console.log('✅ [getDriverCalculations] ستون bill_of_lading_date اضافه شد');
      }
      
      if (!existingColumns.includes('is_paid')) {
        await pool.query(`ALTER TABLE driver_calculations ADD COLUMN is_paid BOOLEAN DEFAULT FALSE`);
        console.log('✅ [getDriverCalculations] ستون is_paid اضافه شد');
      }
    } catch (alterError) {
      console.error('⚠️ [getDriverCalculations] خطا در بررسی/اضافه کردن ستون‌ها:', alterError);
    }

    const { driverId, startDate, endDate } = req.query;

    let query = `
      SELECT dc.*, 
             fa.announcement_code,
             fa.loading_date,
             fa.line_type,
             fa.vehicle_type,
             COALESCE(
               NULLIF(dc.bill_of_lading_date, ''),
               (SELECT TO_CHAR(transaction_date, 'YYYY/MM/DD') FROM freight_transactions WHERE announcement_id = dc.announcement_id ORDER BY created_at DESC LIMIT 1)
             ) as bill_of_lading_date,
             d.employee_id,
             d.name as driver_name
      FROM driver_calculations dc
      LEFT JOIN freight_announcements fa ON dc.announcement_id = fa.id
      LEFT JOIN drivers d ON dc.driver_id = d.id
      WHERE 1=1
        AND (dc.is_paid IS NULL OR dc.is_paid = FALSE)
    `;
    const params = [];
    let paramIndex = 1;

    if (driverId) {
      query += ` AND dc.driver_id = $${paramIndex++}`;
      params.push(driverId);
    }

    if (startDate) {
      query += ` AND fa.loading_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND fa.loading_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY dc.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('❌ [getDriverCalculations] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات محاسباتی.' });
  }
}

/**
 * دریافت محاسبات بر اساس بازه تاریخ صدور بارنامه
 */
async function getCalculationsByDateRange(req, res) {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'تاریخ شروع و پایان الزامی است.' });
    }

    console.log('📅 [getCalculationsByDateRange] بازه:', startDate, 'تا', endDate);

    // بررسی وجود ستون bill_of_lading_date
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'driver_calculations' 
        AND column_name = 'bill_of_lading_date'
      `);
      
      if (columnCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE driver_calculations ADD COLUMN bill_of_lading_date VARCHAR(10)`);
        console.log('✅ [getCalculationsByDateRange] ستون bill_of_lading_date اضافه شد');
      }
    } catch (alterError) {
      console.error('⚠️ [getCalculationsByDateRange] خطا در بررسی ستون:', alterError);
    }

    // دریافت محاسبات در بازه تاریخ صدور بارنامه
    const query = `
      SELECT dc.*, 
             fa.announcement_code,
             fa.loading_date,
             fa.line_type,
             fa.vehicle_type,
             d.employee_id,
             d.name as driver_name
      FROM driver_calculations dc
      LEFT JOIN freight_announcements fa ON dc.announcement_id = fa.id
      LEFT JOIN drivers d ON dc.driver_id = d.id
      WHERE dc.bill_of_lading_date IS NOT NULL 
        AND dc.bill_of_lading_date >= $1
        AND dc.bill_of_lading_date <= $2
      ORDER BY d.employee_id, dc.bill_of_lading_date
    `;

    const { rows } = await pool.query(query, [startDate, endDate]);
    
    console.log('✅ [getCalculationsByDateRange] یافت شد:', rows.length, 'رکورد');
    res.json(rows);
  } catch (error) {
    console.error('❌ [getCalculationsByDateRange] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات محاسباتی.' });
  }
}

module.exports = {
  saveDriverCalculation,
  getDriverCalculations,
  getCalculationsByDateRange,
};

