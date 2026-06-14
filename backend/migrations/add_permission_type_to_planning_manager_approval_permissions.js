const pool = require('../db');

async function up() {
  console.log('🚀 Ensuring permission_type on planning_manager_approval_permissions...');

  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'planning_manager_approval_permissions'
    ) AS exists
  `);

  if (!tableCheck.rows[0].exists) {
    console.log('⚠️ Table missing — run create_planning_manager_approval_permissions_table.js first');
    return;
  }

  const columnCheck = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'planning_manager_approval_permissions'
      AND column_name = 'permission_type'
  `);

  if (columnCheck.rows.length === 0) {
    await pool.query(`
      ALTER TABLE planning_manager_approval_permissions
      ADD COLUMN permission_type VARCHAR(50) NOT NULL DEFAULT 'approval'
    `);
    console.log('✅ Column permission_type added');
  } else {
    console.log('✅ Column permission_type already exists');
  }

  await pool.query(`
    ALTER TABLE planning_manager_approval_permissions
    DROP CONSTRAINT IF EXISTS planning_manager_approval_permissions_user_id_line_type_key
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'planning_manager_approval_permissions_user_id_line_type_permission_type_key'
      ) THEN
        ALTER TABLE planning_manager_approval_permissions
        ADD CONSTRAINT planning_manager_approval_permissions_user_id_line_type_permission_type_key
        UNIQUE (user_id, line_type, permission_type);
      END IF;
    END $$
  `);

  console.log('✅ permission_type migration complete');
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error in permission_type migration:', err);
      process.exit(1);
    });
}

module.exports = { up };
