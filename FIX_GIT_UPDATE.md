# حل مشکل Git در آپدیت سرور

## مشکل:
Git نمی‌تواند فایل `update.sh` را merge کند چون تغییرات local دارد.

## راه حل‌ها:

### روش 1: Stash کردن تغییرات (پیشنهادی) ⭐

```bash
cd /var/www/my-transport-app
git stash
./update.sh
```

اگر بعداً نیاز به تغییرات local داشتید:
```bash
git stash pop
```

### روش 2: Reset کردن فایل و گرفتن از remote

```bash
cd /var/www/my-transport-app
git checkout -- update.sh
git pull origin master
./update.sh
```

### روش 3: Commit کردن تغییرات local

```bash
cd /var/www/my-transport-app
git add update.sh
git commit -m "Update update.sh with finalize_permissions migration"
git pull origin master
# اگر conflict بود، resolve کنید
./update.sh
```

### روش 4: Force pull (اگر تغییرات local مهم نیستند)

```bash
cd /var/www/my-transport-app
git reset --hard origin/master
./update.sh
```

⚠️ **هشدار:** این روش تمام تغییرات local را پاک می‌کند!

---

## توصیه:

از **روش 1 (stash)** استفاده کنید چون:
- تغییرات local را نگه می‌دارد
- سریع و امن است
- می‌توانید بعداً تغییرات را برگردانید

