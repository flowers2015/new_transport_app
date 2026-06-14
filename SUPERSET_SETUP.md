# جایگزینی Metabase با Apache Superset

راهنما برای سرور FMS (`/home/fms/project`) و دیتابیس اپ `transport_app`.

---

## بخش ۱ — حذف کامل Metabase (با محتویات)

### ۱.۱ توقف و حذف کانتینر + داده‌های داخلی Metabase

```bash
cd /home/fms/project

# توقف Metabase
docker compose -f docker-compose.metabase.yml down

# حذف volume (داشبوردها، تنظیمات، کاربران Metabase — غیرقابل بازگشت)
docker compose -f docker-compose.metabase.yml down -v

# اطمینان از حذف
docker ps -a | grep metabase
docker volume ls | grep metabase
```

اگر volume هنوز هست:

```bash
docker volume rm new_transport_app_metabase-data 2>/dev/null || \
docker volume rm project_metabase-data 2>/dev/null || \
docker volume ls | grep metabase
```

### ۱.۲ حذف تنظیمات Metabase از اپ

در `backend/.env` این خطوط را **حذف یا کامنت** کنید:

```env
# METABASE_PUBLIC_URL=...
# METABASE_EMBED_URL=...
# METABASE_ADMIN_URL=...
# METABASE_REPORT_TITLE=...
# METABASE_EMBED_ENABLED=...
```

سپس:

```bash
pm2 restart transport-backend
```

منوی **گزارش‌ها** در اپ تا زمان پیکربندی Superset پیام «پیکربندی نشده» نشان می‌دهد (طبیعی است).

### ۱.۳ (اختیاری) حذف کاربر فقط-خواندنی Metabase از PostgreSQL

```bash
sudo -u postgres psql -d transport_app -c "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM metabase_reader;"
sudo -u postgres psql -d transport_app -c "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM metabase_reader;"
sudo -u postgres psql -d transport_app -c "REVOKE USAGE ON SCHEMA public FROM metabase_reader;"
sudo -u postgres psql -d postgres -c "DROP USER IF EXISTS metabase_reader;"
```

### ۱.۴ (اختیاری) حذف پروکسی Nginx

اگر برای Metabase `location /metabase/` گذاشته بودید، آن بلوک را از کانفیگ Nginx حذف و reload کنید:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### ۱.۵ فایل‌های Metabase در پروژه

این فایل‌ها را **الان حذف نکنید** (آرشیو مستندات و SQL viewها برای Superset هم کاربرد دارند):

| فایل | توضیح |
|------|--------|
| `docker-compose.metabase.yml` | دیگر اجرا نمی‌شود |
| `METABASE_SETUP.md` | مستندات قدیمی |
| `scripts/metabase-create-bi-views.sql` | **همان viewها برای Superset** |
| `scripts/metabase-create-reader.sql` | الگوی ساخت کاربر reader |

---

## بخش ۲ — نصب Apache Superset

### ۲.۱ پیش‌نیاز

```bash
docker --version
docker compose version
free -h   # حداقل ~2GB RAM آزاد توصیه می‌شود
```

### ۲.۲ کاربر فقط-خواندنی برای داده اپ (Superset)

```bash
cd /home/fms/project
cp scripts/metabase-create-reader.sql scripts/superset-create-reader.sql
nano scripts/superset-create-reader.sql
# metabase_reader → superset_reader
# رمز قوی بگذارید

sudo -u postgres psql -d transport_app -f scripts/superset-create-reader.sql
```

### ۲.۳ Viewهای گزارش (همان مدل Metabase)

```bash
sudo -u postgres psql -d transport_app -f scripts/metabase-create-bi-views.sql
```

Viewهای آماده: `v_driver_tour_cost_report`, `v_freight_ops_report`, `v_route_cost_summary`, `v_commission_period_summary`

### ۲.۴ تنظیم Secret Key

```bash
cd /home/fms/project
nano docker-compose.superset.yml
```

مقدار `SUPERSET_SECRET_KEY` را با خروجی `openssl rand -base64 42` عوض کنید (قبل از `up` حتماً انجام شود).

### ۲.۵ بالا آوردن سرویس‌ها

> **سرور FMS:** اگر خطای `unknown shorthand flag: 'f'` دیدید، یعنی `docker compose` (v2) نصب نیست.
> از `docker-compose` (با خط تیره) یا اسکریپت کمکی استفاده کنید.

**روش پیشنهادی (اسکریپت):**

```bash
chmod +x scripts/superset-docker.sh
bash scripts/superset-docker.sh up
bash scripts/superset-docker.sh ps
```

**دستی با docker-compose v1:**

```bash
docker-compose -f docker-compose.superset.yml up -d
docker-compose -f docker-compose.superset.yml ps
```

**اگر docker compose v2 دارید:**

```bash
docker compose -f docker-compose.superset.yml up -d
```

### ۲.۶ راه‌اندازی اولیه Superset (فقط یک‌بار)

```bash
bash scripts/superset-docker.sh init
```

یا دستی:

```bash
docker-compose -f docker-compose.superset.yml exec superset superset db upgrade
docker-compose -f docker-compose.superset.yml exec -it superset superset fab create-admin
docker-compose -f docker-compose.superset.yml exec superset superset init
```

### ۲.۷ دسترسی در مرورگر

```
http://192.168.27.102:3001
```

(همان پورت 3001 قبلی Metabase — بعد از حذف Metabase)

ورود با ادمینی که در مرحله ۲.۶ ساختید.

---

## بخش ۳ — اتصال به دیتابیس transport_app

### ۳.۱ اجازه دسترسی Docker به PostgreSQL (یک‌بار روی سرور)

