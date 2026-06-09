# راهنمای Deploy روی سرور (FMS و سایر سرورها)

مسیر `/var/www/my-transport-app` روی همه سرورها یکسان نیست.  
روی سرور **FMS-Mihan** پروژه احتمالاً جای دیگری است (مثلاً `/home/fms/new_transport_app`).

---

## قدم ۱ — پیدا کردن مسیر واقعی پروژه

روی سرور به‌عنوان کاربر `fms`:

```bash
pm2 describe transport-backend
```

خطوط **exec cwd** یا **script path** را ببینید. مثال:

- `script path` → `/home/fms/new_transport_app/backend/server.js`
- پس مسیر پروژه = `/home/fms/new_transport_app`

یا:

```bash
find ~ /var/www /opt -maxdepth 6 -path '*/backend/server.js' 2>/dev/null
```

---

## قدم ۲ — یک‌بار تنظیم مسیر (deploy.config)

```bash
cd /home/fms/new_transport_app    # مسیر واقعی خودتان

cp deploy.config.example deploy.config
nano deploy.config
```

مقدار `PROJECT_DIR` را همان مسیر بگذارید:

```
PROJECT_DIR="/home/fms/new_transport_app"
BUILD_FRONTEND=true
RUN_MIGRATIONS=true
```

ذخیره و خروج.

---

## قدم ۳ — آپدیت (بعد از هر تغییر در گیت)

```bash
cd /home/fms/new_transport_app
bash deploy.sh
```

یا از هر مسیری:

```bash
bash /home/fms/new_transport_app/scripts/transport-deploy.sh
```

یا یک‌بار برای راحتی:

```bash
cp /home/fms/new_transport_app/scripts/transport-deploy.sh ~/transport-deploy.sh
chmod +x ~/transport-deploy.sh
~/transport-deploy.sh
```

---

## اگر هنوز deploy.sh جدید را ندارید (فقط PM2 کار می‌کند)

این یک‌خط را بزنید — مسیر را از PM2 می‌گیرد و pull می‌کند:

```bash
PROJECT_DIR=$(node -e "
const {execSync}=require('child_process');
const fs=require('fs');const p=require('path');
const list=JSON.parse(execSync('pm2 jlist',{encoding:'utf8'}));
const app=list.find(a=>a.name==='transport-backend');
if(!app)throw new Error('transport-backend not in pm2');
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
if(!r)throw new Error('project root not found');
console.log(r);
") && cd "$PROJECT_DIR" && git pull && cd backend && npm install && cd ../frontend && npm install && npm run build && cd .. && pm2 restart transport-backend --update-env && pm2 save
```

---

## نصب اولیه (اگر پروژه اصلاً clone نشده)

```bash
bash scripts/bootstrap-server.sh /home/fms/new_transport_app
```

بعد `.env` را تنظیم کنید:

```bash
nano /home/fms/new_transport_app/backend/.env
```

---

## عیب‌یابی

| مشکل | راه‌حل |
|------|--------|
| `No such file or directory` برای `/var/www/...` | مسیر اشتباه است — قدم ۱ |
| `not a git repository` | در پوشه اشتباه هستید — `cd` به مسیر پروژه |
| `ecosystem.config.js not found` | از داخل ریشه پروژه: `pm2 start ecosystem.config.js` |
| بعد از reboot بالا نمی‌آید | `pm2 save` و `pm2 startup` |

```bash
pm2 status
pm2 logs transport-backend --lines 50 --nostream
bash scripts/detect-server-path.sh
```
