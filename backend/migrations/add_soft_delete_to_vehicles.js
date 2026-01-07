const pool = require('../db');

async function addSoftDeleteToVehicles() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Starting add_soft_delete_to_vehicles migration...');
    await client.query('BEGIN');

    // بررسی وجود ستون deleted_at
    const checkDeletedAt = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicles' AND column_name = 'deleted_at'
    `);

    if (checkDeletedAt.rows.length === 0) {
      console.log('📝 [Migration] Adding deleted_at column...');
      await client.query(`
        ALTER TABLE vehicles 
        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL
      `);
      console.log('✅ [Migration] deleted_at column added successfully');
    } else {
      console.log('ℹ️  [Migration] deleted_at column already exists, skipping...');
    }

    // بررسی وجود ستون deletion_reason
    const checkDeletionReason = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehicles' AND column_name = 'deletion_reason'
    `);

    if (checkDeletionReason.rows.length === 0) {
      console.log('📝 [Migration] Adding deletion_reason column...');
      await client.query(`
        ALTER TABLE vehicles 
        ADD COLUMN deletion_reason VARCHAR(500) DEFAULT NULL
      `);
      console.log('✅ [Migration] deletion_reason column added successfully');
    } else {
      console.log('ℹ️  [Migration] deletion_reason column already exists, skipping...');
    }

    // ایجاد ایندکس برای deleted_at
    const checkIndex = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'vehicles' AND indexname = 'idx_vehicles_deleted_at'
    `);

    if (checkIndex.rows.length === 0) {
      console.log('📝 [Migration] Creating index on deleted_at...');
      await client.query(`
        CREATE INDEX idx_vehicles_deleted_at ON vehicles(deleted_at)
      `);
      console.log('✅ [Migration] Index created successfully');
    } else {
      console.log('ℹ️  [Migration] Index already exists, skipping...');
    }

    await client.query('COMMIT');
    console.log('✅ [Migration] add_soft_delete_to_vehicles migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Migration] Error in add_soft_delete_to_vehicles migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addSoftDeleteToVehicles()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addSoftDeleteToVehicles };

