-- Complete Sample Data for Transport Management System

-- ==============================================
-- 1. داده‌های پایه - شعب
-- ==============================================
INSERT INTO branches (id, name, location) VALUES 
('BR001', 'شعبه مرکزی تهران', 'تهران، خیابان ولیعصر، پلاک 123'),
('BR002', 'شعبه اصفهان', 'اصفهان، خیابان چهارباغ، پلاک 456'),
('BR003', 'شعبه مشهد', 'مشهد، بلوار وکیل آباد، پلاک 789'),
('BR004', 'شعبه شیراز', 'شیراز، خیابان زند، پلاک 321'),
('BR005', 'شعبه تبریز', 'تبریز، خیابان امام خمینی، پلاک 654');

-- ==============================================
-- 2. کاربران سیستم با نقش‌های جدید
-- رمز عبور برای تمام کاربران تستی: 123
-- ==============================================
INSERT INTO users (id, username, password_hash, email, full_name, role, branch_id) VALUES 
-- ادمین
('USR001', 'admin', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'admin@company.com', 'مدیر سیستم', 'admin', 'BR001'),

-- کارمند برنامه‌ریزی
('USR002', 'planner', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'planner@company.com', 'کارمند برنامه‌ریزی', 'planner', 'BR001'),

-- مدیر برنامه‌ریزی
('USR003', 'planner_manager', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'planner_manager@company.com', 'مدیر برنامه‌ریزی', 'planner_manager', 'BR001'),

-- کاربر ترابری (شرکت)
('USR004', 'transport_user', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'transport_user@company.com', 'کاربر ترابری شرکت', 'transport_user', 'BR001'),

-- کاربر ترابری (خودرو شخصی)
('USR005', 'personal_transport_user', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'personal_transport@company.com', 'کاربر ترابری شخصی', 'personal_transport_user', 'BR001'),

-- مالی شعب
('USR006', 'finance', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'finance@company.com', 'کارشناس مالی شعب', 'finance', 'BR001'),

-- مالی مرکزی
('USR007', 'central_finance', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'central_finance@company.com', 'کارشناس مالی مرکزی', 'central_finance', 'BR001'),

-- مالی ترابری
('USR008', 'transport_finance', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'transport_finance@company.com', 'کارشناس مالی ترابری', 'transport_finance', 'BR001'),

-- تعمیرگاه
('USR009', 'workshop', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'workshop@company.com', 'مدیر تعمیرگاه', 'workshop', 'BR001'),

-- ترابری (مدیریت ناوگان)
('USR010', 'transport', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'transport@company.com', 'مدیر ترابری', 'transport', 'BR001'),

-- انبار
('USR011', 'warehouse', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'warehouse@company.com', 'مدیر انبار', 'warehouse', 'BR001'),

-- بازرگان (تدارکات)
('USR012', 'merchant', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'merchant@company.com', 'بازرگان', 'merchant', 'BR001'),

-- کارشناس مدارک خودرو
('USR013', 'docs', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'docs@company.com', 'کارشناس مدارک خودرو', 'docs', 'BR001'),

-- کارشناس تصادفات
('USR014', 'accident', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'accident@company.com', 'کارشناس تصادفات', 'accident', 'BR001'),

-- کارشناس تغییر و تحول
('USR015', 'allocation', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'allocation@company.com', 'کارشناس تغییر و تحول', 'allocation', 'BR001'),

-- کارشناس بیمه
('USR016', 'insurance', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'insurance@company.com', 'کارشناس بیمه', 'insurance', 'BR001');

