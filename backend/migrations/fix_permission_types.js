const pool = require('../db');

async function fixPermissionTypes() {
  const client = await pool.connect();
  try {
    console.log('🚀 شروع اصلاح نوع مجوزها...');
    
    await client.query('BEGIN');
    
    // بررسی وجود جدول
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'planning_manager_approval_permissions'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  جدول planning_manager_approval_permissions وجود ندارد');
      await client.query('ROLLBACK');
      return;
    }
    
    // بررسی وجود ستون permission_type
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'planning_manager_approval_permissions' 
      AND column_name = 'permission_type'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('⚠️  ستون permission_type وجود ندارد. ابتدا migration add_permission_type را اجرا کنید.');
      await client.query('ROLLBACK');
      return;
    }
    
    // دریافت لیست مدیران برنامه‌ریزی
    const managersResult = await client.query(`
      SELECT id, username, full_name, role 
      FROM users 
      WHERE role IN ('planner_manager', 'مدیر برنامه‌ریزی', 'PlanningManager', 'planning_manager')
    `);
    
    console.log(`📋 پیدا شد ${managersResult.rows.length} مدیر برنامه‌ریزی`);
    
    if (managersResult.rows.length > 0) {
      const managerIds = managersResult.rows.map(m => m.id);
      
      // به‌روزرسانی مجوزهای مدیران به 'approval'
      const updateResult = await client.query(`
        UPDATE planning_manager_approval_permissions 
        SET permission_type = 'approval', updated_at = NOW()
        WHERE user_id = ANY($1::text[])
        RETURNING id, user_id, username, full_name, line_type, permission_type;
      `, [managerIds]);
      
      console.log(`✅ ${updateResult.rows.length} مجوز مدیر به 'approval' تغییر کرد`);
      
      if (updateResult.rows.length > 0) {
        console.log('📝 مجوزهای تغییر یافته:');
        updateResult.rows.forEach(row => {
          console.log(`   - ${row.full_name} (${row.username}): ${row.line_type} → approval`);
        });
      }
    }
    
    // دریافت لیست کارمندان برنامه‌ریزی
    const employeesResult = await client.query(`
      SELECT id, username, full_name, role 
      FROM users 
      WHERE role IN ('planner', 'کارمند برنامه‌ریزی', 'PlanningEmployee', 'planning_employee')
    `);
    
    console.log(`📋 پیدا شد ${employeesResult.rows.length} کارمند برنامه‌ریزی`);
    
    if (employeesResult.rows.length > 0) {
      const employeeIds = employeesResult.rows.map(e => e.id);
      
      // به‌روزرسانی مجوزهای کارمندان به 'create'
      const updateResult = await client.query(`
        UPDATE planning_manager_approval_permissions 
        SET permission_type = 'create', updated_at = NOW()
        WHERE user_id = ANY($1::text[])
        RETURNING id, user_id, username, full_name, line_type, permission_type;
      `, [employeeIds]);
      
      console.log(`✅ ${updateResult.rows.length} مجوز کارمند به 'create' تغییر کرد`);
      
      if (updateResult.rows.length > 0) {
        console.log('📝 مجوزهای تغییر یافته:');
        updateResult.rows.forEach(row => {
          console.log(`   - ${row.full_name} (${row.username}): ${row.line_type} → create`);
        });
      }
    }
    
    // نمایش خلاصه
    const summary = await client.query(`
      SELECT 
        permission_type,
        COUNT(*) as count
      FROM planning_manager_approval_permissions
      GROUP BY permission_type
    `);
    
    console.log('\n📊 خلاصه مجوزها:');
    summary.rows.forEach(row => {
      const typeLabel = row.permission_type === 'approval' ? 'تاییدیه (مدیر)' : 'ایجاد اعلام بار (کارمند)';
      console.log(`   ${typeLabel}: ${row.count} مجوز`);
    });
    
    await client.query('COMMIT');
    console.log('\n✅ اصلاح مجوزها با موفقیت انجام شد!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ خطا در اصلاح مجوزها:', error);
    throw error;
  } finally {
    client.release();
  }
}

// اجرای migration
if (require.main === module) {
  fixPermissionTypes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = fixPermissionTypes;

