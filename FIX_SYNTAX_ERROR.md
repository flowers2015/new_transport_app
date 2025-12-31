# راهنمای رفع خطای Syntax Error

## مشکل:
```
SyntaxError: Identifier 'userId' has already been declared
at /var/www/my-transport-app/backend/controllers/freightController.js:912
```

## راه حل:

### مرحله 1: اطمینان از آپدیت کد
```bash
# در سرور، به دایرکتوری پروژه بروید
cd /var/www/my-transport-app

# بررسی کنید که در گیت همه چیز آپدیت شده
git status

# اگر تغییراتی دارید، commit کنید
git add .
git commit -m "Fix syntax error"

# آپدیت از گیت
git pull origin main  # یا master

# بررسی کنید که فایل آپدیت شده
head -n 920 backend/controllers/freightController.js | tail -n 20
# باید خط 912 یک query باشد، نه تعریف userId
```

### مرحله 2: Restart کردن PM2
```bash
# Restart کردن backend
pm2 restart transport-backend

# یا stop و start کردن
pm2 stop transport-backend
pm2 start transport-backend

# بررسی لاگ‌ها
pm2 logs transport-backend --err --lines 50
```

### مرحله 3: پاک کردن Cache (اگر نیاز بود)
```bash
# پاک کردن cache Node.js
pm2 stop transport-backend
rm -rf node_modules/.cache
pm2 start transport-backend
```

### مرحله 4: بررسی اینکه کد درست آپدیت شده
```bash
# بررسی خط 912
sed -n '910,915p' backend/controllers/freightController.js

# باید این خروجی را ببینید:
#       : 0;
# 
#     const insertAnnouncementQuery = `
#       INSERT INTO freight_announcements (
#         id, announcement_code, loading_date, delivery_date, line_type, status, cargo_value,

# اگر به جای آن `const userId` دیدید، یعنی کد آپدیت نشده
```

### مرحله 5: بررسی خط 864
```bash
sed -n '862,866p' backend/controllers/freightController.js

# باید این خروجی را ببینید:
#     // بررسی مجوز ایجاد اعلام بار برای کارمندان برنامه‌ریزی
#     const userId = req.user?.id || req.user?.userId;
#     const role = req.user?.role;
#     if (role === 'planner' || role === 'کارمند برنامه‌ریزی' || role === 'PlanningEmployee' || role === 'planning_employee') {
```

## اگر مشکل حل نشد:

1. **مطمئن شوید که در گیت همه تغییرات push شده:**
   ```bash
   git log --oneline -10
   git diff HEAD~1 backend/controllers/freightController.js
   ```

2. **مستقیماً فایل را بررسی کنید:**
   ```bash
   # بررسی تعداد تعریف‌های userId در تابع createFreightAnnouncement
   sed -n '838,1181p' backend/controllers/freightController.js | grep -n "const userId"
   # باید فقط یک نتیجه ببینید (خط 864)
   ```

3. **اگر دو بار تعریف شده، دستی پاک کنید:**
   ```bash
   # بکاپ بگیرید
   cp backend/controllers/freightController.js backend/controllers/freightController.js.backup
   
   # خط اضافی را پیدا و پاک کنید
   nano backend/controllers/freightController.js
   # یا
   vi backend/controllers/freightController.js
   ```

