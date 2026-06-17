/**
 * غیرفعال کردن اجبار تغییر رمز برای همه کاربران بیننده
 * اجرا: node backend/scripts/fix-viewer-password-flags.js
 */
require('dotenv').config();
const pool = require('../db');

async function main() {
  const res = await pool.query(
    `UPDATE users SET must_change_password = FALSE WHERE LOWER(role::text) = 'viewer' RETURNING username`
  );
  console.log(`✅ ${res.rowCount} کاربر بیننده به‌روز شد:`, res.rows.map(r => r.username).join(', ') || '(هیچ)');
  await pool.end();
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
