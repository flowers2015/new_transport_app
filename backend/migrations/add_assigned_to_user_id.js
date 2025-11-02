const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function addAssignedToUserIdColumn() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if column exists
    const checkColumn = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='freight_announcements' AND column_name='assigned_to_user_id'`
    );

    if (checkColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE freight_announcements 
        ADD COLUMN assigned_to_user_id VARCHAR(255) REFERENCES users(id)
      `);
      console.log('✅ Added assigned_to_user_id column');
    } else {
      console.log('⚠️  Column assigned_to_user_id already exists');
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to add assigned_to_user_id column:', error);
  } finally {
    client.release();
  }
}

addAssignedToUserIdColumn();
