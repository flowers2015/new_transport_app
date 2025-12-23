-- اسکریپت برای استخراج داده‌های شهرها از dispatch_routes و تبدیل به JSON
-- این اسکریپت داده‌های موجود در dispatch_routes را به فرمت JSON برای جدول cities تبدیل می‌کند

-- اگر جدول cities وجود دارد، از آن استفاده کن
DO $$
DECLARE
    result_json JSON;
BEGIN
    -- بررسی وجود جدول cities
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cities'
    ) THEN
        -- اگر جدول cities وجود دارد، از آن استفاده کن
        SELECT json_agg(
            json_build_object(
                'cityName', city_name,
                'province', province,
                'approvedMissionDays', approved_mission_days,
                'cityKilometers', city_kilometers
            )
            ORDER BY province, city_name
        ) INTO result_json
        FROM cities;
        
        RAISE NOTICE 'جدول cities پیدا شد. تعداد رکوردها: %', (SELECT COUNT(*) FROM cities);
    ELSE
        -- اگر جدول cities وجود ندارد، از dispatch_routes استفاده کن
        RAISE NOTICE 'جدول cities وجود ندارد. استفاده از dispatch_routes...';
        
        SELECT json_agg(
            DISTINCT json_build_object(
                'cityName', city,
                'province', province,
                'approvedMissionDays', NULL, -- در dispatch_routes این فیلد وجود ندارد
                'cityKilometers', round_trip_km / 2 -- کیلومتر رفت و برگشت تقسیم بر 2
            )
            ORDER BY province, city
        ) INTO result_json
        FROM dispatch_routes
        WHERE is_active = TRUE 
          AND city IS NOT NULL 
          AND province IS NOT NULL;
        
        RAISE NOTICE 'تعداد رکوردهای dispatch_routes: %', (SELECT COUNT(DISTINCT city) FROM dispatch_routes WHERE is_active = TRUE);
    END IF;
    
    -- نمایش نتیجه
    IF result_json IS NOT NULL THEN
        RAISE NOTICE 'JSON Result:';
        RAISE NOTICE '%', result_json::text;
    ELSE
        RAISE NOTICE 'هیچ داده‌ای یافت نشد';
    END IF;
END $$;

-- خروجی JSON برای کپی کردن
-- اگر جدول cities وجود دارد:
SELECT json_agg(
    json_build_object(
        'cityName', COALESCE(city_name, ''),
        'province', COALESCE(province, ''),
        'approvedMissionDays', approved_mission_days,
        'cityKilometers', city_kilometers
    )
    ORDER BY province, city_name
) AS cities_json
FROM (
    SELECT DISTINCT
        CASE 
            WHEN EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'cities'
            ) THEN (SELECT city_name FROM cities LIMIT 1)
            ELSE dr.city
        END AS city_name,
        CASE 
            WHEN EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'cities'
            ) THEN (SELECT province FROM cities LIMIT 1)
            ELSE dr.province
        END AS province,
        NULL::INTEGER AS approved_mission_days,
        CASE 
            WHEN EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'cities'
            ) THEN NULL::NUMERIC
            ELSE (dr.round_trip_km / 2)::NUMERIC
        END AS city_kilometers
    FROM dispatch_routes dr
    WHERE dr.is_active = TRUE 
      AND dr.city IS NOT NULL 
      AND dr.province IS NOT NULL
    GROUP BY dr.city, dr.province, dr.round_trip_km
) AS city_data;

