# راهنمای نصب Tailwind CSS در Ubuntu Server

## پیش‌نیازها
- Node.js و npm باید نصب باشند
- پروژه باید در سرور موجود باشد

## دستورات نصب در Ubuntu

### 1. رفتن به پوشه frontend
```bash
cd /path/to/your/project/frontend
```

### 2. نصب Tailwind CSS و dependencies (نسخه 3)
```bash
npm install -D tailwindcss@^3.4.0 postcss autoprefixer
```

**نکته مهم**: باید Tailwind CSS نسخه 3 نصب شود، نه نسخه 4. نسخه 4 ساختار متفاوتی دارد.

### 3. ایجاد فایل‌های پیکربندی (اگر وجود ندارند)
```bash
npx tailwindcss init -p
```

### 4. بررسی نصب
```bash
npm list tailwindcss postcss autoprefixer
```

## فایل‌های مورد نیاز

### tailwind.config.js
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

### postcss.config.js
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**نکته مهم**: اگر `package.json` شما دارای `"type": "module"` است، باید از `export default` استفاده کنید. در غیر این صورت از `module.exports` استفاده کنید یا فایل را به `.cjs` تغییر نام دهید.

### index.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');

body {
  font-family: 'Vazirmatn', sans-serif;
}

@keyframes blink {
  50% { opacity: 0; }
}

.blinking-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background-color: #22c55e;
  border-radius: 50%;
  animation: blink 1.5s linear infinite;
}
```

## نکات مهم

1. **حذف Tailwind CDN**: باید `<script src="https://cdn.tailwindcss.com"></script>` را از `index.html` حذف کنید
2. **Import CSS**: باید `import './index.css';` را به `index.tsx` اضافه کنید
3. **Build**: بعد از نصب، پروژه را build کنید: `npm run build`

## حجم نصب
- Tailwind CSS: ~3.5 MB
- PostCSS: ~1-2 MB
- Autoprefixer: ~1-2 MB
- **کل: ~5-7 MB**

## بررسی نصب موفق
بعد از نصب و build، اگر Tailwind به درستی کار کند:
- استایل‌های Tailwind باید اعمال شوند
- خطاهای CSP مربوط به Tailwind CDN برطرف می‌شوند
- صفحه لاگین باید به درستی نمایش داده شود

