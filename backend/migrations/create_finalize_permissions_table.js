const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function createFinalizePermissionsTable() {
  try {
    console.log('🚀 Creating finalize_permissions table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS finalize_permissions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        line_type VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, line_type)
      );
    `;
    
    await pool.query(query);
    console.log('✅ finalize_permissions table created successfully');
    
    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_finalize_permissions_user_id ON finalize_permissions(user_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_finalize_permissions_line_type ON finalize_permissions(line_type);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_finalize_permissions_username ON finalize_permissions(username);');
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error creating finalize_permissions table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createFinalizePermissionsTable();

