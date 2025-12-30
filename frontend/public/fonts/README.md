# فونت B Homa

## دانلود فونت:

1. از لینک زیر فونت B Homa را دانلود کنید:
   - https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2

2. فایل را با نام `B-Homa.woff2` در این پوشه قرار دهید:
   - `frontend/public/fonts/B-Homa.woff2`

3. یا از دستور curl استفاده کنید:
   ```bash
   curl -o frontend/public/fonts/B-Homa.woff2 https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2
   ```

## تبدیل به Base64 (گزینه دوم):

اگر می‌خواهید از Base64 استفاده کنید:

1. فایل فونت را دانلود کنید (همان لینک بالا)

2. از یکی از روش‌های زیر به Base64 تبدیل کنید:

   **روش 1: با Node.js**
   ```javascript
   const fs = require('fs');
   const fontBuffer = fs.readFileSync('B-Homa.woff2');
   const base64 = fontBuffer.toString('base64');
   console.log(base64);
   ```

   **روش 2: آنلاین**
   - https://base64.guru/converter/encode/file
   - یا https://www.base64encode.org/
   - فایل را آپلود کنید و Base64 string را کپی کنید

3. Base64 string را در فایل `frontend/components/InvoiceImageHelper.tsx` در متغیر `BHOMA_FONT_BASE64` قرار دهید.

