const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'transport_db',
  password: '123456',
  port: 5432,
});

async function addVehicleCodeColumn() {
  const client = await pool.connect();
  try {
    console.log('🔧 Starting migration: Add vehicle_code column to vehicles table...');
    
    await client.query('BEGIN');
    
    // Check if column already exists
    const columnExists = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'vehicles' AND column_name = 'vehicle_code'
    `);
    
    if (columnExists.rowCount > 0) {
      console.log('⚠️ Column vehicle_code already exists, skipping...');
      await client.query('COMMIT');
      return;
    }
    
    // Add vehicle_code column
    await client.query(`
      ALTER TABLE vehicles 
      ADD COLUMN vehicle_code VARCHAR(50) UNIQUE
    `);
    
    // Add comment to the column
    await client.query(`
      COMMENT ON COLUMN vehicles.vehicle_code IS 'کد خودرو برای سنگین/نیمه یدک - پل ارتباطی بین جستجو و تخصیص'
    `);
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    console.log('📝 Added vehicle_code column to vehicles table');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addVehicleCodeColumn().catch(console.error);
