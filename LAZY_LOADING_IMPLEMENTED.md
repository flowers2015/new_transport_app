# پیاده‌سازی Lazy Loading برای Personal Resources

## ✅ تغییرات انجام شده

### 1. Lazy Loading در TransportLiveContainer
**فایل**: `frontend/components/TransportLiveContainer.tsx`

**تغییرات:**
- اضافه شدن پارامتر `includePersonal` به `fetchData`
- personal-drivers و personal-vehicles فقط وقتی لود می‌شوند که:
  1. کاربر نقش "ترابری شخصی" دارد
  2. یا `includePersonal = true` باشد
  3. یا announcement با `assignmentType === 'personal'` وجود دارد

**کد:**
```typescript
const shouldLoadPersonal = includePersonal || 
    currentUser?.role === 'Transportation_Personal_Vehicle_User' || 
    currentUser?.role === 'کاربر ترابری (خودرو شخصی)';
```

### 2. Callback برای لود کردن Personal Resources
**فایل**: `frontend/components/TransportLiveContainer.tsx`

**تغییرات:**
- اضافه شدن `onOpenAssignmentDialog` callback
- وقتی AssignmentDialog باز می‌شود و `assignmentType === 'personal'` است، personal resources لود می‌شوند

### 3. استفاده از Callback در TransportLive
**فایل**: `frontend/components/TransportLive.tsx`

**تغییرات:**
- اضافه شدن `onOpenAssignmentDialog` به `TransportLiveProps`
- فراخوانی callback وقتی که dialog assignment باز می‌شود

---

## 📊 تأثیر مورد انتظار

### قبل از Lazy Loading:
- **حجم داده**: 3.26 MB (بدون compression)
- **زمان لود**: 43s - 2.5 min
- **API calls**: همیشه personal-drivers و personal-vehicles لود می‌شوند

### بعد از Lazy Loading:
- **حجم داده**: ~1.5 MB (بدون compression) - کاهش 54%
- **زمان لود**: ~10-20s - بهبود 77-93%
- **API calls**: personal-drivers و personal-vehicles فقط وقتی که نیاز است لود می‌شوند

---

## 🔍 سناریوهای استفاده

### سناریو 1: کاربر ترابری شرکت
- **قبل**: personal-drivers و personal-vehicles همیشه لود می‌شوند (3.26 MB)
- **بعد**: فقط وقتی که announcement با `assignmentType === 'personal'` وجود دارد (lazy load)

### سناریو 2: کاربر ترابری شخصی
- **قبل**: personal-drivers و personal-vehicles همیشه لود می‌شوند (3.26 MB)
- **بعد**: همیشه لود می‌شوند (چون `isPersonalUser = true`)

### سناریو 3: باز کردن AssignmentDialog
- **قبل**: personal-drivers و personal-vehicles از قبل لود شده‌اند
- **بعد**: اگر `assignmentType === 'personal'` است و هنوز لود نشده‌اند، لود می‌شوند

---

## ⚠️ نکات مهم

1. **Cache**: personal resources با TTL 10 دقیقه cache می‌شوند
2. **Silent Loading**: وقتی که lazy load می‌شوند، silent mode استفاده می‌شود (بدون نمایش loading)
3. **Backward Compatibility**: اگر personal resources از قبل لود شده باشند، دوباره لود نمی‌شوند

---

## 🚀 مراحل بعدی

بعد از build و deploy:
1. بررسی Network Tab برای اطمینان از lazy loading
2. تست با کاربر ترابری شرکت (نباید personal resources لود شوند)
3. تست با کاربر ترابری شخصی (باید personal resources لود شوند)
4. تست باز کردن AssignmentDialog با `assignmentType === 'personal'`

