const pool = require('../db');

async function up() {
  console.log('🚀 Creating planning_manager_approval_permissions table...');

  await pool.query(`
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
    )
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_user_id ON planning_manager_approval_permissions(user_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_line_type ON planning_manager_approval_permissions(line_type)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_planning_manager_approval_permissions_username ON planning_manager_approval_permissions(username)'
  );

  console.log('✅ planning_manager_approval_permissions table ready');
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error creating planning_manager_approval_permissions table:', err);
      process.exit(1);
    });
}

module.exports = { up };
