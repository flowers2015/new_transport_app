# نقشه داده‌ها برای Metabase — سیستم ناوگان

این سند برای کسی است که Metabase را نصب کرده و می‌خواهد جداول را به هم وصل کند و گزارش بسازد.

---

## ۱. تصویر کلی (چه چیزی کجاست؟)

```
اعلام بار (freight_announcements)
    │
    ├── مقاصد (freight_destinations)     ← شهر، کرایه هر مقصد
    │
    ├── تخصیص‌ها (dispatch_assignments)  ← هر تخصیص به ازای هر مقصد
    │       ├── راننده (drivers)         ← شرکتی
    │       ├── خودرو (vehicles)         ← شرکتی
    │       └── مسیر (dispatch_routes)   ← کیلومتر، دسته مسیر
    │
    └── تراکنش مالی (freight_transactions) ← پرداخت کرایه (شخصی)
```

---

## ۲. جدول اصلی: `freight_announcements`

هر **ردیف = یک اعلام بار**.

| ستون | معنی | مثال |
|------|------|------|
| `id` | شناسه یکتا | `fa-uuid-...` |
| `announcement_code` | کد اعلام بار | `14040101-001` |
| `line_type` | **نوع لاین** (فیلتر شما) | `بستنی` ، `پاستوریزه` ، `لبنیات-فروتلند` |
| `vehicle_type` | **نوع خودرو** | `تریلی` ، `مینی تریلی` ، `ده چرخ` |
| `assignment_type` | شرکتی / شخصی | `company` = شرکتی ، `personal` = شخصی |
| `status` | وضعیت | `Assigned` ، `Finalized` ، `Cancelled` ، ... |
| `origin_city` | مبدأ | شهر بارگیری |
| `assigned_driver_id` | راننده تخصیص‌یافته | NULL = هنوز تخصیص نشده |
| `assigned_vehicle_id` | خودرو تخصیص‌یافته | |
| `total_freight_cost` | کرایه کل (اغلب شخصی) | ممکن است NULL برای شرکتی |
| `loading_date` | تاریخ بارگیری | |
| `created_at` | زمان ثبت | |

**نکته مهم:** شهر **مقصد** اینجا نیست — در جدول `freight_destinations` است.

---

## ۳. مقاصد: `freight_destinations`

هر اعلام بار می‌تواند **چند مقصد** داشته باشد.

| ستون | معنی |
|------|------|
| `id` | شناسه مقصد |
| `freight_announcement_id` | ← **کلید خارجی** به `freight_announcements.id` |
| `city` | **شهر مقصد** (فیلتر شما) |
| `freight_cost` | **کرایه این مقصد** (مهم برای شخصی) |
| `tonnage` | تناژ |
| `representative_name` | نماینده |
| `representative_type` | نوع نماینده |

**رابطه در Metabase:**
```
freight_destinations.freight_announcement_id  =  freight_announcements.id
```
نوع: **Many destinations → One announcement**

---

## ۴. تخصیص روی تابلو: `dispatch_assignments`

وقتی بار **شرکتی** تخصیص می‌شود، معمولاً برای **هر مقصد** یک ردیف اینجا ساخته می‌شود.

| ستون | معنی |
|------|------|
| `freight_announcement_id` | → `freight_announcements.id` |
| `freight_destination_id` | → `freight_destinations.id` |
| `driver_id` | → `drivers.id` |
| `vehicle_id` | → `vehicles.id` |
| `route_id` | → `dispatch_routes.id` |
| `stage` | مرحله نوبت (`stage1` ، `stage2` ، ...) |
| `vehicle_category` | تریلی / مینی تریلی / ده چرخ |
| `assignment_finalized_at` | زمان نهایی شدن تخصیص |
| `is_cancelled` | لغو شده؟ |

---

## ۵. مسیر و شهر: `dispatch_routes`

جدول مرجع شهرها و کیلومتر.

| ستون | معنی |
|------|------|
| `city` | نام شهر |
| `province` | استان |
| `round_trip_km` | کیلومتر رفت‌وبرگشت |
| `distance_category` | دسته فاصله |
| `route_category` | دسته مسیر |

**اتصال:** از `dispatch_assignments.route_id` یا join روی `freight_destinations.city = dispatch_routes.city`

---

## ۶. شرکتی vs شخصی

