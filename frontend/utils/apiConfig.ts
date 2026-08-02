/**
 * API Configuration
 *
 * در محیط توسعه: VITE_API_BASE_URL=http://localhost:3000/api/v1
 * در محیط پروداکشن: VITE_API_BASE_URL=/api/v1  (نسبی — همان هاست صفحه)
 *
 * اگر بیلد اشتباه localhost را داخل bundle بگذارد، روی دامنه واقعی
 * به‌صورت runtime به /api/v1 برمی‌گردیم تا CORS/Failed to fetch پیش نیاید.
 */

const envUrl = import.meta.env.VITE_API_BASE_URL;

function isBrowserLocalHost(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function resolveApiBaseUrl(raw: string | undefined): string {
  const fallbackDev = 'http://localhost:3000/api/v1';
  const fallbackProd = '/api/v1';
  let base = (raw || '').trim() || (import.meta.env.PROD ? fallbackProd : fallbackDev);

  // بیلد اشتباه: localhost داخل bundle روی دامنه واقعی
  if (
    typeof window !== 'undefined' &&
    !isBrowserLocalHost() &&
    (base.includes('localhost') || base.includes('127.0.0.1'))
  ) {
    base = fallbackProd;
  }

  // صفحه روی HTTP ولی base مطلق HTTPS همان هاست → مسیر نسبی
  if (typeof window !== 'undefined' && window.location.protocol === 'http:' && base.startsWith('https://')) {
    try {
      const u = new URL(base);
      if (u.hostname === window.location.hostname) {
        const path = (u.pathname || '/').replace(/\/$/, '') || '';
        base = path || fallbackProd;
      }
    } catch {
      /* ignore */
    }
  }

  return base;
}

let API_BASE_URL = resolveApiBaseUrl(envUrl);

/** اگر روی HTTP هستیم، base مطلق https همان هاست را به مسیر نسبی تبدیل کن */
function preferSameOriginHttp(base: string): string {
  return resolveApiBaseUrl(base);
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

export const getAuthHeaders = (
  extra: Record<string, string> = {},
  body?: BodyInit | null
): Record<string, string> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return headers;
  }
  return { 'Content-Type': 'application/json', ...headers };
};

export const isAuthFailureStatus = (status: number) => status === 401 || status === 403;

export const handleAuthError = (
  res: Response,
  { redirect = true }: { redirect?: boolean } = {}
): Response => {
  if (!isAuthFailureStatus(res.status)) return res;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (redirect) {
    alert('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
    window.location.href = '/';
  }
  return res;
};

type ApiFetchOptions = RequestInit & { skipAuthRedirect?: boolean };

export const apiFetch = async (url: string, options?: ApiFetchOptions): Promise<Response> => {
  const { skipAuthRedirect, headers, body, ...rest } = options || {};
  const res = await fetch(url, {
    ...rest,
    body,
    headers: getAuthHeaders((headers as Record<string, string>) || {}, body),
  });
  return handleAuthError(res, { redirect: !skipAuthRedirect });
};

export default API_BASE_URL;
