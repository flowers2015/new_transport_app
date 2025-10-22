const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'transport_db',
  password: '123456',
  port: 5432,
});

async function addVehicleCodeColumn() {
  try {
    console.log('🔧 Adding vehicle_code column to vehicles table...');
    
    // Add the column
    await pool.query(`
      ALTER TABLE vehicles 
      ADD COLUMN IF NOT EXISTS vehicle_code VARCHAR(50) UNIQUE
    `);
    
    // Add comment
    await pool.query(`
      COMMENT ON COLUMN vehicles.vehicle_code IS 'کد خودرو برای سنگین/نیمه یدک - پل ارتباطی بین جستجو و تخصیص'
    `);
    
    console.log('✅ Column vehicle_code added successfully!');
    
  } catch (error) {
    console.error('❌ Error adding column:', error.message);
  } finally {
    await pool.end();
  }
}

addVehicleCodeColumn();
