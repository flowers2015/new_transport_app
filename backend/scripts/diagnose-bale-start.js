require('dotenv').config();
const pool = require('../db');
const { getDispatchChannelPlans } = require('../services/bale/baleCategoryChannels');
const sessionEngine = require('../services/bale/baleSessionEngine');

async function main() {
  const plans = await getDispatchChannelPlans();
  console.log('channels/plans:', JSON.stringify(plans, null, 2));

  const { rows: queue } = await pool.query(
    `SELECT queue_type, vehicle_category, COUNT(*)::int AS c
     FROM dispatch_queue_entries GROUP BY queue_type, vehicle_category ORDER BY vehicle_category`
  );
  console.log('queue:', queue);

  const { rows: sessions } = await pool.query(
    `SELECT id, status, vehicle_category, stage FROM bale_sessions
     WHERE status NOT IN ('completed','stopped') ORDER BY updated_at DESC LIMIT 5`
  );
  console.log('active sessions:', sessions);

  try {
    const result = await sessionEngine.startAllCategorySessions({
      mode: 'hybrid',
      stage: 'stage1',
      turnTimeoutSec: 180,
      userId: null,
      forceRestart: true,
    });
    console.log('start OK:', { started: result.started, errors: result.errors, skipped: result.skipped });
    await sessionEngine.stopAllSessions();
  } catch (e) {
    console.error('start FAILED:', e.message);
  }

  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