-- ==============================================
-- 3. رانندگان (کامل)
-- ==============================================
INSERT INTO drivers (id, employee_id, name, father_name, national_id, birth_date, id_number, birth_place, issue_place, home_phone, work_phone, mobile, postal_code, home_address, work_location, job_title, hire_date, license_number, license_type, license_issue_date, license_issue_place, license_expiry_date, current_vehicle_type, current_vehicle_plate) VALUES 
('DRV001', 'EMP101', 'احمد محمدی', 'محمد', '1234567890', '1985-03-15', '1234567890', 'تهران', 'تهران', '021-12345678', '021-87654321', '09123456789', '1234567890', 'تهران، خیابان آزادی، پلاک 123', 'شعبه مرکزی', 'راننده', '2020-01-15', 'LIC001', 'نوع 2', '2018-01-01', 'تهران', '2026-01-01', 'کشنده', '12الف345'),
('DRV002', 'EMP102', 'علی رضایی', 'رضا', '1234567891', '1988-07-20', '1234567891', 'اصفهان', 'اصفهان', '031-12345678', '031-87654321', '09123456790', '1234567891', 'اصفهان، خیابان چهارباغ، پلاک 456', 'شعبه اصفهان', 'راننده', '2019-03-20', 'LIC002', 'نوع 1', '2017-03-01', 'اصفهان', '2025-03-01', 'کشنده', '23ب456'),
('DRV003', 'EMP103', 'حسن کریمی', 'کریم', '1234567892', '1990-11-10', '1234567892', 'مشهد', 'مشهد', '051-12345678', '051-87654321', '09123456791', '1234567892', 'مشهد، بلوار وکیل آباد، پلاک 789', 'شعبه مشهد', 'راننده', '2021-06-10', 'LIC003', 'نوع 2', '2019-06-01', 'مشهد', '2027-06-01', 'کشنده', '34ج567'),
('DRV004', 'EMP104', 'محمد حسینی', 'حسین', '1234567893', '1987-05-25', '1234567893', 'شیراز', 'شیراز', '071-12345678', '071-87654321', '09123456792', '1234567893', 'شیراز، خیابان زند، پلاک 321', 'شعبه شیراز', 'راننده', '2020-09-05', 'LIC004', 'نوع 1', '2018-09-01', 'شیراز', '2026-09-01', 'کشنده', '45د678'),
('DRV005', 'EMP105', 'رضا احمدی', 'احمد', '1234567894', '1992-12-14', '1234567894', 'تبریز', 'تبریز', '041-12345678', '041-87654321', '09123456793', '1234567894', 'تبریز، خیابان امام خمینی، پلاک 654', 'شعبه تبریز', 'راننده', '2022-02-14', 'LIC005', 'نوع 2', '2020-02-01', 'تبریز', '2028-02-01', 'کشنده', '56ه789');

-- ==============================================
-- 4. تعمیرکاران
-- ==============================================
INSERT INTO technicians (id, name, employee_id) VALUES 
('TECH001', 'تکنسین اول', 'EMP201'),
('TECH002', 'تکنسین دوم', 'EMP202'),
('TECH003', 'تکنسین سوم', 'EMP203'),
('TECH004', 'تکنسین چهارم', 'EMP204');

