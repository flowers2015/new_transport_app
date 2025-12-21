const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function createPlanningManagerApprovalPermissionsTable() {
  try {
    console.log('🚀 Creating planning_manager_approval_permissions table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS planning_manager_approval_permissions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        line_type VARCHAR(255) NOT NULL,
        permission_type VARCHAR(50) NOT NULL DEFAULT 'approval',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, line_type, permission_type)
      );
    `;
    
    await pool.query(query);
    console.log('✅ planning_manager_approval_permissions table created successfully');
    
    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_user_id ON planning_manager_approval_permissions(user_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_line_type ON planning_manager_approval_permissions(line_type);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_username ON planning_manager_approval_permissions(username);');
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error creating planning_manager_approval_permissions table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createPlanningManagerApprovalPermissionsTable();

