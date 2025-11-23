# خلاصه تغییرات: مدیریت آدرس API با متغیرهای محیطی

## ✅ کارهای انجام شده

### 1. فایل کانفیگ مرکزی
- ✅ ایجاد `utils/apiConfig.ts` با تابع `getApiUrl()` برای مدیریت آدرس API

### 2. فایل‌های محیطی
- ✅ ایجاد `.env.development` با `VITE_API_BASE_URL=http://localhost:3000/api/v1`
- ✅ ایجاد `.env.production` با `VITE_API_BASE_URL=/api/v1`

### 3. فایل‌های به‌روزرسانی شده
فایل‌های زیر به‌طور کامل به‌روزرسانی شده‌اند:
- ✅ `components/Login.tsx`
- ✅ `App.tsx`
- ✅ `components/Dashboard.tsx`
- ✅ `components/TransportLiveContainer.tsx`
- ✅ `components/FreightPlanningContainer.tsx`
- ✅ `components/RepairOrderView.tsx`
- ✅ `components/DispatchQueueManager.tsx`

## ⚠️ فایل‌های باقی‌مانده

فایل‌های زیر هنوز نیاز به به‌روزرسانی دارند. برای هر فایل:

1. Import را اضافه کنید:
```typescript
import { getApiUrl } from '../utils/apiConfig';
```

2. تمام `'http://localhost:3000/api/v1/...'` را با `getApiUrl('...')` جایگزین کنید.

### لیست فایل‌های باقی‌مانده:
- `components/CentralFinanceDashboard.tsx`
- `components/CentralFinanceContainer.tsx`
- `components/FreightFinanceDashboard.tsx`
- `components/FreightFinanceContainer.tsx`
- `components/FreightHistoryContainer.tsx`
- `components/TransportDashboard.tsx`
- `components/TransportLive.tsx`
- `components/DispatchBoardView.tsx`
- `components/FreightHistoryDialog.tsx`
- `components/DispatchAssignmentManager.tsx`
- `components/TransportDispatchContainer.tsx`
- `components/DailyStatistics.tsx`
- `components/dashboards/TechnicianDashboard.tsx`
- `components/PurchasingPage.tsx`
- `components/PendingAnnouncements.tsx`
- `components/VehiclesPage.tsx`
- `components/TransportDashboardContainer.tsx`

## 📝 نحوه جایگزینی

### مثال قبل:
```typescript
const response = await fetch('http://localhost:3000/api/v1/freight-announcements', {
    headers: { 'Authorization': `Bearer ${token}` }
});
```

### مثال بعد:
```typescript
import { getApiUrl } from '../utils/apiConfig';

const response = await fetch(getApiUrl('freight-announcements'), {
    headers: { 'Authorization': `Bearer ${token}` }
});
```

### برای URLهای با پارامتر:
```typescript
// قبل:
fetch(`http://localhost:3000/api/v1/freight-announcements/${id}/approve`, ...)

// بعد:
fetch(getApiUrl(`freight-announcements/${id}/approve`), ...)
```

### برای URLهای با query string:
```typescript
// قبل:
fetch(`http://localhost:3000/api/v1/dispatch/search/drivers?q=${query}`, ...)

// بعد:
fetch(getApiUrl(`dispatch/search/drivers?q=${encodeURIComponent(query)}`), ...)
```

## 🚀 استفاده

### در محیط توسعه:
```bash
npm run dev
```
به صورت خودکار از `.env.development` استفاده می‌کند.

### در محیط پروداکشن:
```bash
npm run build
```
به صورت خودکار از `.env.production` استفاده می‌کند.

## 🔍 بررسی فایل‌های باقی‌مانده

برای پیدا کردن تمام URLهای hardcoded در یک فایل:
```bash
grep -n "http://localhost:3000" frontend/components/YourFile.tsx
```

یا در VS Code/Cursor:
- جستجوی `http://localhost:3000` در فایل
- جایگزینی با `getApiUrl(...)`

## ✨ مزایا

1. **بدون نیاز به تغییر دستی کد**: فقط فایل‌های `.env` را تغییر دهید
2. **سازگار با NGINX**: در پروداکشن از آدرس نسبی استفاده می‌شود
3. **بدون مشکل CORS**: آدرس‌ها به درستی تنظیم می‌شوند
4. **مدیریت آسان**: یک فایل کانفیگ مرکزی برای تمام API calls