-- ==============================================
-- 5. خودروها (کامل)
-- ==============================================
INSERT INTO vehicles (id, plate_part1, plate_letter, plate_part2, plate_city_code, serial_number, model, type, branch_id, holding_company, mihan_company, vehicle_category, brand, color, owner_name, card_id, vin, usage_type, province, engine_number, vehicle_tip, chassis_number, capacity, year, wheel_count, axle_count, cylinder_count, domain_name, fuel_type, status, engine_power, torque, emission_standard, engine_model, gearbox_model, gear_count, length, width, gross_weight, net_weight, brake_system, market_price, production_model, advantages, disadvantages, leasing_conditions) VALUES 
('VEH001', '12', 'الف', '345', '11', 'SN001', '206', 'کشنده', 'BR001', 'هلدینگ میهن', 'شرکت میهن', 'خودرو سنگین', 'پژو', 'سفید', 'شرکت میهن', 'CARD001', 'VIN12345678901234567', 'تجاری', 'تهران', 'ENG001', 'تیپ A', 'CHS001', '44 تن', 2020, 6, 3, 6, 'حوزه تهران', 'گازوئیل', 'فعال', 400, 1800, 'یورو 5', 'مدل A', 'گیربکس A', '12', 12.5, 2.5, 44000, 15000, 'هوایی', '500000000', 'مدل تولید A', 'قدرت بالا، مصرف کم', 'قیمت بالا', 'شرایط ویژه'),
('VEH002', '23', 'ب', '456', '13', 'SN002', 'سورن', 'کشنده', 'BR002', 'هلدینگ میهن', 'شرکت میهن', 'خودرو سنگین', 'سمند', 'آبی', 'شرکت میهن', 'CARD002', 'VIN12345678901234568', 'تجاری', 'اصفهان', 'ENG002', 'تیپ B', 'CHS002', '40 تن', 2019, 6, 3, 6, 'حوزه اصفهان', 'گازوئیل', 'فعال', 380, 1700, 'یورو 4', 'مدل B', 'گیربکس B', '10', 12.0, 2.4, 40000, 14000, 'هوایی', '450000000', 'مدل تولید B', 'قیمت مناسب', 'قدرت متوسط', 'شرایط عادی'),
('VEH003', '34', 'ج', '567', '16', 'SN003', 'تیبا 2', 'کشنده', 'BR003', 'هلدینگ میهن', 'شرکت میهن', 'خودرو سنگین', 'تیبا', 'قرمز', 'شرکت میهن', 'CARD003', 'VIN12345678901234569', 'تجاری', 'مشهد', 'ENG003', 'تیپ C', 'CHS003', '35 تن', 2021, 6, 2, 4, 'حوزه مشهد', 'گازوئیل', 'فعال', 350, 1600, 'یورو 5', 'مدل C', 'گیربکس C', '8', 11.5, 2.3, 35000, 13000, 'هوایی', '400000000', 'مدل تولید C', 'مصرف کم', 'قدرت کم', 'شرایط ویژه'),
('VEH004', '45', 'د', '678', '17', 'SN004', 'دنا', 'کشنده', 'BR004', 'هلدینگ میهن', 'شرکت میهن', 'خودرو سنگین', 'سایپا', 'سبز', 'شرکت میهن', 'CARD004', 'VIN12345678901234570', 'تجاری', 'شیراز', 'ENG004', 'تیپ D', 'CHS004', '38 تن', 2022, 6, 3, 6, 'حوزه شیراز', 'گازوئیل', 'فعال', 390, 1750, 'یورو 5', 'مدل D', 'گیربکس D', '12', 12.2, 2.45, 38000, 14500, 'هوایی', '480000000', 'مدل تولید D', 'جدید، قدرتمند', 'قیمت بالا', 'شرایط ویژه'),
('VEH005', '56', 'ه', '789', '21', 'SN005', 'کامیون', 'کشنده', 'BR005', 'هلدینگ میهن', 'شرکت میهن', 'خودرو سنگین', 'ایسوزو', 'نقره‌ای', 'شرکت خصوصی', 'CARD005', 'VIN12345678901234571', 'تجاری', 'تبریز', 'ENG005', 'تیپ E', 'CHS005', '42 تن', 2020, 6, 3, 6, 'حوزه تبریز', 'گازوئیل', 'فروخته شده', 420, 1900, 'یورو 4', 'مدل E', 'گیربکس E', '12', 12.8, 2.6, 42000, 16000, 'هوایی', '520000000', 'مدل تولید E', 'قدرت بالا', 'مصرف بالا', 'شرایط عادی');

-- ==============================================
-- 6. تاریخچه مالکین خودرو
-- ==============================================
INSERT INTO vehicle_owner_history (id, vehicle_id, owner_name, start_date, end_date) VALUES 
('VOH001', 'VEH001', 'شرکت خصوصی قبلی', '2018-01-01', '2020-01-01'),
('VOH002', 'VEH001', 'شرکت میهن', '2020-01-01', NULL),
('VOH003', 'VEH005', 'شرکت میهن', '2020-01-01', '2023-06-01'),
('VOH004', 'VEH005', 'شرکت خصوصی', '2023-06-01', NULL);

