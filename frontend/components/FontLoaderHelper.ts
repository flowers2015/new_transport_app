/**
 * راه‌حل‌های مختلف برای لود کردن فونت B Homa
 * این فایل شامل چندین روش مختلف برای اطمینان از لود شدن فونت است
 */

// ============================================
// روش 1: استفاده از FontFace API با wait و retry
// ============================================
export const loadBHomaFontMethod1 = async (): Promise<boolean> => {
    try {
        // بررسی اینکه فونت قبلاً لود شده یا نه
        if (document.fonts.check("16px 'B Homa'")) {
            console.log('✅ [Method 1] فونت B Homa قبلاً لود شده');
            return true;
        }

        // استفاده از FontFace API
        if (typeof FontFace !== 'undefined') {
            console.log('🔄 [Method 1] در حال لود کردن فونت B Homa با FontFace API...');
            
            const fontFace = new FontFace(
                'B Homa',
                "url('https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2') format('woff2')",
                {
                    style: 'normal',
                    weight: '400',
                    display: 'block',
                    unicodeRange: 'U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC'
                }
            );

            await fontFace.load();
            document.fonts.add(fontFace);

            // انتظار برای اطمینان از لود شدن
            await document.fonts.ready;
            await new Promise(resolve => setTimeout(resolve, 1000));

            // بررسی مجدد
            const isLoaded = document.fonts.check("16px 'B Homa'");
            console.log(isLoaded ? '✅ [Method 1] فونت B Homa با موفقیت لود شد' : '❌ [Method 1] فونت B Homa لود نشد');
            return isLoaded;
        }

        return false;
    } catch (error) {
        console.error('❌ [Method 1] خطا:', error);
        return false;
    }
};

// ============================================
// روش 2: استفاده از link tag با wait برای load event
// ============================================
export const loadBHomaFontMethod2 = async (): Promise<boolean> => {
    return new Promise((resolve) => {
        // بررسی اینکه فونت قبلاً لود شده یا نه
        if (document.fonts.check("16px 'B Homa'")) {
            console.log('✅ [Method 2] فونت B Homa قبلاً لود شده');
            resolve(true);
            return;
        }

        console.log('🔄 [Method 2] در حال لود کردن فونت B Homa با link tag...');

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=B+Homa&display=block';
        
        link.onload = async () => {
            // انتظار برای لود شدن فونت
            await document.fonts.ready;
            await new Promise(r => setTimeout(r, 2000));
            
            const isLoaded = document.fonts.check("16px 'B Homa'");
            console.log(isLoaded ? '✅ [Method 2] فونت B Homa با موفقیت لود شد' : '❌ [Method 2] فونت B Homa لود نشد');
            resolve(isLoaded);
        };
        
        link.onerror = () => {
            console.error('❌ [Method 2] خطا در لود کردن link');
            resolve(false);
        };
        
        document.head.appendChild(link);
    });
};

// ============================================
// روش 3: استفاده از @font-face با base64 (نیاز به فایل فونت)
// ============================================
export const loadBHomaFontMethod3 = async (): Promise<boolean> => {
    try {
        // این روش نیاز به فایل فونت به صورت base64 دارد
        // می‌توانید فونت را از Google Fonts دانلود کنید و به base64 تبدیل کنید
        // یا از یک CDN دیگر استفاده کنید
        
        const style = document.createElement('style');
        style.textContent = `
            @font-face {
                font-family: 'B Homa';
                font-style: normal;
                font-weight: 400;
                font-display: block;
                src: url('https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2') format('woff2'),
                     url('https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff') format('woff');
                unicode-range: U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC;
            }
        `;
        document.head.appendChild(style);

        // انتظار برای لود شدن
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 2000));

        const isLoaded = document.fonts.check("16px 'B Homa'");
        console.log(isLoaded ? '✅ [Method 3] فونت B Homa با موفقیت لود شد' : '❌ [Method 3] فونت B Homa لود نشد');
        return isLoaded;
    } catch (error) {
        console.error('❌ [Method 3] خطا:', error);
        return false;
    }
};

// ============================================
// روش 4: استفاده از fetch برای دانلود فونت و تبدیل به blob
// ============================================
export const loadBHomaFontMethod4 = async (): Promise<boolean> => {
    try {
        if (typeof FontFace === 'undefined') {
            return false;
        }

        console.log('🔄 [Method 4] در حال دانلود فونت B Homa...');

        // دانلود فونت
        const response = await fetch('https://fonts.gstatic.com/s/bhoma/v1/ZgNSjPJFPrvJV5f16Sf4p-FBkHw.woff2');
        if (!response.ok) {
            throw new Error('Failed to fetch font');
        }

        const blob = await response.blob();
        const fontData = await blob.arrayBuffer();

        // ایجاد FontFace از blob
        const fontFace = new FontFace('B Homa', fontData, {
            style: 'normal',
            weight: '400',
            display: 'block',
        });

        await fontFace.load();
        document.fonts.add(fontFace);

        // انتظار برای اطمینان
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 1000));

        const isLoaded = document.fonts.check("16px 'B Homa'");
        console.log(isLoaded ? '✅ [Method 4] فونت B Homa با موفقیت لود شد' : '❌ [Method 4] فونت B Homa لود نشد');
        return isLoaded;
    } catch (error) {
        console.error('❌ [Method 4] خطا:', error);
        return false;
    }
};

// ============================================
// روش 5: ترکیبی - استفاده از همه روش‌ها به ترتیب
// ============================================
export const loadBHomaFontComprehensive = async (): Promise<boolean> => {
    const methods = [
        { name: 'Method 1 (FontFace API)', fn: loadBHomaFontMethod1 },
        { name: 'Method 4 (Fetch + Blob)', fn: loadBHomaFontMethod4 },
        { name: 'Method 3 (@font-face)', fn: loadBHomaFontMethod3 },
        { name: 'Method 2 (Link tag)', fn: loadBHomaFontMethod2 },
    ];

    for (const method of methods) {
        try {
            console.log(`🧪 Trying ${method.name}...`);
            const result = await method.fn();
            if (result) {
                console.log(`✅ ${method.name} succeeded!`);
                return true;
            }
        } catch (err) {
            console.error(`❌ ${method.name} failed:`, err);
        }
    }

    console.error('❌ همه روش‌ها ناموفق بودند');
    return false;
};

// ============================================
// تابع کمکی: بررسی و انتظار برای لود شدن فونت
// ============================================
export const waitForBHomaFont = async (maxWaitTime: number = 5000): Promise<boolean> => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        if (document.fonts.check("16px 'B Homa'")) {
            console.log('✅ [waitForBHomaFont] فونت B Homa آماده است');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn('⚠️ [waitForBHomaFont] فونت B Homa در زمان مشخص شده لود نشد');
    return false;
};

