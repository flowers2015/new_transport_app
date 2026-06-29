#!/bin/bash
# توابع مشترک deploy — source شود، مستقیم اجرا نشود

deploy_color_green='\033[0;32m'
deploy_color_yellow='\033[1;33m'
deploy_color_red='\033[0;31m'
deploy_color_blue='\033[0;34m'
deploy_color_nc='\033[0m'

deploy_log()  { echo -e "${deploy_color_blue}$1${deploy_color_nc}"; }
deploy_ok()   { echo -e "${deploy_color_green}✓ $1${deploy_color_nc}"; }
deploy_warn() { echo -e "${deploy_color_yellow}⚠ $1${deploy_color_nc}"; }
deploy_err()  { echo -e "${deploy_color_red}✗ $1${deploy_color_nc}"; }

# cwd ممکن است ریشه یا پوشه backend باشد
deploy_normalize_project_dir() {
    local dir="$1"
    [ -z "$dir" ] && return 1
    if [ -f "$dir/backend/server.js" ] && [ -d "$dir/frontend" ]; then
        echo "$dir"
        return 0
    fi
    if [ -f "$dir/server.js" ] && [ -d "$(dirname "$dir")/frontend" ]; then
        echo "$(cd "$(dirname "$dir")" && pwd)"
        return 0
    fi
    return 1
}

# مسیر ریشه پروژه (backend/ و frontend/ داخلش)
deploy_find_project_dir() {
    local candidate dir

    # ۱) فایل تنظیم محلی (یک‌بار روی سرور بسازید)
    for cfg in \
        "${DEPLOY_CONFIG:-}" \
        "./deploy.config" \
        "$HOME/deploy.config" \
        "/etc/transport-app/deploy.config"
    do
        if [ -n "$cfg" ] && [ -f "$cfg" ]; then
            # shellcheck disable=SC1090
            source "$cfg"
            if [ -n "${PROJECT_DIR:-}" ] && [ -f "$PROJECT_DIR/backend/server.js" ]; then
                echo "$PROJECT_DIR"
                return 0
            fi
        fi
    done

    # ۲) محل همین اسکریپت / deploy.sh در ریشه گیت
    if [ -n "${BASH_SOURCE[1]:-}" ]; then
        candidate="$(cd "$(dirname "${BASH_SOURCE[1]}")/.." && pwd)"
        if [ -f "$candidate/backend/server.js" ] && [ -d "$candidate/frontend" ]; then
            echo "$candidate"
            return 0
        fi
    fi

    # ۳) cwd فعلی
    candidate="$(pwd)"
    if [ -f "$candidate/backend/server.js" ] && [ -d "$candidate/frontend" ]; then
        echo "$candidate"
        return 0
    fi

    # ۴) از PM2 (transport-backend)
    if command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
        local lib_dir
        lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        if [ -f "$lib_dir/pm2-project-path.js" ]; then
            dir="$(node "$lib_dir/pm2-project-path.js" 2>/dev/null || true)"
            if [ -n "$dir" ] && [ -f "$dir/backend/server.js" ]; then
                echo "$dir"
                return 0
            fi
        fi
        # fallback: pm2 describe (نسخه‌های قدیمی)
        dir="$(pm2 describe transport-backend 2>/dev/null | sed -n 's/.*│[[:space:]]*cwd[[:space:]]*│[[:space:]]*\([^│]*\).*/\1/p' | head -1 | xargs)"
        if [ -n "$dir" ]; then
            candidate="$(deploy_normalize_project_dir "$dir")"
            if [ -n "$candidate" ]; then
                echo "$candidate"
                return 0
            fi
        fi
        dir="$(pm2 describe transport-backend 2>/dev/null | sed -n 's/.*│[[:space:]]*script path[[:space:]]*│[[:space:]]*\([^│]*\).*/\1/p' | head -1 | xargs)"
        if [ -n "$dir" ]; then
            candidate="$(deploy_normalize_project_dir "$(dirname "$dir")")"
            if [ -n "$candidate" ]; then
                echo "$candidate"
                return 0
            fi
        fi
    fi

    # ۵) مسیرهای رایج
    for candidate in \
        "$HOME/project" \
        "/home/fms/project" \
        "/var/www/my-transport-app" \
        "/var/www/new_transport_app" \
        "$HOME/new_transport_app" \
        "$HOME/my-transport-app" \
        "$HOME/apps/new_transport_app" \
        "$HOME/apps/transport-app" \
        "/opt/new_transport_app" \
        "/opt/transport-app"
    do
        if [ -f "$candidate/backend/server.js" ] && [ -d "$candidate/frontend" ]; then
            echo "$candidate"
            return 0
        fi
    done

    # ۶) جستجوی سریع در home و /var/www
    for search_root in "$HOME" "/var/www" "/opt"; do
        [ -d "$search_root" ] || continue
        while IFS= read -r found; do
            candidate="$(deploy_normalize_project_dir "$(dirname "$found")" || true)"
            if [ -n "$candidate" ]; then
                echo "$candidate"
                return 0
            fi
        done < <(find "$search_root" -maxdepth 6 -path '*/backend/server.js' 2>/dev/null | head -5)
    done

    return 1
}