-- ==============================================
-- 7. قطعات انبار
-- ==============================================
INSERT INTO parts (id, name, part_number, quantity_in_stock, price, min_stock_level, location, expiry_date) VALUES 
('PART001', 'فیلتر روغن', 'FILTER001', 50, 150000, 10, 'قفسه A1', '2025-12-31'),
('PART002', 'لنت ترمز', 'BRAKE001', 30, 200000, 5, 'قفسه B2', '2026-06-30'),
('PART003', 'شمع', 'SPARK001', 100, 50000, 20, 'قفسه C3', '2027-03-15'),
('PART004', 'فیلتر هوا', 'AIR001', 25, 80000, 8, 'قفسه A2', '2025-09-20'),
('PART005', 'روغن موتور', 'OIL001', 200, 300000, 50, 'قفسه D1', '2024-12-31'),
('PART006', 'کمربند تایم', 'BELT001', 15, 400000, 3, 'قفسه B3', '2026-08-10');

-- ==============================================
-- 8. سفارش‌های تعمیر
-- ==============================================
INSERT INTO repair_orders (id, vehicle_id, driver_id, branch_id, description, status, priority, created_at, completed_at, assigned_technician_id) VALUES 
('RO001', 'VEH001', 'DRV001', 'BR001', 'تعمیر موتور و تعویض روغن', 'Pending', 'Normal', '2024-01-15 10:00:00', NULL, 'TECH001'),
('RO002', 'VEH002', 'DRV002', 'BR002', 'تعمیر ترمز و تعویض لنت', 'InProgress', 'High', '2024-01-16 14:30:00', NULL, 'TECH002'),
('RO003', 'VEH003', 'DRV003', 'BR003', 'تعمیر سیستم تهویه', 'Completed', 'Normal', '2024-01-10 09:15:00', '2024-01-12 16:45:00', 'TECH003'),
('RO004', 'VEH004', 'DRV004', 'BR004', 'تعمیر گیربکس', 'Pending', 'High', '2024-01-17 11:20:00', NULL, NULL),
('RO005', 'VEH001', 'DRV001', 'BR001', 'تعمیر سیستم برق', 'InProgress', 'Normal', '2024-01-18 08:45:00', NULL, 'TECH001');

-- ==============================================
-- 9. قطعات مصرفی
-- ==============================================
INSERT INTO part_usages (id, repair_order_id, part_id, quantity_used, usage_date) VALUES 
('PU001', 'RO001', 'PART001', 2, '2024-01-15 10:30:00'),
('PU002', 'RO001', 'PART005', 1, '2024-01-15 10:35:00'),
('PU003', 'RO002', 'PART002', 4, '2024-01-16 15:00:00'),
('PU004', 'RO003', 'PART003', 6, '2024-01-10 10:00:00'),
('PU005', 'RO003', 'PART004', 1, '2024-01-10 10:05:00');

-- ==============================================
-- 10. تامین‌کنندگان
-- ==============================================
INSERT INTO suppliers (id, name, contact_person) VALUES 
('SUP001', 'تامین کننده قطعات خودرو', 'احمد تامین'),
('SUP002', 'شرکت تعمیرات تخصصی', 'علی تعمیر'),
('SUP003', 'فروشگاه قطعات یدکی', 'حسن فروش'),
('SUP004', 'کارگاه تعمیرات مکانیک', 'محمد مکانیک');

-- ==============================================
-- 11. سفارش‌های خرید
-- ==============================================
INSERT INTO purchase_orders (id, supplier_id, order_date, expected_delivery_date, status) VALUES 
('PO001', 'SUP001', '2024-01-10 09:00:00', '2024-01-20', 'Delivered'),
('PO002', 'SUP002', '2024-01-15 14:00:00', '2024-01-25', 'Pending'),
('PO003', 'SUP003', '2024-01-12 11:30:00', '2024-01-22', 'InTransit');

