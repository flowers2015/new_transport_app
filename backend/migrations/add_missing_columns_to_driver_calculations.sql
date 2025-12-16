-- Migration: اضافه کردن ستون‌های گمشده به جدول driver_calculations
-- این migration ستون‌هایی را که در کد استفاده می‌شوند اما در جدول وجود ندارند اضافه می‌کند

-- اضافه کردن ستون‌های مربوط به راننده کمکی
ALTER TABLE driver_calculations 
ADD COLUMN IF NOT EXISTS helper_driver_excess_kilometers INTEGER DEFAULT 0;

-- اضافه کردن ستون‌های مربوط به خودرو و مقاصد
ALTER TABLE driver_calculations 
ADD COLUMN IF NOT EXISTS vehicle_code VARCHAR(255),
ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(255),
ADD COLUMN IF NOT EXISTS destinations TEXT;

-- اضافه کردن ستون‌های مربوط به چندجا تخلیه و پیش پرداخت
ALTER TABLE driver_calculations 
ADD COLUMN IF NOT EXISTS multi_unload_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance_payment INTEGER DEFAULT 0;

-- اضافه کردن ستون‌های مربوط به دپو
ALTER TABLE driver_calculations 
ADD COLUMN IF NOT EXISTS depot_total_mileage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_shipment_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_cargo_handling_cost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_mission_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_kilometer_rate INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_food_cost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_mission_cost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS depot_rows JSONB;

-- اضافه کردن ستون‌های مربوط به وضعیت و دوره
ALTER TABLE driver_calculations 
ADD COLUMN IF NOT EXISTS commission_status VARCHAR(30) DEFAULT 'recorded',
ADD COLUMN IF NOT EXISTS period_id VARCHAR(255);

-- نمایش پیام موفقیت
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed: ستون‌های گمشده به driver_calculations اضافه شدند';
END $$;

