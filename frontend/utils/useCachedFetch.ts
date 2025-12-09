/**
 * React Hook برای استفاده از cached fetch
 */

import { useState, useEffect, useCallback } from 'react';
import { apiCache, cachedFetch } from './apiCache';

interface UseCachedFetchOptions {
  ttl?: number; // Time to live در میلی‌ثانیه
  enabled?: boolean; // آیا fetch انجام شود یا نه
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

export function useCachedFetch<T>(
  url: string | null,
  options?: RequestInit & UseCachedFetchOptions
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  invalidate: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const {
    ttl,
    enabled = true,
    onSuccess,
    onError,
    ...fetchOptions
  } = options || {};

  const fetchData = useCallback(async () => {
    if (!url || !enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await cachedFetch<T>(url, fetchOptions, ttl);
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [url, enabled, ttl, JSON.stringify(fetchOptions), onSuccess, onError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    if (url) {
      // Invalidate cache قبل از refetch
      const cacheKey = `${fetchOptions?.method || 'GET'}:${url}`;
      apiCache.invalidate(cacheKey);
      await fetchData();
    }
  }, [url, fetchData, fetchOptions?.method]);

  const invalidate = useCallback(() => {
    if (url) {
      const cacheKey = `${fetchOptions?.method || 'GET'}:${url}`;
      apiCache.invalidate(cacheKey);
    }
  }, [url, fetchOptions?.method]);

  return {
    data,
    loading,
    error,
    refetch,
    invalidate,
  };
}

