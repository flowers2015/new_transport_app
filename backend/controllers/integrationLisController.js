const pool = require('../db');

/**
 * جستجوی فقط‌خواندنی با کد LIS → مشخصات راننده و خودرو (همان چیزی که در پیگیری/آرشیو دیده می‌شود)
 * شناسه عددی برنمی‌گردد؛ نام خوانا برمی‌گردد.
 */
async function lookupByLisCode(req, res) {
  const raw =
    (req.query && (req.query.lisCode || req.query.lis_code)) ||
    (req.body && (req.body.lisCode || req.body.lis_code)) ||
    '';
  const lisCode = String(raw).trim();

  if (!lisCode) {
    return res.status(400).json({ message: 'کد LIS الزامی است.', found: false });
  }
  if (lisCode.length > 100) {
    return res.status(400).json({ message: 'کد LIS نامعتبر است.', found: false });
  }
  // فقط حروف/عدد و چند جداکننده رایج — جلوگیری از ورودی عجیب
  if (!/^[\w\u0600-\u06FF\-./]+$/u.test(lisCode)) {
    return res.status(400).json({ message: 'فرمت کد LIS مجاز نیست.', found: false });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        TRIM(fd.lis_code) AS lis_code,
        fa.announcement_code,
        fa.vehicle_type,
        COALESCE(fa.assigned_driver_name, d.name, pd.name) AS driver_name,
        COALESCE(d.mobile, pd.mobile) AS driver_mobile,
        COALESCE(
          NULLIF(TRIM(fa.vehicle_plate), ''),
          CASE
            WHEN v.plate_part1 IS NOT NULL THEN
              CONCAT(v.plate_part1, v.plate_letter, v.plate_part2, '-', v.plate_city_code)
            WHEN pv.plate_part1 IS NOT NULL THEN
              CONCAT(pv.plate_part1, pv.plate_letter, pv.plate_part2, '-', pv.plate_city_code)
            ELSE NULL
          END
        ) AS vehicle_plate,
        COALESCE(NULLIF(TRIM(v.vehicle_code), ''), NULLIF(TRIM(v.serial_number), ''), '') AS vehicle_code
      FROM freight_destinations fd
      INNER JOIN freight_announcements fa ON fa.id = fd.freight_announcement_id
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN personal_drivers pd ON fa.assigned_driver_id = pd.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      LEFT JOIN personal_vehicles pv ON fa.assigned_vehicle_id = pv.id
      WHERE TRIM(fd.lis_code) = $1
      ORDER BY fa.created_at DESC NULLS LAST
      LIMIT 1
      `,
      [lisCode]
    );

    if (!rows.length) {
      return res.status(404).json({
        found: false,
        lisCode,
        message: 'با این کد LIS رکوردی یافت نشد.',
      });
    }

    const row = rows[0];
    return res.json({
      found: true,
      lisCode: row.lis_code || lisCode,
      announcementCode: row.announcement_code || null,
      driverName: row.driver_name || null,
      driverMobile: row.driver_mobile || null,
      vehicleType: row.vehicle_type || null,
      vehiclePlate: row.vehicle_plate || null,
      vehicleCode: row.vehicle_code || null,
    });
  } catch (err) {
    console.error('❌ [integration/lis-lookup]', err.message);
    return res.status(500).json({ message: 'خطای داخلی سرور.', found: false });
  }
}

module.exports = { lookupByLisCode };
