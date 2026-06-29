const pool = require('../db');

const PLACEHOLDER_MOBILE = '11';
const PLACEHOLDER_PLATE_PATTERN = /11ع111/i;

async function addCarrierNameColumn() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE freight_announcements
      ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(255)
    `);

    // backfill: فاز placeholder — نام در assigned_driver_name بوده
    await client.query(
      `
      UPDATE freight_announcements fa
      SET carrier_name = TRIM(COALESCE(fa.assigned_driver_name, pd.name)),
          assigned_driver_name = NULL
      FROM personal_drivers pd
      WHERE pd.id = fa.assigned_driver_id
        AND fa.carrier_name IS NULL
        AND TRIM(COALESCE(fa.assigned_driver_name, pd.name, '')) <> ''
        AND fa.assignment_type = 'personal'
        AND fa.line_type IN ('Dairy', 'Ambient', 'پاستوریزه', 'لبنیات-فروتلند')
        AND REGEXP_REPLACE(COALESCE(pd.mobile, ''), '[^0-9]', '', 'g') = $1
        AND (
          COALESCE(fa.vehicle_plate, '') ~* $2
          OR EXISTS (
            SELECT 1 FROM personal_vehicles pv
            WHERE pv.id = fa.assigned_vehicle_id
              AND CONCAT(pv.plate_part1, pv.plate_letter, pv.plate_part2, '-', pv.plate_city_code) ~* $2
          )
        )
      `,
      [PLACEHOLDER_MOBILE, PLACEHOLDER_PLATE_PATTERN.source]
    );

    await client.query('COMMIT');
    console.log('✅ carrier_name column ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ add_carrier_name_column:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  addCarrierNameColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = addCarrierNameColumn;
