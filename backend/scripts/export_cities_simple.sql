-- اسکریپت ساده برای استخراج داده‌های شهرها از dispatch_routes
-- این اسکریپت داده‌های موجود در dispatch_routes را به فرمت JSON برای جدول cities تبدیل می‌کند

-- خروجی JSON از dispatch_routes (اگر جدول cities وجود ندارد)
SELECT json_agg(
    json_build_object(
        'cityName', city,
        'province', province,
        'approvedMissionDays', NULL,
        'cityKilometers', CASE 
            WHEN round_trip_km IS NOT NULL THEN round_trip_km / 2 
            ELSE NULL 
        END
    )
    ORDER BY province, city
) AS cities_json
FROM (
    SELECT DISTINCT
        city,
        province,
        MAX(round_trip_km) as round_trip_km
    FROM dispatch_routes
    WHERE is_active = TRUE 
      AND city IS NOT NULL 
      AND city != ''
      AND province IS NOT NULL 
      AND province != ''
    GROUP BY city, province
) AS unique_cities;

