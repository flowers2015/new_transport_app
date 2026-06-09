#!/bin/bash
#
# آپدیت سرور — از هر مسیری قابل اجراست
#
#   bash scripts/transport-deploy.sh
#   bash ~/transport-deploy.sh
#
# یک‌بار روی سرور (بعد از پیدا کردن مسیر پروژه):
#   cp scripts/transport-deploy.sh ~/transport-deploy.sh
#   chmod +x ~/transport-deploy.sh
#   ~/transport-deploy.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}$1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; }

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_via_pm2() {
    if ! command -v pm2 >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
        return 1
    fi
    local helper="$SCRIPT_PATH/pm2-project-path.js"
    if [ -f "$helper" ]; then
        node "$helper" 2>/dev/null && return 0
    fi
    node -e "
const {execSync}=require('child_process');
const fs=require('fs');const path=require('path');
try {
  const list=JSON.parse(execSync('pm2 jlist',{encoding:'utf8'}));
  const app=list.find(a=>a.name==='transport-backend');
  if(!app) process.exit(1);
  const cwd=app.pm2_env&&app.pm2_env.pm_cwd;
  const script=app.pm2_env&&app.pm2_env.pm_exec_path;
  function root(d){
    if(!d)return null;
    if(fs.existsSync(path.join(d,'backend/server.js'))&&fs.existsSync(path.join(d,'frontend')))return d;
    const p=path.dirname(d);
    if(fs.existsSync(path.join(p,'backend/server.js'))&&fs.existsSync(path.join(p,'frontend')))return p;
    return null;
  }
  const r=root(cwd)||(script?root(path.dirname(script)):null);
  if(r){process.stdout.write(r);process.exit(0);}
  process.exit(1);
} catch(e){process.exit(1);}
" 2>/dev/null
}

find_project() {
    local candidate dir

    # deploy.config در home
    if [ -f "$HOME/deploy.config" ]; then
        # shellcheck disable=SC1090
        source "$HOME/deploy.config"
        if [ -n "${PROJECT_DIR:-}" ] && [ -f "$PROJECT_DIR/backend/server.js" ]; then
            echo "$PROJECT_DIR"
            return 0
        fi
    fi

    # اگر transport-deploy کنار deploy.sh است
    if [ -f "$SCRIPT_PATH/../deploy.sh" ] && [ -f "$SCRIPT_PATH/../backend/server.js" ]; then
        echo "$(cd "$SCRIPT_PATH/.." && pwd)"
        return 0
    fi

    # cwd
    if [ -f "$(pwd)/backend/server.js" ] && [ -d "$(pwd)/frontend" ]; then
        echo "$(pwd)"
        return 0
    fi

    # deploy.config در cwd
    if [ -f "$(pwd)/deploy.config" ]; then
        # shellcheck disable=SC1090
        source "$(pwd)/deploy.config"
        if [ -n "${PROJECT_DIR:-}" ] && [ -f "$PROJECT_DIR/backend/server.js" ]; then
            echo "$PROJECT_DIR"
            return 0
        fi
    fi

    # PM2
    dir="$(find_via_pm2 || true)"
    if [ -n "$dir" ]; then
        echo "$dir"
        return 0
    fi

    # مسیرهای رایج
    for candidate in \
        "$HOME/new_transport_app" \
        "$HOME/my-transport-app" \
        "/var/www/my-transport-app" \
        "/var/www/new_transport_app" \
        "/opt/transport-app"
    do
        if [ -f "$candidate/backend/server.js" ]; then
            echo "$candidate"
            return 0
        fi
    done

    local found
    found="$(find "$HOME" /var/www /opt -maxdepth 6 -path '*/backend/server.js' 2>/dev/null | head -1 || true)"
    if [ -n "$found" ]; then
        candidate="$(dirname "$(dirname "$found")")"
        if [ -d "$candidate/frontend" ]; then
            echo "$candidate"
            return 0
        fi
    fi

    return 1
}

echo ""
log "══════════════════════════════════════════"
log "  transport-deploy — آپدیت سرور"
log "══════════════════════════════════════════"
echo ""

PROJECT_DIR="$(find_project || true)"
if [ -z "${PROJECT_DIR:-}" ]; then
    err "مسیر پروژه پیدا نشد!"
    echo ""
    echo "این دستور را بزنید تا مسیر PM2 را ببینید:"
    echo "  pm2 describe transport-backend"
    echo ""
    echo "یا:"
    echo "  find ~ -maxdepth 6 -path '*/backend/server.js'"
    echo ""
    echo "بعد:"
    echo "  echo 'PROJECT_DIR=\"/مسیر/واقعی\"' > ~/deploy.config"
    echo "  bash scripts/transport-deploy.sh"
    exit 1
fi

ok "مسیر پروژه: $PROJECT_DIR"
cd "$PROJECT_DIR"

if [ -f "$PROJECT_DIR/deploy.sh" ]; then
    log "اجرای deploy.sh ..."
    exec bash "$PROJECT_DIR/deploy.sh"
fi

# fallback اگر deploy.sh هنوز نیست (نسخه قدیمی)
if [ ! -d ".git" ]; then
    err "پوشه git نیست: $PROJECT_DIR"
    exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo master)"
log "git pull origin $BRANCH ..."
git pull origin "$BRANCH" || git pull origin main || git pull origin master

log "backend npm install ..."
cd "$PROJECT_DIR/backend"
npm install

if [ -d "$PROJECT_DIR/frontend" ]; then
    log "frontend build ..."
    cd "$PROJECT_DIR/frontend"
    npm install
    npm run build
fi

cd "$PROJECT_DIR"
if command -v pm2 >/dev/null 2>&1; then
    if pm2 describe transport-backend >/dev/null 2>&1; then
        pm2 restart transport-backend --update-env
        pm2 save 2>/dev/null || true
    elif [ -f ecosystem.config.js ]; then
        pm2 start ecosystem.config.js
        pm2 save 2>/dev/null || true
    fi
fi

ok "تمام شد"
pm2 status 2>/dev/null || true
