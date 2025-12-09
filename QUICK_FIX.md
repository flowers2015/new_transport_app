# حل سریع مشکل Permission

## مشکل:
`-bash: ./update.sh: Permission denied`

## راه حل:

```bash
cd /var/www/my-transport-app
chmod +x update.sh
./update.sh
```

یا می‌توانید مستقیماً با bash اجرا کنید:

```bash
cd /var/www/my-transport-app
bash update.sh
```

---

## برای جلوگیری از این مشکل در آینده:

می‌توانید در اسکریپت `update.sh` در ابتدا این خط را اضافه کنید:

```bash
chmod +x "$0"  # این خط فایل را قابل اجرا می‌کند
```

یا در Git، فایل را با permission اجرا commit کنید:

```bash
git update-index --chmod=+x update.sh
git commit -m "Make update.sh executable"
```

