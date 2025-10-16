-- اضافه کردن فیلدهای جدید به جدول drivers موجود
-- این script فقط فیلدهای جدید را اضافه می‌کند، فیلدهای موجود را تغییر نمی‌دهد

-- اضافه کردن فیلدهای جدید (اگر وجود ندارند)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS father_name VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS id_number VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS birth_place VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS issue_place VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS home_phone VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS work_phone VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS postal_code VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS work_location VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS termination_date DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_number VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_issue_date DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_issue_place VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expiry_date DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_vehicle_type VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_vehicle_plate VARCHAR(255);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- اضافه کردن ایندکس‌ها
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX IF NOT EXISTS idx_drivers_national_id ON drivers(national_id);
CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name);
CREATE INDEX IF NOT EXISTS idx_drivers_mobile ON drivers(mobile);
CREATE INDEX IF NOT EXISTS idx_drivers_is_deleted ON drivers(is_deleted);

-- نمایش ساختار نهایی جدول
\d drivers;
