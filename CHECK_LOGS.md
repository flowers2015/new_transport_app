# دستورات بررسی لاگ‌های سرور لینوکس

## 1. بررسی لاگ‌های PM2 (اگر از PM2 استفاده می‌کنید)

```bash
# دیدن لاگ‌های زنده (real-time)
pm2 logs transport-backend

# دیدن آخرین 100 خط لاگ
pm2 logs transport-backend --lines 100

# دیدن فقط خطاها
pm2 logs transport-backend --err

# دیدن فقط خروجی‌های عادی
pm2 logs transport-backend --out

# پاک کردن لاگ‌ها
pm2 flush transport-backend
```

## 2. بررسی لاگ‌های Node.js (اگر مستقیماً اجرا می‌کنید)

```bash
# اگر با systemd اجرا می‌کنید
sudo journalctl -u your-service-name -f

# دیدن آخرین 100 خط
sudo journalctl -u your-service-name -n 100

# دیدن فقط خطاها
sudo journalctl -u your-service-name -p err
```

## 3. بررسی لاگ‌های NGINX (اگر از NGINX استفاده می‌کنید)

```bash
# لاگ‌های دسترسی
tail -f /var/log/nginx/access.log

# لاگ‌های خطا
tail -f /var/log/nginx/error.log

# جستجوی خطاهای 500
grep "500" /var/log/nginx/error.log | tail -20
```

## 4. بررسی لاگ‌های PostgreSQL

```bash
# اگر لاگ‌ها در /var/log/postgresql/ هستند
tail -f /var/log/postgresql/postgresql-*.log

# یا در pg_log
tail -f /var/lib/postgresql/*/main/pg_log/*.log
```

## 5. جستجوی خطاهای خاص در لاگ‌ها

```bash
# جستجوی خطاهای assignment
pm2 logs transport-backend | grep -i "assignVehicleAndDriver"

# جستجوی خطاهای 500
pm2 logs transport-backend | grep -i "500"

# جستجوی خطاهای database
pm2 logs transport-backend | grep -i "error\|failed\|exception"

# جستجوی خطاهای dispatch_assignments
pm2 logs transport-backend | grep -i "dispatch_assignments"
```

## 6. ذخیره لاگ‌ها در فایل

```bash
# ذخیره لاگ‌های PM2 در فایل
pm2 logs transport-backend --lines 1000 > /tmp/backend-logs.txt

# یا با timestamp
pm2 logs transport-backend --lines 1000 --timestamp > /tmp/backend-logs-$(date +%Y%m%d-%H%M%S).txt
```

## 7. بررسی وضعیت PM2

```bash
# لیست تمام processها
pm2 list

# اطلاعات جزئی یک process
pm2 describe transport-backend

# بررسی استفاده از حافظه و CPU
pm2 monit
```

## 8. دستورات مفید دیگر

```bash
# دیدن processهای Node.js
ps aux | grep node

# دیدن پورت‌های باز
netstat -tulpn | grep :3000

# بررسی استفاده از دیسک
df -h

# بررسی استفاده از حافظه
free -h

# بررسی لاگ‌های سیستم
dmesg | tail -20
```

## 9. برای گرفتن لاگ‌های assignment به صورت خاص

```bash
# این دستور را اجرا کنید تا لاگ‌های assignment را ببینید
pm2 logs transport-backend --lines 500 | grep -A 10 -B 10 "assignVehicleAndDriver"

# یا همه لاگ‌ها را ببینید و بعد فیلتر کنید
pm2 logs transport-backend --lines 1000 > /tmp/all-logs.txt
grep -A 20 "assignVehicleAndDriver" /tmp/all-logs.txt > /tmp/assignment-logs.txt
cat /tmp/assignment-logs.txt
```

## 10. بررسی خطاهای SQL

```bash
# اگر خطاهای SQL دارید، این دستور را اجرا کنید
pm2 logs transport-backend | grep -i "sql\|query\|database\|postgres"
```

