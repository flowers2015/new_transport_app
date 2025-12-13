-- حذف loading_cost از محاسبات
-- این اسکریپت loading_cost را 0 می‌کند
-- توجه: total_cost باید به صورت دستی یا از طریق frontend دوباره محاسبه شود

-- تنظیم loading_cost به 0 برای تمام رکوردها
UPDATE driver_calculations 
SET loading_cost = 0
WHERE loading_cost != 0 OR loading_cost IS NULL;

-- نمایش تعداد رکوردهای به‌روز شده
SELECT COUNT(*) as updated_records 
FROM driver_calculations 
WHERE loading_cost = 0;

