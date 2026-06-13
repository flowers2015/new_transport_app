# راهنمای ساخت و انتشار داشبورد Metabase — برای پرسنل

این سند مکمل `METABASE_SETUP.md` است: **کجا کد بگذارید، چطور داشبورد بسازید، چطور پرسنل ببیند.**

---

## نقشه فایل‌ها (کجا چی باشد)

| فایل | محل | کار |
|------|-----|-----|
| `docker-compose.metabase.yml` | ریشه پروژه | اجرای Metabase روی پورت 3001 |
| `scripts/metabase-create-reader.sql` | روی سرور PostgreSQL | کاربر فقط-خواندنی |
| `scripts/metabase-create-report-view.sql` | روی PostgreSQL | view عملیات پایه |
| `scripts/metabase-create-bi-views.sql` | روی PostgreSQL | viewهای مالی/مسیر/دوره |
| `backend/controllers/reportsController.js` | بک‌اند | خواندن `.env` و API |
| `backend/routes/reportsRoutes.js` | بک‌اند | مسیر `GET /api/reports/metabase` |
| `frontend/components/MetabaseReports.tsx` | فرانت | iframe / لینک گزارش |
| `backend/.env` | سرور | آدرس داشبورد عمومی |
| `METABASE_SETUP.md` | مستندات | نصب اولیه Docker + DB |

**کد اپ از قبل آماده است.** فقط SQL روی DB + Metabase + `.env` لازم است.

---

## مرحله ۱ — نصب زیرساخت (یک‌بار، روی سرور)

```bash
cd /home/fms/project

# 1) کاربر reader
nano scripts/metabase-create-reader.sql   # رمز را عوض کنید
sudo -u postgres psql -d transport_app -f scripts/metabase-create-reader.sql

# 2) Viewها
sudo -u postgres psql -d transport_app -f scripts/metabase-create-report-view.sql
sudo -u postgres psql -d transport_app -f scripts/metabase-create-bi-views.sql

# 3) Metabase
docker compose -f docker-compose.metabase.yml up -d
```

مرورگر: `http://IP-SERVER:3001`

---

## مرحله ۲ — اتصال Metabase به دیتابیس

1. Setup wizard → PostgreSQL
2. Display name: **Transport App**
3. Host: `172.17.0.1` (یا `host.docker.internal`)
4. Database: `transport_app` | User: `metabase_reader`
5. Save → Sync database schema now

بعد از sync این جدول/viewها را می‌بینید:

- `v_freight_report` — عملیات ساده
- `v_freight_ops_report` — تخصیص + لاین + مسیر
- `v_driver_tour_cost_report` — مالی تور (ستون `tour_cost_certain`)
- `v_route_cost_summary` — مسیر × خودرو
- `v_commission_period_summary` — دوره بسته

---

## مرحله ۳ — ساخت Question (گزارش)

### A) تعداد ارسال شرکتی/شخصی — ماهانه

1. **+ New → Question → Transport App**
2. جدول: `v_freight_ops_report`
3. Filter: `is_assignment_finalized = true`
4. Summarize: **Count of rows**
5. Group by: `loading_date` (یا `created_at`) → By month
6. Group by دوم: `assignment_type_label`
7. Visualization: Stacked bar
8. Save: `ارسال ماهانه شرکتی/شخصی`

### B) هزینه تور قطعی — درصد سوخت/غذا/دپو

1. جدول: `v_driver_tour_cost_report`
2. Filter: `is_tour_cost_recorded = true`
3. Summarize: Sum of `tour_cost_certain`, `fuel_cost`, `food_cost`, `toll_cost`
4. Visualization: Pie یا Number
5. Save: `ترکیب هزینه‌های تور`

برای درصد در Metabase: **Custom column**  
`[fuel_cost] / [tour_cost_certain] * 100`

### C) مسیر مشهد — تعداد و هزینه

