import React, { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoRefreshOptions {
    /**
     * تابعی که باید برای refresh داده‌ها فراخوانی شود
     */
    refreshFn: () => Promise<void> | void;
    
    /**
     * فاصله زمانی بین هر refresh (به میلی‌ثانیه)
     * پیش‌فرض: 10 ثانیه (10000 میلی‌ثانیه)
     */
    interval?: number;
    
    /**
     * آیا باید فقط وقتی صفحه visible است refresh کند؟
     * پیش‌فرض: true
     */
    onlyWhenVisible?: boolean;
    
    /**
     * آیا باید بلافاصله بعد از mount اجرا شود؟
     * پیش‌فرض: true
     */
    immediate?: boolean;
    
    /**
     * آیا باید فعال باشد؟
     * پیش‌فرض: true
     */
    enabled?: boolean;
    
    /**
     * آیا refresh باید به صورت silent انجام شود (بدون loading state و بدون re-render غیرضروری)؟
     * پیش‌فرض: false
     */
    silent?: boolean;
}

/**
 * Hook برای auto-refresh خودکار داده‌ها
 * 
 * @example
 * ```tsx
 * const { refresh, isRefreshing } = useAutoRefresh({
 *   refreshFn: fetchAnnouncements,
 *   interval: 10000, // هر 10 ثانیه
 *   onlyWhenVisible: true
 * });
 * ```
 */
export const useAutoRefresh = ({
    refreshFn,
    interval = 10000, // 10 ثانیه پیش‌فرض
    onlyWhenVisible = true,
    immediate = true,
    enabled = true,
    silent = false, // پیش‌فرض: false (برای backward compatibility)
}: UseAutoRefreshOptions) => {
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isRefreshingRef = useRef(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // تابع refresh با جلوگیری از اجرای همزمان
    const refresh = useCallback(async () => {
        // اگر در حال refresh است، صبر کن
        if (isRefreshingRef.current) {
            return;
        }
        
        // اگر صفحه visible نیست و onlyWhenVisible فعال است، skip کن
        if (onlyWhenVisible && document.hidden) {
            return;
        }
        
        try {
            isRefreshingRef.current = true;
            setIsRefreshing(true);
            await refreshFn();
        } catch (error) {
            console.error('❌ [useAutoRefresh] Error during refresh:', error);
        } finally {
            isRefreshingRef.current = false;
            setIsRefreshing(false);
        }
    }, [refreshFn, onlyWhenVisible]);
    
    useEffect(() => {
        if (!enabled) {
            // اگر disabled است، interval را پاک کن
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }
        
        // اجرای فوری اگر immediate فعال باشد
        if (immediate) {
            refresh();
        }
        
        // تنظیم interval
        intervalRef.current = setInterval(() => {
            refresh();
        }, interval);
        
        // Cleanup
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [refresh, interval, enabled, immediate]);
    
    // وقتی صفحه visible می‌شود، refresh کن
    useEffect(() => {
        if (!enabled || !onlyWhenVisible) {
            return;
        }
        
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                // وقتی صفحه visible می‌شود، بلافاصله refresh کن
                refresh();
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [refresh, enabled, onlyWhenVisible]);
    
    return {
        refresh,
        isRefreshing,
    };
};

