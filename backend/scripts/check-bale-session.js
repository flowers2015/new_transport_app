require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

async function main() {
  const session = await pool.query(
    `SELECT * FROM bale_sessions ORDER BY created_at DESC LIMIT 1`
  );
  console.log('session:', session.rows[0]?.status, session.rows[0]?.current_turn_index);

  const s = session.rows[0];
  if (s?.queue_snapshot) {
    const q = typeof s.queue_snapshot === 'string' ? JSON.parse(s.queue_snapshot) : s.queue_snapshot;
    const first = q[s.current_turn_index || 0];
    console.log('current turn driver:', first?.driver?.name, first?.driver?.employeeId);
    if (first?.driverId || first?.driver_id) {
      const id = first.driverId || first.driver_id;
      const o = await pool.query(
        `SELECT * FROM bale_driver_outreach o JOIN drivers d ON d.id=o.driver_id WHERE o.driver_id=$1`,
        [id]
      );
      console.log('current outreach:', o.rows[0]);
    }
  }

  const wrong = await pool.query(
    `SELECT d.name, d.employee_id, o.outreach_chat_id
     FROM bale_driver_outreach o JOIN drivers d ON d.id=o.driver_id
     WHERE o.outreach_chat_id::text LIKE '%190026447%'`
  );
  console.log('outreach with 190026447*:', wrong.rows);

  const logs = await pool.query(
    `SELECT event_type, payload, created_at FROM bale_session_logs ORDER BY created_at DESC LIMIT 10`
  );
  console.log('logs:', logs.rows);
  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
