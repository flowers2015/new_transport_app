/**
 * Performance Monitoring Utility
 * برای اندازه‌گیری و ثبت عملکرد اپلیکیشن
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface APICallMetric {
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number;
  size?: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private apiCalls: APICallMetric[] = [];
  private pageLoadStart: number = performance.now();
  private isEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      // اندازه‌گیری زمان لود صفحه
      window.addEventListener('load', () => {
        const loadTime = performance.now() - this.pageLoadStart;
        this.recordMetric('page-load', {
          duration: loadTime,
          metadata: {
            domContentLoaded: performance.timing?.domContentLoadedEventEnd - performance.timing?.navigationStart,
            loadComplete: performance.timing?.loadEventEnd - performance.timing?.navigationStart,
          }
        });
        this.logSummary();
      });
    }
  }

  /**
   * شروع اندازه‌گیری یک متریک
   */
  startMetric(name: string, metadata?: Record<string, any>): void {
    if (!this.isEnabled) return;
    
    this.metrics.set(name, {
      name,
      startTime: performance.now(),
      metadata,
    });
  }

  /**
   * پایان اندازه‌گیری یک متریک
   */
  endMetric(name: string): number | null {
    if (!this.isEnabled) return null;
    
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`[PerformanceMonitor] Metric "${name}" not found`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;

    return duration;
  }

  /**
   * ثبت یک متریک کامل
   */
  recordMetric(name: string, data: { duration: number; metadata?: Record<string, any> }): void {
    if (!this.isEnabled) return;
    
    this.metrics.set(name, {
      name,
      startTime: 0,
      endTime: performance.now(),
      duration: data.duration,
      metadata: data.metadata,
    });
  }

  /**
   * ثبت یک API call
   */
  recordAPICall(url: string, method: string, startTime: number): string {
    if (!this.isEnabled) return '';
    
    const callId = `${method}-${url}-${startTime}`;
    this.apiCalls.push({
      url,
      method,
      startTime,
    });
    return callId;
  }

  /**
   * به‌روزرسانی یک API call
   */
  updateAPICall(url: string, method: string, status: number, size?: number): void {
    if (!this.isEnabled) return;
    
    const call = this.apiCalls.find(
      c => c.url === url && c.method === method && !c.endTime
    );
    
    if (call) {
      call.endTime = performance.now();
      call.duration = call.endTime - call.startTime;
      call.status = status;
      call.size = size;
    }
  }

  /**
   * دریافت خلاصه عملکرد
   */
  getSummary(): {
    metrics: PerformanceMetric[];
    apiCalls: APICallMetric[];
    totalAPICalls: number;
    totalAPIDuration: number;
    averageAPIDuration: number;
    pageLoadTime?: number;
  } {
    const completedMetrics = Array.from(this.metrics.values()).filter(m => m.duration !== undefined);
    const completedAPICalls = this.apiCalls.filter(c => c.duration !== undefined);
    const totalAPIDuration = completedAPICalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const averageAPIDuration = completedAPICalls.length > 0 
      ? totalAPIDuration / completedAPICalls.length 
      : 0;

    return {
      metrics: completedMetrics,
      apiCalls: completedAPICalls,
      totalAPICalls: completedAPICalls.length,
      totalAPIDuration,
      averageAPIDuration,
      pageLoadTime: completedMetrics.find(m => m.name === 'page-load')?.duration,
    };
  }

  /**
   * نمایش خلاصه در console
   */
  logSummary(): void {
    if (!this.isEnabled) return;
    
    const summary = this.getSummary();
    
    console.group('📊 [Performance Monitor] Summary');
    console.log('Page Load Time:', summary.pageLoadTime?.toFixed(2), 'ms');
    console.log('Total API Calls:', summary.totalAPICalls);
    console.log('Total API Duration:', summary.totalAPIDuration.toFixed(2), 'ms');
    console.log('Average API Duration:', summary.averageAPIDuration.toFixed(2), 'ms');
    
    if (summary.metrics.length > 0) {
      console.group('Metrics:');
      summary.metrics.forEach(m => {
        console.log(`${m.name}: ${m.duration?.toFixed(2)}ms`, m.metadata || '');
      });
      console.groupEnd();
    }
    
    if (summary.apiCalls.length > 0) {
      console.group('API Calls:');
      summary.apiCalls.forEach(c => {
        console.log(`${c.method} ${c.url}: ${c.duration?.toFixed(2)}ms (${c.status})`);
      });
      console.groupEnd();
    }
    
    console.groupEnd();
  }

  /**
   * فعال/غیرفعال کردن monitor
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * پاک کردن تمام متریک‌ها
   */
  clear(): void {
    this.metrics.clear();
    this.apiCalls = [];
    this.pageLoadStart = performance.now();
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Hook برای اندازه‌گیری عملکرد یک کامپوننت
 */
export function usePerformanceMeasure(componentName: string) {
  useEffect(() => {
    performanceMonitor.startMetric(`${componentName}-mount`);
    
    return () => {
      performanceMonitor.endMetric(`${componentName}-mount`);
    };
  }, [componentName]);
}

/**
 * Wrapper برای fetch که performance را track می‌کند
 */
export async function trackedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const method = options?.method || 'GET';
  const startTime = performance.now();
  const callId = performanceMonitor.recordAPICall(url, method, startTime);
  
  try {
    const response = await fetch(url, options);
    const clonedResponse = response.clone();
    
    // اندازه‌گیری size (تقریبی)
    const text = await clonedResponse.text();
    const size = new Blob([text]).size;
    
    performanceMonitor.updateAPICall(url, method, response.status, size);
    
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    performanceMonitor.updateAPICall(url, method, 0);
    throw error;
  }
}

// Import React for usePerformanceMeasure
import { useEffect } from 'react';

