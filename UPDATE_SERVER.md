# راهنمای آپدیت سرور

## روش 1: استفاده از اسکریپت خودکار (پیشنهادی) ⭐

### مراحل:

1. **اتصال به سرور:**
```bash
ssh root@51.178.41.12
# یا با کاربر دیگری که دسترسی دارد
```

2. **رفتن به دایرکتوری پروژه:**
```bash
cd /var/www/my-transport-app
```

3. **اجرای اسکریپت آپدیت:**
```bash
chmod +x update.sh
./update.sh
```

این اسکریپت به صورت خودکار:
- ✅ آخرین تغییرات را از Git می‌کشد (`git pull`)
- ✅ وابستگی‌های Backend را نصب می‌کند
- ✅ Migration‌های لازم را اجرا می‌کند
- ✅ وابستگی‌های Frontend را نصب می‌کند
- ✅ Frontend را Build می‌کند
- ✅ Backend را با PM2 Restart می‌کند

---

## روش 2: آپدیت دستی (اگر اسکریپت کار نکرد)

### مراحل:

1. **اتصال به سرور:**
```bash
ssh root@51.178.41.12
cd /var/www/my-transport-app
```

2. **دریافت تغییرات از Git:**
```bash
git pull origin master
```

3. **نصب وابستگی‌های Backend:**
```bash
cd backend
npm install
```

4. **اجرای Migration جدید (برای جدول finalize_permissions):**
```bash
node migrations/create_finalize_permissions_table.js
```

5. **نصب وابستگی‌های Frontend:**
```bash
cd ../frontend
npm install
```

6. **Build کردن Frontend:**
```bash
npm run build
```

7. **Restart کردن Backend با PM2:**
```bash
cd ../backend
pm2 restart transport-backend
# یا
pm2 restart all
pm2 save
```

---

## بررسی وضعیت بعد از آپدیت

### بررسی وضعیت PM2:
```bash
pm2 status
```

### مشاهده لاگ‌های Backend:
```bash
pm2 logs transport-backend --lines 50
```

### مشاهده خطاها:
```bash
pm2 logs transport-backend --err --lines 20
```

### بررسی اینکه سرور در حال اجرا است:
```bash
pm2 list
```

---

## نکات مهم ⚠️

1. **قبل از آپدیت:**
   - مطمئن شوید که تغییرات را در Git commit و push کرده‌اید
   - اگر migration جدیدی دارید، حتماً آن را اجرا کنید

2. **Migration جدید برای دسترسی اتمام تخصیص:**
   ```bash
   cd /var/www/my-transport-app/backend
   node migrations/create_finalize_permissions_table.js
   ```

3. **اگر خطایی رخ داد:**
   - لاگ‌ها را بررسی کنید: `pm2 logs transport-backend`
   - بررسی کنید که دیتابیس در دسترس است
   - بررسی کنید که پورت 3000 آزاد است

4. **اگر Frontend Build نشد:**
   - بررسی کنید که Node.js و npm به‌روز هستند
   - بررسی کنید که فایل `.env.production` در frontend وجود دارد

---

## دستورات مفید دیگر

### مشاهده استفاده از منابع:
```bash
pm2 monit
```

### Restart دستی Backend:
```bash
pm2 restart transport-backend
```

### Stop کردن Backend:
```bash
pm2 stop transport-backend
```

### Start کردن Backend:
```bash
pm2 start transport-backend
```

### حذف از PM2:
```bash
pm2 delete transport-backend
```

---

## در صورت مشکل

اگر بعد از آپدیت مشکلی پیش آمد:

1. **بررسی لاگ‌ها:**
   ```bash
   pm2 logs transport-backend --lines 100
   ```

2. **بررسی وضعیت PM2:**
   ```bash
   pm2 status
   ```

3. **Restart مجدد:**
   ```bash
   pm2 restart transport-backend
   ```

4. **اگر مشکل حل نشد، از backup استفاده کنید:**
   ```bash
   git reset --hard HEAD~1  # برگشت به commit قبلی
   pm2 restart transport-backend
   ```

