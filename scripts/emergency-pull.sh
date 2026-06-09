#!/bin/bash
# آپدیت اضطراری — فقط به PM2 و git وابسته است (بدون deploy.sh جدید)
#   bash scripts/emergency-pull.sh

set -euo pipefail

echo "جستجوی مسیر از PM2 ..."
PROJECT_DIR=$(node -e "
const {execSync}=require('child_process');
const fs=require('fs');const p=require('path');
const list=JSON.parse(execSync('pm2 jlist',{encoding:'utf8'}));
const app=list.find(a=>a.name==='transport-backend');
if(!app){console.error('transport-backend در PM2 نیست');process.exit(1);}
const cwd=app.pm2_env&&app.pm2_env.pm_cwd;
const script=app.pm2_env&&app.pm2_env.pm_exec_path;
function root(d){
  if(!d)return null;
  if(fs.existsSync(p.join(d,'backend/server.js'))&&fs.existsSync(p.join(d,'frontend')))return d;
  const u=p.dirname(d);
  if(fs.existsSync(p.join(u,'backend/server.js'))&&fs.existsSync(p.join(u,'frontend')))return u;
  return null;
}
const r=root(cwd)||(script?root(p.dirname(script)):null);
if(!r){console.error('ریشه پروژه پیدا نشد');process.exit(1);}
console.log(r);
")

echo "مسیر: $PROJECT_DIR"
cd "$PROJECT_DIR"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo master)
echo "git pull origin $BRANCH ..."
git pull origin "$BRANCH" || git pull origin main || git pull origin master

echo "backend ..."
cd backend && npm install

if [ -d "$PROJECT_DIR/frontend" ]; then
  echo "frontend ..."
  cd "$PROJECT_DIR/frontend" && npm install && npm run build
fi

echo "pm2 restart ..."
pm2 restart transport-backend --update-env
pm2 save 2>/dev/null || true
pm2 status

echo "تمام."
