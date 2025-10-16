# راهنمای حل مشکلات مدیریت رانندگان

## مشکلات فعلی
1. **Google Maps API خطا:** `ApiNotActivatedMapError`
2. **بک‌اند 500 خطا:** `POST http://localhost:3000/api/v1/drivers 500`

## راه حل مرحله به مرحله

### مرحله 1: حل مشکل Google Maps API

#### گزینه A: فعال کردن Maps JavaScript API
1. به [Google Cloud Console](https://console.cloud.google.com/) بروید
2. پروژه خود را انتخاب کنید
3. به **APIs & Services** > **Library** بروید
4. **"Maps JavaScript API"** را جستجو کنید
5. روی آن کلیک کرده و **Enable** کنید

#### گزینه B: غیرفعال کردن Google Maps (موقت)
اگر نمی‌خواهید Google Maps استفاده کنید، کامپوننت fallback دارد.

### مرحله 2: حل مشکل بک‌اند

#### مرحله 2.1: ایجاد جدول drivers
```bash
# در terminal، به پوشه backend بروید
cd backend

# اجرای script ایجاد جدول
node setup_database.js
```

#### مرحله 2.2: ری‌استارت بک‌اند
```bash
# در پوشه backend
npm run dev
```

### مرحله 3: تست کامل

1. **تست Google Maps:**
   - به "مدیریت شعب" بروید
   - در فیلد "موقعیت مکانی" تایپ کنید
   - باید پیشنهادات نمایش داده شود

2. **تست مدیریت رانندگان:**
   - به "مدیریت رانندگان" بروید
   - راننده جدید اضافه کنید
   - راننده موجود را ویرایش کنید
   - راننده را حذف کنید

## اگر هنوز مشکل دارید

### بررسی لاگ‌های بک‌اند
```bash
# در terminal بک‌اند، خطاها را بررسی کنید
```

### بررسی دیتابیس
```sql
-- بررسی وجود جدول drivers
SELECT * FROM information_schema.tables WHERE table_name = 'drivers';

-- بررسی ساختار جدول
\d drivers;

-- بررسی داده‌های موجود
SELECT COUNT(*) FROM drivers;
```

### تست API مستقیماً
```bash
# تست GET
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/v1/drivers

# تست POST
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"employeeId":"TEST001","name":"تست","nationalId":"1234567890"}' \
  http://localhost:3000/api/v1/drivers
```

## فیلدهای مورد نیاز برای راننده

### فیلدهای اجباری:
- `employeeId` - کد پرسنلی
- `name` - نام و نام خانوادگی  
- `nationalId` - کد ملی

### فیلدهای اختیاری:
- `fatherName` - نام پدر
- `birthDate` - تاریخ تولد
- `mobile` - شماره همراه
- `workLocation` - محل خدمت
- `jobTitle` - شغل
- `licenseType` - نوع گواهینامه
- و سایر فیلدها...

## نکات مهم

1. **کد ملی باید یکتا باشد**
2. **کد پرسنلی باید یکتا باشد**
3. **تاریخ‌ها باید در فرمت ISO باشند**
4. **نوع گواهینامه:** پایه یک، پایه دو، پایه سوم، موتورسیکلت

## پشتیبانی

اگر مشکل حل نشد، خطای دقیق را از console بفرستید.
