/**
 * افزودن نقش viewer به enum نقش کاربران (در صورت وجود enum)
 * اجرا: node backend/migrations/add_viewer_role.js
 */
const pool = require('../db');

async function run() {
  const client = await pool.connect();
  try {
    const typeRes = await client.query(`
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'role'
    `);

    if (typeRes.rows.length === 0) {
      console.log('ℹ️ جدول users یا ستون role یافت نشد.');
      return;
    }

    const udtName = typeRes.rows[0].udt_name;
    if (udtName !== 'user_role_enum') {
      console.log(`ℹ️ role از نوع ${udtName} است — نیازی به ADD VALUE نیست.`);
      return;
    }

    const exists = await client.query(
      `
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'user_role_enum'
        AND e.enumlabel = 'viewer'
      `
    );

    if (exists.rows.length > 0) {
      console.log('✅ نقش viewer از قبل وجود دارد.');
      return;
    }

    await client.query(`ALTER TYPE user_role_enum ADD VALUE 'viewer'`);
    console.log('✅ نقش viewer به user_role_enum اضافه شد.');
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}

module.exports = run;