-- ==============================================
-- 12. اقلام سفارش خرید
-- ==============================================
INSERT INTO purchase_order_items (purchase_order_id, part_id, quantity) VALUES 
('PO001', 'PART001', 20),
('PO001', 'PART002', 10),
('PO002', 'PART003', 50),
('PO003', 'PART004', 15);

-- ==============================================
-- 13. فاکتورها
-- ==============================================
INSERT INTO invoices (id, repair_order_id, vehicle_id, total_amount, status, issued_at) VALUES 
('INV001', 'RO001', 'VEH001', 500000, 'Pending', '2024-01-15 12:00:00'),
('INV002', 'RO002', 'VEH002', 750000, 'Paid', '2024-01-16 16:00:00'),
('INV003', 'RO003', 'VEH003', 300000, 'Overdue', '2024-01-12 18:00:00'),
('INV004', NULL, 'VEH004', 200000, 'Pending', '2024-01-17 13:00:00');

-- ==============================================
-- 14. اقلام فاکتور
-- ==============================================
INSERT INTO invoice_items (invoice_id, description, quantity, price, total) VALUES 
('INV001', 'تعمیر موتور', 1, 300000, 300000),
('INV001', 'تعویض روغن', 1, 200000, 200000),
('INV002', 'تعمیر ترمز', 1, 500000, 500000),
('INV002', 'تعویض لنت', 1, 250000, 250000),
('INV003', 'تعمیر سیستم تهویه', 1, 300000, 300000),
('INV004', 'خدمات عمومی', 1, 200000, 200000);

-- ==============================================
-- 15. اعلام بارها
-- ==============================================
INSERT INTO freight_announcements (id, announcement_code, loading_date, line_type, status, cargo_value, vehicle_type, assignment_type, assigned_driver_id, assigned_vehicle_id, total_freight_cost, carton_count) VALUES 
('FA001', 'FA-2024-001', '2024-01-20', 'بستنی', 'PendingPersonalAssignment', 50000000, 'کشنده', 'شخصی', NULL, NULL, 2000000, 1000),
('FA002', 'FA-2024-002', '2024-01-21', 'پاستوریزه', 'InTransit', 75000000, 'کشنده', 'شرکتی', 'DRV001', 'VEH001', 3000000, 1500),
('FA003', 'FA-2024-003', '2024-01-22', 'بستنی', 'Finalized', 30000000, 'کشنده', 'شرکتی', 'DRV002', 'VEH002', 1500000, 800),
('FA004', 'FA-2024-004', '2024-01-23', 'پاستوریزه', 'Draft', 40000000, 'کشنده', NULL, NULL, NULL, NULL, 1200);

-- ==============================================
-- 16. مقاصد اعلام بار
-- ==============================================
INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost) VALUES 
('FD001', 'FA001', 'اصفهان', 'احمد نماینده', 10.5, 800000),
('FD002', 'FA001', 'شیراز', 'علی نماینده', 8.2, 600000),
('FD003', 'FA002', 'مشهد', 'حسن نماینده', 15.0, 1200000),
('FD004', 'FA003', 'تبریز', 'محمد نماینده', 12.3, 900000),
('FD005', 'FA004', 'کرمان', 'رضا نماینده', 9.8, 700000);

-- ==============================================
-- 17. تاریخچه اعلام بار
-- ==============================================
INSERT INTO freight_announcement_history (freight_announcement_id, user_id, action, details) VALUES 
('FA001', 'USR004', 'ایجاد اعلام بار', 'اعلام بار جدید ایجاد شد'),
('FA001', 'USR001', 'تایید مدیر', 'اعلام بار توسط مدیر تایید شد'),
('FA002', 'USR004', 'تخصیص خودرو', 'خودرو VEH001 به راننده DRV001 تخصیص داده شد'),
('FA003', 'USR004', 'تکمیل حمل', 'حمل با موفقیت تکمیل شد');

