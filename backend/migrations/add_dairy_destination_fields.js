const pool = require('../db');

async function addDairyDestinationFields() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const columns = [
      'lis_code VARCHAR(255)',
      "brand_type VARCHAR(50)",
      'brand VARCHAR(255)',
      'brand2 VARCHAR(255)',
      "products JSONB DEFAULT '[]'::jsonb",
    ];

    for (const column of columns) {
      try {
        await client.query(`ALTER TABLE freight_destinations ADD COLUMN IF NOT EXISTS ${column}`);
        console.log(`✅ Added freight_destinations column: ${column.split(' ')[0]}`);
      } catch (error) {
        if (error.code === '42701') {
          console.log(`⚠️  Column already exists: ${column.split(' ')[0]}`);
        } else {
          throw error;
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅ Dairy destination fields migration completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Dairy destination fields migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addDairyDestinationFields()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addDairyDestinationFields;
