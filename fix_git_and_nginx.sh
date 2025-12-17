#!/bin/bash

# اسکریپت برای حل مشکل Git و تنظیم Nginx
# این اسکریپت تغییرات محلی را stash می‌کند، pull می‌کند و Nginx را تنظیم می‌کند

set -e

echo "🚀 شروع حل مشکل Git و تنظیم Nginx..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd /var/www/my-transport-app

# 1. بررسی تغییرات محلی
echo -e "${YELLOW}🔍 بررسی تغییرات محلی...${NC}"
if git status --porcelain | grep -q .; then
    echo -e "${YELLOW}⚠️  تغییرات محلی پیدا شد${NC}"
    
    # 2. Stash تغییرات
    echo -e "${YELLOW}💾 ذخیره تغییرات محلی (stash)...${NC}"
    git stash push -m "Auto-stash before pull $(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✅ تغییرات ذخیره شد${NC}"
else
    echo -e "${GREEN}✅ هیچ تغییر محلی وجود ندارد${NC}"
fi

# 3. Pull از Git
echo -e "${YELLOW}📥 دریافت آخرین تغییرات از Git...${NC}"
git pull origin master
echo -e "${GREEN}✅ تغییرات دریافت شد${NC}"

# 4. بررسی وجود فایل fix_nginx_cloudflare.sh
if [ -f "fix_nginx_cloudflare.sh" ]; then
    echo -e "${YELLOW}🔧 اجرای اسکریپت تنظیم Nginx...${NC}"
    bash fix_nginx_cloudflare.sh
else
    echo -e "${RED}❌ فایل fix_nginx_cloudflare.sh پیدا نشد!${NC}"
    echo -e "${YELLOW}   لطفاً به صورت دستی Nginx را تنظیم کنید${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ تمام!${NC}"

