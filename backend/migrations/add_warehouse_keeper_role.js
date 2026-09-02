const pool = require('../db');

async function runMigration() {
  const client = await pool.connect();
  try {
    const typeRes = await client.query("SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'");
    if (typeRes.rows.length === 0) { console.log('users table not found'); return; }
    const udtName = typeRes.rows[0].udt_name;
    if (udtName !== 'user_role_enum') { console.log('role is not enum type'); return; }
    const exists = await client.query("SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'user_role_enum' AND e.enumlabel = 'warehouse_keeper'");
    if (exists.rows.length > 0) { console.log('warehouse_keeper role exists'); return; }
    await client.query("ALTER TYPE user_role_enum ADD VALUE 'warehouse_keeper'");
    console.log('OK warehouse_keeper role added');
  } finally { client.release(); }
}

if (require.main === module) {
  runMigration().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = runMigration;
