/**
 * اسکریپت Node.js برای استخراج داده‌های شهرها از دیتابیس و تبدیل به JSON
 * 
 * استفاده:
 * node backend/scripts/export_cities.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'transport_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function exportCities() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 در حال بررسی وجود جدول cities...');
        
        // بررسی وجود جدول cities
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'cities'
            )
        `);
        
        const citiesTableExists = tableCheck.rows[0].exists;
        
        let cities = [];
        
        if (citiesTableExists) {
            console.log('✅ جدول cities پیدا شد. در حال استخراج داده‌ها...');
            
            const result = await client.query(`
                SELECT 
                    city_name as "cityName",
                    province,
                    approved_mission_days as "approvedMissionDays",
                    city_kilometers as "cityKilometers"
                FROM cities
                ORDER BY province, city_name
            `);
            
            cities = result.rows.map(row => ({
                cityName: row.cityName || '',
                province: row.province || '',
                approvedMissionDays: row.approvedMissionDays || null,
                cityKilometers: row.cityKilometers || null,
            }));
            
            console.log(`✅ ${cities.length} شهر از جدول cities استخراج شد.`);
        } else {
            console.log('⚠️ جدول cities وجود ندارد. استفاده از dispatch_routes...');
            
            const result = await client.query(`
                SELECT DISTINCT
                    city as "cityName",
                    province,
                    NULL as "approvedMissionDays",
                    CASE 
                        WHEN round_trip_km IS NOT NULL THEN round_trip_km / 2 
                        ELSE NULL 
                    END as "cityKilometers"
                FROM dispatch_routes
                WHERE is_active = TRUE 
                  AND city IS NOT NULL 
                  AND city != ''
                  AND province IS NOT NULL 
                  AND province != ''
                ORDER BY province, city
            `);
            
            cities = result.rows.map(row => ({
                cityName: row.cityName || '',
                province: row.province || '',
                approvedMissionDays: row.approvedMissionDays || null,
                cityKilometers: row.cityKilometers ? parseFloat(row.cityKilometers) : null,
            }));
            
            console.log(`✅ ${cities.length} شهر از جدول dispatch_routes استخراج شد.`);
        }
        
        // تبدیل به JSON
        const jsonOutput = JSON.stringify(cities, null, 2);
        
        console.log('\n📄 خروجی JSON:');
        console.log('='.repeat(80));
        console.log(jsonOutput);
        console.log('='.repeat(80));
        
        // ذخیره در فایل
        const fs = require('fs');
        const path = require('path');
        const outputPath = path.join(__dirname, 'cities_export.json');
        fs.writeFileSync(outputPath, jsonOutput, 'utf8');
        console.log(`\n💾 فایل JSON در مسیر زیر ذخیره شد:`);
        console.log(`   ${outputPath}`);
        
        return cities;
        
    } catch (error) {
        console.error('❌ خطا در استخراج داده‌ها:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// اجرای اسکریپت
if (require.main === module) {
    exportCities()
        .then(() => {
            console.log('\n✅ استخراج با موفقیت انجام شد.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ خطا:', error);
            process.exit(1);
        });
}

module.exports = { exportCities };

