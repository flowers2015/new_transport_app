const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'transport_db',
  password: '123456',
  port: 5432,
});

async function fixLoadingDateColumn() {
  const client = await pool.connect();
  try {
    console.log('🔧 Starting migration: Fix loading_date column type...');
    
    await client.query('BEGIN');
    
    // Change loading_date from DATE to VARCHAR(255)
    await client.query('ALTER TABLE freight_announcements ALTER COLUMN loading_date TYPE VARCHAR(255)');
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    console.log('📝 loading_date column changed from DATE to VARCHAR(255)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixLoadingDateColumn().catch(console.error);
