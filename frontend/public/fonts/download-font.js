// اسکریپت ساده برای دانلود فونت B Homa
// این فایل را در مرورگر باز کنید (یا با Node.js اجرا کنید) تا فونت دانلود شود

// برای استفاده در مرورگر:
// 1. این فایل را باز کنید
// 2. در Console مرورگر (F12) این کد را اجرا کنید:

const fontUrl = 'https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2';
const fileName = 'B-Homa.woff2';

// در مرورگر:
fetch(fontUrl)
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        console.log('✅ فونت با موفقیت دانلود شد:', fileName);
    })
    .catch(err => {
        console.error('❌ خطا در دانلود فونت:', err);
    });

// برای استفاده با Node.js (در ترمینال):
// node download-font.js
// نیاز به نصب: npm install node-fetch

// اگر node-fetch نصب شده:
// const fetch = require('node-fetch');
// const fs = require('fs');
// 
// fetch(fontUrl)
//     .then(response => response.buffer())
//     .then(buffer => {
//         fs.writeFileSync(fileName, buffer);
//         console.log('✅ فونت با موفقیت دانلود شد:', fileName);
//     })
//     .catch(err => {
//         console.error('❌ خطا در دانلود فونت:', err);
//     });

