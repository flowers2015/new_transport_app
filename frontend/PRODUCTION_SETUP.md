# راهنمای تنظیم Production

## مشکل: اتصال دیتابیس با فرانت در production برقرار نمی‌شود

## راه حل

### 1. ایجاد فایل `.env.production` در سرور

در سرور، در پوشه `frontend` فایل `.env.production` را ایجاد کنید:

```bash
cd /var/www/my-transport-app/frontend
nano .env.production
```

محتوای فایل:
```
VITE_API_BASE_URL=/api/v1
```

**مهم:** این فایل باید قبل از `npm run build` وجود داشته باشد!

### 2. Build مجدد فرانت‌اند

بعد از ایجاد فایل `.env.production`:

```bash
cd /var/www/my-transport-app/frontend
npm run build
```

### 3. بررسی فایل‌های Build

بعد از build، در فایل‌های JavaScript در پوشه `dist` باید `/api/v1` را ببینید، نه `http://localhost:3000/api/v1`.

برای بررسی:
```bash
grep -r "localhost:3000" dist/
```
نباید چیزی پیدا شود.

### 4. تنظیم NGINX

مطمئن شوید که NGINX به درستی تنظیم شده است:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Serve frontend static files
    root /var/www/my-transport-app/frontend/dist;
    index index.html;

    # API proxy to backend
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
    }

    # Frontend routes (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 5. بررسی لاگ‌های مرورگر

در مرورگر (F12 > Console) باید این لاگ‌ها را ببینید:

```
🔧 [API Config] Mode: production
🔧 [API Config] VITE_API_BASE_URL from env: /api/v1
🔧 [API Config] Final API_BASE_URL: /api/v1
```

### 6. بررسی Network Tab

در مرورگر (F12 > Network):
- درخواست‌های API باید به `/api/v1/...` بروند
- نه به `http://localhost:3000/api/v1/...`

## مشکل Authentication در PostgreSQL

از لاگ‌های PM2 مشخص است که مشکل authentication در PostgreSQL وجود دارد:

```
auth_failed
```

### راه حل:

1. بررسی فایل `.env` در پوشه `backend`:
```bash
cd /var/www/my-transport-app/backend
cat .env
```

2. مطمئن شوید که:
   - `DB_USER` درست است
   - `DB_PASSWORD` درست است
   - `DB_NAME` درست است
   - `DB_HOST` درست است (معمولاً `localhost`)

3. تست اتصال به PostgreSQL:
```bash
psql -U your_db_user -d your_db_name -h localhost
```

4. اگر مشکل authentication دارید:
   - بررسی فایل `pg_hba.conf`
   - بررسی اینکه کاربر PostgreSQL وجود دارد
   - بررسی رمز عبور

## دستورات کامل برای سرور

```bash
# 1. ایجاد فایل .env.production
cd /var/www/my-transport-app/frontend
echo "VITE_API_BASE_URL=/api/v1" > .env.production

# 2. Build مجدد
npm run build

# 3. Restart NGINX
sudo systemctl restart nginx

# 4. بررسی لاگ‌های بک‌اند
pm2 logs transport-backend
```

## نکات مهم

1. **فایل `.env.production` باید قبل از build وجود داشته باشد**
2. **بعد از تغییر `.env.production`، حتماً build مجدد کنید**
3. **مقدار پیش‌فرض در کد: `/api/v1` برای production و `http://localhost:3000/api/v1` برای development**
4. **اگر فایل `.env.production` وجود نداشته باشد، کد از مقدار پیش‌فرض استفاده می‌کند**

