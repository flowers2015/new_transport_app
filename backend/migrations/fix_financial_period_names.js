/**
 * اصلاح نام دوره‌های مالی ثبت‌شده.
 *
 * نام دوره باید از ماهِ تاریخ پایان بیاید، نه تاریخ شروع:
 * دوره‌ای که ۱۴۰۵/۰۴/۲۶ شروع و ۱۴۰۵/۰۵/۲۵ تمام می‌شود «مرداد ۱۴۰۵» است.
 * قبلاً از ماه تاریخ شروع ساخته می‌شد و یک ماه عقب بود.
 *
 * چندبار اجرا شدن اشکالی ندارد؛ فقط ردیف‌هایی را که نامشان با قاعده نمی‌خواند عوض می‌کند.
 * برای دیدن تغییرات بدون اعمال:  node migrations/fix_financial_period_names.js --dry-run
 */
require('dotenv').config();
const pool = require('../db');
const { jalaliMonthLabel } = require('../utils/jalali');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const tableExists = await pool.query(`SELECT to_regclass('public.financial_periods') AS t`);
  if (!tableExists.rows[0]?.t) {
    console.log('ℹ️  جدول financial_periods وجود ندارد — رد شد.');
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, period_name, start_date, end_date
     FROM financial_periods
     ORDER BY start_date ASC`
  );

  const changes = [];
  for (const row of rows) {
    const correct = jalaliMonthLabel(row.end_date);
    if (!correct || correct === row.period_name) continue;
    changes.push({ ...row, correct });
  }

  if (!changes.length) {
    console.log(`✅ نام همه ${rows.length} دوره مالی درست است.`);
    return;
  }

  for (const c of changes) {
    console.log(`   ${c.start_date} تا ${c.end_date}  «${c.period_name}»  →  «${c.correct}»`);
  }

  if (DRY_RUN) {
    console.log(`\nℹ️  ${changes.length} دوره نیاز به اصلاح دارد (اجرای آزمایشی — چیزی تغییر نکرد).`);
    return;
  }

  for (const c of changes) {
    await pool.query(`UPDATE financial_periods SET period_name = $1 WHERE id = $2`, [
      c.correct,
      c.id,
    ]);
  }
  console.log(`✅ ${changes.length} نام دوره مالی اصلاح شد.`);
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async error => {
    console.error('❌ خطا در اصلاح نام دوره‌های مالی:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
