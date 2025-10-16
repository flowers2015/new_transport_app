# راهنمای حل مشکل Google Maps API

## مشکل فعلی
```
Google Maps JavaScript API error: ApiNotActivatedMapError
```

## راه حل

### مرحله 1: فعال کردن Maps JavaScript API
1. به [Google Cloud Console](https://console.cloud.google.com/) بروید
2. پروژه خود را انتخاب کنید
3. به **APIs & Services** > **Library** بروید
4. **"Maps JavaScript API"** را جستجو کنید
5. روی آن کلیک کرده و **Enable** کنید

### مرحله 2: بررسی API Key
1. به **APIs & Services** > **Credentials** بروید
2. API Key خود را پیدا کنید
3. روی آن کلیک کنید
4. در بخش **API restrictions**، مطمئن شوید که:
   - **Maps JavaScript API** فعال است
   - **Places API** فعال است

### مرحله 3: محدودیت‌های HTTP referrer
در بخش **Application restrictions**:
- **HTTP referrers** را انتخاب کنید
- این URL ها را اضافه کنید:
  ```
  localhost:5173/*
  localhost:3000/*
  127.0.0.1:5173/*
  127.0.0.1:3000/*
  ```

### مرحله 4: تست
1. صفحه را refresh کنید
2. به "مدیریت شعب" بروید
3. در فیلد "موقعیت مکانی" تایپ کنید

## اگر هنوز کار نکرد

### گزینه 1: API Key جدید بسازید
1. **Create Credentials** > **API Key**
2. نام مناسب بدهید
3. محدودیت‌ها را تنظیم کنید

### گزینه 2: Billing فعال کنید
- Google Maps API نیاز به billing فعال دارد
- به **Billing** بروید و payment method اضافه کنید

## هزینه
- 1000 درخواست اول: رایگان
- بعد از آن: $0.007 per request

## تست بدون Google Maps
اگر نمی‌خواهید Google Maps استفاده کنید، کامپوننت fallback دارد و پیشنهادات ساده نمایش می‌دهد.
