#!/bin/bash

# رنگ‌ها برای خروجی
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 در حال دریافت آخرین تغییرات از گیت...${NC}"
git pull origin master

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ خطا در دریافت تغییرات از گیت!${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 در حال نصب وابستگی‌های Backend...${NC}"
cd backend
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ خطا در نصب وابستگی‌های Backend!${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 در حال نصب وابستگی‌های Frontend...${NC}"
cd ../frontend
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ خطا در نصب وابستگی‌های Frontend!${NC}"
    exit 1
fi

echo -e "${YELLOW}🏗️ در حال Build کردن Frontend...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ خطا در Build کردن Frontend!${NC}"
    exit 1
fi

echo -e "${YELLOW}🔄 در حال Restart کردن Backend...${NC}"
cd ../backend

# بررسی اینکه آیا PM2 نصب است یا نه
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ استفاده از PM2 برای Restart...${NC}"
    pm2 restart transport-app || pm2 restart all
    pm2 save
else
    echo -e "${YELLOW}⚠️ PM2 یافت نشد. لطفاً سرور را به صورت دستی Restart کنید.${NC}"
    echo -e "${YELLOW}   دستور: cd backend && node server.js${NC}"
fi

echo -e "${GREEN}✅ آپدیت با موفقیت انجام شد!${NC}"
echo -e "${GREEN}📊 برای مشاهده لاگ‌ها: pm2 logs transport-app${NC}"

