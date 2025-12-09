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
# بررسی و تنظیم client_max_body_size در NGINX
NGINX_CONFIG="/etc/nginx/sites-available/default"
if [ -f "$NGINX_CONFIG" ]; then
    # Backup فایل NGINX
    if [ ! -f "${NGINX_CONFIG}.backup" ]; then
        sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup"
        echo -e "${GREEN}   ✓ Backup از فایل NGINX گرفته شد${NC}"
    fi
    
    # بررسی وجود client_max_body_size
    if ! grep -q "client_max_body_size" "$NGINX_CONFIG"; then
        echo -e "${YELLOW}   ➕ اضافه کردن client_max_body_size به NGINX...${NC}"
        # اضافه کردن در ابتدای server block
        sudo sed -i '/^server {/a\    client_max_body_size 50M;' "$NGINX_CONFIG"
        
        # اضافه کردن در location /api/ اگر وجود دارد
        if grep -q "location /api/" "$NGINX_CONFIG"; then
            sudo sed -i '/location \/api\//a\        client_max_body_size 50M;' "$NGINX_CONFIG"
        fi
        
        echo -e "${GREEN}   ✓ client_max_body_size اضافه شد${NC}"
        
        # تست و restart NGINX
        if sudo nginx -t 2>/dev/null; then
            sudo systemctl restart nginx
            echo -e "${GREEN}   ✓ NGINX restart شد${NC}"
        else
            echo -e "${YELLOW}   ⚠️  خطا در تست NGINX. لطفاً به صورت دستی بررسی کنید${NC}"
        fi
    else
        echo -e "${GREEN}   ✓ تنظیمات NGINX از قبل وجود دارد${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  فایل NGINX یافت نشد. لطفاً به صورت دستی تنظیم کنید${NC}"
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

