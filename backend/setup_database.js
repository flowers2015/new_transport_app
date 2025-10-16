const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function setupDriversTable() {
    try {
        console.log('🔄 Setting up drivers table...');
        
        // خواندن فایل SQL
        const sqlPath = path.join(__dirname, 'setup_drivers_table.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        // اجرای SQL
        await pool.query(sqlContent);
        
        console.log('✅ Drivers table setup completed successfully!');
        
        // تست: دریافت تعداد رانندگان
        const result = await pool.query('SELECT COUNT(*) as count FROM drivers');
        console.log(`📊 Total drivers in database: ${result.rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Error setting up drivers table:', error);
        throw error;
    }
}

// اجرای setup اگر فایل مستقیماً اجرا شود
if (require.main === module) {
    setupDriversTable()
        .then(() => {
            console.log('🎉 Database setup completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Database setup failed:', error);
            process.exit(1);
        });
}

module.exports = { setupDriversTable };
