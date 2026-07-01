/**
 * Routes برای Real-Time Updates (SSE و WebSocket)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { authenticateSSE } = require('../middleware/sseAuthMiddleware');
const realtimeService = require('../services/realtimeService');

/**
 * SSE Endpoint برای real-time updates
 * GET /api/v1/realtime/sse?token=xxx
 * 
 * نکته: EventSource نمی‌تواند header ارسال کند، پس از query parameter استفاده می‌کنیم
 */
router.get('/sse', authenticateSSE, (req, res) => {
  const userId = req.user.userId || req.user.id;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // تنظیمات SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // برای NGINX

  // شروع stream قبل از addSSEClient تا nginx/proxy بلافاصله connection را نگه دارد
  res.write(': connected\n\n');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // اضافه کردن client به service
  realtimeService.addSSEClient(userId, res);

  // ارسال heartbeat هر 25 ثانیه (کمتر از proxy_read_timeout پیش‌فرض nginx)
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeatInterval);
      realtimeService.removeSSEClient(userId, res);
    }
  }, 25000);

  // Cleanup وقتی connection بسته می‌شود (حذف client در realtimeService.addSSEClient انجام می‌شود)
  res.on('close', () => {
    clearInterval(heartbeatInterval);
  });
});

/**
 * WebSocket endpoint (نیاز به WebSocket server دارد)
 * این endpoint فقط برای اطلاعات است
 * WebSocket server در server.js راه‌اندازی می‌شود
 */
router.get('/ws/info', authenticateToken, (req, res) => {
  const stats = realtimeService.getStats();
  res.json({
    message: 'WebSocket server is running',
    stats,
    wsUrl: '/api/v1/realtime/ws'
  });
});

module.exports = router;

