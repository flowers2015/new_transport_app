#!/bin/bash

# اسکریپت سریع برای حذف duplicate directives در NGINX

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

NGINX_CONFIG="/etc/nginx/nginx.conf"

echo -e "${YELLOW}🔧 حذف duplicate directives در NGINX...${NC}"

# Backup
if [ ! -f "${NGINX_CONFIG}.backup.duplicate" ]; then
    sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.duplicate"
    echo -e "${GREEN}✓ Backup گرفته شد${NC}"
fi

# حذف duplicate gzip_vary
gzip_vary_count=$(grep -c "^[[:space:]]*gzip_vary on;" "$NGINX_CONFIG")
if [ "$gzip_vary_count" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  حذف duplicate gzip_vary...${NC}"
    # حذف همه و اضافه کردن فقط یکی بعد از gzip on
    sudo sed -i '/^[[:space:]]*gzip_vary on;/d' "$NGINX_CONFIG"
    sudo sed -i '/^[[:space:]]*gzip on;/a\    gzip_vary on;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ duplicate gzip_vary حذف شد${NC}"
fi

# حذف duplicate gzip_proxied
gzip_proxied_count=$(grep -c "^[[:space:]]*gzip_proxied" "$NGINX_CONFIG")
if [ "$gzip_proxied_count" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  حذف duplicate gzip_proxied...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_proxied/d' "$NGINX_CONFIG"
    sudo sed -i '/^[[:space:]]*gzip_vary on;/a\    gzip_proxied any;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ duplicate gzip_proxied حذف شد${NC}"
fi

# حذف duplicate gzip_comp_level
gzip_comp_level_count=$(grep -c "^[[:space:]]*gzip_comp_level" "$NGINX_CONFIG")
if [ "$gzip_comp_level_count" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  حذف duplicate gzip_comp_level...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_comp_level/d' "$NGINX_CONFIG"
    sudo sed -i '/^[[:space:]]*gzip_proxied any;/a\    gzip_comp_level 6;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ duplicate gzip_comp_level حذف شد${NC}"
fi

# حذف duplicate gzip_buffers
gzip_buffers_count=$(grep -c "^[[:space:]]*gzip_buffers" "$NGINX_CONFIG")
if [ "$gzip_buffers_count" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  حذف duplicate gzip_buffers...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_buffers/d' "$NGINX_CONFIG"
    sudo sed -i '/^[[:space:]]*gzip_comp_level 6;/a\    gzip_buffers 16 8k;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ duplicate gzip_buffers حذف شد${NC}"
fi

# حذف duplicate gzip_http_version
gzip_http_version_count=$(grep -c "^[[:space:]]*gzip_http_version" "$NGINX_CONFIG")
if [ "$gzip_http_version_count" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  حذف duplicate gzip_http_version...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_http_version/d' "$NGINX_CONFIG"
    sudo sed -i '/^[[:space:]]*gzip_buffers 16 8k;/a\    gzip_http_version 1.1;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ duplicate gzip_http_version حذف شد${NC}"
fi

# حذف duplicate gzip_types
gzip_types_count=$(grep -c "^[[:space:]]*gzip_types" "$NGINX_CONFIG")
if [ "$gzip_types_count" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  حذف duplicate gzip_types...${NC}"
    sudo sed -i '/^[[:space:]]*gzip_types/d' "$NGINX_CONFIG"
    sudo sed -i '/^[[:space:]]*gzip_http_version 1.1;/a\    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;' "$NGINX_CONFIG"
    echo -e "${GREEN}✓ duplicate gzip_types حذف شد${NC}"
fi

# تست NGINX
echo -e "${YELLOW}🔄 تست NGINX...${NC}"
if sudo nginx -t 2>&1; then
    sudo systemctl restart nginx
    echo -e "${GREEN}✅ NGINX با موفقیت Restart شد${NC}"
else
    echo -e "${RED}❌ خطا در تست NGINX${NC}"
    exit 1
fi

echo -e "${GREEN}✅ تمام duplicate directives حذف شدند!${NC}"

