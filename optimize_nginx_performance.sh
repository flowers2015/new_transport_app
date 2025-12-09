#!/bin/bash

# اسکریپت بهینه‌سازی NGINX برای بهبود عملکرد
# این اسکریپت Cache Headers، HTTP/2، Compression و سایر بهینه‌سازی‌ها را اضافه می‌کند

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 بهینه‌سازی NGINX برای بهبود عملکرد${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

NGINX_CONFIG="/etc/nginx/sites-available/default"

if [ ! -f "$NGINX_CONFIG" ]; then
    echo -e "${RED}❌ خطا: فایل تنظیمات NGINX در مسیر $NGINX_CONFIG یافت نشد.${NC}"
    exit 1
fi

# Backup فایل NGINX
if [ ! -f "${NGINX_CONFIG}.backup.performance" ]; then
    sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.performance"
    echo -e "${GREEN}   ✓ Backup از فایل NGINX گرفته شد: ${NGINX_CONFIG}.backup.performance${NC}"
else
    echo -e "${YELLOW}   ⚠️ فایل Backup از قبل موجود است: ${NGINX_CONFIG}.backup.performance${NC}"
fi

# 1. اضافه کردن Cache Headers برای Static Assets
echo -e "${YELLOW}📦 اضافه کردن Cache Headers...${NC}"

# بررسی وجود location block برای static assets
if ! grep -q "location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)" "$NGINX_CONFIG"; then
    # اضافه کردن location block برای static assets
    sudo sed -i '/location \/ {/a\
    # Cache static assets\
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\
        expires 1y;\
        add_header Cache-Control "public, immutable";\
        access_log off;\
    }\
' "$NGINX_CONFIG"
    echo -e "${GREEN}   ✓ Cache Headers برای Static Assets اضافه شد${NC}"
else
    echo -e "${GREEN}   ✓ Cache Headers از قبل موجود است${NC}"
fi

# 2. اضافه کردن Gzip Compression
echo -e "${YELLOW}🗜️  اضافه کردن Gzip Compression...${NC}"

if ! grep -q "gzip on;" "$NGINX_CONFIG"; then
    # اضافه کردن gzip configuration در http block
    sudo sed -i '/^http {/a\
    # Gzip Compression\
    gzip on;\
    gzip_vary on;\
    gzip_min_length 1024;\
    gzip_proxied any;\
    gzip_comp_level 6;\
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;\
' "$NGINX_CONFIG"
    echo -e "${GREEN}   ✓ Gzip Compression اضافه شد${NC}"
else
    echo -e "${GREEN}   ✓ Gzip Compression از قبل موجود است${NC}"
fi

# 3. فعال کردن HTTP/2 (نیاز به SSL دارد)
echo -e "${YELLOW}🌐 بررسی HTTP/2...${NC}"

if grep -q "listen 443 ssl http2;" "$NGINX_CONFIG"; then
    echo -e "${GREEN}   ✓ HTTP/2 از قبل فعال است${NC}"
elif grep -q "listen 80;" "$NGINX_CONFIG" && ! grep -q "listen 443" "$NGINX_CONFIG"; then
    echo -e "${YELLOW}   ⚠️  HTTP/2 نیاز به SSL دارد. برای فعال کردن HTTPS:${NC}"
    echo -e "${YELLOW}      1. نصب Certbot: sudo apt install certbot python3-certbot-nginx${NC}"
    echo -e "${YELLOW}      2. دریافت SSL: sudo certbot --nginx -d your-domain.com${NC}"
fi

# 4. اضافه کردن Preconnect Hints (در index.html باید اضافه شود)
echo -e "${YELLOW}🔗 Preconnect Hints...${NC}"
echo -e "${YELLOW}   ⚠️  Preconnect Hints باید در index.html اضافه شوند:${NC}"
echo -e "${YELLOW}      <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">${NC}"
echo -e "${YELLOW}      <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>${NC}"

# 5. اضافه کردن Security Headers
echo -e "${YELLOW}🔒 اضافه کردن Security Headers...${NC}"

if ! grep -q "add_header X-Frame-Options" "$NGINX_CONFIG"; then
    sudo sed -i '/location \/ {/a\
    # Security Headers\
    add_header X-Frame-Options "SAMEORIGIN" always;\
    add_header X-Content-Type-Options "nosniff" always;\
    add_header X-XSS-Protection "1; mode=block" always;\
' "$NGINX_CONFIG"
    echo -e "${GREEN}   ✓ Security Headers اضافه شد${NC}"
else
    echo -e "${GREEN}   ✓ Security Headers از قبل موجود است${NC}"
fi

# 6. تست و Restart NGINX
echo -e "${YELLOW}🔄 در حال تست و Restart کردن NGINX...${NC}"
if sudo nginx -t 2>/dev/null; then
    sudo systemctl restart nginx
    echo -e "${GREEN}   ✅ NGINX با موفقیت Restart شد${NC}"
else
    echo -e "${RED}   ❌ خطا در تست NGINX. لطفاً به صورت دستی بررسی کنید: sudo nginx -t${NC}"
    exit 1
fi

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ بهینه‌سازی NGINX با موفقیت انجام شد!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}📝 مراحل بعدی:${NC}"
echo -e "${YELLOW}   1. Preconnect Hints را در frontend/index.html اضافه کنید${NC}"
echo -e "${YELLOW}   2. Google Fonts را به صورت async لود کنید${NC}"
echo -e "${YELLOW}   3. برای HTTPS، SSL Certificate نصب کنید${NC}"

