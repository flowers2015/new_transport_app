# راهنمای پیدا کردن Driver ID و استفاده از صفحه Debug

## مرحله 1: پیدا کردن Driver ID

### روش 1: از صفحه "لیست پرداخت" (ساده‌ترین روش)

1. به صفحه "لیست پرداخت" بروید (از منوی مالی ترابری)
2. Developer Tools را باز کنید:
   - دکمه **F12** را بزنید
   - یا راست کلیک → "Inspect" → تب "Console"
3. در Console این کد را کپی و Enter بزنید:

```javascript
// پیدا کردن اولین Driver ID از جدول
const firstRow = document.querySelector('table tbody tr');
if (firstRow) {
    const cells = firstRow.querySelectorAll('td');
    console.log('✅ Driver ID پیدا شد!');
    console.log('📋 کپی کنید:', firstRow.dataset.driverId || 'در attribute نیست');
    
    // یا از محتوای صفحه بگیرید
    const driverIdMatch = document.body.innerHTML.match(/driver[_-]?id["\s:=]+([a-f0-9-]{36})/i);
    if (driverIdMatch) {
        console.log('🔑 Driver ID:', driverIdMatch[1]);
        navigator.clipboard.writeText(driverIdMatch[1]).then(() => {
            console.log('✅ Driver ID در کلیپ‌بورد کپی شد!');
        });
    }
}
```

### روش 2: از Network Tab (مطمئن‌ترین روش)

1. Developer Tools را باز کنید (F12)
2. به تب **Network** بروید
3. صفحه "لیست پرداخت" را refresh کنید (F5)
4. در لیست درخواست‌ها، روی `/api/v1/payments` کلیک کنید
5. به تب **Response** بروید
6. در JSON، دنبال `driver_id` یا `driverId` بگردید
7. مقدار آن را کپی کنید

مثال:
```json
{
  "id": "...",
  "driver_id": "b144339d-c369-436b-8601-821b8905b055",  ← این را کپی کنید
  "driverName": "...",
  ...
}
```

### روش 3: از دیتابیس (اگر دسترسی دارید)

```sql
-- لیست 10 راننده با Driver ID
SELECT id, name, employee_id 
FROM drivers 
ORDER BY created_at DESC 
LIMIT 10;
```

ستون `id` همان Driver ID است.

## مرحله 2: استفاده از صفحه Debug

### گام 1: باز کردن صفحه Debug

**روش A: از طریق URL مستقیم**
```
https://www.tpmhub.ir/#debug-driver-calculations
```
(یا هر دامنه‌ای که استفاده می‌کنید)

**روش B: از طریق Console مرورگر**
1. هر صفحه‌ای را باز کنید
2. F12 → Console
3. این کد را بزنید:
```javascript
window.location.hash = '#debug-driver-calculations';
location.reload();
```

### گام 2: وارد کردن Driver ID

1. در کادر "شناسه راننده (Driver ID)"، Driver ID را paste کنید
   - مثال: `b144339d-c369-436b-8601-821b8905b055`
2. دکمه **"جستجو"** را بزنید
3. لیست رکوردهای پرداخت شده نمایش داده می‌شود

### گام 3: دیدن جزئیات

1. در جدول، روی یک ردیف کلیک کنید
2. یا دکمه **"نمایش جزئیات"** را بزنید
3. جزئیات کامل نمایش داده می‌شود:
   - فیلدهای پیمایش و ماموریت
   - تمام فیلدهای رکورد
   - لیست کلیدها

## مثال کامل:

```
1. Driver ID: b144339d-c369-436b-8601-821b8905b055
2. جستجو → لیست نمایش داده می‌شود
3. روی ردیف اول کلیک → جزئیات نمایش داده می‌شود
4. بررسی کنید:
   - approved_kilometers: 1500
   - excess_kilometers: 200
   - approved_mission_days: 3
   - excess_mission_days: 1
```

## اگر Driver ID پیدا نکردید:

از این کد در Console استفاده کنید تا همه Driver ID‌ها را ببینید:

```javascript
// پیدا کردن همه Driver ID‌ها از صفحه لیست پرداخت
fetch('/api/v1/payments', {
    headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
    }
})
.then(r => r.json())
.then(data => {
    console.log('📋 لیست Driver ID‌ها:');
    data.forEach((p, i) => {
        console.log(`${i+1}. ${p.driver_id || p.driverId} - ${p.driverName || 'بدون نام'}`);
    });
});
```

## نکات مهم:

1. **Driver ID یک UUID است** (36 کاراکتر با خط تیره)
   - فرمت: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - مثال: `b144339d-c369-436b-8601-821b8905b055`

2. **اگر خطا داد:**
   - مطمئن شوید که لاگین هستید
   - مطمئن شوید که Driver ID درست است
   - Console مرورگر را چک کنید (F12 → Console)

3. **اگر لیست خالی بود:**
   - یعنی برای این راننده رکورد پرداخت شده‌ای وجود ندارد
   - یک Driver ID دیگر امتحان کنید

