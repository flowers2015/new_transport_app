/**
 * پاک‌کردن تاریخ اتمام تخصیص از تخصیص‌های لغوشده گذشته.
 *
 * تا پیش از این، دکمه «لغو» در پیگیری اعلام بار زنده فقط is_cancelled را TRUE می‌کرد
 * و assignment_finalized_at را دست‌نخورده می‌گذاشت. نتیجه: راننده به نوبت برمی‌گشت
 * ولی همان سفرِ نرفته در سابقه خیلی‌دورِ دوره برایش می‌ماند.
 *
 * چرا فقط is_cancelled کافی نیست:
 * clearPriorBoardAssignments هنگام تخصیص بار جدید، تمام ردیف‌های قبلی همان راننده/خودرو
 * را برای مرتب‌ماندن تابلو is_cancelled می‌کند — حتی سفرهایی که واقعاً انجام شده‌اند.
 * پس ملاک قطعیِ «این سفر انجام نشده» این است که اعلام‌بار دیگر به نام این راننده نباشد:
 * لغو تخصیص، assigned_driver_id را NULL می‌کند و تخصیص مجدد آن را به راننده دیگری می‌دهد.
 *
 * چندبار اجرا شدن اشکالی ندارد.
 * برای دیدن بدون اعمال:  node migrations/fix_cancelled_assignment_finalized_at.js --dry-run
 */
require('dotenv').config();
const pool = require('../db');

const DRY_RUN = process.argv.includes('--dry-run');

/** ردیف‌هایی که هنوز تاریخ اتمام دارند ولی اعلام‌بار به نام راننده دیگری (یا هیچ‌کس) است */
const TARGET_WHERE = `
  da.assignment_finalized_at IS NOT NULL
  AND da.is_cancelled = TRUE
  AND (
    fa.assigned_driver_id IS NULL
    OR fa.assigned_driver_id::text <> da.driver_id::text
  )
`;

async function run() {
  const exists = await pool.query(`SELECT to_regclass('public.dispatch_assignments') AS t`);
  if (!exists.rows[0]?.t) {
    console.log('ℹ️  جدول dispatch_assignments وجود ندارد — رد شد.');
    return;
  }

  const preview = await pool.query(`
    SELECT
      d.name AS driver_name,
      d.employee_id,
      fa.announcement_code,
      COALESCE(dr.city, '—') AS route_city,
      dr.round_trip_km,
      da.assignment_finalized_at,
      fa.status AS freight_status
    FROM dispatch_assignments da
    JOIN freight_announcements fa ON fa.id = da.freight_announcement_id
    LEFT JOIN drivers d ON d.id::text = da.driver_id::text
    LEFT JOIN dispatch_routes dr ON dr.id = da.route_id
    WHERE ${TARGET_WHERE}
    ORDER BY da.assignment_finalized_at DESC
  `);

  if (preview.rowCount === 0) {
    console.log('✅ هیچ تخصیص لغوشده‌ای با تاریخ اتمام باقی نمانده است.');
    return;
  }

  console.log(`تخصیص‌های لغوشده که هنوز در سابقه شمرده می‌شوند: ${preview.rowCount}\n`);
  for (const r of preview.rows) {
    const km = r.round_trip_km ? `${r.round_trip_km} km` : '—';
    const at = r.assignment_finalized_at
      ? new Date(r.assignment_finalized_at).toISOString().slice(0, 10)
      : '—';
    console.log(
      `   ${at}  ${r.employee_id || '—'} ${r.driver_name || '—'}  ${r.announcement_code || '—'}  ${r.route_city} (${km})  [${r.freight_status}]`
    );
  }

  if (DRY_RUN) {
    console.log(`\nℹ️  ${preview.rowCount} ردیف نیاز به اصلاح دارد (اجرای آزمایشی — چیزی تغییر نکرد).`);
    return;
  }

  const result = await pool.query(`
    UPDATE dispatch_assignments da
    SET assignment_finalized_at = NULL
    FROM freight_announcements fa
    WHERE fa.id = da.freight_announcement_id
      AND ${TARGET_WHERE}
  `);
  console.log(`\n✅ ${result.rowCount} تخصیص لغوشده از سابقه خیلی‌دور خارج شد.`);
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async error => {
    console.error('❌ خطا در اصلاح تخصیص‌های لغوشده:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
