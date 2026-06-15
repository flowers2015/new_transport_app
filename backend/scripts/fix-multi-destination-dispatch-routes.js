/**
 * اصلاح route_id و distance_km در dispatch_assignments برای تورهای چندمقصدی.
 * هر ردیف باید km مسیر همان مقصد (freight_destination) را داشته باشد، نه دورترین مقصد.
 *
 * اجرا: node backend/scripts/fix-multi-destination-dispatch-routes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(`
      WITH dest_routes AS (
        SELECT DISTINCT ON (fd.id)
          fd.id AS destination_id,
          dr.id AS route_id,
          dr.round_trip_km
        FROM freight_destinations fd
        JOIN dispatch_routes dr
          ON dr.city = fd.city
         AND dr.is_active = TRUE
        ORDER BY fd.id, dr.round_trip_km DESC NULLS LAST, dr.route_category DESC
      )
      UPDATE dispatch_assignments da
      SET
        route_id = dr.route_id,
        distance_km = dr.round_trip_km
      FROM dest_routes dr
      WHERE da.freight_destination_id = dr.destination_id
        AND (
          da.route_id IS DISTINCT FROM dr.route_id
          OR da.distance_km IS DISTINCT FROM dr.round_trip_km
        )
    `);

    await client.query('COMMIT');
    console.log(`✅ ${rowCount} ردیف dispatch_assignments اصلاح شد.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ خطا:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
