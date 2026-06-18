const pool = require('../db');

async function addIceCreamPalletAndLoadingType() {
  const client = await pool.connect();
  try {
    const columns = [
      { name: 'pallet_count', ddl: 'pallet_count INT' },
      { name: 'loading_type', ddl: 'loading_type VARCHAR(20)' },
    ];

    for (const { name, ddl } of columns) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'freight_announcements' AND column_name = $1`,
        [name]
      );
      if (exists.rowCount > 0) {
        console.log(`⚠️  Column already exists: ${name}`);
        continue;
      }
      await client.query(`ALTER TABLE freight_announcements ADD COLUMN ${ddl}`);
      console.log(`✅ Added column: ${name}`);
    }

    console.log('✅ Ice cream pallet_count and loading_type columns ready');
  } catch (error) {
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
