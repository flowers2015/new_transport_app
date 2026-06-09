#!/bin/bash
#
# Deploy / آپدیت سرور — مسیر پروژه را خودکار پیدا می‌کند
#
# استفاده:
#   cd /مسیر/واقعی/پروژه && bash deploy.sh
#   — یا —
#   bash /مسیر/واقعی/پروژه/deploy.sh
#
# اگر مسیر پیدا نشد: deploy.config.example را کپی به deploy.config کنید

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-lib.sh
source "$SCRIPT_DIR/scripts/deploy-lib.sh"

BUILD_FRONTEND="${BUILD_FRONTEND:-true}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
GIT_BRANCH="${GIT_BRANCH:-}"

echo ""
deploy_log "══════════════════════════════════════════"
deploy_log "  Deploy — سیستم مدیریت ناوگان"
deploy_log "══════════════════════════════════════════"
echo ""

PROJECT_DIR="$(deploy_find_project_dir || true)"

if [ -z "${PROJECT_DIR:-}" ]; then
    deploy_print_diagnostics
    exit 1
fi

deploy_ok "مسیر پروژه: $PROJECT_DIR"
cd "$PROJECT_DIR"

if [ -f "$PROJECT_DIR/deploy.config" ]; then
    # shellcheck disable=SC1090
    source "$PROJECT_DIR/deploy.config"
    BUILD_FRONTEND="${BUILD_FRONTEND:-true}"
    RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
    GIT_BRANCH="${GIT_BRANCH:-}"
fi

if [ ! -d ".git" ]; then
    deploy_err "پوشه git نیست: $PROJECT_DIR"
    echo "اگر هنوز clone نکرده‌اید:"
    echo "  git clone <repo-url> $PROJECT_DIR"
    exit 1
fi

# --- Git ---
deploy_git_pull "$GIT_BRANCH"

# --- Backend ---
deploy_log "نصب وابستگی‌های backend ..."
cd "$PROJECT_DIR/backend"
npm install
deploy_ok "backend npm install"

if [ "$RUN_MIGRATIONS" = "true" ]; then
    deploy_run_optional_migrations "$PROJECT_DIR/backend"
fi

# --- Frontend ---
if [ "$BUILD_FRONTEND" = "true" ] && [ -d "$PROJECT_DIR/frontend" ]; then
    deploy_log "نصب و build فرانت ..."
    cd "$PROJECT_DIR/frontend"
    npm install
    npm run build
    deploy_ok "frontend build"
else
    deploy_warn "build فرانت رد شد (BUILD_FRONTEND=$BUILD_FRONTEND)"
fi

# --- PM2 ---
deploy_pm2_restart "$PROJECT_DIR"

echo ""
deploy_ok "Deploy تمام شد"
echo ""
deploy_log "بررسی:"
echo "  pm2 status"
echo "  pm2 logs transport-backend --lines 30 --nostream"
echo ""

if command -v pm2 >/dev/null 2>&1; then
    pm2 status 2>/dev/null || true
    echo ""
    pm2 logs transport-backend --lines 15 --nostream 2>/dev/null || true
fi
