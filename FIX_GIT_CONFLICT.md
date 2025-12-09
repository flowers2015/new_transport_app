# رفع مشکل Git Conflict

## 🔧 راه‌حل سریع

### روش 1: Stash کردن تغییرات محلی (پیشنهادی)
```bash
cd /var/www/my-transport-app
git stash
git pull origin master
bash update.sh
```

### روش 2: Commit کردن تغییرات محلی
```bash
cd /var/www/my-transport-app
git add fix_nginx_gzip.sh
git commit -m "Fix duplicate directive in fix_nginx_gzip.sh"
git pull origin master
# اگر conflict داشت، merge کنید
bash update.sh
```

### روش 3: Overwrite کردن با تغییرات remote
```bash
cd /var/www/my-transport-app
git checkout -- fix_nginx_gzip.sh
git pull origin master
bash update.sh
```

---

## ⚠️ توصیه

**روش 1 (Stash)** پیشنهاد می‌شود چون:
- تغییرات محلی حفظ می‌شوند
- بعداً می‌توانید آنها را بازگردانید
- سریع‌تر است

---

## 🚀 بعد از رفع Conflict

1. **اجرای update.sh:**
   ```bash
   bash update.sh
   ```

2. **اجرای fix_nginx_duplicate.sh:**
   ```bash
   chmod +x fix_nginx_duplicate.sh
   sudo bash fix_nginx_duplicate.sh
   ```

3. **بررسی NGINX:**
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

