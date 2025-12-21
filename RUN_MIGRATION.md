# دستورات اجرای Migration و Restart

## 1. اجرای Migration برای ایجاد جدول

```bash
cd /var/www/my-transport-app/backend
node migrations/create_planning_manager_approval_permissions_table.js
```

## 2. Restart کردن PM2

```bash
pm2 restart transport-backend
```

یا اگر می‌خواهید فقط reload کنید:

```bash
pm2 reload transport-backend
```

## 3. بررسی لاگ‌ها

```bash
pm2 logs transport-backend --err --lines 50
```

اگر خطایی وجود داشت، بررسی کنید.

