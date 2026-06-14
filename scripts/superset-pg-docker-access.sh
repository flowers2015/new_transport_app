#!/usr/bin/env bash
# اجازه اتصال Superset (Docker) به PostgreSQL اپ روی host
# اجرا روی سرور: bash scripts/superset-pg-docker-access.sh

set -euo pipefail

DB_NAME="${DB_NAME:-transport_app}"
DB_USER="${DB_USER:-superset_reader}"

echo "=== بررسی listen PostgreSQL ==="
sudo ss -tlnp | grep ':5432' || { echo "PostgreSQL روی 5432 listen نمی‌کند"; exit 1; }

PG_CONF=$(sudo -u postgres psql -tAc "SHOW config_file;" | tr -d ' ')
PG_HBA=$(sudo -u postgres psql -tAc "SHOW hba_file;" | tr -d ' ')
PG_DATA=$(dirname "$PG_CONF")

echo "config: $PG_CONF"
echo "hba:    $PG_HBA"

LISTEN=$(sudo -u postgres psql -tAc "SHOW listen_addresses;" | tr -d ' ')
echo "listen_addresses فعلی: $LISTEN"

if [[ "$LISTEN" == "localhost" || "$LISTEN" == "127.0.0.1" ]]; then
  echo "→ PostgreSQL فقط روی localhost است؛ Docker نمی‌تواند وصل شود."
  echo "→ listen_addresses را به '*' تغییر می‌دهیم..."
  sudo sed -i "s/^#*listen_addresses.*/listen_addresses = '*'/" "$PG_CONF"
  if ! grep -q "^listen_addresses" "$PG_CONF"; then
    echo "listen_addresses = '*'" | sudo tee -a "$PG_CONF" >/dev/null
  fi
  NEED_RELOAD=1
fi

HBA_MARKER="# superset-docker-access"
if ! sudo grep -q "$HBA_MARKER" "$PG_HBA"; then
  echo "→ افزودن rule در pg_hba.conf برای شبکه Docker..."
  sudo tee -a "$PG_HBA" >/dev/null <<EOF

$HBA_MARKER
host    $DB_NAME    $DB_USER    172.17.0.0/16    scram-sha-256
host    $DB_NAME    $DB_USER    172.18.0.0/16    scram-sha-256
host    $DB_NAME    $DB_USER    192.168.0.0/16   scram-sha-256
EOF
  NEED_RELOAD=1
else
  echo "→ rule pg_hba از قبل وجود دارد."
fi

if [[ "${NEED_RELOAD:-0}" == "1" ]]; then
  echo "→ reload PostgreSQL..."
  sudo systemctl reload postgresql 2>/dev/null || sudo service postgresql reload
  sleep 2
fi

echo ""
echo "=== listen بعد از تغییر ==="
sudo ss -tlnp | grep ':5432'

echo ""
echo "=== تست از داخل کانتینر Superset ==="
for HOST in host.docker.internal 172.17.0.1 192.168.27.102; do
  if docker exec transport-superset sh -c "timeout 3 bash -c '</dev/tcp/$HOST/5432'" 2>/dev/null; then
    echo "✅ پورت 5432 از Superset به $HOST باز است"
  else
    echo "❌ پورت 5432 از Superset به $HOST بسته است"
  fi
done

echo ""
echo "در Superset این مقادیر را بگذارید:"
echo "  Host:     host.docker.internal"
echo "  Port:     5432"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USER"
echo "  Password: (رمز superset_reader از scripts/superset-create-reader.sql)"
