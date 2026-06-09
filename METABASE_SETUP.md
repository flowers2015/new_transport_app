# راهنمای نصب Metabase برای گزارش‌گیری ترابری

این راهنما برای سرور **FMS** (`/home/fms/project`) و دیتابیس **PostgreSQL** اپ (`transport_app`) نوشته شده است.

---

## خلاصه مراحل

1. نصب Docker (اگر نیست)
2. ساخت کاربر فقط-خواندنی در PostgreSQL
3. اجرای Metabase با `docker-compose.metabase.yml`
4. راه‌اندازی اولیه در مرورگر (`http://IP-SERVER:3001`)
5. اتصال به دیتابیس `transport_app`
6. ساخت اولین داشبورد و لینک عمومی
7. تنظیم `backend/.env` و restart بک‌اند
8. منوی **گزارش‌ها** در اپ برای کاربر ترابری فعال می‌شود

---

## ۱ — پیش‌نیاز

روی سرور:

```bash
docker --version
docker compose version
psql --version
```

اگر Docker نیست (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker fms
# یک‌بار logout/login کنید
```

PostgreSQL باید در حال اجرا باشد (همان دیتابیس اپ):

```bash
sudo systemctl status postgresql
```

---

## ۲ — کاربر فقط-خواندنی (امنیت)

Metabase را با کاربر `postgres` اصلی وصل **نکنید**. فقط SELECT بدهید:

```bash
cd /home/fms/project
nano scripts/metabase-create-reader.sql
# رمز CHANGE_ME_STRONG_PASSWORD را عوض کنید

sudo -u postgres psql -d transport_app -f scripts/metabase-create-reader.sql
```

یادداشت کنید:
- **Host:** `localhost` (از دید سرور) یا `172.17.0.1` (از داخل Docker)
- **Port:** `5432`
- **Database:** `transport_app`
- **User:** `metabase_reader`
- **Password:** همان رمزی که گذاشتید

---

## ۳ — اجرای Metabase

```bash
cd /home/fms/project
docker compose -f docker-compose.metabase.yml up -d
docker compose -f docker-compose.metabase.yml logs -f
```

تا پیام «Metabase Initialization COMPLETE» را ببینید.

در مرورگر (از شبکه داخلی یا با باز کردن پورت):

```
http://51.178.41.12:3001
```

(آی‌پی سرور خودتان را بگذارید.)

---

## ۴ — راه‌اندازی اولیه Metabase (اولین بار)

1. زبان را انتخاب کنید (فارسی در UI محدود است؛ انگلیسی هم قابل استفاده است)
2. **نام / ایمیل / رمز** ادمین Metabase را بسازید (جدا از کاربران اپ)
3. **Add your data** → **PostgreSQL**
4. مقادیر اتصال:

| فیلد | مقدار |
|------|--------|
| Display name | Transport App |
| Host | `host.docker.internal` یا `172.17.0.1` |
| Port | `5432` |
| Database name | `transport_app` |
| Username | `metabase_reader` |
| Password | رمز reader |

5. **Save** → اگر خطا داد، Host را `172.17.0.1` امتحان کنید
6. **Skip** برای نمونه داده (Sample Database)

---

## ۵ — ساخت اولین گزارش (مثال عملی)

### الف) جدول ساده — اعلام بار به تفکیک وضعیت

1. منوی چپ: **+ New** → **Question**
2. دیتابیس: **Transport App**
3. جدول: `freight_announcements`
4. **Summarize** → Count of rows
5. **Group by** → فیلد `status`
6. **Visualize** → نمودار میله‌ای
7. **Save** → نام: `اعلام بار به تفکیک وضعیت`

### ب) داشبورد

1. **+ New** → **Dashboard** → نام: `داشبورد ترابری`
2. گزارش ذخیره‌شده را به داشبورد اضافه کنید
3. چیدمان را مرتب کنید و **Save**

### ج) لینک برای کاربران اپ (بدون لاگین جدا)

1. روی داشبورد → آیکن **Sharing**
2. **Enable sharing** / **Public link**
3. لینک را کپی کنید؛ شبیه:

```
http://51.178.41.12:3001/public/dashboard/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## ۶ — اتصال به اپ (منوی «گزارش‌ها»)

در `backend/.env` اضافه کنید:

```env
# آدرس لینک عمومی داشبورد (یا صفحه اصلی Metabase)
METABASE_PUBLIC_URL=http://51.178.41.12:3001/public/dashboard/UUID-داشبورد-شما

# اختیاری — برای نمایش داخل iframe (معمولاً همان public URL)
METABASE_EMBED_URL=http://51.178.41.12:3001/public/dashboard/UUID-داشبورد-شما

# اختیاری — پنل ادمین Metabase (فقط برای admin اپ نشان داده می‌شود)
METABASE_ADMIN_URL=http://51.178.41.12:3001

METABASE_REPORT_TITLE=گزارش‌های ترابری
METABASE_EMBED_ENABLED=true
```

سپس:

```bash
pm2 restart transport-backend
cd /home/fms/project/frontend && npm run build
```

کاربران با نقش **کاربر ترابری** در منو **گزارش‌ها** را می‌بینند.

---

## ۷ — Nginx (اختیاری، آدرس تمیزتر)

اگر Nginx دارید، زیرمسیر یا ساب‌دامین:

```nginx
location /metabase/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

آنگاه:

```env
METABASE_PUBLIC_URL=https://your-domain/metabase/public/dashboard/UUID
```

---

## ۸ — فایروال

فقط اگر از بیرون سرور دسترسی می‌خواهید:

```bash
sudo ufw allow 3001/tcp
```

ترجیحاً پورت 3001 را فقط برای IP داخلی باز کنید و از Nginx + HTTPS استفاده کنید.

---

## ۹ — نگهداری

```bash
# وضعیت
docker compose -f docker-compose.metabase.yml ps

# لاگ
docker compose -f docker-compose.metabase.yml logs -f --tail=100

# توقف / شروع
docker compose -f docker-compose.metabase.yml stop
docker compose -f docker-compose.metabase.yml start

# آپدیت نسخه Metabase (بعد از بکاپ volume)
docker compose -f docker-compose.metabase.yml pull
docker compose -f docker-compose.metabase.yml up -d
```

---

## ۱۰ — جداول پرکاربرد برای گزارش ترابری

| جدول | کاربرد |
|------|--------|
| `freight_announcements` | اعلام بار، وضعیت، مقاصد |
| `dispatch_queue_entries` | نوبت رانندگان |
| `driver_calculations` | محاسبات مالی تور |
| `drivers` | رانندگان |
| `vehicles` | خودروها |
| `bale_dispatch_sessions` | جلسات بله |
| `support_tickets` | تیکت پشتیبانی |

---

## عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| اتصال DB از Docker | Host را `172.17.0.1` بگذارید؛ `listen_addresses` در `postgresql.conf` |
| iframe خالی | Public sharing را فعال کنید؛ `METABASE_EMBED_ENABLED=false` و فقط لینک جدید |
| منوی گزارش خالی | `METABASE_PUBLIC_URL` در `.env` و `pm2 restart` |
| کند شدن | `JAVA_OPTS=-Xmx1024m` در docker-compose |

---

## امنیت

- کاربر `metabase_reader` فقط SELECT دارد
- لینک public را فقط برای داشبوردهای غیرحساس بدهید
- ادمین Metabase جدا از ادمین اپ است
- برای داده حساس: به‌جای public link، کاربر Metabase با گروه محدود بسازید
