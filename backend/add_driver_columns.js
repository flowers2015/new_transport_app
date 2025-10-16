const pool = require('./db');

async function addDriverColumns() {
    try {
        console.log('🔄 Adding new columns to drivers table...');
        
        // اضافه کردن فیلدهای جدید (اگر وجود ندارند)
        const columns = [
            'father_name VARCHAR(255)',
            'birth_date DATE',
            'id_number VARCHAR(255)',
            'birth_place VARCHAR(255)',
            'issue_place VARCHAR(255)',
            'home_phone VARCHAR(255)',
            'work_phone VARCHAR(255)',
            'postal_code VARCHAR(255)',
            'home_address TEXT',
            'work_location VARCHAR(255)',
            'job_title VARCHAR(255)',
            'termination_date DATE',
            'license_number VARCHAR(255)',
            'license_issue_date DATE',
            'license_issue_place VARCHAR(255)',
            'license_expiry_date DATE',
            'current_vehicle_type VARCHAR(255)',
            'current_vehicle_plate VARCHAR(255)',
            'is_deleted BOOLEAN NOT NULL DEFAULT false'
        ];

        for (const column of columns) {
            const columnName = column.split(' ')[0];
            try {
                await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ${column}`);
                console.log(`✅ Added column: ${columnName}`);
            } catch (error) {
                if (error.code === '42701') { // column already exists
                    console.log(`⚠️  Column already exists: ${columnName}`);
                } else {
                    console.log(`❌ Error adding column ${columnName}:`, error.message);
                }
            }
        }

        // اضافه کردن ایندکس‌ها
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id)',
            'CREATE INDEX IF NOT EXISTS idx_drivers_national_id ON drivers(national_id)',
            'CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name)',
            'CREATE INDEX IF NOT EXISTS idx_drivers_mobile ON drivers(mobile)',
            'CREATE INDEX IF NOT EXISTS idx_drivers_is_deleted ON drivers(is_deleted)'
        ];

        for (const index of indexes) {
            try {
                await pool.query(index);
                console.log(`✅ Created index`);
            } catch (error) {
                console.log(`⚠️  Index might already exist:`, error.message);
            }
        }

        // نمایش ساختار جدول
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'drivers' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📊 Current drivers table structure:');
        result.rows.forEach(row => {
            console.log(`   ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
        });

        console.log('\n✅ Drivers table updated successfully!');
        
    } catch (error) {
        console.error('❌ Error updating drivers table:', error);
        throw error;
    }
}

// اجرای setup اگر فایل مستقیماً اجرا شود
if (require.main === module) {
    addDriverColumns()
        .then(() => {
            console.log('🎉 Database update completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Database update failed:', error);
            process.exit(1);
        });
}

module.exports = { addDriverColumns };