-- ==============================================
-- 18. تراکنش‌های مالی حمل
-- ==============================================
INSERT INTO freight_transactions (id, announcement_id, amount, transaction_date, is_paid, notes) VALUES 
('FT001', 'FA001', 2000000, '2024-01-20', FALSE, 'هزینه حمل اعلام بار FA-2024-001'),
('FT002', 'FA002', 3000000, '2024-01-21', TRUE, 'هزینه حمل اعلام بار FA-2024-002'),
('FT003', 'FA003', 1500000, '2024-01-22', TRUE, 'هزینه حمل اعلام بار FA-2024-003');

-- ==============================================
-- 19. درخواست کارت سوخت
-- ==============================================
INSERT INTO fuel_card_requests (id, vehicle_id, branch_id, request_date, issue_date) VALUES 
('FCR001', 'VEH001', 'BR001', '2024-01-10 09:00:00', '2024-01-15'),
('FCR002', 'VEH002', 'BR002', '2024-01-12 10:30:00', '2024-01-18'),
('FCR003', 'VEH003', 'BR003', '2024-01-14 14:15:00', NULL);

-- ==============================================
-- 20. جرائم رانندگی
-- ==============================================
INSERT INTO traffic_fines (id, vehicle_id, branch_id, amount, fine_date) VALUES 
('TF001', 'VEH001', 'BR001', 500000, '2024-01-05'),
('TF002', 'VEH002', 'BR002', 300000, '2024-01-08'),
('TF003', 'VEH003', 'BR003', 750000, '2024-01-12');

-- ==============================================
-- 21. پروانه‌های فعالیت
-- ==============================================
INSERT INTO vehicle_permits (id, vehicle_id, branch_id, request_date, permit_issue_date, permit_expiry_date, base_fuel_quota, inspection_image_name, permit_image_name, inspection_issue_date, inspection_expiry_date) VALUES 
('VP001', 'VEH001', 'BR001', '2024-01-01 08:00:00', '2024-01-10', '2025-01-10', 1000, 'inspection_001.jpg', 'permit_001.jpg', '2024-01-05', '2025-01-05'),
('VP002', 'VEH002', 'BR002', '2024-01-02 09:00:00', '2024-01-12', '2025-01-12', 1200, 'inspection_002.jpg', 'permit_002.jpg', '2024-01-07', '2025-01-07'),
('VP003', 'VEH003', 'BR003', '2024-01-03 10:00:00', '2024-01-15', '2025-01-15', 800, 'inspection_003.jpg', 'permit_003.jpg', '2024-01-10', '2025-01-10');

-- ==============================================
-- 22. بیمه‌نامه‌ها (کامل)
-- ==============================================
INSERT INTO insurance_policies (id, vehicle_id, type, policy_number, insurance_company, start_date, end_date, vehicle_value, franchise_percentage, policy_image_name, discount_years, discount_percentage, policy_amount) VALUES 
('IP001', 'VEH001', 'بدنه', 'POL-2024-001', 'بیمه پارسیان', '2024-01-01', '2024-12-31', 100000000, 5.00, 'policy_001.jpg', 3, 15.00, 5000000),
('IP002', 'VEH002', 'بدنه', 'POL-2024-002', 'بیمه ایران', '2024-01-01', '2024-12-31', 90000000, 5.00, 'policy_002.jpg', 2, 10.00, 4500000),
('IP003', 'VEH003', 'ثالث', 'POL-2024-003', 'بیمه پارسیان', '2024-01-01', '2024-12-31', NULL, NULL, 'policy_003.jpg', 1, 5.00, 2000000),
('IP004', 'VEH004', 'بدنه', 'POL-2024-004', 'بیمه ملت', '2024-01-01', '2024-12-31', 95000000, 5.00, 'policy_004.jpg', 4, 20.00, 4800000);

