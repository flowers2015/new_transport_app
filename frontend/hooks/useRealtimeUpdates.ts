/**
 * Hook برای اتصال به Real-Time Updates (SSE و WebSocket)
 * برای دریافت تغییرات لحظه‌ای اعلام‌بارها
 */

import { useEffect, useRef, useCallback } from 'react';
import { getApiUrl } from '../utils/apiConfig';

export interface RealtimeMessage {
  type: 'announcement_update' | 'general_update' | 'connected';
  announcementId?: string;
  updateType?: string;
  data?: any;
  timestamp?: string;
  message?: string;
}

export interface UseRealtimeUpdatesOptions {
  /**
   * Callback برای دریافت پیام‌های real-time
   */
  onMessage?: (message: RealtimeMessage) => void;
  
  /**
   * Callback برای اتصال موفق
   */
  onConnect?: () => void;
  
  /**
   * Callback برای قطع اتصال
   */
  onDisconnect?: () => void;
  
  /**
   * Callback برای خطا
   */
  onError?: (error: Error) => void;
  
  /**
   * آیا باید فعال باشد؟
   * پیش‌فرض: true
   */
  enabled?: boolean;
  
  /**
   * استفاده از WebSocket به جای SSE؟
   * پیش‌فرض: false (استفاده از SSE)
   */
  useWebSocket?: boolean;
}

/**
 * Hook برای اتصال به Real-Time Updates
 * 
 * @example
 * ```tsx
 * useRealtimeUpdates({
 *   onMessage: (message) => {
 *     if (message.type === 'announcement_update') {
 *       // به‌روزرسانی اعلام بار
 *       refreshAnnouncements();
 *     }
 *   }
 * });
 * ```
 */
export const useRealtimeUpdates = ({
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  enabled = true,
  useWebSocket = false
}: UseRealtimeUpdatesOptions = {}) => {
  const eventSourceRef = useRef<EventSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  const connectSSE = useCallback(() => {
    if (!enabled) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      // بستن connection قبلی اگر وجود دارد
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // EventSource نمی‌تواند header ارسال کند، پس token را در query parameter می‌فرستیم
      const url = `${getApiUrl('realtime/sse')}?token=${encodeURIComponent(token)}`;
      const eventSource = new EventSource(url, {
        withCredentials: true
      });

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          // Silent error handling
        }
      };

      eventSource.onerror = (error) => {
        console.error('❌ [useRealtimeUpdates] SSE error:', error);
        
        // اگر connection بسته شد، reconnect کن
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSourceRef.current = null;
          onDisconnect?.();
          
          // Reconnect با exponential backoff
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
            console.log(`🔄 [useRealtimeUpdates] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectSSE();
            }, delay);
          } else {
            console.error('❌ [useRealtimeUpdates] Max reconnect attempts reached');
            onError?.(new Error('Max reconnect attempts reached'));
          }
        } else {
          onError?.(new Error('SSE connection error'));
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('❌ [useRealtimeUpdates] Error creating SSE connection:', error);
      onError?.(error as Error);
    }
  }, [enabled, onMessage, onConnect, onDisconnect, onError]);

  const connectWebSocket = useCallback(() => {
    if (!enabled) return;

    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('⚠️ [useRealtimeUpdates] No token found, skipping WebSocket connection');
      return;
    }

    try {
      // بستن connection قبلی اگر وجود دارد
      if (wsRef.current) {
        wsRef.current.close();
      }

      // ساخت WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/realtime/ws?token=${token}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ [useRealtimeUpdates] WebSocket connected');
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          console.log('📨 [useRealtimeUpdates] Received message:', message);
          onMessage?.(message);
        } catch (error) {
          console.error('❌ [useRealtimeUpdates] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ [useRealtimeUpdates] WebSocket error:', error);
        onError?.(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        console.log('❌ [useRealtimeUpdates] WebSocket closed');
        wsRef.current = null;
        onDisconnect?.();
        
        // Reconnect با exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
          console.log(`🔄 [useRealtimeUpdates] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else {
          console.error('❌ [useRealtimeUpdates] Max reconnect attempts reached');
          onError?.(new Error('Max reconnect attempts reached'));
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ [useRealtimeUpdates] Error creating WebSocket connection:', error);
      onError?.(error as Error);
    }
  }, [enabled, onMessage, onConnect, onDisconnect, onError]);

  useEffect(() => {
    if (!enabled) {
      // بستن connections اگر disabled است
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    // اتصال به SSE یا WebSocket
    if (useWebSocket) {
      connectWebSocket();
    } else {
      connectSSE();
    }

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled, useWebSocket, connectSSE, connectWebSocket]);

  // Reconnect وقتی صفحه visible می‌شود
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // اگر connection بسته شده، reconnect کن
        if (useWebSocket) {
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            connectWebSocket();
          }
        } else {
          if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
            connectSSE();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, useWebSocket, connectSSE, connectWebSocket]);
};

