# راهنمای بررسی مشکل فیلدهای خالی

## مرحله 1: بررسی Network (مهم!)

1. **F12** → تب **Network**
2. صفحه debug را refresh کنید
3. در لیست درخواست‌ها دنبال این بگردید:
   - `/api/v1/driver-calculations/debug/list-paid?driverId=...`
   - `/api/v1/driver-calculations/debug/.../...`
4. روی آن کلیک کنید
5. تب **Response** را باز کنید
6. ببینید چه داده‌هایی برگشته است

**اگر Response خالی بود یا null بود:**
- یعنی داده‌ها در دیتابیس نیستند یا endpoint کار نمی‌کند

**اگر Response داده داشت:**
- کپی کنید و اینجا بفرستید

## مرحله 2: بررسی Console برای لاگ‌های Backend

در Console این کد را بزنید تا ببینیم endpoint صدا زده شده یا نه:

```javascript
// بررسی لاگ‌های اخیر
console.log('=== بررسی لاگ‌های Backend ===');
```

سپس به Network tab بروید و Response را کپی کنید.

## مرحله 3: بررسی مستقیم از Backend

در Console این کد را بزنید (بعد از اینکه Driver ID دارید):

```javascript
// تست مستقیم endpoint
const driverId = 'DRIVER_ID_اینجا'; // Driver ID خود را بگذارید
fetch(`/api/v1/driver-calculations/debug/list-paid?driverId=${driverId}`, {
    headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
    }
})
.then(r => r.json())
.then(data => {
    console.log('📊 Response از Backend:', data);
    console.log('📋 تعداد رکوردها:', data.count);
    if (data.records && data.records.length > 0) {
        console.log('🔍 اولین رکورد:', data.records[0]);
        console.log('📊 فیلدهای پیمایش:', {
            approved_kilometers: data.records[0].approved_kilometers,
            excess_kilometers: data.records[0].excess_kilometers,
            approved_mission_days: data.records[0].approved_mission_days,
            excess_mission_days: data.records[0].excess_mission_days
        });
    }
})
.catch(err => console.error('❌ خطا:', err));
```

## مرحله 4: بررسی جزئیات یک رکورد

بعد از اینکه Driver ID و Announcement ID دارید:

```javascript
const driverId = 'DRIVER_ID';
const announcementId = 'ANNOUNCEMENT_ID';

fetch(`/api/v1/driver-calculations/debug/${driverId}/${announcementId}`, {
    headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
    }
})
.then(r => r.json())
.then(data => {
    console.log('📊 جزئیات کامل:', data);
    console.log('📋 فیلدهای پیمایش و ماموریت:', data.mileageAndMission);
    console.log('🔍 تمام داده‌ها:', JSON.stringify(data, null, 2));
    
    // کپی برای ارسال
    copy(JSON.stringify(data, null, 2));
    console.log('✅ داده‌ها در کلیپ‌بورد کپی شد!');
})
.catch(err => console.error('❌ خطا:', err));
```

## مهم: چه چیزی را به من بدهید؟

1. **Response از Network tab** (مهم‌ترین!)
2. **خروجی Console** از کدهای بالا
3. **Screenshot از Network tab**

