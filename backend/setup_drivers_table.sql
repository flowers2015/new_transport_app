-- ایجاد جدول drivers با تمام فیلدهای مورد نیاز
CREATE TABLE IF NOT EXISTS drivers (
    id VARCHAR(255) PRIMARY KEY,
    employee_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    father_name VARCHAR(255),
    national_id VARCHAR(255) UNIQUE NOT NULL,
    birth_date DATE,
    id_number VARCHAR(255),
    birth_place VARCHAR(255),
    issue_place VARCHAR(255),
    home_phone VARCHAR(255),
    work_phone VARCHAR(255),
    mobile VARCHAR(255),
    postal_code VARCHAR(255),
    home_address TEXT,
    work_location VARCHAR(255),
    job_title VARCHAR(255),
    hire_date DATE,
    termination_date DATE,
    license_number VARCHAR(255),
    license_type VARCHAR(255),
    license_issue_date DATE,
    license_issue_place VARCHAR(255),
    license_expiry_date DATE,
    current_vehicle_type VARCHAR(255),
    current_vehicle_plate VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- اضافه کردن ایندکس‌ها برای بهبود عملکرد
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX IF NOT EXISTS idx_drivers_national_id ON drivers(national_id);
CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name);
CREATE INDEX IF NOT EXISTS idx_drivers_mobile ON drivers(mobile);
CREATE INDEX IF NOT EXISTS idx_drivers_is_deleted ON drivers(is_deleted);

-- اضافه کردن داده‌های نمونه (اختیاری)
INSERT INTO drivers (
    id, employee_id, name, father_name, national_id, mobile, 
    work_location, job_title, license_type, created_at, updated_at
) VALUES (
    'sample-driver-1', 'EMP001', 'احمد محمدی', 'علی', '1234567890', '09123456789',
    'تهران', 'راننده', 'پایه یک', NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO drivers (
    id, employee_id, name, father_name, national_id, mobile, 
    work_location, job_title, license_type, created_at, updated_at
) VALUES (
    'sample-driver-2', 'EMP002', 'رضا احمدی', 'حسن', '0987654321', '09187654321',
    'اصفهان', 'راننده', 'پایه دو', NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;
