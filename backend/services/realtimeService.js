/**
 * Real-Time Service برای WebSocket و SSE
 * مدیریت اتصالات real-time و broadcast تغییرات
 */

const EventEmitter = require('events');

class RealtimeService extends EventEmitter {
  constructor() {
    super();
    this.sseClients = new Map(); // Map<userId, Set<Response>>
    this.wsClients = new Map(); // Map<userId, Set<WebSocket>>
    this.announcementSubscriptions = new Map(); // Map<announcementId, Set<userId>>
  }

  /**
   * اضافه کردن SSE client
   */
  addSSEClient(userId, res) {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }
    this.sseClients.get(userId).add(res);

    // ارسال پیام welcome
    this.sendSSE(userId, {
      type: 'connected',
      message: 'Connected to real-time updates'
    });

    // Cleanup وقتی connection بسته می‌شود
    res.on('close', () => {
      this.removeSSEClient(userId, res);
    });

    console.log(`✅ [RealtimeService] SSE client added for user ${userId}`);
  }

  /**
   * حذف SSE client
   */
  removeSSEClient(userId, res) {
    if (this.sseClients.has(userId)) {
      this.sseClients.get(userId).delete(res);
      if (this.sseClients.get(userId).size === 0) {
        this.sseClients.delete(userId);
      }
    }
    console.log(`❌ [RealtimeService] SSE client removed for user ${userId}`);
  }

  /**
   * ارسال پیام SSE به یک کاربر
   */
  sendSSE(userId, data) {
    if (this.sseClients.has(userId)) {
      const clients = this.sseClients.get(userId);
      const message = `data: ${JSON.stringify(data)}\n\n`;
      
      clients.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          console.error(`❌ [RealtimeService] Error sending SSE to user ${userId}:`, error);
          this.removeSSEClient(userId, res);
        }
      });
    }
  }

  /**
   * Broadcast پیام SSE به همه کاربران
   */
  broadcastSSE(data, excludeUserId = null) {
    this.sseClients.forEach((clients, userId) => {
      if (userId !== excludeUserId) {
        this.sendSSE(userId, data);
      }
    });
  }

  /**
   * اضافه کردن WebSocket client
   */
  addWSClient(userId, ws) {
    if (!this.wsClients.has(userId)) {
      this.wsClients.set(userId, new Set());
    }
    this.wsClients.get(userId).add(ws);

    // ارسال پیام welcome
    this.sendWS(userId, {
      type: 'connected',
      message: 'Connected to real-time updates'
    });

    // Cleanup وقتی connection بسته می‌شود
    ws.on('close', () => {
      this.removeWSClient(userId, ws);
    });

    ws.on('error', (error) => {
      console.error(`❌ [RealtimeService] WebSocket error for user ${userId}:`, error);
      this.removeWSClient(userId, ws);
    });

    console.log(`✅ [RealtimeService] WebSocket client added for user ${userId}`);
  }

  /**
   * حذف WebSocket client
   */
  removeWSClient(userId, ws) {
    if (this.wsClients.has(userId)) {
      this.wsClients.get(userId).delete(ws);
      if (this.wsClients.get(userId).size === 0) {
        this.wsClients.delete(userId);
      }
    }
    console.log(`❌ [RealtimeService] WebSocket client removed for user ${userId}`);
  }

  /**
   * ارسال پیام WebSocket به یک کاربر
   */
  sendWS(userId, data) {
    if (this.wsClients.has(userId)) {
      const clients = this.wsClients.get(userId);
      const message = JSON.stringify(data);
      
      clients.forEach(ws => {
        try {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(message);
          } else {
            this.removeWSClient(userId, ws);
          }
        } catch (error) {
          console.error(`❌ [RealtimeService] Error sending WS to user ${userId}:`, error);
          this.removeWSClient(userId, ws);
        }
      });
    }
  }

  /**
   * Broadcast پیام WebSocket به همه کاربران
   */
  broadcastWS(data, excludeUserId = null) {
    this.wsClients.forEach((clients, userId) => {
      if (userId !== excludeUserId) {
        this.sendWS(userId, data);
      }
    });
  }

  /**
   * ارسال notification برای تغییرات اعلام بار
   */
  notifyAnnouncementUpdate(announcementId, updateType, data, userId = null) {
    const message = {
      type: 'announcement_update',
      announcementId,
      updateType, // 'created', 'updated', 'approved', 'assigned', 'finalized', etc.
      data,
      timestamp: new Date().toISOString()
    };

    // Broadcast به همه کاربران (یا فقط کاربران خاص)
    this.broadcastSSE(message, userId);
    this.broadcastWS(message, userId);

    console.log(`📢 [RealtimeService] Broadcasted announcement update: ${updateType} for ${announcementId}`);
  }

  /**
   * ارسال notification برای تغییرات عمومی
   */
  notifyGeneralUpdate(updateType, data, userId = null) {
    const message = {
      type: 'general_update',
      updateType,
      data,
      timestamp: new Date().toISOString()
    };

    this.broadcastSSE(message, userId);
    this.broadcastWS(message, userId);
  }

  /**
   * دریافت آمار اتصالات
   */
  getStats() {
    return {
      sseClients: this.sseClients.size,
      wsClients: this.wsClients.size,
      totalSSEConnections: Array.from(this.sseClients.values()).reduce((sum, set) => sum + set.size, 0),
      totalWSConnections: Array.from(this.wsClients.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }
}

// Singleton instance
const realtimeService = new RealtimeService();

module.exports = realtimeService;