1. جدول: `v_route_cost_summary`
2. Filter: `primary_destination_city` contains `مشهد`
3. Filter: `assignment_type_label = شرکتی`
4. Columns: `vehicle_type`, `tour_count`, `sum_tour_cost_certain`, `sum_kilometers`
5. Save: `آنالیز مسیر مشهد`

### D) دوره بسته — پیمایش و پورسانت

1. جدول: `v_commission_period_summary`
2. Filter: `period_name` = نام دوره
3. Visualization: Bar — X: `driver_name`, Y: `sum_kilometers` / `sum_commission_certain`
4. Save: `پورسانت دوره`

---

## مرحله ۴ — ساخت Dashboard

1. **+ New → Dashboard** → نام: `داشبورد ترابری و مالی`
2. **Add a question** → هر ۴ گزارش بالا را اضافه کنید
3. تب‌ها (اختیاری):
   - **عملیات**: A + ops
   - **مالی تور**: B + C
   - **دوره بسته**: D
4. **Save**

---

## مرحله ۵ — انتشار برای پرسنل

### روش ۱ — داخل اپ (پیشنهادی)

1. روی داشبورد در Metabase → **Sharing** (آیکن اشتراک)
2. **Enable public link**
3. لینک را کپی کنید، مثلاً:

```
http://51.178.41.12:3001/public/dashboard/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

4. در `backend/.env`:

```env
METABASE_PUBLIC_URL=http://51.178.41.12:3001/public/dashboard/UUID-داشبورد
METABASE_EMBED_URL=http://51.178.41.12:3001/public/dashboard/UUID-داشبورد
METABASE_ADMIN_URL=http://51.178.41.12:3001
METABASE_REPORT_TITLE=گزارش‌های ترابری
METABASE_REPORT_DESCRIPTION=تحلیل عملیات، هزینه تور و دوره‌های بسته
METABASE_EMBED_ENABLED=true
```

5. Restart:

```bash
pm2 restart transport-backend
cd /home/fms/project/frontend && npm run build
# rsync یا deploy معمول frontend
```

6. پرسنل با نقش‌های زیر در منو **«گزارش BI»** می‌بینند:
   - کاربر ترابری
   - کاربر ترابری شخصی
   - مالی ترابری

همچنین API برای نقش‌های `planner`, `finance`, `admin` باز است.

### روش ۲ — لینک مستقیم (بدون ورود به اپ)

همان Public URL را در ایمیل/بله بفرستید. هر کس لینک را دارد می‌بیند — **فقط برای داده غیرحساس.**

### روش ۳ — Nginx + HTTPS (تمیزتر)

```nginx
location /metabase/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

```env
METABASE_PUBLIC_URL=https://your-domain/metabase/public/dashboard/UUID
METABASE_EMBED_URL=https://your-domain/metabase/public/dashboard/UUID
```

---

## مرحله ۶ — به‌روزرسانی داشبورد بعد از تغییر

1. Question/Dashboard را در Metabase ویرایش کنید → Save
2. **نیازی به deploy اپ نیست** — iframe همان public link را می‌خواند
3. اگر UUID داشبورد عوض شد → فقط `.env` را آپدیت و `pm2 restart`

---

## عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| منو «گزارش BI» پیام «پیکربندی نشده» | `METABASE_PUBLIC_URL` در `.env` + restart |
| iframe خالی | Public sharing فعال باشد؛ یا `METABASE_EMBED_ENABLED=false` و دکمه «باز کردن گزارش» |
| view پیدا نمی‌شود | دوباره `metabase-create-bi-views.sql` + Sync schema در Metabase |
| پورسانت NULL | طبیعی است تا دوره بسته نشود (`commission_certain`) |
| `finance_disposition` خطا | migration رد مالی را اجرا کنید |

---

## چک‌لیست انتشار

- [ ] Docker Metabase up
- [ ] `metabase_reader` + viewها روی DB
- [ ] Sync schema در Metabase
- [ ] حداقل ۱ Dashboard + Public link
- [ ] `backend/.env` تنظیم + pm2 restart
- [ ] frontend build/deploy
- [ ] تست با کاربر «ترابری» — منو گزارش BI
