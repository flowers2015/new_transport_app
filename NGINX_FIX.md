# حل مشکل 413 Request Entity Too Large

## مشکل:
خطای `413 Request Entity Too Large` هنگام آپلود فایل Excel برای ایمپورت راننده شرکت

## راه حل:

### 1. ویرایش فایل تنظیمات NGINX

```bash
sudo nano /etc/nginx/nginx.conf
```

یا اگر فایل جداگانه برای سایت دارید:

```bash
sudo nano /etc/nginx/sites-available/default
# یا
sudo nano /etc/nginx/sites-available/your-site-name
```

### 2. اضافه کردن `client_max_body_size`

در بخش `http` یا `server` اضافه کنید:

```nginx
http {
    # ... سایر تنظیمات ...
    client_max_body_size 50M;  # یا بیشتر اگر نیاز دارید
}

# یا در بخش server:
server {
    # ... سایر تنظیمات ...
    client_max_body_size 50M;
    
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # برای آپلود فایل‌های بزرگ
        client_max_body_size 50M;
    }
}
```

### 3. Restart NGINX

```bash
sudo nginx -t  # تست تنظیمات
sudo systemctl restart nginx
```

### 4. بررسی

بعد از restart، دوباره فایل Excel را آپلود کنید.

---

## مقدار پیشنهادی:

- برای فایل‌های Excel کوچک: `10M`
- برای فایل‌های Excel متوسط: `50M`
- برای فایل‌های Excel بزرگ: `100M` یا بیشتر

