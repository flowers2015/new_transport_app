const pool = require('../db');

let ensurePromise = null;

async function ensureColumnIsVarchar(tableName, columnName, length = 255) {
  const { rows } = await pool.query(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );

  if (!rows[0]) return false;

  const type = String(rows[0].data_type || '').toLowerCase();
  if (type.includes('character') || type === 'text') {
    return false;
  }

  await pool.query(`
    ALTER TABLE ${tableName}
    ALTER COLUMN ${columnName} TYPE VARCHAR(${length})
    USING ${columnName}::text
  `);
  console.log(`✅ [ensureJalaliDateColumns] ${tableName}.${columnName} → VARCHAR(${length})`);
  return true;
}

/**
 * تاریخ‌های شمسی باید VARCHAR باشند — اگر DATE بمانند Postgres خطای out of range می‌دهد.
 */
async function ensureJalaliDateColumns() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        await ensureColumnIsVarchar('freight_announcements', 'loading_date', 255);
        await ensureColumnIsVarchar('freight_announcements', 'delivery_date', 32);
        await ensureColumnIsVarchar('freight_destinations', 'delivery_date', 32);
      } catch (error) {
        ensurePromise = null;
        console.error('❌ [ensureJalaliDateColumns] failed:', error.message);
        throw error;
      }
    })();
  }
  return ensurePromise;
}

module.exports = { ensureJalaliDateColumns, ensureColumnIsVarchar };
