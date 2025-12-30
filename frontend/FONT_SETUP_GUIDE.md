# راهنمای راه‌اندازی فونت B Homa

برای استفاده صحیح از فونت B Homa در تولید تصاویر صورتحساب، یکی از روش‌های زیر را انجام دهید:

## روش 1: استفاده از فایل محلی (پیشنهادی - ساده‌ترین)

### گام 1: دانلود فونت

فایل فونت را از لینک زیر دانلود کنید:
```
https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2
```

### گام 2: قرار دادن فایل در پروژه

فایل را با نام `B-Homa.woff2` در پوشه زیر قرار دهید:
```
frontend/public/fonts/B-Homa.woff2
```

اگر پوشه `public/fonts` وجود ندارد، ابتدا آن را ایجاد کنید.

### گام 3: استفاده

پس از قرار دادن فایل، کد به طور خودکار از فایل محلی استفاده می‌کند و نیازی به تغییرات دیگری نیست.

---

## روش 2: استفاده از Base64 (برای اطمینان بیشتر)

اگر فایل محلی کار نکرد یا می‌خواهید از Base64 استفاده کنید:

### گام 1: تبدیل فونت به Base64

**روش A: با Node.js**
```javascript
const fs = require('fs');
const fontBuffer = fs.readFileSync('B-Homa.woff2');
const base64 = fontBuffer.toString('base64');
console.log(base64);
// رشته base64 را کپی کنید
```

**روش B: آنلاین**
1. فایل فونت را از لینک بالا دانلود کنید
2. به یکی از سایت‌های زیر بروید:
   - https://base64.guru/converter/encode/file
   - https://www.base64encode.org/
3. فایل را آپلود کنید و Base64 string را کپی کنید

### گام 2: قرار دادن Base64 در کد

فایل `frontend/components/InvoiceImageHelper.tsx` را باز کنید و خط زیر را پیدا کنید:

```typescript
const BHOMA_FONT_BASE64 = ''; // Base64 string فونت B Homa (اختیاری)
```

Base64 string را در این متغیر قرار دهید:

```typescript
const BHOMA_FONT_BASE64 = 'd09GMgABAAAAA...'; // Base64 string کامل فونت
```

همچنین، `BHOMA_FONT_USE_LOCAL` را به `false` تغییر دهید:

```typescript
const BHOMA_FONT_USE_LOCAL = false; // استفاده از Base64 به جای فایل محلی
```

---

## بررسی عملکرد

پس از راه‌اندازی:

1. یک صورتحساب را باز کنید
2. دکمه "دانلود عکس" را کلیک کنید
3. در Console مرورگر (F12) پیام‌های زیر را بررسی کنید:
   - `✅ [exportInvoiceToImage] فونت B Homa تایید شد` → فونت به درستی لود شده
   - `⚠️ [exportInvoiceToImage] فونت B Homa تایید نشد` → فونت لود نشده است

4. تصویر دانلود شده را بررسی کنید و مطمئن شوید که فونت B Homa به درستی اعمال شده است.

---

## نکات مهم

- فایل محلی (روش 1) معمولاً بهتر کار می‌کند چون سریع‌تر است و وابستگی به اینترنت ندارد
- Base64 (روش 2) برای اطمینان بیشتر است اما حجم فایل کد را افزایش می‌دهد
- اگر هیچ کدام کار نکرد، بررسی کنید که فایل فونت صحیح دانلود شده باشد

