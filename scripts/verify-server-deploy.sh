#!/bin/bash
# بررسی سریع: آیا سرور همان کد git و dist تازه را سرو می‌کند؟
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}$1${NC}"; }
ok() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err() { echo -e "${RED}✗ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-lib.sh
source "$SCRIPT_DIR/deploy-lib.sh"

PROJECT_DIR="$(deploy_find_project_dir || true)"
if [ -z "${PROJECT_DIR:-}" ]; then
    err "مسیر پروژه پیدا نشد"
    exit 1
fi

cd "$PROJECT_DIR"
if [ -f "$PROJECT_DIR/deploy.config" ]; then
    # shellcheck disable=SC1090
    source "$PROJECT_DIR/deploy.config"
fi

log "══════════════════════════════════════════"
log "  verify-server-deploy"
log "══════════════════════════════════════════"
echo ""
ok "PROJECT_DIR: $PROJECT_DIR"

if [ -d ".git" ]; then
    echo "git commit: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
else
    warn "پوشه git نیست"
fi

PROJECT_DIST="$PROJECT_DIR/frontend/dist"
if [ -f "$PROJECT_DIST/index.html" ]; then
    ok "build در پروژه: $PROJECT_DIST"
    echo "  index.html: $(stat -c '%y' "$PROJECT_DIST/index.html" 2>/dev/null || stat -f '%Sm' "$PROJECT_DIST/index.html")"
    if grep -q "آرشیو اعلام بار" "$PROJECT_DIST/assets/"*.js 2>/dev/null; then
        ok "bundle شامل «آرشیو اعلام بار» است"
    else
        warn "bundle قدیمی است — «آرشیو اعلام بار» در JS پیدا نشد"
    fi
else
    err "frontend/dist در پروژه نیست — npm run build بزنید"
fi

NGINX_ROOT=""
for cfg in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$cfg" ] || continue
    candidate="$(grep -E '^\s*root\s+' "$cfg" 2>/dev/null | head -1 | awk '{print $2}' | tr -d ';' || true)"
    if [ -n "$candidate" ] && [[ "$candidate" == *dist* ]]; then
        NGINX_ROOT="$candidate"
        break
    fi
done

if [ -n "$NGINX_ROOT" ]; then
    echo ""
    ok "NGINX root: $NGINX_ROOT"
    if [ -f "$NGINX_ROOT/index.html" ]; then
        echo "  index.html: $(stat -c '%y' "$NGINX_ROOT/index.html" 2>/dev/null || stat -f '%Sm' "$NGINX_ROOT/index.html")"
    else
        err "index.html در NGINX root نیست"
    fi

    if [ -f "$PROJECT_DIST/index.html" ] && [ -f "$NGINX_ROOT/index.html" ]; then
        if cmp -s "$PROJECT_DIST/index.html" "$NGINX_ROOT/index.html"; then
            ok "dist پروژه و NGINX یکسان هستند"
        else
            err "dist پروژه و NGINX فرق دارند — deploy بدون sync یا NGINX_DIST_DIR"
            echo "  راه‌حل: در deploy.config بگذارید:"
            echo "  NGINX_DIST_DIR=\"$NGINX_ROOT\""
            echo "  سپس: bash deploy.sh"
        fi
    fi
else
    warn "root مربوط به dist در NGINX پیدا نشد"
fi

if command -v pm2 >/dev/null 2>&1; then
    echo ""
    pm2 describe transport-backend 2>/dev/null | grep -E 'status|exec cwd|script path' || warn "transport-backend در PM2 نیست"
fi

echo ""
