#!/bin/bash

# بررسی اینکه Nginx روی همه interface ها گوش می‌دهد

echo "🔍 بررسی وضعیت Nginx و Firewall..."

# رنگ‌ها
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "1️⃣ بررسی پورت‌های باز Nginx"
echo "═══════════════════════════════════════════════════════════"
if command -v ss >/dev/null 2>&1; then
    echo "--- پورت‌های 80 و 443 ---"
    ss -tuln | grep -E ':(80|443) ' || echo "پورت 80 یا 443 پیدا نشد"
else
    echo "--- استفاده از netstat ---"
    netstat -tuln | grep -E ':(80|443) ' || echo "پورت 80 یا 443 پیدا نشد"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "2️⃣ بررسی Firewall (UFW)"
echo "═══════════════════════════════════════════════════════════"
if command -v ufw >/dev/null 2>&1; then
    ufw status
else
    echo "UFW نصب نیست"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "3️⃣ بررسی Firewall (iptables)"
echo "═══════════════════════════════════════════════════════════"
if command -v iptables >/dev/null 2>&1; then
    echo "--- قوانین iptables برای پورت 80 ---"
    iptables -L -n | grep -E '80|443' || echo "قانونی برای پورت 80 پیدا نشد"
else
    echo "iptables نصب نیست"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "4️⃣ تست از IP سرور (نه localhost)"
echo "═══════════════════════════════════════════════════════════"
SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || hostname -I | awk '{print $1}')
echo "IP سرور: $SERVER_IP"
echo "در حال تست http://$SERVER_IP ..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" --connect-timeout 5 http://$SERVER_IP || echo "❌ اتصال برقرار نشد"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "5️⃣ بررسی کانفیگ Nginx (listen directive)"
echo "═══════════════════════════════════════════════════════════"
grep -E "^\s*listen" /etc/nginx/sites-available/default || echo "listen directive پیدا نشد"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ بررسی تمام شد"
echo "═══════════════════════════════════════════════════════════"

