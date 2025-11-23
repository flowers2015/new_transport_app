# راهنمای تنظیم متغیرهای محیطی

## مشکل
در حال حاضر، آدرس API به صورت hardcoded در کدها قرار دارد که باعث می‌شود بین محیط توسعه و پروداکشن مشکل CORS ایجاد شود.

## راه‌حل
استفاده از متغیرهای محیطی Vite برای مدیریت آدرس API.

## مراحل اجرا

### 1. ایجاد فایل‌های محیطی

در پوشه `frontend` دو فایل زیر را ایجاد کنید:

#### `.env.development`
```env
# Environment variables for development
# این فایل برای محیط توسعه (Local Development) استفاده می‌شود

# آدرس پایه API - در محیط توسعه از آدرس کامل استفاده می‌کنیم
VITE_API_BASE_URL=http://localhost:3000/api/v1

# API Key برای Gemini (در صورت نیاز)
# GEMINI_API_KEY=your_api_key_here
```

#### `.env.production`
```env
# Environment variables for production
# این فایل برای محیط پروداکشن (Production/Server) استفاده می‌شود

# آدرس پایه API - در محیط پروداکشن از آدرس نسبی استفاده می‌کنیم
# NGINX این آدرس را به http://localhost:3000 هدایت می‌کند
VITE_API_BASE_URL=/api/v1

# API Key برای Gemini (در صورت نیاز)
# GEMINI_API_KEY=your_api_key_here
```

### 2. استفاده در کد

در تمام فایل‌های کامپوننت، از `getApiUrl` استفاده کنید:

```typescript
import { getApiUrl } from '../utils/apiConfig';

// به جای:
fetch('http://localhost:3000/api/v1/endpoint', ...)

// استفاده کنید:
fetch(getApiUrl('endpoint'), ...)
```

### 3. Build و Deploy

- برای توسعه: `npm run dev` (به صورت خودکار از `.env.development` استفاده می‌کند)
- برای پروداکشن: `npm run build` (به صورت خودکار از `.env.production` استفاده می‌کند)

## فایل‌های به‌روزرسانی شده

فایل‌های زیر به‌روزرسانی شده‌اند:
- ✅ `utils/apiConfig.ts` - فایل کانفیگ مرکزی
- ✅ `components/Login.tsx`
- ✅ `App.tsx`
- ✅ `components/Dashboard.tsx`
- ✅ `components/TransportLiveContainer.tsx`
- ✅ `components/FreightPlanningContainer.tsx`

## فایل‌های باقی‌مانده

فایل‌های زیر هنوز نیاز به به‌روزرسانی دارند (جایگزینی `http://localhost:3000/api/v1/` با `getApiUrl(...)`):

- `components/CentralFinanceDashboard.tsx`
- `components/CentralFinanceContainer.tsx`
- `components/FreightFinanceDashboard.tsx`
- `components/RepairOrderView.tsx`
- `components/FreightFinanceContainer.tsx`
- `components/FreightHistoryContainer.tsx`
- `components/DispatchQueueManager.tsx`
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

## نحوه جایگزینی

برای هر فایل:

1. Import را اضافه کنید:
```typescript
import { getApiUrl } from '../utils/apiConfig';
```

2. تمام `'http://localhost:3000/api/v1/...'` را با `getApiUrl('...')` جایگزین کنید.

مثال:
```typescript
// قبل:
fetch('http://localhost:3000/api/v1/freight-announcements', { headers })

// بعد:
fetch(getApiUrl('freight-announcements'), { headers })
```


