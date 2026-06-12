/**
 * بازیابی خودروهای گم‌شده از اعلام‌بارها
 * وقتی جدول vehicles خالی است ولی freight_announcements هنوز assigned_vehicle_id دارد.
 *
 * اجرا روی سرور:
 *   cd /home/fms/project/backend
 *   node scripts/recover_vehicles_from_freight.js
 *
 * فقط درج — ردیف موجود را overwrite نمی‌کند.
 */

require('dotenv').config();
const pool = require('../db');

function parsePlate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;

  // مثال: 12ب345-11 یا 12ب34511
  const m = s.match(/^(\d{1,2})([آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیA-Za-z])(\d{1,3})-?(\d{1,2})?$/);
  if (!m) return null;
  return {
    part1: m[1],
    letter: m[2],
    part2: m[3],
    cityCode: m[4] || null,
  };
}

async function main() {
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM vehicles');
  console.log(`📊 vehicles فعلی: ${existing.rows[0].n}`);

  const orphans = await pool.query(`
    SELECT DISTINCT ON (fa.assigned_vehicle_id)
      fa.assigned_vehicle_id AS id,
      fa.assigned_vehicle_model AS model,
      fa.assigned_vehicle_brand AS brand,
      fa.vehicle_type,
      fa.vehicle_plate
    FROM freight_announcements fa
    WHERE fa.assigned_vehicle_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vehicles v WHERE v.id = fa.assigned_vehicle_id
      )
    ORDER BY fa.assigned_vehicle_id, fa.updated_at DESC NULLS LAST, fa.created_at DESC
  `);

  console.log(`🔍 خودروی قابل بازیابی از اعلام‌بار: ${orphans.rows.length}`);

  if (orphans.rows.length === 0) {
    console.log('✅ چیزی برای بازیابی نیست.');
    await pool.end();
    return;
  }

  let inserted = 0;
  let skipped = 0;

  for (const row of orphans.rows) {
    const plate = parsePlate(row.vehicle_plate);
    const model = (row.model || row.vehicle_type || 'نامشخص').toString().trim() || 'نامشخص';

    try {
      const result = await pool.query(
        `INSERT INTO vehicles (
          id, model, brand, type, vehicle_category,
          plate_part1, plate_letter, plate_part2, plate_city_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          model,
          row.brand || null,
          row.vehicle_type || null,
          row.vehicle_type || null,
          plate?.part1 || null,
          plate?.letter || null,
          plate?.part2 || null,
          plate?.cityCode || null,
        ]
      );
      if (result.rowCount > 0) inserted += 1;
      else skipped += 1;
    } catch (err) {
      console.error(`❌ خطا برای ${row.id}:`, err.message);
    }
  }

  const after = await pool.query('SELECT COUNT(*)::int AS n FROM vehicles');
  console.log(`✅ درج شد: ${inserted} | رد شد: ${skipped}`);
  console.log(`📊 vehicles بعد از بازیابی: ${after.rows[0].n}`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌', err);
  pool.end();
  process.exit(1);
});
