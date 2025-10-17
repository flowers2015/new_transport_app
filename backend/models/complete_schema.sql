-- Complete Database Schema for Transport Management System
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================
-- 1. جداول اصلی و مدیریتی
-- ==============================================

-- جدول branches (شعب)
CREATE TABLE branches (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول users (کاربران)
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255),
    branch_city VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول audit_logs (لاگ تراکنش‌ها)
CREATE TABLE audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_id VARCHAR(255) REFERENCES users(id),
    user_name VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول support_tickets (تیکت‌های پشتیبانی)
CREATE TABLE support_tickets (
    id VARCHAR(255) PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(255) DEFAULT 'Open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    created_by_user_name VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 2. جداول ناوگان و پرسنل
-- ==============================================

-- جدول vehicles (خودروها) - کامل
CREATE TABLE vehicles (
    id VARCHAR(255) PRIMARY KEY,
    plate_part1 VARCHAR(2),
    plate_letter VARCHAR(10),
    plate_part2 VARCHAR(3),
    plate_city_code VARCHAR(2),
    serial_number VARCHAR(255),
    model VARCHAR(255) NOT NULL,
    type VARCHAR(255),
    branch_id VARCHAR(255) REFERENCES branches(id),
    holding_company VARCHAR(255),
    mihan_company VARCHAR(255),
    vehicle_category VARCHAR(255),
    brand VARCHAR(255),
    color VARCHAR(255),
    owner_name VARCHAR(255),
    card_id VARCHAR(255),
    vin VARCHAR(255) UNIQUE,
    usage_type VARCHAR(255),
    province VARCHAR(255),
    engine_number VARCHAR(255),
    vehicle_tip VARCHAR(255),
    chassis_number VARCHAR(255),
    capacity VARCHAR(255),
    year INT,
    wheel_count INT,
    axle_count INT,
    cylinder_count INT,
    domain_name VARCHAR(255),
    fuel_type VARCHAR(255),
    status VARCHAR(255),
    engine_power INT,
    torque INT,
    emission_standard VARCHAR(255),
    engine_model VARCHAR(255),
    gearbox_model VARCHAR(255),
    gear_count VARCHAR(255),
    length DECIMAL(10, 2),
    width DECIMAL(10, 2),
    gross_weight DECIMAL(10, 2),
    net_weight DECIMAL(10, 2),
    brake_system VARCHAR(255),
    market_price VARCHAR(255),
    production_model VARCHAR(255),
    advantages TEXT,
    disadvantages TEXT,
    leasing_conditions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول vehicle_owner_history (تاریخچه مالکین)
CREATE TABLE vehicle_owner_history (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    owner_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول drivers (رانندگان و پرسنل) - کامل
CREATE TABLE drivers (
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 3. جداول تعمیرگاه، انبار و خرید
-- ==============================================

-- جدول technicians (تعمیرکاران)
CREATE TABLE technicians (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول parts (قطعات انبار)
CREATE TABLE parts (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    part_number VARCHAR(255) UNIQUE NOT NULL,
    quantity_in_stock INT DEFAULT 0,
    price DECIMAL(15, 2) DEFAULT 0,
    min_stock_level INT DEFAULT 0,
    location VARCHAR(255),
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول repair_orders (سفارش‌های تعمیر)
CREATE TABLE repair_orders (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    driver_id VARCHAR(255) REFERENCES drivers(id),
    branch_id VARCHAR(255) NOT NULL REFERENCES branches(id),
    description TEXT NOT NULL,
    status VARCHAR(255) NOT NULL DEFAULT 'Pending',
    priority VARCHAR(255) DEFAULT 'Normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    assigned_technician_id VARCHAR(255) REFERENCES technicians(id)
);

-- جدول part_usages (قطعات مصرفی)
CREATE TABLE part_usages (
    id VARCHAR(255) PRIMARY KEY,
    repair_order_id VARCHAR(255) NOT NULL REFERENCES repair_orders(id),
    part_id VARCHAR(255) NOT NULL REFERENCES parts(id),
    quantity_used INT NOT NULL,
    usage_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول suppliers (تامین‌کنندگان)
CREATE TABLE suppliers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول purchase_orders (سفارش‌های خرید)
CREATE TABLE purchase_orders (
    id VARCHAR(255) PRIMARY KEY,
    supplier_id VARCHAR(255) NOT NULL REFERENCES suppliers(id),
    order_date TIMESTAMPTZ DEFAULT NOW(),
    expected_delivery_date DATE,
    status VARCHAR(255) DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول purchase_order_items (اقلام سفارش خرید)
CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id VARCHAR(255) NOT NULL REFERENCES purchase_orders(id),
    part_id VARCHAR(255) NOT NULL REFERENCES parts(id),
    quantity INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول outsourcing_requests (درخواست‌های برون‌سپاری)
CREATE TABLE outsourcing_requests (
    id VARCHAR(255) PRIMARY KEY,
    repair_order_id VARCHAR(255) NOT NULL REFERENCES repair_orders(id),
    supplier_id VARCHAR(255) NOT NULL REFERENCES suppliers(id),
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 4. جداول مالی
-- ==============================================

-- جدول invoices (فاکتورها)
CREATE TABLE invoices (
    id VARCHAR(255) PRIMARY KEY,
    repair_order_id VARCHAR(255) REFERENCES repair_orders(id),
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    total_amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(255) DEFAULT 'Pending',
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول invoice_items (اقلام فاکتور)
CREATE TABLE invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(255) NOT NULL REFERENCES invoices(id),
    description VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    total DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 5. جداول حمل و نقل (Freight)
-- ==============================================

-- جدول freight_announcements (اعلام بارها)
CREATE TABLE freight_announcements (
    id VARCHAR(255) PRIMARY KEY,
    announcement_code VARCHAR(255) UNIQUE NOT NULL,
    loading_date DATE NOT NULL,
    line_type VARCHAR(255) NOT NULL,
    status VARCHAR(255) DEFAULT 'Draft',
    cargo_value BIGINT DEFAULT 0,
    vehicle_type VARCHAR(255) NOT NULL,
    assignment_type VARCHAR(255),
    assigned_driver_id VARCHAR(255) REFERENCES drivers(id),
    assigned_vehicle_id VARCHAR(255) REFERENCES vehicles(id),
    total_freight_cost DECIMAL(15, 2),
    carton_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول freight_destinations (مقاصد اعلام بار)
CREATE TABLE freight_destinations (
    id VARCHAR(255) PRIMARY KEY,
    freight_announcement_id VARCHAR(255) NOT NULL REFERENCES freight_announcements(id),
    city VARCHAR(255) NOT NULL,
    representative_name VARCHAR(255),
    tonnage DECIMAL(10, 2),
    freight_cost DECIMAL(15, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول freight_announcement_history (تاریخچه اعلام بار)
CREATE TABLE freight_announcement_history (
    id SERIAL PRIMARY KEY,
    freight_announcement_id VARCHAR(255) NOT NULL REFERENCES freight_announcements(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول freight_transactions (تراکنش‌های مالی حمل)
CREATE TABLE freight_transactions (
    id VARCHAR(255) PRIMARY KEY,
    announcement_id VARCHAR(255) NOT NULL REFERENCES freight_announcements(id),
    amount DECIMAL(15, 2) NOT NULL,
    transaction_date DATE NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 6. جداول مدارک، حوادث و تخصیص خودرو
-- ==============================================

-- جدول fuel_card_requests (درخواست کارت سوخت)
CREATE TABLE fuel_card_requests (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    branch_id VARCHAR(255) NOT NULL REFERENCES branches(id),
    request_date TIMESTAMPTZ DEFAULT NOW(),
    issue_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول traffic_fines (جرائم رانندگی)
CREATE TABLE traffic_fines (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    branch_id VARCHAR(255) NOT NULL REFERENCES branches(id),
    amount BIGINT NOT NULL,
    fine_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول vehicle_permits (پروانه‌های فعالیت)
CREATE TABLE vehicle_permits (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    branch_id VARCHAR(255) NOT NULL REFERENCES branches(id),
    request_date TIMESTAMPTZ DEFAULT NOW(),
    permit_issue_date DATE,
    permit_expiry_date DATE,
    base_fuel_quota INT,
    inspection_image_name VARCHAR(255),
    permit_image_name VARCHAR(255),
    inspection_issue_date DATE,
    inspection_expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول insurance_policies (بیمه‌نامه‌ها) - کامل
CREATE TABLE insurance_policies (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    type VARCHAR(255) NOT NULL,
    policy_number VARCHAR(255) UNIQUE NOT NULL,
    insurance_company VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    vehicle_value BIGINT,
    franchise_percentage DECIMAL(5, 2),
    policy_image_name VARCHAR(255),
    discount_years INT,
    discount_percentage DECIMAL(5, 2),
    policy_amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول accident_reports (گزارشات حوادث) - کامل
CREATE TABLE accident_reports (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    driver_id VARCHAR(255) REFERENCES drivers(id),
    branch_id VARCHAR(255) NOT NULL REFERENCES branches(id),
    status VARCHAR(255) DEFAULT 'Reported',
    accident_date DATE NOT NULL,
    accident_time VARCHAR(10),
    accident_location VARCHAR(255) NOT NULL,
    accident_cause TEXT,
    was_injury BOOLEAN DEFAULT FALSE,
    at_fault_party VARCHAR(255),
    vehicle_post_accident_location VARCHAR(255),
    accident_sketch_image_name VARCHAR(255),
    company_driver_license_image_name VARCHAR(255),
    third_party_driver_license_image_name VARCHAR(255),
    damaged_vehicle_image_name VARCHAR(255),
    file_completion_date TIMESTAMPTZ,
    file_completion_delay_reason TEXT,
    claim_file_number VARCHAR(255),
    referral_to_workshop_date TIMESTAMPTZ,
    payment_voucher_image_name VARCHAR(255),
    file_type VARCHAR(255),
    reconstruction_location VARCHAR(255),
    personal_reconstruction_location VARCHAR(255),
    file_progress_status VARCHAR(255),
    claim_amount_received BIGINT,
    franchise_amount BIGINT,
    repair_invoice_amount BIGINT,
    depreciation_amount BIGINT,
    franchise_process_number VARCHAR(255),
    awaiting_repair_date TIMESTAMPTZ,
    repair_in_progress_date TIMESTAMPTZ,
    repair_completed_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول vehicle_allocations (تخصیص خودرو) - کامل
CREATE TABLE vehicle_allocations (
    id VARCHAR(255) PRIMARY KEY,
    vehicle_id VARCHAR(255) NOT NULL REFERENCES vehicles(id),
    giver_employee_id VARCHAR(255),
    receiver_employee_id VARCHAR(255),
    old_location VARCHAR(255),
    new_location VARCHAR(255),
    allocation_date TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(255) DEFAULT 'Pending',
    process_type VARCHAR(255),
    delivery_type VARCHAR(255),
    mileage INT,
    is_signed BOOLEAN DEFAULT FALSE,
    expert_name VARCHAR(255),
    transaction_time VARCHAR(10),
    return_duration VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول vehicle_allocation_items (اقلام فرم تخصیص) - کامل
CREATE TABLE vehicle_allocation_items (
    id VARCHAR(255) PRIMARY KEY,
    allocation_id VARCHAR(255) NOT NULL REFERENCES vehicle_allocations(id),
    code VARCHAR(255),
    description VARCHAR(255),
    value VARCHAR(255),
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 7. جداول اضافی
-- ==============================================

-- جدول alerts (هشدارها)
CREATE TABLE alerts (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50) DEFAULT 'info',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 8. ایندکس‌ها برای بهبود عملکرد
-- ==============================================

-- ایندکس‌های کاربران
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_employee_id ON users(employee_id);

-- ایندکس‌های خودروها
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_vehicles_branch_id ON vehicles(branch_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_plate ON vehicles(plate_part1, plate_letter, plate_part2);

-- ایندکس‌های رانندگان
CREATE INDEX idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX idx_drivers_national_id ON drivers(national_id);

-- ایندکس‌های سفارش‌های تعمیر
CREATE INDEX idx_repair_orders_vehicle_id ON repair_orders(vehicle_id);
CREATE INDEX idx_repair_orders_status ON repair_orders(status);
CREATE INDEX idx_repair_orders_created_at ON repair_orders(created_at);

-- ایندکس‌های اعلام بارها
CREATE INDEX idx_freight_announcements_code ON freight_announcements(announcement_code);
CREATE INDEX idx_freight_announcements_status ON freight_announcements(status);
CREATE INDEX idx_freight_announcements_loading_date ON freight_announcements(loading_date);

-- ایندکس‌های فاکتورها
CREATE INDEX idx_invoices_vehicle_id ON invoices(vehicle_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_issued_at ON invoices(issued_at);

-- ایندکس‌های audit logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- ایندکس‌های حوادث
CREATE INDEX idx_accident_reports_vehicle_id ON accident_reports(vehicle_id);
CREATE INDEX idx_accident_reports_accident_date ON accident_reports(accident_date);
CREATE INDEX idx_accident_reports_status ON accident_reports(status);

-- ایندکس‌های بیمه
CREATE INDEX idx_insurance_policies_vehicle_id ON insurance_policies(vehicle_id);
CREATE INDEX idx_insurance_policies_end_date ON insurance_policies(end_date);
CREATE INDEX idx_insurance_policies_policy_number ON insurance_policies(policy_number);





























