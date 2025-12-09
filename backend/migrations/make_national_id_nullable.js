const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function makeNationalIdNullable() {
  try {
    console.log('🚀 Making national_id nullable in drivers table...');
    
    // ابتدا بررسی می‌کنیم که آیا UNIQUE constraint وجود دارد
    const checkConstraint = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'drivers' 
      AND constraint_type = 'UNIQUE' 
      AND constraint_name LIKE '%national_id%'
    `);
    
    // اگر UNIQUE constraint وجود دارد، ابتدا آن را حذف می‌کنیم
    if (checkConstraint.rows.length > 0) {
      const constraintName = checkConstraint.rows[0].constraint_name;
      console.log(`📝 Dropping UNIQUE constraint: ${constraintName}`);
      await pool.query(`ALTER TABLE drivers DROP CONSTRAINT IF EXISTS ${constraintName}`);
    }
    
    // حالا ستون را nullable می‌کنیم
    await pool.query(`
      ALTER TABLE drivers 
      ALTER COLUMN national_id DROP NOT NULL
    `);
    
    // دوباره UNIQUE constraint را اضافه می‌کنیم (اما این بار فقط برای مقادیر غیر null)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_national_id_unique 
      ON drivers(national_id) 
      WHERE national_id IS NOT NULL
    `);
    
    console.log('✅ national_id column updated to be nullable successfully');
    
  } catch (error) {
    console.error('❌ Error making national_id nullable:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

makeNationalIdNullable();

