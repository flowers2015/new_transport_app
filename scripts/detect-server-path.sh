#!/bin/bash
# فقط تشخیص مسیر — برای وقتی نمی‌دانید پروژه کجاست
#   bash scripts/detect-server-path.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy-lib.sh
source "$SCRIPT_DIR/deploy-lib.sh"

echo ""
deploy_log "جستجوی مسیر پروژه روی این سرور ..."
echo ""

found="$(deploy_find_project_dir || true)"
if [ -n "$found" ]; then
    deploy_ok "پروژه پیدا شد: $found"
    echo ""
    echo "برای deploy:"
    echo "  cd \"$found\" && bash deploy.sh"
    echo "  — یا از هر جا —"
    echo "  bash \"$found/scripts/transport-deploy.sh\""
    echo ""
    echo "یک‌بار deploy.config (پیشنهادی):"
    echo "  echo 'PROJECT_DIR=\"$found\"' > \"$found/deploy.config\""
    echo "  cp \"$found/scripts/transport-deploy.sh\" ~/transport-deploy.sh"
    echo "  chmod +x ~/transport-deploy.sh"
    exit 0
fi

deploy_print_diagnostics

echo "وضعیت PM2:"
if command -v pm2 >/dev/null 2>&1; then
    pm2 list 2>/dev/null || true
    echo ""
    pm2 describe transport-backend 2>/dev/null | grep -E 'cwd|script path|status' || deploy_warn "transport-backend در PM2 نیست"
else
    deploy_warn "pm2 نصب نیست"
fi

echo ""
echo "جستجو در home:"
find "$HOME" -maxdepth 6 -path '*/backend/server.js' 2>/dev/null | head -10 || true

exit 1
