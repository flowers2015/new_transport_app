const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'transport_app',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '09144562267',
});

async function setupDatabase() {
  try {
    console.log('Setting up comprehensive database...');
    if ((process.env.RESET_DB || '').toString().toLowerCase() === 'true') {
      console.log('⚠️  RESET_DB is true → dropping and recreating public schema...');
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      console.log('✅ Public schema recreated');
    }
    // Optional full reset when schema mismatches exist from prior runs
    if ((process.env.RESET_DB || '').toString().toLowerCase() === 'true') {
      console.log('⚠️  RESET_DB is true → dropping and recreating public schema...');
      await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      console.log('✅ Public schema recreated');
    }
    
    // Read and execute schema
    const fs = require('fs');
    const path = require('path');
    
    const schemaPath = path.join(__dirname, 'models', 'comprehensive_schema.sql');
    const sampleDataPath = path.join(__dirname, 'comprehensive_sample_data.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('✅ Complete database schema created successfully');
    } else {
      console.log('❌ Complete schema file not found');
    }
    
    if (fs.existsSync(sampleDataPath)) {
      const sampleData = fs.readFileSync(sampleDataPath, 'utf8');
      await pool.query(sampleData);
      console.log('✅ Complete sample data inserted successfully');
    } else {
      console.log('❌ Complete sample data file not found');
    }
    // Seed exact roles/users requested with password '123'
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash('123', 10);
    const seedUsers = [
      { id: 'USR100', username: 'admin', name: 'مدیر سیستم', role: 'admin' },
      { id: 'USR101', username: 'planner', name: 'کارمند برنامه‌ریزی', role: 'planner' },
      { id: 'USR102', username: 'planner_manager', name: 'مدیر برنامه‌ریزی', role: 'planner_manager' },
      { id: 'USR103', username: 'transport_user', name: 'کاربر ترابری (شرکت)', role: 'transport_user' },
      { id: 'USR104', username: 'personal_transport_user', name: 'کاربر ترابری (خودرو شخصی)', role: 'personal_transport_user' },
      { id: 'USR105', username: 'finance', name: 'مالی شعب', role: 'finance' },
      { id: 'USR106', username: 'central_finance', name: 'مالی مرکزی', role: 'central_finance' },
      { id: 'USR107', username: 'transport_finance', name: 'مالی ترابری', role: 'transport_finance' },
      { id: 'USR108', username: 'workshop', name: 'تعمیرگاه', role: 'workshop' },
      { id: 'USR109', username: 'transport', name: 'ترابری', role: 'transport' },
      { id: 'USR110', username: 'warehouse', name: 'انبار', role: 'warehouse' },
      { id: 'USR111', username: 'merchant', name: 'بازرگان', role: 'merchant' },
      { id: 'USR112', username: 'docs', name: 'کارشناس مدارک خودرو', role: 'docs' },
      { id: 'USR113', username: 'accident', name: 'کارشناس تصادفات', role: 'accident' },
      { id: 'USR114', username: 'allocation', name: 'کارشناس تغییر و تحول', role: 'allocation' },
      { id: 'USR115', username: 'insurance', name: 'کارشناس بیمه', role: 'insurance' },
    ];
    // users table for comprehensive schema: (id, username, password_hash, name, role, employee_id, branch_city)
    for (const u of seedUsers) {
      await pool.query(
        `INSERT INTO users (id, username, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role`,
        [u.id, u.username, passwordHash, u.name, u.role]
      );
    }
    console.log('✅ Seeded requested user roles with password 123');
    
    console.log('🎉 Complete database setup completed!');
    console.log('📊 Database includes:');
    console.log('   - Complete user and branch management');
    console.log('   - Full vehicle fleet with detailed specifications');
    console.log('   - Complete driver and technician management');
    console.log('   - Comprehensive repair orders and parts inventory');
    console.log('   - Full freight announcements and logistics');
    console.log('   - Complete financial management (invoices, transactions)');
    console.log('   - Insurance policies and accident reports');
    console.log('   - Vehicle permits and fuel card requests');
    console.log('   - Traffic fines and vehicle allocations');
    console.log('   - Support tickets and complete audit logs');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
  } finally {
    await pool.end();
  }
}

setupDatabase();
