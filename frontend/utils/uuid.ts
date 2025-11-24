/**
 * Polyfill for crypto.randomUUID()
 * برای مرورگرهایی که از crypto.randomUUID پشتیبانی نمی‌کنند
 * این polyfill در همه محیط‌ها (localhost و production) کار می‌کند
 */

// تابع داخلی برای تولید UUID - مستقیماً UUID را تولید می‌کند بدون چک کردن crypto.randomUUID
// این تابع هرگز crypto.randomUUID را صدا نمی‌زند
function generateUUIDInternal(): string {
  // UUID v4 را به صورت دستی تولید کن
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// بررسی اینکه آیا crypto.randomUUID native است (فقط یک بار در زمان load)
// این بررسی قبل از assign کردن polyfill انجام می‌شود
let hasNativeRandomUUID = false;
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
  try {
    // بررسی کن که آیا این تابع ما نیست
    const funcStr = crypto.randomUUID.toString();
    // اگر تابع شامل کد polyfill ما نباشد، native است
    if (!funcStr.includes('generateUUIDInternal') && 
        !funcStr.includes('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx') &&
        !funcStr.includes('Math.random() * 16')) {
      hasNativeRandomUUID = true;
    }
  } catch (e) {
    // اگر خطا داد، native نیست
    hasNativeRandomUUID = false;
  }
}

// تابع اصلی که export می‌شود
export function generateUUID(): string {
  // اگر native implementation موجود است، از آن استفاده کن
  if (hasNativeRandomUUID && typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // اگر خطا داد، از polyfill استفاده کن
      return generateUUIDInternal();
    }
  }
  
  // در غیر این صورت، از polyfill استفاده کن
  return generateUUIDInternal();
}

// Polyfill برای crypto.randomUUID اگر موجود نباشد
// مهم: باید generateUUIDInternal را assign کنیم، نه generateUUID را
// تا از infinite loop جلوگیری شود
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  try {
    Object.defineProperty(crypto, 'randomUUID', {
      value: generateUUIDInternal,
      writable: false,
      configurable: false,
      enumerable: false
    });
  } catch (e) {
    // اگر defineProperty کار نکرد، از روش ساده‌تر استفاده کن
    (crypto as any).randomUUID = generateUUIDInternal;
  }
}

