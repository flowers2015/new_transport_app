-- ============================================
-- اسکریپت SQL برای استخراج داده‌های شهرها به فرمت JSON
-- این اسکریپت را در pgAdmin یا psql اجرا کنید
-- ============================================

-- روش 1: اگر جدول cities وجود دارد
-- این کوئری را اجرا کنید و خروجی JSON را کپی کنید:

SELECT json_agg(
    json_build_object(
        'cityName', city_name,
        'province', province,
        'approvedMissionDays', approved_mission_days,
        'cityKilometers', city_kilometers
    )
    ORDER BY province, city_name
) AS cities_json
FROM cities
WHERE city_name IS NOT NULL 
  AND province IS NOT NULL;

-- ============================================
-- روش 2: اگر جدول cities وجود ندارد، از dispatch_routes استفاده کنید
-- این کوئری را اجرا کنید و خروجی JSON را کپی کنید:

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

-- ============================================
-- روش 3: خروجی به صورت آرایه JSON (هر شهر یک ردیف)
-- این روش برای کپی کردن راحت‌تر است:

SELECT 
    json_build_object(
        'cityName', city,
        'province', province,
        'approvedMissionDays', NULL,
        'cityKilometers', CASE 
            WHEN round_trip_km IS NOT NULL THEN round_trip_km / 2 
            ELSE NULL 
        END
    ) AS city_json
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
) AS unique_cities
ORDER BY province, city;

