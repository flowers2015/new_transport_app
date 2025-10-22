# 📜 راهنمای سیستم تاریخچه اعلام بار

## 🎯 هدف

این قابلیت برای ثبت و نمایش **تاریخچه کامل تغییرات** در اعلام‌های بار طراحی شده است. تمام عملیات از زمان ایجاد تا نهایی شدن اعلام بار (شامل ویرایش، تایید، رد، تخصیص، تغییر مقاصد و...) در این سیستم ثبت می‌شود.

---

## 📦 اجزای سیستم

### Backend

#### 1. **دیتابیس (PostgreSQL)**

جدول اصلی: `freight_announcement_history`

```sql
- id: UUID (کلید اصلی)
- freight_announcement_id: UUID (کلید خارجی به freight_announcements)
- user_id: VARCHAR (شناسه کاربر انجام‌دهنده)
- user_name: VARCHAR (نام کاربر برای نمایش)
- action: VARCHAR (نوع عملیات)
- old_status: VARCHAR (وضعیت قبلی)
- new_status: VARCHAR (وضعیت جدید)
- field_changes: JSONB (تغییرات دقیق فیلدها)
- description: TEXT (شرح تغییر به فارسی)
- ip_address: VARCHAR (آدرس IP)
- created_at: TIMESTAMPTZ (زمان ثبت)
```

#### 2. **انواع اکشن‌ها (Actions)**

| اکشن | توضیح |
|------|-------|
| `CREATED` | ایجاد اولیه اعلام بار |
| `EDITED` | ویرایش مشخصات عمومی |
| `STATUS_CHANGED` | تغییر وضعیت |
| `APPROVED` | تایید توسط مدیر |
| `REJECTED` | رد شدن |
| `QUEUE_CHANGED` | ارجاع بین صف شخصی/شرکتی |
| `ASSIGNED` | تخصیص اولیه راننده و خودرو |
| `REASSIGNED` | تغییر تخصیص |
| `DESTINATIONS_CHANGED` | تغییر مقاصد |
| `PAYMENT_RECORDED` | ثبت اطلاعات پرداخت |
| `PAYMENT_CONFIRMED` | تایید پرداخت توسط مالی |
| `DELETED` | حذف اعلام بار |
| `REANNOUNCED` | اعلام مجدد بار |

#### 3. **سرویس تاریخچه**

فایل: `backend/services/freightHistoryService.js`

توابع اصلی:
- `logFreightHistory()`: ثبت یک رویداد در تاریخچه
- `compareObjects()`: مقایسه دو شیء و استخراج تغییرات
- `compareDestinations()`: مقایسه دقیق مقاصد (با توجه به کرایه، تناژ و...)
- `calculateTotalFreightCost()`: محاسبه کرایه کل از مقاصد
- `generateChangeDescription()`: تولید توضیحات فارسی
- `getAnnouncementHistory()`: دریافت تاریخچه یک اعلام بار

#### 4. **API Endpoint**

```
GET /api/freight/:id/history
```

**پاسخ:**
```json
{
  "announcementId": "uuid",
  "announcementCode": "ANN-1234567890",
  "currentStatus": "Assigned",
  "history": [
    {
      "id": "uuid",
      "user_name": "احمد رضایی",
      "action": "ASSIGNED",
      "old_status": "PendingCompanyAssignment",
      "new_status": "Assigned",
      "field_changes": {
        "assignedDriverId": {
          "old": null,
          "new": "driver-uuid"
        }
      },
      "description": "اعلام بار #ANN-123 به راننده و خودرو تخصیص یافت",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "totalEvents": 5
}
```

---

### Frontend

#### 1. **کامپوننت دیالوگ تاریخچه**

فایل: `frontend/components/FreightHistoryDialog.tsx`

ویژگی‌ها:
- نمایش Timeline عمودی
- آیکون‌های مختص هر نوع عملیات
- نمایش تغییرات دقیق فیلدها
- نمایش تغییرات مقاصد (اضافه، حذف، ویرایش)
- نمایش تاریخ و ساعت به شمسی
- نمایش نام کاربر انجام‌دهنده

#### 2. **دکمه تاریخچه در جدول**

دکمه تاریخچه فقط برای وضعیت‌های زیر نمایش داده می‌شود:
- در انتظار تخصیص (شخصی)
- در انتظار تخصیص (شرکتی)
- تخصیص یافته
- در حال حمل
- نهایی شده

#### 3. **آیکون تاریخچه**

فایل: `frontend/components/icons/HistoryIcon.tsx`

---

## 🚀 نصب و راه‌اندازی

### 1. اجرای Migration دیتابیس

```bash
cd backend
node migrations/add_freight_history.js
```

این دستور جدول `freight_announcement_history` را ایجاد می‌کند.

### 2. راه‌اندازی Backend

```bash
cd backend
npm install
npm start
```

### 3. راه‌اندازی Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 📝 نحوه استفاده

### برای توسعه‌دهندگان

#### ثبت تاریخچه دستی

```javascript
const { logFreightHistory } = require('./services/freightHistoryService');

await logFreightHistory({
  announcementId: 'announcement-uuid',
  userId: 'user-uuid',
  userName: 'نام کاربر',
  action: 'EDITED',
  oldStatus: 'Draft',
  newStatus: 'PendingManagerApproval',
  fieldChanges: {
    cargoValue: {
      old: 1000000000,
      new: 1500000000
    }
  },
  description: 'ارزش بار تغییر کرد',
  ipAddress: req.ip
});
```

