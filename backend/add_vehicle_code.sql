-- Add vehicle_code column to vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_code VARCHAR(50) UNIQUE;

-- Add comment to the column
COMMENT ON COLUMN vehicles.vehicle_code IS 'کد خودرو برای سنگین/نیمه یدک - پل ارتباطی بین جستجو و تخصیص';
