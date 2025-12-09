#!/bin/bash

# اسکریپت خودکار برای تنظیم NGINX و آپدیت Frontend

echo "🚀 شروع تنظیم NGINX و آپدیت Frontend..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. Backup فایل NGINX
echo -e "${YELLOW}📦 گرفتن Backup از فایل NGINX...${NC}"
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✅ Backup گرفته شد${NC}"

# 2. بررسی وجود client_max_body_size
echo -e "${YELLOW}🔍 بررسی تنظیمات NGINX...${NC}"
if grep -q "client_max_body_size" /etc/nginx/sites-available/default; then
    echo -e "${YELLOW}⚠️  client_max_body_size از قبل وجود دارد${NC}"
    echo -e "${YELLOW}   لطفاً به صورت دستی مقدار را به 50M تغییر دهید${NC}"
else
    echo -e "${YELLOW}➕ اضافه کردن client_max_body_size...${NC}"
    
    # اضافه کردن در ابتدای server block
    sudo sed -i '/^server {/a\    client_max_body_size 50M;' /etc/nginx/sites-available/default
    
    # اضافه کردن در location /api/ اگر وجود دارد
    if grep -q "location /api/" /etc/nginx/sites-available/default; then
        sudo sed -i '/location \/api\//a\        client_max_body_size 50M;' /etc/nginx/sites-available/default
    fi
    
    echo -e "${GREEN}✅ client_max_body_size اضافه شد${NC}"
fi

# 3. تست NGINX
echo -e "${YELLOW}🧪 تست تنظیمات NGINX...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ تنظیمات NGINX درست است${NC}"
    
    # 4. Restart NGINX
    echo -e "${YELLOW}🔄 Restart کردن NGINX...${NC}"
    sudo systemctl restart nginx
    echo -e "${GREEN}✅ NGINX restart شد${NC}"
else
    echo -e "${RED}❌ خطا در تنظیمات NGINX!${NC}"
    echo -e "${YELLOW}   لطفاً فایل را به صورت دستی بررسی کنید${NC}"
    exit 1
fi

# 5. آپدیت Frontend
echo -e "${YELLOW}📥 دریافت تغییرات از Git...${NC}"
cd /var/www/my-transport-app
git pull origin master

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ خطا در دریافت تغییرات از Git${NC}"
    exit 1
fi

# 6. Build Frontend
echo -e "${YELLOW}🏗️  Build کردن Frontend...${NC}"
cd frontend
npm install
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ خطا در Build کردن Frontend${NC}"
    exit 1
fi

echo -e "${GREEN}✅ تمام!${NC}"
echo -e "${GREEN}📊 حالا می‌توانید:${NC}"
echo -e "   1. فایل Excel بزرگ آپلود کنید (تا 50MB)"
echo -e "   2. کرایه را با فرمت فارسی و جداکننده 3 رقمی ببینید"
echo -e "   3. تناژ را به صورت کیلوگرم ببینید"

