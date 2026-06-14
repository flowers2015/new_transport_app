#!/usr/bin/env bash
# تست اتصال Superset به PostgreSQL اپ
# استفاده: SUPERSET_DB_PASSWORD='رمز' bash scripts/superset-test-db-connection.sh

set -euo pipefail

DB_HOST="${DB_HOST:-host.docker.internal}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-transport_app}"
DB_USER="${DB_USER:-superset_reader}"
DB_PASSWORD="${SUPERSET_DB_PASSWORD:-}"

echo "=== ۱. کاربر در PostgreSQL ==="
sudo -u postgres psql -d "$DB_NAME" -c "\du $DB_USER" 2>/dev/null || echo "کاربر $DB_USER وجود ندارد"

echo ""
echo "=== ۲. listen و pg_hba ==="
sudo ss -tlnp | grep ':5432' || true
sudo grep -A3 'superset-docker-access' /etc/postgresql/*/main/pg_hba.conf 2>/dev/null || \
  sudo grep "$DB_USER" "$(sudo -u postgres psql -tAc 'SHOW hba_file;')" | tail -5

echo ""
echo "=== ۳. تست TCP از کانتینر Superset ==="
for HOST in host.docker.internal 172.17.0.1 192.168.27.102; do
  if docker exec transport-superset sh -c "timeout 3 bash -c '</dev/tcp/$HOST/5432'" 2>/dev/null; then
    echo "✅ TCP $HOST:5432 باز"
  else
    echo "❌ TCP $HOST:5432 بسته"
  fi
done

echo ""
echo "=== ۴. تست login با Python (داخل Superset) ==="
if [[ -z "$DB_PASSWORD" ]]; then
  echo "رمز ندادید. اجرا کنید:"
  echo "  SUPERSET_DB_PASSWORD='رمز-superset_reader' bash scripts/superset-test-db-connection.sh"
  exit 0
fi

docker exec -e DB_HOST="$DB_HOST" -e DB_PORT="$DB_PORT" -e DB_NAME="$DB_NAME" \
  -e DB_USER="$DB_USER" -e DB_PASSWORD="$DB_PASSWORD" transport-superset python3 <<'PY'
import os, sys
try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 نصب نیست — bash scripts/superset-docker.sh build")
    sys.exit(1)
try:
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        connect_timeout=5,
    )
    cur = conn.cursor()
    cur.execute("SELECT current_user, current_database()")
    print("✅ اتصال موفق:", cur.fetchone())
    conn.close()
except Exception as e:
    print("❌ خطای اتصال:", type(e).__name__, str(e))
    sys.exit(1)
PY

echo ""
echo "=== ۵. آخرین خطاهای Superset ==="
docker logs transport-superset --tail 30 2>&1 | grep -iE 'error|exception|database|psycopg|password|auth' || \
  docker logs transport-superset --tail 15