-- ==============================================
-- 23. گزارشات حوادث (کامل)
-- ==============================================
INSERT INTO accident_reports (id, vehicle_id, driver_id, branch_id, status, accident_date, accident_time, accident_location, accident_cause, was_injury, at_fault_party, vehicle_post_accident_location, accident_sketch_image_name, company_driver_license_image_name, third_party_driver_license_image_name, damaged_vehicle_image_name, file_completion_date, claim_file_number, referral_to_workshop_date, payment_voucher_image_name, file_type, reconstruction_location, file_progress_status, claim_amount_received, franchise_amount, repair_invoice_amount, depreciation_amount, franchise_process_number, awaiting_repair_date, repair_in_progress_date, repair_completed_date) VALUES 
('AR001', 'VEH001', 'DRV001', 'BR001', 'Settled', '2023-12-15', '14:30', 'جاده تهران-اصفهان', 'تصادف جزئی با خودروی دیگر', FALSE, 'طرف مقابل', 'تعمیرگاه مرکزی', 'sketch_001.jpg', 'license_001.jpg', 'license_third_001.jpg', 'damage_001.jpg', '2023-12-20 16:00:00', 'CLM-2023-001', '2023-12-18 10:00:00', 'voucher_001.jpg', 'ثالث', 'تعمیرگاه مرکزی', 'تکمیل شده', 5000000, 500000, 4500000, 200000, 'FR-2023-001', '2023-12-19 08:00:00', '2023-12-20 09:00:00', '2023-12-25 17:00:00'),
('AR002', 'VEH003', 'DRV003', 'BR003', 'UnderReview', '2024-01-05', '10:15', 'شهر مشهد', 'خراشیدگی بدنه در پارکینگ', FALSE, 'راننده شرکت', 'تعمیرگاه مشهد', 'sketch_002.jpg', 'license_002.jpg', NULL, 'damage_002.jpg', NULL, 'CLM-2024-001', NULL, NULL, 'بدنه', 'تعمیرگاه مشهد', 'در حال بررسی', NULL, 300000, NULL, NULL, 'FR-2024-001', NULL, NULL, NULL);

-- ==============================================
-- 24. تخصیص خودرو (کامل)
-- ==============================================
INSERT INTO vehicle_allocations (id, vehicle_id, giver_employee_id, receiver_employee_id, old_location, new_location, allocation_date, status, process_type, delivery_type, mileage, is_signed, expert_name, transaction_time, return_duration) VALUES 
('VA001', 'VEH001', 'EMP101', 'EMP102', 'شعبه مرکزی تهران', 'شعبه اصفهان', '2024-01-10 09:00:00', 'Completed', 'تحویل', 'موقت', 150000, TRUE, 'کارشناس تخصیص', '09:30', '3 ماه'),
('VA002', 'VEH002', 'EMP102', 'EMP103', 'شعبه اصفهان', 'شعبه مشهد', '2024-01-15 14:00:00', 'Pending', 'تحویل', 'دائم', 120000, FALSE, 'کارشناس تخصیص', '14:30', 'نامحدود'),
('VA003', 'VEH003', 'EMP103', 'EMP101', 'شعبه مشهد', 'شعبه مرکزی تهران', '2024-01-20 11:00:00', 'InProgress', 'برگشت', 'موقت', 180000, TRUE, 'کارشناس تخصیص', '11:45', '2 ماه');

-- ==============================================
-- 25. اقلام فرم تخصیص (کامل)
-- ==============================================
INSERT INTO vehicle_allocation_items (id, allocation_id, code, description, value, remarks) VALUES 
('VAI001', 'VA001', 'ITEM001', 'کلید خودرو', '2 عدد', 'کلید اصلی و یدکی'),
('VAI002', 'VA001', 'ITEM002', 'کارت سوخت', '1 عدد', 'کارت سوخت فعال'),
('VAI003', 'VA001', 'ITEM003', 'مدارک خودرو', 'کامل', 'تمام مدارک موجود'),
('VAI004', 'VA002', 'ITEM004', 'کلید خودرو', '2 عدد', 'کلید اصلی و یدکی'),
('VAI005', 'VA002', 'ITEM005', 'کارت سوخت', '1 عدد', 'کارت سوخت فعال'),
('VAI006', 'VA003', 'ITEM006', 'کلید خودرو', '2 عدد', 'کلید اصلی و یدکی'),
('VAI007', 'VA003', 'ITEM007', 'مدارک خودرو', 'کامل', 'تمام مدارک موجود');

