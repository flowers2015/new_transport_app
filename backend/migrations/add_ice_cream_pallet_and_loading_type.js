const pool = require('../db');

async function addIceCreamPalletAndLoadingType() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const columns = [
      'pallet_count INT',
      "loading_type VARCHAR(20)",
    ];

    for (const column of columns) {
      try {
        await client.query(`ALTER TABLE freight_announcements ADD COLUMN ${column}`);
        console.log(`✅ Added column: ${column.split(' ')[0]}`);
      } catch (error) {
        if (error.code === '42701') {
          console.log(`⚠️  Column already exists: ${column.split(' ')[0]}`);
        } else {
          throw error;
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ Ice cream pallet_count and loading_type columns ready');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addIceCreamPalletAndLoadingType()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addIceCreamPalletAndLoadingType;
