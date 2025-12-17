#!/bin/bash

# اسکریپت خودکار برای تنظیم Nginx برای Cloudflare و حل مشکل Error 521
# استفاده: bash fix_nginx_cloudflare.sh

set -e  # در صورت خطا متوقف شود

echo "🚀 شروع تنظیم Nginx برای Cloudflare..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# بررسی اینکه root هستیم
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ لطفاً با دسترسی root اجرا کنید: sudo bash fix_nginx_cloudflare.sh${NC}"
    exit 1
fi

# 1. Backup فایل فعلی
echo -e "${YELLOW}📦 گرفتن Backup از فایل Nginx فعلی...${NC}"
BACKUP_FILE="/etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)"
cp /etc/nginx/sites-available/default "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup در $BACKUP_FILE ذخیره شد${NC}"

# 2. بررسی وجود فایل dist
echo -e "${YELLOW}🔍 بررسی وجود فایل‌های Frontend...${NC}"
if [ ! -d "/var/www/my-transport-app/frontend/dist" ]; then
    echo -e "${RED}❌ پوشه dist وجود ندارد!${NC}"
    echo -e "${YELLOW}   لطفاً ابتدا frontend را build کنید:${NC}"
    echo -e "${YELLOW}   cd /var/www/my-transport-app/frontend && npm run build${NC}"
    exit 1
fi
echo -e "${GREEN}✅ پوشه dist موجود است${NC}"

# 3. بررسی وضعیت backend
echo -e "${YELLOW}🔍 بررسی وضعیت Backend...${NC}"
if pm2 list | grep -q "transport-backend.*online"; then
    echo -e "${GREEN}✅ Backend در حال اجرا است${NC}"
else
    echo -e "${YELLOW}⚠️  Backend در حال اجرا نیست!${NC}"
    echo -e "${YELLOW}   لطفاً backend را راه‌اندازی کنید:${NC}"
    echo -e "${YELLOW}   pm2 start ecosystem.config.js${NC}"
    read -p "آیا می‌خواهید ادامه دهید؟ (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 4. بررسی پورت 3000
echo -e "${YELLOW}🔍 بررسی پورت 3000...${NC}"
if netstat -tuln | grep -q ":3000 "; then
    echo -e "${GREEN}✅ پورت 3000 در حال گوش دادن است${NC}"
else
    echo -e "${RED}❌ پورت 3000 در حال گوش دادن نیست!${NC}"
    echo -e "${YELLOW}   لطفاً backend را راه‌اندازی کنید${NC}"
    exit 1
fi

# 5. ایجاد کانفیگ جدید
echo -e "${YELLOW}📝 ایجاد کانفیگ جدید Nginx...${NC}"
cat > /etc/nginx/sites-available/default << 'EOF'
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
EOF

echo -e "${GREEN}✅ کانفیگ جدید ایجاد شد${NC}"

# 6. تست کانفیگ
echo -e "${YELLOW}🧪 تست کانفیگ Nginx...${NC}"
if nginx -t; then
    echo -e "${GREEN}✅ کانفیگ Nginx معتبر است${NC}"
else
    echo -e "${RED}❌ خطا در کانفیگ Nginx!${NC}"
    echo -e "${YELLOW}   بازگردانی backup...${NC}"
    cp "$BACKUP_FILE" /etc/nginx/sites-available/default
    echo -e "${RED}   Backup بازگردانده شد. لطفاً فایل را به صورت دستی بررسی کنید.${NC}"
    exit 1
fi

# 7. Restart Nginx
echo -e "${YELLOW}🔄 Restart کردن Nginx...${NC}"
systemctl reload nginx
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx با موفقیت reload شد${NC}"
else
    echo -e "${YELLOW}⚠️  Reload ناموفق، تلاش برای restart...${NC}"
    systemctl restart nginx
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Nginx با موفقیت restart شد${NC}"
    else
        echo -e "${RED}❌ خطا در restart کردن Nginx!${NC}"
        echo -e "${YELLOW}   بررسی لاگ: tail -n 30 /var/log/nginx/error.log${NC}"
        exit 1
    fi
fi

# 8. بررسی وضعیت Nginx
echo -e "${YELLOW}📊 بررسی وضعیت Nginx...${NC}"
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx در حال اجرا است${NC}"
else
    echo -e "${RED}❌ Nginx در حال اجرا نیست!${NC}"
    exit 1
fi

# 9. تست اتصال
echo -e "${YELLOW}🧪 تست اتصال به localhost...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Nginx به درستی پاسخ می‌دهد${NC}"
else
    echo -e "${YELLOW}⚠️  Nginx پاسخ نمی‌دهد یا خطا می‌دهد${NC}"
    echo -e "${YELLOW}   بررسی لاگ: tail -n 30 /var/log/nginx/error.log${NC}"
fi

echo ""
echo -e "${GREEN}✅ تمام! تنظیمات Nginx اعمال شد${NC}"
echo ""
echo -e "${YELLOW}📋 مراحل بعدی:${NC}"
echo -e "   1. در Cloudflare، مطمئن شوید که SSL/TLS mode روی 'Flexible' یا 'Full' است"
echo -e "   2. چند دقیقه صبر کنید تا DNS propagate شود"
echo -e "   3. سایت را تست کنید: https://tpmhub.ir"
echo ""
echo -e "${YELLOW}🔍 اگر هنوز Error 521 می‌دهد:${NC}"
echo -e "   - بررسی لاگ Nginx: tail -n 50 /var/log/nginx/error.log"
echo -e "   - بررسی وضعیت Backend: pm2 logs transport-backend --lines 20"
echo -e "   - تست مستقیم: curl http://localhost/api/v1/health"
echo ""
echo -e "${YELLOW}📦 Backup در این مسیر ذخیره شد: $BACKUP_FILE${NC}"

