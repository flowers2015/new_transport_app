require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ override: false });
const pool = require('../db');
const { computeJalaliCycleRange } = require('../services/dispatch/dispatchCycle');

const TARGET_NAMES = [
  'علی اصغر محمدی نسب',
  'محمد رضا ولی پور',
  'کبریا خالقی',
  'علی تراول',
  'رضا قزل باش',
  'رضا کیانی',
  'شهریار کیهانی',
];

function isVeryFarRow(r) {
  const dc = (r.distance_category || '').replace(/\s/g, '');
  const rc = (r.route_category || '').replace(/\s/g, '');
  return /خیلی.?دور|خیلیدور|veryfar/i.test(dc) || /خیلی.?دور|خیلیدور|veryfar/i.test(rc);
}

(async () => {
  const { start, end, fromJalali, toJalali } = computeJalaliCycleRange();
  console.log('Cycle:', fromJalali, '->', toJalali);

  const { rows: nearRows } = await pool.query(`
    SELECT q.id, q.position, q.queue_type, q.vehicle_category, q.driver_id,
           d.name, d.mobile, v.vehicle_code
    FROM dispatch_queue_entries q
    JOIN drivers d ON d.id = q.driver_id
    LEFT JOIN vehicles v ON v.id = q.vehicle_id
    WHERE q.queue_type = 'near'
    ORDER BY q.vehicle_category, q.position
  `);

  console.log('\nNear queue total:', nearRows.length);

  for (const row of nearRows) {
    const { rows: hist } = await pool.query(
      `
      SELECT da.id, da.created_at, da.stage, fa.status, fa.announcement_code,
             dr.city, dr.distance_category, dr.route_category,
             COALESCE(da.assignment_finalized_at, fa.assignment_finalized_at) AS finalized_at,
             COALESCE(da.is_cancelled, false) AS is_cancelled
      FROM dispatch_assignments da
      LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
      LEFT JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
      WHERE da.driver_id = $1
        AND da.created_at >= $2 AND da.created_at <= $3
        AND COALESCE(da.is_cancelled, false) = false
        AND fa.status NOT IN ('Cancelled')
      ORDER BY da.created_at DESC
    `,
      [row.driver_id, start, end]
    );

    const vfAny = hist.filter(isVeryFarRow);
    const vfFinal = vfAny.filter((r) => r.finalized_at || r.status === 'Finalized');

    const isTarget = TARGET_NAMES.some((n) => (row.name || '').includes(n) || n.includes(row.name || ''));
    if (isTarget || row.vehicle_category === 'تریلی') {
      console.log('\n---', row.name, '| pos', row.position, '|', row.vehicle_category, '| code', row.vehicle_code);
      console.log('  assignments in cycle:', hist.length);
      console.log('  very-far (raw):', vfAny.length, '| very-far finalized:', vfFinal.length);
      vfFinal.forEach((r) =>
        console.log('   VF finalized:', r.announcement_code, r.city, r.status)
      );
      if (vfAny.length && !vfFinal.length) {
        console.log('  (has VF assign but not finalized — should NOT count in rules)');
        vfAny.slice(0, 2).forEach((r) =>
          console.log('   VF pending:', r.announcement_code, r.status)
        );
      }
    }
  }

  const { getQueueAssignHints, resolveEffectivePhase } = require('../services/dispatch/dispatchAssignContext');
  for (const cat of ['تریلی', 'مینی تریلی', 'ده چرخ']) {
    const phase = await resolveEffectivePhase(cat);
    console.log('\n=== Category:', cat, '===');
    console.log('Global phase:', phase.phase);
    const hints = await getQueueAssignHints(cat);
    const near = nearRows.filter((r) => r.vehicle_category === cat);
    for (const n of near) {
      const h = hints.entries.find((e) => e.queueEntryId === n.id);
      console.log(
        `  pos ${n.position} ${n.name}: rowStatus=${h?.rowStatus} vfHist=${h?.hasVeryFarHistory} eligible=${h?.eligibleLoadCount} entryPhase=${h?.entryPhase}`
      );
    }
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
