# راهنمای نهایی حل مشکل Error 521 Cloudflare

## 🔍 مشکل شناسایی شده

✅ **سرور کار می‌کند:** از IP مستقیم (`51.178.41.12`) HTTP 200 برمی‌گرداند
✅ **Nginx کار می‌کند:** کانفیگ معتبر است و فایل‌ها serve می‌شوند
✅ **DNS درست است:** به IP های Cloudflare اشاره می‌کند (Proxy فعال است)
❌ **Cloudflare نمی‌تواند به سرور وصل شود:** Error 521

## 🎯 راه حل قطعی

### مرحله 1: تنظیم SSL Mode در Cloudflare

1. وارد پنل Cloudflare شوید: https://dash.cloudflare.com
2. دامنه `tpmhub.ir` را انتخاب کنید
3. بروید به **SSL/TLS** → **Overview**
4. **Encryption mode** را روی **"Flexible"** تنظیم کنید
   - ⚠️ **نه "Full"** یا **"Full (strict)"**
   - چون گواهی SSL روی سرور نداریم

### مرحله 2: بررسی DNS Records

1. بروید به **DNS** → **Records**
2. بررسی کنید:
   - **A record** برای `tpmhub.ir` → باید به `51.178.41.12` اشاره کند
   - **A record** برای `www.tpmhub.ir` → باید به `51.178.41.12` اشاره کند
   - **Proxy status** باید **"Proxied"** (ابر نارنجی) باشد

### مرحله 3: پاک کردن Cache

1. بروید به **Caching** → **Configuration**
2. کلیک کنید **"Purge Everything"**
3. یا **Custom Purge** → آدرس: `https://tpmhub.ir/*`

### مرحله 4: بررسی Firewall Rules

1. بروید به **Security** → **WAF**
2. مطمئن شوید که هیچ rule ای سرور را block نمی‌کند

### مرحله 5: صبر کنید

- DNS propagation: 5-15 دقیقه
- Cache clearing: 1-2 دقیقه
- SSL mode change: فوری

---

## 🧪 تست نهایی

بعد از انجام مراحل بالا:

1. **صبر کنید 10-15 دقیقه**
2. باز کردن: `https://tpmhub.ir`
3. اگر هنوز Error 521 می‌دهد:
   - بررسی کنید که SSL mode روی "Flexible" است
   - بررسی کنید که DNS records درست هستند
   - دوباره Cache را پاک کنید

---

## 🔧 اگر هنوز کار نکرد

### بررسی از داخل سرور:

```bash
# تست مستقیم
curl -I http://51.178.41.12

# باید HTTP 200 ببینید ✅
```

### بررسی از Cloudflare:

1. بروید به **Analytics** → **Web Traffic**
2. بررسی کنید که آیا درخواست‌ها به سرور می‌رسند یا نه

### بررسی لاگ‌های Nginx:

```bash
tail -f /var/log/nginx/access.log
# در مرورگر سایت را باز کنید
# باید لاگ درخواست‌ها را ببینید
```

---

## ✅ چک‌لیست نهایی

- [ ] SSL mode روی "Flexible" است
- [ ] DNS records به `51.178.41.12` اشاره می‌کنند
- [ ] Proxy status "Proxied" (ابر نارنجی) است
- [ ] Cache پاک شده است
- [ ] 10-15 دقیقه صبر کرده‌اید
- [ ] سایت را تست کرده‌اید

---

**موفق باشید! 🚀**

