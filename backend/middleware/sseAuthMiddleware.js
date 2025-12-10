/**
 * Middleware برای Authentication در SSE
 * چون EventSource نمی‌تواند header ارسال کند، از query parameter استفاده می‌کنیم
 */

const jwt = require('jsonwebtoken');

function authenticateSSE(req, res, next) {
  // اول از query parameter تلاش می‌کنیم (برای EventSource)
  let token = req.query.token;
  
  // اگر در query parameter نبود، از header تلاش می‌کنیم (برای WebSocket یا سایر موارد)
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }
  
  // اگر در cookie هم نبود، از cookie تلاش می‌کنیم
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token == null) {
    return res.status(401).json({ message: 'Unauthorized: Token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('❌ [authenticateSSE] Token verification failed:', err.message);
      return res.status(403).json({ message: 'Forbidden: Invalid token' });
    }
    req.user = user;
    next();
  });
}

module.exports = { authenticateSSE };

