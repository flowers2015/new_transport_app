# راهنمای استفاده از صفحه Debug

## دسترسی به صفحه Debug

### روش 1: از طریق URL مستقیم
بعد از لاگین، این URL را در مرورگر باز کنید:
```
https://your-domain.com/#debug-driver-calculations
```

### روش 2: از طریق Console مرورگر
1. صفحه را باز کنید (هر صفحه‌ای)
2. دکمه F12 را بزنید (Developer Tools)
3. در Console این کد را وارد کنید:
```javascript
window.location.hash = '#debug-driver-calculations';
```

## نحوه استفاده

1. **شناسه راننده (Driver ID) را وارد کنید**
   - می‌توانید شناسه راننده را از صفحه "لیست پرداخت" کپی کنید
   - یا از جدول `drivers` در دیتابیس بگیرید

2. **دکمه "جستجو" را بزنید**
   - لیست رکوردهای پرداخت شده آن راننده نمایش داده می‌شود

3. **برای دیدن جزئیات کامل یک رکورد:**
   - روی ردیف جدول کلیک کنید
   - یا دکمه "نمایش جزئیات" را بزنید

4. **جزئیات نمایش داده می‌شود:**
   - فیلدهای پیمایش و ماموریت (approved_kilometers, excess_kilometers, ...)
   - تمام فیلدهای رکورد
   - لیست تمام کلیدها

## پیدا کردن Driver ID

### روش 1: از صفحه "لیست پرداخت"
1. به صفحه "لیست پرداخت" بروید
2. Developer Tools را باز کنید (F12)
3. در Console این کد را بزنید:
```javascript
// این کد driverId اولین رکورد را نشان می‌دهد
const firstRow = document.querySelector('table tbody tr');
if (firstRow) {
    console.log('Driver ID:', firstRow.dataset.driverId);
}
```

### روش 2: از دیتابیس
```sql
SELECT id, name, employee_id FROM drivers LIMIT 10;
```

### روش 3: از Network Tab
1. Developer Tools را باز کنید (F12)
2. به تب Network بروید
3. صفحه "لیست پرداخت" را refresh کنید
4. روی درخواست `/api/v1/payments` کلیک کنید
5. در Response، `driver_id` را پیدا کنید

