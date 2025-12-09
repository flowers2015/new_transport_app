/**
 * اسکریپت جامع برای تشخیص مشکلات عملکرد
 */

const { Pool } = require('pg');
require('dotenv').config();
const http = require('http');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkDatabase() {
  console.log('📊 بررسی دیتابیس...\n');
  
  try {
    // تعداد رکوردها
    // بررسی وجود ستون is_deleted
    const vehiclesTableCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicles' AND column_name = 'is_deleted'
    `);
    const hasIsDeleted = vehiclesTableCheck.rows.length > 0;
    
    const [driversCount, vehiclesCount, personalDriversCount, personalVehiclesCount] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM drivers WHERE is_deleted = false'),
      pool.query(hasIsDeleted 
        ? 'SELECT COUNT(*) as count FROM vehicles WHERE is_deleted = false'
        : 'SELECT COUNT(*) as count FROM vehicles'),
      pool.query('SELECT COUNT(*) as count FROM personal_drivers'),
      pool.query('SELECT COUNT(*) as count FROM personal_vehicles'),
    ]);

    console.log('📈 تعداد رکوردها:');
    console.log(`   - drivers: ${parseInt(driversCount.rows[0].count).toLocaleString()}`);
    console.log(`   - vehicles: ${parseInt(vehiclesCount.rows[0].count).toLocaleString()}`);
    console.log(`   - personal_drivers: ${parseInt(personalDriversCount.rows[0].count).toLocaleString()}`);
    console.log(`   - personal_vehicles: ${parseInt(personalVehiclesCount.rows[0].count).toLocaleString()}\n`);

    // حجم تقریبی داده‌ها
    const [driversData, vehiclesData, personalDriversData, personalVehiclesData] = await Promise.all([
      pool.query(`
        SELECT 
          id, employee_id, name, national_id, mobile,
          license_number, license_type,
          current_vehicle_type, current_vehicle_plate
        FROM drivers 
        WHERE is_deleted = false 
        ORDER BY name
        LIMIT 1000
      `),
      pool.query(hasIsDeleted
        ? `
          SELECT 
            id, plate_part1, plate_letter, plate_part2, plate_city_code,
            serial_number, model, type, vehicle_category, vehicle_code
          FROM vehicles 
          WHERE is_deleted = false
          ORDER BY created_at DESC
          LIMIT 1000
        `
        : `
          SELECT 
            id, plate_part1, plate_letter, plate_part2, plate_city_code,
            serial_number, model, type, vehicle_category, vehicle_code
          FROM vehicles 
          ORDER BY created_at DESC
          LIMIT 1000
        `),
      pool.query(`
        SELECT 
          id, national_id, name, mobile, driver_smart_id
        FROM personal_drivers 
        ORDER BY name ASC
        LIMIT 1000
      `),
      pool.query(`
        SELECT 
          id, truck_smart_id, plate_part1, plate_letter, plate_part2,
          plate_city_code, vehicle_type, vehicle_usage
        FROM personal_vehicles 
        ORDER BY plate_part1 ASC, plate_part2 ASC
        LIMIT 1000
      `),
    ]);

    // محاسبه حجم تقریبی
    const driversSize = JSON.stringify(driversData.rows).length;
    const vehiclesSize = JSON.stringify(vehiclesData.rows).length;
    const personalDriversSize = JSON.stringify(personalDriversData.rows).length;
    const personalVehiclesSize = JSON.stringify(personalVehiclesData.rows).length;

    // تخمین حجم کل (اگر همه رکوردها را بگیریم)
    const totalDrivers = parseInt(driversCount.rows[0].count);
    const totalVehicles = parseInt(vehiclesCount.rows[0].count);
    const totalPersonalDrivers = parseInt(personalDriversCount.rows[0].count);
    const totalPersonalVehicles = parseInt(personalVehiclesCount.rows[0].count);

    const estimatedDriversSize = totalDrivers > 1000 ? (driversSize * totalDrivers / 1000) : driversSize;
    const estimatedVehiclesSize = totalVehicles > 1000 ? (vehiclesSize * totalVehicles / 1000) : vehiclesSize;
    const estimatedPersonalDriversSize = totalPersonalDrivers > 1000 ? (personalDriversSize * totalPersonalDrivers / 1000) : personalDriversSize;
    const estimatedPersonalVehiclesSize = totalPersonalVehicles > 1000 ? (personalVehiclesSize * totalPersonalVehicles / 1000) : personalVehiclesSize;

    const totalSize = estimatedDriversSize + estimatedVehiclesSize + estimatedPersonalDriversSize + estimatedPersonalVehiclesSize;

    console.log('📦 حجم تقریبی داده‌ها (بدون compression):');
    console.log(`   - drivers: ${(estimatedDriversSize / 1024).toFixed(2)} KB (${totalDrivers.toLocaleString()} رکورد)`);
    console.log(`   - vehicles: ${(estimatedVehiclesSize / 1024).toFixed(2)} KB (${totalVehicles.toLocaleString()} رکورد)`);
    console.log(`   - personal_drivers: ${(estimatedPersonalDriversSize / 1024).toFixed(2)} KB (${totalPersonalDrivers.toLocaleString()} رکورد)`);
    console.log(`   - personal_vehicles: ${(estimatedPersonalVehiclesSize / 1024).toFixed(2)} KB (${totalPersonalVehicles.toLocaleString()} رکورد)`);
    console.log(`   - مجموع: ${(totalSize / 1024).toFixed(2)} KB (${(totalSize / 1024 / 1024).toFixed(2)} MB)\n`);

    // حجم با compression (تقریبی - 70% کاهش)
    const compressedSize = totalSize * 0.3;
    console.log('📦 حجم تقریبی با compression (70% کاهش):');
    console.log(`   - مجموع: ${(compressedSize / 1024).toFixed(2)} KB (${(compressedSize / 1024 / 1024).toFixed(2)} MB)\n`);

    // هشدارها
    if (totalPersonalDrivers > 1000) {
      console.log('⚠️  تعداد personal_drivers بیشتر از 1000 است!');
      console.log('   پیشنهاد: اضافه کردن Pagination\n');
    }

    if (totalPersonalVehicles > 1000) {
      console.log('⚠️  تعداد personal_vehicles بیشتر از 1000 است!');
      console.log('   پیشنهاد: اضافه کردن Pagination\n');
    }

    if (totalSize > 2 * 1024 * 1024) { // بیشتر از 2 MB
      console.log('⚠️  حجم کل داده‌ها بیشتر از 2 MB است!');
      console.log('   پیشنهاد: اضافه کردن Pagination یا Lazy Loading\n');
    }

  } catch (error) {
    console.error('❌ خطا در بررسی دیتابیس:', error);
  }
}

async function checkBackendCompression() {
  console.log('🔍 بررسی Compression در Backend...\n');
  
  // تست با endpoint عمومی که نیاز به authentication ندارد
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: '/api/v1/health', // یا هر endpoint عمومی
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate',
      }
    };

    const req = http.request(options, (res) => {
      const encoding = res.headers['content-encoding'];
      const contentLength = res.headers['content-length'];
      const vary = res.headers['vary'];
      
      console.log('📡 Response Headers:');
      console.log(`   - Content-Encoding: ${encoding || 'none'}`);
      console.log(`   - Vary: ${vary || 'none'}`);
      console.log(`   - Content-Length: ${contentLength ? (parseInt(contentLength) / 1024).toFixed(2) + ' KB' : 'unknown'}`);
      console.log(`   - Status: ${res.statusCode}\n`);

      if (encoding === 'gzip') {
        console.log('✅ Compression فعال است!\n');
      } else if (res.statusCode === 404 || res.statusCode === 401) {
        console.log('⚠️  Endpoint نیاز به authentication دارد یا وجود ندارد.');
        console.log('   اما می‌توانیم از Vary header بررسی کنیم:\n');
        if (vary && vary.includes('Accept-Encoding')) {
          console.log('✅ Compression پیکربندی شده است (Vary: Accept-Encoding موجود است)');
          console.log('   اما ممکن است برای این endpoint خاص کار نکند.\n');
        } else {
          console.log('❌ Compression پیکربندی نشده است (Vary: Accept-Encoding موجود نیست)\n');
        }
      } else {
        console.log('❌ Compression فعال نیست!\n');
        console.log('   بررسی کنید:');
        console.log('   1. آیا compression middleware در server.js اضافه شده است؟');
        console.log('   2. آیا compression package نصب شده است？');
        console.log('   3. آیا backend restart شده است？\n');
      }

      resolve();
    });

    req.on('error', (error) => {
      console.error('❌ خطا در بررسی compression:', error.message);
      console.log('   ⚠️  Backend ممکن است در حال اجرا نباشد\n');
      resolve();
    });

    req.setTimeout(5000, () => {
      console.log('⏱️  Timeout در بررسی compression\n');
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 تشخیص مشکلات عملکرد');
  console.log('═══════════════════════════════════════════════════════════\n');

  await checkDatabase();
  await checkBackendCompression();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ بررسی کامل شد!');
  console.log('═══════════════════════════════════════════════════════════\n');

  await pool.end();
}

main().catch(console.error);

