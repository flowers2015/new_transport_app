const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function updatePersonalDriversMobileNullable() {
  try {
    console.log('🚀 Updating personal_drivers table: making mobile nullable...');
    
    // بررسی وجود جدول
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'personal_drivers'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Table personal_drivers does not exist. Skipping migration.');
      return;
    }
    
    // بررسی اینکه آیا ستون mobile وجود دارد و NOT NULL است
    const columnCheck = await pool.query(`
      SELECT 
        column_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'personal_drivers'
      AND column_name = 'mobile';
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('⚠️ Column mobile does not exist. Skipping migration.');
      return;
    }
    
    if (columnCheck.rows[0].is_nullable === 'YES') {
      console.log('✅ Column mobile is already nullable. No changes needed.');
      return;
    }
    
    // تبدیل ستون mobile به nullable
    await pool.query(`
      ALTER TABLE personal_drivers 
      ALTER COLUMN mobile DROP NOT NULL;
    `);
    
    console.log('✅ personal_drivers.mobile is now nullable');
    
  } catch (error) {
    console.error('❌ Error updating personal_drivers table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

updatePersonalDriversMobileNullable();

