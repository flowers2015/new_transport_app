# 📊 راهنمای اندازه‌گیری سرعت

## 🔧 ابزارهای اندازه‌گیری

### 1. **Performance Monitor (ساخته شده)**
یک utility برای اندازه‌گیری عملکرد اپلیکیشن ایجاد شده که:
- زمان لود صفحه را اندازه می‌گیرد
- تعداد API calls را می‌شمارد
- زمان هر API call را ثبت می‌کند
- خلاصه عملکرد را در console نمایش می‌دهد

**استفاده:**
```typescript
import { performanceMonitor } from './utils/performanceMonitor';

// در App.tsx یا هر کامپوننت اصلی
performanceMonitor.startMetric('app-init');

// بعد از لود کامل
performanceMonitor.endMetric('app-init');

// نمایش خلاصه
performanceMonitor.logSummary();
```

### 2. **Chrome DevTools**
1. باز کردن Chrome DevTools (F12)
2. رفتن به تب **Performance**
3. کلیک روی **Record** (دکمه دایره‌ای)
4. انجام عملیات مورد نظر (مثلاً لود صفحه)
5. کلیک روی **Stop**
6. بررسی نتایج:
   - **Main Thread**: زمان پردازش
   - **Network**: زمان API calls
   - **FPS**: فریم‌های بر ثانیه

### 3. **Network Tab**
1. باز کردن Chrome DevTools (F12)
2. رفتن به تب **Network**
3. Refresh صفحه (F5)
4. بررسی:
   - **Total Requests**: تعداد کل درخواست‌ها
   - **Total Size**: حجم کل دانلود
   - **Load Time**: زمان کل لود
   - **Waterfall**: زمان هر request

### 4. **React DevTools Profiler**
1. نصب React DevTools Extension
2. باز کردن تب **Profiler**
3. کلیک روی **Record**
4. انجام عملیات
5. کلیک روی **Stop**
6. بررسی:
   - **Render Time**: زمان render هر کامپوننت
   - **Commit Time**: زمان commit تغییرات

### 5. **Lighthouse**
1. باز کردن Chrome DevTools (F12)
2. رفتن به تب **Lighthouse**
3. انتخاب **Performance**
4. کلیک روی **Generate report**
5. بررسی:
   - **Performance Score**: امتیاز عملکرد (0-100)
   - **First Contentful Paint (FCP)**: زمان نمایش اولین محتوا
   - **Largest Contentful Paint (LCP)**: زمان نمایش بزرگ‌ترین محتوا
   - **Time to Interactive (TTI)**: زمان تا تعاملی شدن

## 📈 متریک‌های مهم

### 1. **Page Load Time**
- **هدف**: کمتر از 2 ثانیه
- **اندازه‌گیری**: از `performance.timing` یا `performanceMonitor`

### 2. **API Call Count**
- **هدف**: کمتر از 10 درخواست در لود اولیه
- **اندازه‌گیری**: از `performanceMonitor.getSummary().totalAPICalls`

### 3. **API Response Time**
- **هدف**: کمتر از 500ms برای هر API
- **اندازه‌گیری**: از `performanceMonitor.getSummary().averageAPIDuration`

### 4. **Bundle Size**
- **هدف**: کمتر از 500KB برای bundle اصلی
- **اندازه‌گیری**: از Network Tab یا Build output

### 5. **Time to Interactive (TTI)**
- **هدف**: کمتر از 3 ثانیه
- **اندازه‌گیری**: از Lighthouse

## 🎯 مراحل اندازه‌گیری

### مرحله 1: اندازه‌گیری فعلی (قبل از بهینه‌سازی)

1. **باز کردن اپلیکیشن در Chrome**
2. **باز کردن DevTools (F12)**
3. **Clear Cache** (Ctrl+Shift+Delete)
4. **باز کردن Network Tab**
5. **Refresh صفحه (F5)**
6. **ثبت نتایج:**
   - تعداد Requests
   - حجم کل (Total Size)
   - زمان لود (Load Time)
   - زمان هر API call

7. **باز کردن Performance Tab**
8. **Record کردن لود صفحه**
9. **ثبت نتایج:**
   - Main Thread Time
   - Long Tasks
   - Layout Shifts

10. **اجرای Lighthouse**
11. **ثبت Performance Score**

### مرحله 2: اعمال بهینه‌سازی‌ها

(بعد از اعمال تغییرات)

### مرحله 3: اندازه‌گیری بعدی (بعد از بهینه‌سازی)

1. **تکرار مراحل مرحله 1**
2. **مقایسه نتایج:**
   - بهبود در Page Load Time
   - کاهش در API Call Count
   - کاهش در Bundle Size
   - بهبود در Performance Score

## 📝 Template برای ثبت نتایج

```markdown
## اندازه‌گیری عملکرد - [تاریخ]

### قبل از بهینه‌سازی:
- **Page Load Time**: [زمان] ms
- **API Calls**: [تعداد]
- **Total Bundle Size**: [حجم] KB
- **Lighthouse Score**: [امتیاز]
- **Network Requests**: [تعداد]
- **Average API Duration**: [زمان] ms

### بعد از بهینه‌سازی:
- **Page Load Time**: [زمان] ms (بهبود: [درصد]%)
- **API Calls**: [تعداد] (کاهش: [درصد]%)
- **Total Bundle Size**: [حجم] KB (کاهش: [درصد]%)
- **Lighthouse Score**: [امتیاز] (بهبود: [درصد]%)
- **Network Requests**: [تعداد] (کاهش: [درصد]%)
- **Average API Duration**: [زمان] ms (بهبود: [درصد]%)
```

## 🔍 مشکلات رایج و راه‌حل

### مشکل 1: تعداد زیاد API Calls
**راه‌حل**: استفاده از Caching و Request Deduplication

### مشکل 2: Bundle Size بزرگ
**راه‌حل**: Lazy Loading و Code Splitting

### مشکل 3: زمان لود زیاد
**راه‌حل**: بهینه‌سازی API calls و استفاده از Pagination

### مشکل 4: Re-render های غیرضروری
**راه‌حل**: استفاده از `useMemo` و `useCallback`

## 🚀 دستورالعمل استفاده از Performance Monitor

1. **Import کردن:**
```typescript
import { performanceMonitor } from '../utils/performanceMonitor';
```

2. **شروع اندازه‌گیری:**
```typescript
performanceMonitor.startMetric('component-render');
```

3. **پایان اندازه‌گیری:**
```typescript
performanceMonitor.endMetric('component-render');
```

4. **نمایش خلاصه:**
```typescript
performanceMonitor.logSummary();
```

5. **دریافت خلاصه:**
```typescript
const summary = performanceMonitor.getSummary();
console.log('Total API Calls:', summary.totalAPICalls);
```

