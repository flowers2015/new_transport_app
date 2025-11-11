const dotenv = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'transport_app',
  password: (process.env.DB_PASSWORD ?? '').toString(),
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function inspectTables(tables) {
  try {
    for (const table of tables) {
      console.log(`\n=== TABLE ${table} ===`);
      const { rows: cols } = await pool.query(
        `SELECT column_name, data_type 
         FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table]
      );
      console.table(cols);

      const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      console.log('row_count:', countRows[0].count);

      if (Number(countRows[0].count) > 0) {
        const { rows: sampleRows } = await pool.query(`SELECT * FROM ${table} LIMIT 5`);
        console.log('sample_rows:', sampleRows);
      }
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const tables = process.argv.slice(2);
  if (tables.length === 0) {
    console.error('Usage: node inspectTables.js <table1> <table2> ...');
    process.exit(1);
  }
  inspectTables(tables).catch((err) => {
    console.error('Inspection failed:', err);
    process.exit(1);
  });
}

