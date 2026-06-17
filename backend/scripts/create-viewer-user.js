/**
 * ایجاد کاربر بیننده (فقط مشاهده اعلام بار)
 * اجرا: node backend/scripts/create-viewer-user.js [username] [password] [fullName]
 * مثال: node backend/scripts/create-viewer-user.js viewer Viewer@123 "کاربر بیننده"
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const addViewerRole = require('../migrations/add_viewer_role');

function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

async function main() {
  const username = (process.argv[2] || 'viewer').trim();
  const password = process.argv[3] || 'Viewer@123';
  const fullName = process.argv[4] || 'کاربر بیننده';

  if (!username || !password) {
    console.error('نام کاربری و رمز عبور الزامی است.');
    process.exit(1);
  }

  try {
    await addViewerRole();
  } catch (e) {
    console.warn('⚠️ migration viewer role:', e.message);
  }

  const existing = await pool.query(`SELECT id FROM users WHERE username = $1`, [username]);
  if (existing.rows.length > 0) {
    console.error(`❌ کاربر «${username}» از قبل وجود دارد.`);
    process.exit(1);
  }

  const columnCheck = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name IN ('email', 'full_name', 'name', 'must_change_password')
  `);
  const cols = new Set(columnCheck.rows.map(r => r.column_name));

  const id = generateUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  const insertColumns = ['id', 'username', 'password_hash', 'role'];
  const insertValues = [id, username, passwordHash, 'viewer'];

  if (cols.has('email')) {
    insertColumns.push('email');
    insertValues.push(`${username}@viewer.local`);
  }
  if (cols.has('full_name')) {
    insertColumns.push('full_name');
    insertValues.push(fullName);
  } else if (cols.has('name')) {
    insertColumns.push('name');
    insertValues.push(fullName);
  }
  if (cols.has('must_change_password')) {
    insertColumns.push('must_change_password');
    insertValues.push(false);
  }

  const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(
    `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    insertValues
  );

  console.log('✅ کاربر بیننده ایجاد شد:');
  console.log(`   username: ${username}`);
  console.log(`   password: ${password}`);
  console.log(`   role: viewer`);
  console.log('   دسترسی: فقط مشاهده پیگیری زنده و آرشیو اعلام بار');

  await pool.end();
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