| نوع | `assignment_type` | کرایه کجاست؟ | گزارش شما |
|-----|-------------------|--------------|-----------|
| **شخصی** | `personal` | `freight_destinations.freight_cost` | میانگین/مجموع کرایه به تفکیک خودرو |
| **شرکتی** | `company` | معمولاً کرایه ندارید | **تعداد** تخصیص به تفکیک `vehicle_type` |

تشخیص راننده شخصی: `assigned_driver_id` در جدول `personal_drivers` هم هست.

---

## ۷. مقادیر فیلترهای شما

### لاین (`line_type`)
- `بستنی`
- `پاستوریزه`
- `لبنیات-فروتلند`

### نوع خودرو (`vehicle_type`)
- `تریلی`
- `مینی تریلی`
- `ده چرخ`

### وضعیت‌های «تخصیص داده شده»
```sql
fa.assigned_driver_id IS NOT NULL
AND fa.status IN ('Assigned', 'InTransit', 'Finalized')
```

---

## ۸. مثال داشبورد شما (گام‌به‌گام در Metabase)

### هدف
- فیلتر: **لاین** + **شهر**
- **شخصی:** کرایه به تفکیک نوع خودرو
- **شرکتی:** تعداد تخصیص به تفکیک نوع خودرو

---

### روش A — SQL (پیشنهادی، سریع‌تر)

در Metabase: **+ New → SQL query → Transport App**

#### گزارش ۱: کرایه شخصی (با فیلتر لاین و شهر)

```sql
SELECT
  fa.line_type          AS "لاین",
  fd.city               AS "شهر",
  fa.vehicle_type       AS "نوع خودرو",
  COUNT(DISTINCT fa.id) AS "تعداد اعلام",
  ROUND(AVG(fd.freight_cost)::numeric, 0) AS "میانگین کرایه (ریال)",
  ROUND(MIN(fd.freight_cost)::numeric, 0) AS "کمترین کرایه",
  ROUND(MAX(fd.freight_cost)::numeric, 0) AS "بیشترین کرایه",
  ROUND(SUM(fd.freight_cost)::numeric, 0) AS "جمع کرایه"
FROM freight_announcements fa
INNER JOIN freight_destinations fd
  ON fd.freight_announcement_id = fa.id
WHERE fa.assignment_type = 'personal'
  AND fa.assigned_driver_id IS NOT NULL
  AND fa.status NOT IN ('Cancelled', 'Draft')
  AND COALESCE(fd.freight_cost, 0) > 0
  [[AND fa.line_type = {{line_type}}]]
  [[AND fd.city = {{city}}]]
GROUP BY fa.line_type, fd.city, fa.vehicle_type
ORDER BY fa.line_type, fd.city, fa.vehicle_type;
```

بعد از Run، روی **Variables** کلیک کنید:
- `line_type` → Field Filter → Text
- `city` → Field Filter → Text

Visualization: **جدول** یا **نمودار میله‌ای** (محور X = نوع خودرو، Y = میانگین کرایه)

---

#### گزارش ۲: تعداد شرکتی (بدون کرایه)

```sql
SELECT
  fa.line_type          AS "لاین",
  fd.city               AS "شهر",
  fa.vehicle_type       AS "نوع خودرو",
  COUNT(DISTINCT fa.id) AS "تعداد تخصیص شرکتی"
FROM freight_announcements fa
INNER JOIN freight_destinations fd
  ON fd.freight_announcement_id = fa.id
WHERE fa.assignment_type = 'company'
  AND fa.assigned_driver_id IS NOT NULL
  AND fa.status NOT IN ('Cancelled', 'Draft')
  [[AND fa.line_type = {{line_type}}]]
  [[AND fd.city = {{city}}]]
GROUP BY fa.line_type, fd.city, fa.vehicle_type
ORDER BY fa.line_type, fd.city, fa.vehicle_type;
```

Visualization: **نمودار میله‌ای** — Count بر اساس vehicle_type

---

#### گزارش ۳ (اختیاری): ترکیب هر دو در یک نگاه

