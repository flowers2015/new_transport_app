/**
 * API Configuration
 *
 * در محیط توسعه: VITE_API_BASE_URL=http://localhost:3000/api/v1
 * در محیط پروداکشن: VITE_API_BASE_URL=/api/v1  (نسبی — همان پروتکل صفحه)
 *
 * توجه: بعضی شبکه‌های داخلی فقط پورت 80 (HTTP) دارند و 443 بسته است.
 * اگر base مطلق https باشد ولی صفحه روی http باز شده، به مسیر نسبی برمی‌گردیم.
 */

const envUrl = import.meta.env.VITE_API_BASE_URL;
let API_BASE_URL = envUrl || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:3000/api/v1');

/** اگر روی HTTP هستیم، base مطلق https همان هاست را به مسیر نسبی تبدیل کن */
function preferSameOriginHttp(base: string): string {
  if (typeof window === 'undefined') return base;
  if (window.location.protocol !== 'http:') return base;
  const trimmed = (base || '').trim();
  if (!trimmed.startsWith('https://')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname === window.location.hostname) {
      const path = (u.pathname || '/').replace(/\/$/, '') || '';
      return path || '/api/v1';
    }
  } catch {
    /* ignore */
  }
  return trimmed;
}

API_BASE_URL = preferSameOriginHttp(API_BASE_URL);

console.log('🔧 [API Config] Mode:', import.meta.env.MODE);
console.log('🔧 [API Config] VITE_API_BASE_URL from env:', envUrl || '(not set)');
console.log('🔧 [API Config] Final API_BASE_URL:', API_BASE_URL);
console.log('🔧 [API Config] Page protocol:', typeof window !== 'undefined' ? window.location.protocol : 'ssr');

/**
 * تابع کمکی برای ساخت URL کامل API
 * @param endpoint - مسیر endpoint (مثلاً '/freight-announcements' یا 'freight-announcements')
 * @returns URL کامل برای درخواست API
 */
export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const baseUrl = preferSameOriginHttp(
    API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  );

  // اگر هنوز مطلق https برای همین هاست بود، فقط path را برگردان
  if (baseUrl.startsWith('https://') && typeof window !== 'undefined' && window.location.protocol === 'http:') {
    try {
      const u = new URL(baseUrl);
      if (u.hostname === window.location.hostname) {
        const path = u.pathname.replace(/\/$/, '');
        return `${path}/${cleanEndpoint}`;
      }
    } catch {
      /* fall through */
    }
  }

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

export const getAuthHeaders = (extra: HeadersInit = {}, body?: BodyInit | null): HeadersInit => {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (!isFormData) {
    return { 'Content-Type': 'application/json', ...headers };
  }
  return headers;
};

export const isAuthFailureStatus = (status: number): boolean =>
  status === 401 || status === 403;

/**
 * تابع کمکی برای بررسی و مدیریت خطای توکن منقضی شده
 */
export const handleAuthError = (
  response: Response,
  { redirect = true }: { redirect?: boolean } = {}
): Response => {
  if (!isAuthFailureStatus(response.status)) {
    return response;
  }
  console.warn('⚠️ [Auth] Token expired or invalid.', response.status);
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (redirect) {
    alert('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
    window.location.href = '/';
  }
  return response;
};

/**
 * تابع fetch با مدیریت خودکار خطای توکن — همیشه توکن را تازه از localStorage می‌خواند
 */
export const apiFetch = async (
  url: string,
  options?: RequestInit & { skipAuthRedirect?: boolean }
): Promise<Response> => {
  const { skipAuthRedirect, headers: optionHeaders, body, ...rest } = options || {};
  const response = await fetch(url, {
    ...rest,
    body,
    headers: getAuthHeaders(optionHeaders as HeadersInit, body),
  });
  return handleAuthError(response, { redirect: !skipAuthRedirect });
};

