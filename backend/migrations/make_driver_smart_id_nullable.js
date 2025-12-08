const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function makeDriverSmartIdNullable() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('🚀 Making driver_smart_id nullable in personal_drivers table...');
    
    // حذف constraint UNIQUE قبلی
    await client.query(`
      ALTER TABLE personal_drivers 
      DROP CONSTRAINT IF EXISTS personal_drivers_driver_smart_id_key;
    `);
    
    // nullable کردن ستون
    await client.query(`
      ALTER TABLE personal_drivers 
      ALTER COLUMN driver_smart_id DROP NOT NULL;
    `);
    
    // ایجاد unique constraint فقط برای مقادیر non-null
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_drivers_driver_smart_id_unique 
      ON personal_drivers(driver_smart_id) 
      WHERE driver_smart_id IS NOT NULL;
    `);
    
    await client.query('COMMIT');
    console.log('✅ driver_smart_id column updated to be nullable successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating driver_smart_id column:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

makeDriverSmartIdNullable();