```sql
SELECT
  fa.line_type AS "لاین",
  fd.city AS "شهر",
  fa.vehicle_type AS "نوع خودرو",
  fa.assignment_type AS "نوع تخصیص",
  CASE
    WHEN fa.assignment_type = 'personal' THEN 'شخصی (کرایه‌دار)'
    WHEN fa.assignment_type = 'company'  THEN 'شرکتی (بدون کرایه)'
    ELSE fa.assignment_type
  END AS "دسته",
  COUNT(DISTINCT fa.id) AS "تعداد",
  ROUND(AVG(NULLIF(fd.freight_cost, 0))::numeric, 0) AS "میانگین کرایه"
FROM freight_announcements fa
INNER JOIN freight_destinations fd
  ON fd.freight_announcement_id = fa.id
WHERE fa.assigned_driver_id IS NOT NULL
  AND fa.status NOT IN ('Cancelled', 'Draft')
  [[AND fa.line_type = {{line_type}}]]
  [[AND fd.city = {{city}}]]
GROUP BY fa.line_type, fd.city, fa.vehicle_type, fa.assignment_type
ORDER BY fa.line_type, fd.city, fa.vehicle_type, fa.assignment_type;
```

---

### روش B — بدون SQL (کلیک در Metabase)

1. **New → Question → Transport App**
2. جدول پایه: `freight_announcements`
3. **Join data** → `freight_destinations`
   - رابطه: `ID` = `Freight Announcement ID` (یا دستی: `id` = `freight_announcement_id`)
4. **Filter:**
   - `Assignment Type` = `personal` (برای کرایه) یا `company` (برای تعداد)
   - `Assigned Driver ID` → is not empty
   - `Status` → is not `Cancelled`
5. **Summarize:**
   - برای شخصی: Average of `Freight Destinations → Freight Cost` ، Group by `Vehicle Type`
   - برای شرکتی: Count of rows ، Group by `Vehicle Type`
6. **Add filter widget** روی داشبورد برای `Line Type` و `Freight Destinations → City`

---

### ساخت داشبورد نهایی

1. **New → Dashboard** → نام: `کرایه و تخصیص به تفکیک لاین و شهر`
2. گزارش SQL شخصی را اضافه کنید + فیلتر `line_type` و `city`
3. گزارش SQL شرکتی را اضافه کنید + همان فیلترها
4. **Sharing → Public link** → آدرس را در `METABASE_PUBLIC_URL` بگذارید

---

## ۹. جداول دیگر (برای گزارش‌های بعدی)

| جدول | کاربرد | کلید ارتباط |
|------|--------|-------------|
| `drivers` | راننده شرکتی | `freight_announcements.assigned_driver_id = drivers.id` |
| `vehicles` | خودرو شرکتی | `assigned_vehicle_id = vehicles.id` |
| `personal_drivers` | راننده شخصی | `assigned_driver_id = personal_drivers.id` |
| `dispatch_queue_entries` | نوبت رانندگان | `driver_id` ، `vehicle_id` |
| `driver_calculations` | هزینه تور مالی | `announcement_id` |
| `freight_transactions` | پرداخت کرایه | `announcement_id` ، `destination_id` |
| `support_tickets` | تیکت | مستقل |

---

## ۱۰. اشتباهات رایج

| مشکل | علت | راه‌حل |
|------|-----|--------|
| کرایه شرکتی صفر است | طبیعی است | فقط Count بگیرید |
| شهر خالی | مقصد ثبت نشده | فقط join با `freight_destinations` |
| یک اعلام چند بار شمرده می‌شود | چند مقصد | از `COUNT(DISTINCT fa.id)` استفاده کنید |
| لاین انگلیسی نیست | در DB فارسی است | `بستنی` نه `IceCream` |
| Metabase رابطه نمی‌شناسد | FK در DB نیست | Join دستی در SQL یا در GUI |

---

## ۱۱. View آماده (اختیاری — یک‌بار روی سرور)

اگر SQL تکراری سخت است، این View را بسازید:

```bash
sudo -u postgres psql -d transport_app
```

```sql
CREATE OR REPLACE VIEW v_freight_report AS
SELECT
  fa.id AS announcement_id,
  fa.announcement_code,
  fa.line_type,
  fa.vehicle_type,
  fa.assignment_type,
  fa.status,
  fa.origin_city,
  fa.loading_date,
  fa.created_at,
  fd.id AS destination_id,
  fd.city AS destination_city,
  fd.freight_cost,
  fd.tonnage,
  fa.assigned_driver_id,
  fa.assigned_vehicle_id
FROM freight_announcements fa
LEFT JOIN freight_destinations fd
  ON fd.freight_announcement_id = fa.id;

GRANT SELECT ON v_freight_report TO metabase_reader;
```

بعد در Metabase فقط جدول `v_freight_report` را انتخاب کنید — همه چیز از قبل join شده است.