-- ==============================================
-- 26. تیکت‌های پشتیبانی
-- ==============================================
INSERT INTO support_tickets (id, subject, description, status, created_at, created_by_user_id, created_by_user_name) VALUES 
('ST001', 'مشکل در سیستم تعمیرگاه', 'سیستم تعمیرگاه کند کار می‌کند و گاهی اوقات خطا می‌دهد', 'Open', '2024-01-15 10:00:00', 'USR002', 'مدیر تعمیرگاه'),
('ST002', 'درخواست آموزش', 'نیاز به آموزش استفاده از سیستم جدید برای پرسنل', 'InProgress', '2024-01-16 14:30:00', 'USR003', 'تکنسین اول'),
('ST003', 'مشکل چاپ فاکتور', 'فاکتورها به درستی چاپ نمی‌شوند و اطلاعات ناقص نمایش داده می‌شود', 'Closed', '2024-01-17 09:15:00', 'USR005', 'کارشناس مالی تهران'),
('ST004', 'مشکل در اعلام بار', 'سیستم اعلام بار گاهی اوقات اطلاعات را ذخیره نمی‌کند', 'Open', '2024-01-18 16:45:00', 'USR004', 'هماهنگ کننده لجستیک');

-- ==============================================
-- 27. هشدارها
-- ==============================================
INSERT INTO alerts (id, title, message, type) VALUES 
('ALT001', 'کمبود قطعه', 'فیلتر روغن در حال تمام شدن است. موجودی: 8 عدد', 'warning'),
('ALT002', 'سفارش تعمیر فوری', 'خودرو پلاک 12الف345 نیاز به تعمیر فوری دارد', 'urgent'),
('ALT003', 'بیمه در حال انقضا', 'بیمه خودرو VEH001 تا 30 روز دیگر منقضی می‌شود', 'info'),
('ALT004', 'پرداخت معوق', 'فاکتور INV003 هنوز پرداخت نشده است', 'warning'),
('ALT005', 'گواهینامه منقضی', 'گواهینامه راننده DRV001 تا 60 روز دیگر منقضی می‌شود', 'warning'),
('ALT006', 'معاینه فنی', 'معاینه فنی خودرو VEH002 تا 15 روز دیگر منقضی می‌شود', 'info');

-- ==============================================
-- 28. درخواست‌های برون‌سپاری
-- ==============================================
INSERT INTO outsourcing_requests (id, repair_order_id, supplier_id, status) VALUES 
('OR001', 'RO001', 'SUP002', 'Pending'),
('OR002', 'RO004', 'SUP004', 'Approved'),
('OR003', 'RO005', 'SUP001', 'InProgress');

-- ==============================================
-- 29. لاگ‌های audit
-- ==============================================
INSERT INTO audit_logs (id, user_id, user_name, action, details) VALUES 
('AUD001', 'USR001', 'مدیر سیستم', 'CREATE', 'سفارش تعمیر RO001 ایجاد شد'),
('AUD002', 'USR002', 'مدیر تعمیرگاه', 'UPDATE', 'وضعیت سفارش تعمیر RO002 به InProgress تغییر یافت'),
('AUD003', 'USR004', 'هماهنگ کننده لجستیک', 'CREATE', 'اعلام بار FA001 ایجاد شد'),
('AUD004', 'USR001', 'مدیر سیستم', 'APPROVE', 'اعلام بار FA001 توسط مدیر تایید شد'),
('AUD005', 'USR005', 'کارشناس مالی تهران', 'CREATE', 'فاکتور INV001 صادر شد'),
('AUD006', 'USR003', 'تکنسین اول', 'ASSIGN', 'تکنسین TECH001 به سفارش تعمیر RO001 تخصیص داده شد');

