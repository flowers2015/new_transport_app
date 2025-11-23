/**
 * API Configuration
 * 
 * این فایل آدرس پایه API را از متغیرهای محیطی می‌خواند.
 * در محیط توسعه: VITE_API_BASE_URL=http://localhost:3000/api/v1
 * در محیط پروداکشن: VITE_API_BASE_URL=/api/v1
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

/**
 * تابع کمکی برای ساخت URL کامل API
 * @param endpoint - مسیر endpoint (مثلاً '/freight-announcements' یا 'freight-announcements')
 * @returns URL کامل برای درخواست API
 */
export const getApiUrl = (endpoint: string): string => {
  // حذف اسلش اولیه اگر وجود دارد
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  
  // اگر API_BASE_URL با اسلش تمام می‌شود، اسلش اضافی اضافه نکن
  const baseUrl = API_BASE_URL.endsWith('/') 
    ? API_BASE_URL.slice(0, -1) 
    : API_BASE_URL;
  
  return `${baseUrl}/${cleanEndpoint}`;
};

/**
 * تابع کمکی برای ساخت URL فایل‌های استاتیک (تصاویر، فایل‌ها)
 * در محیط توسعه: از آدرس کامل استفاده می‌کند
 * در محیط پروداکشن: از آدرس نسبی استفاده می‌کند
 * @param filePath - مسیر فایل (مثلاً 'uploads/file.jpg')
 * @returns URL کامل برای دسترسی به فایل
 */
export const getFileUrl = (filePath: string): string => {
  if (!filePath) return '';
  
  // حذف اسلش اولیه اگر وجود دارد
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  
  // اگر در محیط پروداکشن هستیم (آدرس نسبی)، از آدرس نسبی استفاده می‌کنیم
  if (API_BASE_URL.startsWith('/')) {
    return `/${cleanPath}`;
  }
  
  // در محیط توسعه، از آدرس کامل استفاده می‌کنیم
  // استخراج base URL از API_BASE_URL (مثلاً http://localhost:3000)
  const baseUrl = API_BASE_URL.replace('/api/v1', '');
  return `${baseUrl}/${cleanPath}`;
};

/**
 * آدرس پایه API برای استفاده مستقیم
 */
export default API_BASE_URL;


