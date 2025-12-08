const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function createPersonalDriversTable() {
  try {
    console.log('🚀 Creating personal_drivers table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS personal_drivers (
        id VARCHAR(255) PRIMARY KEY,
        national_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        mobile VARCHAR(255), -- اختیاری (می‌تواند null باشد)
        driver_smart_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    
    await pool.query(query);
    console.log('✅ personal_drivers table created successfully');
    
    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_personal_drivers_national_id ON personal_drivers(national_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_personal_drivers_driver_smart_id ON personal_drivers(driver_smart_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_personal_drivers_name ON personal_drivers(name);');
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error creating personal_drivers table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createPersonalDriversTable();
