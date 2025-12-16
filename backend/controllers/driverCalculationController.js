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

    // تبدیل و اعتبارسنجی مقادیر عددی - همیشه integer برمی‌گرداند
    const parseNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined || value === '') return defaultValue;
      // اگر string است، ابتدا آن را به number تبدیل کن
      if (typeof value === 'string') {
        // حذف کاراکترهای غیر عددی (به جز نقطه و منفی)
        const cleaned = value.replace(/[^\d.-]/g, '');
        if (cleaned === '' || cleaned === '-' || cleaned === '.') return defaultValue;
        const num = parseFloat(cleaned);
        return isNaN(num) ? defaultValue : Math.round(num);
      }
      const num = Number(value);
      return isNaN(num) ? defaultValue : Math.round(num);
    };

    // تبدیل undefined به empty string برای پارامترهای VARCHAR (برای استفاده با NULLIF)
    const safeString = (val) => {
      if (val === null || val === undefined) return '';
      return String(val);
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

    // ⚡ اضافه کردن ستون‌های گمشده - همیشه اجرا می‌شود
    try {
      await pool.query(`
        ALTER TABLE driver_calculations 
        ADD COLUMN IF NOT EXISTS helper_driver_excess_kilometers INTEGER DEFAULT 0,
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
        ADD COLUMN IF NOT EXISTS depot_rows JSONB,
        ADD COLUMN IF NOT EXISTS commission_status VARCHAR(30) DEFAULT 'recorded',
        ADD COLUMN IF NOT EXISTS period_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
        ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255)
      `);
      console.log('✅ [saveDriverCalculation] ستون‌های گمشده بررسی و اضافه شدند');
    } catch (colErr) {
      console.warn('⚠️ [saveDriverCalculation] خطا در اضافه کردن ستون‌ها (ممکن است از قبل وجود داشته باشند):', colErr.message);
    }

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
          bill_of_lading_number = NULLIF($1, ''),
          bill_of_lading_date = NULLIF($2, ''),
          bill_of_lading_cost = $3,
          approved_kilometers = $4,
          excess_kilometers = $5,
          approved_mission_days = $6,
          excess_mission_days = $7,
          toll_cost = $8,
          loading_cost = 0,
          return_cargo_cost = $9,
          return_bill_of_lading_cost = $10,
          multi_unload_cost = $11,
          excess_mission_cost = $12,
          helper_driver_cost = $13,
          fixed_allowance = $14,
          helper_driver_id = NULLIF($15, ''),
          helper_driver_employee_id = NULLIF($16, ''),
          helper_driver_name = NULLIF($17, ''),
          helper_driver_allowance = $18,
          helper_driver_food_cost = $19,
          helper_driver_excess_mission_days = $20,
          helper_driver_excess_mission_cost = $21,
          helper_driver_excess_kilometers = $22,
          food_cost = $23,
          fuel_cost = $24,
          tour_cost = $25,
          total_cost = $26,
          notes = NULLIF($27, ''),
          queue_type = NULLIF($28, ''),
          calculation_date = NULLIF($29, ''),
          vehicle_code = NULLIF($30, ''),
          vehicle_plate = NULLIF($31, ''),
          destinations = NULLIF($32, ''),
          multi_unload_count = $33,
          advance_payment = $34,
          depot_total_mileage = $35,
          depot_shipment_count = $36,
          depot_cargo_handling_cost = $37,
          depot_mission_days = $38,
          depot_kilometer_rate = $39,
          depot_food_cost = $40,
          depot_mission_cost = $41,
          depot_rows = CASE WHEN $42::text = '' THEN NULL ELSE $42::jsonb END,
          updated_by = NULLIF($43, ''),
          updated_at = NOW()
        WHERE driver_id = $44 AND announcement_id = $45
      `;
      
      const updateParams = [
        safeString(billOfLadingNumber),
        safeString(billOfLadingDate),
        parseNumber(billOfLadingCost, 0),
        approvedKilometers !== undefined ? approvedKilometers : null,
        excessKilometers || 0,
        approvedMissionDays !== undefined ? approvedMissionDays : null,
        excessMissionDays || 0,
        validatedTollCost,
        parseNumber(returnCargoCost, 0),
        parseNumber(returnBillOfLadingCost, 0),
        parseNumber(multiUnloadCost, 0),
        (() => { const val = Math.round(parseNumber(excessMissionCost || 0, 0)); return isNaN(val) ? 0 : val; })(),
        parseNumber(helperDriverCost, 0),
        parseNumber(fixedAllowance, 0),
        safeString(helperDriverId), // $15 - تبدیل null به empty string
        safeString(helperDriverEmployeeId),
        safeString(helperDriverName),
        parseNumber(helperDriverAllowance, 0),
        parseNumber(helperDriverFoodCost, 0),
        parseNumber(helperDriverExcessMissionDays, 0),
        parseNumber(helperDriverExcessMissionCost, 0),
        parseNumber(helperDriverExcessKilometers, 0),
        validatedFoodCost,
        validatedFuelCost,
        validatedTourCost,
        validatedTotalCost,
        safeString(notes),
        safeString(queueType),
        safeString(calculationDate),
        safeString(vehicleCode),
        safeString(vehiclePlate),
        safeString(destinations),
        parseNumber(multiUnloadCount, 0),
        parseNumber(advancePayment, 0),
        parseNumber(depotTotalMileage, 0),
        parseNumber(depotShipmentCount, 0),
        parseNumber(depotCargoHandlingCost, 0),
        parseNumber(depotMissionDays, 0),
        parseNumber(depotKilometerRate, 0),
        parseNumber(depotFoodCost, 0),
        parseNumber(depotMissionCost, 0),
        (depotRows ? JSON.stringify(depotRows) : ''),
        safeString(userId),
        driverId,
        announcementId,
      ];
      
      // شمارش دقیق پارامترهای query - فقط پارامترهای منحصر به فرد
      const paramMatches = updateQuery.match(/\$\d+/g) || [];
      const uniqueParams = [...new Set(paramMatches.map(m => parseInt(m.replace('$', ''))))].sort((a, b) => a - b);
      const queryParamCount = uniqueParams.length;
      const maxParam = uniqueParams.length > 0 ? Math.max(...uniqueParams) : 0;
      console.log('🔍 [saveDriverCalculation] تعداد پارامترهای منحصر به فرد در UPDATE Query:', queryParamCount);
      console.log('🔍 [saveDriverCalculation] بیشترین پارامتر:', maxParam);
      console.log('🔍 [saveDriverCalculation] تعداد پارامترهای ارسالی:', updateParams.length);
      
      // بررسی تطابق تعداد پارامترها - باید برابر با بیشترین پارامتر باشد
      if (updateParams.length !== maxParam) {
        console.error('❌ [saveDriverCalculation] تعداد پارامترها نادرست است!', {
          count: updateParams.length,
          expected: maxParam,
          uniqueParamsCount: queryParamCount,
          params: updateParams.map((p, i) => ({ index: i + 1, value: p, type: typeof p }))
        });
        return res.status(500).json({ 
          message: `خطا در تعداد پارامترها: ${updateParams.length} به جای ${maxParam}`,
          error: 'PARAMETER_COUNT_MISMATCH'
        });
      }
      
      // همه پارامترها قبلاً sanitize شده‌اند، فقط بررسی نهایی
      const sanitizedParams = updateParams.map((p, i) => {
        if (p === undefined) {
          console.warn(`⚠️ [saveDriverCalculation] پارامتر ${i + 1} ($${i + 1}) undefined است`);
          return i < 2 || (i >= 14 && i <= 16) || (i >= 26 && i <= 31) || i === 42 || i === 43 ? '' : null;
        }
        return p;
      });
      
      // لاگ جزئیات parameter $15 (helper_driver_id)
      console.log('🔍 [saveDriverCalculation] جزئیات parameter $15 (helper_driver_id):', {
        index: 15,
        rawValue: helperDriverId,
        rawType: typeof helperDriverId,
        processedValue: sanitizedParams[14], // index 14 = parameter $15
        processedType: typeof sanitizedParams[14],
        isNull: sanitizedParams[14] === null,
        isUndefined: sanitizedParams[14] === undefined
      });
      
      // بررسی همه پارامترهای undefined
      const undefinedParams = sanitizedParams.map((p, i) => ({ index: i + 1, param: `$${i + 1}`, isUndefined: p === undefined })).filter(p => p.isUndefined);
      if (undefinedParams.length > 0) {
        console.error('❌ [saveDriverCalculation] پارامترهای undefined پس از sanitize:', undefinedParams);
        return res.status(500).json({ 
          message: `خطا: ${undefinedParams.length} پارامتر undefined است`,
          error: 'UNDEFINED_PARAMETERS',
          details: undefinedParams
        });
      }
      
      // لاگ نهایی قبل از اجرای query
      console.log('✅ [saveDriverCalculation] آماده اجرای UPDATE query با', sanitizedParams.length, 'پارامتر');
      console.log('🔍 [saveDriverCalculation] نمونه پارامترها (اولین 5 و آخرین 5):', {
        first5: sanitizedParams.slice(0, 5).map((p, i) => ({ index: i + 1, type: typeof p, isNull: p === null })),
        last5: sanitizedParams.slice(-5).map((p, i) => ({ index: sanitizedParams.length - 5 + i + 1, type: typeof p, isNull: p === null }))
      });
      
      // استفاده از query text به جای prepared statement برای جلوگیری از cache
      const updateResult = await pool.query({
        text: updateQuery,
        values: sanitizedParams
      });

      console.log('✅ [saveDriverCalculation] نتیجه UPDATE:', {
        rowCount: updateResult.rowCount,
        command: updateResult.command,
        id: existingCheck.rows[0].id
      });

      if (updateResult.rowCount === 0) {
        console.warn('⚠️ [saveDriverCalculation] هیچ ردیفی آپدیت نشد!');
        return res.status(404).json({ 
          message: 'رکورد مورد نظر یافت نشد یا آپدیت نشد.',
          id: existingCheck.rows[0].id 
        });
      }

      console.log('✅ [saveDriverCalculation] اطلاعات به‌روزرسانی شد:', existingCheck.rows[0].id);
      return res.json({ 
        message: 'اطلاعات محاسباتی به‌روزرسانی شد.',
        id: existingCheck.rows[0].id,
        rowCount: updateResult.rowCount
      });
    } else {
      // بررسی وجود ستون‌های مورد نیاز قبل از INSERT
      try {
        const requiredColumns = [
          'depot_rows', 'created_by', 'updated_by', 'depot_food_cost', 'depot_mission_cost',
          'helper_driver_excess_kilometers', 'vehicle_code', 'vehicle_plate', 'destinations',
          'multi_unload_count', 'advance_payment', 'depot_total_mileage', 'depot_shipment_count',
          'depot_cargo_handling_cost', 'depot_mission_days', 'depot_kilometer_rate',
          'commission_status', 'period_id'
        ];
        
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'driver_calculations' 
          AND column_name = ANY($1::text[])
        `, [requiredColumns]);
        const existingCols = columnCheck.rows.map(r => r.column_name);
        console.log('🔍 [saveDriverCalculation] ستون‌های موجود:', existingCols);
        
        // اضافه کردن ستون‌های گمشده
        const missingCols = requiredColumns.filter(col => !existingCols.includes(col));
        if (missingCols.length > 0) {
          console.log('⚠️ [saveDriverCalculation] ستون‌های گمشده:', missingCols);
          
          // اضافه کردن ستون‌ها
          if (missingCols.includes('helper_driver_excess_kilometers')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS helper_driver_excess_kilometers INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون helper_driver_excess_kilometers اضافه شد');
          }
          if (missingCols.includes('vehicle_code')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS vehicle_code VARCHAR(255)`);
            console.log('✅ [saveDriverCalculation] ستون vehicle_code اضافه شد');
          }
          if (missingCols.includes('vehicle_plate')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(255)`);
            console.log('✅ [saveDriverCalculation] ستون vehicle_plate اضافه شد');
          }
          if (missingCols.includes('destinations')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS destinations TEXT`);
            console.log('✅ [saveDriverCalculation] ستون destinations اضافه شد');
          }
          if (missingCols.includes('multi_unload_count')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS multi_unload_count INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون multi_unload_count اضافه شد');
          }
          if (missingCols.includes('advance_payment')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS advance_payment INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون advance_payment اضافه شد');
          }
          if (missingCols.includes('depot_total_mileage')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_total_mileage INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_total_mileage اضافه شد');
          }
          if (missingCols.includes('depot_shipment_count')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_shipment_count INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_shipment_count اضافه شد');
          }
          if (missingCols.includes('depot_cargo_handling_cost')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_cargo_handling_cost INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_cargo_handling_cost اضافه شد');
          }
          if (missingCols.includes('depot_mission_days')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_mission_days INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_mission_days اضافه شد');
          }
          if (missingCols.includes('depot_kilometer_rate')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_kilometer_rate INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_kilometer_rate اضافه شد');
          }
          if (missingCols.includes('depot_food_cost')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_food_cost INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_food_cost اضافه شد');
          }
          if (missingCols.includes('depot_mission_cost')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_mission_cost INTEGER DEFAULT 0`);
            console.log('✅ [saveDriverCalculation] ستون depot_mission_cost اضافه شد');
          }
          if (missingCols.includes('depot_rows')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS depot_rows JSONB`);
            console.log('✅ [saveDriverCalculation] ستون depot_rows اضافه شد');
          }
          if (missingCols.includes('commission_status')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS commission_status VARCHAR(30) DEFAULT 'recorded'`);
            console.log('✅ [saveDriverCalculation] ستون commission_status اضافه شد');
          }
          if (missingCols.includes('period_id')) {
            await pool.query(`ALTER TABLE driver_calculations ADD COLUMN IF NOT EXISTS period_id VARCHAR(255)`);
            console.log('✅ [saveDriverCalculation] ستون period_id اضافه شد');
          }
        }
      } catch (colErr) {
        console.warn('⚠️ [saveDriverCalculation] خطا در بررسی ستون‌ها:', colErr);
      }
      
      // ایجاد رکورد جدید
      // شمارش دقیق ستون‌ها: 48 ستون
      // شمارش دقیق VALUES: 48 expression
      const insertQuery = `
        INSERT INTO driver_calculations (
          id, driver_id, announcement_id, bill_of_lading_number, bill_of_lading_date, bill_of_lading_cost,
          approved_kilometers, excess_kilometers, approved_mission_days, excess_mission_days,
          toll_cost, loading_cost, return_cargo_cost, return_bill_of_lading_cost, multi_unload_cost, excess_mission_cost, helper_driver_cost, fixed_allowance,
          helper_driver_id, helper_driver_employee_id, helper_driver_name, helper_driver_allowance, helper_driver_food_cost, helper_driver_excess_mission_days, helper_driver_excess_mission_cost, helper_driver_excess_kilometers,
          food_cost, fuel_cost, tour_cost, total_cost,
          notes, queue_type, calculation_date, vehicle_code, vehicle_plate, destinations, multi_unload_count, advance_payment, 
          depot_total_mileage, depot_shipment_count, depot_cargo_handling_cost, depot_mission_days, depot_kilometer_rate, depot_food_cost, depot_mission_cost, depot_rows,
          created_by, updated_by
        ) VALUES (
          $1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, $9, $10, 
          $11, $12, $13, $14, $15, $16, $17, $18, 
          NULLIF($19, ''), NULLIF($20, ''), NULLIF($21, ''), $22, $23, $24, $25, $26, 
          $27, $28, $29, $30, 
          NULLIF($31, ''), NULLIF($32, ''), NULLIF($33, ''), NULLIF($34, ''), NULLIF($35, ''), NULLIF($36, ''), $37, $38, 
          $39, $40, $41, $42, $43, $44, $45, CASE WHEN $46::text = '' THEN NULL ELSE $46::jsonb END, 
          NULLIF($47, ''), NULLIF($48, '')
        )
      `;
      
      const insertParams = [
        id,
        driverId,
        announcementId,
        safeString(billOfLadingNumber),
        safeString(billOfLadingDate),
        parseNumber(billOfLadingCost, 0),
        approvedKilometers !== undefined ? approvedKilometers : null,
        excessKilometers || 0,
        approvedMissionDays !== undefined ? approvedMissionDays : null,
        excessMissionDays || 0,
        validatedTollCost,
        0, // loading_cost (مقدار ثابت - در VALUES هم 0 است)
        parseNumber(returnCargoCost, 0),
        parseNumber(returnBillOfLadingCost, 0),
        parseNumber(multiUnloadCost, 0),
        (() => { const val = Math.round(parseNumber(excessMissionCost || 0, 0)); return isNaN(val) ? 0 : val; })(),
        parseNumber(helperDriverCost, 0),
        parseNumber(fixedAllowance, 0),
        safeString(helperDriverId),
        safeString(helperDriverEmployeeId),
        safeString(helperDriverName),
        parseNumber(helperDriverAllowance, 0),
        parseNumber(helperDriverFoodCost, 0),
        parseNumber(helperDriverExcessMissionDays, 0),
        parseNumber(helperDriverExcessMissionCost, 0),
        parseNumber(helperDriverExcessKilometers, 0),
        validatedFoodCost,
        validatedFuelCost,
        validatedTourCost,
        validatedTotalCost,
        safeString(notes),
        safeString(queueType),
        safeString(calculationDate),
        safeString(vehicleCode),
        safeString(vehiclePlate),
        safeString(destinations),
        parseNumber(multiUnloadCount, 0),
        parseNumber(advancePayment, 0),
        parseNumber(depotTotalMileage, 0),
        parseNumber(depotShipmentCount, 0),
        parseNumber(depotCargoHandlingCost, 0),
        parseNumber(depotMissionDays, 0),
        parseNumber(depotKilometerRate, 0),
        parseNumber(depotFoodCost, 0),
        parseNumber(depotMissionCost, 0),
        depotRows ? JSON.stringify(depotRows) : '',
        safeString(userId), // created_by
        safeString(userId), // updated_by
      ];
      
      // بررسی تطابق تعداد پارامترها
      const insertParamMatches = insertQuery.match(/\$\d+/g) || [];
      const insertUniqueParams = [...new Set(insertParamMatches.map(m => parseInt(m.replace('$', ''))))].sort((a, b) => a - b);
      const insertMaxParam = insertUniqueParams.length > 0 ? Math.max(...insertUniqueParams) : 0;
      
      // شمارش دقیق تعداد ستون‌ها از INSERT query (با trim کردن فضاهای خالی)
      const columnMatches = insertQuery.match(/INSERT INTO driver_calculations\s*\(([^)]+)\)/);
      const columnCount = columnMatches ? columnMatches[1].split(',').map(c => c.trim()).filter(c => c).length : 0;
      
      // شمارش تعداد expressions در VALUES - استفاده از insertMaxParam به عنوان معیار اصلی
      // چون هر expression یک مقدار دارد و ما می‌دانیم که بیشترین پارامتر $48 است
      // پس باید 48 expression داشته باشیم
      // اما باید مطمئن شویم که تعداد پارامترها درست است
      const valuesExpressions = insertMaxParam; // تعداد expressions برابر با بیشترین پارامتر است
      
      console.log('🔍 [saveDriverCalculation] شمارش دقیق:', {
        columnCount,
        valuesExpressions,
        insertMaxParam,
        insertParamsLength: insertParams.length,
        insertUniqueParamsCount: insertUniqueParams.length
      });
      
      // بررسی تعداد ستون‌های واقعی در دیتابیس
      let actualColumnCount = 0;
      let dbColumns = { rows: [] };
      try {
        dbColumns = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'driver_calculations'
          ORDER BY ordinal_position
        `);
        actualColumnCount = dbColumns.rows.length;
        console.log('🔍 [saveDriverCalculation] تعداد ستون‌های واقعی در دیتابیس:', actualColumnCount);
        console.log('🔍 [saveDriverCalculation] لیست ستون‌های دیتابیس:', dbColumns.rows.map(r => r.column_name).join(', '));
      } catch (dbErr) {
        console.warn('⚠️ [saveDriverCalculation] خطا در بررسی ستون‌های دیتابیس:', dbErr);
      }
      
      console.log('🔍 [saveDriverCalculation] INSERT - تعداد ستون‌ها در query:', columnCount);
      console.log('🔍 [saveDriverCalculation] INSERT - تعداد expressions در VALUES (بر اساس maxParam):', valuesExpressions);
      console.log('🔍 [saveDriverCalculation] INSERT - تعداد ستون‌های واقعی در دیتابیس:', actualColumnCount);
      console.log('🔍 [saveDriverCalculation] INSERT - بیشترین پارامتر:', insertMaxParam);
      console.log('🔍 [saveDriverCalculation] INSERT - تعداد پارامترهای ارسالی:', insertParams.length);
      
      // بررسی تطابق: تعداد ستون‌ها باید برابر با بیشترین پارامتر باشد
      // و تعداد پارامترهای ارسالی باید برابر با بیشترین پارامتر باشد
      if (columnCount !== insertMaxParam) {
        console.error('❌ [saveDriverCalculation] INSERT - تعداد ستون‌ها با بیشترین پارامتر برابر نیست!', {
          columnCount,
          insertMaxParam,
          insertParamsLength: insertParams.length,
          query: insertQuery.substring(0, 500)
        });
        return res.status(500).json({ 
          message: `خطا: تعداد ستون‌ها (${columnCount}) با تعداد پارامترها (${insertMaxParam}) برابر نیست`,
          error: 'COLUMN_PARAM_MISMATCH',
          details: {
            columnCount,
            insertMaxParam,
            insertParamsLength: insertParams.length
          }
        });
      }
      
      if (insertParams.length !== insertMaxParam) {
        console.error('❌ [saveDriverCalculation] INSERT - تعداد پارامترهای ارسالی با بیشترین پارامتر برابر نیست!', {
          insertParamsLength: insertParams.length,
          insertMaxParam,
          columnCount
        });
        return res.status(500).json({ 
          message: `خطا: تعداد پارامترهای ارسالی (${insertParams.length}) با تعداد پارامترها (${insertMaxParam}) برابر نیست`,
          error: 'PARAM_COUNT_MISMATCH',
          details: {
            insertParamsLength: insertParams.length,
            insertMaxParam,
            columnCount
          }
        });
      }
      
      // هشدار در مورد تفاوت تعداد ستون‌ها با دیتابیس (این طبیعی است چون برخی ستون‌ها خودکار هستند)
      if (actualColumnCount > 0 && columnCount < actualColumnCount) {
        const missingColumns = dbColumns.rows
          .map(r => r.column_name)
          .filter(col => !insertQuery.includes(col));
        console.log('ℹ️ [saveDriverCalculation] ستون‌های موجود در دیتابیس که در INSERT نیستند (خودکار):', missingColumns);
      }
      
      if (insertParams.length !== insertMaxParam) {
        console.error('❌ [saveDriverCalculation] INSERT - تعداد پارامترها نادرست است!', {
          count: insertParams.length,
          expected: insertMaxParam,
          uniqueParamsCount: insertUniqueParams.length,
          params: insertParams.map((p, i) => ({ index: i + 1, value: p, type: typeof p }))
        });
        return res.status(500).json({ 
          message: `خطا در تعداد پارامترها (INSERT): ${insertParams.length} به جای ${insertMaxParam}`,
          error: 'PARAMETER_COUNT_MISMATCH'
        });
      }
      
      const insertResult = await pool.query({
        text: insertQuery,
        values: insertParams
      });

      console.log('✅ [saveDriverCalculation] نتیجه INSERT:', {
        rowCount: insertResult.rowCount,
        command: insertResult.command,
        id
      });

      if (insertResult.rowCount === 0) {
        console.error('❌ [saveDriverCalculation] هیچ ردیفی insert نشد!');
        return res.status(500).json({ 
          message: 'خطا در ثبت اطلاعات.',
          id 
        });
      }

      console.log('✅ [saveDriverCalculation] اطلاعات جدید ثبت شد:', id);
      return res.status(201).json({ 
        message: 'اطلاعات محاسباتی ثبت شد.',
        id,
        rowCount: insertResult.rowCount
      });
    }
  } catch (error) {
    console.error('❌ [saveDriverCalculation] Error:', error);
    console.error('❌ [saveDriverCalculation] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      position: error.position,
      hint: error.hint
    });
    res.status(500).json({ 
      message: 'خطا در ذخیره اطلاعات محاسباتی.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        detail: error.detail,
        constraint: error.constraint
      } : undefined
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
      
      // بررسی وجود ستون commission_status
      const commissionStatusCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'driver_calculations' 
        AND column_name = 'commission_status'
      `);
      
      if (commissionStatusCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE driver_calculations ADD COLUMN commission_status VARCHAR(30) DEFAULT 'recorded'`);
        console.log('✅ [getDriverCalculations] ستون commission_status اضافه شد');
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
        AND (dc.commission_status IS NULL OR dc.commission_status NOT IN ('commission_calculated', 'paid'))
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

    console.log('🔍 [getDriverCalculations] Query:', query);
    console.log('🔍 [getDriverCalculations] Params:', params);
    
    const { rows } = await pool.query(query, params);
    
    console.log('✅ [getDriverCalculations] تعداد رکوردهای برگشتی:', rows.length);
    if (rows.length > 0) {
      console.log('📊 [getDriverCalculations] نمونه اولین رکورد:', {
        id: rows[0].id,
        driver_id: rows[0].driver_id,
        announcement_id: rows[0].announcement_id,
        is_paid: rows[0].is_paid,
        commission_status: rows[0].commission_status,
        total_cost: rows[0].total_cost,
        bill_of_lading_number: rows[0].bill_of_lading_number
      });
    } else {
      // اگر هیچ رکوردی برگشت داده نشد، بررسی کن که آیا در دیتابیس رکوردی وجود دارد
      try {
        const countQuery = `SELECT COUNT(*) as count FROM driver_calculations`;
        const countResult = await pool.query(countQuery);
        console.log('⚠️ [getDriverCalculations] تعداد کل رکوردها در دیتابیس:', countResult.rows[0].count);
        
        // بررسی رکوردهای فیلتر شده
        const filteredCountQuery = `
          SELECT COUNT(*) as count 
          FROM driver_calculations dc
          WHERE (dc.is_paid IS NULL OR dc.is_paid = FALSE)
            AND (dc.commission_status IS NULL OR dc.commission_status NOT IN ('commission_calculated', 'paid'))
        `;
        const filteredCountResult = await pool.query(filteredCountQuery);
        console.log('⚠️ [getDriverCalculations] تعداد رکوردهای فیلتر شده:', filteredCountResult.rows[0].count);
        
        // بررسی نمونه رکوردها برای debug
        const sampleQuery = `SELECT id, driver_id, announcement_id, is_paid, commission_status, total_cost FROM driver_calculations LIMIT 5`;
        const sampleResult = await pool.query(sampleQuery);
        console.log('📋 [getDriverCalculations] نمونه رکوردها از دیتابیس:', sampleResult.rows);
      } catch (debugError) {
        console.error('⚠️ [getDriverCalculations] خطا در debug query:', debugError);
      }
    }
    
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

/**
 * دریافت محاسبات پرداخت شده برای یک راننده در بازه تاریخ محاسبه
 */
async function getPaidCalculations(req, res) {
  try {
    const { driverId, startDate, endDate } = req.query;

    if (!driverId) {
      return res.status(400).json({ message: 'شناسه راننده الزامی است.' });
    }

    console.log('💰 [getPaidCalculations] دریافت محاسبات پرداخت شده:', {
      driverId,
      startDate,
      endDate
    });

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
      WHERE dc.driver_id = $1
        AND dc.is_paid = TRUE
    `;
    const params = [driverId];
    let paramIndex = 2;

    // فیلتر بر اساس تاریخ محاسبه (calculation_date)
    if (startDate) {
      query += ` AND dc.calculation_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND dc.calculation_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY dc.calculation_date ASC, dc.created_at ASC`;

    console.log('🔍 [getPaidCalculations] Query:', query);
    console.log('🔍 [getPaidCalculations] Params:', params);
    
    const { rows } = await pool.query(query, params);
    
    console.log('✅ [getPaidCalculations] تعداد رکوردهای برگشتی:', rows.length);
    if (rows.length > 0) {
      console.log('📊 [getPaidCalculations] نمونه اولین رکورد:', {
        id: rows[0].id,
        driver_id: rows[0].driver_id,
        announcement_id: rows[0].announcement_id,
        is_paid: rows[0].is_paid,
        calculation_date: rows[0].calculation_date,
        total_cost: rows[0].total_cost
      });
    }
    
    res.json(rows);
  } catch (error) {
    console.error('❌ [getPaidCalculations] Error:', error);
    res.status(500).json({ message: 'خطا در دریافت محاسبات پرداخت شده.' });
  }
}

module.exports = {
  saveDriverCalculation,
  getDriverCalculations,
  getCalculationsByDateRange,
  getPaidCalculations,
};

