#!/bin/bash

# اسکریپت برای فعال کردن کامل Gzip Compression در NGINX

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🗜️  فعال کردن کامل Gzip Compression در NGINX${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

NGINX_CONFIG="/etc/nginx/nginx.conf"

if [ ! -f "$NGINX_CONFIG" ]; then
    echo -e "${RED}❌ خطا: فایل تنظیمات NGINX در مسیر $NGINX_CONFIG یافت نشد.${NC}"
    exit 1
fi

# Backup
if [ ! -f "${NGINX_CONFIG}.backup.gzip" ]; then
    sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.gzip"
    echo -e "${GREEN}✓ Backup از فایل NGINX گرفته شد${NC}"
fi

# بررسی و فعال کردن Gzip
if grep -q "^[[:space:]]*gzip on;" "$NGINX_CONFIG"; then
    echo -e "${GREEN}✓ gzip on از قبل فعال است${NC}"
else
    echo -e "${YELLOW}➕ اضافه کردن gzip on...${NC}"
    sudo sed -i '/^http {/a\    gzip on;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip on اضافه شد${NC}"
fi

# فعال کردن gzip_vary (بررسی duplicate)
if grep -q "^[[:space:]]*gzip_vary on;" "$NGINX_CONFIG"; then
    echo -e "${GREEN}✓ gzip_vary از قبل فعال است${NC}"
    # بررسی duplicate
    gzip_vary_count=$(grep -c "^[[:space:]]*gzip_vary on;" "$NGINX_CONFIG")
    if [ "$gzip_vary_count" -gt 1 ]; then
        echo -e "${YELLOW}⚠️  gzip_vary دوبار وجود دارد. در حال حذف duplicate...${NC}"
        # حذف همه و اضافه کردن فقط یکی
        sudo sed -i '/^[[:space:]]*gzip_vary on;/d' "$NGINX_CONFIG"
        sudo sed -i '/^[[:space:]]*gzip on;/a\    gzip_vary on;' "$NGINX_CONFIG"
        echo -e "${GREEN}✓ duplicate حذف شد${NC}"
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن gzip_vary...${NC}"
    # پیدا کردن خط gzip on و اضافه کردن gzip_vary بعد از آن
    sudo sed -i '/^[[:space:]]*gzip on;/a\    gzip_vary on;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip_vary اضافه شد${NC}"
fi

# فعال کردن gzip_proxied (بررسی duplicate)
gzip_proxied_count=$(grep -c "^[[:space:]]*gzip_proxied" "$NGINX_CONFIG")
if [ "$gzip_proxied_count" -gt 0 ]; then
    echo -e "${GREEN}✓ gzip_proxied از قبل موجود است${NC}"
    if [ "$gzip_proxied_count" -gt 1 ]; then
        echo -e "${YELLOW}⚠️  gzip_proxied دوبار وجود دارد. در حال حذف duplicate...${NC}"
        sudo sed -i '/^[[:space:]]*gzip_proxied/d' "$NGINX_CONFIG"
        sudo sed -i '/^[[:space:]]*gzip_vary on;/a\    gzip_proxied any;' "$NGINX_CONFIG"
        echo -e "${GREEN}✓ duplicate حذف شد${NC}"
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن gzip_proxied...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_vary on;/a\    gzip_proxied any;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip_proxied اضافه شد${NC}"
fi

# فعال کردن gzip_comp_level (بررسی duplicate)
gzip_comp_level_count=$(grep -c "^[[:space:]]*gzip_comp_level" "$NGINX_CONFIG")
if [ "$gzip_comp_level_count" -gt 0 ]; then
    echo -e "${GREEN}✓ gzip_comp_level از قبل موجود است${NC}"
    if [ "$gzip_comp_level_count" -gt 1 ]; then
        echo -e "${YELLOW}⚠️  gzip_comp_level دوبار وجود دارد. در حال حذف duplicate...${NC}"
        sudo sed -i '/^[[:space:]]*gzip_comp_level/d' "$NGINX_CONFIG"
        sudo sed -i '/^[[:space:]]*gzip_proxied any;/a\    gzip_comp_level 6;' "$NGINX_CONFIG"
        echo -e "${GREEN}✓ duplicate حذف شد${NC}"
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن gzip_comp_level...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_proxied any;/a\    gzip_comp_level 6;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip_comp_level اضافه شد${NC}"
fi

# فعال کردن gzip_buffers (بررسی duplicate)
gzip_buffers_count=$(grep -c "^[[:space:]]*gzip_buffers" "$NGINX_CONFIG")
if [ "$gzip_buffers_count" -gt 0 ]; then
    echo -e "${GREEN}✓ gzip_buffers از قبل موجود است${NC}"
    if [ "$gzip_buffers_count" -gt 1 ]; then
        echo -e "${YELLOW}⚠️  gzip_buffers دوبار وجود دارد. در حال حذف duplicate...${NC}"
        sudo sed -i '/^[[:space:]]*gzip_buffers/d' "$NGINX_CONFIG"
        sudo sed -i '/^[[:space:]]*gzip_comp_level 6;/a\    gzip_buffers 16 8k;' "$NGINX_CONFIG"
        echo -e "${GREEN}✓ duplicate حذف شد${NC}"
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن gzip_buffers...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_comp_level 6;/a\    gzip_buffers 16 8k;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip_buffers اضافه شد${NC}"
fi

# فعال کردن gzip_http_version (بررسی duplicate)
gzip_http_version_count=$(grep -c "^[[:space:]]*gzip_http_version" "$NGINX_CONFIG")
if [ "$gzip_http_version_count" -gt 0 ]; then
    echo -e "${GREEN}✓ gzip_http_version از قبل موجود است${NC}"
    if [ "$gzip_http_version_count" -gt 1 ]; then
        echo -e "${YELLOW}⚠️  gzip_http_version دوبار وجود دارد. در حال حذف duplicate...${NC}"
        sudo sed -i '/^[[:space:]]*gzip_http_version/d' "$NGINX_CONFIG"
        sudo sed -i '/^[[:space:]]*gzip_buffers 16 8k;/a\    gzip_http_version 1.1;' "$NGINX_CONFIG"
        echo -e "${GREEN}✓ duplicate حذف شد${NC}"
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن gzip_http_version...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_buffers 16 8k;/a\    gzip_http_version 1.1;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip_http_version اضافه شد${NC}"
fi

# فعال کردن gzip_types (بررسی duplicate)
gzip_types_count=$(grep -c "^[[:space:]]*gzip_types" "$NGINX_CONFIG")
if [ "$gzip_types_count" -gt 0 ]; then
    echo -e "${GREEN}✓ gzip_types از قبل موجود است${NC}"
    if [ "$gzip_types_count" -gt 1 ]; then
        echo -e "${YELLOW}⚠️  gzip_types دوبار وجود دارد. در حال حذف duplicate...${NC}"
        sudo sed -i '/^[[:space:]]*gzip_types/d' "$NGINX_CONFIG"
        sudo sed -i '/^[[:space:]]*gzip_http_version 1.1;/a\    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;' "$NGINX_CONFIG"
        echo -e "${GREEN}✓ duplicate حذف شد${NC}"
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن gzip_types...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_http_version 1.1;/a\    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ gzip_types اضافه شد${NC}"
fi

# حذف comment ها از خطوط gzip (اگر comment شده باشند)
echo -e "${YELLOW}🔧 حذف comment ها از تنظیمات gzip...${NC}"
sudo sed -i 's/^[[:space:]]*# gzip_vary on;/    gzip_vary on;/g' "$NGINX_CONFIG"
sudo sed -i 's/^[[:space:]]*# gzip_proxied any;/    gzip_proxied any;/g' "$NGINX_CONFIG"
sudo sed -i 's/^[[:space:]]*# gzip_comp_level 6;/    gzip_comp_level 6;/g' "$NGINX_CONFIG"
sudo sed -i 's/^[[:space:]]*# gzip_buffers 16 8k;/    gzip_buffers 16 8k;/g' "$NGINX_CONFIG"
sudo sed -i 's/^[[:space:]]*# gzip_http_version 1.1;/    gzip_http_version 1.1;/g' "$NGINX_CONFIG"
sudo sed -i 's/^[[:space:]]*# gzip_types/    gzip_types/g' "$NGINX_CONFIG"
echo -e "${GREEN}✓ Comment ها حذف شدند${NC}"

# تست و Restart NGINX
echo -e "${YELLOW}🔄 در حال تست و Restart کردن NGINX...${NC}"
if sudo nginx -t 2>&1; then
    sudo systemctl restart nginx
    echo -e "${GREEN}✅ NGINX با موفقیت Restart شد${NC}"
else
    echo -e "${RED}❌ خطا در تست NGINX. لطفاً به صورت دستی بررسی کنید: sudo nginx -t${NC}"
    exit 1
fi

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Gzip Compression با موفقیت فعال شد!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"

