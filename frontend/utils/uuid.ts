/**
 * Polyfill for crypto.randomUUID()
 * برای مرورگرهایی که از crypto.randomUUID پشتیبانی نمی‌کنند
 */

export function generateUUID(): string {
  // اگر crypto.randomUUID موجود است، از آن استفاده کن
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // در غیر این صورت، UUID v4 را به صورت دستی تولید کن
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Polyfill برای crypto.randomUUID اگر موجود نباشد
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  (crypto as any).randomUUID = generateUUID;
}

