# راهنمای کامل حل مشکل Error 521 Cloudflare برای tpmhub.ir

## 🔍 تشخیص مشکل

**مشکل:** Cloudflare Error 521 - "Web server is down"

**علت:** Nginx ترافیک را به backend Node.js پروکسی نمی‌کند.

**وضعیت فعلی:**
- ✅ DNS درست تنظیم شده
- ✅ Cloudflare SSL فعال است
- ✅ Backend روی پورت 3000 کار می‌کند
- ✅ Nginx در حال اجرا است
- ❌ **Nginx کانفیگ نشده برای پروکسی به backend**

---

## 🚀 راه حل خودکار (پیشنهادی)

### روش 1: استفاده از اسکریپت خودکار

```bash
# 1. اتصال به سرور
ssh root@vps-f73637d8

# 2. رفتن به دایرکتوری پروژه
cd /var/www/my-transport-app

# 3. دریافت آخرین تغییرات
git pull origin master

# 4. اجرای اسکریپت
bash fix_nginx_cloudflare.sh
```

اسکریپت به صورت خودکار:
- ✅ Backup از کانفیگ فعلی می‌گیرد
- ✅ کانفیگ جدید را ایجاد می‌کند
- ✅ تست می‌کند که معتبر است
- ✅ Nginx را reload می‌کند
- ✅ وضعیت را بررسی می‌کند

---

## 🔧 راه حل دستی

### مرحله 1: Backup گرفتن

```bash
# اتصال به سرور
ssh root@vps-f73637d8

# Backup از کانفیگ فعلی
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)
```

### مرحله 2: ویرایش کانفیگ Nginx

```bash
# باز کردن فایل کانفیگ
nano /etc/nginx/sites-available/default
```

**تمام محتوای فایل را پاک کنید** و این کانفیگ را جایگزین کنید:

```nginx
# کانفیگ کامل Nginx برای tpmhub.ir
# تنظیم شده برای Cloudflare

server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name tpmhub.ir www.tpmhub.ir _;

    # حداکثر اندازه فایل آپلود
    client_max_body_size 50M;

    # Root directory برای frontend static files
    root /var/www/my-transport-app/frontend/dist;
    index index.html;

    # Logging
    access_log /var/log/nginx/tpmhub_access.log;
    error_log /var/log/nginx/tpmhub_error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # API proxy to backend Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # برای آپلود فایل‌های بزرگ
        client_max_body_size 50M;
    }

    # Socket.io support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts برای WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Frontend routes (SPA - Single Page Application)
    # همه درخواست‌ها به index.html هدایت می‌شوند تا React Router کار کند
    location / {
        try_files $uri $uri/ /index.html;
        
        # Cache control برای static files
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

**ذخیره:** `Ctrl + O` → `Enter` → `Ctrl + X`

### مرحله 3: تست کانفیگ

```bash
# تست syntax
nginx -t
```

**باید این پیام را ببینید:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### مرحله 4: Restart Nginx

```bash
# Reload (ترجیحی - بدون قطعی)
systemctl reload nginx

# یا Restart (اگر reload کار نکرد)
systemctl restart nginx
```

### مرحله 5: بررسی وضعیت

```bash
# بررسی وضعیت Nginx
systemctl status nginx

# باید ببینید: active (running) ✅
```

---

## ✅ تست نهایی

### 1. تست از داخل سرور

```bash
# تست localhost
curl -I http://localhost

# باید HTTP 200 یا 301/302 ببینید ✅
```

### 2. تست API

```bash
# تست API endpoint
curl http://localhost/api/v1/health

# باید پاسخ JSON ببینید ✅
```

### 3. تست از مرورگر

1. باز کردن: `https://tpmhub.ir`
2. باید صفحه اصلی نمایش داده شود ✅
3. F12 → Network → بررسی درخواست‌های API
4. باید `/api/v1/...` درخواست‌ها موفق باشند ✅

---

## 🔍 عیب‌یابی

### اگر هنوز Error 521 می‌دهد:

#### 1. بررسی لاگ Nginx

```bash
tail -n 50 /var/log/nginx/error.log
```

**مشکلات رایج:**
- `connect() failed (111: Connection refused)` → Backend در حال اجرا نیست
- `upstream prematurely closed connection` → Backend crash کرده
- `permission denied` → مشکل دسترسی فایل‌ها

#### 2. بررسی وضعیت Backend

```bash
# بررسی PM2
pm2 status

# باید transport-backend online باشد ✅

# بررسی لاگ‌های Backend
pm2 logs transport-backend --lines 20
```

#### 3. بررسی پورت 3000

```bash
# بررسی که پورت 3000 در حال گوش دادن است
netstat -tuln | grep 3000

# باید ببینید: tcp 0 0 127.0.0.1:3000 ✅
```

#### 4. تست مستقیم Backend

```bash
# تست مستقیم backend
curl http://127.0.0.1:3000/api/v1/health

# باید پاسخ JSON ببینید ✅
```

#### 5. بررسی Cloudflare SSL Mode

در پنل Cloudflare:
1. SSL/TLS → Overview
2. Encryption mode باید **"Flexible"** یا **"Full"** باشد
3. **نه "Full (strict)"** (چون گواهی SSL روی سرور نداریم)

---

## 📋 چک‌لیست نهایی

- [ ] Backup از کانفیگ قدیمی گرفته شده
- [ ] کانفیگ جدید در `/etc/nginx/sites-available/default` قرار دارد
- [ ] `nginx -t` بدون خطا است
- [ ] Nginx reload/restart شده
- [ ] `systemctl status nginx` → active (running)
- [ ] Backend روی پورت 3000 در حال اجرا است
- [ ] `curl http://localhost` پاسخ می‌دهد
- [ ] `curl http://localhost/api/v1/health` پاسخ می‌دهد
- [ ] Cloudflare SSL mode روی "Flexible" یا "Full" است
- [ ] سایت روی `https://tpmhub.ir` باز می‌شود

---

## 🎯 نتیجه

بعد از انجام این مراحل:

✅ **Error 521 حل می‌شود**
- Cloudflare به سرور وصل می‌شود
- Nginx ترافیک را به backend پروکسی می‌کند
- Frontend و Backend هر دو کار می‌کنند

✅ **HTTPS فعال می‌شود**
- Cloudflare SSL رایگان کار می‌کند
- سایت روی `https://tpmhub.ir` و `https://www.tpmhub.ir` در دسترس است

✅ **API کار می‌کند**
- درخواست‌های `/api/v1/...` به backend هدایت می‌شوند
- Socket.io برای real-time updates کار می‌کند

---

## 🆘 اگر مشکل داشتید

1. **بررسی لاگ‌ها:**
   ```bash
   tail -n 100 /var/log/nginx/error.log
   pm2 logs transport-backend --lines 50
   ```

2. **بازگردانی Backup:**
   ```bash
   cp /etc/nginx/sites-available/default.backup.* /etc/nginx/sites-available/default
   systemctl restart nginx
   ```

3. **تماس با پشتیبانی:**
   - لاگ‌های Nginx
   - لاگ‌های PM2
   - خروجی `nginx -t`
   - خروجی `systemctl status nginx`

---

**موفق باشید! 🚀**

