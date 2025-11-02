const pool = require('../db');

async function addCreatedByUserId() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add created_by_user_id column if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE freight_announcements 
        ADD COLUMN created_by_user_id VARCHAR(255) REFERENCES users(id)
      `);
      console.log('✅ Added created_by_user_id column');
    } catch (error) {
      if (error.code === '42701') { // Column already exists
        console.log('⚠️  Column created_by_user_id already exists');
      } else {
        throw error;
      }
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  addCreatedByUserId()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addCreatedByUserId;
