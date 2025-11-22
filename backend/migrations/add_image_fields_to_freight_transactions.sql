-- Migration: اضافه کردن فیلدهای عکس، شماره بارنامه و ارجاع به جدول freight_transactions
-- تاریخ: 1404/08/28

ALTER TABLE freight_transactions 
ADD COLUMN IF NOT EXISTS invoice_image_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS receipt_image_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS extra_document_image_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS bill_of_lading_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS destination_id VARCHAR(255) REFERENCES freight_destinations(id),
ADD COLUMN IF NOT EXISTS referral_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS referral_notes TEXT,
ADD COLUMN IF NOT EXISTS central_finance_rejection_notes TEXT,
ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255) REFERENCES users(id);

-- اگر فیلد bill_of_lading_number وجود ندارد، آن را NOT NULL نکنیم
-- چون ممکن است داده‌های قبلی بدون این فیلد باشند
-- در صورت نیاز می‌توانید بعداً NOT NULL اضافه کنید

