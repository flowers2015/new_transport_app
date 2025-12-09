# راهنمای سریع رفع مشکلات عملکرد

## 🚀 مراحل سریع (در سرور)

### 1. فعال کردن کامل Gzip در NGINX
```bash
cd /var/www/my-transport-app
chmod +x fix_nginx_gzip.sh
sudo bash fix_nginx_gzip.sh
```

### 2. اجرای اسکریپت تشخیصی (دوباره)
```bash
cd /var/www/my-transport-app/backend
node scripts/diagnose_performance.js
```

### 3. بررسی Compression
```bash
# بررسی NGINX
sudo nginx -T | grep -i gzip

# باید این خطوط را ببینید (بدون #):
# gzip on;
# gzip_vary on;
# gzip_proxied any;
# gzip_comp_level 6;
# gzip_buffers 16 8k;
# gzip_http_version 1.1;
# gzip_types ...
```

### 4. Restart Services
```bash
sudo systemctl restart nginx
pm2 restart transport-backend
```

---

## 📊 بررسی نتایج

### در Network Tab مرورگر:
1. باز کردن DevTools (F12)
2. رفتن به تب Network
3. Refresh صفحه (F5)
4. بررسی Response Headers:
   - **Content-Encoding: gzip** ✅
   - حجم response ها کاهش یافته ✅

### انتظار می‌رود:
- **حجم داده**: از 3.0 MB به ~600-900 KB (70-80% کاهش)
- **زمان لود**: بهبود قابل توجه

---

## ⚠️ اگر Compression کار نمی‌کند:

### بررسی Backend:
```bash
pm2 logs transport-backend | grep compression
```

### بررسی NGINX:
```bash
sudo nginx -T | grep gzip
sudo systemctl status nginx
```

### تست مستقیم:
```bash
curl -H "Accept-Encoding: gzip" -I http://localhost:3000/api/v1/personal-drivers
```

---

## ✅ بعد از رفع مشکلات:

1. **اجرای update.sh** برای اعمال همه تغییرات:
   ```bash
   cd /var/www/my-transport-app
   bash update.sh
   ```

2. **بررسی Network Tab** برای اطمینان از کاهش حجم

3. **تست Navigation** بین صفحات برای اطمینان از بهبود سرعت

