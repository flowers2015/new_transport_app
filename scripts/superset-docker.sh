#!/usr/bin/env bash
# اجرای Superset — هم docker compose (v2) هم docker-compose (v1)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE_FILE="docker-compose.superset.yml"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose -f "$COMPOSE_FILE")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose -f "$COMPOSE_FILE")
else
  echo "❌ نه docker compose و نه docker-compose پیدا نشد."
  echo "   نصب: sudo apt install -y docker-compose"
  exit 1
fi

ACTION="${1:-up}"

case "$ACTION" in
  up)
    if sudo ss -tlnp 2>/dev/null | grep -q ':3001 '; then
      echo "⚠️  پورت 3001 اشغال است. ابتدا سرویس قبلی را متوقف کنید:"
      sudo ss -tlnp | grep ':3001 ' || true
      exit 1
    fi
    "${COMPOSE[@]}" up -d --force-recreate
    sleep 3
    if ! sudo ss -tlnp 2>/dev/null | grep -q ':3001 '; then
      echo "❌ پورت 3001 به Superset وصل نشد. docker-compose ps را چک کنید."
      "${COMPOSE[@]}" ps
      exit 1
    fi
    echo "✅ Superset بالا آمد (پورت 3001 فعال). چند ثانیه صبر کنید سپس:"
    echo "   bash scripts/superset-docker.sh init   # فقط اگر هنوز init نکرده‌اید"
    echo "   curl -s http://127.0.0.1:3001/health"
    ;;
  recreate)
    "${COMPOSE[@]}" down
    "${COMPOSE[@]}" up -d --force-recreate
    sleep 3
    "${COMPOSE[@]}" ps
    sudo ss -tlnp 2>/dev/null | grep ':3001 ' || echo "⚠️ پورت 3001 هنوز publish نشده"
    ;;
  ps)
    "${COMPOSE[@]}" ps
    ;;
  logs)
    "${COMPOSE[@]}" logs -f --tail=100 superset
    ;;
  stop)
    "${COMPOSE[@]}" stop
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  init)
    echo "🔄 db upgrade ..."
    "${COMPOSE[@]}" exec superset superset db upgrade
    echo ""
    echo "👤 ساخت ادمین (نام کاربری/رمز را وارد کنید):"
    "${COMPOSE[@]}" exec -it superset superset fab create-admin
    echo "🔄 superset init ..."
    "${COMPOSE[@]}" exec superset superset init
    echo "✅ آماده: http://$(hostname -I | awk '{print $1}'):3001"
    ;;
  *)
    echo "استفاده: bash scripts/superset-docker.sh [up|recreate|ps|logs|stop|down|init]"
    exit 1
    ;;
esac
