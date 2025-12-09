# رفع مشکل Real-Time Updates و 403 Error

## مشکلات شناسایی شده

### 1. خطای 403 برای Approve
**مشکل:** کاربران با نقش `planner` (کارمند برنامه‌ریزی) نمی‌توانستند اعلام‌بارها را approve کنند.

**علت:** در `backend/routes/freightRoutes.js` فقط `planner_manager` و `admin` مجاز بودند.

**راه‌حل:**
- ✅ اضافه کردن `planner` به لیست نقش‌های مجاز برای approve

### 2. مشکل Real-Time Updates
**مشکل:** وقتی مدیر برنامه‌ریزی اعلام‌بارها را approve می‌کرد، کاربر ترابری شخصی نمی‌توانست تغییرات را ببیند تا logout/login کند.

**علت:** 
- Auto-refresh هر 30 ثانیه بود (خیلی کند)
- در `FreightPlanningContainer` از `useAutoRefresh` استفاده می‌شد که ممکن است مشکلات dependency داشته باشد

**راه‌حل:**
- ✅ کاهش auto-refresh از 30 ثانیه به 10 ثانیه در `TransportLiveContainer`
- ✅ استفاده از silent refresh (بدون loading state) برای جلوگیری از کاهش سرعت
- ✅ جایگزینی `useAutoRefresh` با `useEffect` و `setInterval` مستقیم در `FreightPlanningContainer`
- ✅ استفاده از `useRef` برای جلوگیری از stale closures

## تغییرات اعمال شده

### 1. Backend (`backend/routes/freightRoutes.js`)
```javascript
// قبل:
authorizeRole(['planner_manager', 'admin'])

// بعد:
authorizeRole(['planner', 'planner_manager', 'admin'])
```

### 2. Frontend (`frontend/components/TransportLiveContainer.tsx`)
- ✅ Auto-refresh از 30 ثانیه به 10 ثانیه کاهش یافت
- ✅ استفاده از silent refresh (بدون loading state)
- ✅ استفاده از `useRef` برای `fetchData` و `needsPersonalResources`

### 3. Frontend (`frontend/components/FreightPlanningContainer.tsx`)
- ✅ جایگزینی `useAutoRefresh` با `useEffect` و `setInterval` مستقیم
- ✅ Auto-refresh از 30 ثانیه به 10 ثانیه کاهش یافت
- ✅ استفاده از `useRef` برای جلوگیری از stale closures

## تأثیرات

### بهبود Real-Time Updates
- **قبل:** تغییرات بعد از 30 ثانیه یا logout/login نمایش داده می‌شد
- **بعد:** تغییرات بعد از حداکثر 10 ثانیه نمایش داده می‌شوند

### بهبود دسترسی
- **قبل:** فقط `planner_manager` و `admin` می‌توانستند approve کنند
- **بعد:** `planner`, `planner_manager`, و `admin` می‌توانند approve کنند

### عملکرد
- Silent refresh باعث می‌شود که UI مسدود نشود
- استفاده از `useRef` باعث می‌شود که re-render های غیرضروری نداشته باشیم
- فقط وقتی صفحه visible است، refresh انجام می‌شود

## نکات مهم

1. **Silent Refresh:** همه refresh ها به صورت silent انجام می‌شوند (بدون loading state) تا UI مسدود نشود
2. **Visibility Check:** فقط وقتی صفحه visible است، refresh انجام می‌شود
3. **Cache:** استفاده از `cachedFetch` برای جلوگیری از درخواست‌های تکراری
4. **Deduplication:** درخواست‌های تکراری deduplicate می‌شوند

## مراحل بعدی (اختیاری)

1. **WebSocket:** برای real-time updates فوری (بدون polling)
2. **Server-Sent Events (SSE):** برای push notifications
3. **Optimistic Updates:** برای بهبود UX