#### مقایسه و ثبت تغییرات

```javascript
const { compareObjects, compareDestinations } = require('./services/freightHistoryService');

// مقایسه فیلدهای معمولی
const fieldChanges = compareObjects(oldRecord, newRecord, [
  'cargoValue',
  'vehicleType',
  'notes'
]);

// مقایسه مقاصد
const destinationChanges = compareDestinations(
  oldDestinations,
  newDestinations
);
```

---

## 🎨 مثال‌های تغییرات

### 1. تغییر کرایه مقصد دوم

**ورودی:**
```javascript
oldDestinations = [
  { city: 'تهران', tonnage: 1000, freightCost: 5000000 },
  { city: 'اصفهان', tonnage: 2000, freightCost: 8000000 }
];

newDestinations = [
  { city: 'تهران', tonnage: 1000, freightCost: 5000000 },
  { city: 'اصفهان', tonnage: 2000, freightCost: 9000000 }
];
```

**خروجی:**
```json
{
  "destination_2": {
    "freightCost": {
      "old": 8000000,
      "new": 9000000
    }
  }
}
```

**توضیح فارسی:**
> "مقصد ۲: کرایه (۸,۰۰۰,۰۰۰ ← ۹,۰۰۰,۰۰۰)"

### 2. اضافه کردن مقصد سوم

**ورودی:**
```javascript
oldDestinations = [
  { city: 'تهران', tonnage: 1000 },
  { city: 'اصفهان', tonnage: 2000 }
];

newDestinations = [
  { city: 'تهران', tonnage: 1000 },
  { city: 'اصفهان', tonnage: 2000 },
  { city: 'شیراز', tonnage: 1500 }
];
```

**خروجی:**
```json
{
  "destination_3_added": {
    "old": null,
    "new": {
      "city": "شیراز",
      "tonnage": 1500
    }
  }
}
```

**توضیح فارسی:**
> "مقصد ۳ اضافه شد (شیراز)"

---

## ⚙️ تنظیمات

### محدود کردن دسترسی

در فایل `backend/routes/freightRoutes.js`:

```javascript
router.get(
  '/:id/history',
  authenticateToken,
  authorizeRole(['planner', 'planner_manager', 'transport_user', 'personal_transport_user', 'finance', 'admin']),
  getFreightAnnouncementHistory
);
```

### تغییر وضعیت‌هایی که تاریخچه نمایش می‌دهند

در فایل `frontend/components/FreightDashboard.tsx`:

```typescript
const showHistory = [
  FreightAnnouncementStatus.PendingPersonalAssignment,
  FreightAnnouncementStatus.PendingCompanyAssignment,
  FreightAnnouncementStatus.Assigned,
  FreightAnnouncementStatus.InTransit,
  FreightAnnouncementStatus.Finalized
].includes(ann.status);
```

---

## 🔍 رفع مشکلات (Troubleshooting)

### مشکل: جدول تاریخچه ایجاد نمی‌شود

**راه حل:**
```bash
# اجرای مستقیم schema
psql -U postgres -d your_database -f backend/models/freight_history_schema.sql
```

### مشکل: تاریخچه ثبت نمی‌شود

**بررسی:**
1. چک کنید که `logFreightHistory` در کنترلرها صدا زده شده باشد
2. لاگ‌های کنسول را بررسی کنید (خطاهای سرویس نادیده گرفته می‌شوند)
3. دسترسی‌های دیتابیس را چک کنید

### مشکل: دکمه تاریخچه نمایش داده نمی‌شود

**بررسی:**
1. وضعیت اعلام بار را چک کنید (باید در لیست `showHistory` باشد)
2. `onOpenHistory` را در props بررسی کنید
3. آیکون `HistoryIcon` را import کرده‌اید؟

---

## 📊 گزارش‌گیری

### تعداد تغییرات هر اعلام بار

```sql
SELECT 
  fa.announcement_code,
  COUNT(fah.id) as change_count
FROM freight_announcements fa
LEFT JOIN freight_announcement_history fah ON fa.id = fah.freight_announcement_id
GROUP BY fa.id, fa.announcement_code
ORDER BY change_count DESC;
```

### فعال‌ترین کاربران

```sql
SELECT 
  user_name,
  COUNT(*) as action_count
FROM freight_announcement_history
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_name
ORDER BY action_count DESC
LIMIT 10;
```

### پرتکرارترین اکشن‌ها

```sql
SELECT 
  action,
  COUNT(*) as count
FROM freight_announcement_history
GROUP BY action
ORDER BY count DESC;
```

---

## 🛡️ امنیت

- تمام عملیات در تراکنش انجام می‌شود
- Foreign key با CASCADE برای جلوگیری از رکوردهای یتیم
- ثبت IP برای ردیابی
- خطاهای ثبت تاریخچه عملیات اصلی را مختل نمی‌کنند

---

## 📚 منابع

- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)
- [React Hooks](https://react.dev/reference/react)
- [Jalali Date Utils](./frontend/utils/jalali.ts)

---

## 👥 توسعه‌دهندگان

این قابلیت توسط تیم توسعه سیستم مدیریت ترابری طراحی و پیاده‌سازی شده است.

**نسخه:** 1.0.0  
**تاریخ:** ۱۴۰۳/۱۰/۲۲

