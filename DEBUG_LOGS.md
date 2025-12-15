# راهنمای مشاهده لاگ‌های دیباگ

## لاگ‌های ثبت اطلاعات (Save)

لاگ‌ها با پیشوند `[SAVE_BEFORE]` و `[SAVE_AFTER]` شروع می‌شوند.

### دستورات مشاهده لاگ:

```bash
# مشاهده لاگ‌های بک‌اند (سرور)
pm2 logs transport-backend --lines 100 | grep -E "saveDriverCalculation|SAVE"

# مشاهده لاگ‌های فرانت‌اند (مرورگر)
# باز کردن Developer Tools (F12) > Console
# فیلتر کردن با: SAVE_BEFORE یا SAVE_AFTER
```

### لاگ‌های ثبت اطلاعات:

1. **قبل از ثبت (SAVE_BEFORE)**:
   - `[SAVE_BEFORE]` - شروع ثبت اطلاعات
   - `[SAVE_BEFORE] inputDialogData` - داده‌های ورودی
   - `[SAVE_BEFORE] driverId` - شناسه راننده
   - `[SAVE_BEFORE] announcementId` - شناسه اعلام بار
   - `[SAVE_BEFORE] Request Body` - داده‌های ارسالی به سرور

2. **بعد از ثبت (SAVE_AFTER)**:
   - `[SAVE_AFTER]` - ثبت موفق
   - `[SAVE_AFTER] Response` - پاسخ سرور
   - `[SAVE_AFTER] Status` - کد وضعیت HTTP

## لاگ‌های تولید PDF

لاگ‌ها با پیشوند `[PDF_BEFORE]` و `[PDF_AFTER]` شروع می‌شوند.

### دستورات مشاهده لاگ:

```bash
# مشاهده لاگ‌های بک‌اند (سرور)
pm2 logs transport-backend --lines 100 | grep -E "driver-calculations|PDF"

# مشاهده لاگ‌های فرانت‌اند (مرورگر)
# باز کردن Developer Tools (F12) > Console
# فیلتر کردن با: PDF_BEFORE یا PDF_AFTER
```

### لاگ‌های تولید PDF:

1. **قبل از تولید (PDF_BEFORE)**:
   - `[PDF_BEFORE]` - شروع تولید PDF
   - `[PDF_BEFORE] filteredRecords` - رکوردهای فیلتر شده
   - `[PDF_BEFORE] calculationsArray` - محاسبات دریافت شده از سرور
   - `[PDF_BEFORE] paidCalculations` - محاسبات پرداخت شده
   - `[PDF_BEFORE] HTML content` - محتوای HTML تولید شده
   - `[PDF_BEFORE] invoiceDiv` - بررسی div صورتحساب
   - `[PDF_BEFORE] Canvas` - اطلاعات canvas

2. **بعد از تولید (PDF_AFTER)**:
   - `[PDF_AFTER]` - تولید موفق
   - `[PDF_AFTER] Canvas` - ابعاد canvas
   - `[PDF_AFTER] blob size` - حجم فایل PDF
   - `[PDF_AFTER] تعداد صفحات` - تعداد صفحات PDF

## دستورات کامل برای سرور:

```bash
# مشاهده همه لاگ‌های بک‌اند
pm2 logs transport-backend --lines 200

# مشاهده فقط لاگ‌های خطا
pm2 logs transport-backend --err --lines 100

# مشاهده فقط لاگ‌های خروجی
pm2 logs transport-backend --out --lines 100

# مشاهده لاگ‌های مربوط به ثبت اطلاعات
pm2 logs transport-backend --lines 200 | grep -i "save\|calculation"

# مشاهده لاگ‌های مربوط به PDF
pm2 logs transport-backend --lines 200 | grep -i "pdf\|driver-calculations"
```

## مشاهده لاگ‌های فرانت‌اند:

1. باز کردن مرورگر
2. فشار دادن `F12` برای باز کردن Developer Tools
3. رفتن به تب `Console`
4. استفاده از فیلتر:
   - برای ثبت: `SAVE_BEFORE` یا `SAVE_AFTER`
   - برای PDF: `PDF_BEFORE` یا `PDF_AFTER`

## نکات مهم:

- لاگ‌های `[SAVE_BEFORE]` و `[SAVE_AFTER]` در Console مرورگر نمایش داده می‌شوند
- لاگ‌های `[PDF_BEFORE]` و `[PDF_AFTER]` در Console مرورگر نمایش داده می‌شوند
- لاگ‌های سرور در `pm2 logs` نمایش داده می‌شوند
- برای مشاهده لاگ‌های دقیق، از `--lines 200` یا بیشتر استفاده کنید

