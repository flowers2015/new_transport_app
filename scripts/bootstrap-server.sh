#!/bin/bash
#
# نصب اولیه روی سرور وقتی پروژه اصلاً clone نشده
#
#   bash scripts/bootstrap-server.sh
#   bash scripts/bootstrap-server.sh /home/fms/apps/transport-app
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy-lib.sh
source "$SCRIPT_DIR/deploy-lib.sh"

TARGET_DIR="${1:-$HOME/new_transport_app}"
GIT_REPO="${GIT_REPO:-git@github.com:flowers2015/new_transport_app.git}"

echo ""
deploy_log "Bootstrap — نصب اولیه"
echo "مسیر هدف: $TARGET_DIR"
echo ""

if [ -d "$TARGET_DIR/.git" ]; then
    deploy_ok "پروژه از قبل وجود دارد: $TARGET_DIR"
    echo "فقط deploy کنید: cd \"$TARGET_DIR\" && bash deploy.sh"
    exit 0
fi

mkdir -p "$(dirname "$TARGET_DIR")"

if ! command -v git >/dev/null 2>&1; then
    deploy_err "git نصب نیست: sudo apt install git"
    exit 1
fi

deploy_log "clone از $GIT_REPO ..."
git clone "$GIT_REPO" "$TARGET_DIR"
deploy_ok "clone شد"

# deploy.config
cat > "$TARGET_DIR/deploy.config" <<EOF
PROJECT_DIR="$TARGET_DIR"
BUILD_FRONTEND=true
RUN_MIGRATIONS=true
EOF
deploy_ok "deploy.config ساخته شد"

if [ ! -f "$TARGET_DIR/backend/.env" ]; then
    deploy_warn "backend/.env وجود ندارد!"
    if [ -f "$TARGET_DIR/backend/.env.example" ]; then
        cp "$TARGET_DIR/backend/.env.example" "$TARGET_DIR/backend/.env"
        echo "  از .env.example کپی شد — حتماً ویرایش کنید: nano $TARGET_DIR/backend/.env"
    fi
fi

deploy_log "اجرای deploy اول ..."
cd "$TARGET_DIR"
bash deploy.sh

deploy_ok "Bootstrap تمام"
echo ""
echo "مراحل بعد:"
echo "  1. nano $TARGET_DIR/backend/.env   (دیتابیس، JWT، BALE_BOT_TOKEN)"
echo "  2. pm2 save && pm2 startup   (اجرای خودکار بعد از reboot)"