خطای **«The port is closed»** یعنی PostgreSQL فقط روی `127.0.0.1` گوش می‌دهد و کانتینر Superset به آن نمی‌رسد.

```bash
cd /home/fms/project
bash scripts/superset-pg-docker-access.sh
```

اگر `host.docker.internal` در compose نیست، کانتینر را recreate کنید:

```bash
bash scripts/superset-docker.sh recreate
```

### ۳.۲ فرم Connect Database در Superset

1. منو: **Settings → Database connections → + Database**
2. **PostgreSQL**
3. مقادیر:

| فیلد | مقدار |
|------|--------|
| Display Name | Transport App |
| Host | `host.docker.internal` |
| Port | `5432` |
| Database | `transport_app` |
| Username | `superset_reader` |
| Password | رمز reader (نه رمز ادمین Superset) |

4. **Test connection** → **Connect**

> **مهم:** `reza_ghezelbash` کاربر **ورود به Superset** است، نه کاربر PostgreSQL. برای دیتابیس اپ حتماً `superset_reader` بگذارید.

اگر `host.docker.internal` جواب نداد، Host را `192.168.27.102` (IP سرور) امتحان کنید.

### ۳.۴ عیب‌یابی خطای 422 / 500 در Connect

```bash
SUPERSET_DB_PASSWORD='رمز-superset_reader' bash scripts/superset-test-db-connection.sh
```

| خطا در تست | راه‌حل |
|------------|--------|
| کاربر وجود ندارد | `sudo -u postgres psql -d transport_app -f scripts/superset-create-reader.sql` |
| `password authentication failed` | رمز UI با رمز `superset_reader` در SQL یکی نیست — رمز را reset کنید (پایین) |
| `no pg_hba.conf entry` | `bash scripts/superset-pg-docker-access.sh` و `sudo systemctl restart postgresql` |
| TCP بسته | `listen_addresses = '*'` و restart postgres |

**Reset رمز superset_reader** (اگر «incorrect password» می‌بینید):

```bash
sudo -u postgres psql -d transport_app -c "ALTER USER superset_reader WITH PASSWORD 'رمز_جدید_قوی';"
```

سپس همان رمز را در Superset بگذارید و تست کنید:

```bash
SUPERSET_DB_PASSWORD='رمز_جدید_قوی' bash scripts/superset-test-db-connection.sh
```

**اتصال با SQLAlchemy URI** (اگر فرم UI خطا داد):

Settings → Database → PostgreSQL → **Connect using SQLAlchemy URI**:

```
postgresql+psycopg2://superset_reader:رمز@host.docker.internal:5432/transport_app
```

> `installHook.js` مربوط به افزونه مرورگر است؛ نادیده بگیرید.

### ۳.۳ ساخت کاربر reader (اگر نکرده‌اید)

```bash
sudo -u postgres psql -d transport_app -f scripts/superset-create-reader.sql
```

---

## بخش ۴ — ساخت اولین داشبورد

1. **SQL → SQL Lab** — تست:

```sql
SELECT status, COUNT(*) AS cnt
FROM freight_announcements
GROUP BY status
ORDER BY cnt DESC;
```

2. **Create chart** از نتیجه
3. **Dashboard → + Dashboard** — چارت را اضافه کنید
4. برای انتشار عمومی: **Dashboard → Share** (در Superset 4 از منوی Dashboard و Embed/Share استفاده کنید)

---

## بخش ۵ — اتصال به اپ (اختیاری — بعداً)

فعلاً منوی **گزارش‌ها** هنوز به Metabase وصل است. برای Superset باید در فاز بعد:

- `reportsController.js` و `MetabaseReports.tsx` به Superset embed URL تغییر کنند
- متغیرهای `.env` مثل `SUPERSET_PUBLIC_URL` اضافه شوند

تا آن زمان کاربران مستقیماً `http://IP:3001` را باز می‌کنند.

---

## بخش ۶ — نگهداری

```bash
cd /home/fms/project

# وضعیت
docker compose -f docker-compose.superset.yml ps

# لاگ
docker compose -f docker-compose.superset.yml logs -f --tail=100 superset

# توقف / شروع
docker compose -f docker-compose.superset.yml stop
docker compose -f docker-compose.superset.yml start

# آپدیت نسخه (بعد از بکاپ volumeها)
docker compose -f docker-compose.superset.yml pull
docker compose -f docker-compose.superset.yml up -d
docker compose -f docker-compose.superset.yml exec superset superset db upgrade
```

---

## عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| پورت 3001 اشغال است | `docker ps` — Metabase را با `down -v` حذف کنید |
| اتصال DB — `No module named 'psycopg2'` | `bash scripts/superset-docker.sh build` (image سفارشی با درایور PG) |
| اتصال DB از Docker — The port is closed | `bash scripts/superset-pg-docker-access.sh` (نیاز به **restart** postgres)؛ Host=`host.docker.internal`؛ User=`superset_reader` |
| صفحه Superset 502 | `docker compose logs superset` — مراحل `db upgrade` و `init` را اجرا کنید |
| کندی | RAM سرور را افزایش دهید؛ تعداد workerها در compose |

---

## مقایسه سریع Metabase ↔ Superset

| موضوع | Metabase | Superset |
|--------|----------|----------|
| پورت پیش‌فرض این پروژه | 3001 | 3001 (همان) |
| داده اپ | `superset_reader` / `metabase_reader` | `superset_reader` |
| Viewهای آماده | `scripts/metabase-create-bi-views.sql` | **همان فایل** |
| حجم RAM | ~768MB | ~1.5GB+ |
