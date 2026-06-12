require('dotenv').config();
const pool = require('../db');

(async () => {
  try {
    const { rows: tables } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const counts = [];
    for (const { table_name } of tables) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table_name}`);
      counts.push({ table: table_name, count: rows[0].n });
    }
    counts.sort((a, b) => b.count - a.count);

    console.log('Database:', process.env.DB_NAME || 'transport_app');
    console.log('Tables:', counts.length);
    console.table(counts);

    const key = ['vehicles', 'drivers', 'freight_announcements', 'driver_calculations', 'users'];
    console.log('\nKey tables:');
    for (const k of key) {
      const row = counts.find((c) => c.table === k);
      console.log(`  ${k}: ${row ? row.count : 'N/A'}`);
    }
  } catch (e) {
    console.error('ERR', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
