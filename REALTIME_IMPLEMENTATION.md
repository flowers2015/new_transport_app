# پیاده‌سازی Real-Time Updates

## خلاصه

این سند توضیح می‌دهد که چگونه WebSocket، SSE و Optimistic Updates پیاده‌سازی شده‌اند.

## 1. Server-Sent Events (SSE)

### Backend
- **فایل:** `backend/services/realtimeService.js`
  - مدیریت اتصالات SSE
  - Broadcast پیام‌ها به کاربران
  - Heartbeat برای نگه داشتن connection

- **فایل:** `backend/routes/realtimeRoutes.js`
  - Endpoint: `GET /api/v1/realtime/sse`
  - Authentication required
  - ارسال heartbeat هر 30 ثانیه

### Frontend
- **فایل:** `frontend/hooks/useRealtimeUpdates.ts`
  - Hook برای اتصال به SSE
  - Auto-reconnect با exponential backoff
  - Reconnect وقتی صفحه visible می‌شود

## 2. WebSocket (آماده برای استفاده)

### Backend
- **فایل:** `backend/services/realtimeService.js`
  - مدیریت اتصالات WebSocket
  - Broadcast پیام‌ها به کاربران

### Frontend
- **فایل:** `frontend/hooks/useRealtimeUpdates.ts`
  - پشتیبانی از WebSocket (با `useWebSocket: true`)
  - Auto-reconnect

## 3. Optimistic Updates

### Frontend
- **فایل:** `frontend/utils/optimisticUpdates.ts`
  - `OptimisticUpdateManager`: مدیریت optimistic updates
  - `applyOptimisticUpdate`: اعمال update به array
  - `createRollback`: ایجاد rollback function

### استفاده در Components
- **فایل:** `frontend/components/TransportLiveContainer.tsx`
  - Optimistic update برای `onUpdateAssignment`
  - Rollback در صورت خطا

## 4. Real-Time Notifications

### Backend Integration
- **فایل:** `backend/controllers/freightController.js`
  - `approveAnnouncement`: ارسال notification بعد از approve
  - `assignVehicleAndDriver`: ارسال notification بعد از assign
  - `finalizeAssignments`: ارسال notification برای هر finalized announcement

### Notification Types
- `announcement_update`: تغییرات اعلام بار
  - `updateType`: 'approved', 'assigned', 'finalized', etc.
  - `data`: اطلاعات تغییرات

## 5. استفاده در Components

### TransportLiveContainer
```typescript
useRealtimeUpdates({
  onMessage: (message) => {
    if (message.type === 'announcement_update') {
      // به‌روزرسانی اعلام بار
      setAnnouncements(prev => applyOptimisticUpdate(prev, message.announcementId, message.data));
    }
  },
  enabled: !!currentUser?.id
});
```

### Optimistic Update در Actions
```typescript
// قبل از API call
const original = [...announcements];
setAnnouncements(prev => applyOptimisticUpdate(prev, id, newData));

try {
  await apiCall();
  // موفق - realtime update خواهد آمد
} catch (error) {
  // Rollback
  setAnnouncements(original);
}
```

## 6. مزایا

### SSE
- ✅ ساده‌تر از WebSocket
- ✅ Auto-reconnect
- ✅ مناسب برای push notifications

### WebSocket
- ✅ دو طرفه (bidirectional)
- ✅ مناسب برای real-time chat
- ✅ کم‌تر overhead

### Optimistic Updates
- ✅ UX بهتر (تغییرات فوری)
- ✅ Rollback در صورت خطا
- ✅ کاهش perceived latency

## 7. مراحل بعدی

1. **WebSocket Server Setup**: راه‌اندازی WebSocket server در `server.js`
2. **FreightPlanningContainer**: اتصال به realtime updates
3. **Error Handling**: بهبود error handling و retry logic
4. **Performance**: بهینه‌سازی برای تعداد زیاد اتصالات

## 8. تست

### تست SSE
1. باز کردن صفحه Transport Live
2. Approve یک اعلام بار در صفحه دیگر
3. باید فوراً در صفحه Transport Live نمایش داده شود

### تست Optimistic Updates
1. Assign یک اعلام بار
2. باید فوراً status به "Assigned" تغییر کند
3. اگر خطا رخ داد، باید rollback شود

