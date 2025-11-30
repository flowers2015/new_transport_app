#!/bin/bash

# اسکریپت خودکار deploy برای سرور Linux
# این اسکریپت: git pull می‌کند، تنظیمات CORS را اعمال می‌کند، npm install می‌کند و PM2 را restart می‌کند

set -e  # در صورت خطا متوقف شود

echo "🚀 شروع فرآیند Deploy..."

# رنگ‌ها برای خروجی
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# مسیر پروژه
PROJECT_DIR="/var/www/my-transport-app"
BACKEND_DIR="$PROJECT_DIR/backend"
SERVER_IP="51.178.41.12"

cd "$PROJECT_DIR"

# 1. PM2 را متوقف کنید
echo -e "${YELLOW}⏸️  متوقف کردن PM2...${NC}"
pm2 stop transport-backend 2>/dev/null || true

# 2. Git Pull
echo -e "${YELLOW}📥 دریافت تغییرات از Git...${NC}"
git pull origin master || git pull origin main

# 3. حذف node_modules برای نصب مجدد (برای اطمینان از کامپایل درست native modules)
echo -e "${YELLOW}🗑️  حذف node_modules قدیمی...${NC}"
cd "$BACKEND_DIR"
rm -rf node_modules package-lock.json

# 4. نصب Dependencies
echo -e "${YELLOW}📦 نصب Dependencies...${NC}"
npm install

# 5. اعمال تنظیمات CORS برای سرور Production
echo -e "${YELLOW}⚙️  اعمال تنظیمات CORS...${NC}"
cd "$PROJECT_DIR"

# بررسی و اعمال تنظیمات CORS
if grep -q "origin: true" "$BACKEND_DIR/server.js"; then
    echo -e "${YELLOW}   تنظیمات CORS در حال اعمال...${NC}"
    # جایگزینی origin: true با تنظیمات production
    sed -i "s|origin: true, // Allow all origins in development|origin: ['http://$SERVER_IP', 'http://localhost'], // پوشش IP سرور و آدرس داخلی|g" "$BACKEND_DIR/server.js"
    echo -e "${GREEN}   ✓ تنظیمات CORS اعمال شد${NC}"
else
    echo -e "${GREEN}   ✓ تنظیمات CORS از قبل درست است${NC}"
fi

# 6. بررسی ecosystem.config.js
if [ -f "$PROJECT_DIR/ecosystem.config.js" ]; then
    echo -e "${YELLOW}🔄 راه‌اندازی مجدد PM2 با ecosystem.config.js...${NC}"
    pm2 start ecosystem.config.js
else
    echo -e "${YELLOW}🔄 راه‌اندازی مجدد PM2...${NC}"
    cd "$BACKEND_DIR"
    pm2 start server.js --name transport-backend
fi

# 7. بررسی وضعیت
echo -e "${YELLOW}📊 بررسی وضعیت PM2...${NC}"
sleep 2
pm2 status

# 8. نمایش لاگ‌ها
echo -e "${GREEN}✅ Deploy با موفقیت انجام شد!${NC}"
echo -e "${YELLOW}📋 آخرین لاگ‌ها:${NC}"
pm2 logs transport-backend --lines 10 --nostream

echo -e "${GREEN}🎉 تمام! سرور آماده است.${NC}"

