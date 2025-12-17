#!/bin/bash

# بررسی DNS و اتصال Cloudflare

echo "🔍 بررسی DNS و اتصال Cloudflare..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "1️⃣ بررسی DNS برای tpmhub.ir"
echo "═══════════════════════════════════════════════════════════"
echo "--- از DNS عمومی Google ---"
nslookup tpmhub.ir 8.8.8.8 || dig tpmhub.ir @8.8.8.8 +short

echo ""
echo "--- از DNS Cloudflare ---"
nslookup tpmhub.ir 1.1.1.1 || dig tpmhub.ir @1.1.1.1 +short

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "2️⃣ بررسی DNS برای www.tpmhub.ir"
echo "═══════════════════════════════════════════════════════════"
echo "--- از DNS عمومی Google ---"
nslookup www.tpmhub.ir 8.8.8.8 || dig www.tpmhub.ir @8.8.8.8 +short

echo ""
echo "--- از DNS Cloudflare ---"
nslookup www.tpmhub.ir 1.1.1.1 || dig www.tpmhub.ir @1.1.1.1 +short

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "3️⃣ تست مستقیم از دامنه (بدون Cloudflare)"
echo "═══════════════════════════════════════════════════════════"
echo "در حال تست http://tpmhub.ir (مستقیم به IP)..."
curl -I --resolve tpmhub.ir:80:51.178.41.12 http://tpmhub.ir 2>&1 | head -n 5

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "4️⃣ بررسی IP سرور"
echo "═══════════════════════════════════════════════════════════"
echo "IP سرور باید: 51.178.41.12"
hostname -I | grep -o "51.178.41.12" && echo -e "${GREEN}✅ IP درست است${NC}" || echo -e "${RED}❌ IP پیدا نشد${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ بررسی تمام شد"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${YELLOW}📋 اگر DNS به IP دیگری اشاره می‌کند:${NC}"
echo "   1. به پنل Cloudflare بروید"
echo "   2. DNS → Records"
echo "   3. A record برای tpmhub.ir باید به 51.178.41.12 اشاره کند"
echo "   4. A record برای www.tpmhub.ir باید به 51.178.41.12 اشاره کند"
echo "   5. Proxy status باید 'Proxied' (ابر نارنجی) باشد"
echo ""
echo -e "${YELLOW}📋 اگر DNS درست است اما هنوز Error 521:${NC}"
echo "   1. SSL/TLS → Overview → Encryption mode: 'Flexible'"
echo "   2. Caching → Configuration → Purge Everything"
echo "   3. چند دقیقه صبر کنید تا DNS propagate شود"

