const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function createPersonalVehiclesTable() {
  try {
    console.log('🚀 Creating personal_vehicles table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS personal_vehicles (
        id VARCHAR(255) PRIMARY KEY,
        truck_smart_id VARCHAR(255) UNIQUE NOT NULL,
        plate_part1 VARCHAR(2) NOT NULL,
        plate_letter VARCHAR(10) NOT NULL,
        plate_part2 VARCHAR(3) NOT NULL,
        plate_city_code VARCHAR(2) NOT NULL,
        vehicle_type VARCHAR(255) NOT NULL,
        vehicle_usage VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    
    await pool.query(query);
    console.log('✅ personal_vehicles table created successfully');
    
    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_personal_vehicles_truck_smart_id ON personal_vehicles(truck_smart_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_personal_vehicles_plate ON personal_vehicles(plate_part1, plate_letter, plate_part2, plate_city_code);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_personal_vehicles_type ON personal_vehicles(vehicle_type);');
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error creating personal_vehicles table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createPersonalVehiclesTable();
