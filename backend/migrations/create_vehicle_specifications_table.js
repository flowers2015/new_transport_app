/**
 * Migration: ایجاد جدول مشخصات خودرو
 * این جدول برندها و مدل‌های خودرو با مشخصات فنی آن‌ها را ذخیره می‌کند
 */

const pool = require('../db');

async function createVehicleSpecificationsTable() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // بررسی وجود جدول و ستون vehicle_type
    const checkTable = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicle_specifications' AND column_name = 'vehicle_type'
    `);
    
    const hasVehicleType = checkTable.rows.length > 0;
    
    // ایجاد جدول مشخصات خودرو
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_specifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_category VARCHAR(100) NOT NULL,
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        tip VARCHAR(100),
        fuel_type VARCHAR(50),
        cylinder_count INTEGER,
        axle_count INTEGER,
        wheel_count INTEGER,
        capacity VARCHAR(50),
        engine_type VARCHAR(100),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // اضافه کردن constraint مناسب
    if (hasVehicleType) {
      // اگر vehicle_type وجود دارد، constraint جدید را اضافه می‌کنیم
      try {
        await client.query(`
          ALTER TABLE vehicle_specifications 
          DROP CONSTRAINT IF EXISTS vehicle_specifications_vehicle_category_brand_model_tip_key
        `);
        await client.query(`
          ALTER TABLE vehicle_specifications 
          ADD CONSTRAINT IF NOT EXISTS vehicle_specifications_unique 
          UNIQUE (vehicle_type, vehicle_category, brand, model, tip)
        `);
      } catch (e) {
        // اگر constraint قبلاً وجود دارد، خطا نده
        console.log('ℹ️  [createVehicleSpecificationsTable] Constraint may already exist');
      }
    } else {
      // اگر vehicle_type وجود ندارد، constraint قدیمی را اضافه می‌کنیم
      try {
        await client.query(`
          ALTER TABLE vehicle_specifications 
          ADD CONSTRAINT IF NOT EXISTS vehicle_specifications_vehicle_category_brand_model_tip_key
          UNIQUE (vehicle_category, brand, model, tip)
        `);
      } catch (e) {
        // اگر constraint قبلاً وجود دارد، خطا نده
        console.log('ℹ️  [createVehicleSpecificationsTable] Constraint may already exist');
      }
    }
    
    console.log('✅ جدول vehicle_specifications ایجاد شد');
    
    // درج داده‌های اولیه برای خودروهای سنگین
    const initialData = [
      // اسکانیا
      ['خودرو سنگین', 'اسکانیا', 'سری G', 'G380', 'گازوییلی', 6, 2, 6, '42 تن', 'دیزل توربو', 'کشنده اسکانیا سری G'],
      ['خودرو سنگین', 'اسکانیا', 'سری G', 'G400', 'گازوییلی', 6, 2, 6, '42 تن', 'دیزل توربو', 'کشنده اسکانیا سری G'],
      ['خودرو سنگین', 'اسکانیا', 'سری G', 'G410', 'گازوییلی', 6, 2, 6, '42 تن', 'دیزل توربو', 'کشنده اسکانیا سری G'],
      ['خودرو سنگین', 'اسکانیا', 'سری G', 'G460', 'گازوییلی', 6, 3, 10, '41 تن', 'دیزل توربو', 'کشنده اسکانیا سری G'],
      ['خودرو سنگین', 'اسکانیا', 'سری P', 'P340', 'گازوییلی', 6, 2, 6, '19.5 تن', 'دیزل توربو', 'کامیون اسکانیا 10 چرخ'],
      ['خودرو سنگین', 'اسکانیا', 'سری R', 'R420', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده اسکانیا سری R'],
      ['خودرو سنگین', 'اسکانیا', 'سری R', 'R440', 'گازوییلی', 6, 2, 6, '42 تن', 'دیزل توربو', 'کشنده اسکانیا سری R'],
      ['خودرو سنگین', 'اسکانیا', 'سری R', 'R450', 'گازوییلی', 6, 2, 6, '42 تن', 'دیزل توربو', 'کشنده اسکانیا سری R'],
      ['خودرو سنگین', 'اسکانیا', 'سری R', 'R460', 'گازوییلی', 6, 2, 6, '42 تن', 'دیزل توربو', 'کشنده اسکانیا سری R'],
      ['خودرو سنگین', 'اسکانیا', 'سری R', 'R560 (V8)', 'گازوییلی', 8, 2, 6, '42 تن', 'دیزل V8', 'کشنده اسکانیا V8'],
      ['خودرو سنگین', 'اسکانیا', 'سری S', 'S500', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده اسکانیا سری S'],
      
      // ولوو
      ['خودرو سنگین', 'ولوو', 'FH', 'FH420', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده ولوو FH'],
      ['خودرو سنگین', 'ولوو', 'FH', 'FH460', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده ولوو FH'],
      ['خودرو سنگین', 'ولوو', 'FH', 'FH500', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده ولوو FH'],
      ['خودرو سنگین', 'ولوو', 'FM', 'FM330', 'گازوییلی', 6, 2, 6, '26 تن', 'دیزل توربو', 'کامیون ولوو FM'],
      ['خودرو سنگین', 'ولوو', 'FM', 'FM370', 'گازوییلی', 6, 2, 6, '26 تن', 'دیزل توربو', 'کامیون ولوو FM'],
      ['خودرو سنگین', 'ولوو', 'FMX', 'FMX460', 'گازوییلی', 6, 4, 10, '32 تن', 'دیزل توربو', 'کامیون ولوو FMX'],
      
      // بنز
      ['خودرو سنگین', 'بنز', 'آکتروس', '1844', 'گازوییلی', 6, 2, 6, '40 تن', 'دیزل توربو', 'کشنده بنز آکتروس'],
      ['خودرو سنگین', 'بنز', 'آکتروس', '1848', 'گازوییلی', 6, 2, 6, '40 تن', 'دیزل توربو', 'کشنده بنز آکتروس'],
      ['خودرو سنگین', 'بنز', 'آکسور', '1843', 'گازوییلی', 6, 2, 6, '40 تن', 'دیزل توربو', 'کشنده بنز آکسور'],
      ['خودرو سنگین', 'بنز', 'اتکو', '2628', 'گازوییلی', 6, 3, 10, '30 تن', 'دیزل توربو', 'کامیون بنز اتکو'],
      
      // مان
      ['خودرو سنگین', 'مان', 'TGX', '18.440', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده مان TGX'],
      ['خودرو سنگین', 'مان', 'TGX', '18.480', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده مان TGX'],
      ['خودرو سنگین', 'مان', 'TGS', '18.400', 'گازوییلی', 6, 2, 6, '40 تن', 'دیزل توربو', 'کشنده مان TGS'],
      
      // رنو
      ['خودرو سنگین', 'رنو', 'سری T', 'T460', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده رنو T'],
      ['خودرو سنگین', 'رنو', 'سری T', 'T480', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده رنو T'],
      ['خودرو سنگین', 'رنو', 'سری K', 'K480', 'گازوییلی', 6, 2, 6, '19 تن', 'دیزل توربو', 'کامیون رنو K'],
      ['خودرو سنگین', 'رنو', 'پریمیوم', '440', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده رنو پریمیوم'],
      
      // داف
      ['خودرو سنگین', 'داف', 'XF', 'XF105', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده داف XF'],
      ['خودرو سنگین', 'داف', 'XF', 'XF480', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده داف XF'],
      ['خودرو سنگین', 'داف', 'CF', 'CF400', 'گازوییلی', 6, 2, 6, '40 تن', 'دیزل توربو', 'کامیون داف CF'],
      
      // C&C
      ['خودرو سنگین', 'C&C', 'سری U', 'U480', 'گازوییلی', 6, 2, 6, '44 تن', 'دیزل توربو', 'کشنده C&C'],
      ['خودرو سنگین', 'C&C', 'سری U', 'U420', 'گازوییلی', 6, 3, 10, '26 تن', 'دیزل توربو', 'کامیون C&C باری'],
      
      // خاور
      ['خودرو سنگین', 'خاور', '813', '813', 'گازوییلی', 6, 2, 6, '8 تن', 'دیزل', 'کامیون خاور کلاسیک'],
      ['خودرو سنگین', 'خاور', '608', '608', 'گازوییلی', 4, 2, 4, '6 تن', 'دیزل', 'کامیون خاور کوچک'],
      
      // خودروهای نیمه سنگین
      ['خودرو نیمه سنگین', 'ایسوزو', '5 تن', 'NKR', 'گازوییلی', 4, 2, 4, '5 تن', 'دیزل', 'کامیونت ایسوزو'],
      ['خودرو نیمه سنگین', 'ایسوزو', '5 تن', 'NKR77', 'گازوییلی', 4, 2, 4, '5 تن', 'دیزل', 'کامیونت ایسوزو'],
      ['خودرو نیمه سنگین', 'ایسوزو', '6 تن', 'NPR70', 'گازوییلی', 4, 2, 6, '6 تن', 'دیزل', 'کامیونت ایسوزو'],
      ['خودرو نیمه سنگین', 'ایسوزو', '6 تن', 'NPR75', 'گازوییلی', 4, 2, 6, '6 تن', 'دیزل', 'کامیونت ایسوزو'],
      ['خودرو نیمه سنگین', 'ایسوزو', '8 تن', 'NQR', 'گازوییلی', 4, 2, 6, '8 تن', 'دیزل', 'کامیونت ایسوزو'],
      ['خودرو نیمه سنگین', 'فوسو', '5 تن', 'FK', 'گازوییلی', 4, 2, 4, '5 تن', 'دیزل', 'کامیونت فوسو'],
      ['خودرو نیمه سنگین', 'فوسو', '6 تن', 'FK بلند', 'گازوییلی', 4, 2, 6, '6 تن', 'دیزل', 'کامیونت فوسو'],
      ['خودرو نیمه سنگین', 'هیوندای', 'HD', 'HD65', 'گازوییلی', 4, 2, 4, '5 تن', 'دیزل', 'کامیونت هیوندای'],
      ['خودرو نیمه سنگین', 'هیوندای', 'HD', 'HD78', 'گازوییلی', 4, 2, 6, '8 تن', 'دیزل', 'کامیونت هیوندای'],
    ];
    
    // بررسی وجود ستون vehicle_type (از بررسی قبلی استفاده می‌کنیم)
    // hasVehicleType از بالا در دسترس است
    
    for (const row of initialData) {
      // اگر vehicle_type وجود دارد، باید آن را هم در INSERT و ON CONFLICT اضافه کنیم
      if (hasVehicleType) {
        // تعیین vehicle_type بر اساس tip و description
        const [category, brand, model, tip, fuelType, cylinderCount, axleCount, wheelCount, capacity, engineType, description] = row;
        let vehicleType = 'کشنده'; // مقدار پیش‌فرض
        
        // تشخیص نوع خودرو بر اساس tip و description
        if (tip && (tip.includes('P') || tip.includes('FM') || tip.includes('FMX') || tip.includes('اتکو') || tip.includes('K') || wheelCount === 10)) {
          vehicleType = 'ده چرخ';
        } else if (description && (description.includes('ده چرخ') || description.includes('کامیون'))) {
          vehicleType = 'ده چرخ';
        } else if (category === 'خودرو نیمه سنگین') {
          vehicleType = 'کامیونت';
        } else if (brand === 'خاور') {
          vehicleType = 'کامیون';
        }
        
        // استفاده از constraint جدید که شامل vehicle_type است
        await client.query(`
          INSERT INTO vehicle_specifications 
          (vehicle_type, vehicle_category, brand, model, tip, fuel_type, cylinder_count, axle_count, wheel_count, capacity, engine_type, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (vehicle_type, vehicle_category, brand, model, tip) DO NOTHING
        `, [vehicleType, category, brand, model, tip, fuelType, cylinderCount, axleCount, wheelCount, capacity, engineType, description]);
      } else {
        // استفاده از constraint قدیمی (بدون vehicle_type)
        await client.query(`
          INSERT INTO vehicle_specifications 
          (vehicle_category, brand, model, tip, fuel_type, cylinder_count, axle_count, wheel_count, capacity, engine_type, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (vehicle_category, brand, model, tip) DO NOTHING
        `, row);
      }
    }
    
    console.log('✅ داده‌های اولیه مشخصات خودرو درج شد');
    
    await client.query('COMMIT');
    console.log('✅ Migration vehicle_specifications با موفقیت اجرا شد');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ خطا در ایجاد جدول vehicle_specifications:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = createVehicleSpecificationsTable;

