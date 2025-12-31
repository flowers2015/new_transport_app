# راهنمای بکاپ گیری از دیتابیس PostgreSQL

## روش 1: بکاپ کامل (Full Backup)

### اگر دیتابیس در همان سرور است:
```bash
# بکاپ کامل از کل دیتابیس
pg_dump -U postgres -d your_database_name -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# بکاپ به فرمت SQL (قابل خواندن)
pg_dump -U postgres -d your_database_name -f backup_$(date +%Y%m%d_%H%M%S).sql

# بکاپ فشرده (gzip)
pg_dump -U postgres -d your_database_name | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### اگر دیتابیس در سرور دیگری است:
```bash
# بکاپ از راه دور (نیاز به دسترسی SSH)
pg_dump -h IP_OR_HOSTNAME -U postgres -d your_database_name -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# مثال:
pg_dump -h 192.168.1.100 -U postgres -d transport_db -f backup_$(date +%Y%m%d_%H%M%S).sql
```

## روش 2: بکاپ فقط یک جدول

```bash
# بکاپ یک جدول مشخص
pg_dump -U postgres -d your_database_name -t driver_calculations -f driver_calculations_backup.sql

# بکاپ چند جدول
pg_dump -U postgres -d your_database_name -t driver_calculations -t drivers -t freight_announcements -f tables_backup.sql
```

## روش 3: بکاپ فقط داده‌ها (بدون ساختار)

```bash
# فقط داده‌ها (INSERT statements)
pg_dump -U postgres -d your_database_name --data-only -f data_only_backup.sql

# فقط ساختار (بدون داده)
pg_dump -U postgres -d your_database_name --schema-only -f schema_only_backup.sql
```

## بازیابی (Restore)

```bash
# بازیابی از فایل SQL
psql -U postgres -d your_database_name -f backup_file.sql

# بازیابی از فایل dump (custom format)
pg_restore -U postgres -d your_database_name backup_file.dump

# بازیابی از فایل فشرده
gunzip < backup_file.sql.gz | psql -U postgres -d your_database_name
```

## اطلاعات مهم برای بکاپ

1. **نام دیتابیس**: معمولاً در فایل `backend/.env` یا `backend/config/database.js` مشخص است
2. **نام کاربری**: معمولاً `postgres` یا کاربر دیگری که در تنظیمات مشخص شده
3. **رمز عبور**: در فایل `.env` یا از مدیر سیستم بپرسید
4. **آدرس سرور**: اگر دیتابیس در سرور دیگری است

## مثال کامل با رمز عبور

اگر نیاز به وارد کردن رمز عبور دارید:
```bash
# با متغیر محیطی
export PGPASSWORD='your_password'
pg_dump -U postgres -d your_database_name -f backup.sql
unset PGPASSWORD
```

یا:
```bash
# با استفاده از ~/.pgpass file (ایمن‌تر)
# فایل ~/.pgpass را بسازید با فرمت:
# hostname:port:database:username:password
```

## بکاپ خودکار (Cron Job)

برای بکاپ خودکار روزانه:
```bash
# ویرایش crontab
crontab -e

# اضافه کردن خط زیر برای بکاپ روزانه در ساعت 2 صبح
0 2 * * * /usr/bin/pg_dump -U postgres -d your_database_name -f /backup/db_backup_$(date +\%Y\%m\%d).sql
```

## نکات مهم

1. **فضای دیسک**: مطمئن شوید فضای کافی برای بکاپ دارید
2. **دسترسی**: مطمئن شوید کاربر PostgreSQL دسترسی لازم را دارد
3. **تست بازیابی**: حتماً بکاپ را تست کنید که قابل بازیابی است
4. **رمزگذاری**: برای اطلاعات حساس، فایل‌های بکاپ را رمزگذاری کنید
5. **نگهداری**: بکاپ‌های قدیمی را حذف کنید تا فضا اشغال نشود

