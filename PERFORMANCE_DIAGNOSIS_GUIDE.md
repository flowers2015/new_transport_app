# راهنمای تشخیص مشکلات عملکرد

## 🔍 مراحل تشخیص

### 1. بررسی حجم داده‌ها

```bash
# در سرور
cd /var/www/my-transport-app/backend
node scripts/diagnose_performance.js
```

این اسکریپت:
- تعداد رکوردهای هر جدول را نشان می‌دهد
- حجم تقریبی داده‌ها را محاسبه می‌کند
- حجم با compression را تخمین می‌زند
- هشدار می‌دهد اگر تعداد رکوردها زیاد است

### 2. بررسی Compression در Backend

```bash
# در سرور
curl -H "Accept-Encoding: gzip" -I http://localhost:3000/api/v1/personal-drivers
```

**خروجی مورد انتظار:**
```
HTTP/1.1 200 OK
Content-Encoding: gzip  ← باید این خط وجود داشته باشد
Content-Type: application/json
...
```

**اگر `Content-Encoding: gzip` وجود نداشت:**
- Compression کار نمی‌کند
- باید backend را restart کنید
- یا compression middleware را بررسی کنید

### 3. بررسی NGINX Compression

```bash
# در سرور
sudo nginx -T | grep -i gzip
```

**خروجی مورد انتظار:**
```
gzip on;
gzip_vary on;
gzip_comp_level 6;
...
```

**اگر gzip وجود نداشت:**
- NGINX compression فعال نیست
- باید `optimize_nginx_performance.sh` را اجرا کنید

### 4. بررسی Backend Logs

```bash
# در سرور
pm2 logs transport-backend --lines 50
```

**بررسی کنید:**
- آیا خطایی وجود دارد؟
- آیا compression middleware لود شده است؟

---

## 🚨 مشکلات رایج و راه‌حل‌ها

### مشکل 1: حجم داده هنوز 3.0 MB است

**علت احتمالی:**
1. Compression کار نمی‌کند
2. تعداد رکوردها خیلی زیاد است (10,000+)
3. NGINX compression را disable کرده است

**راه‌حل:**
1. بررسی compression (مرحله 2)
2. اگر تعداد رکوردها زیاد است، Pagination اضافه کنید
3. بررسی NGINX (مرحله 3)

### مشکل 2: زمان لود هنوز زیاد است (43s - 2.5 min)

**علت احتمالی:**
1. تعداد request های زیاد
2. داده‌های بزرگ در حال fetch شدن
3. Cache کار نمی‌کند

**راه‌حل:**
1. بررسی تعداد request ها در Network Tab
2. اضافه کردن Pagination
3. بهبود Cache TTL

### مشکل 3: Navigation بین صفحات کند است

**علت احتمالی:**
1. Cache کار نمی‌کند
2. TTL خیلی کوتاه است
3. همه داده‌ها از اول fetch می‌شوند

**راه‌حل:**
1. بررسی Cache در Network Tab (Status 304)
2. افزایش TTL برای داده‌های static
3. استفاده از stale-while-revalidate

---

## 📊 نتایج مورد انتظار

### بعد از بهینه‌سازی:

**حجم داده:**
- قبل: 3.0 MB
- بعد: ~600-900 KB (70-80% کاهش)

**زمان لود:**
- لاگین: ~2-3s ✅
- بعد لاگین: ~5-10s ✅
- داشبورد ترابری: ~10-20s ✅
- تاریخچه: ~10-20s ✅

**Navigation:**
- قبل: 43s - 2.5 min
- بعد: <1s (اگر cache موجود باشد) ✅

---

## 🔧 مراحل بعدی

بعد از اجرای اسکریپت تشخیصی:

1. **اگر تعداد رکوردها زیاد است (>1000):**
   - اضافه کردن Pagination
   - Lazy Loading

2. **اگر Compression کار نمی‌کند:**
   - Restart Backend: `pm2 restart transport-backend`
   - بررسی NGINX: `sudo nginx -T | grep gzip`

3. **اگر Cache کار نمی‌کند:**
   - افزایش TTL
   - بررسی Network Tab (Status 304)

---

## 📝 گزارش نتایج

بعد از اجرای مراحل، این اطلاعات را بفرستید:

1. خروجی `diagnose_performance.js`
2. خروجی `curl -H "Accept-Encoding: gzip" -I ...`
3. خروجی `sudo nginx -T | grep gzip`
4. آمار جدید از Network Tab

