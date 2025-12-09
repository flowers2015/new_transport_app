# بهینه‌سازی Query‌های Database

## 🔍 مشکل شناسایی شده

از Network Tab مشخص شد که:
- `personal-drivers`: **2,275 kB** (5.23s) ❌
- `personal-vehicles`: **2,974 kB** (5.32s) ❌
- `vehicles`: 252 kB (1.87s) ⚠️
- `drivers`: 126 kB (447ms) ✅

## ✅ بهبودهای انجام شده

### 1. Compression Middleware
- اضافه شدن `compression` package به `backend/package.json`
- فعال شدن Gzip compression در `backend/server.js`
- **تأثیر**: کاهش 60-80% حجم داده‌ها

### 2. بهینه‌سازی Query‌ها

#### `getAllPersonalDrivers`
**قبل:**
```sql
SELECT 
  id, national_id, name, mobile, driver_smart_id,
  created_at, updated_at  -- غیرضروری
FROM personal_drivers 
ORDER BY created_at DESC
```

**بعد:**
```sql
SELECT 
  id, national_id, name, mobile, driver_smart_id
FROM personal_drivers 
ORDER BY name ASC  -- مرتب‌سازی بهتر
```

**کاهش حجم**: ~30-40% (حذف `created_at`, `updated_at`)

#### `getAllPersonalVehicles`
**قبل:**
```sql
SELECT 
  id, truck_smart_id, plate_part1, plate_letter, plate_part2,
  plate_city_code, vehicle_type, vehicle_usage,
  created_at, updated_at  -- غیرضروری
FROM personal_vehicles 
ORDER BY created_at DESC
```

**بعد:**
```sql
SELECT 
  id, truck_smart_id, plate_part1, plate_letter, plate_part2,
  plate_city_code, vehicle_type, vehicle_usage
FROM personal_vehicles 
ORDER BY plate_part1 ASC, plate_part2 ASC  -- مرتب‌سازی بهتر
```

**کاهش حجم**: ~30-40% (حذف `created_at`, `updated_at`)

#### `getDrivers`
**قبل:** همه فیلدها (37 فیلد)
**بعد:** فقط فیلدهای ضروری (9 فیلد)
- `id`, `employee_id`, `name`, `mobile`, `national_id`
- `license_number`, `license_type`
- `current_vehicle_type`, `current_vehicle_plate`

**کاهش حجم**: ~70-80%

## 📊 بهبودهای مورد انتظار

### بعد از Compression:
- `personal-drivers`: از 2,275 kB به ~450-900 kB (60-80% کاهش)
- `personal-vehicles`: از 2,974 kB به ~600-1,200 kB (60-80% کاهش)
- `vehicles`: از 252 kB به ~50-100 kB
- `drivers`: از 126 kB به ~25-50 kB

### بعد از بهینه‌سازی Query:
- `personal-drivers`: کاهش اضافی 30-40%
- `personal-vehicles`: کاهش اضافی 30-40%
- `drivers`: کاهش اضافی 70-80%

### مجموع بهبود:
- `personal-drivers`: از 2,275 kB به ~300-600 kB (**73-87% کاهش**)
- `personal-vehicles`: از 2,974 kB به ~400-800 kB (**73-87% کاهش**)
- `drivers`: از 126 kB به ~10-20 kB (**84-92% کاهش**)

### بهبود زمان:
- `personal-drivers`: از 5.23s به ~1-2s (**62-81% کاهش**)
- `personal-vehicles`: از 5.32s به ~1-2s (**62-81% کاهش**)
- `drivers`: از 447ms به ~100-200ms (**55-78% کاهش**)

## 🚀 مراحل بعدی (اختیاری)

### 1. Pagination
اگر تعداد رکوردها خیلی زیاد است، می‌توان pagination اضافه کرد:
```sql
SELECT ... FROM personal_drivers 
ORDER BY name ASC
LIMIT 1000 OFFSET $1
```

### 2. Lazy Loading در Frontend
لود کردن `personal-drivers` و `personal-vehicles` فقط وقتی که نیاز است:
- در `TransportLiveContainer`، فقط وقتی که تب "ترابری شخصی" فعال است
- یا وقتی که dialog assignment باز می‌شود

### 3. Indexing
اضافه کردن index برای فیلدهای مرتب‌سازی:
```sql
CREATE INDEX IF NOT EXISTS idx_personal_drivers_name ON personal_drivers(name);
CREATE INDEX IF NOT EXISTS idx_personal_vehicles_plate ON personal_vehicles(plate_part1, plate_part2);
```

## 📝 دستورات نصب

```bash
cd backend
npm install compression
```

## ⚠️ نکات مهم

1. **Compression**: باید در production فعال باشد
2. **Query Optimization**: فقط فیلدهای ضروری را برگردانید
3. **Testing**: بعد از تغییرات، Network Tab را بررسی کنید
4. **Monitoring**: حجم و زمان response را monitor کنید

