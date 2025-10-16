# راهنمای تنظیم Google Places API

## مرحله 1: دریافت API Key

1. به [Google Cloud Console](https://console.cloud.google.com/) بروید
2. یک پروژه جدید ایجاد کنید یا پروژه موجود را انتخاب کنید
3. به **APIs & Services** > **Library** بروید
4. **Places API** را جستجو کرده و فعال کنید
5. به **APIs & Services** > **Credentials** بروید
6. روی **Create Credentials** کلیک کرده و **API Key** را انتخاب کنید
7. API Key را کپی کنید

## مرحله 2: محدود کردن API Key

برای امنیت بیشتر، API Key را محدود کنید:

1. روی API Key کلیک کنید
2. در بخش **Application restrictions**، **HTTP referrers** را انتخاب کنید
3. دامنه سایت خود را اضافه کنید (مثلاً: `localhost:3000/*`)
4. در بخش **API restrictions**، فقط **Places API** را انتخاب کنید

## مرحله 3: تنظیم در کد

در فایل `frontend/components/LocationAutocomplete.tsx`:

```typescript
script.src = `https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY_HERE&libraries=places&language=fa&region=IR`;
```

`YOUR_API_KEY_HERE` را با API Key واقعی خود جایگزین کنید.

## مرحله 4: تست

1. بک‌اند و فرانت را ری‌استارت کنید
2. به صفحه "مدیریت شعب" بروید
3. در فیلد "موقعیت مکانی" شروع به تایپ کنید
4. پیشنهادات Google Places نمایش داده می‌شوند

## ویژگی‌ها

- ✅ جستجوی آدرس به فارسی
- ✅ محدود به ایران (country: 'ir')
- ✅ پیشنهادات هوشمند
- ✅ آپلود خودکار آدرس کامل
- ✅ سازگار با موبایل

## هزینه

Google Places API برای:
- 1000 درخواست اول: رایگان
- درخواست‌های بعدی: $0.017 per request

برای استفاده محدود، معمولاً در محدوده رایگان باقی می‌ماند.
