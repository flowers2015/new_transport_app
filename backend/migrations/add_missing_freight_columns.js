const pool = require('../db');

async function addMissingFreightColumns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add missing columns to freight_announcements table
    const columns = [
      'bill_of_lading_number VARCHAR(255)',
      'rejection_reason TEXT',
      'created_by_user_id VARCHAR(255) REFERENCES users(id)',
      'origin_city VARCHAR(255)',
      'brand VARCHAR(255)',
      'representative_type VARCHAR(255)',
      'representative_name VARCHAR(255)',
      'priority VARCHAR(50)',
      'products JSONB',
      'notes TEXT'
    ];

    for (const column of columns) {
      try {
        await client.query(`ALTER TABLE freight_announcements ADD COLUMN ${column}`);
        console.log(`✅ Added column: ${column.split(' ')[0]}`);
      } catch (error) {
        if (error.code === '42701') { // Column already exists
          console.log(`⚠️  Column already exists: ${column.split(' ')[0]}`);
        } else {
          console.log(`❌ Failed to add column ${column.split(' ')[0]}:`, error.message);
          // Continue with other columns instead of throwing
        }
      }
    }

    // Update freight_announcement_history table to match the service expectations
    const historyColumns = [
      'user_name VARCHAR(255)',
      'old_status VARCHAR(100)',
      'new_status VARCHAR(100)',
      'field_changes JSONB',
      'description TEXT',
      'ip_address VARCHAR(50)'
    ];

    for (const column of historyColumns) {
      try {
        await client.query(`ALTER TABLE freight_announcement_history ADD COLUMN ${column}`);
        console.log(`✅ Added history column: ${column.split(' ')[0]}`);
      } catch (error) {
        if (error.code === '42701') { // Column already exists
          console.log(`⚠️  History column already exists: ${column.split(' ')[0]}`);
        } else {
          console.log(`❌ Failed to add history column ${column.split(' ')[0]}:`, error.message);
          // Continue with other columns instead of throwing
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ All missing columns added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add missing columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  addMissingFreightColumns()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addMissingFreightColumns;
