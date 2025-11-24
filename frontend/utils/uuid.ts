/**
 * Polyfill for crypto.randomUUID()
 * برای مرورگرهایی که از crypto.randomUUID پشتیبانی نمی‌کنند
 */

// تابع داخلی برای تولید UUID - مستقیماً UUID را تولید می‌کند بدون چک کردن crypto.randomUUID
function generateUUIDInternal(): string {
  // UUID v4 را به صورت دستی تولید کن
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// بررسی اینکه آیا crypto.randomUUID native است (قبل از assign کردن polyfill)
const hasNativeRandomUUID = typeof crypto !== 'undefined' && 
  typeof crypto.randomUUID === 'function' &&
  // بررسی کن که آیا این تابع ما نیست
  !crypto.randomUUID.toString().includes('generateUUIDInternal') &&
  !crypto.randomUUID.toString().includes('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');

// تابع اصلی که export می‌شود
export function generateUUID(): string {
  // اگر native implementation موجود است، از آن استفاده کن
  if (hasNativeRandomUUID) {
    return crypto.randomUUID();
  }
  
  // در غیر این صورت، از polyfill استفاده کن
  return generateUUIDInternal();
}

// Polyfill برای crypto.randomUUID اگر موجود نباشد
// مهم: باید generateUUIDInternal را assign کنیم، نه generateUUID را
// تا از infinite loop جلوگیری شود
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: generateUUIDInternal,
    writable: false,
    configurable: false
  });
}

