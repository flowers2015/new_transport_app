const pool = require('../db');

async function addEnumValue(client, label) {
  const exists = await client.query(
    `
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role_enum'
      AND e.enumlabel = $1
    `,
    [label]
  );
  if (exists.rows.length > 0) {
    console.log(`✅ نقش ${label} از قبل وجود دارد.`);
    return;
  }
  await client.query(`ALTER TYPE user_role_enum ADD VALUE '${label}'`);
  console.log(`✅ نقش ${label} به user_role_enum اضافه شد.`);
}

async function runMigration() {
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
    if (typeRes.rows[0].udt_name !== 'user_role_enum') {
      console.log(`ℹ️ role از نوع ${typeRes.rows[0].udt_name} است — نیازی به ADD VALUE نیست.`);
      return;
    }
    await addEnumValue(client, 'branch_finance_manager');
    await addEnumValue(client, 'auditor');
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}

module.exports = runMigration;
