-- Sample data for testing the application

-- Insert sample branches
INSERT INTO branches (id, name, location) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'شعبه مرکزی', 'تهران'),
('550e8400-e29b-41d4-a716-446655440002', 'شعبه اصفهان', 'اصفهان'),
('550e8400-e29b-41d4-a716-446655440003', 'شعبه مشهد', 'مشهد');

-- Insert sample users
INSERT INTO users (id, username, password_hash, email, full_name, role, branch_id) VALUES 
('550e8400-e29b-41d4-a716-446655440011', 'admin', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'admin@company.com', 'مدیر سیستم', 'Admin', '550e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440012', 'technician1', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'tech1@company.com', 'تکنسین اول', 'Technician', '550e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440013', 'logistics', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'logistics@company.com', 'هماهنگ کننده لجستیک', 'LogisticsCoordinator', '550e8400-e29b-41d4-a716-446655440001');

-- Insert sample vehicles
INSERT INTO vehicles (id, vin, plate_number, make, model, year) VALUES 
('550e8400-e29b-41d4-a716-446655440021', 'VIN123456789', '{"province": "تهران", "number": "12", "letter": "الف", "serial": "345"}', 'پژو', '206', 2020),
('550e8400-e29b-41d4-a716-446655440022', 'VIN987654321', '{"province": "اصفهان", "number": "23", "letter": "ب", "serial": "456"}', 'سمند', 'سورن', 2019),
('550e8400-e29b-41d4-a716-446655440023', 'VIN456789123', '{"province": "مشهد", "number": "34", "letter": "ج", "serial": "567"}', 'تیبا', 'تیبا 2', 2021);

-- Insert sample repair orders
INSERT INTO repair_orders (id, vehicle_id, technician_id, status, description) VALUES 
('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440012', 'Pending', 'تعمیر موتور و تعویض روغن'),
('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440012', 'InProgress', 'تعمیر ترمز و تعویض لنت'),
('550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440012', 'Completed', 'تعمیر سیستم تهویه');

-- Insert sample freight announcements
INSERT INTO freight_announcements (id, title, description, origin, destinations, status) VALUES 
('550e8400-e29b-41d4-a716-446655440041', 'حمل بار به اصفهان', 'حمل کالاهای عمومی', 'تهران', '[{"city": "اصفهان", "address": "خیابان چهارباغ"}]', 'PendingPersonalAssignment'),
('550e8400-e29b-41d4-a716-446655440042', 'حمل بار به مشهد', 'حمل مواد غذایی', 'تهران', '[{"city": "مشهد", "address": "بلوار وکیل آباد"}]', 'InTransit'),
('550e8400-e29b-41d4-a716-446655440043', 'حمل بار به شیراز', 'حمل تجهیزات پزشکی', 'تهران', '[{"city": "شیراز", "address": "خیابان زند"}]', 'Finalized');

-- Insert sample parts
INSERT INTO parts (id, name, part_number, stock, unit_price) VALUES 
('550e8400-e29b-41d4-a716-446655440051', 'فیلتر روغن', 'FILTER001', 50, 150000),
('550e8400-e29b-41d4-a716-446655440052', 'لنت ترمز', 'BRAKE001', 30, 200000),
('550e8400-e29b-41d4-a716-446655440053', 'شمع', 'SPARK001', 100, 50000);

-- Insert sample suppliers
INSERT INTO suppliers (id, name, contact_info) VALUES 
('550e8400-e29b-41d4-a716-446655440061', 'تامین کننده قطعات خودرو', '{"phone": "021-12345678", "email": "supplier1@example.com"}'),
('550e8400-e29b-41d4-a716-446655440062', 'شرکت تعمیرات تخصصی', '{"phone": "021-87654321", "email": "supplier2@example.com"}');

-- Insert sample invoices
INSERT INTO invoices (id, repair_order_id, vehicle_id, total_amount, status) VALUES 
('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440021', 500000, 'Pending'),
('550e8400-e29b-41d4-a716-446655440072', '550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440022', 750000, 'Paid'),
('550e8400-e29b-41d4-a716-446655440073', '550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440023', 300000, 'Overdue');

-- Insert sample alerts
INSERT INTO alerts (id, title, message, type) VALUES 
('550e8400-e29b-41d4-a716-446655440081', 'کمبود قطعه', 'فیلتر روغن در حال تمام شدن است', 'warning'),
('550e8400-e29b-41d4-a716-446655440082', 'سفارش تعمیر فوری', 'خودرو پلاک 12الف345 نیاز به تعمیر فوری دارد', 'urgent');
