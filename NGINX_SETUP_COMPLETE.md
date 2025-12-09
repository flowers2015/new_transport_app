# راهنمای کامل تنظیم NGINX و آپدیت Frontend

## مشکل: خطای 413 Request Entity Too Large

این خطا یعنی فایل Excel شما برای آپلود خیلی بزرگ است و NGINX آن را رد می‌کند.

---

## مرحله 1: تنظیم NGINX (از صفر تا صد)

### گام 1: اتصال به سرور

```bash
ssh root@51.178.41.12
```

### گام 2: پیدا کردن فایل تنظیمات NGINX

```bash
# بررسی فایل‌های موجود
ls -la /etc/nginx/sites-available/
```

معمولاً یکی از این فایل‌ها وجود دارد:
- `default`
- یا نام دامنه شما

### گام 3: باز کردن فایل تنظیمات

```bash
sudo nano /etc/nginx/sites-available/default
```

یا اگر فایل دیگری دارید:
```bash
sudo nano /etc/nginx/sites-available/your-site-name
```

### گام 4: پیدا کردن بخش `server`

در فایل باز شده، دنبال این خط بگردید:
```nginx
server {
```

### گام 5: اضافه کردن `client_max_body_size`

**دو روش:**

#### روش 1: در ابتدای بخش `server` (پیشنهادی)

بعد از خط `server {` اضافه کنید:
```nginx
server {
    client_max_body_size 50M;  # این خط را اضافه کنید
    
    listen 80;
    server_name your-domain.com;
    # ... بقیه تنظیمات ...
```

#### روش 2: در بخش `location /api/`

اگر بخش `location /api/` دارید، در آنجا هم اضافه کنید:
```nginx
location /api/ {
    client_max_body_size 50M;  # این خط را اضافه کنید
    proxy_pass http://localhost:3000;
    # ... بقیه تنظیمات ...
}
```

### گام 6: ذخیره و خروج

در nano:
1. `Ctrl + O` (ذخیره)
2. `Enter` (تأیید)
3. `Ctrl + X` (خروج)

### گام 7: تست تنظیمات

```bash
sudo nginx -t
```

اگر پیام `syntax is ok` و `test is successful` دیدید، یعنی درست است ✅

اگر خطا داد، دوباره فایل را باز کنید و بررسی کنید.

### گام 8: Restart کردن NGINX

```bash
sudo systemctl restart nginx
```

### گام 9: بررسی وضعیت NGINX

```bash
sudo systemctl status nginx
```

باید `active (running)` ببینید ✅

---

## مرحله 2: آپدیت Frontend

### گام 1: رفتن به دایرکتوری پروژه

```bash
cd /var/www/my-transport-app
```

### گام 2: دریافت آخرین تغییرات از Git

```bash
git pull origin master
```

### گام 3: رفتن به پوشه Frontend

```bash
cd frontend
```

### گام 4: نصب وابستگی‌ها (اگر نیاز بود)

```bash
npm install
```

### گام 5: Build کردن Frontend

```bash
npm run build
```

این کار ممکن است چند دقیقه طول بکشد. صبر کنید تا تمام شود.

### گام 6: بررسی Build

اگر خطایی نبود، یعنی موفق بود ✅

---

## نتیجه بعد از انجام این کارها

### ✅ مشکل 413 حل می‌شود:
- می‌توانید فایل‌های Excel بزرگ (تا 50 مگابایت) را آپلود کنید
- ایمپورت راننده شرکت دیگر خطا نمی‌دهد

### ✅ تغییرات Frontend اعمال می‌شود:
- تناژ به صورت **کیلوگرم** نمایش داده می‌شود (نه تن)
- کرایه کل **حین تایپ** به صورت فارسی و با جداکننده 3 رقمی فرمت می‌شود
- اعداد فارسی هستند نه انگلیسی

---

## اگر خطا داد چه کار کنیم؟

### خطای NGINX:

```bash
# بررسی لاگ‌های NGINX
sudo tail -f /var/log/nginx/error.log
```

### خطای Build:

```bash
# بررسی خطاها
cd /var/www/my-transport-app/frontend
npm run build 2>&1 | tee build-error.log
```

### خطای Git:

```bash
# اگر conflict داشت
git status
git stash
git pull origin master
```

---

## دستورات سریع (کپی-پیست)

```bash
# 1. تنظیم NGINX
sudo nano /etc/nginx/sites-available/default
# (اضافه کردن client_max_body_size 50M;)
sudo nginx -t
sudo systemctl restart nginx

# 2. آپدیت Frontend
cd /var/www/my-transport-app
git pull origin master
cd frontend
npm install
npm run build
```

---

## نکات مهم ⚠️

1. **قبل از تغییر NGINX:** همیشه یک backup بگیرید:
   ```bash
   sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup
   ```

2. **اگر NGINX کار نکرد:** می‌توانید backup را برگردانید:
   ```bash
   sudo cp /etc/nginx/sites-available/default.backup /etc/nginx/sites-available/default
   sudo systemctl restart nginx
   ```

3. **مقدار `50M`:** اگر فایل‌های شما بزرگ‌تر است، می‌توانید `100M` یا بیشتر بگذارید.

4. **بعد از Build:** NGINX به صورت خودکار فایل‌های جدید را serve می‌کند (نیازی به restart نیست).

---

## تست کردن

بعد از انجام همه کارها:

1. **تست آپلود فایل Excel:**
   - به صفحه مدیریت منابع بروید
   - فایل Excel را آپلود کنید
   - باید بدون خطای 413 آپلود شود ✅

2. **تست فرمت کرایه:**
   - به صفحه پیگیری اعلام بار بروید
   - یک اعلام بار را باز کنید
   - در فیلد "کرایه کل" عدد تایپ کنید
   - باید حین تایپ به صورت فارسی و با جداکننده 3 رقمی نمایش داده شود ✅

3. **تست واحد تناژ:**
   - در همان دیالوگ، تناژ باید به صورت "کیلوگرم" نمایش داده شود (نه تن) ✅