deploy_git_pull() {
    local branch="${1:-}"
    if [ ! -d ".git" ]; then
        deploy_err "این پوشه مخزن git نیست: $(pwd)"
        return 1
    fi
    if [ -z "$branch" ]; then
        branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo master)"
    fi
    deploy_log "git pull origin $branch ..."
    if git pull origin "$branch"; then
        deploy_ok "git pull انجام شد"
        return 0
    fi
    if [ "$branch" != "main" ] && git pull origin main; then
        deploy_ok "git pull (main) انجام شد"
        return 0
    fi
    if [ "$branch" != "master" ] && git pull origin master; then
        deploy_ok "git pull (master) انجام شد"
        return 0
    fi
    deploy_err "git pull ناموفق"
    return 1
}

deploy_pm2_restart() {
    if ! command -v pm2 >/dev/null 2>&1; then
        deploy_warn "PM2 نصب نیست — backend را دستی ری‌استارت کنید"
        return 0
    fi

    local project_dir="$1"
    cd "$project_dir" || return 1

    if pm2 describe transport-backend >/dev/null 2>&1; then
        deploy_log "pm2 restart transport-backend ..."
        pm2 restart transport-backend --update-env
        pm2 save 2>/dev/null || true
        deploy_ok "PM2 ری‌استارت شد"
        return 0
    fi

    if [ -f "$project_dir/ecosystem.config.js" ]; then
        deploy_log "راه‌اندازی PM2 با ecosystem.config.js ..."
        pm2 start "$project_dir/ecosystem.config.js"
        pm2 save 2>/dev/null || true
        deploy_ok "PM2 با ecosystem راه‌اندازی شد"
        return 0
    fi

    deploy_log "راه‌اندازی مستقیم backend/server.js ..."
    pm2 start "$project_dir/backend/server.js" --name transport-backend
    pm2 save 2>/dev/null || true
    deploy_ok "PM2 راه‌اندازی شد"
}

deploy_run_optional_migrations() {
    local backend_dir="$1"
    cd "$backend_dir" || return 0

    local migrations=(
        "migrations/create_bale_tables.js"
        "migrations/add_bale_report_recipients.js"
        "migrations/add_carrier_name_column.js"
        "migrations/create_support_tickets_table.js"
        "migrations/add_finance_rejection_columns.js"
        "migrations/ensure_freight_status_enum_values.js"
        "migrations/create_planning_manager_approval_permissions_table.js"
        "migrations/add_permission_type_to_planning_manager_approval_permissions.js"
    )

    for mig in "${migrations[@]}"; do
        if [ -f "$mig" ]; then
            deploy_log "migration: $mig"
            if node "$mig"; then
                deploy_ok "$mig"
            else
                deploy_warn "$mig — رد شد (شاید قبلاً اجرا شده)"
            fi
        fi
    done
}

# بعد از npm run build، dist را به مسیر سرو NGINX هم منتقل می‌کند (اگر با پروژه فرق دارد)
deploy_sync_frontend_dist() {
    local project_dir="$1"
    local nginx_dist="${NGINX_DIST_DIR:-}"

    if [ -z "$nginx_dist" ]; then
        return 0
    fi

    local source_dist="$project_dir/frontend/dist"
    if [ ! -d "$source_dist" ] || [ ! -f "$source_dist/index.html" ]; then
        deploy_warn "frontend/dist ساخته نشده — sync به NGINX رد شد"
        return 0
    fi

    local normalized_source
    local normalized_target
    normalized_source="$(cd "$source_dist" && pwd)"
    normalized_target="$(mkdir -p "$nginx_dist" && cd "$nginx_dist" && pwd)"

    if [ "$normalized_source" = "$normalized_target" ]; then
        deploy_ok "NGINX همان مسیر build است — sync لازم نیست"
        return 0
    fi

    deploy_log "sync frontend/dist → $nginx_dist ..."
    mkdir -p "$nginx_dist"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete "$source_dist/" "$nginx_dist/"
    else
        rm -rf "${nginx_dist:?}/"*
        cp -a "$source_dist/." "$nginx_dist/"
    fi
    deploy_ok "frontend به مسیر NGINX منتقل شد"
}

deploy_print_diagnostics() {
    deploy_err "مسیر پروژه پیدا نشد!"
    echo ""
    echo "روی سرور FMS این‌ها را بزنید:"
    echo ""
    echo "  pm2 describe transport-backend"
    echo "  pm2 show transport-backend | grep -E 'exec cwd|script path'"
    echo "  find ~ /var/www /opt -maxdepth 6 -path '*/backend/server.js' 2>/dev/null"
    echo ""
    echo "وقتی مسیر را پیدا کردید (مثلاً /home/fms/new_transport_app):"
    echo "  cd /مسیر/پروژه"
    echo "  cp deploy.config.example deploy.config"
    echo "  nano deploy.config          # PROJECT_DIR را همان مسیر بگذارید"
    echo "  bash deploy.sh"
    echo ""
    echo "اگر پروژه اصلاً clone نشده:"
    echo "  bash scripts/bootstrap-server.sh /home/fms/new_transport_app"
    echo ""
}
