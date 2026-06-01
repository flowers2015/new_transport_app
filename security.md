# 🔒 گزارش جامع امنیتی - سیستم مدیریت حمل و نقل

## 📋 فهرست مطالب
1. [خلاصه اجرایی](#خلاصه-اجرایی)
2. [نقاط قوت امنیتی](#نقاط-قوت-امنیتی)
3. [نقاط ضعف و ریسک‌های امنیتی](#نقاط-ضعف-و-ریسک‌های-امنیتی)
4. [بررسی دسته‌بندی‌های امنیتی](#بررسی-دسته‌بندی‌های-امنیتی)
5. [اقدامات ضروری قبل از استقرار](#اقدامات-ضروری-قبل-از-استقرار)
6. [چک‌لیست امنیتی](#چک‌لیست-امنیتی)

---

## 🎯 خلاصه اجرایی

این گزارش شامل بررسی جامع امنیتی سیستم مدیریت حمل و نقل است که برای استقرار روی سرور شرکت آماده می‌شود. این بررسی شامل تمام جنبه‌های امنیتی IT از جمله احراز هویت، رمزنگاری، مدیریت دسترسی، امنیت پایگاه داده، امنیت شبکه و موارد دیگر است.

**وضعیت کلی:** ⚠️ **نیاز به بهبود قبل از استقرار در محیط Production**

---

## 🛠️ فریم‌ورک‌ها و کتابخانه‌های استفاده شده

### Backend (Node.js)

#### فریم‌ورک اصلی:
- **Express.js** `^4.18.2` - فریم‌ورک اصلی وب سرور Node.js
- **Node.js** - Runtime محیط

#### امنیت و احراز هویت:
- **jsonwebtoken** `^9.0.2` - تولید و اعتبارسنجی JWT Tokens
- **bcryptjs** `^2.4.3` - هش کردن رمزهای عبور

#### پایگاه داده:
- **pg** `^8.11.3` - PostgreSQL Client برای Node.js (Connection Pool)

#### مدیریت فایل:
- **multer** `^2.0.2` - Middleware برای آپلود فایل (multipart/form-data)

#### ابزارهای کمکی:
- **dotenv** `^16.3.1` - مدیریت متغیرهای محیطی (.env)
- **cors** `^2.8.5` - مدیریت Cross-Origin Resource Sharing
- **compression** `^1.7.4` - فشرده‌سازی پاسخ‌های HTTP (Gzip)
- **jalaali-js** `^1.2.8` - تبدیل تاریخ میلادی به شمسی و برعکس
- **xlsx** `^0.18.5` - خواندن و نوشتن فایل‌های Excel

#### Development Tools:
- **nodemon** `^3.0.1` - Auto-restart سرور در Development

---

### Frontend (React)

#### فریم‌ورک اصلی:
- **React** `^19.1.1` - کتابخانه UI
- **React DOM** `^19.1.1` - رندر React در DOM
- **TypeScript** `~5.8.2` - زبان برنامه‌نویسی با Type Safety

#### Build Tools:
- **Vite** `^6.2.0` - Build Tool و Development Server (سریع‌تر از Webpack)
- **@vitejs/plugin-react** `^5.0.0` - پلاگین React برای Vite
- **terser** `^5.36.0` - Minification و Compression کد

#### استایل‌دهی:
- **Tailwind CSS** `^3.4.18` - فریم‌ورک CSS Utility-first
- **PostCSS** `^8.5.6` - پردازش CSS
- **autoprefixer** `^10.4.22` - افزودن Vendor Prefixes به CSS

#### تولید گزارش و PDF:
- **jspdf** `^3.0.3` - تولید فایل PDF
- **jspdf-autotable** `^3.8.3` - افزودن جداول به PDF
- **html2canvas** `^1.4.1` - تبدیل HTML به Canvas (برای PDF)
- **dom-to-image** `^2.6.0` - تبدیل DOM به تصویر

#### کار با فایل‌های Excel:
- **exceljs** `^4.4.0` - خواندن و نوشتن فایل‌های Excel (پیشرفته‌تر از xlsx)
- **xlsx** `^0.18.5` - خواندن و نوشتن فایل‌های Excel (ساده‌تر)

#### نمودار و تجسم داده:
- **recharts** `^3.3.0` - کتابخانه نمودار برای React

#### فشرده‌سازی:
- **jszip** `^3.10.1` - ایجاد و استخراج فایل‌های ZIP

#### Development Tools:
- **@types/node** `^22.14.0` - Type Definitions برای Node.js
- **baseline-browser-mapping** `^2.9.17` - نگاشت مرورگرها

---

### Infrastructure & Deployment

#### Web Server:
- **Nginx** - Reverse Proxy و Web Server (در Production)

#### Process Manager:
- **PM2** (ecosystem.config.js) - مدیریت Process های Node.js در Production

#### Database:
- **PostgreSQL** - پایگاه داده رابطه‌ای

---

### خلاصه Tech Stack:

```
Frontend Stack:
├── React 19 + TypeScript
├── Vite (Build Tool)
├── Tailwind CSS (Styling)
└── Various Libraries (PDF, Excel, Charts)

Backend Stack:
├── Node.js + Express.js
├── PostgreSQL (Database)
├── JWT (Authentication)
└── Various Middleware (CORS, Compression, Multer)

Infrastructure:
├── Nginx (Reverse Proxy)
├── PM2 (Process Manager)
└── PostgreSQL (Database Server)
```

---

### نکات مهم برای مدیر IT:

1. **نسخه‌های استفاده شده:**
   - React 19 (نسخه جدید - نیاز به بررسی Compatibility)
   - Express 4.18.2 (نسخه پایدار)
   - PostgreSQL Client 8.11.3 (نسخه پایدار)

2. **وابستگی‌های امنیتی:**
   - باید به صورت منظم `npm audit` اجرا شود
   - برخی کتابخانه‌ها ممکن است نیاز به به‌روزرسانی داشته باشند

3. **اندازه Bundle:**
   - Frontend از Code Splitting استفاده می‌کند (Lazy Loading)
   - کتابخانه‌های بزرگ (PDF, Excel, Charts) به صورت جداگانه Load می‌شوند

4. **Performance:**
   - Vite برای Build سریع‌تر استفاده می‌شود
   - Compression برای کاهش حجم Response ها
   - Connection Pool برای بهینه‌سازی Database Connections

---

## ✅ نقاط قوت امنیتی

### 1. احراز هویت و مدیریت دسترسی
- ✅ استفاده از **JWT (JSON Web Tokens)** برای احراز هویت
- ✅ استفاده از **bcryptjs** برای هش کردن رمزهای عبور
- ✅ پیاده‌سازی **Account Lockout** بعد از 5 تلاش ناموفق (قفل 15 دقیقه‌ای)
- ✅ سیستم **Role-Based Access Control (RBAC)** با دسترسی‌های مبتنی بر منو
- ✅ Middleware برای بررسی دسترسی‌ها در مسیرهای مختلف

### 2. امنیت پایگاه داده
- ✅ استفاده از **Parameterized Queries** (Prepared Statements) برای جلوگیری از SQL Injection
- ✅ استفاده از Connection Pool با محدودیت 20 اتصال همزمان
- ✅ تنظیم Timeout برای Query ها (30 ثانیه)
- ✅ مدیریت صحیح Connection Pool برای جلوگیری از Connection Leak

### 3. امنیت فایل‌ها
- ✅ استفاده از **Multer** برای مدیریت آپلود فایل
- ✅ محدودیت نوع فایل (فقط jpeg, jpg, png, gif, pdf)
- ✅ محدودیت اندازه فایل (50MB)
- ✅ استفاده از نام‌های تصادفی برای فایل‌های آپلود شده
- ✅ Sanitization نام پوشه‌ها برای جلوگیری از Path Traversal

### 4. امنیت HTTP Headers
- ✅ تنظیم **Content-Security-Policy (CSP)** برای جلوگیری از XSS
- ✅ تنظیم **X-Content-Type-Options: nosniff**
- ✅ تنظیم **X-Frame-Options: SAMEORIGIN** در Nginx
- ✅ تنظیم **X-XSS-Protection** در Nginx

### 5. امنیت CORS
- ✅ تنظیم Whitelist برای Origin های مجاز
- ✅ تنظیم `credentials: true` برای مدیریت صحیح Cookie ها

### 6. لاگ و Audit
- ✅ وجود Middleware برای Audit Log
- ✅ لاگ کردن خطاها (در حالت Development)

---

## ⚠️ نقاط ضعف و ریسک‌های امنیتی

### 🔴 ریسک‌های بحرانی (Critical)

#### 1. **عدم استفاده از HTTPS**
- **مشکل:** سرور فقط روی HTTP اجرا می‌شود (پورت 80)
- **ریسک:** 
  - تمام داده‌ها (رمزهای عبور، JWT tokens، اطلاعات حساس) به صورت Plain Text ارسال می‌شوند
  - امکان Man-in-the-Middle Attack
  - اطلاعات قابل رهگیری و دستکاری
- **تأثیر:** 🔴 **بسیار بالا** - می‌تواند منجر به افشای کامل اطلاعات شود
- **اقدام:** نصب SSL Certificate (Let's Encrypt) و فعال‌سازی HTTPS

#### 2. **رمزهای عبور و اطلاعات حساس در فایل‌های کد**
- **مشکل:** 
  - رمز عبور دیتابیس در `env.example`: `DB_PASSWORD="09144562267"`
  - JWT_SECRET با مقدار پیش‌فرض: `your_super_secret_jwt_key_here`
- **ریسک:**
  - اگر فایل `.env` به Git commit شود، اطلاعات حساس افشا می‌شود
  - استفاده از رمزهای عبور ضعیف
- **تأثیر:** 🔴 **بسیار بالا**
- **اقدام:** 
  - حذف تمام اطلاعات حساس از فایل‌های کد
  - استفاده از رمزهای عبور قوی
  - اطمینان از وجود `.env` در `.gitignore`

#### 3. **عدم Rate Limiting**
- **مشکل:** هیچ محدودیتی برای تعداد درخواست‌ها وجود ندارد
- **ریسک:**
  - امکان Brute Force Attack روی endpoint های احراز هویت
  - امکان DDoS Attack
  - سوء استفاده از منابع سرور
- **تأثیر:** 🔴 **بالا**
- **اقدام:** پیاده‌سازی Rate Limiting (مثلاً `express-rate-limit`)

#### 4. **عدم استفاده از Helmet.js**
- **مشکل:** Headers امنیتی به صورت دستی تنظیم شده‌اند
- **ریسک:**
  - ممکن است برخی Headers مهم فراموش شوند
  - عدم به‌روزرسانی خودکار
- **تأثیر:** 🟡 **متوسط**
- **اقدام:** استفاده از `helmet` برای مدیریت خودکار Security Headers

### 🟠 ریسک‌های مهم (High)

#### 5. **CORS Configuration ضعیف**
- **مشکل:** 
  - IP سرور به صورت Hard-coded: `http://51.178.41.12`
  - امکان تغییر IP و نیاز به تغییر کد
- **ریسک:** 
  - اگر IP تغییر کند، CORS کار نمی‌کند
  - امکان سوء استفاده اگر IP به دست مهاجم بیفتد
- **تأثیر:** 🟠 **متوسط**
- **اقدام:** استفاده از Environment Variables برای CORS Origins

#### 6. **عدم اعتبارسنجی کامل Input**
- **مشکل:** 
  - برخی Input ها فقط در Frontend اعتبارسنجی می‌شوند
  - عدم استفاده از کتابخانه‌های اعتبارسنجی (مثل `joi` یا `express-validator`)
- **ریسک:**
  - امکان ارسال داده‌های نامعتبر از طریق API
  - امکان Buffer Overflow یا سایر حملات
- **تأثیر:** 🟠 **متوسط**
- **اقدام:** پیاده‌سازی اعتبارسنجی کامل در Backend

#### 7. **عدم محدودیت دسترسی به فایل‌های آپلود شده**
- **مشکل:** 
  - فایل‌های آپلود شده به صورت Public در دسترس هستند
  - عدم بررسی دسترسی قبل از سرو کردن فایل
- **ریسک:**
  - امکان دسترسی به فایل‌های حساس توسط کاربران غیرمجاز
  - امکان Directory Listing
- **تأثیر:** 🟠 **متوسط**
- **اقدام:** 
  - بررسی دسترسی قبل از سرو کردن فایل
  - محدود کردن دسترسی به فایل‌ها

#### 8. **JWT Token Expiration طولانی**
- **مشکل:** Token ها 7 روز اعتبار دارند
- **ریسک:**
  - اگر Token به سرقت برود، مدت زیادی معتبر است
  - عدم امکان Revoke کردن Token
- **تأثیر:** 🟠 **متوسط**
- **اقدام:** 
  - کاهش زمان اعتبار Token (مثلاً 1-2 ساعت)
  - پیاده‌سازی Refresh Token
  - پیاده‌سازی Token Blacklist

#### 9. **عدم Logging امنیتی کافی**
- **مشکل:** 
  - لاگ‌ها فقط در Development نمایش داده می‌شوند
  - عدم Logging برای فعالیت‌های مشکوک
- **ریسک:**
  - عدم امکان تشخیص حملات
  - عدم امکان Audit Trail
- **تأثیر:** 🟠 **متوسط**
- **اقدام:** 
  - پیاده‌سازی Logging کامل برای Production
  - Logging فعالیت‌های امنیتی (ورود، تغییر رمز، و غیره)
  - استفاده از Log Rotation

### 🟡 ریسک‌های متوسط (Medium)

#### 10. **عدم استفاده از Session Management**
- **مشکل:** فقط JWT استفاده می‌شود، بدون Session Management
- **ریسک:** عدم امکان مدیریت Session ها
- **تأثیر:** 🟡 **پایین-متوسط**

#### 11. **عدم استفاده از CSRF Protection**
- **مشکل:** هیچ محافظتی در برابر CSRF وجود ندارد
- **ریسک:** امکان CSRF Attack
- **تأثیر:** 🟡 **پایین-متوسط** (به دلیل استفاده از JWT در Header)

#### 12. **عدم محدودیت اندازه Request Body**
- **مشکل:** فقط برای فایل‌ها محدودیت وجود دارد
- **ریسک:** امکان ارسال Request های بزرگ و ایجاد DoS
- **تأثیر:** 🟡 **پایین**

#### 13. **عدم استفاده از Database Encryption**
- **مشکل:** داده‌های حساس در دیتابیس رمزنگاری نشده‌اند
- **ریسک:** اگر دیتابیس به سرقت برود، اطلاعات قابل خواندن است
- **تأثیر:** 🟡 **پایین** (بستگی به حساسیت داده‌ها دارد)

#### 14. **عدم استفاده از API Versioning مناسب**
- **مشکل:** Versioning فقط در URL وجود دارد (`/api/v1/`)
- **ریسک:** مشکل در به‌روزرسانی و مدیریت نسخه‌ها
- **تأثیر:** 🟡 **پایین**

---

## 🔍 بررسی دسته‌بندی‌های امنیتی

### 1. امنیت شبکه (Network Security)

#### وضعیت فعلی:
- ❌ **HTTPS فعال نیست** - فقط HTTP
- ✅ Nginx به عنوان Reverse Proxy استفاده می‌شود
- ⚠️ Firewall Configuration بررسی نشده
- ⚠️ DDoS Protection وجود ندارد

#### اقدامات لازم:
1. **فعال‌سازی HTTPS:**
   ```bash
   # نصب Certbot
   sudo apt-get install certbot python3-certbot-nginx
   
   # دریافت SSL Certificate
   sudo certbot --nginx -d tpmhub.ir -d www.tpmhub.ir
   
   # تنظیم Auto-renewal
   sudo certbot renew --dry-run
   ```

2. **تنظیم Firewall:**
   ```bash
   # فقط پورت‌های لازم را باز کنید
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw enable
   ```

3. **استفاده از Cloudflare:**
   - DDoS Protection
   - WAF (Web Application Firewall)
   - Rate Limiting

### 2. امنیت احراز هویت (Authentication Security)

#### وضعیت فعلی:
- ✅ استفاده از JWT
- ✅ استفاده از bcrypt برای Hash کردن رمزها
- ✅ Account Lockout
- ⚠️ Token Expiration طولانی (7 روز)
- ❌ عدم استفاده از Refresh Token
- ❌ عدم استفاده از 2FA

#### اقدامات لازم:
1. **کاهش زمان اعتبار Token:**
   ```javascript
   // تغییر از 7 روز به 1 ساعت
   const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
   ```

2. **پیاده‌سازی Refresh Token:**
   - ایجاد جدول `refresh_tokens` در دیتابیس
   - پیاده‌سازی endpoint `/api/v1/auth/refresh`
   - ذخیره Refresh Token در HttpOnly Cookie

3. **پیاده‌سازی 2FA (اختیاری):**
   - استفاده از TOTP (Time-based One-Time Password)
   - ارسال کد از طریق SMS یا Email

### 3. امنیت دسترسی (Authorization Security)

#### وضعیت فعلی:
- ✅ Role-Based Access Control (RBAC)
- ✅ Menu-based Permissions
- ⚠️ عدم بررسی Resource-level Permissions
- ⚠️ عدم بررسی Ownership

#### اقدامات لازم:
1. **پیاده‌سازی Resource-level Authorization:**
   - بررسی اینکه کاربر فقط به منابع خودش دسترسی دارد
   - بررسی Branch-level Permissions

2. **پیاده‌سازی Ownership Checks:**
   - بررسی اینکه کاربر فقط می‌تواند منابع خودش را ویرایش/حذف کند

### 4. امنیت پایگاه داده (Database Security)

#### وضعیت فعلی:
- ✅ استفاده از Parameterized Queries
- ✅ Connection Pool
- ⚠️ عدم استفاده از Database Encryption
- ⚠️ عدم استفاده از Database Backup Encryption
- ❌ عدم استفاده از Database User با حداقل دسترسی

#### اقدامات لازم:
1. **ایجاد Database User با حداقل دسترسی:**
   ```sql
   -- ایجاد کاربر فقط برای اپلیکیشن
   CREATE USER transport_app_user WITH PASSWORD 'strong_password_here';
   GRANT CONNECT ON DATABASE transport_app TO transport_app_user;
   GRANT USAGE ON SCHEMA public TO transport_app_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO transport_app_user;
   ```

2. **فعال‌سازی SSL برای Database Connection:**
   ```javascript
   const pool = new Pool({
     // ... other config
     ssl: {
       rejectUnauthorized: false // در Production باید true باشد
     }
   });
   ```

3. **رمزنگاری داده‌های حساس:**
   - استفاده از `pgcrypto` برای رمزنگاری ستون‌های حساس
   - یا استفاده از Application-level Encryption

4. **Backup Encryption:**
   - رمزنگاری Backup های دیتابیس
   - ذخیره Backup در مکان امن

### 5. امنیت فایل‌ها (File Security)

#### وضعیت فعلی:
- ✅ محدودیت نوع فایل
- ✅ محدودیت اندازه فایل
- ⚠️ عدم بررسی دسترسی قبل از سرو کردن فایل
- ⚠️ عدم اسکن ویروس
- ❌ عدم محدودیت دسترسی به فایل‌ها

#### اقدامات لازم:
1. **بررسی دسترسی قبل از سرو کردن فایل:**
   ```javascript
   app.get('/uploads/:path(*)', authenticateToken, async (req, res) => {
     // بررسی دسترسی کاربر به فایل
     // فقط اگر کاربر دسترسی دارد، فایل را سرو کن
   });
   ```

2. **اسکن ویروس:**
   - استفاده از ClamAV یا سرویس‌های مشابه
   - اسکن فایل‌های آپلود شده قبل از ذخیره

3. **محدود کردن دسترسی فایل‌ها:**
   - تنظیم Permission های مناسب (مثلاً 600)
   - قرار دادن فایل‌ها خارج از Document Root

### 6. امنیت API (API Security)

#### وضعیت فعلی:
- ✅ استفاده از JWT برای Authentication
- ✅ CORS Configuration
- ❌ عدم Rate Limiting
- ❌ عدم API Key Management
- ⚠️ عدم اعتبارسنجی کامل Input

#### اقدامات لازم:
1. **پیاده‌سازی Rate Limiting:**
   ```javascript
   const rateLimit = require('express-rate-limit');
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 دقیقه
     max: 100 // حداکثر 100 درخواست
   });
   
   app.use('/api/', limiter);
   ```

2. **اعتبارسنجی Input:**
   ```javascript
   const { body, validationResult } = require('express-validator');
   
   router.post('/login', [
     body('username').isLength({ min: 3, max: 50 }),
     body('password').isLength({ min: 8 })
   ], login);
   ```

3. **API Versioning:**
   - مدیریت نسخه‌های مختلف API
   - Deprecation Strategy

### 7. امنیت Frontend (Frontend Security)

#### وضعیت فعلی:
- ✅ استفاده از React (XSS Protection)
- ✅ Content Security Policy
- ⚠️ استفاده از `unsafe-inline` و `unsafe-eval` در CSP
- ❌ عدم استفاده از Subresource Integrity (SRI)

#### اقدامات لازم:
1. **بهبود CSP:**
   - حذف `unsafe-inline` و `unsafe-eval`
   - استفاده از Nonce یا Hash برای Inline Scripts

2. **استفاده از SRI:**
   ```html
   <script src="https://example.com/script.js"
           integrity="sha384-..."
           crossorigin="anonymous"></script>
   ```

3. **Sanitization Input در Frontend:**
   - استفاده از DOMPurify برای Sanitize کردن HTML

### 8. امنیت سرور (Server Security)

#### وضعیت فعلی:
- ✅ استفاده از PM2 برای Process Management
- ⚠️ عدم بررسی تنظیمات سرور
- ❌ عدم استفاده از Fail2Ban
- ❌ عدم بررسی Log Files

#### اقدامات لازم:
1. **نصب و تنظیم Fail2Ban:**
   ```bash
   sudo apt-get install fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

2. **تنظیمات امنیتی سرور:**
   - غیرفعال کردن Root Login
   - استفاده از SSH Keys به جای Password
   - تنظیمات مناسب برای SELinux/AppArmor

3. **مانیتورینگ:**
   - نصب و تنظیم Monitoring Tools (مثلاً Prometheus, Grafana)
   - Alerting برای فعالیت‌های مشکوک

### 9. امنیت Dependency (Dependency Security)

#### وضعیت فعلی:
- ⚠️ عدم بررسی منظم Vulnerabilities
- ❌ عدم استفاده از Dependabot یا Snyk

#### اقدامات لازم:
1. **بررسی منظم Vulnerabilities:**
   ```bash
   npm audit
   npm audit fix
   ```

2. **استفاده از Dependabot:**
   - فعال‌سازی Dependabot در GitHub
   - بررسی خودکار و به‌روزرسانی Dependencies

3. **استفاده از Snyk:**
   - اسکن منظم برای Vulnerabilities
   - Integration با CI/CD

### 10. امنیت Backup (Backup Security)

#### وضعیت فعلی:
- ⚠️ وجود فایل `BACKUP_DATABASE.md` اما عدم بررسی کامل
- ❌ عدم بررسی Encryption Backup ها
- ❌ عدم بررسی Offsite Backup

#### اقدامات لازم:
1. **رمزنگاری Backup ها:**
   - استفاده از GPG یا ابزارهای مشابه
   - ذخیره Key های رمزنگاری در مکان امن

2. **Offsite Backup:**
   - ذخیره Backup در مکان جداگانه
   - استفاده از Cloud Storage (با Encryption)

3. **بررسی منظم Backup ها:**
   - تست Restore منظم
   - بررسی Integrity Backup ها

---

## 🚨 اقدامات ضروری قبل از استقرار

### اولویت 1 (Critical - باید فوراً انجام شود):

1. **✅ فعال‌سازی HTTPS:**
   - نصب SSL Certificate
   - Redirect HTTP به HTTPS
   - تنظیم HSTS

2. **✅ حذف اطلاعات حساس از کد:**
   - حذف رمزهای عبور از `env.example`
   - تغییر JWT_SECRET به مقدار قوی و تصادفی
   - اطمینان از وجود `.env` در `.gitignore`

3. **✅ پیاده‌سازی Rate Limiting:**
   - نصب `express-rate-limit`
   - تنظیم Rate Limit برای تمام API endpoints
   - تنظیم Rate Limit خاص برای Login endpoint

4. **✅ بهبود JWT Security:**
   - کاهش زمان اعتبار Token به 1-2 ساعت
   - پیاده‌سازی Refresh Token
   - ذخیره Refresh Token در HttpOnly Cookie

### اولویت 2 (High - باید در هفته اول انجام شود):

5. **✅ نصب و تنظیم Helmet.js:**
   ```bash
   npm install helmet
   ```
   ```javascript
   const helmet = require('helmet');
   app.use(helmet());
   ```

6. **✅ بهبود Input Validation:**
   - نصب `express-validator` یا `joi`
   - اعتبارسنجی تمام Input ها در Backend

7. **✅ بهبود File Upload Security:**
   - بررسی دسترسی قبل از سرو کردن فایل
   - اسکن ویروس برای فایل‌های آپلود شده

8. **✅ تنظیم Firewall:**
   - باز کردن فقط پورت‌های لازم
   - بستن پورت‌های غیرضروری

### اولویت 3 (Medium - باید در ماه اول انجام شود):

9. **✅ بهبود Logging:**
   - پیاده‌سازی Logging کامل برای Production
   - Logging فعالیت‌های امنیتی
   - تنظیم Log Rotation

10. **✅ بهبود Database Security:**
    - ایجاد Database User با حداقل دسترسی
    - فعال‌سازی SSL برای Database Connection
    - رمزنگاری داده‌های حساس

11. **✅ نصب Fail2Ban:**
    - محافظت در برابر Brute Force Attacks
    - تنظیم Rules مناسب

12. **✅ بهبود CSP:**
    - حذف `unsafe-inline` و `unsafe-eval`
    - استفاده از Nonce یا Hash

---

## ✅ چک‌لیست امنیتی

### قبل از استقرار:

- [ ] HTTPS فعال و SSL Certificate نصب شده
- [ ] تمام اطلاعات حساس از کد حذف شده
- [ ] `.env` در `.gitignore` قرار دارد
- [ ] JWT_SECRET به مقدار قوی تغییر کرده
- [ ] Rate Limiting پیاده‌سازی شده
- [ ] Helmet.js نصب و تنظیم شده
- [ ] Input Validation کامل در Backend
- [ ] Firewall تنظیم شده
- [ ] Database User با حداقل دسترسی ایجاد شده
- [ ] Backup Encryption فعال شده
- [ ] Logging کامل پیاده‌سازی شده
- [ ] Fail2Ban نصب شده
- [ ] Dependencies به‌روز و بدون Vulnerability
- [ ] CSP بهبود یافته
- [ ] File Upload Security بهبود یافته

### بعد از استقرار:

- [ ] مانیتورینگ فعال است
- [ ] Alerting برای فعالیت‌های مشکوک تنظیم شده
- [ ] Backup ها به صورت منظم گرفته می‌شوند
- [ ] تست Restore انجام شده
- [ ] Security Audit منظم برنامه‌ریزی شده
- [ ] Penetration Testing انجام شده
- [ ] Incident Response Plan آماده است

---

## 📚 منابع و مراجع

### مستندات امنیتی:
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

### ابزارهای امنیتی:
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Snyk](https://snyk.io/)
- [OWASP ZAP](https://www.zaproxy.org/)
- [Burp Suite](https://portswigger.net/burp)

---

## 📝 نتیجه‌گیری

این سیستم دارای پایه‌های امنیتی خوبی است (JWT، bcrypt، Parameterized Queries، و غیره)، اما برای استقرار در محیط Production نیاز به بهبودهای مهمی دارد. مهم‌ترین اقدامات عبارتند از:

1. **فعال‌سازی HTTPS** (اولویت اول)
2. **حذف اطلاعات حساس از کد** (اولویت اول)
3. **پیاده‌سازی Rate Limiting** (اولویت اول)
4. **بهبود JWT Security** (اولویت اول)

با انجام این اقدامات، سیستم آماده استقرار در محیط Production خواهد بود. توصیه می‌شود قبل از استقرار، یک Security Audit کامل توسط یک متخصص امنیت انجام شود.

---

**تاریخ بررسی:** $(date)  
**نسخه:** 1.0  
**وضعیت:** نیاز به بهبود قبل از Production

