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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  });

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((connectFn: () => void) => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      onErrorRef.current?.(new Error('Max reconnect attempts reached'));
      return;
    }
    reconnectAttemptsRef.current += 1;
    const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
    reconnectTimeoutRef.current = setTimeout(() => {
      connectFn();
    }, delay);
  }, []);

  const connectSSE = useCallback(() => {
    if (!enabled) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const url = `${getApiUrl('realtime/sse')}?token=${encodeURIComponent(token)}`;
      const eventSource = new EventSource(url, {
        withCredentials: true
      });

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
        onConnectRef.current?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch {
          // ignore heartbeat / malformed payloads
        }
      };

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          if (eventSourceRef.current === eventSource) {
            eventSourceRef.current = null;
          }
          onDisconnectRef.current?.();
          scheduleReconnect(connectSSE);
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      onErrorRef.current?.(error as Error);
    }
  }, [enabled, scheduleReconnect]);

  const connectWebSocket = useCallback(() => {
    if (!enabled) return;

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/realtime/ws?token=${token}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onerror = () => {
        onErrorRef.current?.(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        onDisconnectRef.current?.();
        scheduleReconnect(connectWebSocket);
      };

      wsRef.current = ws;
    } catch (error) {
      onErrorRef.current?.(error as Error);
    }
  }, [enabled, scheduleReconnect]);

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      clearReconnectTimeout();
      return;
    }

    if (useWebSocket) {
      connectWebSocket();
    } else {
      connectSSE();
    }

    return () => {
      clearReconnectTimeout();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, useWebSocket, connectSSE, connectWebSocket, clearReconnectTimeout]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (useWebSocket) {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          reconnectAttemptsRef.current = 0;
          connectWebSocket();
        }
      } else if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
        reconnectAttemptsRef.current = 0;
        connectSSE();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, useWebSocket, connectSSE, connectWebSocket]);
};
