#!/bin/bash

# اسکریپت حذف و نصب مجدد کامل پروژه در سرور Linux
# این اسکریپت: پروژه را حذف می‌کند، دوباره clone می‌کند، build می‌کند و PM2 را setup می‌کند

set -e  # در صورت خطا متوقف شود

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# تنظیمات
PROJECT_DIR="/var/www/my-transport-app"
BACKEND_DIR="$PROJECT_DIR/backend"
GIT_REPO="git@github.com:flowers2015/new_transport_app.git"
# یا اگر از HTTPS استفاده می‌کنید:
# GIT_REPO="https://github.com/flowers2015/new_transport_app.git"
SERVER_IP="51.178.41.12"
BACKUP_DIR="/tmp/transport-app-backup-$(date +%Y%m%d-%H%M%S)"

echo -e "${YELLOW}⚠️  این اسکریپت پروژه را حذف و دوباره نصب می‌کند${NC}"
echo -e "${YELLOW}📦 Backup از فایل‌های مهم گرفته می‌شود${NC}"

# 1. PM2 را متوقف کنید
echo -e "${YELLOW}⏸️  متوقف کردن PM2...${NC}"
pm2 stop transport-backend 2>/dev/null || true
pm2 delete transport-backend 2>/dev/null || true

# 2. Backup از فایل‌های مهم
echo -e "${YELLOW}💾 گرفتن Backup...${NC}"
mkdir -p "$BACKUP_DIR"

if [ -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env" "$BACKUP_DIR/backend.env"
    echo -e "${GREEN}   ✓ .env backup گرفته شد${NC}"
fi

if [ -f "$PROJECT_DIR/ecosystem.config.js" ]; then
    cp "$PROJECT_DIR/ecosystem.config.js" "$BACKUP_DIR/"
    echo -e "${GREEN}   ✓ ecosystem.config.js backup گرفته شد${NC}"
fi

# 3. حذف پروژه قدیمی
echo -e "${YELLOW}🗑️  حذف پروژه قدیمی...${NC}"
if [ -d "$PROJECT_DIR" ]; then
    cd /var/www
    rm -rf my-transport-app
    echo -e "${GREEN}   ✓ پروژه قدیمی حذف شد${NC}"
fi

# 4. Clone پروژه جدید
echo -e "${YELLOW}📥 Clone کردن پروژه از Git...${NC}"
cd /var/www
git clone "$GIT_REPO" my-transport-app
cd "$PROJECT_DIR"
echo -e "${GREEN}   ✓ پروژه clone شد${NC}"

# 5. Restore فایل‌های backup
echo -e "${YELLOW}📂 بازگرداندن فایل‌های backup...${NC}"
if [ -f "$BACKUP_DIR/backend.env" ]; then
    cp "$BACKUP_DIR/backend.env" "$BACKEND_DIR/.env"
    echo -e "${GREEN}   ✓ .env بازگردانده شد${NC}"
fi

if [ -f "$BACKUP_DIR/ecosystem.config.js" ]; then
    cp "$BACKUP_DIR/ecosystem.config.js" "$PROJECT_DIR/"
    echo -e "${GREEN}   ✓ ecosystem.config.js بازگردانده شد${NC}"
fi

# 6. نصب Dependencies
echo -e "${YELLOW}📦 نصب Dependencies...${NC}"
cd "$BACKEND_DIR"
npm install
echo -e "${GREEN}   ✓ Dependencies نصب شد${NC}"

# 7. اعمال تنظیمات CORS برای سرور Production
echo -e "${YELLOW}⚙️  اعمال تنظیمات CORS...${NC}"
cd "$PROJECT_DIR"

# جایگزینی origin: true با تنظیمات production
if grep -q "origin: true" "$BACKEND_DIR/server.js"; then
    sed -i "s|origin: true, // Allow all origins in development|origin: ['http://$SERVER_IP', 'http://localhost'], // پوشش IP سرور و آدرس داخلی|g" "$BACKEND_DIR/server.js"
    echo -e "${GREEN}   ✓ تنظیمات CORS اعمال شد${NC}"
else
    echo -e "${GREEN}   ✓ تنظیمات CORS از قبل درست است${NC}"
fi

# 8. راه‌اندازی PM2
echo -e "${YELLOW}🔄 راه‌اندازی PM2...${NC}"
if [ -f "$PROJECT_DIR/ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
    echo -e "${GREEN}   ✓ PM2 با ecosystem.config.js راه‌اندازی شد${NC}"
else
    cd "$BACKEND_DIR"
    pm2 start server.js --name transport-backend
    echo -e "${GREEN}   ✓ PM2 راه‌اندازی شد${NC}"
fi

# 9. ذخیره PM2
pm2 save

# 10. بررسی وضعیت
echo -e "${YELLOW}📊 بررسی وضعیت...${NC}"
sleep 3
pm2 status

# 11. نمایش لاگ‌ها
echo -e "${GREEN}✅ نصب مجدد با موفقیت انجام شد!${NC}"
echo -e "${YELLOW}📋 آخرین لاگ‌ها:${NC}"
pm2 logs transport-backend --lines 10 --nostream

echo -e "${GREEN}🎉 تمام! سرور آماده است.${NC}"
echo -e "${YELLOW}💡 Backup در: $BACKUP_DIR${NC}"

