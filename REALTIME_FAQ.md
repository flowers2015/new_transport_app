# سوالات متداول Real-Time Updates

## WebSocket چیست؟

**WebSocket** یک پروتکل ارتباطی دو طرفه (bidirectional) است که امکان ارتباط real-time بین client و server را فراهم می‌کند.

### تفاوت WebSocket با SSE:

| ویژگی | SSE (Server-Sent Events) | WebSocket |
|-------|-------------------------|-----------|
| **جهت ارتباط** | یک طرفه (Server → Client) | دو طرفه (Server ↔ Client) |
| **استفاده** | Push notifications | Real-time chat, gaming, etc. |
| **پیچیدگی** | ساده‌تر | پیچیده‌تر |
| **Overhead** | کمتر | بیشتر |
| **پشتیبانی Browser** | خوب | عالی |

### چرا از SSE استفاده کردیم؟

1. **ساده‌تر**: برای push notifications کافی است
2. **کمتر overhead**: برای notifications نیاز به دو طرفه نیست
3. **Auto-reconnect**: مرورگر خودش reconnect می‌کند

### چه زمانی از WebSocket استفاده کنیم؟

- وقتی نیاز به ارسال پیام از client به server داریم (مثل chat)
- وقتی نیاز به real-time bidirectional communication داریم
- وقتی تعداد پیام‌ها خیلی زیاد است

## کارهای بعدی برای بهبود

### 1. **WebSocket Server Setup** (اختیاری)
اگر بخواهیم از WebSocket استفاده کنیم:
- نصب `ws` package
- راه‌اندازی WebSocket server در `server.js`
- استفاده از `useWebSocket: true` در frontend

### 2. **Error Handling بهتر**
- Retry logic پیشرفته‌تر
- نمایش notification به کاربر در صورت قطع connection
- Logging بهتر برای debugging

### 3. **Performance Optimization**
- Connection pooling برای تعداد زیاد کاربران
- Rate limiting برای جلوگیری از spam
- Compression برای پیام‌های بزرگ

### 4. **Features بیشتر**
- Notification history
- Read/unread status
- Sound notifications
- Desktop notifications

### 5. **Monitoring**
- Dashboard برای monitoring connections
- Metrics برای تعداد اتصالات
- Alerting برای مشکلات

## وضعیت فعلی

✅ **SSE**: پیاده‌سازی شده و کار می‌کند
✅ **Optimistic Updates**: پیاده‌سازی شده
✅ **Auto-reconnect**: پیاده‌سازی شده
⏳ **WebSocket**: آماده اما نیاز به setup دارد
⏳ **Monitoring**: نیاز به پیاده‌سازی دارد

## نحوه استفاده

### در Components:
```typescript
useRealtimeUpdates({
  onMessage: (message) => {
    // Handle message
  },
  enabled: !!currentUser?.id
});
```

### برای WebSocket (بعد از setup):
```typescript
useRealtimeUpdates({
  useWebSocket: true, // استفاده از WebSocket
  onMessage: (message) => {
    // Handle message
  }
});
```

