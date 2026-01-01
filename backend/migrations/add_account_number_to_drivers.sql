-- Migration: اضافه کردن فیلد شماره حساب به جدول drivers
-- این migration فیلد account_number را به جدول drivers اضافه می‌کند

-- اضافه کردن ستون account_number به جدول drivers
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS account_number VARCHAR(255);

-- نمایش پیام موفقیت
DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed: فیلد account_number به جدول drivers اضافه شد';
END $$;

