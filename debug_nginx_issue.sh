#!/bin/bash

# اسکریپت جامع برای عیب‌یابی مشکل Nginx و Cloudflare Error 521

set -e

echo "🔍 شروع عیب‌یابی مشکل Nginx..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "1️⃣ بررسی وضعیت Nginx"
echo "═══════════════════════════════════════════════════════════"
systemctl status nginx --no-pager -l | head -n 10

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "2️⃣ بررسی کانفیگ Nginx"
echo "═══════════════════════════════════════════════════════════"
if nginx -t 2>&1; then
    echo -e "${GREEN}✅ کانفیگ Nginx معتبر است${NC}"
else
    echo -e "${RED}❌ خطا در کانفیگ Nginx!${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "3️⃣ بررسی محتوای کانفیگ Nginx"
echo "═══════════════════════════════════════════════════════════"
echo "--- محتوای /etc/nginx/sites-available/default ---"
cat /etc/nginx/sites-available/default | head -n 50

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "4️⃣ بررسی وضعیت Backend (PM2)"
echo "═══════════════════════════════════════════════════════════"
pm2 status

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "5️⃣ بررسی پورت 3000"
echo "═══════════════════════════════════════════════════════════"
if command -v ss >/dev/null 2>&1; then
    echo "--- استفاده از ss ---"
    ss -tuln | grep 3000 || echo "پورت 3000 پیدا نشد"
elif command -v netstat >/dev/null 2>&1; then
    echo "--- استفاده از netstat ---"
    netstat -tuln | grep 3000 || echo "پورت 3000 پیدا نشد"
else
    echo "--- تست مستقیم با curl ---"
    curl -s --connect-timeout 2 http://127.0.0.1:3000/api/v1/health || echo "Backend پاسخ نمی‌دهد"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "6️⃣ تست مستقیم Backend"
echo "═══════════════════════════════════════════════════════════"
echo "در حال تست http://127.0.0.1:3000/api/v1/health ..."
RESPONSE=$(curl -s --connect-timeout 3 -w "\nHTTP_CODE:%{http_code}" http://127.0.0.1:3000/api/v1/health 2>&1 || echo "ERROR: Connection failed")
echo "$RESPONSE"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "7️⃣ تست Nginx از داخل سرور"
echo "═══════════════════════════════════════════════════════════"
echo "در حال تست http://localhost ..."
NGINX_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost 2>&1 | tail -n 1)
echo "HTTP Status: $NGINX_RESPONSE"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "8️⃣ تست API از طریق Nginx"
echo "═══════════════════════════════════════════════════════════"
echo "در حال تست http://localhost/api/v1/health ..."
API_RESPONSE=$(curl -s --connect-timeout 3 -w "\nHTTP_CODE:%{http_code}" http://localhost/api/v1/health 2>&1 | tail -n 1)
echo "HTTP Status: $API_RESPONSE"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "9️⃣ بررسی لاگ‌های Nginx (آخرین 20 خط)"
echo "═══════════════════════════════════════════════════════════"
tail -n 20 /var/log/nginx/error.log 2>/dev/null || echo "لاگ error.log پیدا نشد"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🔟 بررسی لاگ‌های Backend (آخرین 10 خط)"
echo "═══════════════════════════════════════════════════════════"
pm2 logs transport-backend --lines 10 --nostream 2>/dev/null || echo "لاگ Backend پیدا نشد"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "1️⃣1️⃣ بررسی وجود فایل‌های Frontend"
echo "═══════════════════════════════════════════════════════════"
if [ -d "/var/www/my-transport-app/frontend/dist" ]; then
    echo -e "${GREEN}✅ پوشه dist موجود است${NC}"
    echo "تعداد فایل‌ها: $(find /var/www/my-transport-app/frontend/dist -type f | wc -l)"
    if [ -f "/var/www/my-transport-app/frontend/dist/index.html" ]; then
        echo -e "${GREEN}✅ فایل index.html موجود است${NC}"
    else
        echo -e "${RED}❌ فایل index.html پیدا نشد!${NC}"
    fi
else
    echo -e "${RED}❌ پوشه dist پیدا نشد!${NC}"
    echo "لطفاً frontend را build کنید: cd /var/www/my-transport-app/frontend && npm run build"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ عیب‌یابی تمام شد"
echo "═══════════════════════════════════════════════════════════"

