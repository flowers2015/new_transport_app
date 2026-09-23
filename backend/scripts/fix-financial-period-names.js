/**
 * اصلاح نام دوره‌های مالی ثبت‌شده.
 *
 * قانون: نام دوره از ماهِ تاریخ پایان می‌آید، نه تاریخ شروع.
 * مثال: 1405/04/26 تا 1405/05/25 → «مرداد 1405»
 *
 * پیش‌فرض فقط گزارش می‌دهد. برای اعمال تغییر:  node scripts/fix-financial-period-names.js --apply
 */
require('dotenv').config();
const pool = require('../db');
const { jalaliMonthName } = require('../utils/jalali');

const APPLY = process.argv.includes('--apply');

function buildPeriodName(endDate) {
  const parts = String(endDate || '').replace(/-/g, '/').split('/');
  if (parts.length < 2) return null;
  const monthName = jalaliMonthName(parseInt(parts[1], 10));
  if (!monthName) return null;
  return `${monthName} ${parts[0]}`;
}

(async () => {
  const { rows } = await pool.query(
    `SELECT id, period_name, start_date, end_date, status
     FROM financial_periods
     ORDER BY start_date ASC`
  );

  const changes = [];
  for (const row of rows) {
    const correct = buildPeriodName(row.end_date);
    if (!correct || correct === row.period_name) continue;
    changes.push({ ...row, correct });
  }

  console.log(`دوره‌ها: ${rows.length} | نیازمند اصلاح: ${changes.length}\n`);
  for (const c of changes) {
    console.log(`  ${c.start_date} تا ${c.end_date}  «${c.period_name}»  →  «${c.correct}»`);
  }

  if (!changes.length) {
    console.log('\nهمه نام‌ها درست است.');
  } else if (!APPLY) {
    console.log('\nفقط گزارش بود. برای اعمال: node scripts/fix-financial-period-names.js --apply');
  } else {
    for (const c of changes) {
      await pool.query(`UPDATE financial_periods SET period_name = $1 WHERE id = $2`, [
        c.correct,
        c.id,
      ]);
    }
    console.log(`\n${changes.length} نام دوره اصلاح شد.`);
  }

  await pool.end();
})().catch(e => {
  console.error('ERR', e.message);
  process.exit(1);
});
