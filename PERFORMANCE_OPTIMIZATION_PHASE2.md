# بهینه‌سازی عملکرد - فاز 2

## 🔍 مشکلات شناسایی شده

از Network Tab مشخص شد:
- **لاگین**: 22 requests, 3.0 MB, Finish: 6.69s
- **بعد لاگین**: 31 requests, 3.0 MB, Finish: 43.24s
- **تاریخچه اعلام بار**: 31 requests, 3.0 MB, Finish: 43.24s
- **داشبورد ترابری**: 43 requests, 3.0 MB, Finish: 2.2 min
- **پیگیری اعلام بار زنده**: 47 requests, 3.0 MB, Finish: 2.6 min

### مشکلات اصلی:
1. **Fetch مجدد در هر navigation**: وقتی بین صفحات جابجا می‌شود، همه داده‌ها دوباره fetch می‌شوند
2. **TTL کوتاه**: Cache TTL برای داده‌های static خیلی کوتاه است
3. **عدم استفاده از stale-while-revalidate**: اگر cache منقضی شده باشد، کاربر باید منتظر بماند

---

## ✅ بهبودهای انجام شده

### 1. Compression در Backend ✅
- اضافه شدن `compression` package
- Gzip compression فعال
- **تأثیر**: کاهش 60-80% حجم داده‌ها

### 2. بهینه‌سازی Query‌ها ✅
- `getAllPersonalDrivers`: حذف `created_at`, `updated_at`
- `getAllPersonalVehicles`: حذف `created_at`, `updated_at`
- `getDrivers`: از 37 فیلد به 9 فیلد ضروری
- **تأثیر**: کاهش 30-80% حجم داده‌ها

### 3. افزایش TTL برای داده‌های Static ✅
- `vehicles`: از 5 دقیقه به **10 دقیقه**
- `drivers`: از 5 دقیقه به **10 دقیقه**
- `personal-drivers`: از 5 دقیقه به **10 دقیقه**
- `personal-vehicles`: از 5 دقیقه به **10 دقیقه**
- **تأثیر**: کاهش fetch های مجدد

### 4. بهبود `cachedFetch` با Stale-While-Revalidate ✅
- اگر cache موجود باشد (حتی اگر منقضی شده باشد)، فوراً برمی‌گرداند
- در background داده جدید را fetch می‌کند
- **تأثیر**: بهبود UX - کاربر فوراً داده را می‌بیند

### 5. بهینه‌سازی کامپوننت‌ها ✅
- `Dashboard.tsx`: استفاده از `cachedFetch`
- `FreightHistoryContainer.tsx`: استفاده از `cachedFetch`
- `TransportLiveContainer.tsx`: افزایش TTL

---

## 📊 بهبودهای مورد انتظار

### حجم داده:
- **قبل**: 3.0 MB transferred
- **بعد**: ~600-900 KB transferred (70-80% کاهش)

### زمان لود:
- **لاگین**: از 6.69s به ~2-3s (55-70% بهبود)
- **بعد لاگین**: از 43.24s به ~5-10s (77-88% بهبود)
- **تاریخچه**: از 43.24s به ~5-10s (77-88% بهبود)
- **داشبورد ترابری**: از 2.2 min به ~10-20s (85-92% بهبود)
- **پیگیری اعلام بار**: از 2.6 min به ~10-20s (87-93% بهبود)

### Navigation بین صفحات:
- **قبل**: هر بار همه داده‌ها fetch می‌شوند
- **بعد**: اگر cache موجود باشد، فوراً نمایش داده می‌شود
- **تأثیر**: Navigation از چند ثانیه به **کمتر از 1 ثانیه**

---

## 🚀 مراحل بعدی (اختیاری)

### 1. Context برای داده‌های مشترک
ایجاد `AppDataContext` برای نگه‌داری داده‌های مشترک:
- جلوگیری از fetch مجدد
- Share کردن داده بین کامپوننت‌ها
- **فایل**: `frontend/contexts/AppDataContext.tsx` (ایجاد شده)

### 2. Lazy Loading برای Personal Resources
لود کردن `personal-drivers` و `personal-vehicles` فقط وقتی که نیاز است:
- در `TransportLiveContainer`، فقط وقتی که تب "ترابری شخصی" فعال است
- یا وقتی که dialog assignment باز می‌شود

### 3. Pagination برای داده‌های بزرگ
اگر تعداد رکوردها خیلی زیاد است:
```sql
SELECT ... FROM personal_drivers 
ORDER BY name ASC
LIMIT 1000 OFFSET $1
```

---

## 📝 دستورات نصب و اجرا

```bash
# 1. نصب compression در backend
cd /var/www/my-transport-app/backend
npm install

# 2. Restart Backend
pm2 restart transport-backend

# 3. Build Frontend
cd ../frontend
npm run build

# 4. تست
# Network Tab را باز کنید و بررسی کنید:
# - حجم response ها کاهش یافته است
# - زمان لود کمتر شده است
# - Navigation بین صفحات سریع‌تر است
```

---

## ⚠️ نکات مهم

1. **Compression**: باید در production فعال باشد ✅
2. **Query Optimization**: فقط فیلدهای ضروری برگردانده می‌شوند ✅
3. **Cache TTL**: داده‌های static 10 دقیقه cache می‌شوند ✅
4. **Stale-While-Revalidate**: کاربر فوراً داده را می‌بیند ✅
5. **Testing**: بعد از تغییرات، Network Tab را بررسی کنید

---

## 📈 نتایج مورد انتظار

### Performance Score:
- **قبل**: 55/100
- **بعد**: 70-80/100 (27-45% بهبود)

### FCP/LCP:
- **قبل**: 14.7s
- **بعد**: 5-8s (46-66% بهبود)

### Navigation Speed:
- **قبل**: 43s - 2.6 min
- **بعد**: 5-20s (77-93% بهبود)

