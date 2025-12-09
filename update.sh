#!/bin/bash

# رنگ‌ها برای خروجی
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# بررسی اینکه آیا در دایرکتوری پروژه هستیم
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo -e "${RED}❌ خطا: این اسکریپت باید در دایرکتوری اصلی پروژه اجرا شود!${NC}"
    echo -e "${YELLOW}   مسیر صحیح: /var/www/my-transport-app${NC}"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 شروع آپدیت سرور${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

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

echo -e "${YELLOW}🔄 در حال اجرای Migration برای nullable کردن mobile...${NC}"
node migrations/update_personal_drivers_mobile_nullable.js

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️ هشدار: Migration mobile اجرا نشد (ممکن است قبلاً اجرا شده باشد)${NC}"
fi

echo -e "${YELLOW}🔄 در حال اجرای Migration برای nullable کردن driver_smart_id...${NC}"
node migrations/make_driver_smart_id_nullable.js

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️ هشدار: Migration driver_smart_id اجرا نشد (ممکن است قبلاً اجرا شده باشد)${NC}"
fi

echo -e "${YELLOW}🔄 در حال اجرای Migration برای ایجاد جدول finalize_permissions...${NC}"
node migrations/create_finalize_permissions_table.js

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️ هشدار: Migration finalize_permissions اجرا نشد (ممکن است قبلاً اجرا شده باشد)${NC}"
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

echo -e "${YELLOW}⚙️  در حال تنظیم NGINX...${NC}"
# استفاده از اسکریپت جداگانه برای تنظیم NGINX
if [ -f "./fix_nginx.sh" ]; then
    chmod +x ./fix_nginx.sh
    ./fix_nginx.sh
    NGINX_FIX_RESULT=$?
    if [ $NGINX_FIX_RESULT -ne 0 ]; then
        echo -e "${YELLOW}   ⚠️  تنظیمات NGINX با خطا مواجه شد. لطفاً به صورت دستی اجرا کنید:${NC}"
        echo -e "   ${YELLOW}sudo bash fix_nginx.sh${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  اسکریپت fix_nginx.sh یافت نشد. لطفاً به صورت دستی تنظیم کنید${NC}"
fi

# بهینه‌سازی عملکرد NGINX
echo -e "${YELLOW}🚀 در حال بهینه‌سازی عملکرد NGINX...${NC}"
if [ -f "./optimize_nginx_performance.sh" ]; then
    chmod +x ./optimize_nginx_performance.sh
    sudo bash ./optimize_nginx_performance.sh
    NGINX_OPTIMIZE_RESULT=$?
    if [ $NGINX_OPTIMIZE_RESULT -ne 0 ]; then
        echo -e "${YELLOW}   ⚠️  بهینه‌سازی NGINX با خطا مواجه شد. لطفاً به صورت دستی اجرا کنید:${NC}"
        echo -e "   ${YELLOW}sudo bash optimize_nginx_performance.sh${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  اسکریپت optimize_nginx_performance.sh یافت نشد${NC}"
fi

# فعال کردن کامل Gzip Compression در NGINX
echo -e "${YELLOW}🗜️  در حال فعال کردن کامل Gzip Compression در NGINX...${NC}"
if [ -f "./fix_nginx_gzip.sh" ]; then
    chmod +x ./fix_nginx_gzip.sh
    sudo bash ./fix_nginx_gzip.sh
    NGINX_GZIP_RESULT=$?
    if [ $NGINX_GZIP_RESULT -ne 0 ]; then
        echo -e "${YELLOW}   ⚠️  فعال کردن Gzip با خطا مواجه شد. لطفاً به صورت دستی اجرا کنید:${NC}"
        echo -e "   ${YELLOW}sudo bash fix_nginx_gzip.sh${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  اسکریپت fix_nginx_gzip.sh یافت نشد${NC}"
fi

echo -e "${YELLOW}🔄 در حال Restart کردن Backend...${NC}"
cd ../backend

# بررسی اینکه آیا PM2 نصب است یا نه
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ استفاده از PM2 برای Restart...${NC}"
    # تلاش برای restart کردن با نام‌های مختلف
    if pm2 list | grep -q "transport-backend"; then
        pm2 restart transport-backend
    elif pm2 list | grep -q "transport-app"; then
        pm2 restart transport-app
    else
        pm2 restart all
    fi
    pm2 save
else
    echo -e "${YELLOW}⚠️ PM2 یافت نشد. لطفاً سرور را به صورت دستی Restart کنید.${NC}"
    echo -e "${YELLOW}   دستور: cd backend && node server.js${NC}"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ آپدیت با موفقیت انجام شد!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}📊 برای مشاهده لاگ‌ها:${NC}"
echo -e "   ${YELLOW}pm2 logs transport-backend --lines 50${NC}"
echo -e "${GREEN}📊 برای مشاهده خطاها:${NC}"
echo -e "   ${YELLOW}pm2 logs transport-backend --err --lines 20${NC}"
echo -e "${GREEN}📊 برای بررسی وضعیت:${NC}"
echo -e "   ${YELLOW}pm2 status${NC}"

