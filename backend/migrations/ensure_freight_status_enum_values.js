/**
 * اطمینان از وجود مقادیر وضعیت لازم (ChangeRequested, Archived, Leftover) در enum یا VARCHAR
 * اجرا: node backend/migrations/ensure_freight_status_enum_values.js
 */

const pool = require('../db');

const REQUIRED_STATUSES = ['ChangeRequested', 'Archived', 'Leftover'];

async function run() {
  const client = await pool.connect();
  try {
    const typeRes = await client.query(`
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'freight_announcements'
        AND column_name = 'status'
    `);

    if (typeRes.rows.length === 0) {
      console.log('ℹ️ جدول freight_announcements یا ستون status یافت نشد.');
      return;
    }

    const udtName = typeRes.rows[0].udt_name;
    if (udtName !== 'freight_announcement_status_enum') {
      console.log(`ℹ️ status از نوع ${udtName} است (نه enum) — نیازی به ADD VALUE نیست.`);
      return;
    }

    for (const label of REQUIRED_STATUSES) {
      const exists = await client.query(
        `
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'freight_announcement_status_enum'
          AND e.enumlabel = $1
        `,
        [label]
      );
      if (exists.rows.length > 0) {
        console.log(`✓ ${label} از قبل در enum هست`);
        continue;
      }
      await client.query(
        `ALTER TYPE freight_announcement_status_enum ADD VALUE '${label}'`
      );
      console.log(`✅ ${label} به enum اضافه شد`);
    }
  } finally {
    client.release();
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌ ensure_freight_status_enum_values failed:', e);
      process.exit(1);
    });
}

module.exports = run;
