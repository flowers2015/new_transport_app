#!/bin/bash
# بازیابی بکاپ SQL روی سرور FMS (مثل بکاپ قبلی)
# ⚠️ همه داده‌های فعلی transport_app روی سرور جایگزین می‌شود
#
# استفاده:
#   bash scripts/restore-database-on-server.sh /home/fms/transport_app_full_YYYYMMDD_HHMMSS.sql

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SQL_FILE="${1:-}"
DB_NAME="transport_app"

if [ -z "$SQL_FILE" ] || [ ! -f "$SQL_FILE" ]; then
  echo -e "${RED}❌ فایل بکاپ SQL را مشخص کنید:${NC}"
  echo "   bash scripts/restore-database-on-server.sh /home/fms/transport_app_full_XXXX.sql"
  exit 1
fi

echo -e "${YELLOW}⚠️  این کار همه داده‌های فعلی $DB_NAME روی سرور را جایگزین می‌کند.${NC}"
read -r -p "ادامه می‌دهید؟ (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "لغو شد."
  exit 0
fi

SAFETY_BACKUP="/home/fms/transport_app_before_restore_$(date +%Y%m%d_%H%M%S).sql"
echo -e "${YELLOW}📦 بکاپ امنیتی از دیتابیس فعلی سرور...${NC}"
sudo -u postgres pg_dump -d "$DB_NAME" -f "$SAFETY_BACKUP"
echo -e "${GREEN}✅ ذخیره شد: $SAFETY_BACKUP${NC}"

echo -e "${YELLOW}⏸️  توقف backend...${NC}"
pm2 stop transport-backend || true

echo -e "${YELLOW}🔌 قطع اتصال‌های فعال...${NC}"
sudo -u postgres psql -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  >/dev/null || true

echo -e "${YELLOW}🗄️  بازسازی دیتابیس خالی...${NC}"
sudo -u postgres dropdb --if-exists "$DB_NAME"
sudo -u postgres createdb "$DB_NAME" -O postgres

echo -e "${YELLOW}📥 restore از فایل SQL...${NC}"
sudo -u postgres psql -d "$DB_NAME" -f "$SQL_FILE"

echo -e "${YELLOW}▶️  راه‌اندازی backend...${NC}"
cd /home/fms/project/backend
pm2 restart transport-backend

echo -e "${YELLOW}🔍 بررسی سریع...${NC}"
sudo -u postgres psql -d "$DB_NAME" -c "
SELECT 'vehicles' AS tbl, COUNT(*)::int FROM vehicles
UNION ALL SELECT 'drivers', COUNT(*)::int FROM drivers
UNION ALL SELECT 'freight_announcements', COUNT(*)::int FROM freight_announcements
UNION ALL SELECT 'users', COUNT(*)::int FROM users;
"

echo -e "${GREEN}✅ restore تمام شد.${NC}"
