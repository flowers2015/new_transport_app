const pool = require('../db');

async function addIceCreamDisplayOrder() {
  const client = await pool.connect();
  try {
    const columns = [
      { name: 'display_pinned', ddl: 'display_pinned BOOLEAN DEFAULT FALSE' },
      { name: 'display_sort_order', ddl: 'display_sort_order INTEGER' },
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

    console.log('✅ Ice cream display order columns ready');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addIceCreamDisplayOrder()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addIceCreamDisplayOrder;
