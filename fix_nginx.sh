#!/bin/bash

# رنگ‌ها برای خروجی
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}⚙️  تنظیم NGINX برای فایل‌های بزرگ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# بررسی اینکه آیا root هستیم یا نه
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  این اسکریپت نیاز به دسترسی root دارد${NC}"
    echo -e "${YELLOW}   در حال اجرا با sudo...${NC}"
    exec sudo bash "$0" "$@"
    exit $?
fi

# پیدا کردن فایل تنظیمات NGINX
NGINX_CONFIGS=(
    "/etc/nginx/sites-available/default"
    "/etc/nginx/nginx.conf"
    "/etc/nginx/conf.d/default.conf"
)

NGINX_CONFIG=""
for config in "${NGINX_CONFIGS[@]}"; do
    if [ -f "$config" ]; then
        NGINX_CONFIG="$config"
        echo -e "${GREEN}✓ فایل NGINX پیدا شد: $NGINX_CONFIG${NC}"
        break
    fi
done

if [ -z "$NGINX_CONFIG" ]; then
    echo -e "${RED}❌ فایل تنظیمات NGINX پیدا نشد!${NC}"
    echo -e "${YELLOW}   لطفاً به صورت دستی تنظیم کنید:${NC}"
    echo -e "   1. فایل NGINX را پیدا کنید: sudo find /etc/nginx -name '*.conf'"
    echo -e "   2. در بخش server { اضافه کنید: client_max_body_size 50M;"
    echo -e "   3. در بخش location /api/ { اضافه کنید: client_max_body_size 50M;"
    exit 1
fi

# Backup فایل NGINX
if [ ! -f "${NGINX_CONFIG}.backup" ]; then
    cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup"
    echo -e "${GREEN}✓ Backup از فایل NGINX گرفته شد${NC}"
else
    echo -e "${GREEN}✓ Backup از قبل وجود دارد${NC}"
fi

# بررسی وجود client_max_body_size
if grep -q "client_max_body_size" "$NGINX_CONFIG"; then
    echo -e "${GREEN}✓ تنظیمات client_max_body_size از قبل وجود دارد${NC}"
    # بررسی مقدار
    CURRENT_SIZE=$(grep "client_max_body_size" "$NGINX_CONFIG" | head -1 | grep -oP '\d+[KM]?' | head -1)
    if [ -n "$CURRENT_SIZE" ]; then
        echo -e "${YELLOW}   مقدار فعلی: $CURRENT_SIZE${NC}"
        if [[ "$CURRENT_SIZE" == "50M" ]] || [[ "$CURRENT_SIZE" == "50m" ]]; then
            echo -e "${GREEN}✓ مقدار درست است (50M)${NC}"
        else
            echo -e "${YELLOW}   ⚠️  مقدار فعلی ($CURRENT_SIZE) کمتر از 50M است${NC}"
            echo -e "${YELLOW}   در حال به‌روزرسانی به 50M...${NC}"
            sed -i 's/client_max_body_size.*/client_max_body_size 50M;/g' "$NGINX_CONFIG"
            echo -e "${GREEN}✓ مقدار به‌روزرسانی شد${NC}"
        fi
    fi
else
    echo -e "${YELLOW}➕ اضافه کردن client_max_body_size به NGINX...${NC}"
    
    # اضافه کردن در ابتدای server block
    if grep -q "^server {" "$NGINX_CONFIG"; then
        sed -i '/^server {/a\    client_max_body_size 50M;' "$NGINX_CONFIG"
        echo -e "${GREEN}   ✓ در server block اضافه شد${NC}"
    elif grep -q "^    server {" "$NGINX_CONFIG"; then
        sed -i '/^    server {/a\        client_max_body_size 50M;' "$NGINX_CONFIG"
        echo -e "${GREEN}   ✓ در server block اضافه شد${NC}"
    else
        # اگر server block پیدا نشد، در ابتدای فایل اضافه کن
        sed -i '1i\client_max_body_size 50M;' "$NGINX_CONFIG"
        echo -e "${GREEN}   ✓ در ابتدای فایل اضافه شد${NC}"
    fi
    
    # اضافه کردن در location /api/ اگر وجود دارد
    if grep -q "location /api/" "$NGINX_CONFIG"; then
        if ! grep -q "location /api/" "$NGINX_CONFIG" -A 5 | grep -q "client_max_body_size"; then
            sed -i '/location \/api\//a\        client_max_body_size 50M;' "$NGINX_CONFIG"
            echo -e "${GREEN}   ✓ در location /api/ اضافه شد${NC}"
        fi
    fi
fi

# تست NGINX
echo -e "${YELLOW}🔍 تست تنظیمات NGINX...${NC}"
if nginx -t 2>&1; then
    echo -e "${GREEN}✓ تست NGINX موفق بود${NC}"
    
    # Restart NGINX
    echo -e "${YELLOW}🔄 در حال Restart کردن NGINX...${NC}"
    if systemctl restart nginx 2>&1; then
        echo -e "${GREEN}✓ NGINX restart شد${NC}"
    else
        echo -e "${RED}❌ خطا در restart کردن NGINX${NC}"
        echo -e "${YELLOW}   لطفاً به صورت دستی restart کنید: sudo systemctl restart nginx${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ خطا در تست NGINX!${NC}"
    echo -e "${YELLOW}   لطفاً فایل را بررسی کنید: $NGINX_CONFIG${NC}"
    echo -e "${YELLOW}   Backup در: ${NGINX_CONFIG}.backup${NC}"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ تنظیمات NGINX با موفقیت اعمال شد!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}📊 برای بررسی وضعیت NGINX:${NC}"
echo -e "   ${YELLOW}sudo systemctl status nginx${NC}"
echo -e "${GREEN}📊 برای مشاهده لاگ‌های NGINX:${NC}"
echo -e "   ${YELLOW}sudo tail -f /var/log/nginx/error.log${NC}"

