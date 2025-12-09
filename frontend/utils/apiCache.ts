/**
 * Simple API Cache and Request Deduplication
 * برای کاهش API calls و بهبود عملکرد
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  expiresAt: number;
}

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class APICache {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 دقیقه پیش‌فرض

  /**
   * دریافت داده از cache یا API
   * اگر request در حال انجام است، همان promise را برمی‌گرداند (deduplication)
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cacheKey = key;
    const cacheTTL = ttl || this.defaultTTL;

    // بررسی cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`✅ [APICache] Cache hit: ${cacheKey}`);
      return cached.data as T;
    }

    // بررسی pending request (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      console.log(`🔄 [APICache] Deduplicating request: ${cacheKey}`);
      return pending.promise as Promise<T>;
    }

    // ایجاد request جدید
    console.log(`📡 [APICache] Fetching: ${cacheKey}`);
    const promise = fetcher()
      .then((data) => {
        // ذخیره در cache
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + cacheTTL,
        });

        // حذف از pending requests
        this.pendingRequests.delete(cacheKey);

        return data;
      })
      .catch((error) => {
        // حذف از pending requests در صورت خطا
        this.pendingRequests.delete(cacheKey);
        throw error;
      });

    // اضافه کردن به pending requests
    this.pendingRequests.set(cacheKey, {
      promise,
      timestamp: Date.now(),
    });

    return promise;
  }

  /**
   * حذف یک entry از cache
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`🗑️ [APICache] Invalidated: ${key}`);
  }

  /**
   * حذف همه cache
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log(`🗑️ [APICache] Cache cleared`);
  }

  /**
   * حذف cache های منقضی شده
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    // حذف pending requests قدیمی (بیش از 30 ثانیه)
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > 30 * 1000) {
        this.pendingRequests.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [APICache] Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * دریافت آمار cache
   */
  getStats(): {
    cacheSize: number;
    pendingRequests: number;
    hitRate?: number;
  } {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }
}

// Singleton instance
export const apiCache = new APICache();

// Cleanup هر 5 دقیقه
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.cleanup();
  }, 5 * 60 * 1000);
}

/**
 * Helper function برای fetch با cache و stale-while-revalidate
 * اگر cache موجود باشد (حتی اگر منقضی شده باشد)، آن را فوراً برمی‌گرداند
 * و در background داده جدید را fetch می‌کند
 */
export async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  ttl?: number,
  silent?: boolean // اگر true باشد، فقط cache را برمی‌گرداند و fetch نمی‌کند
): Promise<T> {
  const cacheKey = `${options?.method || 'GET'}:${url}`;
  const cacheTTL = ttl || 5 * 60 * 1000;
  
  // دسترسی به cache داخلی
  const cache = (apiCache as any).cache as Map<string, CacheEntry>;
  
  // بررسی cache (حتی اگر منقضی شده باشد)
  const cached = cache.get(cacheKey);
  if (cached) {
    // اگر cache هنوز fresh است
    if (Date.now() < cached.expiresAt) {
      if (!silent) {
        console.log(`✅ [cachedFetch] Fresh cache: ${cacheKey}`);
      }
      return cached.data as T;
    }
    
    // اگر cache stale است اما silent mode نیست، stale-while-revalidate
    if (!silent) {
      console.log(`🔄 [cachedFetch] Stale cache, revalidating: ${cacheKey}`);
      // فوراً cache را برمی‌گردانیم
      const staleData = cached.data as T;
      
      // در background داده جدید را fetch می‌کنیم (بدون await)
      apiCache.get(
        cacheKey,
        async () => {
          const response = await fetch(url, options);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json() as Promise<T>;
        },
        cacheTTL
      ).catch(err => {
        console.warn(`⚠️ [cachedFetch] Background revalidation failed: ${cacheKey}`, err);
      });
      
      return staleData;
    } else {
      // در silent mode، فقط cache را برمی‌گردانیم
      return cached.data as T;
    }
  }
  
  // اگر cache وجود ندارد و silent mode نیست، fetch می‌کنیم
  if (silent) {
    throw new Error('No cache available in silent mode');
  }
  
  return apiCache.get(
    cacheKey,
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    cacheTTL
  );
}

