const pool = require('../db');

async function addPermissionTypeColumn() {
  try {
    console.log('🚀 Adding permission_type column to planning_manager_approval_permissions table...');
    
    // بررسی وجود جدول
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'planning_manager_approval_permissions'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  Table planning_manager_approval_permissions does not exist. Please run create_planning_manager_approval_permissions_table.js first.');
      await pool.end();
      return;
    }
    
    // بررسی وجود ستون
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'planning_manager_approval_permissions' 
      AND column_name = 'permission_type'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ Column permission_type already exists');
      await pool.end();
      return;
    }
    
    // افزودن ستون
    await pool.query(`
      ALTER TABLE planning_manager_approval_permissions
      ADD COLUMN permission_type VARCHAR(50) NOT NULL DEFAULT 'approval'
    `);
    
    console.log('✅ Column permission_type added successfully');
    
    // به‌روزرسانی constraint برای UNIQUE
    await pool.query(`
      ALTER TABLE planning_manager_approval_permissions
      DROP CONSTRAINT IF EXISTS planning_manager_approval_permissions_user_id_line_type_key
    `);
    
    await pool.query(`
      ALTER TABLE planning_manager_approval_permissions
      ADD CONSTRAINT planning_manager_approval_permissions_user_id_line_type_permission_type_key
      UNIQUE(user_id, line_type, permission_type)
    `);
    
    console.log('✅ Unique constraint updated successfully');
    
  } catch (error) {
    console.error('❌ Error adding permission_type column:', error);
    throw error;
  }
}

addPermissionTypeColumn();

