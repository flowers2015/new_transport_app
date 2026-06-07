require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');
const { isVeryFarAnnouncement } = require('../services/dispatch/dispatchRouteRules');

(async () => {
  const { rows } = await pool.query(`
    SELECT fa.id, fa.announcement_code, fa.vehicle_type, fa.status, fa.line_type, fa.created_at,
           dr.city, dr.distance_category, dr.round_trip_km
    FROM freight_announcements fa
    LEFT JOIN freight_destinations fd ON fd.freight_announcement_id = fa.id
    LEFT JOIN dispatch_routes dr ON dr.city = fd.city AND dr.is_active = TRUE
    WHERE fa.status IN ('PendingCompanyAssignment', 'PendingPersonalAssignment', 'Assigned')
      AND fa.assigned_driver_id IS NULL
    ORDER BY fa.created_at DESC
  `);

  const byAnn = {};
  for (const row of rows) {
    if (!byAnn[row.id]) byAnn[row.id] = { ...row, routes: [] };
    if (row.city) byAnn[row.id].routes.push(row);
  }

  for (const ann of Object.values(byAnn)) {
    const route = ann.routes.sort((a, b) => (b.round_trip_km || 0) - (a.round_trip_km || 0))[0];
    const payload = {
      id: ann.id,
      code: ann.announcement_code,
      vehicleType: ann.vehicle_type,
      lineType: ann.line_type,
      city: route?.city,
      distance_category: route?.distance_category,
      km: route?.round_trip_km,
      isVeryFar: isVeryFarAnnouncement({ route }),
    };
    console.log(payload);
  }

  const vfCount = Object.values(byAnn).filter((a) => {
    const route = a.routes[0];
    return isVeryFarAnnouncement({ route: route || {} });
  }).length;
  console.log('\nTotal pending:', Object.keys(byAnn).length, '| VeryFar:', vfCount);

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
