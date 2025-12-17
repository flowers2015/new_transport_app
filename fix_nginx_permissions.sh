#!/bin/bash

# اسکریپت برای حل مشکل دسترسی Nginx به فایل‌های Frontend

set -e

echo "🔧 حل مشکل دسترسی Nginx..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. بررسی دسترسی فایل‌های dist
echo -e "${YELLOW}🔍 بررسی دسترسی فایل‌های dist...${NC}"
DIST_DIR="/var/www/my-transport-app/frontend/dist"

if [ ! -d "$DIST_DIR" ]; then
    echo -e "${RED}❌ پوشه dist پیدا نشد!${NC}"
    exit 1
fi

# 2. تنظیم دسترسی‌ها
echo -e "${YELLOW}📝 تنظیم دسترسی‌ها...${NC}"

# بررسی کاربر Nginx
NGINX_USER=$(ps aux | grep '[n]ginx: master' | awk '{print $1}' | head -n 1)
if [ -z "$NGINX_USER" ]; then
    NGINX_USER="www-data"  # پیش‌فرض
fi

echo "کاربر Nginx: $NGINX_USER"

# تنظیم دسترسی‌ها
chown -R $NGINX_USER:$NGINX_USER "$DIST_DIR"
chmod -R 755 "$DIST_DIR"

# تنظیم دسترسی برای فایل‌های خاص
find "$DIST_DIR" -type f -exec chmod 644 {} \;
find "$DIST_DIR" -type d -exec chmod 755 {} \;

echo -e "${GREEN}✅ دسترسی‌ها تنظیم شد${NC}"

# 3. بررسی index.html
if [ -f "$DIST_DIR/index.html" ]; then
    echo -e "${GREEN}✅ فایل index.html موجود است${NC}"
    ls -la "$DIST_DIR/index.html"
else
    echo -e "${RED}❌ فایل index.html پیدا نشد!${NC}"
    exit 1
fi

# 4. تست دسترسی
echo -e "${YELLOW}🧪 تست دسترسی...${NC}"
if [ -r "$DIST_DIR/index.html" ]; then
    echo -e "${GREEN}✅ فایل index.html قابل خواندن است${NC}"
else
    echo -e "${RED}❌ فایل index.html قابل خواندن نیست!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ تمام! دسترسی‌ها تنظیم شد${NC}"

