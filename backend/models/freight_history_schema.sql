-- =====================================================
-- Freight Announcement History Schema
-- =====================================================
-- این جدول تمام تغییرات اعلام بار رو ثبت می‌کنه

-- جدول اصلی تاریخچه
CREATE TABLE IF NOT EXISTS freight_announcement_history (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    freight_announcement_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    user_name VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    old_status VARCHAR(100),
    new_status VARCHAR(100),
    field_changes JSONB,
    description TEXT NOT NULL,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Foreign key با ON DELETE CASCADE برای حذف خودکار تاریخچه
    CONSTRAINT fk_freight_announcement 
        FOREIGN KEY (freight_announcement_id) 
        REFERENCES freight_announcements(id) 
        ON DELETE CASCADE,
    
    -- Foreign key برای user (اختیاری چون ممکنه user حذف بشه)
    CONSTRAINT fk_user 
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE SET NULL
);

-- ایندکس‌ها برای سرعت بیشتر کوئری‌ها
CREATE INDEX IF NOT EXISTS idx_freight_history_announcement 
    ON freight_announcement_history(freight_announcement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_freight_history_user 
    ON freight_announcement_history(user_id);

CREATE INDEX IF NOT EXISTS idx_freight_history_action 
    ON freight_announcement_history(action);

CREATE INDEX IF NOT EXISTS idx_freight_history_created 
    ON freight_announcement_history(created_at DESC);

-- ایندکس JSONB برای جستجو در تغییرات فیلدها
CREATE INDEX IF NOT EXISTS idx_freight_history_field_changes 
    ON freight_announcement_history USING gin(field_changes);

-- کامنت‌ها برای مستندسازی
COMMENT ON TABLE freight_announcement_history IS 'ثبت کامل تاریخچه تغییرات اعلام بار از زمان ایجاد تا نهایی شدن';
COMMENT ON COLUMN freight_announcement_history.action IS 'نوع عملیات: CREATED, EDITED, STATUS_CHANGED, ASSIGNED, REASSIGNED, QUEUE_CHANGED, APPROVED, REJECTED, DESTINATIONS_CHANGED, PAYMENT_RECORDED, PAYMENT_CONFIRMED, DELETED, REANNOUNCED';
COMMENT ON COLUMN freight_announcement_history.field_changes IS 'تغییرات دقیق فیلدها به فرمت JSON: {"fieldName": {"old": value, "new": value}}';
COMMENT ON COLUMN freight_announcement_history.description IS 'شرح کامل تغییر به زبان فارسی برای نمایش به کاربر';

-- =====================================================
-- انواع اکشن‌های مجاز (برای مستندسازی)
-- =====================================================
-- CREATED              - ایجاد اولیه اعلام بار
-- EDITED               - ویرایش مشخصات عمومی
-- STATUS_CHANGED       - تغییر وضعیت
-- APPROVED             - تایید توسط مدیر برنامه‌ریزی
-- REJECTED             - رد شدن توسط مدیر
-- QUEUE_CHANGED        - ارجاع بین صف شخصی/شرکتی
-- ASSIGNED             - تخصیص اولیه راننده و خودرو
-- REASSIGNED           - تغییر تخصیص (راننده یا خودرو)
-- DRIVER_CHANGED       - تغییر راننده
-- VEHICLE_CHANGED      - تغییر خودرو
-- DESTINATIONS_CHANGED - تغییر مقاصد (شهر، تناژ، کرایه و...)
-- PAYMENT_RECORDED     - ثبت اطلاعات پرداخت
-- PAYMENT_CONFIRMED    - تایید پرداخت توسط مالی
-- DELETED              - حذف اعلام بار
-- REANNOUNCED          - اعلام مجدد بار

