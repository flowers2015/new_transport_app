/**
 * اسکریپت برای بررسی حجم داده‌های personal-drivers و personal-vehicles
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkDataSize() {
  try {
    console.log('🔍 بررسی حجم داده‌ها...\n');

    // تعداد رکوردها
    const [driversCount, vehiclesCount, personalDriversCount, personalVehiclesCount] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM drivers WHERE is_deleted = false'),
      pool.query('SELECT COUNT(*) as count FROM vehicles'),
      pool.query('SELECT COUNT(*) as count FROM personal_drivers'),
      pool.query('SELECT COUNT(*) as count FROM personal_vehicles'),
    ]);

    console.log('📊 تعداد رکوردها:');
    console.log(`   - drivers: ${driversCount.rows[0].count}`);
    console.log(`   - vehicles: ${vehiclesCount.rows[0].count}`);
    console.log(`   - personal_drivers: ${personalDriversCount.rows[0].count}`);
    console.log(`   - personal_vehicles: ${personalVehiclesCount.rows[0].count}\n`);

    // حجم تقریبی داده‌ها (بدون compression)
    const [driversData, vehiclesData, personalDriversData, personalVehiclesData] = await Promise.all([
      pool.query(`
        SELECT 
          id, employee_id, name, mobile, national_id,
          license_number, license_type,
          current_vehicle_type, current_vehicle_plate
        FROM drivers 
        WHERE is_deleted = false 
        ORDER BY name
      `),
      pool.query(`
        SELECT 
          id, plate_part1, plate_letter, plate_part2, plate_city_code,
          serial_number, model, type, vehicle_category, brand
        FROM vehicles 
        ORDER BY created_at DESC
      `),
      pool.query(`
        SELECT 
          id, national_id, name, mobile, driver_smart_id
        FROM personal_drivers 
        ORDER BY name ASC
      `),
      pool.query(`
        SELECT 
          id, truck_smart_id, plate_part1, plate_letter, plate_part2,
          plate_city_code, vehicle_type, vehicle_usage
        FROM personal_vehicles 
        ORDER BY plate_part1 ASC, plate_part2 ASC
      `),
    ]);

    // محاسبه حجم تقریبی (JSON stringify)
    const driversSize = JSON.stringify(driversData.rows).length;
    const vehiclesSize = JSON.stringify(vehiclesData.rows).length;
    const personalDriversSize = JSON.stringify(personalDriversData.rows).length;
    const personalVehiclesSize = JSON.stringify(personalVehiclesData.rows).length;

    console.log('📦 حجم تقریبی داده‌ها (بدون compression):');
    console.log(`   - drivers: ${(driversSize / 1024).toFixed(2)} KB (${driversData.rows.length} رکورد)`);
    console.log(`   - vehicles: ${(vehiclesSize / 1024).toFixed(2)} KB (${vehiclesData.rows.length} رکورد)`);
    console.log(`   - personal_drivers: ${(personalDriversSize / 1024).toFixed(2)} KB (${personalDriversData.rows.length} رکورد)`);
    console.log(`   - personal_vehicles: ${(personalVehiclesSize / 1024).toFixed(2)} KB (${personalVehiclesData.rows.length} رکورد)`);
    console.log(`   - مجموع: ${((driversSize + vehiclesSize + personalDriversSize + personalVehiclesSize) / 1024).toFixed(2)} KB\n`);

    // حجم با compression (تقریبی - 70% کاهش)
    const compressedSize = (driversSize + vehiclesSize + personalDriversSize + personalVehiclesSize) * 0.3;
    console.log('📦 حجم تقریبی با compression (70% کاهش):');
    console.log(`   - مجموع: ${(compressedSize / 1024).toFixed(2)} KB\n`);

    // اگر تعداد رکوردها زیاد است، پیشنهاد pagination
    if (parseInt(personalDriversCount.rows[0].count) > 1000) {
      console.log('⚠️  تعداد personal_drivers بیشتر از 1000 است!');
      console.log('   پیشنهاد: اضافه کردن Pagination\n');
    }

    if (parseInt(personalVehiclesCount.rows[0].count) > 1000) {
      console.log('⚠️  تعداد personal_vehicles بیشتر از 1000 است!');
      console.log('   پیشنهاد: اضافه کردن Pagination\n');
    }

  } catch (error) {
    console.error('❌ خطا در بررسی حجم داده‌ها:', error);
  } finally {
    await pool.end();
  }
}

checkDataSize();

